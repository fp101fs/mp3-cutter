/**
 * Silence Detection Utility
 * Uses Silero VAD (Voice Activity Detection) via @ricky0123/vad-web for ML-based speech detection.
 * Silence is inferred from gaps between detected speech segments.
 */

import { NonRealTimeVAD } from '@ricky0123/vad-web';

export interface SilenceRegion {
  id: string;
  start: number;  // seconds
  end: number;    // seconds
}

export interface SilenceDetectionResult {
  silences: SilenceRegion[];
  leadingSilence: SilenceRegion | null;
  trailingSilence: SilenceRegion | null;
}

// Threshold presets (kept for API compatibility, but not used by VAD)
export const SILENCE_THRESHOLDS = {
  quiet: -50,
  default: -40,
  moderate: -30,
} as const;

export type SilenceThresholdPreset = keyof typeof SILENCE_THRESHOLDS;

// Minimum silence duration in seconds to report
const MIN_SILENCE_DURATION = 0.3;

/**
 * Resample an AudioBuffer to 16kHz mono Float32Array (required by Silero VAD)
 */
async function resampleTo16kHz(audioBuffer: AudioBuffer): Promise<Float32Array> {
  const targetSampleRate = 16000;
  const numChannels = audioBuffer.numberOfChannels;
  const duration = audioBuffer.duration;

  // Create offline context for resampling
  const offlineCtx = new OfflineAudioContext(
    1, // mono output
    Math.ceil(duration * targetSampleRate),
    targetSampleRate
  );

  // Create buffer source
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);

  // Render
  const renderedBuffer = await offlineCtx.startRendering();
  return renderedBuffer.getChannelData(0);
}

/**
 * Convert speech segments to silence segments (gaps between speech)
 */
function speechToSilence(
  speechSegments: Array<{ start: number; end: number }>,
  duration: number,
  minSilenceDuration: number = MIN_SILENCE_DURATION
): SilenceRegion[] {
  const silences: SilenceRegion[] = [];
  let regionCounter = 0;

  // Sort speech segments by start time
  const sorted = [...speechSegments].sort((a, b) => a.start - b.start);

  // Check for leading silence (before first speech)
  if (sorted.length === 0) {
    // Entire audio is silence
    if (duration >= minSilenceDuration) {
      silences.push({
        id: `silence-${regionCounter++}`,
        start: 0,
        end: duration,
      });
    }
    return silences;
  }

  // Leading silence
  if (sorted[0].start >= minSilenceDuration) {
    silences.push({
      id: `silence-${regionCounter++}`,
      start: 0,
      end: sorted[0].start,
    });
  }

  // Gaps between speech segments
  for (let i = 0; i < sorted.length - 1; i++) {
    const gapStart = sorted[i].end;
    const gapEnd = sorted[i + 1].start;
    const gapDuration = gapEnd - gapStart;

    if (gapDuration >= minSilenceDuration) {
      silences.push({
        id: `silence-${regionCounter++}`,
        start: gapStart,
        end: gapEnd,
      });
    }
  }

  // Trailing silence (after last speech)
  const lastSpeechEnd = sorted[sorted.length - 1].end;
  if (duration - lastSpeechEnd >= minSilenceDuration) {
    silences.push({
      id: `silence-${regionCounter++}`,
      start: lastSpeechEnd,
      end: duration,
    });
  }

  return silences;
}

/**
 * Detect silent regions in an AudioBuffer using Silero VAD.
 * VAD detects speech segments, and we invert to find silence.
 *
 * @param audioBuffer - The decoded audio buffer to analyze
 * @returns Object containing array of silence regions and leading/trailing silence info
 */
export async function detectSilence(
  audioBuffer: AudioBuffer
): Promise<SilenceDetectionResult> {
  // Resample to 16kHz mono (VAD requirement)
  const samples = await resampleTo16kHz(audioBuffer);

  // Initialize VAD with CDN paths for ONNX WASM files
  const vad = await NonRealTimeVAD.new({
    ortConfig: (ort) => {
      ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/';
    },
  });

  // Run detection - collects speech segments
  const speechSegments: Array<{ start: number; end: number }> = [];

  for await (const segment of vad.run(samples, 16000)) {
    speechSegments.push({
      start: segment.start / 16000, // Convert samples to seconds
      end: segment.end / 16000,
    });
  }

  // Convert speech segments to silence segments
  const silences = speechToSilence(speechSegments, audioBuffer.duration);

  // Identify leading and trailing silence
  const leadingSilence =
    silences.length > 0 && silences[0].start < 0.01 ? silences[0] : null;

  const trailingSilence =
    silences.length > 0 &&
    Math.abs(silences[silences.length - 1].end - audioBuffer.duration) < 0.01
      ? silences[silences.length - 1]
      : null;

  return {
    silences,
    leadingSilence,
    trailingSilence,
  };
}

/**
 * Calculate the total duration of all silence regions.
 */
export function getTotalSilenceDuration(silences: SilenceRegion[]): number {
  return silences.reduce((total, region) => total + (region.end - region.start), 0);
}

/**
 * Get optimal trim points that exclude leading and trailing silence.
 */
export function getOptimalTrimPoints(
  result: SilenceDetectionResult,
  audioDuration: number
): { start: number; end: number } {
  let start = 0;
  let end = audioDuration;

  if (result.leadingSilence) {
    start = result.leadingSilence.end;
  }

  if (result.trailingSilence) {
    end = result.trailingSilence.start;
  }

  // Ensure we have a valid range
  if (start >= end) {
    // Audio is entirely silent or would result in empty selection
    // Return a small portion from the middle
    const middle = audioDuration / 2;
    const minLength = Math.min(0.5, audioDuration * 0.1);
    start = Math.max(0, middle - minLength / 2);
    end = Math.min(audioDuration, middle + minLength / 2);
  }

  return { start, end };
}
