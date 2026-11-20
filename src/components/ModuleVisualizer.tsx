import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  computeCarrierPreviewSamples,
  FORMANT_VOWELS,
  getFormantVowelName,
} from '../engine/carrierWaves';
import { SynthEngine } from '../engine/SynthEngine';
import { SynthNode } from '../engine/types';

interface ModuleVisualizerProps {
  node: SynthNode;
  engine?: SynthEngine;
  theme?: 'light' | 'dark';
}

const W = 260;
const H = 88;
const MID = H / 2;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function samplesToPath(samples: number[], ampScale = 1, yBias = 0): string {
  if (samples.length === 0) return '';
  const maxAmp = MID - 8;
  return samples
    .map((s, i) => {
      const x = (i / Math.max(1, samples.length - 1)) * W;
      const y = MID - clamp(s * ampScale + yBias, -1.15, 1.15) * maxAmp;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

function biquadMagDb(
  type: 'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'peaking' | 'lowshelf' | 'highshelf',
  freqHz: number,
  f0: number,
  q: number,
  gainDb = 0,
  fs = 48000
): number {
  const safeF0 = clamp(f0, 20, 20000);
  const w0 = (2 * Math.PI * safeF0) / fs;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const safeQ = Math.max(0.25, q);
  const A = Math.pow(10, gainDb / 40);
  const alpha =
    type === 'lowshelf' || type === 'highshelf'
      ? (sinW0 / 2) * Math.sqrt((A + 1 / A) * (1 / 0.707 - 1) + 2)
      : sinW0 / (2 * safeQ);

  let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
  if (type === 'lowpass') {
    b0 = (1 - cosW0) / 2;
    b1 = 1 - cosW0;
    b2 = (1 - cosW0) / 2;
    a0 = 1 + alpha;
    a1 = -2 * cosW0;
    a2 = 1 - alpha;
  } else if (type === 'highpass') {
    b0 = (1 + cosW0) / 2;
    b1 = -(1 + cosW0);
    b2 = (1 + cosW0) / 2;
    a0 = 1 + alpha;
    a1 = -2 * cosW0;
    a2 = 1 - alpha;
  } else if (type === 'bandpass') {
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
    a0 = 1 + alpha;
    a1 = -2 * cosW0;
    a2 = 1 - alpha;
  } else if (type === 'notch') {
    b0 = 1;
    b1 = -2 * cosW0;
    b2 = 1;
    a0 = 1 + alpha;
    a1 = -2 * cosW0;
    a2 = 1 - alpha;
  } else if (type === 'peaking') {
    b0 = 1 + alpha * A;
    b1 = -2 * cosW0;
    b2 = 1 - alpha * A;
    a0 = 1 + alpha / A;
    a1 = -2 * cosW0;
    a2 = 1 - alpha / A;
  } else if (type === 'lowshelf') {
    const sq = 2 * Math.sqrt(A) * alpha;
    b0 = A * (A + 1 - (A - 1) * cosW0 + sq);
    b1 = 2 * A * (A - 1 - (A + 1) * cosW0);
    b2 = A * (A + 1 - (A - 1) * cosW0 - sq);
    a0 = A + 1 + (A - 1) * cosW0 + sq;
    a1 = -2 * (A - 1 + (A + 1) * cosW0);
    a2 = A + 1 + (A - 1) * cosW0 - sq;
  } else {
    const sq = 2 * Math.sqrt(A) * alpha;
    b0 = A * (A + 1 + (A - 1) * cosW0 + sq);
    b1 = -2 * A * (A - 1 + (A + 1) * cosW0);
    b2 = A * (A + 1 + (A - 1) * cosW0 - sq);
    a0 = A + 1 - (A - 1) * cosW0 + sq;
    a1 = 2 * (A - 1 - (A + 1) * cosW0);
    a2 = A + 1 - (A - 1) * cosW0 - sq;
  }

  const w = (2 * Math.PI * clamp(freqHz, 15, 22000)) / fs;
  const c1 = Math.cos(w);
  const s1 = Math.sin(w);
  const c2 = Math.cos(2 * w);
  const s2 = Math.sin(2 * w);

  const numRe = b0 + b1 * c1 + b2 * c2;
  const numIm = -b1 * s1 - b2 * s2;
  const denRe = a0 + a1 * c1 + a2 * c2;
  const denIm = -a1 * s1 - a2 * s2;
  const magSq = (numRe * numRe + numIm * numIm) / Math.max(1e-12, denRe * denRe + denIm * denIm);
  return 10 * Math.log10(Math.max(1e-6, magSq));
}

function evalSimpleWave(wf: string, phase01: number): number {
  const t = ((phase01 % 1) + 1) % 1;
  switch (wf) {
    case 'sine':
      return Math.sin(t * Math.PI * 2);
    case 'triangle':
      return t < 0.25 ? t * 4 : t < 0.75 ? 2 - t * 4 : t * 4 - 4;
    case 'square':
      return t < 0.5 ? 0.9 : -0.9;
    case 'sawtooth':
    default:
      return 1 - 2 * t;
  }
}

interface VisualModel {
  title: string;
  readout: string;
  kind: 'wave' | 'freq' | 'contour' | 'bars';
  primaryPath: string;
  referencePath?: string;
  fillPath?: string;
  bars?: { x: number; w: number; h: number; label?: string; negative?: boolean }[];
  markers?: { x: number; y: number; label?: string }[];
  gridMode: 'bipolar' | 'unipolar' | 'freq';
  accent: 'amber' | 'cyan';
}

function buildModuleVisual(node: SynthNode): VisualModel {
  const p = node.params;
  const N = 144;

  switch (node.type) {
    case 'oscillator': {
      const wf = String(p.waveform ?? 'sawtooth');
      const gain = clamp(Number(p.gain ?? 0.7), 0, 1.2);
      const unison = Number(p.unison ?? 1);
      const spread = Number(p.unisonDetune ?? 14);
      const samples = computeCarrierPreviewSamples(wf, p, N);
      const ampScale = Math.max(0.18, Math.min(1.05, gain));
      let refPath: string | undefined;
      if (unison > 1) {
        const ghost = samples.map((_, i) => {
          const shift = Math.round(((spread / 60) * 14 * i) / N);
          const sA = samples[(i + shift) % N] ?? 0;
          const sB = samples[(i - shift + N) % N] ?? 0;
          return 0.5 * (sA + sB);
        });
        refPath = samplesToPath(ghost, ampScale * 0.85);
      }
      return {
        title: 'Oscillator Cycle',
        readout:
          wf === 'pulse'
            ? `PWM ${Math.round(Number(p.pulseWidth ?? 0.35) * 100)}%`
            : wf === 'vocalFormant'
              ? `Vowel ${getFormantVowelName(Number(p.formantVowel ?? 0))}`
              : `${wf}${unison > 1 ? ` · ${unison}x` : ''}`,
        kind: 'wave',
        primaryPath: samplesToPath(samples, ampScale),
        referencePath: refPath,
        gridMode: 'bipolar',
        accent: 'amber',
      };
    }

    case 'fmOperator': {
      const carrierWave = String(p.carrierWave ?? 'sine');
      const modWave = String(p.modWave ?? 'sine');
      const ratio = clamp(Number(p.ratio ?? 2), 0.25, 12);
      const modIndex = clamp(Number(p.modIndex ?? 260), 0, 1200);
      const feedback = clamp(Number(p.feedback ?? 0.12), 0, 0.85);
      const noiseFmDepth = clamp(Number(p.noiseFmDepth ?? 0), 0, 900);
      const gain = clamp(Number(p.gain ?? 0.75), 0, 1.2);

      // Compute carrier lookup table for arbitrary alternative carrier waves
      const carrierTable = computeCarrierPreviewSamples(carrierWave, p, N);
      const modRad = (modIndex / 160) * 1.35; // normalized visual phase modulation depth
      const noiseRad = noiseFmDepth / 450;

      const outSamples: number[] = [];
      let prevSample = 0;
      for (let i = 0; i < N; i++) {
        const t = i / N;
        const modSig = evalSimpleWave(modWave, t * ratio);
        const pseudoNoise =
          noiseRad > 0
            ? Math.sin(i * 12.9898 + 78.233) * Math.cos(i * 4.1414) * noiseRad * 0.35
            : 0;
        const modOffset = (modRad * modSig + feedback * prevSample * 0.45 + pseudoNoise) / (Math.PI * 2);
        const lookupPhase = (((t + modOffset) % 1) + 1) % 1;
        const idxF = lookupPhase * (N - 1);
        const i0 = Math.floor(idxF);
        const i1 = (i0 + 1) % N;
        const frac = idxF - i0;
        const val = carrierTable[i0] * (1 - frac) + carrierTable[i1] * frac;
        prevSample = val;
        outSamples.push(val);
      }

      const ampScale = Math.max(0.2, Math.min(1.05, gain));
      return {
        title: 'FM-Modulated Cycle',
        readout: `${ratio.toFixed(2)}x · Idx ${Math.round(modIndex)} Hz`,
        kind: 'wave',
        primaryPath: samplesToPath(outSamples, ampScale),
        referencePath: samplesToPath(carrierTable, ampScale * 0.75),
        gridMode: 'bipolar',
        accent: 'amber',
      };
    }

    case 'subHarmonic': {
      const wf = String(p.waveform ?? 'triangle');
      const s2 = clamp(Number(p.sub2Level ?? 0.15), 0, 1);
      const s1 = clamp(Number(p.sub1Level ?? 0.55), 0, 1);
      const fund = clamp(Number(p.fundLevel ?? 0.8), 0, 1);
      const fifth = clamp(Number(p.fifthLevel ?? 0.25), 0, 1);
      const octUp = clamp(Number(p.octUpLevel ?? 0.2), 0, 1);
      const gain = clamp(Number(p.gain ?? 0.72), 0, 1.2);
      const totalWeight = Math.max(0.25, s2 + s1 + fund + fifth + octUp);

      const samples: number[] = [];
      for (let i = 0; i < N; i++) {
        // Show 2 fundamental cycles so -1 Oct completes 1 cycle and -2 Oct completes half cycle
        const cyc = (i / N) * 2;
        const sum =
          s2 * evalSimpleWave(wf, cyc * 0.25) +
          s1 * evalSimpleWave(wf, cyc * 0.5) +
          fund * evalSimpleWave(wf, cyc * 1.0) +
          fifth * evalSimpleWave(wf, cyc * 1.498) +
          octUp * evalSimpleWave(wf, cyc * 2.0);
        samples.push((sum / totalWeight) * 1.25);
      }

      return {
        title: 'Sub & Harmonic Stack',
        readout: `S1 ${Math.round(s1 * 100)}% · Fnd ${Math.round(fund * 100)}% · +5th ${Math.round(fifth * 100)}%`,
        kind: 'wave',
        primaryPath: samplesToPath(samples, Math.max(0.25, Math.min(1, gain))),
        gridMode: 'bipolar',
        accent: 'amber',
      };
    }

    case 'physicalString': {
      const excitation = String(p.excitation ?? 'pluck');
      const bowPos = clamp(Number(p.bowPosition ?? 0.14), 0.04, 0.48);
      const bowPres = clamp(Number(p.bowPressure ?? 0.56), 0.05, 1);
      const damping = clamp(Number(p.damping ?? 0.45), 0.05, 0.98);
      const brightness = clamp(Number(p.brightness ?? 0.72), 0.1, 1);
      const rosin = clamp(Number(p.rosin ?? 0.32), 0, 1);
      const symp = clamp(Number(p.sympathetic ?? 0), 0, 1);

      const samples: number[] = [];
      let peak = 1e-4;
      for (let i = 0; i < N; i++) {
        const theta = (i / N) * Math.PI * 2;
        let sum = 0;
        const maxH = 14;
        for (let k = 1; k <= maxH; k++) {
          // Pluck/bow contact point comb zeroes: sin(k * pi * bowPos)
          const posFactor = Math.sin(k * Math.PI * bowPos);
          const rolloff = Math.pow(1 - damping * 0.75, k - 1) * (0.35 + brightness * 0.85);
          const harmonicAmp =
            excitation === 'bow'
              ? (posFactor / k) * rolloff * (0.7 + bowPres * 0.6)
              : excitation === 'hammer'
                ? (posFactor / Math.pow(k, 1.45)) * rolloff
                : (posFactor / Math.pow(k, 1.15)) * rolloff;
          sum += harmonicAmp * Math.sin(k * theta);
        }
        if (symp > 0.02) {
          sum = sum * (1 - symp * 0.3) + Math.tanh(sum * (1 + symp * 3)) * symp * 0.35;
        }
        if (rosin > 0.02 && excitation === 'bow') {
          sum += Math.sin(i * 19.3) * Math.cos(i * 7.7) * rosin * 0.06;
        }
        samples.push(sum);
        if (Math.abs(sum) > peak) peak = Math.abs(sum);
      }
      const norm = samples.map((s) => (s / peak) * 0.9);
      return {
        title: 'String Waveguide Cycle',
        readout: `${excitation} · Pos ${Math.round(bowPos * 100)}% · Damp ${Math.round(damping * 100)}%`,
        kind: 'wave',
        primaryPath: samplesToPath(norm),
        gridMode: 'bipolar',
        accent: 'amber',
      };
    }

    case 'modalResonator': {
      const material = String(p.material ?? 'bell');
      const inharm = clamp(Number(p.inharmonicity ?? 0.15), 0, 1);
      const brightness = clamp(Number(p.brightness ?? 0.65), 0.05, 1);
      const damping = clamp(Number(p.damping ?? 0.45), 0.02, 0.98);
      const decay = clamp(Number(p.decay ?? 1.4), 0.08, 8);

      const profiles: Record<string, number[]> = {
        marimba: [1, 3.98, 9.2, 13.8, 19.2, 24.5, 31.1, 38.0],
        bell: [0.5, 1, 1.2, 1.5, 2.0, 2.52, 3.04, 4.18],
        kalimba: [1, 2.94, 5.4, 8.8, 12.6, 17.1, 22.0, 27.5],
        steelDrum: [1, 2.0, 2.98, 3.95, 4.6, 5.8, 6.7, 7.9],
        plate: [1, 1.59, 2.14, 2.65, 3.18, 3.85, 4.42, 5.2],
        harmonic: [1, 2, 3, 4, 5, 6, 7, 8],
      };
      const ratios = profiles[material] ?? profiles.bell;
      const bars = ratios.map((r, idx) => {
        const stretched = r * (1 + inharm * 0.35 * idx * 0.2);
        const amp = Math.pow(brightness, idx * 0.45) * Math.pow(1 - damping * 0.6, idx * 0.35);
        return {
          x: 8 + idx * 31,
          w: 22,
          h: clamp(amp, 0.06, 1),
          label: `${stretched.toFixed(1)}x`,
        };
      });

      return {
        title: '8-Mode Partial Spectrum',
        readout: `${material} · ${decay.toFixed(1)}s decay`,
        kind: 'bars',
        primaryPath: '',
        bars,
        gridMode: 'unipolar',
        accent: 'amber',
      };
    }

    case 'blownPipe': {
      const bore = String(p.boreType ?? 'flute');
      const pressure = clamp(Number(p.breathPressure ?? 0.65), 0.1, 1.2);
      const emb = clamp(Number(p.embouchure ?? 0.55), 0.05, 1);
      const chiff = clamp(Number(p.breathNoise ?? 0.25), 0, 1);
      const damping = clamp(Number(p.damping ?? 0.38), 0.05, 0.95);
      const overblow = clamp(Number(p.overblow ?? 0), 0, 1);

      const samples: number[] = [];
      let peak = 1e-4;
      for (let i = 0; i < N; i++) {
        const th = (i / N) * Math.PI * 2;
        let s = 0;
        if (bore === 'clarinet') {
          s =
            Math.sin(th) +
            0.48 * Math.sin(3 * th) * (1 - damping * 0.5) +
            0.22 * emb * Math.sin(5 * th) +
            overblow * 0.5 * Math.sin(3 * th);
          s = Math.tanh(s * (0.9 + pressure * 0.9));
        } else if (bore === 'reed') {
          s =
            Math.sin(th) +
            0.65 * Math.sin(2 * th) +
            0.42 * emb * Math.sin(3 * th) +
            0.24 * (1 - damping * 0.6) * Math.sin(4 * th);
          s = Math.tanh(s * (0.8 + pressure * 0.85));
        } else if (bore === 'organPipe') {
          s =
            Math.sin(th) +
            0.4 * Math.sin(2 * th) +
            0.2 * Math.sin(3 * th) +
            overblow * 0.45 * Math.sin(2 * th);
        } else {
          // flute
          s =
            Math.sin(th) * (1 - overblow * 0.35) +
            (0.28 + emb * 0.3 + overblow * 0.65) * Math.sin(2 * th) +
            0.12 * (1 - damping) * Math.sin(3 * th);
          s = Math.tanh(s * (0.7 + pressure * 0.7));
        }
        if (chiff > 0.01) {
          s += Math.sin(i * 15.7) * Math.cos(i * 6.3) * chiff * 0.09;
        }
        samples.push(s);
        if (Math.abs(s) > peak) peak = Math.abs(s);
      }
      return {
        title: 'Air-Column Bore Cycle',
        readout: `${bore} · Pres ${Math.round(pressure * 100)}% · Emb ${Math.round(emb * 100)}%`,
        kind: 'wave',
        primaryPath: samplesToPath(samples.map((v) => (v / peak) * 0.88)),
        gridMode: 'bipolar',
        accent: 'amber',
      };
    }

    case 'noise': {
      const tone = clamp(Number(p.tone ?? 2200), 200, 9000);
      const q = clamp(Number(p.q ?? 1.8), 0.4, 12);
      const color = String(p.color ?? 'pink');
      const gain = clamp(Number(p.gain ?? 0.2), 0, 1);

      const minLog = Math.log10(20);
      const maxLog = Math.log10(20000);
      const pts: string[] = [];
      for (let i = 0; i <= 72; i++) {
        const f = Math.pow(10, minLog + (i / 72) * (maxLog - minLog));
        let db = biquadMagDb('bandpass', f, tone, q, 0);
        if (color === 'pink') {
          db -= 3 * Math.log2(Math.max(1, f / 250));
        }
        db += (gain - 0.5) * 8;
        const x = (i / 72) * W;
        const y = clamp(MID - (db / 24) * (MID - 8), 6, H - 6);
        pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
      }
      const cutoffX = ((Math.log10(tone) - minLog) / (maxLog - minLog)) * W;
      return {
        title: 'Noise Filter Spectrum',
        readout: `${color} · ${Math.round(tone)} Hz · Q ${q.toFixed(1)}`,
        kind: 'freq',
        primaryPath: pts.join(' '),
        markers: [{ x: cutoffX, y: MID }],
        gridMode: 'freq',
        accent: 'amber',
      };
    }

    case 'filter': {
      const mode = String(p.mode ?? 'lowpass') as
        | 'lowpass'
        | 'highpass'
        | 'bandpass'
        | 'notch'
        | 'peaking';
      const cutoff = clamp(Number(p.cutoff ?? 3200), 80, 16000);
      const q = clamp(Number(p.resonance ?? 2.2), 0.3, 18);
      const gainDb = clamp(Number(p.gain ?? 6), -12, 18);

      const minLog = Math.log10(20);
      const maxLog = Math.log10(20000);
      const pts: string[] = [];
      for (let i = 0; i <= 80; i++) {
        const f = Math.pow(10, minLog + (i / 80) * (maxLog - minLog));
        const db = biquadMagDb(mode, f, cutoff, q, gainDb);
        const x = (i / 80) * W;
        const y = clamp(MID - (db / 24) * (MID - 8), 5, H - 5);
        pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
      }
      const cutoffX = ((Math.log10(cutoff) - minLog) / (maxLog - minLog)) * W;
      return {
        title: 'Filter Frequency Response',
        readout: `${mode} · ${cutoff >= 1000 ? `${(cutoff / 1000).toFixed(2)}k` : Math.round(cutoff)} Hz · Q ${q.toFixed(1)}`,
        kind: 'freq',
        primaryPath: pts.join(' '),
        markers: [{ x: cutoffX, y: MID }],
        gridMode: 'freq',
        accent: 'cyan',
      };
    }

    case 'parametricEq': {
      const lowF = Number(p.lowFreq ?? 180);
      const lowG = Number(p.lowGain ?? 2.5);
      const m1F = Number(p.mid1Freq ?? 420);
      const m1G = Number(p.mid1Gain ?? 5.0);
      const m1Q = Number(p.mid1Q ?? 2.2);
      const m2F = Number(p.mid2Freq ?? 2400);
      const m2G = Number(p.mid2Gain ?? 4.5);
      const m2Q = Number(p.mid2Q ?? 2.4);
      const highF = Number(p.highFreq ?? 5200);
      const highG = Number(p.highGain ?? -2.0);
      const outG = Number(p.outputGain ?? 1.0);
      const trimDb = 20 * Math.log10(Math.max(0.1, outG));

      const minLog = Math.log10(20);
      const maxLog = Math.log10(20000);
      const pts: string[] = [];
      for (let i = 0; i <= 84; i++) {
        const f = Math.pow(10, minLog + (i / 84) * (maxLog - minLog));
        const db =
          biquadMagDb('lowshelf', f, lowF, 0.7, lowG) +
          biquadMagDb('peaking', f, m1F, m1Q, m1G) +
          biquadMagDb('peaking', f, m2F, m2Q, m2G) +
          biquadMagDb('highshelf', f, highF, 0.7, highG) +
          trimDb;
        const x = (i / 84) * W;
        const y = clamp(MID - (db / 18) * (MID - 8), 5, H - 5);
        pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
      }
      return {
        title: '4-Band Acoustic EQ Curve',
        readout: `B1 ${Math.round(m1F)}Hz · B2 ${(m2F / 1000).toFixed(1)}kHz`,
        kind: 'freq',
        primaryPath: pts.join(' '),
        gridMode: 'freq',
        accent: 'cyan',
      };
    }

    case 'formantFilter': {
      const vowel = clamp(Number(p.vowel ?? 0.5), 0, 4);
      const shift = clamp(Number(p.shift ?? 0), -12, 12);
      const q = clamp(Number(p.resonance ?? 7.5), 2, 22);
      const spread = clamp(Number(p.spread ?? 1), 0.5, 1.6);
      const mix = clamp(Number(p.mix ?? 0.9), 0, 1);

      const i0 = Math.min(3, Math.floor(vowel));
      const i1 = Math.min(4, i0 + 1);
      const frac = vowel - i0;
      const r0 = FORMANT_VOWELS[i0];
      const r1 = FORMANT_VOWELS[i1];
      const shiftMul = Math.pow(2, shift / 12);
      const f1 = (r0.f1 * (1 - frac) + r1.f1 * frac) * shiftMul;
      const f2 = (r0.f2 * (1 - frac) + r1.f2 * frac) * shiftMul * spread;
      const f3 = (r0.f3 * (1 - frac) + r1.f3 * frac) * shiftMul * (0.5 + spread * 0.5);

      const minLog = Math.log10(80);
      const maxLog = Math.log10(6000);
      const pts: string[] = [];
      for (let i = 0; i <= 80; i++) {
        const f = Math.pow(10, minLog + (i / 80) * (maxLog - minLog));
        const res1 = (r0.g1 * (1 - frac) + r1.g1 * frac) / (1 + Math.pow(((f - f1) / f1) * q, 2));
        const res2 = (r0.g2 * (1 - frac) + r1.g2 * frac) / (1 + Math.pow(((f - f2) / f2) * q, 2));
        const res3 = (r0.g3 * (1 - frac) + r1.g3 * frac) / (1 + Math.pow(((f - f3) / f3) * q, 2));
        const mag = clamp((1 - mix) * 0.35 + mix * (res1 + res2 + res3), 0, 1.35);
        const x = (i / 80) * W;
        const y = clamp(H - 8 - (mag / 1.25) * (H - 16), 6, H - 8);
        pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
      }
      const f1x = clamp(((Math.log10(f1) - minLog) / (maxLog - minLog)) * W, 4, W - 4);
      const f2x = clamp(((Math.log10(f2) - minLog) / (maxLog - minLog)) * W, 4, W - 4);
      const f3x = clamp(((Math.log10(f3) - minLog) / (maxLog - minLog)) * W, 4, W - 4);
      return {
        title: 'Vocal Tract Formants (F1–F3)',
        readout: `${getFormantVowelName(vowel)} · Shift ${shift > 0 ? `+${shift}` : shift}st · Q ${q.toFixed(1)}`,
        kind: 'freq',
        primaryPath: pts.join(' '),
        markers: [
          { x: f1x, y: 14, label: 'F1' },
          { x: f2x, y: 14, label: 'F2' },
          { x: f3x, y: 14, label: 'F3' },
        ],
        gridMode: 'unipolar',
        accent: 'cyan',
      };
    }

    case 'combFilter': {
      const mode = String(p.mode ?? 'feedback');
      const keyTrack = Boolean(p.keyTrack ?? true);
      const ratio = clamp(Number(p.ratio ?? 0.15), 0.05, 4);
      const delayMs = clamp(Number(p.delayMs ?? 4.5), 0.4, 45);
      const fb = clamp(Number(p.feedback ?? 0.56), -0.92, 0.92);
      const damping = clamp(Number(p.damping ?? 0.42), 0, 0.95);
      const mix = clamp(Number(p.mix ?? 0.45), 0, 1);

      // Reference f0 = 220 Hz when keyTrack is on
      const tau = keyTrack ? ratio / 220 : delayMs / 1000;
      const pts: string[] = [];
      for (let i = 0; i <= 96; i++) {
        const freq = 60 + (i / 96) * 3200;
        const omegaTau = 2 * Math.PI * freq * tau;
        const dampMul = Math.max(0.1, 1 - damping * 0.65 * (freq / 3260));
        const g = fb * dampMul;
        const c = Math.cos(omegaTau);
        const s = Math.sin(omegaTau);

        let wetMag = 1;
        if (mode === 'feedforward') {
          wetMag = 0.5 * Math.sqrt((1 + g * c) * (1 + g * c) + g * s * (g * s));
        } else if (mode === 'bipolar') {
          const den = Math.max(0.06, (1 + g * c) * (1 + g * c) + g * s * (g * s));
          wetMag = 0.6 * Math.sqrt(1 / den);
        } else {
          const den = Math.max(0.06, (1 - g * c) * (1 - g * c) + g * s * (g * s));
          wetMag = 0.6 * Math.sqrt(1 / den);
        }
        const total = clamp((1 - mix) * 0.7 + mix * wetMag, 0, 2.2);
        const x = (i / 96) * W;
        const y = clamp(H - 8 - (total / 2.0) * (H - 16), 5, H - 8);
        pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
      }
      return {
        title: 'Comb Harmonic Teeth',
        readout: `${mode} · ${keyTrack ? `${ratio.toFixed(2)}x` : `${delayMs.toFixed(1)}ms`} · FB ${Math.round(fb * 100)}%`,
        kind: 'freq',
        primaryPath: pts.join(' '),
        gridMode: 'unipolar',
        accent: 'cyan',
      };
    }

    case 'wavefolder': {
      const folds = clamp(Number(p.folds ?? 2.4), 1, 8);
      const sym = clamp(Number(p.symmetry ?? 0), -0.6, 0.6);
      const stages = Math.round(clamp(Number(p.stages ?? 2), 1, 4));
      const postTone = clamp(Number(p.postTone ?? 7200), 600, 15000);
      const mix = clamp(Number(p.mix ?? 0.85), 0, 1);

      const inputSamples: number[] = [];
      const rawOut: number[] = [];
      for (let i = 0; i < N; i++) {
        const x = Math.sin((i / N) * Math.PI * 2);
        inputSamples.push(x);
        let v = (x + sym) * folds;
        for (let s = 0; s < stages; s++) {
          v = Math.sin(v * (Math.PI / 2));
        }
        const folded = Math.tanh(v * 1.15);
        rawOut.push(folded);
      }
      // Subtle 1-pole postTone smoothing approximation
      const alpha = clamp(postTone / 15000, 0.12, 1);
      const outSamples: number[] = [];
      let lp = rawOut[N - 1] ?? 0;
      for (let i = 0; i < N; i++) {
        lp += alpha * (rawOut[i] - lp);
        outSamples.push(inputSamples[i] * (1 - mix) + lp * mix * 0.92);
      }
      return {
        title: 'Wavefolded Output Cycle',
        readout: `${folds.toFixed(1)}x · ${stages} stg · Sym ${sym >= 0 ? '+' : ''}${sym.toFixed(2)}`,
        kind: 'wave',
        primaryPath: samplesToPath(outSamples),
        referencePath: samplesToPath(inputSamples, 0.85),
        gridMode: 'bipolar',
        accent: 'cyan',
      };
    }

    case 'shaper': {
      const drive = clamp(Number(p.drive ?? 0.25), 0, 1);
      const asym = clamp(Number(p.asymmetry ?? 0.15), 0, 0.6);
      const mix = clamp(Number(p.mix ?? 0.6), 0, 1);

      const inSamples: number[] = [];
      const outSamples: number[] = [];
      for (let i = 0; i < N; i++) {
        const x = Math.sin((i / N) * Math.PI * 2);
        inSamples.push(x);
        const shaped = Math.tanh((x + asym * x * x) * (1 + drive * 6.5)) - Math.tanh(asym * 0.4);
        outSamples.push(x * (1 - mix) + shaped * mix);
      }
      return {
        title: 'Warmth Saturation Output',
        readout: `Drive ${Math.round(drive * 100)}% · Even ${Math.round(asym * 100)}% · Mix ${Math.round(mix * 100)}%`,
        kind: 'wave',
        primaryPath: samplesToPath(outSamples),
        referencePath: samplesToPath(inSamples, 0.85),
        gridMode: 'bipolar',
        accent: 'cyan',
      };
    }

    case 'ringMod': {
      const mode = String(p.mode ?? 'ring');
      const wf = String(p.waveform ?? 'sine');
      const ratio = clamp(Number(p.ratio ?? 1.41), 0.125, 8);
      const drive = clamp(Number(p.drive ?? 1), 0.3, 2.5);
      const mix = clamp(Number(p.mix ?? 0.75), 0, 1);

      const inSamples: number[] = [];
      const outSamples: number[] = [];
      for (let i = 0; i < N; i++) {
        const t = (i / N) * 2; // 2 carrier cycles
        const c = Math.sin(t * Math.PI * 2);
        const m = evalSimpleWave(wf, t * ratio) * drive;
        inSamples.push(c);
        const wet =
          mode === 'am'
            ? c * (0.5 + 0.5 * Math.tanh(m))
            : mode === 'rectified'
              ? c * (m > 0 ? m : 0)
              : c * m;
        outSamples.push(c * (1 - mix) + Math.tanh(wet) * mix);
      }
      return {
        title: 'Ring / AM Modulated Output',
        readout: `${mode.toUpperCase()} · Ratio ${ratio.toFixed(2)}x · Mix ${Math.round(mix * 100)}%`,
        kind: 'wave',
        primaryPath: samplesToPath(outSamples),
        referencePath: samplesToPath(inSamples, 0.75),
        gridMode: 'bipolar',
        accent: 'cyan',
      };
    }

    case 'bitcrusher': {
      const bits = clamp(Number(p.bits ?? 8), 2, 16);
      const downsample = Math.max(1, Math.round(Number(p.downsample ?? 4)));
      const dither = clamp(Number(p.dither ?? 0.12), 0, 1);
      const mix = clamp(Number(p.mix ?? 0.8), 0, 1);

      const levels = Math.pow(2, Math.min(bits, 10) - 1);
      const inSamples: number[] = [];
      const outSamples: number[] = [];
      let held = 0;
      for (let i = 0; i < N; i++) {
        const x = Math.sin((i / N) * Math.PI * 2);
        inSamples.push(x);
        if (i % downsample === 0) {
          const noise = dither > 0 ? (Math.sin(i * 43.17) * 0.5) * (dither / levels) : 0;
          held = Math.round((x + noise) * levels) / levels;
        }
        outSamples.push(x * (1 - mix) + held * mix);
      }
      return {
        title: 'Bitcrushed Staircase Wave',
        readout: `${bits.toFixed(1)} bit · Hold ${downsample}x · Mix ${Math.round(mix * 100)}%`,
        kind: 'wave',
        primaryPath: samplesToPath(outSamples),
        referencePath: samplesToPath(inSamples, 0.8),
        gridMode: 'bipolar',
        accent: 'cyan',
      };
    }

    case 'envelope': {
      const a = clamp(Number(p.attack ?? 0.015), 0.002, 12);
      const d = clamp(Number(p.decay ?? 0.35), 0.01, 12);
      const s = clamp(Number(p.sustain ?? 0.65), 0, 1);
      const r = clamp(Number(p.release ?? 0.45), 0.01, 16);
      const curve = String(p.curve ?? 'standard');

      // Log-compressed time allocation so both snappy (5ms) and pad (8s) envelopes read cleanly
      const segA = Math.max(12, Math.pow(a / 12, 0.42) * 76);
      const segD = Math.max(14, Math.pow(d / 12, 0.42) * 76);
      const segHold = 42;
      const segR = Math.max(16, Math.pow(r / 16, 0.42) * 80);
      const totalSeg = segA + segD + segHold + segR;

      const xA = (segA / totalSeg) * W;
      const xD = ((segA + segD) / totalSeg) * W;
      const xS = ((segA + segD + segHold) / totalSeg) * W;
      const topY = 8;
      const baseY = H - 8;
      const susY = baseY - s * (baseY - topY);

      const pts: string[] = [`M 0 ${baseY}`];
      const steps = 16;
      for (let i = 1; i <= steps; i++) {
        const u = i / steps;
        const shaped = curve === 'ambient' ? u * u * (3 - 2 * u) : Math.pow(u, 0.72);
        pts.push(`L ${(u * xA).toFixed(1)} ${(baseY - shaped * (baseY - topY)).toFixed(1)}`);
      }
      for (let i = 1; i <= steps; i++) {
        const u = i / steps;
        const shaped = 1 - Math.pow(1 - u, 1.8);
        const y = topY + shaped * (susY - topY);
        pts.push(`L ${(xA + u * (xD - xA)).toFixed(1)} ${y.toFixed(1)}`);
      }
      pts.push(`L ${xS.toFixed(1)} ${susY.toFixed(1)}`);
      for (let i = 1; i <= steps; i++) {
        const u = i / steps;
        const shaped = 1 - Math.pow(1 - u, 1.85);
        const y = susY + shaped * (baseY - susY);
        pts.push(`L ${(xS + u * (W - xS)).toFixed(1)} ${y.toFixed(1)}`);
      }
      const linePath = pts.join(' ');
      const fillPath = `${linePath} L ${W} ${baseY} L 0 ${baseY} Z`;

      const fmtSec = (sec: number) => (sec < 1 ? `${Math.round(sec * 1000)}ms` : `${sec.toFixed(1)}s`);
      return {
        title: 'ADSR Envelope Contour',
        readout: `A ${fmtSec(a)} · D ${fmtSec(d)} · S ${Math.round(s * 100)}% · R ${fmtSec(r)}`,
        kind: 'contour',
        primaryPath: linePath,
        fillPath,
        markers: [
          { x: xA, y: topY },
          { x: xD, y: susY },
          { x: xS, y: susY },
        ],
        gridMode: 'unipolar',
        accent: 'cyan',
      };
    }

    case 'slopeEnv': {
      const mode = String(p.mode ?? 'oneShot');
      const rise = clamp(Number(p.rise ?? 0.04), 0.002, 6);
      const fall = clamp(Number(p.fall ?? 0.45), 0.005, 8);
      const shape = clamp(Number(p.shape ?? 0.35), -1, 1);
      const depth = clamp(Number(p.depth ?? 0.85), 0, 1.5);
      const bipolar = Boolean(p.bipolar ?? false);

      const expPow = Math.pow(2, shape * 1.4);
      const rW = Math.max(20, (Math.pow(rise / 6, 0.45) / (Math.pow(rise / 6, 0.45) + Math.pow(fall / 8, 0.45))) * W);
      const baseY = bipolar ? MID : H - 8;
      const peakY = baseY - clamp(depth, 0.15, 1.15) * (bipolar ? MID - 8 : H - 18);

      const pts: string[] = [`M 0 ${baseY.toFixed(1)}`];
      const steps = 20;
      for (let i = 1; i <= steps; i++) {
        const u = i / steps;
        const curved = Math.pow(u, expPow);
        pts.push(`L ${(u * rW).toFixed(1)} ${(baseY - curved * (baseY - peakY)).toFixed(1)}`);
      }
      for (let i = 1; i <= steps; i++) {
        const u = i / steps;
        const curved = Math.pow(1 - u, expPow);
        const yEnd = bipolar ? MID + (baseY - peakY) : baseY;
        const y = yEnd - curved * (yEnd - peakY);
        pts.push(`L ${(rW + u * (W - rW)).toFixed(1)} ${y.toFixed(1)}`);
      }
      return {
        title: 'Function Slope Contour',
        readout: `${mode} · Rise ${rise < 1 ? `${Math.round(rise * 1000)}ms` : `${rise.toFixed(1)}s`} · Fall ${fall < 1 ? `${Math.round(fall * 1000)}ms` : `${fall.toFixed(1)}s`}`,
        kind: 'contour',
        primaryPath: pts.join(' '),
        gridMode: bipolar ? 'bipolar' : 'unipolar',
        accent: 'cyan',
      };
    }

    case 'lfo': {
      const wf = String(p.waveform ?? 'sine');
      const rate = clamp(Number(p.rate ?? 5.2), 0.02, 24);
      const depth = clamp(Number(p.depth ?? 0.35), 0, 1);
      const delay = clamp(Number(p.delay ?? 0.18), 0, 6);

      const samples: number[] = [];
      for (let i = 0; i < N; i++) {
        const t = i / N;
        const cyc = t * 2.5;
        let v = 0;
        if (wf === 'sharpVibrato') {
          const s = Math.sin(cyc * Math.PI * 2);
          v = Math.sign(s) * Math.pow(Math.abs(s), 0.55);
        } else if (wf === 'wander') {
          v =
            0.55 * Math.sin(cyc * Math.PI * 2) +
            0.3 * Math.sin(cyc * Math.PI * 2 * 1.618 + 0.8) +
            0.15 * Math.cos(cyc * Math.PI * 2 * 2.71);
        } else {
          v = evalSimpleWave(wf, cyc);
        }
        const env = delay > 0.05 ? Math.min(1, t / clamp(delay / 3, 0.08, 0.65)) : 1;
        samples.push(v * depth * env);
      }
      return {
        title: 'LFO Modulation Cycle',
        readout: `${wf} · ${rate.toFixed(2)} Hz · Depth ${Math.round(depth * 100)}%`,
        kind: 'wave',
        primaryPath: samplesToPath(samples),
        gridMode: 'bipolar',
        accent: 'cyan',
      };
    }

    case 'sampleHold': {
      const sourceMode = String(p.sourceMode ?? 'random');
      const rate = clamp(Number(p.rate ?? 4.5), 0.2, 30);
      const slew = clamp(Number(p.slew ?? 0.15), 0, 1);
      const depth = clamp(Number(p.depth ?? 0.65), 0, 1.5);
      const unipolar = Boolean(p.unipolar ?? false);

      const numSteps = 10;
      const seqVals = Array.from({ length: numSteps }, (_, idx) => {
        const raw = Math.sin(idx * 2.39996 + 0.7) * Math.cos(idx * 1.13);
        const quantized = Math.round(raw * 4) / 4;
        const val = sourceMode === 'quantized' ? quantized : raw;
        return unipolar ? (val * 0.5 + 0.5) * depth : val * depth;
      });
      const samples: number[] = [];
      let current = seqVals[0];
      const alpha = slew <= 0.01 ? 1 : clamp(1 - slew * 0.88, 0.05, 1);
      for (let i = 0; i < N; i++) {
        const target = seqVals[Math.min(numSteps - 1, Math.floor((i / N) * numSteps))];
        current += alpha * (target - current);
        samples.push(unipolar ? current * 1.4 - 0.7 : current);
      }
      return {
        title: 'Sample & Hold + Slew CV',
        readout: `${sourceMode} · ${rate.toFixed(1)} Hz · Slew ${Math.round(slew * 100)}%`,
        kind: 'wave',
        primaryPath: samplesToPath(samples),
        gridMode: unipolar ? 'unipolar' : 'bipolar',
        accent: 'cyan',
      };
    }

    case 'stepSequencer': {
      const stepsCount = Math.round(clamp(Number(p.steps ?? 8), 2, 8));
      const glide = clamp(Number(p.glide ?? 0.08), 0, 1);
      const depth = clamp(Number(p.depth ?? 0.7), 0, 1.5);
      const vals = Array.from({ length: stepsCount }, (_, i) =>
        clamp(Number(p[`step${i + 1}`] ?? 0) * depth, -1.2, 1.2)
      );

      const samples: number[] = [];
      let cur = vals[0];
      const alpha = glide <= 0.01 ? 1 : clamp(1 - glide * 0.9, 0.04, 1);
      for (let i = 0; i < N; i++) {
        const target = vals[Math.min(stepsCount - 1, Math.floor((i / N) * stepsCount))];
        cur += alpha * (target - cur);
        samples.push(cur);
      }
      const stepW = (W - 16) / stepsCount;
      const bars = vals.map((v, i) => ({
        x: 8 + i * stepW + 2,
        w: Math.max(6, stepW - 4),
        h: clamp(Math.abs(v), 0.04, 1),
        negative: v < 0,
      }));
      return {
        title: `Step Sequencer (${stepsCount} Steps)`,
        readout: `${Number(p.rate ?? 4).toFixed(1)} Hz · Glide ${Math.round(glide * 100)}%`,
        kind: 'wave',
        primaryPath: samplesToPath(samples),
        bars,
        gridMode: 'bipolar',
        accent: 'cyan',
      };
    }

    case 'envFollower': {
      const atk = clamp(Number(p.attackMs ?? 8), 1, 250);
      const rel = clamp(Number(p.releaseMs ?? 140), 10, 1500);
      const sens = clamp(Number(p.sensitivity ?? 1.5), 0.2, 4);
      const depth = clamp(Number(p.depth ?? 1), 0, 1.5);
      const invert = Boolean(p.invert ?? false);

      const burst: number[] = [];
      const env: number[] = [];
      let cur = 0;
      const atkCoeff = clamp(1 - Math.pow(atk / 250, 0.5) * 0.75, 0.15, 0.95);
      const relCoeff = clamp(1 - Math.pow(rel / 1500, 0.45) * 0.92, 0.03, 0.6);
      for (let i = 0; i < N; i++) {
        const t = i / N;
        const amp = t > 0.12 && t < 0.42 ? Math.sin(((t - 0.12) / 0.3) * Math.PI) : 0;
        const aud = amp * Math.sin(t * 28 * Math.PI);
        burst.push(aud * 0.7);
        const rect = Math.min(1, Math.abs(aud) * sens);
        cur += (rect > cur ? atkCoeff : relCoeff) * (rect - cur);
        const out = invert ? 1 - cur : cur;
        env.push(out * depth);
      }
      const envPath = env
        .map((v, i) => {
          const x = (i / (N - 1)) * W;
          const y = clamp(H - 8 - clamp(v, 0, 1.15) * (H - 18), 6, H - 8);
          return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(' ');
      return {
        title: 'Envelope Follower Response',
        readout: `Atk ${Math.round(atk)}ms · Rel ${Math.round(rel)}ms${invert ? ' · Duck' : ''}`,
        kind: 'contour',
        primaryPath: envPath,
        referencePath: samplesToPath(burst, 0.65),
        gridMode: 'unipolar',
        accent: 'cyan',
      };
    }

    case 'crossfader': {
      const bal = clamp(Number(p.balance ?? 0.5), 0, 1);
      const curve = String(p.curve ?? 'equalPower');
      const gA = clamp(Number(p.gainA ?? 1), 0, 1.5);
      const gB = clamp(Number(p.gainB ?? 1), 0, 1.5);
      const outG = clamp(Number(p.outputGain ?? 1), 0, 1.5);

      let wA = 1 - bal;
      let wB = bal;
      if (curve === 'equalPower') {
        wA = Math.cos(bal * (Math.PI / 2));
        wB = Math.sin(bal * (Math.PI / 2));
      } else if (curve === 'blendSum') {
        wA = Math.min(1, (1 - bal) * 2);
        wB = Math.min(1, bal * 2);
      }

      const samples: number[] = [];
      for (let i = 0; i < N; i++) {
        const t = i / N;
        const sigA = Math.sin(t * Math.PI * 2);
        const sigB = 1 - 2 * ((t * 2) % 1);
        samples.push((sigA * gA * wA + sigB * gB * wB) * outG * 0.72);
      }
      return {
        title: 'A ↔ B Crossfade Blend',
        readout: `A ${Math.round(wA * 100)}% · B ${Math.round(wB * 100)}% (${curve})`,
        kind: 'wave',
        primaryPath: samplesToPath(samples),
        gridMode: 'bipolar',
        accent: 'cyan',
      };
    }

    case 'quantizer': {
      const scale = String(p.scale ?? 'pentatonicMinor');
      const octaves = clamp(Number(p.octaves ?? 1), 0.25, 3);
      const glideMs = clamp(Number(p.glideMs ?? 0), 0, 120);
      const scaleMap: Record<string, number[]> = {
        pentatonicMinor: [0, 3, 5, 7, 10],
        pentatonicMajor: [0, 2, 4, 7, 9],
        major: [0, 2, 4, 5, 7, 9, 11],
        minor: [0, 2, 3, 5, 7, 8, 10],
        dorian: [0, 2, 3, 5, 7, 9, 10],
        phrygianDom: [0, 1, 4, 5, 7, 8, 10],
        wholeTone: [0, 2, 4, 6, 8, 10],
        fifths: [0, 7],
        chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      };
      const degrees = scaleMap[scale] ?? scaleMap.pentatonicMinor;
      const totalSt = 12 * octaves;
      const pts: string[] = [];
      const refPts: string[] = [];
      let curY = H - 10;
      const alpha = glideMs <= 1 ? 1 : clamp(1 - glideMs / 135, 0.08, 1);

      for (let i = 0; i <= 80; i++) {
        const u = i / 80;
        const rawSt = u * totalSt;
        const oct = Math.floor(rawSt / 12);
        const rem = rawSt - oct * 12;
        let best = degrees[0];
        let bestD = 99;
        for (const d of degrees) {
          if (Math.abs(d - rem) < bestD) {
            bestD = Math.abs(d - rem);
            best = d;
          }
        }
        const quantSt = oct * 12 + best;
        const targetY = clamp(H - 10 - (quantSt / Math.max(12, totalSt)) * (H - 20), 8, H - 10);
        curY += alpha * (targetY - curY);
        const x = u * W;
        const ry = clamp(H - 10 - (rawSt / Math.max(12, totalSt)) * (H - 20), 8, H - 10);
        pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${curY.toFixed(1)}`);
        refPts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ry.toFixed(1)}`);
      }
      return {
        title: 'Pitch Quantizer Staircase',
        readout: `${scale} · ${octaves} oct · Glide ${Math.round(glideMs)}ms`,
        kind: 'contour',
        primaryPath: pts.join(' '),
        referencePath: refPts.join(' '),
        gridMode: 'unipolar',
        accent: 'cyan',
      };
    }

    case 'cvUtility': {
      const gainA = clamp(Number(p.gainA ?? 1), -2, 2);
      const offset = clamp(Number(p.offset ?? 0), -1, 1);
      const rectify = String(p.rectify ?? 'none');
      const inSamples: number[] = [];
      const outSamples: number[] = [];
      for (let i = 0; i < N; i++) {
        const x = Math.sin((i / N) * Math.PI * 4);
        inSamples.push(x * 0.65);
        let y = x * gainA + offset;
        if (rectify === 'half') y = Math.max(0, y);
        else if (rectify === 'full') y = Math.abs(y);
        else if (rectify === 'clamp01') y = clamp(y, 0, 1);
        outSamples.push(clamp(y * 0.65, -1.1, 1.1));
      }
      return {
        title: 'CV Shaping Transfer',
        readout: `GainA ${gainA.toFixed(2)}x · Bias ${offset >= 0 ? '+' : ''}${offset.toFixed(2)} · ${rectify}`,
        kind: 'wave',
        primaryPath: samplesToPath(outSamples),
        referencePath: samplesToPath(inSamples),
        gridMode: 'bipolar',
        accent: 'cyan',
      };
    }

    case 'busCompressor': {
      const thresh = clamp(Number(p.threshold ?? -16), -42, 0);
      const ratio = clamp(Number(p.ratio ?? 4), 1, 16);
      const knee = clamp(Number(p.knee ?? 12), 0, 30);
      const makeup = clamp(Number(p.makeup ?? 1.25), 0.5, 3);
      const mix = clamp(Number(p.mix ?? 0.85), 0, 1);
      const makeupDb = 20 * Math.log10(makeup);

      const pts: string[] = [];
      const refPts: string[] = [];
      for (let i = 0; i <= 60; i++) {
        const inDb = -48 + (i / 60) * 48;
        let compDb = inDb;
        if (knee > 0 && Math.abs(inDb - thresh) < knee / 2) {
          const delta = inDb - thresh + knee / 2;
          compDb = inDb + ((1 / ratio - 1) * delta * delta) / (2 * knee);
        } else if (inDb > thresh) {
          compDb = thresh + (inDb - thresh) / ratio;
        }
        const outDb = inDb * (1 - mix) + (compDb + makeupDb) * mix;
        const x = (i / 60) * W;
        const yOut = clamp(H - 8 - ((outDb + 48) / 54) * (H - 16), 5, H - 8);
        const yRef = clamp(H - 8 - ((inDb + 48) / 54) * (H - 16), 5, H - 8);
        pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${yOut.toFixed(1)}`);
        refPts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${yRef.toFixed(1)}`);
      }
      return {
        title: 'Compressor Transfer Curve',
        readout: `${thresh} dB · ${ratio.toFixed(1)}:1 · Makeup +${makeupDb.toFixed(1)} dB`,
        kind: 'contour',
        primaryPath: pts.join(' '),
        referencePath: refPts.join(' '),
        gridMode: 'unipolar',
        accent: 'amber',
      };
    }

    case 'delay': {
      const time = clamp(Number(p.time ?? 0.26), 0.02, 2);
      const fb = clamp(Number(p.feedback ?? 0.32), 0, 0.92);
      const mix = clamp(Number(p.mix ?? 0.22), 0, 1);
      const pingPong = clamp(Number(p.pingPong ?? 0.45), 0, 1);

      const taps = 8;
      const bars = Array.from({ length: taps }, (_, idx) => {
        const amp = idx === 0 ? 1 : Math.pow(fb, idx) * mix * 1.15;
        return {
          x: 10 + idx * 31,
          w: 16,
          h: clamp(amp, 0.03, 1),
          negative: idx % 2 === 1 && pingPong > 0.25,
        };
      });
      return {
        title: 'Stereo Echo Tap Decay',
        readout: `${Math.round(time * 1000)}ms · FB ${Math.round(fb * 100)}% · Mix ${Math.round(mix * 100)}%`,
        kind: 'bars',
        primaryPath: '',
        bars,
        gridMode: 'unipolar',
        accent: 'amber',
      };
    }

    case 'reverb': {
      const size = clamp(Number(p.size ?? 1.4), 0.2, 14);
      const preDelay = clamp(Number(p.preDelay ?? 16), 0, 250);
      const shimmer = clamp(Number(p.shimmerMix ?? 0), 0, 1);
      const freeze = Boolean(p.freeze ?? false);
      const mix = clamp(Number(p.mix ?? 0.28), 0, 1);

      const preX = (preDelay / 250) * 44;
      const baseY = H - 8;
      const topY = clamp(baseY - Math.max(0.2, mix) * (H - 20), 10, baseY - 12);
      const pts: string[] = [`M 0 ${baseY}`, `L ${preX.toFixed(1)} ${baseY}`, `L ${(preX + 6).toFixed(1)} ${topY.toFixed(1)}`];
      const decayRate = freeze ? 0.02 : 4.2 / Math.pow(size, 0.65);
      for (let i = 1; i <= 40; i++) {
        const u = i / 40;
        const x = preX + 6 + u * (W - preX - 6);
        const y = baseY - (baseY - topY) * Math.exp(-u * decayRate);
        pts.push(`L ${x.toFixed(1)} ${y.toFixed(1)}`);
      }
      const linePath = pts.join(' ');
      return {
        title: 'Reverb Tail Envelope',
        readout: `${size.toFixed(1)}s · Pre ${Math.round(preDelay)}ms${shimmer > 0.02 ? ` · Shim ${Math.round(shimmer * 100)}%` : ''}${freeze ? ' · FROZEN' : ''}`,
        kind: 'contour',
        primaryPath: linePath,
        fillPath: `${linePath} L ${W} ${baseY} L 0 ${baseY} Z`,
        gridMode: 'unipolar',
        accent: 'amber',
      };
    }

    case 'chorus': {
      const voices = Number(p.voices ?? 4);
      const rate = clamp(Number(p.rate ?? 0.42), 0.04, 4.5);
      const depth = clamp(Number(p.depth ?? 0.55), 0, 1);
      const mix = clamp(Number(p.mix ?? 0.52), 0, 1);
      const samples: number[] = [];
      const ref: number[] = [];
      for (let i = 0; i < N; i++) {
        const t = i / N;
        const dry = Math.sin(t * Math.PI * 2);
        ref.push(dry);
        let wet = 0;
        for (let v = 0; v < voices; v++) {
          const offset = ((v - (voices - 1) / 2) * depth * 0.16);
          wet += Math.sin((t + offset) * Math.PI * 2);
        }
        wet /= Math.max(1, voices);
        samples.push(dry * (1 - mix) + wet * mix);
      }
      return {
        title: 'Ensemble Phase Spread',
        readout: `${voices}-Tap · ${rate.toFixed(2)} Hz · Depth ${Math.round(depth * 100)}%`,
        kind: 'wave',
        primaryPath: samplesToPath(samples),
        referencePath: samplesToPath(ref, 0.7),
        gridMode: 'bipolar',
        accent: 'amber',
      };
    }

    case 'granularCloud': {
      const grainSize = clamp(Number(p.grainSize ?? 165), 20, 450);
      const density = clamp(Number(p.density ?? 11), 1, 24);
      const pitchShift = Number(p.pitchShift ?? 12);
      const freeze = Boolean(p.freeze ?? false);
      const mix = clamp(Number(p.mix ?? 0.55), 0, 1);

      const grainCount = Math.min(8, Math.max(2, Math.round(density / 3)));
      const grainW = clamp((grainSize / 450) * 110, 24, 110);
      const pts: string[] = [];
      for (let i = 0; i <= 80; i++) {
        const x = (i / 80) * W;
        let sum = 0;
        for (let g = 0; g < grainCount; g++) {
          const center = 22 + (g / Math.max(1, grainCount - 1)) * (W - 44);
          const dist = Math.abs(x - center);
          if (dist < grainW / 2) {
            sum += 0.5 * (1 + Math.cos((2 * Math.PI * dist) / grainW));
          }
        }
        const y = clamp(H - 8 - clamp(sum * (0.45 + mix * 0.45), 0, 1.3) * (H - 18), 6, H - 8);
        pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
      }
      return {
        title: 'Granular Window Cloud',
        readout: `${Math.round(grainSize)}ms · ${density}/s · ${pitchShift >= 0 ? `+${pitchShift}` : pitchShift}st${freeze ? ' · FROZEN' : ''}`,
        kind: 'contour',
        primaryPath: pts.join(' '),
        gridMode: 'unipolar',
        accent: 'amber',
      };
    }

    case 'phaser': {
      const mode = String(p.mode ?? 'phaser');
      const center = clamp(Number(p.centerFreq ?? 900), 120, 5000);
      const depth = clamp(Number(p.depth ?? 0.65), 0, 1);
      const fb = clamp(Number(p.feedback ?? 0.55), -0.88, 0.88);
      const mix = clamp(Number(p.mix ?? 0.6), 0, 1);
      const notches = mode === 'flanger' ? 7 : 3;

      const minLog = Math.log10(60);
      const maxLog = Math.log10(12000);
      const pts: string[] = [];
      for (let i = 0; i <= 84; i++) {
        const f = Math.pow(10, minLog + (i / 84) * (maxLog - minLog));
        const ratioLog = Math.log2(f / center);
        const ripple = Math.cos(ratioLog * Math.PI * notches);
        const mag = clamp(0.62 + mix * (0.32 * ripple + fb * 0.22 * depth * ripple), 0.08, 1.15);
        const x = (i / 84) * W;
        const y = clamp(H - 8 - mag * (H - 18), 6, H - 8);
        pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
      }
      return {
        title: mode === 'flanger' ? 'Flanger Comb Sweep' : '6-Stage Phaser Notches',
        readout: `${Math.round(center)} Hz · Depth ${Math.round(depth * 100)}% · FB ${Math.round(fb * 100)}%`,
        kind: 'freq',
        primaryPath: pts.join(' '),
        gridMode: 'freq',
        accent: 'amber',
      };
    }

    case 'output':
    default: {
      const gain = clamp(Number(p.gain ?? 0.82), 0, 1.5);
      const pan = clamp(Number(p.pan ?? 0), -1, 1);
      const samples = computeCarrierPreviewSamples('sine', {}, N).map((v) => v * gain * 0.82);
      return {
        title: 'Master Output Trim',
        readout: `Gain ${Math.round(gain * 100)}% · Pan ${pan === 0 ? 'Center' : pan < 0 ? `L${Math.round(-pan * 100)}` : `R${Math.round(pan * 100)}`}`,
        kind: 'wave',
        primaryPath: samplesToPath(samples),
        gridMode: 'bipolar',
        accent: 'amber',
      };
    }
  }
}

export const ModuleVisualizer: React.FC<ModuleVisualizerProps> = ({
  node,
  engine,
  theme = 'light',
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<'model' | 'live'>('model');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const model = useMemo(() => buildModuleVisual(node), [node]);

  // Live audio oscilloscope when viewMode === 'live'
  useEffect(() => {
    if (collapsed || viewMode !== 'live' || !engine) return;
    let rafId = 0;

    const draw = () => {
      const canvas = canvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      if (canvas && rect && rect.width > 4 && rect.height > 4) {
        const dpr = window.devicePixelRatio || 1;
        const tw = Math.floor(rect.width * dpr);
        const th = Math.floor(rect.height * dpr);
        if (canvas.width !== tw || canvas.height !== th) {
          canvas.width = tw;
          canvas.height = th;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);
          const cw = rect.width;
          const ch = rect.height;
          const isDark = theme === 'dark';

          ctx.fillStyle = isDark ? '#090D15' : '#F8FAFC';
          ctx.fillRect(0, 0, cw, ch);

          // Center axis
          ctx.strokeStyle = isDark ? 'rgba(51,65,85,0.55)' : 'rgba(203,213,225,0.9)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, ch / 2);
          ctx.lineTo(cw, ch / 2);
          ctx.stroke();

          const data = engine.getTimeDomainData();
          let trig = 0;
          for (let i = 1; i < Math.floor(data.length / 2); i++) {
            if (data[i - 1] < 0 && data[i] >= 0) {
              trig = i;
              break;
            }
          }

          ctx.strokeStyle =
            model.accent === 'cyan'
              ? isDark
                ? '#22D3EE'
                : '#0284C7'
              : isDark
                ? '#F59E0B'
                : '#D97706';
          ctx.lineWidth = 1.75;
          ctx.beginPath();
          const len = Math.min(256, data.length - trig);
          for (let i = 0; i < len; i++) {
            const x = (i / Math.max(1, len - 1)) * cw;
            const y = ch / 2 - clamp(data[trig + i], -1.1, 1.1) * (ch / 2 - 6);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.restore();
        }
      }
      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [collapsed, viewMode, engine, theme, model.accent]);

  const strokeClass =
    model.accent === 'cyan'
      ? 'stroke-cyan-600 dark:stroke-cyan-400'
      : 'stroke-amber-600 dark:stroke-amber-400';
  const fillClass =
    model.accent === 'cyan'
      ? 'fill-cyan-500/12 dark:fill-cyan-400/12'
      : 'fill-amber-500/12 dark:fill-amber-400/12';
  const readoutClass =
    model.accent === 'cyan'
      ? 'text-cyan-700 dark:text-cyan-300'
      : 'text-amber-700 dark:text-amber-400';

  return (
    <div className="bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-md p-2.5 space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <div className="min-w-0 flex items-center gap-1.5">
          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
            {viewMode === 'live' ? 'Live Synth Output' : model.title}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {engine && (
            <div className="inline-flex items-center rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111622] p-0.5">
              <button
                type="button"
                onClick={() => {
                  setCollapsed(false);
                  setViewMode('model');
                }}
                className={`px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors ${
                  viewMode === 'model'
                    ? 'bg-slate-200/80 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Shape
              </button>
              <button
                type="button"
                onClick={() => {
                  setCollapsed(false);
                  setViewMode('live');
                }}
                className={`px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors ${
                  viewMode === 'live'
                    ? 'bg-slate-200/80 dark:bg-slate-800 text-cyan-800 dark:text-cyan-300'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Live
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? 'Expand parameter visualizer' : 'Collapse parameter visualizer'}
            className="p-0.5 rounded text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
          >
            {collapsed ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {viewMode === 'live' && engine ? (
            <canvas
              ref={canvasRef}
              className="w-full h-[84px] rounded border border-slate-200/80 dark:border-slate-800/80 block"
            />
          ) : (
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[84px] overflow-visible">
              {/* Grid lines */}
              {model.gridMode === 'bipolar' ? (
                <>
                  <line
                    x1="0"
                    y1={MID}
                    x2={W}
                    y2={MID}
                    className="stroke-slate-300 dark:stroke-slate-800"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />
                  <line
                    x1={W / 2}
                    y1="4"
                    x2={W / 2}
                    y2={H - 4}
                    className="stroke-slate-200 dark:stroke-slate-800/80"
                    strokeWidth="1"
                  />
                </>
              ) : model.gridMode === 'freq' ? (
                <>
                  <line
                    x1="0"
                    y1={MID}
                    x2={W}
                    y2={MID}
                    className="stroke-slate-300 dark:stroke-slate-800"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />
                  {[100, 1000, 10000].map((hz) => {
                    const x =
                      ((Math.log10(hz) - Math.log10(20)) / (Math.log10(20000) - Math.log10(20))) *
                      W;
                    return (
                      <line
                        key={hz}
                        x1={x}
                        y1="4"
                        x2={x}
                        y2={H - 4}
                        className="stroke-slate-200 dark:stroke-slate-800/80"
                        strokeWidth="1"
                      />
                    );
                  })}
                </>
              ) : (
                <line
                  x1="0"
                  y1={H - 8}
                  x2={W}
                  y2={H - 8}
                  className="stroke-slate-300 dark:stroke-slate-800"
                  strokeWidth="1"
                />
              )}

              {/* Optional shaded area */}
              {model.fillPath && <path d={model.fillPath} className={fillClass} />}

              {/* Optional bar visualization */}
              {model.bars &&
                model.bars.map((b, idx) => {
                  const barH = b.h * (model.gridMode === 'bipolar' ? MID - 10 : H - 18);
                  const y =
                    model.gridMode === 'bipolar'
                      ? b.negative
                        ? MID
                        : MID - barH
                      : H - 8 - barH;
                  return (
                    <rect
                      key={idx}
                      x={b.x}
                      y={y}
                      width={b.w}
                      height={Math.max(2, barH)}
                      rx="1.5"
                      className={
                        model.accent === 'cyan'
                          ? 'fill-cyan-500/25 dark:fill-cyan-400/25 stroke-cyan-600/40'
                          : 'fill-amber-500/30 dark:fill-amber-400/25 stroke-amber-600/40'
                      }
                      strokeWidth="0.75"
                    />
                  );
                })}

              {/* Reference / input dashed curve */}
              {model.referencePath && (
                <path
                  d={model.referencePath}
                  fill="none"
                  className="stroke-slate-400/70 dark:stroke-slate-500/60"
                  strokeWidth="1.1"
                  strokeDasharray="3 3"
                />
              )}

              {/* Primary DSP curve */}
              {model.primaryPath && (
                <path
                  d={model.primaryPath}
                  fill="none"
                  className={strokeClass}
                  strokeWidth="1.85"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Key markers */}
              {model.markers &&
                model.markers.map((m, idx) => (
                  <g key={idx}>
                    <line
                      x1={m.x}
                      y1="4"
                      x2={m.x}
                      y2={H - 6}
                      className="stroke-slate-400/50 dark:stroke-slate-600/70"
                      strokeWidth="1"
                      strokeDasharray="2 2"
                    />
                    {m.label && (
                      <text
                        x={m.x}
                        y="11"
                        textAnchor="middle"
                        className="fill-slate-500 dark:fill-slate-400 text-[8px] font-mono"
                      >
                        {m.label}
                      </text>
                    )}
                  </g>
                ))}
            </svg>
          )}
          <div className="flex items-center justify-between gap-2 text-[10px] font-mono tabular-nums">
            <span className={`${readoutClass} truncate`}>
              {viewMode === 'live' ? 'Real-time master audio oscilloscope' : model.readout}
            </span>
            {model.referencePath && viewMode === 'model' && (
              <span className="text-slate-500 dark:text-slate-400 shrink-0">
                dashed = dry/ref
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
};
