/**
 * Silence Detection Utility
 * Uses RMS (Root Mean Square) energy analysis in a Web Worker to prevent UI freezing.
 */

export interface SilenceRegion {
  id: string;
  start: number;  // seconds
  end: number;    // seconds
}

export interface SilenceDetectionOptions {
  thresholdDb?: number;      // default: -40
  minDurationMs?: number;    // default: 300
  windowSizeMs?: number;     // default: 50
}

export interface SilenceDetectionResult {
  silences: SilenceRegion[];
  leadingSilence: SilenceRegion | null;
  trailingSilence: SilenceRegion | null;
}

// Threshold presets
export const SILENCE_THRESHOLDS = {
  quiet: -50,    // Very sensitive - detects quieter sounds as silence
  default: -40,  // Standard threshold for most audio
  moderate: -30, // Less sensitive - only detects very quiet sections
} as const;

export type SilenceThresholdPreset = keyof typeof SILENCE_THRESHOLDS;

/**
 * Mix audio buffer to mono Float32Array for analysis.
 */
function mixToMono(audioBuffer: AudioBuffer): Float32Array {
  const numChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const monoData = new Float32Array(length);

  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let ch = 0; ch < numChannels; ch++) {
      sum += audioBuffer.getChannelData(ch)[i];
    }
    monoData[i] = sum / numChannels;
  }

  return monoData;
}

/**
 * Detect silent regions in an AudioBuffer using RMS energy analysis.
 * Runs in a Web Worker to prevent UI freezing.
 *
 * @param audioBuffer - The decoded audio buffer to analyze
 * @param options - Detection options (threshold, min duration, window size)
 * @returns Promise resolving to silence regions and leading/trailing silence info
 */
export function detectSilence(
  audioBuffer: AudioBuffer,
  options: SilenceDetectionOptions = {}
): Promise<SilenceDetectionResult> {
  return new Promise((resolve, reject) => {
    // Create worker
    const worker = new Worker('/workers/silenceDetector.worker.js');

    // Mix to mono for analysis
    const monoData = mixToMono(audioBuffer);

    // Handle worker response
    worker.onmessage = (e) => {
      worker.terminate();
      resolve({
        silences: e.data.silences,
        leadingSilence: e.data.leadingSilence,
        trailingSilence: e.data.trailingSilence,
      });
    };

    worker.onerror = (error) => {
      worker.terminate();
      reject(new Error(`Worker error: ${error.message}`));
    };

    // Send audio data to worker (transferable for performance)
    worker.postMessage(
      {
        audioData: monoData,
        sampleRate: audioBuffer.sampleRate,
        options: {
          thresholdDb: options.thresholdDb ?? SILENCE_THRESHOLDS.default,
          minDurationMs: options.minDurationMs ?? 300,
          windowSizeMs: options.windowSizeMs ?? 50,
        },
      },
      [monoData.buffer] // Transfer the buffer for zero-copy
    );
  });
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
