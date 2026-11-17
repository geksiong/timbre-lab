export const ALTERNATIVE_CARRIER_WAVEFORMS = [
  'pulse',
  'wavetable',
  'vocalFormant',
  'customHarmonics',
  'filteredNoise',
] as const;

export type AlternativeCarrierWaveform = (typeof ALTERNATIVE_CARRIER_WAVEFORMS)[number];

const ALT_SET = new Set<string>(ALTERNATIVE_CARRIER_WAVEFORMS);

export function isAlternativeCarrierWaveform(wf: unknown): wf is AlternativeCarrierWaveform {
  return typeof wf === 'string' && ALT_SET.has(wf);
}

export const CARRIER_MODE_INDEX: Record<AlternativeCarrierWaveform, number> = {
  pulse: 0,
  filteredNoise: 1,
  customHarmonics: 2,
  vocalFormant: 3,
  wavetable: 4,
};

export function resolveWorkletCarrierMode(wf: string): number {
  if (wf in CARRIER_MODE_INDEX) {
    return CARRIER_MODE_INDEX[wf as AlternativeCarrierWaveform];
  }
  switch (wf) {
    case 'sine':
      return 5;
    case 'triangle':
      return 6;
    case 'sawtooth':
      return 7;
    case 'square':
      return 8;
    default:
      return 7;
  }
}

export interface WavetableBankMeta {
  id: 'analog' | 'vocal' | 'bell' | 'bowed' | 'digital' | 'sub';
  label: string;
  index: number;
  description: string;
}

export const WAVETABLE_BANKS: WavetableBankMeta[] = [
  { id: 'analog', label: 'Analog Classic (Sine → Saw → Pulse)', index: 0, description: 'Morphs smoothly across classic analog shapes into narrow sync crunch.' },
  { id: 'vocal', label: 'Vocal Formant Sweep (Oo → Ah → Ee)', index: 1, description: 'Harmonic vowel spectra sweeping from warm sub choir to bright nasal.' },
  { id: 'bell', label: 'Metallic Bell & Gamelan', index: 2, description: 'Glassy chime partials evolving into bright metallic bell clusters.' },
  { id: 'bowed', label: 'Bowed String Overtones', index: 3, description: 'Soft sul-tasto warmth morphing into bright sul-ponticello bow edge.' },
  { id: 'digital', label: 'Digital Wavefold / PPG', index: 4, description: 'Stepped harmonic folds and phase-distorted digital textures.' },
  { id: 'sub', label: 'Sub & Drawbar Harmonics', index: 5, description: 'Fundamental weight with progressive octave, fifth, and harmonic shimmer.' },
];

export const WAVETABLE_BANK_INDEX: Record<string, number> = Object.fromEntries(
  WAVETABLE_BANKS.map((b) => [b.id, b.index])
);

export interface FormantVowelSpec {
  label: string;
  f1: number;
  f2: number;
  f3: number;
  g1: number;
  g2: number;
  g3: number;
}

export const FORMANT_VOWELS: FormantVowelSpec[] = [
  { label: 'Ah', f1: 730, f2: 1090, f3: 2440, g1: 1.0, g2: 0.58, g3: 0.25 },
  { label: 'Eh', f1: 530, f2: 1840, f3: 2480, g1: 1.0, g2: 0.62, g3: 0.30 },
  { label: 'Ee', f1: 270, f2: 2290, f3: 3010, g1: 1.0, g2: 0.52, g3: 0.28 },
  { label: 'Oh', f1: 570, f2: 840, f3: 2410, g1: 1.0, g2: 0.52, g3: 0.22 },
  { label: 'Oo', f1: 300, f2: 870, f3: 2240, g1: 1.0, g2: 0.42, g3: 0.18 },
];

export const DEFAULT_CUSTOM_HARMONICS =
  '1,0.5,0.33,0.25,0.2,0.16,0.14,0.12,0.1,0.08,0.07,0.06,0.05,0.04,0.03,0.02';

export const HARMONIC_PRESETS: { id: string; label: string; values: number[] }[] = [
  {
    id: 'saw',
    label: 'Saw',
    values: [1, 0.5, 0.33, 0.25, 0.2, 0.16, 0.14, 0.12, 0.1, 0.08, 0.07, 0.06, 0.05, 0.04, 0.03, 0.02],
  },
  {
    id: 'odd',
    label: 'Hollow Odd',
    values: [1, 0, 0.36, 0, 0.24, 0, 0.17, 0, 0.12, 0, 0.09, 0, 0.07, 0, 0.05, 0],
  },
  {
    id: 'organ',
    label: 'Organ',
    values: [1, 0.85, 0.72, 0.6, 0.1, 0.45, 0.05, 0.38, 0, 0, 0, 0.22, 0, 0, 0, 0.14],
  },
  {
    id: 'bell',
    label: 'Glass Bell',
    values: [1, 0.08, 0.68, 0.04, 0.36, 0.24, 0.06, 0.32, 0.04, 0.14, 0.2, 0.03, 0.15, 0.04, 0.09, 0.06],
  },
  {
    id: 'vocal',
    label: 'Vocal Peak',
    values: [0.75, 0.92, 1, 0.55, 0.22, 0.14, 0.42, 0.66, 0.48, 0.18, 0.08, 0.12, 0.22, 0.14, 0.06, 0.03],
  },
  {
    id: 'sine',
    label: 'Reset',
    values: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
];

export function parseHarmonicsString(raw: unknown): number[] {
  const out: number[] = new Array<number>(16).fill(0);
  if (typeof raw === 'string' && raw.trim().length > 0) {
    const parts = raw.split(',');
    let sum = 0;
    for (let i = 0; i < 16; i++) {
      const v = Number(parts[i]);
      const clamped = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
      out[i] = clamped;
      sum += clamped;
    }
    if (sum <= 0) out[0] = 1;
    return out;
  }
  return [...HARMONIC_PRESETS[0].values];
}

export function serializeHarmonics(values: number[]): string {
  const arr: string[] = [];
  for (let i = 0; i < 16; i++) {
    const v = Number.isFinite(values[i]) ? Math.max(0, Math.min(1, values[i])) : 0;
    arr.push(v.toFixed(2).replace(/\.?0+$/, '') || '0');
  }
  return arr.join(',');
}

export function getFormantVowelName(vowelPos: number): string {
  const clamped = Math.max(0, Math.min(4, Number.isFinite(vowelPos) ? vowelPos : 0));
  const i0 = Math.floor(clamped);
  const i1 = Math.min(4, i0 + 1);
  const frac = clamped - i0;
  if (frac < 0.18) return FORMANT_VOWELS[i0].label;
  if (frac > 0.82) return FORMANT_VOWELS[i1].label;
  return `${FORMANT_VOWELS[i0].label}→${FORMANT_VOWELS[i1].label}`;
}

export function formatCarrierSummary(wf: string, params: Record<string, number | string | boolean>): string {
  switch (wf) {
    case 'pulse':
      return `pulse ${Math.round(Number(params.pulseWidth ?? 0.35) * 100)}%`;
    case 'wavetable':
      return `wt:${String(params.wavetableBank ?? 'analog')} ${Math.round(Number(params.wavetablePos ?? 0.25) * 100)}%`;
    case 'vocalFormant':
      return `vocal:${getFormantVowelName(Number(params.formantVowel ?? 0))}`;
    case 'customHarmonics':
      return 'custom H16';
    case 'filteredNoise':
      return `f-noise Q${Number(params.noiseQ ?? 8).toFixed(0)}`;
    default:
      return wf;
  }
}

/**
 * Generates normalized single-cycle waveform samples (-1..1) for previewing
 * any oscillator or FM carrier shape inside NodeInspector.
 */
export function computeCarrierPreviewSamples(
  wf: string,
  params: Record<string, number | string | boolean>,
  numPoints = 128
): number[] {
  const samples = new Array<number>(numPoints).fill(0);

  if (wf === 'sine') {
    for (let i = 0; i < numPoints; i++) {
      samples[i] = Math.sin((i / numPoints) * Math.PI * 2);
    }
    return samples;
  }
  if (wf === 'triangle') {
    for (let i = 0; i < numPoints; i++) {
      const t = i / numPoints;
      samples[i] = t < 0.25 ? t * 4 : t < 0.75 ? 2 - t * 4 : t * 4 - 4;
    }
    return samples;
  }
  if (wf === 'sawtooth') {
    for (let i = 0; i < numPoints; i++) {
      samples[i] = 1 - (2 * i) / numPoints;
    }
    return samples;
  }
  if (wf === 'square') {
    for (let i = 0; i < numPoints; i++) {
      samples[i] = i < numPoints / 2 ? 0.9 : -0.9;
    }
    return samples;
  }
  if (wf === 'pulse') {
    const pw = Math.max(0.04, Math.min(0.96, Number(params.pulseWidth ?? 0.35)));
    for (let i = 0; i < numPoints; i++) {
      const t = i / numPoints;
      samples[i] = t < pw ? 0.9 : -0.9;
    }
    return samples;
  }
  if (wf === 'customHarmonics') {
    const h = parseHarmonicsString(params.customHarmonics);
    let peak = 1e-4;
    for (let i = 0; i < numPoints; i++) {
      const theta = (i / numPoints) * Math.PI * 2;
      let sum = 0;
      for (let k = 0; k < 16; k++) {
        if (h[k] > 0.001) sum += h[k] * Math.sin(theta * (k + 1));
      }
      samples[i] = sum;
      if (Math.abs(sum) > peak) peak = Math.abs(sum);
    }
    const norm = 0.92 / peak;
    for (let i = 0; i < numPoints; i++) samples[i] *= norm;
    return samples;
  }
  if (wf === 'vocalFormant') {
    const vowel = Math.max(0, Math.min(4, Number(params.formantVowel ?? 0)));
    const shift = Math.max(-12, Math.min(12, Number(params.formantShift ?? 0)));
    const shiftMul = Math.pow(2, shift / 12);
    const i0 = Math.floor(vowel);
    const i1 = Math.min(4, i0 + 1);
    const frac = vowel - i0;
    const vA = FORMANT_VOWELS[i0];
    const vB = FORMANT_VOWELS[i1];
    const f1 = (vA.f1 + (vB.f1 - vA.f1) * frac) * shiftMul;
    const f2 = (vA.f2 + (vB.f2 - vA.f2) * frac) * shiftMul;
    const f3 = (vA.f3 + (vB.f3 - vA.f3) * frac) * shiftMul;
    // Synthesize characteristic vocal harmonic envelope centered at ~140 Hz for preview
    const fund = 140;
    let peak = 1e-4;
    for (let i = 0; i < numPoints; i++) {
      const theta = (i / numPoints) * Math.PI * 2;
      let sum = 0;
      for (let k = 1; k <= 24; k++) {
        const hk = k * fund;
        const r1 = 1 / (1 + Math.pow((hk - f1) / (f1 * 0.14), 2));
        const r2 = 0.65 / (1 + Math.pow((hk - f2) / (f2 * 0.12), 2));
        const r3 = 0.35 / (1 + Math.pow((hk - f3) / (f3 * 0.11), 2));
        const amp = (r1 + r2 + r3) / Math.pow(k, 0.35);
        sum += amp * Math.sin(theta * k);
      }
      samples[i] = sum;
      if (Math.abs(sum) > peak) peak = Math.abs(sum);
    }
    const norm = 0.92 / peak;
    for (let i = 0; i < numPoints; i++) samples[i] *= norm;
    return samples;
  }
  if (wf === 'filteredNoise') {
    const q = Math.max(0.5, Math.min(32, Number(params.noiseQ ?? 8)));
    const mult = Math.max(0.25, Math.min(4, Number(params.noiseCutoff ?? 1)));
    const grit = Math.max(0.08, 1 - q / 36);
    let seed = 4219;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < numPoints; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const rnd = (seed / 4294967296) * 2 - 1;
      y1 = y1 * 0.72 + rnd * 0.28;
      y2 = y2 * 0.65 + y1 * 0.35;
      const tone = Math.sin((i / numPoints) * Math.PI * 2 * Math.max(1, mult)) * (1 - grit * 0.65);
      samples[i] = Math.max(-0.95, Math.min(0.95, tone + y2 * grit * 1.4));
    }
    return samples;
  }
  if (wf === 'wavetable') {
    const bank = String(params.wavetableBank ?? 'analog');
    const pos = Math.max(0, Math.min(1, Number(params.wavetablePos ?? 0.25)));
    let peak = 1e-4;
    for (let i = 0; i < numPoints; i++) {
      const p = i / numPoints;
      const th = p * Math.PI * 2;
      let val = 0;
      if (bank === 'analog') {
        const sine = Math.sin(th);
        const tri = p < 0.25 ? p * 4 : p < 0.75 ? 2 - p * 4 : p * 4 - 4;
        const saw = 1 - 2 * p;
        const sq = p < 0.5 ? 0.9 : -0.9;
        const narrow = p < 0.16 ? 0.9 : -0.5;
        if (pos < 0.25) {
          const f = pos * 4;
          val = sine * (1 - f) + tri * f;
        } else if (pos < 0.5) {
          const f = (pos - 0.25) * 4;
          val = tri * (1 - f) + saw * f;
        } else if (pos < 0.75) {
          const f = (pos - 0.5) * 4;
          val = saw * (1 - f) + sq * f;
        } else {
          const f = (pos - 0.75) * 4;
          val = sq * (1 - f) + narrow * f;
        }
      } else if (bank === 'vocal') {
        const peakK = 2 + pos * 9;
        for (let k = 1; k <= 14; k++) {
          const bell = Math.exp(-Math.pow((k - peakK) / 2.2, 2));
          val += (0.45 / Math.sqrt(k) + bell * 0.85) * Math.sin(th * k);
        }
      } else if (bank === 'bell') {
        for (let k = 1; k <= 12; k++) {
          const spread = 1 + pos * 0.8;
          val += (Math.sin(k * 1.414 * spread) * 0.5 + 0.5) * (1 / Math.pow(k, 1.15 - pos * 0.45)) * Math.sin(th * k);
        }
      } else if (bank === 'bowed') {
        for (let k = 1; k <= 16; k++) {
          const edge = Math.pow(k, -1.35 + pos * 0.65);
          const notch = 1 - 0.5 * pos * Math.sin(k * 1.1);
          val += edge * notch * Math.sin(th * k);
        }
      } else if (bank === 'digital') {
        const drive = 1 + pos * 5.2;
        val = Math.sin(th + Math.sin(th * (2 + Math.floor(pos * 4))) * pos * 1.6);
        val = Math.sin(val * drive * 0.7);
      } else {
        // sub
        for (let k = 1; k <= 12; k++) {
          const w = k === 1 ? 1 : k === 2 ? 0.6 + pos * 0.35 : (pos * 0.75) / Math.pow(k, 0.9);
          val += w * Math.sin(th * k);
        }
      }
      samples[i] = val;
      if (Math.abs(val) > peak) peak = Math.abs(val);
    }
    const norm = 0.9 / peak;
    for (let i = 0; i < numPoints; i++) samples[i] *= norm;
    return samples;
  }

  // Static periodic waves (organ, reed, strings, glass, choir, hollow)
  const staticPartials: Record<string, number[]> = {
    organ: [1, 0.8, 0.65, 0.5, 0.1, 0.35, 0.05, 0.28, 0, 0, 0, 0.14],
    reed: Array.from({ length: 14 }, (_, i) => ((i + 1) % 2 === 1 ? 1.0 : 0.45) / Math.pow(i + 1, 0.82)),
    strings: Array.from({ length: 14 }, (_, i) => 1 / Math.pow(i + 1, 1.08)),
    glass: [1, 0, 0.52, 0, 0.28, 0.14, 0, 0.18, 0, 0, 0.09, 0, 0.06],
    choir: [1, 0.65, 0.85, 0.35, 0.55, 0.18, 0.42, 0.12, 0.22, 0.08],
    hollow: [1, 0.05, 0.72, 0.02, 0.4, 0, 0.22, 0, 0.12],
  };
  const partials = staticPartials[wf] || [1];
  let peak = 1e-4;
  for (let i = 0; i < numPoints; i++) {
    const th = (i / numPoints) * Math.PI * 2;
    let sum = 0;
    for (let k = 0; k < partials.length; k++) {
      if (partials[k]) sum += partials[k] * Math.sin(th * (k + 1));
    }
    samples[i] = sum;
    if (Math.abs(sum) > peak) peak = Math.abs(sum);
  }
  const norm = 0.9 / peak;
  for (let i = 0; i < numPoints; i++) samples[i] *= norm;
  return samples;
}

/**
 * Pure ES5/ES6 AudioWorkletProcessor script (no backticks or template interpolation)
 * shared identically by SynthEngine.ts and standaloneExporter.ts.
 */
export const ALTERNATIVE_CARRIER_WORKLET_CODE = `
function getSharedCarrierWavetables() {
  if (globalThis.__TIMBRE_CARRIER_WAVETABLES__) {
    return globalThis.__TIMBRE_CARRIER_WAVETABLES__;
  }
  var numBanks = 6;
  var numFrames = 8;
  var tableSize = 512;
  var banks = [];
  var twoPi = 6.283185307179586;

  for (var b = 0; b < numBanks; b++) {
    var frames = [];
    for (var f = 0; f < numFrames; f++) {
      var pos = f / (numFrames - 1);
      var buf = new Float32Array(tableSize);
      var peak = 0.0001;
      for (var i = 0; i < tableSize; i++) {
        var p = i / tableSize;
        var th = p * twoPi;
        var v = 0;
        if (b === 0) {
          // Analog Classic: Sine -> Triangle -> Warm Saw -> Bright Saw -> Square -> Pulse -> Sync
          var hCount = 24;
          for (var k = 1; k <= hCount; k++) {
            var wTri = (k % 2 === 1) ? ((k % 4 === 1 ? 1 : -1) / (k * k)) : 0;
            var wSaw = 1 / k;
            var wSq = (k % 2 === 1) ? (1 / k) : 0;
            var wPulse = Math.sin(k * 0.18 * Math.PI) / (k * 0.45);
            var a = 0;
            if (pos < 0.25) {
              var t0 = pos * 4;
              a = (k === 1 ? 1 - t0 : 0) + wTri * t0;
            } else if (pos < 0.55) {
              var t1 = (pos - 0.25) / 0.3;
              a = wTri * (1 - t1) + wSaw * t1;
            } else if (pos < 0.8) {
              var t2 = (pos - 0.55) / 0.25;
              a = wSaw * (1 - t2) + wSq * t2;
            } else {
              var t3 = (pos - 0.8) / 0.2;
              a = wSq * (1 - t3) + wPulse * t3;
            }
            v += a * Math.sin(th * k);
          }
        } else if (b === 1) {
          // Vocal Choir Sweep
          var centerK = 2.0 + pos * 10.0;
          var centerK2 = 7.0 + Math.sin(pos * Math.PI) * 6.0;
          for (var kv = 1; kv <= 24; kv++) {
            var g1 = Math.exp(-Math.pow((kv - centerK) / 2.1, 2));
            var g2 = 0.52 * Math.exp(-Math.pow((kv - centerK2) / 2.6, 2));
            var base = 0.35 / Math.pow(kv, 0.85);
            v += (base + g1 + g2) * Math.sin(th * kv);
          }
        } else if (b === 2) {
          // Metallic Bell & Gamelan
          for (var kb = 1; kb <= 20; kb++) {
            var oddBoost = (kb % 2 === 1 ? 1.0 : 0.45 + pos * 0.55);
            var chime = 0.5 + 0.5 * Math.cos(kb * (1.2 + pos * 1.9));
            var tilt = 1 / Math.pow(kb, 1.35 - pos * 0.55);
            v += oddBoost * chime * tilt * Math.sin(th * kb);
          }
        } else if (b === 3) {
          // Bowed String Overtones
          for (var ks = 1; ks <= 24; ks++) {
            var bridgeNotch = 1 - 0.45 * Math.abs(Math.sin(ks * (0.35 + pos * 0.85)));
            var slope = 1 / Math.pow(ks, 1.45 - pos * 0.72);
            v += bridgeNotch * slope * Math.sin(th * ks);
          }
        } else if (b === 4) {
          // Digital Wavefold / Phase Distortion
          var fold = 1.0 + pos * 4.2;
          var modRatio = 1 + Math.floor(pos * 3.99);
          var raw = Math.sin(th + Math.sin(th * modRatio) * (0.2 + pos * 1.45));
          v = Math.sin(raw * fold * 0.85);
        } else {
          // Sub & Drawbar Harmonics
          for (var ko = 1; ko <= 16; ko++) {
            var draw = 0;
            if (ko === 1) draw = 1.0;
            else if (ko === 2) draw = 0.45 + pos * 0.45;
            else if (ko === 3) draw = pos * 0.68;
            else if (ko === 4) draw = Math.max(0, (pos - 0.15) * 0.65);
            else if (ko === 6 || ko === 8 || ko === 12) draw = Math.max(0, (pos - 0.35) * 0.55);
            else draw = Math.max(0, (pos - 0.55) * 0.25 / Math.sqrt(ko));
            v += draw * Math.sin(th * ko);
          }
        }
        buf[i] = v;
        var av = v < 0 ? -v : v;
        if (av > peak) peak = av;
      }
      var inv = 0.88 / peak;
      for (var n = 0; n < tableSize; n++) {
        buf[n] *= inv;
      }
      frames.push(buf);
    }
    banks.push(frames);
  }
  globalThis.__TIMBRE_CARRIER_WAVETABLES__ = banks;
  return banks;
}

class AlternativeCarrierProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'frequency', defaultValue: 220, minValue: -22000, maxValue: 22000, automationRate: 'a-rate' },
      { name: 'detune', defaultValue: 0, minValue: -4800, maxValue: 4800, automationRate: 'a-rate' },
      { name: 'mode', defaultValue: 0, minValue: 0, maxValue: 8, automationRate: 'k-rate' },
      { name: 'pulseWidth', defaultValue: 0.35, minValue: 0.04, maxValue: 0.96, automationRate: 'a-rate' },
      { name: 'wavetableBank', defaultValue: 0, minValue: 0, maxValue: 5, automationRate: 'k-rate' },
      { name: 'wavetablePos', defaultValue: 0.25, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
      { name: 'formantVowel', defaultValue: 0, minValue: 0, maxValue: 4, automationRate: 'a-rate' },
      { name: 'formantShift', defaultValue: 0, minValue: -12, maxValue: 12, automationRate: 'a-rate' },
      { name: 'noiseCutoff', defaultValue: 1.0, minValue: 0.25, maxValue: 4.0, automationRate: 'a-rate' },
      { name: 'noiseQ', defaultValue: 8.0, minValue: 0.5, maxValue: 32.0, automationRate: 'a-rate' },
      { name: 'shapeCv', defaultValue: 0, minValue: -1.5, maxValue: 1.5, automationRate: 'a-rate' }
    ];
  }

  constructor() {
    super();
    this.phase = 0;
    this.seed = 9187;
    this.stopped = false;
    this.tableSize = 512;
    this.banks = getSharedCarrierWavetables();

    // Noise SVF state
    this.nIc1 = 0;
    this.nIc2 = 0;
    this.nIc1b = 0;
    this.nIc2b = 0;

    // Formant 3-band SVF states + glottal smoother
    this.glottalLp = 0;
    this.f1Ic1 = 0; this.f1Ic2 = 0;
    this.f2Ic1 = 0; this.f2Ic2 = 0;
    this.f3Ic1 = 0; this.f3Ic2 = 0;

    // Spectral tilt filter state for custom harmonics Shape CV
    this.tiltLp = 0;

    // Custom harmonics mip tables (16, 8, 4, 2 max harmonics)
    this.harmonics = new Float32Array([
      1, 0.5, 0.33, 0.25, 0.2, 0.16, 0.14, 0.12,
      0.1, 0.08, 0.07, 0.06, 0.05, 0.04, 0.03, 0.02
    ]);
    this.customMips = [
      new Float32Array(this.tableSize),
      new Float32Array(this.tableSize),
      new Float32Array(this.tableSize),
      new Float32Array(this.tableSize)
    ];
    this.rebuildCustomMips();

    this.vowels = [
      { f1: 730, f2: 1090, f3: 2440, g1: 1.0, g2: 0.58, g3: 0.25 },
      { f1: 530, f2: 1840, f3: 2480, g1: 1.0, g2: 0.62, g3: 0.30 },
      { f1: 270, f2: 2290, f3: 3010, g1: 1.0, g2: 0.52, g3: 0.28 },
      { f1: 570, f2: 840,  f3: 2410, g1: 1.0, g2: 0.52, g3: 0.22 },
      { f1: 300, f2: 870,  f3: 2240, g1: 1.0, g2: 0.42, g3: 0.18 }
    ];

    var self = this;
    this.port.onmessage = function(e) {
      var data = e.data;
      if (data === 'stop') {
        self.stopped = true;
      } else if (data && data.type === 'harmonics' && data.values) {
        var arr = data.values;
        for (var i = 0; i < 16; i++) {
          var v = Number(arr[i]);
          self.harmonics[i] = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
        }
        self.rebuildCustomMips();
      }
    };
  }

  rebuildCustomMips() {
    var limits = [16, 8, 4, 2];
    var twoPi = 6.283185307179586;
    for (var m = 0; m < 4; m++) {
      var maxH = limits[m];
      var tbl = this.customMips[m];
      var peak = 0.0001;
      for (var i = 0; i < this.tableSize; i++) {
        var th = (i / this.tableSize) * twoPi;
        var sum = 0;
        for (var k = 0; k < maxH; k++) {
          var h = this.harmonics[k];
          if (h > 0.0005) {
            sum += h * Math.sin(th * (k + 1));
          }
        }
        tbl[i] = sum;
        var a = sum < 0 ? -sum : sum;
        if (a > peak) peak = a;
      }
      var inv = 0.88 / peak;
      for (var n = 0; n < this.tableSize; n++) {
        tbl[n] *= inv;
      }
    }
  }

  safeClamp(v, min, max, fallback) {
    if (!Number.isFinite(v)) return fallback;
    return v < min ? min : v > max ? max : v;
  }

  nextRand() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return (this.seed / 4294967296) * 2 - 1;
  }

  polyBlep(t, dt) {
    if (dt <= 0 || dt >= 0.49) return 0;
    if (t < dt) {
      var x = t / dt;
      return x + x - x * x - 1;
    } else if (t > 1 - dt) {
      var x2 = (t - 1) / dt;
      return x2 * x2 + x2 + x2 + 1;
    }
    return 0;
  }

  readTable(buf, phase) {
    var pos = phase * this.tableSize;
    var i0 = Math.floor(pos) % this.tableSize;
    if (i0 < 0) i0 += this.tableSize;
    var i1 = (i0 + 1) % this.tableSize;
    var f = pos - Math.floor(pos);
    return buf[i0] * (1 - f) + buf[i1] * f;
  }

  process(inputs, outputs, parameters) {
    if (this.stopped) return false;
    var output = outputs[0];
    if (!output || !output[0]) return true;
    var out = output[0];

    var freqArr = parameters.frequency;
    var detuneArr = parameters.detune;
    var mode = Math.round(this.safeClamp(parameters.mode[0], 0, 8, 0));
    var pwArr = parameters.pulseWidth;
    var bankIdx = Math.round(this.safeClamp(parameters.wavetableBank[0], 0, 5, 0));
    var wtPosArr = parameters.wavetablePos;
    var vowelArr = parameters.formantVowel;
    var shiftArr = parameters.formantShift;
    var nCutArr = parameters.noiseCutoff;
    var nQArr = parameters.noiseQ;
    var shapeCvArr = parameters.shapeCv;

    var nyquist = sampleRate * 0.45;
    var piOverSr = Math.PI / sampleRate;
    var bankFrames = this.banks[bankIdx] || this.banks[0];

    if (!Number.isFinite(this.phase)) this.phase = 0;
    if (!Number.isFinite(this.nIc1)) this.nIc1 = 0;
    if (!Number.isFinite(this.nIc2)) this.nIc2 = 0;
    if (!Number.isFinite(this.nIc1b)) this.nIc1b = 0;
    if (!Number.isFinite(this.nIc2b)) this.nIc2b = 0;
    if (!Number.isFinite(this.f1Ic1)) this.f1Ic1 = 0;
    if (!Number.isFinite(this.f1Ic2)) this.f1Ic2 = 0;
    if (!Number.isFinite(this.f2Ic1)) this.f2Ic1 = 0;
    if (!Number.isFinite(this.f2Ic2)) this.f2Ic2 = 0;
    if (!Number.isFinite(this.f3Ic1)) this.f3Ic1 = 0;
    if (!Number.isFinite(this.f3Ic2)) this.f3Ic2 = 0;

    for (var i = 0; i < out.length; i++) {
      var rawFreq = this.safeClamp(freqArr.length > 1 ? freqArr[i] : freqArr[0], -22000, 22000, 220);
      var detune = this.safeClamp(detuneArr.length > 1 ? detuneArr[i] : detuneArr[0], -4800, 4800, 0);
      var shapeCv = this.safeClamp(shapeCvArr.length > 1 ? shapeCvArr[i] : shapeCvArr[0], -1.5, 1.5, 0);

      var detScale = detune === 0 ? 1 : Math.pow(2, detune / 1200);
      var freq = rawFreq * detScale;
      var absFreq = freq < 0 ? -freq : freq;
      if (absFreq > nyquist) {
        freq = freq < 0 ? -nyquist : nyquist;
        absFreq = nyquist;
      }

      var dt = absFreq / sampleRate;
      this.phase += freq / sampleRate;
      if (this.phase >= 1 || this.phase < 0) {
        this.phase = ((this.phase % 1) + 1) % 1;
      }

      var sample = 0;

      if (mode === 0) {
        // Mode 0: PolyBLEP Pulse / PWM with DC compensation
        var basePw = this.safeClamp(pwArr.length > 1 ? pwArr[i] : pwArr[0], 0.04, 0.96, 0.35);
        var pw = this.safeClamp(basePw + shapeCv * 0.42, 0.04, 0.96, 0.35);
        var y = this.phase < pw ? 1.0 : -1.0;
        y += this.polyBlep(this.phase, dt);
        var fallingPhase = this.phase - pw;
        if (fallingPhase < 0) fallingPhase += 1;
        y -= this.polyBlep(fallingPhase, dt);
        // Remove DC bias (average of 1 for pw and -1 for 1-pw is 2*pw - 1)
        sample = (y - (2 * pw - 1)) * 0.72;
      } else if (mode === 1) {
        // Mode 1: Pitch-tracked Cascaded SVF Filtered Noise
        var baseCut = this.safeClamp(nCutArr.length > 1 ? nCutArr[i] : nCutArr[0], 0.25, 4.0, 1.0);
        var baseQ = this.safeClamp(nQArr.length > 1 ? nQArr[i] : nQArr[0], 0.5, 32.0, 8.0);
        var cutMult = this.safeClamp(baseCut * Math.pow(2, shapeCv * 1.6), 0.2, 6.0, 1.0);
        var fc = this.safeClamp(absFreq * cutMult, 35, nyquist * 0.86, 440);
        var g = Math.tan(Math.min(1.25, fc * piOverSr));
        var k = 1 / Math.max(0.5, baseQ);
        var a1 = 1 / (1 + g * (g + k));
        var a2 = g * a1;
        var a3 = g * a2;
        var wn = this.nextRand();

        var v3 = wn - this.nIc2;
        var v1 = a1 * this.nIc1 + a2 * v3;
        var v2 = this.nIc2 + a2 * this.nIc1 + a3 * v3;
        this.nIc1 = 2 * v1 - this.nIc1;
        this.nIc2 = 2 * v2 - this.nIc2;

        // Second cascaded bandpass stage at higher Q for crisp pitch lock
        var bp1 = v1 * Math.sqrt(k) * 2.4;
        var v3b = bp1 - this.nIc2b;
        var v1b = a1 * this.nIc1b + a2 * v3b;
        var v2b = this.nIc2b + a2 * this.nIc1b + a3 * v3b;
        this.nIc1b = 2 * v1b - this.nIc1b;
        this.nIc2b = 2 * v2b - this.nIc2b;

        var bp2 = v1b * Math.sqrt(k) * 2.1;
        var qBlend = Math.min(1, Math.max(0, (baseQ - 0.5) / 6.0));
        var mixed = bp1 * (1 - qBlend * 0.55) + bp2 * (qBlend * 0.85) + v2 * (1 - qBlend) * 0.32;
        sample = Math.tanh(mixed * 0.95);
      } else if (mode === 2) {
        // Mode 2: Custom 16-Partial Harmonics (Nyquist mip-mapped)
        var mipIdx = 3;
        if (absFreq * 16 < nyquist * 0.92) mipIdx = 0;
        else if (absFreq * 8 < nyquist * 0.92) mipIdx = 1;
        else if (absFreq * 4 < nyquist * 0.92) mipIdx = 2;
        var rawCustom = this.readTable(this.customMips[mipIdx], this.phase);
        if (shapeCv > 0.01 || shapeCv < -0.01) {
          this.tiltLp += 0.14 * (rawCustom - this.tiltLp);
          var amt = Math.max(-1, Math.min(1, shapeCv));
          if (amt < 0) {
            sample = rawCustom * (1 + amt * 0.75) + this.tiltLp * (-amt * 0.75);
          } else {
            sample = rawCustom + (rawCustom - this.tiltLp) * (amt * 0.85);
          }
          sample = Math.tanh(sample * 0.92);
        } else {
          sample = rawCustom;
        }
      } else if (mode === 3) {
        // Mode 3: Vocal / Formant 3-Band Resonant Tract
        var saw = 2 * this.phase - 1 - this.polyBlep(this.phase, dt);
        this.glottalLp += 0.36 * (saw - this.glottalLp);
        var breath = this.nextRand() * 0.045;
        var exc = this.glottalLp * 0.88 + breath;

        var baseVowel = this.safeClamp(vowelArr.length > 1 ? vowelArr[i] : vowelArr[0], 0, 4, 0);
        var vowel = this.safeClamp(baseVowel + shapeCv * 2.0, 0, 4, 0);
        var shiftSt = this.safeClamp(shiftArr.length > 1 ? shiftArr[i] : shiftArr[0], -12, 12, 0);
        var shiftMul = shiftSt === 0 ? 1 : Math.pow(2, shiftSt / 12);

        var vi0 = Math.floor(vowel);
        var vi1 = vi0 >= 4 ? 4 : vi0 + 1;
        var vf = vowel - vi0;
        var va = this.vowels[vi0];
        var vb = this.vowels[vi1];

        var f1 = this.safeClamp((va.f1 + (vb.f1 - va.f1) * vf) * shiftMul, 120, nyquist * 0.85, 600);
        var f2 = this.safeClamp((va.f2 + (vb.f2 - va.f2) * vf) * shiftMul, 260, nyquist * 0.88, 1200);
        var f3 = this.safeClamp((va.f3 + (vb.f3 - va.f3) * vf) * shiftMul, 600, nyquist * 0.9, 2500);
        var g1 = va.g1 + (vb.g1 - va.g1) * vf;
        var g2 = va.g2 + (vb.g2 - va.g2) * vf;
        var g3 = va.g3 + (vb.g3 - va.g3) * vf;

        // F1 SVF (Q ~ 8.5)
        var tg1 = Math.tan(Math.min(1.2, f1 * piOverSr));
        var k1 = 0.118;
        var a1_1 = 1 / (1 + tg1 * (tg1 + k1));
        var v3_1 = exc - this.f1Ic2;
        var v1_1 = a1_1 * this.f1Ic1 + tg1 * a1_1 * v3_1;
        var v2_1 = this.f1Ic2 + tg1 * a1_1 * this.f1Ic1 + tg1 * tg1 * a1_1 * v3_1;
        this.f1Ic1 = 2 * v1_1 - this.f1Ic1;
        this.f1Ic2 = 2 * v2_1 - this.f1Ic2;

        // F2 SVF (Q ~ 11)
        var tg2 = Math.tan(Math.min(1.2, f2 * piOverSr));
        var k2 = 0.091;
        var a1_2 = 1 / (1 + tg2 * (tg2 + k2));
        var v3_2 = exc - this.f2Ic2;
        var v1_2 = a1_2 * this.f2Ic1 + tg2 * a1_2 * v3_2;
        var v2_2 = this.f2Ic2 + tg2 * a1_2 * this.f2Ic1 + tg2 * tg2 * a1_2 * v3_2;
        this.f2Ic1 = 2 * v1_2 - this.f2Ic1;
        this.f2Ic2 = 2 * v2_2 - this.f2Ic2;

        // F3 SVF (Q ~ 14)
        var tg3 = Math.tan(Math.min(1.2, f3 * piOverSr));
        var k3 = 0.071;
        var a1_3 = 1 / (1 + tg3 * (tg3 + k3));
        var v3_3 = exc - this.f3Ic2;
        var v1_3 = a1_3 * this.f3Ic1 + tg3 * a1_3 * v3_3;
        var v2_3 = this.f3Ic2 + tg3 * a1_3 * this.f3Ic1 + tg3 * tg3 * a1_3 * v3_3;
        this.f3Ic1 = 2 * v1_3 - this.f3Ic1;
        this.f3Ic2 = 2 * v2_3 - this.f3Ic2;

        var vocalSum = v1_1 * k1 * 2.5 * g1 + v1_2 * k2 * 2.6 * g2 + v1_3 * k3 * 2.5 * g3 + exc * 0.16;
        sample = Math.tanh(vocalSum * 1.05);
      } else if (mode === 4) {
        // Mode 4: 2D Morphing Wavetable
        var baseWt = this.safeClamp(wtPosArr.length > 1 ? wtPosArr[i] : wtPosArr[0], 0, 1, 0.25);
        var wtPos = this.safeClamp(baseWt + shapeCv * 0.5, 0, 1, 0.25);
        var scaled = wtPos * 7;
        var fr0 = Math.floor(scaled);
        var fr1 = fr0 >= 7 ? 7 : fr0 + 1;
        var frMix = scaled - fr0;
        var s0 = this.readTable(bankFrames[fr0], this.phase);
        var s1 = this.readTable(bankFrames[fr1], this.phase);
        sample = s0 * (1 - frMix) + s1 * frMix;
      } else if (mode === 5) {
        sample = Math.sin(this.phase * 6.283185307179586);
      } else if (mode === 6) {
        var ph = this.phase;
        sample = ph < 0.25 ? ph * 4 : ph < 0.75 ? 2 - ph * 4 : ph * 4 - 4;
      } else if (mode === 7) {
        sample = 2 * this.phase - 1 - this.polyBlep(this.phase, dt);
      } else {
        var sq = this.phase < 0.5 ? 1 : -1;
        sq += this.polyBlep(this.phase, dt);
        var sqF = this.phase - 0.5;
        if (sqF < 0) sqF += 1;
        sq -= this.polyBlep(sqF, dt);
        sample = sq * 0.78;
      }

      out[i] = Number.isFinite(sample) ? (sample > 1.25 ? 1.25 : sample < -1.25 ? -1.25 : sample) : 0;
    }

    return true;
  }
}

registerProcessor('timbre-carrier-processor', AlternativeCarrierProcessor);
`;
