/**
 * Silence Detection Web Worker
 * Runs RMS (Root Mean Square) analysis off the main thread to prevent UI freezing.
 */

// Listen for messages from main thread
self.onmessage = function(e) {
  const { audioData, sampleRate, options } = e.data;

  const {
    thresholdDb = -40,
    minDurationMs = 300,
    windowSizeMs = 50,
  } = options || {};

  const windowSize = Math.floor((windowSizeMs / 1000) * sampleRate);
  const minSilenceSamples = Math.floor((minDurationMs / 1000) * sampleRate);

  // Convert dB threshold to linear amplitude
  const threshold = Math.pow(10, thresholdDb / 20);

  const length = audioData.length;
  const duration = length / sampleRate;

  // Analyze audio in windows and mark silent regions
  const numWindows = Math.ceil(length / windowSize);
  const isSilent = new Array(numWindows);

  for (let w = 0; w < numWindows; w++) {
    const startSample = w * windowSize;
    const endSample = Math.min(startSample + windowSize, length);
    const windowLength = endSample - startSample;

    // Calculate RMS for this window
    let sumSquares = 0;
    for (let i = startSample; i < endSample; i++) {
      sumSquares += audioData[i] * audioData[i];
    }
    const rms = Math.sqrt(sumSquares / windowLength);

    // Mark as silent if RMS is below threshold
    isSilent[w] = rms < threshold;
  }

  // Convert silent windows to time regions
  const silences = [];
  let silenceStartWindow = null;
  let regionCounter = 0;

  for (let w = 0; w <= numWindows; w++) {
    const isCurrentSilent = w < numWindows ? isSilent[w] : false;

    if (isCurrentSilent && silenceStartWindow === null) {
      silenceStartWindow = w;
    } else if (!isCurrentSilent && silenceStartWindow !== null) {
      const startTime = (silenceStartWindow * windowSize) / sampleRate;
      const endTime = Math.min((w * windowSize) / sampleRate, duration);
      const durationMs = (endTime - startTime) * 1000;

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
    Math.abs(silences[silences.length - 1].end - duration) < 0.01
    ? silences[silences.length - 1]
    : null;

  // Send results back to main thread
  self.postMessage({
    silences,
    leadingSilence,
    trailingSilence,
    duration,
  });
};
