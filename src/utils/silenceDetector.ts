/**
 * Silence Detection Utility
 * Uses RMS (Root Mean Square) energy analysis to detect silent regions in audio.
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
 * Detect silent regions in an AudioBuffer using RMS energy analysis.
 *
 * @param audioBuffer - The decoded audio buffer to analyze
 * @param options - Detection options (threshold, min duration, window size)
 * @returns Object containing array of silence regions and leading/trailing silence info
 */
export function detectSilence(
  audioBuffer: AudioBuffer,
  options: SilenceDetectionOptions = {}
): SilenceDetectionResult {
  const {
    thresholdDb = SILENCE_THRESHOLDS.default,
    minDurationMs = 300,
    windowSizeMs = 50,
  } = options;

  const sampleRate = audioBuffer.sampleRate;
  const windowSize = Math.floor((windowSizeMs / 1000) * sampleRate);
  const minSilenceSamples = Math.floor((minDurationMs / 1000) * sampleRate);

  // Convert dB threshold to linear amplitude
  // dB = 20 * log10(amplitude), so amplitude = 10^(dB/20)
  const threshold = Math.pow(10, thresholdDb / 20);

  // Mix down to mono for analysis (average all channels)
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

  // Analyze audio in windows and mark silent regions
  const numWindows = Math.ceil(length / windowSize);
  const isSilent: boolean[] = new Array(numWindows);

  for (let w = 0; w < numWindows; w++) {
    const startSample = w * windowSize;
    const endSample = Math.min(startSample + windowSize, length);
    const windowLength = endSample - startSample;

    // Calculate RMS for this window
    let sumSquares = 0;
    for (let i = startSample; i < endSample; i++) {
      sumSquares += monoData[i] * monoData[i];
    }
    const rms = Math.sqrt(sumSquares / windowLength);

    // Mark as silent if RMS is below threshold
    isSilent[w] = rms < threshold;
  }

  // Convert silent windows to time regions
  const silences: SilenceRegion[] = [];
  let silenceStartWindow: number | null = null;
  let regionCounter = 0;

  for (let w = 0; w <= numWindows; w++) {
    const isCurrentSilent = w < numWindows ? isSilent[w] : false;

    if (isCurrentSilent && silenceStartWindow === null) {
      // Start of a silence region
      silenceStartWindow = w;
    } else if (!isCurrentSilent && silenceStartWindow !== null) {
      // End of a silence region
      const startTime = (silenceStartWindow * windowSize) / sampleRate;
      const endTime = Math.min((w * windowSize) / sampleRate, audioBuffer.duration);
      const durationMs = (endTime - startTime) * 1000;

      // Only include if duration meets minimum threshold
      if (durationMs >= minDurationMs) {
        silences.push({
          id: `silence-${regionCounter++}`,
          start: startTime,
          end: endTime,
        });
      }

      silenceStartWindow = null;
    }
  }

  // Identify leading and trailing silence
  const leadingSilence = silences.length > 0 && silences[0].start < 0.01
    ? silences[0]
    : null;

  const trailingSilence = silences.length > 0 &&
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
