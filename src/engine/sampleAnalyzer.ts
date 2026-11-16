import { createDefaultNode } from './moduleRegistry';
import { SynthEngine } from './SynthEngine';
import { ModMatrixSlot, SynthConnection, SynthNode, SynthPatch } from './types';

export type SynthesisArchetype =
  | 'auto'
  | 'physicalPluck'
  | 'physicalBowed'
  | 'windFormant'
  | 'fmBell'
  | 'ensemblePad';

export type ResolvedArchetype = Exclude<SynthesisArchetype, 'auto'>;

export interface FormantPeak {
  freqHz: number;
  gainDb: number;
  q: number;
}

export interface AcousticAnalysisProfile {
  durationSec: number;
  sampleRate: number;
  fundamentalHz: number;
  midiNote: number;
  noteName: string;
  centsOffset: number;
  pitchConfidence: number;
  vibratoRateHz: number;
  vibratoDepthCents: number;
  attackSec: number;
  decaySec: number;
  sustainLevel: number;
  releaseSec: number;
  peakRms: number;
  spectralCentroidHz: number;
  attackBrightnessRatio: number;
  oddEvenRatio: number;
  inharmonicity: number;
  noiseRatio: number;
  stereoWidth: number;
  reverbTailSec: number;
  harmonicAmps: number[];
  formants: [FormantPeak, FormantPeak];
  sampleSpectrumDb: Float32Array;
  sampleEnvelope: Float32Array;
  detectedArchetype: ResolvedArchetype;
}

export interface ReconstructionResult {
  profile: AcousticAnalysisProfile;
  archetypeUsed: ResolvedArchetype;
  patch: SynthPatch;
  synthSpectrumDb: Float32Array;
  synthEnvelope: Float32Array;
  renderedBuffer: AudioBuffer;
  matchScorePct: number;
  summaryNotes: string[];
}

export const SPECTRUM_BANDS = 64;
export const SPECTRUM_MIN_HZ = 45;
export const SPECTRUM_MAX_HZ = 14000;
const FFT_SIZE = 4096;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : v > max ? max : v;
}

export function midiToNoteLabel(midi: number): string {
  const m = Math.round(clamp(midi, 0, 127));
  const name = NOTE_NAMES[((m % 12) + 12) % 12];
  const octave = Math.floor(m / 12) - 1;
  return `${name}${octave}`;
}

export function spectrumBandFreq(idx: number): number {
  const t = idx / (SPECTRUM_BANDS - 1);
  return SPECTRUM_MIN_HZ * Math.pow(SPECTRUM_MAX_HZ / SPECTRUM_MIN_HZ, t);
}

// Precompute Hann window & bit-reversal indices for 4096-pt FFT
const HANN_WINDOW = (() => {
  const w = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
  }
  return w;
})();

const BIT_REV = (() => {
  const rev = new Uint16Array(FFT_SIZE);
  const bits = Math.log2(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) {
    let x = i;
    let r = 0;
    for (let b = 0; b < bits; b++) {
      r = (r << 1) | (x & 1);
      x >>= 1;
    }
    rev[i] = r;
  }
  return rev;
})();

function radix2Fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 0; i < n; i++) {
    const j = BIT_REV[i];
    if (i < j) {
      const tr = re[i];
      const ti = im[i];
      re[i] = re[j];
      im[i] = im[j];
      re[j] = tr;
      im[j] = ti;
    }
  }

  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = (-2 * Math.PI) / size;
    const wStepRe = Math.cos(step);
    const wStepIm = Math.sin(step);
    for (let start = 0; start < n; start += size) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < half; k++) {
        const i0 = start + k;
        const i1 = i0 + half;
        const tRe = wRe * re[i1] - wIm * im[i1];
        const tIm = wRe * im[i1] + wIm * re[i1];
        re[i1] = re[i0] - tRe;
        im[i1] = im[i0] - tIm;
        re[i0] += tRe;
        im[i0] += tIm;
        const nextRe = wRe * wStepRe - wIm * wStepIm;
        wIm = wRe * wStepIm + wIm * wStepRe;
        wRe = nextRe;
      }
    }
  }
}

export function mixBufferToMono(
  buffer: AudioBuffer,
  startSec = 0,
  endSec = buffer.duration
): Float32Array {
  const sr = buffer.sampleRate;
  const s0 = Math.max(0, Math.min(buffer.length - 1, Math.floor(startSec * sr)));
  const s1 = Math.max(s0 + 1, Math.min(buffer.length, Math.ceil(endSec * sr)));
  const len = s1 - s0;
  const out = new Float32Array(len);
  const chCount = buffer.numberOfChannels;

  for (let ch = 0; ch < chCount; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      out[i] += data[s0 + i] / chCount;
    }
  }
  return out;
}

function estimateStereoWidth(
  buffer: AudioBuffer,
  startSec: number,
  endSec: number
): number {
  if (buffer.numberOfChannels < 2) return 0.18;
  const sr = buffer.sampleRate;
  const s0 = Math.max(0, Math.floor(startSec * sr));
  const s1 = Math.min(buffer.length, Math.ceil(endSec * sr));
  const chL = buffer.getChannelData(0);
  const chR = buffer.getChannelData(1);

  let sumMidSq = 0;
  let sumSideSq = 0;
  const step = Math.max(1, Math.floor((s1 - s0) / 16000));
  for (let i = s0; i < s1; i += step) {
    const m = 0.5 * (chL[i] + chR[i]);
    const s = 0.5 * (chL[i] - chR[i]);
    sumMidSq += m * m;
    sumSideSq += s * s;
  }
  const total = sumMidSq + sumSideSq;
  if (total < 1e-8) return 0.18;
  return clamp(Math.sqrt(sumSideSq / total) * 1.8, 0.08, 0.95);
}

/**
 * Automatically finds the strongest single note onset and decay tail inside an uploaded/recorded audio buffer.
 */
export function autoIsolateNoteBounds(buffer: AudioBuffer): {
  startSec: number;
  endSec: number;
} {
  const mono = mixBufferToMono(buffer, 0, buffer.duration);
  const sr = buffer.sampleRate;
  const hop = Math.max(64, Math.floor(sr * 0.008)); // 8ms hop
  const win = hop * 2;
  const numFrames = Math.max(1, Math.floor((mono.length - win) / hop));
  const rms = new Float32Array(numFrames);

  let peakRms = 0;
  let peakIdx = 0;
  for (let f = 0; f < numFrames; f++) {
    const offset = f * hop;
    let sum = 0;
    for (let i = 0; i < win; i++) {
      const s = mono[offset + i] || 0;
      sum += s * s;
    }
    const r = Math.sqrt(sum / win);
    rms[f] = r;
    if (r > peakRms) {
      peakRms = r;
      peakIdx = f;
    }
  }

  if (peakRms < 1e-4) {
    return {
      startSec: 0,
      endSec: Math.min(buffer.duration, 2.5),
    };
  }

  // Walk backward from peak to locate onset
  const onsetThresh = peakRms * 0.075;
  let startFrame = peakIdx;
  while (startFrame > 0 && rms[startFrame] > onsetThresh) {
    startFrame--;
  }
  // Check for steep jump slightly before peak in case of slow pad
  const preRollSec = 0.015;
  const startSec = Math.max(0, (startFrame * hop) / sr - preRollSec);

  // Walk forward from peak to locate natural tail end (or next major re-onset)
  const tailThresh = peakRms * 0.02;
  const maxFrames = Math.floor((4.2 * sr) / hop);
  let endFrame = Math.min(numFrames - 1, peakIdx + maxFrames);
  let silentCount = 0;
  let minSincePeak = peakRms;
  for (let f = peakIdx + 2; f < Math.min(numFrames, peakIdx + maxFrames); f++) {
    if (rms[f] < minSincePeak) {
      minSincePeak = rms[f];
    }
    // If a distinct second note spike occurs well after decay, stop before it
    if (
      f - peakIdx > Math.floor(0.25 * sr / hop) &&
      minSincePeak < peakRms * 0.22 &&
      rms[f] > minSincePeak * 3.4 &&
      rms[f] > peakRms * 0.35
    ) {
      endFrame = Math.max(peakIdx + 4, f - 2);
      break;
    }
    if (rms[f] < tailThresh) {
      silentCount++;
      if (silentCount >= 8) {
        endFrame = f;
        break;
      }
    } else {
      silentCount = 0;
    }
  }

  let endSec = Math.min(buffer.duration, ((endFrame + 2) * hop) / sr);
  if (endSec - startSec < 0.16) {
    endSec = Math.min(buffer.duration, startSec + Math.min(1.5, buffer.duration - startSec));
  }

  return { startSec, endSec };
}

function computeEnvelope64(samples: Float32Array): Float32Array {
  const out = new Float32Array(SPECTRUM_BANDS);
  const segLen = Math.max(1, Math.floor(samples.length / SPECTRUM_BANDS));
  let maxRms = 1e-6;
  for (let b = 0; b < SPECTRUM_BANDS; b++) {
    const start = b * segLen;
    const end = b === SPECTRUM_BANDS - 1 ? samples.length : Math.min(samples.length, start + segLen);
    let sum = 0;
    const count = Math.max(1, end - start);
    for (let i = start; i < end; i++) {
      sum += samples[i] * samples[i];
    }
    const r = Math.sqrt(sum / count);
    out[b] = r;
    if (r > maxRms) maxRms = r;
  }
  for (let b = 0; b < SPECTRUM_BANDS; b++) {
    out[b] = clamp(out[b] / maxRms, 0, 1);
  }
  return out;
}

function computeAverageMagSpectrum(
  samples: Float32Array,
  startRatio = 0,
  endRatio = 1
): Float32Array {
  const magSum = new Float32Array(FFT_SIZE / 2);
  const s0 = Math.max(0, Math.floor(samples.length * startRatio));
  const s1 = Math.max(s0 + 1, Math.min(samples.length, Math.floor(samples.length * endRatio)));
  const span = s1 - s0;
  const frameCount = span <= FFT_SIZE ? 1 : Math.min(12, Math.max(2, Math.floor(span / (FFT_SIZE / 2))));
  const hop = frameCount === 1 ? 0 : Math.floor((span - FFT_SIZE) / (frameCount - 1));

  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);

  for (let f = 0; f < frameCount; f++) {
    const offset = s0 + f * hop;
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < FFT_SIZE; i++) {
      const idx = offset + i;
      const sample = idx < s1 ? samples[idx] : 0;
      re[i] = sample * HANN_WINDOW[i];
    }
    radix2Fft(re, im);
    for (let k = 0; k < FFT_SIZE / 2; k++) {
      magSum[k] += Math.hypot(re[k], im[k]);
    }
  }

  for (let k = 0; k < FFT_SIZE / 2; k++) {
    magSum[k] /= frameCount;
  }
  return magSum;
}

function magSpectrumToLogBands64(mag: Float32Array, sampleRate: number): Float32Array {
  const out = new Float32Array(SPECTRUM_BANDS);
  const nyquist = sampleRate / 2;
  const logRatio = SPECTRUM_MAX_HZ / SPECTRUM_MIN_HZ;

  let maxMag = 1e-8;
  const raw = new Float32Array(SPECTRUM_BANDS);

  for (let b = 0; b < SPECTRUM_BANDS; b++) {
    const fLow =
      SPECTRUM_MIN_HZ * Math.pow(logRatio, Math.max(0, b - 0.5) / (SPECTRUM_BANDS - 1));
    const fHigh =
      SPECTRUM_MIN_HZ *
      Math.pow(logRatio, Math.min(SPECTRUM_BANDS - 1, b + 0.5) / (SPECTRUM_BANDS - 1));
    const bin0 = Math.max(1, Math.min(mag.length - 1, Math.floor((fLow / nyquist) * mag.length)));
    const bin1 = Math.max(bin0, Math.min(mag.length - 1, Math.ceil((fHigh / nyquist) * mag.length)));

    let peak = 0;
    let sumSq = 0;
    for (let k = bin0; k <= bin1; k++) {
      if (mag[k] > peak) peak = mag[k];
      sumSq += mag[k] * mag[k];
    }
    const val = Math.max(peak * 0.72, Math.sqrt(sumSq / Math.max(1, bin1 - bin0 + 1)));
    raw[b] = val;
    if (val > maxMag) maxMag = val;
  }

  for (let b = 0; b < SPECTRUM_BANDS; b++) {
    const norm = Math.max(1e-5, raw[b] / maxMag);
    out[b] = clamp(20 * Math.log10(norm), -72, 0);
  }
  return out;
}

export function computeLogSpectrum64FromBuffer(
  buffer: AudioBuffer,
  startSec = 0,
  endSec = buffer.duration
): Float32Array {
  const mono = mixBufferToMono(buffer, startSec, endSec);
  const mag = computeAverageMagSpectrum(mono, 0, 1);
  return magSpectrumToLogBands64(mag, buffer.sampleRate);
}

function estimatePitchYIN(
  samples: Float32Array,
  sampleRate: number
): {
  fundamentalHz: number;
  confidence: number;
  vibratoRateHz: number;
  vibratoDepthCents: number;
} {
  const frameSize = Math.min(2048, samples.length);
  if (frameSize < 512) {
    return { fundamentalHz: 261.63, confidence: 0.25, vibratoRateHz: 5.2, vibratoDepthCents: 0 };
  }

  const minLag = Math.max(12, Math.floor(sampleRate / 2100));
  const maxLag = Math.min(Math.floor(frameSize / 2) - 2, Math.floor(sampleRate / 52));
  if (maxLag <= minLag + 4) {
    return { fundamentalHz: 261.63, confidence: 0.25, vibratoRateHz: 5.2, vibratoDepthCents: 0 };
  }

  const startOffset = samples.length > sampleRate * 0.28 ? Math.floor(samples.length * 0.08) : 0;
  const endOffset = Math.max(startOffset + frameSize, Math.floor(samples.length * 0.78));
  const usable = Math.max(frameSize, endOffset - startOffset);
  const numFrames = usable <= frameSize ? 1 : Math.min(12, Math.max(3, Math.floor(usable / 1024)));
  const hop = numFrames === 1 ? 0 : Math.floor((usable - frameSize) / (numFrames - 1));

  const pitches: { f0: number; conf: number; t: number }[] = [];
  const diff = new Float32Array(maxLag + 1);
  const cmndf = new Float32Array(maxLag + 1);

  for (let f = 0; f < numFrames; f++) {
    const off = startOffset + f * hop;
    let energy = 0;
    for (let i = 0; i < frameSize; i++) {
      const s = samples[off + i] || 0;
      energy += s * s;
    }
    if (Math.sqrt(energy / frameSize) < 0.008) continue;

    diff.fill(0);
    for (let tau = minLag; tau <= maxLag; tau++) {
      let sum = 0;
      const limit = frameSize - tau;
      for (let j = 0; j < limit; j++) {
        const d = (samples[off + j] || 0) - (samples[off + j + tau] || 0);
        sum += d * d;
      }
      diff[tau] = sum;
    }

    cmndf[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau <= maxLag; tau++) {
      runningSum += diff[tau];
      cmndf[tau] = runningSum > 1e-9 ? (diff[tau] * tau) / runningSum : 1;
    }

    // Threshold search (YIN step 4)
    let bestTau = -1;
    for (let tau = minLag; tau <= maxLag - 1; tau++) {
      if (cmndf[tau] < 0.16) {
        while (tau + 1 <= maxLag && cmndf[tau + 1] < cmndf[tau]) {
          tau++;
        }
        bestTau = tau;
        break;
      }
    }

    if (bestTau === -1) {
      let minVal = Infinity;
      for (let tau = minLag; tau <= maxLag; tau++) {
        if (cmndf[tau] < minVal) {
          minVal = cmndf[tau];
          bestTau = tau;
        }
      }
    }

    if (bestTau > minLag && bestTau < maxLag) {
      const y0 = cmndf[bestTau - 1];
      const y1 = cmndf[bestTau];
      const y2 = cmndf[bestTau + 1];
      const denom = 2 * (2 * y1 - y2 - y0);
      const shift = Math.abs(denom) > 1e-9 ? (y2 - y0) / denom : 0;
      const refinedTau = clamp(bestTau + clamp(shift, -0.5, 0.5), minLag, maxLag);
      const f0 = sampleRate / refinedTau;
      const conf = clamp(1 - y1, 0, 1);
      if (f0 >= 50 && f0 <= 2200) {
        pitches.push({ f0, conf, t: (off + frameSize * 0.5) / sampleRate });
      }
    }
  }

  if (pitches.length === 0) {
    return { fundamentalHz: 261.63, confidence: 0.2, vibratoRateHz: 5.2, vibratoDepthCents: 0 };
  }

  // Median of high-confidence pitches
  const confident = pitches.filter((p) => p.conf >= 0.48);
  const pool = confident.length > 0 ? confident : pitches;
  const sorted = [...pool].sort((a, b) => a.f0 - b.f0);
  const medianF0 = sorted[Math.floor(sorted.length / 2)].f0;
  const avgConf = pool.reduce((acc, p) => acc + p.conf, 0) / pool.length;

  // Estimate vibrato from cents trajectory around medianF0
  let vibratoDepthCents = 0;
  let vibratoRateHz = 5.3;
  const nearMedian = pool.filter((p) => Math.abs(1200 * Math.log2(p.f0 / medianF0)) < 110);
  if (nearMedian.length >= 5) {
    const centsArr = nearMedian.map((p) => 1200 * Math.log2(p.f0 / medianF0));
    const meanCents = centsArr.reduce((a, b) => a + b, 0) / centsArr.length;
    let sumSq = 0;
    let zeroCrossings = 0;
    for (let i = 0; i < centsArr.length; i++) {
      const c = centsArr[i] - meanCents;
      sumSq += c * c;
      if (i > 0 && (centsArr[i - 1] - meanCents) * c < 0) {
        zeroCrossings++;
      }
    }
    const rmsCents = Math.sqrt(sumSq / centsArr.length);
    const spanSec = Math.max(0.15, nearMedian[nearMedian.length - 1].t - nearMedian[0].t);
    const estRate = zeroCrossings / (2 * spanSec);
    if (rmsCents >= 4 && rmsCents <= 65 && estRate >= 2.2 && estRate <= 8.5) {
      vibratoDepthCents = Math.round(rmsCents * 1.414);
      vibratoRateHz = clamp(estRate, 3.4, 7.2);
    }
  }

  return {
    fundamentalHz: medianF0,
    confidence: clamp(avgConf, 0, 1),
    vibratoRateHz,
    vibratoDepthCents,
  };
}

function extractAdsr(
  samples: Float32Array,
  sampleRate: number
): {
  attackSec: number;
  decaySec: number;
  sustainLevel: number;
  releaseSec: number;
  reverbTailSec: number;
  peakRms: number;
} {
  const hop = Math.max(64, Math.floor(sampleRate * 0.005)); // 5ms
  const win = hop * 2;
  const numFrames = Math.max(4, Math.floor(samples.length / hop));
  const env = new Float32Array(numFrames);

  let peakRms = 1e-6;
  let peakIdx = 0;
  for (let f = 0; f < numFrames; f++) {
    const start = f * hop;
    const end = Math.min(samples.length, start + win);
    let sum = 0;
    for (let i = start; i < end; i++) {
      sum += samples[i] * samples[i];
    }
    const r = Math.sqrt(sum / Math.max(1, end - start));
    env[f] = r;
    if (r > peakRms) {
      peakRms = r;
      peakIdx = f;
    }
  }

  // Attack: from 6% of peak to 90% of peak
  let startAttIdx = 0;
  for (let f = 0; f <= peakIdx; f++) {
    if (env[f] >= peakRms * 0.06) {
      startAttIdx = f;
      break;
    }
  }
  let endAttIdx = peakIdx;
  for (let f = startAttIdx; f <= peakIdx; f++) {
    if (env[f] >= peakRms * 0.9) {
      endAttIdx = f;
      break;
    }
  }
  const attackSec = clamp(((endAttIdx - startAttIdx) * hop) / sampleRate, 0.004, 3.5);

  const remFrames = Math.max(1, numFrames - peakIdx);
  const midStart = peakIdx + Math.floor(remFrames * 0.28);
  const midEnd = Math.min(numFrames, peakIdx + Math.floor(remFrames * 0.65));
  let midSum = 0;
  for (let f = midStart; f < midEnd; f++) {
    midSum += env[f];
  }
  const midAvg = midSum / Math.max(1, midEnd - midStart);
  const rawSustain = clamp(midAvg / peakRms, 0, 0.96);

  // Decay time: peak down to sustain plateau (or -18 dB if percussive)
  const targetDec = rawSustain > 0.18 ? rawSustain * peakRms * 1.15 : peakRms * 0.14;
  let decEndIdx = midStart;
  for (let f = peakIdx + 1; f < numFrames; f++) {
    if (env[f] <= targetDec) {
      decEndIdx = f;
      break;
    }
  }
  const decaySec = clamp(((decEndIdx - peakIdx) * hop) / sampleRate, 0.04, 4.5);

  // Release: slope in final 25% of note
  const tailStart = Math.floor(numFrames * 0.72);
  let tailEnd = numFrames - 1;
  for (let f = tailStart; f < numFrames; f++) {
    if (env[f] <= peakRms * 0.03) {
      tailEnd = f;
      break;
    }
  }
  const tailSpan = Math.max(0.06, ((tailEnd - tailStart) * hop) / sampleRate);
  const sustainLevel = rawSustain < 0.16 ? clamp(rawSustain * 0.85, 0.02, 0.15) : rawSustain;
  const releaseSec = clamp(tailSpan * (rawSustain < 0.16 ? 1.2 : 1.05), 0.06, 4.5);
  const reverbTailSec = clamp(tailSpan * 1.4, 0.5, 4.5);

  return {
    attackSec,
    decaySec,
    sustainLevel,
    releaseSec,
    reverbTailSec,
    peakRms,
  };
}

function extractFormantPeaks(sampleSpectrumDb: Float32Array): [FormantPeak, FormantPeak] {
  // Smooth the 64-band log spectrum to obtain broad resonance envelope
  const smooth = new Float32Array(SPECTRUM_BANDS);
  for (let i = 0; i < SPECTRUM_BANDS; i++) {
    let sum = 0;
    let wSum = 0;
    for (let k = -4; k <= 4; k++) {
      const idx = i + k;
      if (idx >= 0 && idx < SPECTRUM_BANDS) {
        const w = 5 - Math.abs(k);
        sum += sampleSpectrumDb[idx] * w;
        wSum += w;
      }
    }
    smooth[i] = sum / wSum;
  }

  // Broad baseline trend to compute local prominence above natural roll-off
  const baseline = new Float32Array(SPECTRUM_BANDS);
  for (let i = 0; i < SPECTRUM_BANDS; i++) {
    let sum = 0;
    let count = 0;
    for (let k = -11; k <= 11; k++) {
      const idx = i + k;
      if (idx >= 0 && idx < SPECTRUM_BANDS) {
        sum += smooth[idx];
        count++;
      }
    }
    baseline[i] = sum / count;
  }

  const pickBestInRange = (minHz: number, maxHz: number, fallbackHz: number): FormantPeak => {
    let bestIdx = -1;
    let bestProm = -999;
    for (let i = 2; i < SPECTRUM_BANDS - 2; i++) {
      const f = spectrumBandFreq(i);
      if (f < minHz || f > maxHz) continue;
      const prom = smooth[i] - baseline[i];
      if (smooth[i] > -48 && prom > bestProm && smooth[i] >= smooth[i - 1] && smooth[i] >= smooth[i + 1]) {
        bestProm = prom;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) {
      return { freqHz: fallbackHz, gainDb: 2.5, q: 1.8 };
    }
    return {
      freqHz: Math.round(spectrumBandFreq(bestIdx)),
      gainDb: Number(clamp(bestProm * 0.85, 1.0, 11.0).toFixed(1)),
      q: Number(clamp(1.4 + bestProm * 0.18, 1.1, 4.5).toFixed(1)),
    };
  };

  return [
    pickBestInRange(170, 1050, 380),
    pickBestInRange(1050, 5200, 2200),
  ];
}

function classifyArchetype(
  profile: Omit<AcousticAnalysisProfile, 'detectedArchetype'>
): ResolvedArchetype {
  // 1. High inharmonicity -> FM Bell / Mallet / Metallic percussion
  if (profile.inharmonicity > 0.16 && profile.attackSec < 0.09) {
    return 'fmBell';
  }
  // 2. Slow swell attack + wide stereo or sustained pad -> Ensemble Pad
  if (profile.attackSec >= 0.24 && profile.sustainLevel >= 0.45) {
    return 'ensemblePad';
  }
  // 3. Fast attack + decaying non-sustained envelope -> Physical Plucked / Struck
  if (profile.attackSec < 0.065 && profile.sustainLevel < 0.26) {
    return profile.inharmonicity > 0.22 ? 'fmBell' : 'physicalPluck';
  }
  // 4. Sustained expressive with vibrato or warm mid-high string harmonics -> Bowed Physical
  if (
    profile.sustainLevel >= 0.3 &&
    (profile.vibratoDepthCents >= 5 || (profile.oddEvenRatio < 0.62 && profile.attackSec >= 0.045))
  ) {
    return 'physicalBowed';
  }
  // 5. Wind / Reed / Brass Formant Oscillator
  return 'windFormant';
}

export function analyzeAudioSample(
  buffer: AudioBuffer,
  startSec = 0,
  endSec = buffer.duration
): AcousticAnalysisProfile {
  const sr = buffer.sampleRate;
  const mono = mixBufferToMono(buffer, startSec, endSec);
  const durationSec = mono.length / sr;

  const pitch = estimatePitchYIN(mono, sr);
  const midiFloat = 69 + 12 * Math.log2(pitch.fundamentalHz / 440);
  const midiNote = Math.round(clamp(midiFloat, 24, 96));
  const centsOffset = Math.round((midiFloat - midiNote) * 100);
  const noteName = midiToNoteLabel(midiNote);

  const adsr = extractAdsr(mono, sr);
  const sampleEnvelope = computeEnvelope64(mono);

  const fullMag = computeAverageMagSpectrum(mono, 0, 1);
  const attackEndRatio = clamp(0.065 / Math.max(0.08, durationSec), 0.05, 0.35);
  const attackMag = computeAverageMagSpectrum(mono, 0, attackEndRatio);
  const sustainMag = computeAverageMagSpectrum(mono, attackEndRatio, 0.78);

  const nyquist = sr / 2;
  const maxBin = Math.min(fullMag.length - 1, Math.floor((14000 / nyquist) * fullMag.length));

  const calcCentroid = (mag: Float32Array): number => {
    let num = 0;
    let den = 0;
    for (let k = 2; k <= maxBin; k++) {
      const e = mag[k] * mag[k];
      const hz = (k * nyquist) / fullMag.length;
      num += hz * e;
      den += e;
    }
    return den > 1e-12 ? num / den : 900;
  };

  const spectralCentroidHz = clamp(calcCentroid(fullMag), 120, 9500);
  const attCent = calcCentroid(attackMag);
  const susCent = Math.max(100, calcCentroid(sustainMag));
  const attackBrightnessRatio = clamp(attCent / susCent, 0.5, 4.0);

  // Extract harmonics H1..H16 around fundamentalHz
  const harmonicAmps: number[] = [];
  let maxHarm = 1e-8;
  for (let h = 1; h <= 16; h++) {
    const targetHz = pitch.fundamentalHz * h;
    if (targetHz >= nyquist * 0.92) {
      harmonicAmps.push(0);
      continue;
    }
    const lowHz = targetHz * 0.955;
    const highHz = targetHz * 1.045;
    const b0 = Math.max(1, Math.floor((lowHz / nyquist) * fullMag.length));
    const b1 = Math.min(fullMag.length - 1, Math.ceil((highHz / nyquist) * fullMag.length));
    let peak = 0;
    for (let b = b0; b <= b1; b++) {
      if (fullMag[b] > peak) peak = fullMag[b];
    }
    harmonicAmps.push(peak);
    if (peak > maxHarm) maxHarm = peak;
  }
  for (let i = 0; i < harmonicAmps.length; i++) {
    harmonicAmps[i] = Number((harmonicAmps[i] / maxHarm).toFixed(4));
  }

  let oddSum = 0;
  let evenSum = 0;
  for (let i = 0; i < harmonicAmps.length; i++) {
    if (i % 2 === 0) oddSum += harmonicAmps[i];
    else evenSum += harmonicAmps[i];
  }
  const oddEvenRatio = clamp(oddSum / Math.max(1e-5, oddSum + evenSum), 0.1, 0.95);

  // Measure inharmonicity from top spectral peaks
  const peaks: { hz: number; mag: number }[] = [];
  for (let k = 4; k < maxBin - 2; k++) {
    if (fullMag[k] > fullMag[k - 1] && fullMag[k] > fullMag[k + 1]) {
      const hz = (k * nyquist) / fullMag.length;
      if (hz >= 55) peaks.push({ hz, mag: fullMag[k] });
    }
  }
  peaks.sort((a, b) => b.mag - a.mag);
  const topPeaks = peaks.slice(0, 8);
  let inharmWeightSum = 0;
  let inharmMagSum = 0;
  for (const pk of topPeaks) {
    const ratio = pk.hz / pitch.fundamentalHz;
    if (ratio < 0.75) continue;
    const nearestInt = Math.max(1, Math.round(ratio));
    const fracDev = Math.abs(ratio - nearestInt) / nearestInt;
    inharmWeightSum += fracDev * pk.mag;
    inharmMagSum += pk.mag;
  }
  const inharmonicity = inharmMagSum > 1e-8 ? clamp((inharmWeightSum / inharmMagSum) * 2.2, 0, 1) : 0.08;

  // Spectral flatness above 400 Hz as noise proxy
  const flatStart = Math.max(4, Math.floor((400 / nyquist) * fullMag.length));
  const flatEnd = Math.min(fullMag.length - 1, Math.floor((8500 / nyquist) * fullMag.length));
  let logSum = 0;
  let linSum = 0;
  let flatCount = 0;
  for (let k = flatStart; k <= flatEnd; k++) {
    const m = Math.max(1e-7, fullMag[k]);
    logSum += Math.log(m);
    linSum += m;
    flatCount++;
  }
  const geomMean = Math.exp(logSum / Math.max(1, flatCount));
  const arithMean = linSum / Math.max(1, flatCount);
  const noiseRatio = clamp(geomMean / Math.max(1e-8, arithMean), 0, 1);

  const sampleSpectrumDb = magSpectrumToLogBands64(fullMag, sr);
  const formants = extractFormantPeaks(sampleSpectrumDb);
  const stereoWidth = estimateStereoWidth(buffer, startSec, endSec);

  const partial: Omit<AcousticAnalysisProfile, 'detectedArchetype'> = {
    durationSec,
    sampleRate: sr,
    fundamentalHz: pitch.fundamentalHz,
    midiNote,
    noteName,
    centsOffset,
    pitchConfidence: pitch.confidence,
    vibratoRateHz: pitch.vibratoRateHz,
    vibratoDepthCents: pitch.vibratoDepthCents,
    attackSec: adsr.attackSec,
    decaySec: adsr.decaySec,
    sustainLevel: adsr.sustainLevel,
    releaseSec: adsr.releaseSec,
    peakRms: adsr.peakRms,
    spectralCentroidHz,
    attackBrightnessRatio,
    oddEvenRatio,
    inharmonicity,
    noiseRatio,
    stereoWidth,
    reverbTailSec: adsr.reverbTailSec,
    harmonicAmps,
    formants,
    sampleSpectrumDb,
    sampleEnvelope,
  };

  return {
    ...partial,
    detectedArchetype: classifyArchetype(partial),
  };
}

function chooseOscWaveform(profile: AcousticAnalysisProfile): string {
  const h2 = profile.harmonicAmps[1] ?? 0;
  const h3 = profile.harmonicAmps[2] ?? 0;
  const highSum = profile.harmonicAmps.slice(5).reduce((a, b) => a + b, 0);

  if (highSum < 0.28 && h2 < 0.25 && h3 < 0.2) return 'sine';
  if (highSum < 0.45 && profile.oddEvenRatio > 0.65) return 'triangle';
  if (profile.oddEvenRatio > 0.68 && h3 > 0.35) return 'hollow';
  if (profile.oddEvenRatio > 0.56) return 'reed';
  if (profile.spectralCentroidHz > 1900) return 'sawtooth';
  if (profile.attackSec > 0.14) return 'strings';
  return 'choir';
}

function buildArchetypePatch(
  patchName: string,
  profile: AcousticAnalysisProfile,
  archetype: ResolvedArchetype
): { patch: SynthPatch; summaryNotes: string[] } {
  const nodes: SynthNode[] = [];
  const connections: SynthConnection[] = [];
  const modMatrix: ModMatrixSlot[] = [];
  const notes: string[] = [];

  const [f1, f2] = profile.formants;
  const filterCutoff = clamp(profile.spectralCentroidHz * 2.1, 480, 12000);
  const airShelfGain = clamp(
    (profile.spectralCentroidHz - 2100) / 700,
    -6.5,
    4.5
  );

  // Common body Parametric EQ + Filter + Envelope + Reverb + Output
  const eq = createDefaultNode('parametricEq', 'eq1', { x: 600, y: 88 });
  eq.label = 'Body Formant EQ';
  eq.params = {
    ...eq.params,
    lowFreq: 165,
    lowGain: Number(clamp((profile.sampleSpectrumDb[6] ?? -12) * 0.12 + 1.5, -6, 6).toFixed(1)),
    mid1Freq: clamp(f1.freqHz, 160, 1750),
    mid1Gain: f1.gainDb,
    mid1Q: f1.q,
    mid2Freq: clamp(f2.freqHz, 750, 6200),
    mid2Gain: f2.gainDb,
    mid2Q: f2.q,
    highFreq: 5200,
    highGain: Number(airShelfGain.toFixed(1)),
    outputGain: 1.0,
  };

  const flt = createDefaultNode('filter', 'flt1', { x: 600, y: 312 });
  flt.label = 'Tone Filter';
  flt.params = {
    ...flt.params,
    mode: 'lowpass',
    cutoff: Math.round(filterCutoff),
    resonance: Number(clamp(1.0 + profile.formants[1].gainDb * 0.16, 0.7, 4.5).toFixed(1)),
    keyTrack: 0.42,
    gain: 3,
  };

  const env = createDefaultNode('envelope', 'env1', { x: 880, y: 120 });
  env.label = 'Amplitude ADSR';
  env.params = {
    ...env.params,
    attack: Number(clamp(profile.attackSec, 0.004, 6.0).toFixed(3)),
    decay: Number(clamp(profile.decaySec, 0.04, 6.0).toFixed(2)),
    sustain: Number(clamp(profile.sustainLevel, 0.02, 0.95).toFixed(2)),
    release: Number(clamp(profile.releaseSec, 0.04, 6.0).toFixed(2)),
    curve: archetype === 'ensemblePad' ? 'ambient' : 'standard',
    velocitySens: 0.72,
  };

  const rev = createDefaultNode('reverb', 'rev1', { x: 1160, y: 120 });
  rev.label = 'Acoustic Room';
  rev.params = {
    ...rev.params,
    size: Number(clamp(profile.reverbTailSec, 0.5, 6.5).toFixed(2)),
    preDelay: 14,
    damping: 0.56,
    shimmerMix: archetype === 'ensemblePad' ? 0.12 : 0,
    mix: Number(clamp(0.12 + profile.stereoWidth * 0.26, 0.1, 0.42).toFixed(2)),
  };

  const out = createDefaultNode('output', 'out1', { x: 1440, y: 120 });
  out.params = { gain: 0.92, pan: 0 };

  if (archetype === 'physicalPluck') {
    const str = createDefaultNode('physicalString', 'str1', { x: 48, y: 72 });
    str.label = 'Plucked Resonator';
    const isHammer = profile.attackSec >= 0.018 && profile.spectralCentroidHz < 1600;
    const damp = clamp(1 - profile.spectralCentroidHz / 5400, 0.14, 0.85);
    const decayParam = clamp(0.955 + Math.min(0.038, profile.decaySec * 0.015), 0.92, 0.994);
    str.params = {
      ...str.params,
      excitation: isHammer ? 'hammer' : 'pluck',
      damping: Number(damp.toFixed(2)),
      decay: Number(decayParam.toFixed(3)),
      brightness: Number(clamp(profile.spectralCentroidHz / 3800, 0.25, 0.96).toFixed(2)),
      sympathetic: profile.inharmonicity > 0.11 ? 0.12 : 0.02,
      exciterMix: 0.55,
      gain: 0.92,
    };

    const noise = createDefaultNode('noise', 'nz1', { x: 48, y: 296 });
    noise.label = 'Pluck Transient';
    noise.params = {
      color: profile.spectralCentroidHz > 2000 ? 'white' : 'pink',
      tone: Math.round(clamp(profile.spectralCentroidHz * 1.4, 800, 6500)),
      q: 1.6,
      gain: Number(clamp(0.08 + profile.noiseRatio * 0.35, 0.06, 0.36).toFixed(2)),
    };

    const comb = createDefaultNode('combFilter', 'comb1', { x: 320, y: 96 });
    comb.label = 'Body Cavity Comb';
    comb.params = {
      ...comb.params,
      mode: 'feedback',
      keyTrack: false,
      delayMs: Number(clamp(1000 / Math.max(120, f1.freqHz), 1.4, 12).toFixed(1)),
      feedback: 0.36,
      damping: 0.52,
      mix: 0.28,
    };

    nodes.push(str, noise, comb, eq, flt, env, rev, out);
    connections.push(
      { id: 'c1', fromNode: 'nz1', fromPort: 'out', toNode: 'str1', toPort: 'exciter', amount: 0.45 },
      { id: 'c2', fromNode: 'str1', fromPort: 'out', toNode: 'comb1', toPort: 'in', amount: 1.0 },
      { id: 'c3', fromNode: 'comb1', fromPort: 'out', toNode: 'eq1', toPort: 'in', amount: 1.0 },
      { id: 'c4', fromNode: 'eq1', fromPort: 'out', toNode: 'flt1', toPort: 'in', amount: 1.0 },
      { id: 'c5', fromNode: 'flt1', fromPort: 'out', toNode: 'env1', toPort: 'in', amount: 1.0 },
      { id: 'c6', fromNode: 'env1', fromPort: 'cv', toNode: 'flt1', toPort: 'cutoff', amount: Number(clamp(0.18 + (profile.attackBrightnessRatio - 1) * 0.22, 0.1, 0.55).toFixed(2)) },
      { id: 'c7', fromNode: 'env1', fromPort: 'out', toNode: 'rev1', toPort: 'in', amount: 1.0 },
      { id: 'c8', fromNode: 'rev1', fromPort: 'out', toNode: 'out1', toPort: 'in', amount: 1.0 }
    );
    modMatrix.push(
      { id: 'm1', enabled: true, source: 'velocity', via: 'none', targetNodeId: 'str1', targetParam: 'brightness', amount: 0.35, curve: 'linear', label: 'Velocity -> Pluck Bite' },
      { id: 'm2', enabled: true, source: 'macroX', via: 'none', targetNodeId: 'flt1', targetParam: 'cutoff', amount: 0.45, curve: 'linear', label: 'Macro X -> Brightness' },
      { id: 'm3', enabled: true, source: 'macroY', via: 'none', targetNodeId: 'str1', targetParam: 'damping', amount: -0.32, curve: 'linear', label: 'Macro Y -> Sustain Bloom' }
    );

    notes.push(
      `Karplus-Strong waveguide (${isHammer ? 'struck hammer' : 'plucked'}) tuned to match ${Math.round(profile.attackSec * 1000)} ms onset and string decay.`,
      `Acoustic cavity Comb Filter (${comb.params.delayMs} ms) + 4-band Parametric EQ locked onto body resonances at ${f1.freqHz} Hz and ${f2.freqHz} Hz.`
    );
  } else if (archetype === 'physicalBowed') {
    const str = createDefaultNode('physicalString', 'str1', { x: 48, y: 64 });
    str.label = 'Bowed String';
    str.params = {
      ...str.params,
      excitation: 'bow',
      bowPressure: Number(clamp(0.42 + profile.spectralCentroidHz / 6500, 0.38, 0.84).toFixed(2)),
      bowPosition: 0.14,
      rosin: Number(clamp(0.18 + profile.noiseRatio * 0.65, 0.14, 0.65).toFixed(2)),
      damping: Number(clamp(1 - profile.spectralCentroidHz / 5800, 0.2, 0.72).toFixed(2)),
      decay: 0.985,
      brightness: Number(clamp(profile.spectralCentroidHz / 3500, 0.4, 0.92).toFixed(2)),
      gain: 0.88,
    };

    const fm = createDefaultNode('fmOperator', 'fm1', { x: 48, y: 276 });
    fm.label = 'Rosin & Harmonics';
    fm.params = {
      ...fm.params,
      carrierWave: 'triangle',
      modWave: 'sine',
      ratio: 1.0,
      modIndex: Math.round(clamp(profile.spectralCentroidHz * 0.06, 45, 210)),
      feedback: 0.14,
      noiseFmDepth: Math.round(clamp(70 + profile.noiseRatio * 260, 60, 260)),
      noiseBandwidth: Math.round(clamp(f2.freqHz, 1200, 4200)),
      gain: 0.3,
    };

    const lfo = createDefaultNode('lfo', 'lfo1', { x: 48, y: 488 });
    lfo.label = 'Expression Vibrato';
    lfo.params = {
      waveform: 'sine',
      rate: Number(profile.vibratoRateHz.toFixed(2)),
      depth: Number(clamp(0.08 + profile.vibratoDepthCents / 90, 0.08, 0.38).toFixed(2)),
      delay: Number(clamp(profile.attackSec * 1.1, 0.08, 0.45).toFixed(2)),
    };

    const comb = createDefaultNode('combFilter', 'comb1', { x: 320, y: 96 });
    comb.label = 'Bow Point Notch';
    comb.params = {
      ...comb.params,
      mode: 'feedforward',
      keyTrack: true,
      ratio: 0.14,
      feedback: 0.42,
      damping: 0.42,
      mix: 0.4,
    };

    nodes.push(str, fm, lfo, comb, eq, flt, env, rev, out);
    connections.push(
      { id: 'c1', fromNode: 'str1', fromPort: 'out', toNode: 'comb1', toPort: 'in', amount: 1.0 },
      { id: 'c2', fromNode: 'fm1', fromPort: 'out', toNode: 'comb1', toPort: 'in', amount: 0.48 },
      { id: 'c3', fromNode: 'lfo1', fromPort: 'cv', toNode: 'str1', toPort: 'pitch', amount: 0.14 },
      { id: 'c4', fromNode: 'comb1', fromPort: 'out', toNode: 'eq1', toPort: 'in', amount: 1.0 },
      { id: 'c5', fromNode: 'eq1', fromPort: 'out', toNode: 'flt1', toPort: 'in', amount: 1.0 },
      { id: 'c6', fromNode: 'flt1', fromPort: 'out', toNode: 'env1', toPort: 'in', amount: 1.0 },
      { id: 'c7', fromNode: 'env1', fromPort: 'cv', toNode: 'flt1', toPort: 'cutoff', amount: 0.3 },
      { id: 'c8', fromNode: 'env1', fromPort: 'out', toNode: 'rev1', toPort: 'in', amount: 1.0 },
      { id: 'c9', fromNode: 'rev1', fromPort: 'out', toNode: 'out1', toPort: 'in', amount: 1.0 }
    );
    modMatrix.push(
      { id: 'm1', enabled: true, source: 'velocity', via: 'none', targetNodeId: 'str1', targetParam: 'bowPressure', amount: 0.34, curve: 'linear', label: 'Velocity -> Bow Pressure' },
      { id: 'm2', enabled: true, source: 'macroX', via: 'none', targetNodeId: 'flt1', targetParam: 'cutoff', amount: 0.42, curve: 'linear', label: 'Macro X -> Bow Brightness' },
      { id: 'm3', enabled: true, source: 'macroY', via: 'none', targetNodeId: 'lfo1', targetParam: 'depth', amount: 0.4, curve: 'linear', label: 'Macro Y -> Vibrato' }
    );

    notes.push(
      `Stick-slip bowed waveguide layered with Noise-FM rosin excitation and ${lfo.params.rate} Hz vibrato LFO.`,
      `Feedforward bow-contact Comb Filter (1/7th bridge ratio) feeding Parametric EQ body formants at ${f1.freqHz} Hz and ${f2.freqHz} Hz.`
    );
  } else if (archetype === 'fmBell') {
    // Estimate non-integer harmonic ratio from strongest inharmonic partial
    const ratioEst = clamp(
      profile.harmonicAmps[2] > 0.4
        ? 2.756
        : profile.oddEvenRatio > 0.6
          ? 1.414
          : 3.14,
      1.2,
      5.5
    );
    const fm = createDefaultNode('fmOperator', 'fm1', { x: 48, y: 80 });
    fm.label = 'Metallic FM Core';
    fm.params = {
      ...fm.params,
      carrierWave: 'sine',
      modWave: 'sine',
      ratio: Number(ratioEst.toFixed(2)),
      modIndex: Math.round(clamp(profile.spectralCentroidHz * 0.24, 180, 920)),
      feedback: 0.14,
      noiseFmDepth: Math.round(clamp(profile.noiseRatio * 180, 0, 140)),
      noiseBandwidth: 3200,
      gain: 0.82,
    };

    const osc = createDefaultNode('oscillator', 'osc1', { x: 48, y: 300 });
    osc.label = 'Bell Fundamental';
    osc.params = {
      ...osc.params,
      waveform: 'glass',
      unison: '1',
      gain: 0.42,
    };

    const modEnv = createDefaultNode('envelope', 'menv1', { x: 320, y: 296 });
    modEnv.label = 'FM Strike Decay';
    modEnv.params = {
      attack: 0.004,
      decay: Number(clamp(profile.decaySec * 0.55, 0.08, 1.4).toFixed(2)),
      sustain: 0.08,
      release: Number(clamp(profile.releaseSec * 0.6, 0.1, 1.8).toFixed(2)),
      velocitySens: 0.8,
    };

    const chorus = createDefaultNode('chorus', 'chr1', { x: 880, y: 312 });
    chorus.params = {
      ...chorus.params,
      voices: '2',
      rate: 0.35,
      depth: 0.28,
      mix: Number(clamp(profile.stereoWidth * 0.45, 0.15, 0.45).toFixed(2)),
    };

    nodes.push(fm, osc, modEnv, eq, flt, env, chorus, rev, out);
    connections.push(
      { id: 'c1', fromNode: 'fm1', fromPort: 'out', toNode: 'eq1', toPort: 'in', amount: 0.95 },
      { id: 'c2', fromNode: 'osc1', fromPort: 'out', toNode: 'eq1', toPort: 'in', amount: 0.52 },
      { id: 'c3', fromNode: 'menv1', fromPort: 'cv', toNode: 'fm1', toPort: 'index', amount: 0.72 },
      { id: 'c4', fromNode: 'eq1', fromPort: 'out', toNode: 'flt1', toPort: 'in', amount: 1.0 },
      { id: 'c5', fromNode: 'flt1', fromPort: 'out', toNode: 'env1', toPort: 'in', amount: 1.0 },
      { id: 'c6', fromNode: 'env1', fromPort: 'out', toNode: 'chr1', toPort: 'in', amount: 1.0 },
      { id: 'c7', fromNode: 'chr1', fromPort: 'out', toNode: 'rev1', toPort: 'in', amount: 1.0 },
      { id: 'c8', fromNode: 'rev1', fromPort: 'out', toNode: 'out1', toPort: 'in', amount: 1.0 }
    );
    modMatrix.push(
      { id: 'm1', enabled: true, source: 'velocity', via: 'none', targetNodeId: 'fm1', targetParam: 'modIndex', amount: 0.45, curve: 'exp', label: 'Velocity -> Strike Clank' },
      { id: 'm2', enabled: true, source: 'macroX', via: 'none', targetNodeId: 'fm1', targetParam: 'modIndex', amount: 0.4, curve: 'linear', label: 'Macro X -> Metallic Bite' },
      { id: 'm3', enabled: true, source: 'macroY', via: 'none', targetNodeId: 'rev1', targetParam: 'mix', amount: 0.35, curve: 'linear', label: 'Macro Y -> Resonance Space' }
    );

    notes.push(
      `Inharmonic 2-op FM Operator (ratio ${ratioEst.toFixed(2)}x) paired with Glass Bell harmonic fundamental.`,
      `Fast FM Strike Envelope sweeps modulation index from metallic clang down into clean bell decay.`
    );
  } else if (archetype === 'ensemblePad') {
    const wave = chooseOscWaveform(profile);
    const osc = createDefaultNode('oscillator', 'osc1', { x: 48, y: 72 });
    osc.label = 'Pad Ensemble';
    osc.params = {
      ...osc.params,
      waveform: wave === 'sine' ? 'strings' : wave,
      unison: profile.stereoWidth > 0.42 ? '5' : '3',
      unisonDetune: Math.round(clamp(10 + profile.stereoWidth * 24, 10, 32)),
      stereoSpread: Number(clamp(0.45 + profile.stereoWidth * 0.5, 0.45, 0.95).toFixed(2)),
      gain: 0.78,
    };

    const lfo = createDefaultNode('lfo', 'lfo1', { x: 48, y: 312 });
    lfo.label = 'Slow Drift LFO';
    lfo.params = {
      waveform: 'wander',
      rate: 0.14,
      depth: 0.28,
      delay: 0.35,
    };

    const chorus = createDefaultNode('chorus', 'chr1', { x: 880, y: 312 });
    chorus.label = 'Stereo Ensemble';
    chorus.params = {
      ...chorus.params,
      voices: '4',
      rate: 0.32,
      depth: 0.55,
      stereoWidth: 0.85,
      mix: Number(clamp(0.25 + profile.stereoWidth * 0.45, 0.25, 0.68).toFixed(2)),
    };

    nodes.push(osc, lfo, eq, flt, env, chorus, rev, out);
    connections.push(
      { id: 'c1', fromNode: 'osc1', fromPort: 'out', toNode: 'eq1', toPort: 'in', amount: 1.0 },
      { id: 'c2', fromNode: 'lfo1', fromPort: 'cv', toNode: 'flt1', toPort: 'cutoff', amount: 0.22 },
      { id: 'c3', fromNode: 'eq1', fromPort: 'out', toNode: 'flt1', toPort: 'in', amount: 1.0 },
      { id: 'c4', fromNode: 'flt1', fromPort: 'out', toNode: 'env1', toPort: 'in', amount: 1.0 },
      { id: 'c5', fromNode: 'env1', fromPort: 'cv', toNode: 'flt1', toPort: 'cutoff', amount: 0.32 },
      { id: 'c6', fromNode: 'env1', fromPort: 'out', toNode: 'chr1', toPort: 'in', amount: 1.0 },
      { id: 'c7', fromNode: 'chr1', fromPort: 'out', toNode: 'rev1', toPort: 'in', amount: 1.0 },
      { id: 'c8', fromNode: 'rev1', fromPort: 'out', toNode: 'out1', toPort: 'in', amount: 1.0 }
    );
    modMatrix.push(
      { id: 'm1', enabled: true, source: 'macroX', via: 'none', targetNodeId: 'flt1', targetParam: 'cutoff', amount: 0.48, curve: 'linear', label: 'Macro X -> Filter Bloom' },
      { id: 'm2', enabled: true, source: 'macroY', via: 'none', targetNodeId: 'chr1', targetParam: 'mix', amount: 0.38, curve: 'linear', label: 'Macro Y -> Ensemble Width' }
    );

    notes.push(
      `Multi-voice detuned ${osc.params.waveform} ensemble (${osc.params.unison} unison voices) capturing slow ${Math.round(profile.attackSec * 1000)} ms bloom.`,
      `Organic Wander LFO, Stereo Ensemble Chorus, and Hall Reverb tuned to ${Math.round(profile.stereoWidth * 100)}% stereo spread.`
    );
  } else {
    // windFormant (flute, clarinet, reed, brass, synth lead)
    const wave = chooseOscWaveform(profile);
    const osc = createDefaultNode('oscillator', 'osc1', { x: 48, y: 72 });
    osc.label = 'Harmonic Core';
    osc.params = {
      ...osc.params,
      waveform: wave,
      unison: profile.stereoWidth > 0.55 ? '3' : '1',
      unisonDetune: 9,
      gain: 0.82,
    };

    const noise = createDefaultNode('noise', 'nz1', { x: 48, y: 296 });
    noise.label = 'Breath / Air Chiff';
    noise.params = {
      color: profile.spectralCentroidHz > 2400 ? 'white' : 'pink',
      tone: Math.round(clamp(f2.freqHz, 1100, 5600)),
      q: 2.0,
      gain: Number(clamp(0.06 + profile.noiseRatio * 0.45, 0.05, 0.32).toFixed(2)),
    };

    const lfo = createDefaultNode('lfo', 'lfo1', { x: 48, y: 496 });
    lfo.label = 'Breath Vibrato';
    lfo.params = {
      waveform: 'sine',
      rate: Number(profile.vibratoRateHz.toFixed(2)),
      depth: Number(clamp(0.06 + profile.vibratoDepthCents / 95, 0.06, 0.3).toFixed(2)),
      delay: Number(clamp(profile.attackSec * 1.4, 0.12, 0.45).toFixed(2)),
    };

    const shaper = createDefaultNode('shaper', 'shp1', { x: 320, y: 120 });
    shaper.label = 'Warmth / Reed';
    shaper.params = {
      drive: Number(clamp(0.12 + (1 - profile.oddEvenRatio) * 0.25, 0.1, 0.36).toFixed(2)),
      asymmetry: Number(clamp((1 - profile.oddEvenRatio) * 0.35, 0.05, 0.3).toFixed(2)),
      mix: 0.48,
    };

    nodes.push(osc, noise, lfo, shaper, eq, flt, env, rev, out);
    connections.push(
      { id: 'c1', fromNode: 'osc1', fromPort: 'out', toNode: 'shp1', toPort: 'in', amount: 1.0 },
      { id: 'c2', fromNode: 'nz1', fromPort: 'out', toNode: 'flt1', toPort: 'in', amount: 0.4 },
      { id: 'c3', fromNode: 'lfo1', fromPort: 'cv', toNode: 'osc1', toPort: 'pitch', amount: 0.12 },
      { id: 'c4', fromNode: 'shp1', fromPort: 'out', toNode: 'eq1', toPort: 'in', amount: 1.0 },
      { id: 'c5', fromNode: 'eq1', fromPort: 'out', toNode: 'flt1', toPort: 'in', amount: 1.0 },
      { id: 'c6', fromNode: 'flt1', fromPort: 'out', toNode: 'env1', toPort: 'in', amount: 1.0 },
      { id: 'c7', fromNode: 'env1', fromPort: 'cv', toNode: 'flt1', toPort: 'cutoff', amount: Number(clamp(0.24 + (profile.attackBrightnessRatio - 1) * 0.18, 0.15, 0.55).toFixed(2)) },
      { id: 'c8', fromNode: 'env1', fromPort: 'out', toNode: 'rev1', toPort: 'in', amount: 1.0 },
      { id: 'c9', fromNode: 'rev1', fromPort: 'out', toNode: 'out1', toPort: 'in', amount: 1.0 }
    );
    modMatrix.push(
      { id: 'm1', enabled: true, source: 'velocity', via: 'none', targetNodeId: 'flt1', targetParam: 'cutoff', amount: 0.36, curve: 'linear', label: 'Velocity -> Breath Brightness' },
      { id: 'm2', enabled: true, source: 'macroX', via: 'none', targetNodeId: 'flt1', targetParam: 'cutoff', amount: 0.45, curve: 'linear', label: 'Macro X -> Tone' },
      { id: 'm3', enabled: true, source: 'macroY', via: 'none', targetNodeId: 'nz1', targetParam: 'gain', amount: 0.32, curve: 'linear', label: 'Macro Y -> Breath Air' }
    );

    notes.push(
      `${wave.charAt(0).toUpperCase() + wave.slice(1)} oscillator (${Math.round(profile.oddEvenRatio * 100)}% odd-harmonic weight) layered with filtered air noise.`,
      `Asymmetric Warmth Shaper + 4-band Parametric EQ sculpting resonances at ${f1.freqHz} Hz and ${f2.freqHz} Hz.`
    );
  }

  const patch: SynthPatch = {
    schemaVersion: '1.0',
    id: `matched-${Date.now().toString(36)}`,
    name: patchName,
    category: 'custom',
    regionOrFamily: `Matched · ${archetypeLabel(archetype)}`,
    description: `Offline DSP reconstruction from "${patchName}" (${profile.noteName} · ${Math.round(profile.fundamentalHz)} Hz).`,
    tags: ['matched', 'sample-dsp', archetype],
    polyphony: 8,
    glideMs: archetype === 'physicalBowed' || archetype === 'windFormant' ? 28 : 0,
    macroLabels: {
      x: 'Brightness',
      y: archetype === 'physicalBowed' ? 'Vibrato' : 'Resonance',
    },
    macroDefaults: { x: 0.5, y: 0.5 },
    nodes,
    connections,
    modMatrix,
    updatedAt: new Date().toISOString(),
  };

  return { patch, summaryNotes: notes };
}

export function archetypeLabel(a: ResolvedArchetype): string {
  switch (a) {
    case 'physicalPluck':
      return 'Physical Plucked';
    case 'physicalBowed':
      return 'Physical Bowed';
    case 'windFormant':
      return 'Wind / Formant';
    case 'fmBell':
      return 'FM Bell / Mallet';
    case 'ensemblePad':
      return 'Ensemble Pad';
  }
}

function bandRangeMean(specDb: Float32Array, minHz: number, maxHz: number): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < SPECTRUM_BANDS; i++) {
    const f = spectrumBandFreq(i);
    if (f >= minHz && f <= maxHz) {
      sum += specDb[i];
      count++;
    }
  }
  return count > 0 ? sum / count : -36;
}

function computeMatchScore(
  sampleSpec: Float32Array,
  synthSpec: Float32Array,
  sampleEnv: Float32Array,
  synthEnv: Float32Array
): number {
  // Spectral correlation over active dB range [-65, 0] shifted to [0, 65]
  let dotS = 0;
  let normA = 0;
  let normB = 0;
  let absErrSum = 0;
  for (let i = 0; i < SPECTRUM_BANDS; i++) {
    const a = Math.max(0, sampleSpec[i] + 65);
    const b = Math.max(0, synthSpec[i] + 65);
    dotS += a * b;
    normA += a * a;
    normB += b * b;
    absErrSum += Math.abs(sampleSpec[i] - synthSpec[i]);
  }
  const specCos = normA > 0 && normB > 0 ? dotS / Math.sqrt(normA * normB) : 0.5;
  const meanDbErr = absErrSum / SPECTRUM_BANDS;
  const errFactor = clamp(1 - meanDbErr / 28, 0.25, 1);

  // Envelope cosine similarity
  let dotE = 0;
  let normEA = 0;
  let normEB = 0;
  for (let i = 0; i < SPECTRUM_BANDS; i++) {
    dotE += sampleEnv[i] * synthEnv[i];
    normEA += sampleEnv[i] * sampleEnv[i];
    normEB += synthEnv[i] * synthEnv[i];
  }
  const envCos = normEA > 0 && normEB > 0 ? dotE / Math.sqrt(normEA * normEB) : 0.6;

  const combined = specCos * 0.45 + errFactor * 0.3 + envCos * 0.25;
  return Math.round(clamp(combined * 100, 32, 97));
}

/**
 * Full 2-pass closed-loop sample reconstruction using SynthEngine.renderPatchOffline.
 */
export async function reconstructPatchFromSample(
  patchName: string,
  buffer: AudioBuffer,
  trimStartSec: number,
  trimEndSec: number,
  archetypeOverride: SynthesisArchetype = 'auto',
  existingProfile?: AcousticAnalysisProfile
): Promise<ReconstructionResult> {
  const profile =
    existingProfile ?? analyzeAudioSample(buffer, trimStartSec, trimEndSec);
  const archetypeUsed: ResolvedArchetype =
    archetypeOverride === 'auto' ? profile.detectedArchetype : archetypeOverride;

  const { patch, summaryNotes } = buildArchetypePatch(patchName, profile, archetypeUsed);

  const renderTotalSec = clamp(profile.durationSec, 0.75, 2.2);
  const renderHoldSec = clamp(
    profile.sustainLevel < 0.16 ? Math.min(0.28, renderTotalSec * 0.35) : renderTotalSec * 0.62,
    0.16,
    renderTotalSec - 0.15
  );

  // Pass 1: Initial offline render at detected MIDI note
  let renderedBuffer = await SynthEngine.renderPatchOffline(
    patch,
    profile.midiNote,
    renderHoldSec,
    renderTotalSec,
    104,
    44100
  );
  let synthMono = mixBufferToMono(renderedBuffer, 0, renderTotalSec);
  let synthSpectrumDb = magSpectrumToLogBands64(
    computeAverageMagSpectrum(synthMono, 0, 1),
    renderedBuffer.sampleRate
  );

  // Pass 2: Closed-loop spectral error correction on Parametric EQ + Filter cutoff
  const eqNode = patch.nodes.find((n) => n.type === 'parametricEq');
  const fltNode = patch.nodes.find((n) => n.type === 'filter');
  if (eqNode && fltNode) {
    const targetLow = bandRangeMean(profile.sampleSpectrumDb, 55, 220);
    const synthLow = bandRangeMean(synthSpectrumDb, 55, 220);
    const errLow = targetLow - synthLow;

    const targetMid1 = bandRangeMean(profile.sampleSpectrumDb, 220, 950);
    const synthMid1 = bandRangeMean(synthSpectrumDb, 220, 950);
    const errMid1 = targetMid1 - synthMid1;

    const targetMid2 = bandRangeMean(profile.sampleSpectrumDb, 950, 3800);
    const synthMid2 = bandRangeMean(synthSpectrumDb, 950, 3800);
    const errMid2 = targetMid2 - synthMid2;

    const targetAir = bandRangeMean(profile.sampleSpectrumDb, 3800, 12000);
    const synthAir = bandRangeMean(synthSpectrumDb, 3800, 12000);
    const errAir = targetAir - synthAir;

    eqNode.params.lowGain = Number(
      clamp(Number(eqNode.params.lowGain ?? 0) + errLow * 0.45, -10, 10).toFixed(1)
    );
    eqNode.params.mid1Gain = Number(
      clamp(Number(eqNode.params.mid1Gain ?? 0) + errMid1 * 0.5, -10, 12).toFixed(1)
    );
    eqNode.params.mid2Gain = Number(
      clamp(Number(eqNode.params.mid2Gain ?? 0) + errMid2 * 0.5, -10, 12).toFixed(1)
    );
    eqNode.params.highGain = Number(
      clamp(Number(eqNode.params.highGain ?? 0) + errAir * 0.45, -12, 10).toFixed(1)
    );

    const curCutoff = Number(fltNode.params.cutoff ?? 3200);
    const cutoffScale = errAir > 3 ? 1.32 : errAir < -4 ? 0.72 : 1.0;
    fltNode.params.cutoff = Math.round(clamp(curCutoff * cutoffScale, 420, 14000));

    renderedBuffer = await SynthEngine.renderPatchOffline(
      patch,
      profile.midiNote,
      renderHoldSec,
      renderTotalSec,
      104,
      44100
    );
    synthMono = mixBufferToMono(renderedBuffer, 0, renderTotalSec);
    synthSpectrumDb = magSpectrumToLogBands64(
      computeAverageMagSpectrum(synthMono, 0, 1),
      renderedBuffer.sampleRate
    );
  }

  const synthEnvelope = computeEnvelope64(synthMono);
  const matchScorePct = computeMatchScore(
    profile.sampleSpectrumDb,
    synthSpectrumDb,
    profile.sampleEnvelope,
    synthEnvelope
  );

  return {
    profile,
    archetypeUsed,
    patch,
    synthSpectrumDb,
    synthEnvelope,
    renderedBuffer,
    matchScorePct,
    summaryNotes,
  };
}
