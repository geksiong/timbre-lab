import { ALTERNATIVE_CARRIER_WORKLET_CODE } from './carrierWaves';
import { SOURCE_WORKLET_CODE } from './sourceWorklets';
import { PROCESSOR_WORKLET_CODE } from './processorWorklets';
import { MODULATOR_WORKLET_CODE } from './modulatorWorklets';
import { UTILITY_FX_WORKLET_CODE } from './utilityFxWorklets';

export function generateStandaloneEngineSource(): string {
  return `/**
 * Timbre Lab — Standalone Embeddable WebAudio Synthesizer Engine (ESM)
 * Zero dependencies. Drop directly into any web application or MIDI player.
 *
 * Usage:
 *   import { TimbreLabSynth } from './timbre-lab-engine.mjs';
 *   const synth = new TimbreLabSynth();
 *   await synth.init();
 *   synth.loadPatch(patchJson);
 *   synth.handleMidiMessage([0x90, 60, 110]); // Note On C4
 */

const KARPLUS_WORKLET_CODE = \`
class KarplusStrongProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'frequency', defaultValue: 220, minValue: 20, maxValue: 6000, automationRate: 'a-rate' },
      { name: 'detune', defaultValue: 0, minValue: -2400, maxValue: 2400, automationRate: 'a-rate' },
      { name: 'damping', defaultValue: 0.45, minValue: 0.02, maxValue: 0.99, automationRate: 'k-rate' },
      { name: 'decay', defaultValue: 0.985, minValue: 0.5, maxValue: 0.996, automationRate: 'k-rate' },
      { name: 'brightness', defaultValue: 0.72, minValue: 0.05, maxValue: 1.0, automationRate: 'k-rate' },
      { name: 'sympathetic', defaultValue: 0.0, minValue: 0.0, maxValue: 1.0, automationRate: 'k-rate' },
      { name: 'bowPressure', defaultValue: 0.56, minValue: 0.05, maxValue: 1.0, automationRate: 'a-rate' },
      { name: 'bowPosition', defaultValue: 0.14, minValue: 0.04, maxValue: 0.48, automationRate: 'k-rate' },
      { name: 'rosin', defaultValue: 0.32, minValue: 0.0, maxValue: 1.0, automationRate: 'k-rate' },
      { name: 'exciterMix', defaultValue: 0.7, minValue: 0.0, maxValue: 1.0, automationRate: 'k-rate' },
      { name: 'excitationMode', defaultValue: 0, minValue: 0, maxValue: 2, automationRate: 'k-rate' },
      { name: 'gate', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'velocity', defaultValue: 0.8, minValue: 0.01, maxValue: 1.0, automationRate: 'k-rate' }
    ];
  }
  constructor() {
    super();
    this.maxDelay = 8192;
    this.buffer = new Float32Array(this.maxDelay);
    this.writeIndex = 0;
    this.lastOut = 0;
    this.lastTriggered = false;
    this.exciterSamplesLeft = 0;
    this.exciterTotal = 64;
    this.bowPhase = 0;
    this.bowEnv = 0;
    this.prevPluckFilter = 0;
    this.apState = 0;
    this.apPrevIn = 0;
    this.rosinLp = 0;
    this.dcIn = 0;
    this.dcOut = 0;
    this.seed = 1337;
    this.stopped = false;
    this.port.onmessage = (e) => {
      if (e.data === 'stop') {
        this.stopped = true;
      }
    };
  }
  nextRand() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return (this.seed / 4294967296) * 2 - 1;
  }
  safeClamp(v, min, max, fallback) {
    if (!Number.isFinite(v)) return fallback;
    return v < min ? min : v > max ? max : v;
  }
  process(inputs, outputs, parameters) {
    if (this.stopped) return false;
    const output = outputs[0];
    if (!output || !output[0]) return true;
    const channel = output[0];
    const extInput = inputs[0] && inputs[0][0] ? inputs[0][0] : null;
    const freqArr = parameters.frequency;
    const detArr = parameters.detune;
    const damping = this.safeClamp(parameters.damping[0], 0.02, 0.99, 0.45);
    const decay = this.safeClamp(parameters.decay[0], 0.5, 0.995, 0.985);
    const brightness = this.safeClamp(parameters.brightness[0], 0.05, 1.0, 0.72);
    const sympathetic = this.safeClamp(parameters.sympathetic[0], 0.0, 1.0, 0.0);
    const bowPressureArr = parameters.bowPressure;
    const bowPosition = this.safeClamp(parameters.bowPosition[0], 0.04, 0.48, 0.14);
    const rosin = this.safeClamp(parameters.rosin[0], 0.0, 1.0, 0.32);
    const exciterMix = this.safeClamp(parameters.exciterMix[0], 0.0, 1.0, 0.7);
    const mode = Math.round(this.safeClamp(parameters.excitationMode[0], 0, 2, 0));
    const gate = this.safeClamp(parameters.gate[0], 0, 1, 0);
    const velocity = this.safeClamp(parameters.velocity[0], 0.01, 1.0, 0.8);

    if (!Number.isFinite(this.lastOut)) this.lastOut = 0;
    if (!Number.isFinite(this.dcIn)) this.dcIn = 0;
    if (!Number.isFinite(this.dcOut)) this.dcOut = 0;
    if (!Number.isFinite(this.rosinLp)) this.rosinLp = 0;
    if (!Number.isFinite(this.bowEnv)) this.bowEnv = 0;
    if (!Number.isFinite(this.prevPluckFilter)) this.prevPluckFilter = 0;
    if (!Number.isFinite(this.apState)) this.apState = 0;
    if (!Number.isFinite(this.apPrevIn)) this.apPrevIn = 0;

    if (gate > 0.5 && !this.lastTriggered) {
      this.lastTriggered = true;
      const d0 = this.safeClamp(detArr[0], -2400, 2400, 0);
      const f = this.safeClamp(freqArr[0] * (Math.abs(d0) > 0.01 ? Math.pow(2, d0 / 1200) : 1), 20, 6500, 220);
      const period = Math.max(4, Math.min(this.maxDelay - 2, Math.round(sampleRate / f)));
      this.exciterTotal = mode === 2 ? Math.max(12, Math.round(period * 0.85)) : period;
      this.exciterSamplesLeft = this.exciterTotal;
      this.prevPluckFilter = 0;
      if (mode === 1) this.bowEnv = 0.15;
    } else if (gate < 0.5) {
      this.lastTriggered = false;
    }

    const baseLpCoeff = mode === 2
      ? Math.max(0.24, 0.78 - damping * 0.42)
      : mode === 1
        ? Math.max(0.32, Math.min(0.92, (1 - damping * 0.48) * (0.64 + brightness * 0.40)))
        : 1 - damping * 0.58;

    for (let i = 0; i < channel.length; i++) {
      const baseF = this.safeClamp(freqArr.length > 1 ? freqArr[i] : freqArr[0], 20, 6000, 220);
      const det = this.safeClamp(detArr.length > 1 ? detArr[i] : detArr[0], -2400, 2400, 0);
      const freq = this.safeClamp(Math.abs(det) > 0.01 ? baseF * Math.pow(2, det / 1200) : baseF, 20, 6500, 220);
      const bowPressure = this.safeClamp(bowPressureArr.length > 1 ? bowPressureArr[i] : bowPressureArr[0], 0.05, 1.0, 0.56);
      const lpBlend = mode === 1
        ? Math.max(0, Math.min(0.78, (freq - 200) / 1300))
        : Math.max(0, Math.min(0.88, (freq - 180) / 1100));
      const lpCoeff = baseLpCoeff + ((mode === 1 ? 0.988 : 0.992) - baseLpCoeff) * lpBlend;
      const oneMinusLp = 1 - lpCoeff;
      const w = (6.28318530718 * freq) / sampleRate;
      const lpLag = w > 0.0005
        ? Math.atan2(oneMinusLp * Math.sin(w), 1 - oneMinusLp * Math.cos(w)) / w
        : oneMinusLp / Math.max(0.05, lpCoeff);
      const exactDelay = Math.max(2.5, Math.min(this.maxDelay - 4, sampleRate / freq - lpLag));
      let intDelay = Math.floor(exactDelay);
      let delta = exactDelay - intDelay;
      if (delta < 0.5 && intDelay > 1) {
        intDelay -= 1;
        delta += 1;
      }
      const apCoeff = (1 - delta) / (1 + delta);
      const r1 = (this.writeIndex - intDelay + this.maxDelay) % this.maxDelay;
      const s1 = Number.isFinite(this.buffer[r1]) ? this.buffer[r1] : 0;
      const delayedSample = apCoeff * (s1 - this.apState) + this.apPrevIn;
      this.apPrevIn = s1;
      this.apState = Number.isFinite(delayedSample) ? delayedSample : 0;
      const filtered = this.lastOut + lpCoeff * (delayedSample - this.lastOut);
      this.lastOut = Number.isFinite(filtered) ? filtered : 0;

      let exciter = 0;
      if (extInput && Number.isFinite(extInput[i])) {
        exciter = Math.max(-2, Math.min(2, extInput[i])) * exciterMix * 0.45;
      }
      if (mode === 1) {
        const targetEnv = gate > 0.5 ? 1.0 : 0.0;
        this.bowEnv += (targetEnv - this.bowEnv) * (gate > 0.5 ? 0.0014 : 0.0035);
        if (this.bowEnv > 0.002) {
          this.bowPhase += freq / sampleRate;
          if (this.bowPhase >= 1 || !Number.isFinite(this.bowPhase)) this.bowPhase = this.bowPhase >= 1 ? this.bowPhase - Math.floor(this.bowPhase) : 0;
          const stringVel = delayedSample - this.lastOut * 0.48;
          const bowVel = (0.20 + velocity * 0.36) * (0.68 + brightness * 0.32);
          const relVel = bowVel - stringVel;
          const grip = 2.6 + bowPressure * 3.2;
          const friction = 0.25 + 0.75 / (1.0 + Math.pow(Math.abs(relVel) * grip, 2));
          const frictionForce = Math.tanh(relVel * (1.3 + bowPressure * 1.5)) * friction;
          const ph = this.bowPhase * 6.28318530718;
          const br = 0.35 + brightness * 0.65;
          const helmholtzDrive = (
            Math.sin(ph) * 0.52 +
            Math.sin(ph * 2) * 0.48 +
            Math.sin(ph * 3) * (0.32 * br + 0.08) +
            Math.sin(ph * 4) * (0.22 * br) +
            Math.sin(ph * 5) * (0.16 * br) +
            Math.sin(ph * 6) * (0.11 * br) +
            Math.sin(ph * 7) * (0.07 * br) +
            Math.sin(ph * 8) * (0.045 * br)
          ) * (0.025 + bowPressure * 0.028);
          this.rosinLp += (0.22 + brightness * 0.48) * (this.nextRand() - this.rosinLp);
          const rosinForce = this.rosinLp * (0.008 + rosin * (0.018 + bowPressure * 0.028));
          exciter += (frictionForce * (0.085 + bowPressure * 0.105) + helmholtzDrive + rosinForce) * this.bowEnv * velocity;
        }
      } else if (this.exciterSamplesLeft > 0) {
        const rawNoise = this.nextRand();
        const shaped = this.prevPluckFilter + brightness * (rawNoise - this.prevPluckFilter);
        this.prevPluckFilter = shaped;
        const phase = 1 - this.exciterSamplesLeft / Math.max(1, this.exciterTotal);
        const pulse = Math.sin(phase * Math.PI);
        if (mode === 2) {
          const hammerWave = Math.sin(phase * 6.2831853) * 0.5 * (1 - Math.cos(phase * 6.2831853));
          exciter += (hammerWave * 0.72 + shaped * brightness * 0.14 * pulse) * velocity * 0.58;
        } else {
          const bodyWeight = (1 - brightness * 0.75) * 0.36 * pulse;
          exciter += (shaped * 0.58 + bodyWeight) * velocity * 0.70;
        }
        this.exciterSamplesLeft--;
      }

      const baseDecay = gate > 0.5 ? decay : Math.min(decay, 0.968);
      const activeDecay = mode === 1 ? (gate > 0.5 ? 0.964 + (1 - damping) * 0.024 : decay * 0.94) : Math.pow(baseDecay, Math.min(1.5, 210 / Math.max(55, freq)));
      let nextVal = exciter + this.lastOut * activeDecay;
      if (sympathetic > 0.01) {
        nextVal += (Math.tanh(nextVal * (1 + sympathetic * 1.8)) - nextVal) * sympathetic * 0.12;
      }
      nextVal = this.safeClamp(nextVal, -1.4, 1.4, 0);
      this.buffer[this.writeIndex] = nextVal;
      let outSample = nextVal;
      if (mode === 1) {
        const tapOffset = Math.max(1, Math.min(intDelay - 1, Math.round(exactDelay * bowPosition)));
        const tapIdx = (this.writeIndex - tapOffset + this.maxDelay) % this.maxDelay;
        const tapVal = Number.isFinite(this.buffer[tapIdx]) ? this.buffer[tapIdx] : 0;
        outSample = (nextVal - tapVal * 0.62) * 0.68;
      }
      this.writeIndex = (this.writeIndex + 1) % this.maxDelay;
      const dcBlocked = outSample - this.dcIn + 0.995 * this.dcOut;
      if (Number.isFinite(dcBlocked)) {
        this.dcIn = outSample;
        this.dcOut = dcBlocked;
        channel[i] = this.safeClamp(dcBlocked * 0.85, -1.25, 1.25, 0);
      } else {
        this.dcIn = 0; this.dcOut = 0; this.lastOut = 0; channel[i] = 0;
      }
    }
    return true;
  }
}

class SafetyLimiterProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output) return true;
    for (let ch = 0; ch < output.length; ch++) {
      const outCh = output[ch];
      const inCh = input && input[ch] ? input[ch] : (input && input[0] ? input[0] : null);
      if (!inCh) {
        outCh.fill(0);
        continue;
      }
      for (let i = 0; i < outCh.length; i++) {
        const s = inCh[i];
        if (!Number.isFinite(s)) {
          outCh[i] = 0;
        } else if (s > 0.92 || s < -0.92) {
          const sign = s < 0 ? -1 : 1;
          const abs = s < 0 ? -s : s;
          outCh[i] = sign * (0.92 + 0.14 * Math.tanh((abs - 0.92) / 0.14));
        } else {
          outCh[i] = s;
        }
      }
    }
    return true;
  }
}

class GranularCloudProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'grainSize', defaultValue: 165, minValue: 20, maxValue: 450, automationRate: 'k-rate' },
      { name: 'density', defaultValue: 11, minValue: 1, maxValue: 24, automationRate: 'k-rate' },
      { name: 'pitchShift', defaultValue: 12, minValue: -24, maxValue: 24, automationRate: 'k-rate' },
      { name: 'pitchSnap', defaultValue: 0, minValue: 0, maxValue: 2, automationRate: 'k-rate' },
      { name: 'spray', defaultValue: 0.45, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'stereoScatter', defaultValue: 0.78, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'feedback', defaultValue: 0.25, minValue: 0, maxValue: 0.8, automationRate: 'k-rate' },
      { name: 'freeze', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'mix', defaultValue: 0.55, minValue: 0, maxValue: 1, automationRate: 'k-rate' }
    ];
  }
  constructor() {
    super();
    this.bufLen = 96000;
    this.bufL = new Float32Array(this.bufLen);
    this.bufR = new Float32Array(this.bufLen);
    this.writeIdx = 0;
    this.spawnCounter = 0;
    this.lastOutL = 0;
    this.lastOutR = 0;
    this.grainToggle = 0;
    this.seed = 4919;
    this.stopped = false;
    this.maxGrains = 16;
    this.grains = [];
    for (let i = 0; i < this.maxGrains; i++) this.grains.push({ active: false, pos: 0, age: 0, len: 4096, rate: 1, panL: 0.7, panR: 0.7 });
    this.port.onmessage = (e) => { if (e.data === 'stop') this.stopped = true; };
  }
  rand() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }
  readInterp(buf, pos) {
    const wrapped = ((pos % this.bufLen) + this.bufLen) % this.bufLen;
    const i0 = Math.floor(wrapped);
    const i1 = (i0 + 1) % this.bufLen;
    const f = wrapped - i0;
    return buf[i0] * (1 - f) + buf[i1] * f;
  }
  process(inputs, outputs, parameters) {
    if (this.stopped) return false;
    const input = inputs[0], output = outputs[0];
    if (!output || !output[0]) return true;
    const outL = output[0], outR = output[1] || output[0];
    const inL = input && input[0] ? input[0] : null, inR = input && input[1] ? input[1] : inL;
    const grainMs = Math.max(20, Math.min(450, parameters.grainSize[0] || 165));
    const density = Math.max(1, Math.min(24, parameters.density[0] || 11));
    const pitchSt = Math.max(-24, Math.min(24, parameters.pitchShift[0] || 12));
    const pitchSnap = Math.round(parameters.pitchSnap[0] || 0);
    const spray = Math.max(0, Math.min(1, parameters.spray[0] || 0.45));
    const scatter = Math.max(0, Math.min(1, parameters.stereoScatter[0] || 0.78));
    const fb = Math.max(0, Math.min(0.78, parameters.feedback[0] || 0.25));
    const freeze = (parameters.freeze[0] || 0) >= 0.5;
    const mix = Math.max(0, Math.min(1, parameters.mix[0] || 0.55));
    const grainSamples = Math.max(256, Math.floor((grainMs / 1000) * sampleRate));
    const spawnPeriod = Math.max(64, Math.floor(sampleRate / density));
    for (let i = 0; i < outL.length; i++) {
      const dryL = inL && Number.isFinite(inL[i]) ? inL[i] : 0;
      const dryR = inR && Number.isFinite(inR[i]) ? inR[i] : 0;
      if (!freeze) {
        this.bufL[this.writeIdx] = Math.tanh(dryL + this.lastOutL * fb * 0.65);
        this.bufR[this.writeIdx] = Math.tanh(dryR + this.lastOutR * fb * 0.65);
        this.writeIdx = (this.writeIdx + 1) % this.bufLen;
      }
      this.spawnCounter--;
      if (this.spawnCounter <= 0) {
        this.spawnCounter = spawnPeriod;
        for (let g = 0; g < this.maxGrains; g++) {
          const gr = this.grains[g];
          if (!gr.active) {
            let st = pitchSt;
            if (pitchSnap === 0) { const t = this.grainToggle % 3; st = t === 0 ? pitchSt : t === 1 ? 7 : 0; this.grainToggle++; }
            else if (pitchSnap === 1) { st = (this.grainToggle % 2 === 0) ? pitchSt : 0; this.grainToggle++; }
            const maxBack = freeze ? this.bufLen * 0.92 : Math.min(this.bufLen * 0.85, Math.max(grainSamples * 2, sampleRate * 1.35));
            const offset = 128 + this.rand() * spray * maxBack;
            const pan = 0.5 + (this.rand() * 2 - 1) * 0.48 * scatter;
            gr.active = true;
            gr.pos = (this.writeIdx - offset + this.bufLen) % this.bufLen;
            gr.age = 0;
            gr.len = Math.max(256, Math.round(grainSamples * (0.75 + this.rand() * 0.5)));
            gr.rate = Math.max(0.25, Math.min(4.0, Math.pow(2, st / 12)));
            gr.panL = Math.cos(pan * Math.PI * 0.5);
            gr.panR = Math.sin(pan * Math.PI * 0.5);
            break;
          }
        }
      }
      let wetL = 0, wetR = 0, activeCount = 0;
      for (let g = 0; g < this.maxGrains; g++) {
        const gr = this.grains[g];
        if (!gr.active) continue;
        const phase = gr.age / gr.len;
        if (phase >= 1) { gr.active = false; continue; }
        const win = 0.5 * (1 - Math.cos(6.28318530718 * phase));
        wetL += this.readInterp(this.bufL, gr.pos) * win * gr.panL;
        wetR += this.readInterp(this.bufR, gr.pos) * win * gr.panR;
        gr.pos = (gr.pos + gr.rate) % this.bufLen;
        gr.age++; activeCount++;
      }
      const norm = activeCount > 1 ? 1 / Math.sqrt(activeCount * 0.55) : 1;
      this.lastOutL = Number.isFinite(wetL * norm) ? wetL * norm : 0;
      this.lastOutR = Number.isFinite(wetR * norm) ? wetR * norm : 0;
      const dryMix = 1 - mix * 0.55;
      outL[i] = Math.tanh(dryL * dryMix + this.lastOutL * mix * 1.15);
      outR[i] = Math.tanh(dryR * dryMix + this.lastOutR * mix * 1.15);
    }
    return true;
  }
}

class ShimmerTankProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'pitchRatio', defaultValue: 2.0, minValue: 0.5, maxValue: 4.0, automationRate: 'k-rate' },
      { name: 'shimmerMix', defaultValue: 0.0, minValue: 0.0, maxValue: 1.0, automationRate: 'k-rate' },
      { name: 'damping', defaultValue: 0.45, minValue: 0.05, maxValue: 1.0, automationRate: 'k-rate' },
      { name: 'modulation', defaultValue: 0.25, minValue: 0.0, maxValue: 1.0, automationRate: 'k-rate' },
      { name: 'freeze', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' }
    ];
  }
  constructor() {
    super();
    this.winLen = 4096;
    this.inBufL = new Float32Array(this.winLen); this.inBufR = new Float32Array(this.winLen);
    this.inWrite = 0; this.phase = 0;
    this.tankLenL = 7919; this.tankLenR = 9371;
    this.tankL = new Float32Array(this.tankLenL); this.tankR = new Float32Array(this.tankLenR);
    this.tankIdxL = 0; this.tankIdxR = 0; this.lpL = 0; this.lpR = 0; this.modPhase = 0; this.stopped = false;
    this.port.onmessage = (e) => { if (e.data === 'stop') this.stopped = true; };
  }
  readWin(buf, d) {
    const pos = ((this.inWrite - d) % this.winLen + this.winLen) % this.winLen;
    const i0 = Math.floor(pos), i1 = (i0 + 1) % this.winLen, f = pos - i0;
    return buf[i0] * (1 - f) + buf[i1] * f;
  }
  process(inputs, outputs, parameters) {
    if (this.stopped) return false;
    const input = inputs[0], output = outputs[0];
    if (!output || !output[0]) return true;
    const outL = output[0], outR = output[1] || output[0];
    const inL = input && input[0] ? input[0] : null, inR = input && input[1] ? input[1] : inL;
    const pitchRatio = Math.max(0.5, Math.min(4.0, parameters.pitchRatio[0] || 2.0));
    const shimmerMix = Math.max(0, Math.min(1, parameters.shimmerMix[0] || 0));
    const damping = Math.max(0.05, Math.min(1, parameters.damping[0] || 0.45));
    const modAmt = Math.max(0, Math.min(1, parameters.modulation[0] || 0.25));
    const freeze = (parameters.freeze[0] || 0) >= 0.5;
    const phaseStep = (1 - pitchRatio) / this.winLen;
    const lpCoeff = Math.max(0.08, 1 - damping * 0.72);
    for (let i = 0; i < outL.length; i++) {
      const sL = inL && Number.isFinite(inL[i]) ? inL[i] : 0;
      const sR = inR && Number.isFinite(inR[i]) ? inR[i] : 0;
      const tOutL = this.tankL[this.tankIdxL], tOutR = this.tankR[this.tankIdxR];
      this.modPhase += 0.45 / sampleRate; if (this.modPhase >= 1) this.modPhase -= 1;
      const modOffset = Math.sin(this.modPhase * 6.2831853) * modAmt * 28;
      this.inBufL[this.inWrite] = Math.tanh((freeze ? tOutL : sL + tOutR * (0.35 + shimmerMix * 0.36)) * 0.85);
      this.inBufR[this.inWrite] = Math.tanh((freeze ? tOutR : sR + tOutL * (0.35 + shimmerMix * 0.36)) * 0.85);
      this.phase = ((this.phase + phaseStep) % 1 + 1) % 1;
      const pA = this.phase, pB = (this.phase + 0.5) % 1;
      const wA = 0.5 * (1 - Math.cos(6.2831853 * pA)), wB = 0.5 * (1 - Math.cos(6.2831853 * pB));
      const dA = 64 + pA * (this.winLen - 160) + modOffset, dB = 64 + pB * (this.winLen - 160) - modOffset;
      const shL = this.readWin(this.inBufL, dA) * wA + this.readWin(this.inBufL, dB) * wB;
      const shR = this.readWin(this.inBufR, dA) * wA + this.readWin(this.inBufR, dB) * wB;
      this.inWrite = (this.inWrite + 1) % this.winLen;
      const mL = freeze ? tOutL * 0.996 : sL * (1 - shimmerMix * 0.35) + shL * shimmerMix * 0.9;
      const mR = freeze ? tOutR * 0.996 : sR * (1 - shimmerMix * 0.35) + shR * shimmerMix * 0.9;
      this.lpL += lpCoeff * (mL - this.lpL); this.lpR += lpCoeff * (mR - this.lpR);
      if (!freeze) {
        this.tankL[this.tankIdxL] = Math.tanh(sL * 0.45 + this.lpR * (0.48 + shimmerMix * 0.25));
        this.tankR[this.tankIdxR] = Math.tanh(sR * 0.45 + this.lpL * (0.48 + shimmerMix * 0.25));
      } else {
        this.tankL[this.tankIdxL] = Math.tanh(this.lpL * 0.9985);
        this.tankR[this.tankIdxR] = Math.tanh(this.lpR * 0.9985);
      }
      this.tankIdxL = (this.tankIdxL + 1) % this.tankLenL; this.tankIdxR = (this.tankIdxR + 1) % this.tankLenR;
      outL[i] = Number.isFinite(this.lpL) ? this.lpL : 0; outR[i] = Number.isFinite(this.lpR) ? this.lpR : 0;
    }
    return true;
  }
}

registerProcessor('timbre-karplus-processor', KarplusStrongProcessor);
registerProcessor('timbre-safety-limiter', SafetyLimiterProcessor);
registerProcessor('timbre-granular-processor', GranularCloudProcessor);
registerProcessor('timbre-shimmer-processor', ShimmerTankProcessor);
${ALTERNATIVE_CARRIER_WORKLET_CODE}
${SOURCE_WORKLET_CODE}
${PROCESSOR_WORKLET_CODE}
${MODULATOR_WORKLET_CODE}
${UTILITY_FX_WORKLET_CODE}
\`;

const VALID_OSC_TYPES = new Set(['sine', 'square', 'sawtooth', 'triangle']);
const ALT_CARRIER_MODES = { pulse: 0, filteredNoise: 1, customHarmonics: 2, vocalFormant: 3, wavetable: 4 };
const WT_BANK_MAP = { analog: 0, vocal: 1, bell: 2, bowed: 3, digital: 4, sub: 5 };
const MODAL_MAT_MAP = { marimba: 0, bell: 1, kalimba: 2, steelDrum: 3, plate: 4, harmonic: 5 };
const PIPE_BORE_MAP = { flute: 0, clarinet: 1, reed: 2, organPipe: 3 };
const CROSSFADE_MAP = { equalPower: 0, linear: 1, blendSum: 2 };
const RINGMOD_MAP = { ring: 0, am: 1, rectified: 2 };
const SH_MODE_MAP = { random: 0, quantized: 1, external: 2 };
const SLOPE_MODE_MAP = { oneShot: 0, asr: 1, loop: 2 };
const SEQ_DIR_MAP = { forward: 0, pendulum: 1, random: 2 };
const QUANT_SCALE_MAP = { chromatic: 0, major: 1, minor: 2, pentatonicMinor: 3, pentatonicMajor: 4, dorian: 5, phrygianDom: 6, wholeTone: 7, fifths: 8 };
const CV_RECT_MAP = { none: 0, half: 1, full: 2, clamp01: 3 };
const PHASER_MODE_MAP = { phaser: 0, flanger: 1 };
const VALID_FILTER_TYPES = new Set(['lowpass', 'highpass', 'bandpass', 'lowshelf', 'highshelf', 'peaking', 'notch', 'allpass']);

function parseHarmonicsArr(raw) {
  const out = new Array(16).fill(0);
  if (typeof raw === 'string' && raw.trim().length > 0) {
    const parts = raw.split(',');
    for (let i = 0; i < 16; i++) {
      const v = Number(parts[i]);
      out[i] = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
    }
    if (out.every((x) => x === 0)) out[0] = 1;
    return out;
  }
  return [1, 0.5, 0.33, 0.25, 0.2, 0.16, 0.14, 0.12, 0.1, 0.08, 0.07, 0.06, 0.05, 0.04, 0.03, 0.02];
}

function safeOscType(v, fallback = 'sine') {
  const s = String(v || fallback);
  return VALID_OSC_TYPES.has(s) ? s : fallback;
}

function safeFilterType(v, fallback = 'lowpass') {
  const s = String(v || fallback);
  return VALID_FILTER_TYPES.has(s) ? s : fallback;
}

function clampFinite(v, min, max, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function applyModCurve(value, curve) {
  if (!Number.isFinite(value)) return 0;
  if (curve === 'exp') return Math.sign(value) * value * value;
  if (curve === 'scurve') return Math.tanh(value * 2.2) / Math.tanh(2.2);
  return value;
}

function createMasterSafetyCurve() {
  const samples = 1024;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1;
    const abs = Math.abs(x);
    curve[i] = abs <= 0.78 ? x : Math.sign(x) * (0.78 + 0.2 * Math.tanh((abs - 0.78) / 0.2));
  }
  return curve;
}

export class TimbreLabSynth {
  constructor(options = {}) {
    this.ctx = options.audioContext || null;
    this.destination = options.destination || null;
    this.patch = null;
    this.voices = new Map();
    this.voiceCounter = 0;
    this.noteEpoch = 0;
    this.pendingMidiCancelledAt = new Map();
    this.lastAllNotesOffEpoch = 0;
    this.lastNoteMidi = null;
    this.lastNoteOnTimeSec = -999;
    this.pitchBendSemitones = 0;
    this.modWheel = 0;
    this.macroX = 0.5;
    this.macroY = 0.5;
    this.sustainPedal = false;
    this.latchEnabled = false;
    this.latchedNotes = new Set();
    this.filterCutoffMod = 0;
    this.workletReady = false;
    this.workletAttempted = false;
    this.workletLoading = null;
    this.initPromise = null;
    this.lastDspBuildMs = 0;
    this.lastInputToDspMs = 0;
    this.periodicWaves = new Map();
    this.masterFxChain = [];
    this.lastFxSignature = '';
    this.programChangeHandler = options.onProgramChange || null;
  }

  _resetContextState() {
    this.allNotesOff();
    this.masterFxChain.forEach((n) => { try { n.input.disconnect(); n.output.disconnect(); } catch {} });
    this.masterFxChain = [];
    this.periodicWaves.clear();
    this.masterSafetyWorklet = null;
    this.masterSafetyClipper = null;
    this.masterGain = null;
    this.analyser = null;
    this.masterInputBus = null;
    this.workletReady = false;
    this.workletAttempted = false;
    this.workletLoading = null;
    this.lastFxSignature = '';
    this.lastNoteMidi = null;
    this.lastNoteOnTimeSec = -999;
    this.ctx = null;
  }

  warmUp() { return this.init(); }

  async init() {
    if (this.ctx && this.ctx.state === 'closed') {
      this._resetContextState();
    }
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        try { this.ctx = new AudioCtx({ latencyHint: 'interactive' }); }
        catch { this.ctx = new AudioCtx(); }
      }
      if (this.ctx.state !== 'running') {
        try { await this.ctx.resume(); } catch {}
      }
      if (!this.masterInputBus) {
        this.masterInputBus = this.ctx.createGain();
        this.masterSafetyClipper = this.ctx.createWaveShaper();
        this.masterSafetyClipper.oversample = 'none';
        this.masterSafetyClipper.curve = createMasterSafetyCurve();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.85;
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 2048;

        this.masterInputBus.connect(this.masterSafetyClipper);
        this.masterSafetyClipper.connect(this.masterGain);
        this.masterGain.connect(this.analyser);
        this.analyser.connect(this.destination || this.ctx.destination);
        this._prepareBuffers();
      }
      if (!this.workletReady && !this.workletAttempted && !this.workletLoading && this.ctx.audioWorklet) {
        this.workletAttempted = true;
        this.workletLoading = (async () => {
          try {
            const blob = new Blob([KARPLUS_WORKLET_CODE], { type: 'application/javascript' });
            const url = URL.createObjectURL(blob);
            await this.ctx.audioWorklet.addModule(url);
            URL.revokeObjectURL(url);
            this.workletReady = true;
          } catch {
            this.workletReady = false;
          }
        })();
      }
      if (this.workletLoading) {
        await this.workletLoading.catch(() => undefined);
      }
      if (this.workletReady && !this.masterSafetyWorklet && this.masterSafetyClipper && this.masterGain) {
        try {
          const sn = new AudioWorkletNode(this.ctx, 'timbre-safety-limiter', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [2],
            channelCount: 2,
            channelCountMode: 'explicit',
            channelInterpretation: 'speakers',
          });
          sn.onprocessorerror = () => {
            try { this.masterSafetyClipper.disconnect(); sn.disconnect(); } catch {}
            try { this.masterSafetyClipper.connect(this.masterGain); } catch {}
            this.masterSafetyWorklet = null;
          };
          this.masterSafetyClipper.disconnect();
          this.masterSafetyClipper.connect(sn);
          sn.connect(this.masterGain);
          this.masterSafetyWorklet = sn;
        } catch {
          this.masterSafetyWorklet = null;
        }
      }
      if (this.patch) this._rebuildMasterFx();
      return this.ctx;
    })().finally(() => {
      this.initPromise = null;
    });

    return this.initPromise;
  }

  getLatencyMetrics() {
    if (!this.ctx || this.ctx.state === 'closed') {
      return { state: 'standby', sampleRate: 48000, baseLatencyMs: 0, outputLatencyMs: 0, dspBuildMs: this.lastDspBuildMs, inputToDspMs: this.lastInputToDspMs, lookaheadMs: 0, totalMs: 0 };
    }
    const sr = this.ctx.sampleRate || 48000;
    const qMs = (128 / sr) * 1000;
    const baseLatencyMs = this.ctx.baseLatency > 0 ? this.ctx.baseLatency * 1000 : qMs;
    const outputLatencyMs = typeof this.ctx.outputLatency === 'number' && this.ctx.outputLatency > 0 ? this.ctx.outputLatency * 1000 : 0;
    return { state: this.ctx.state, sampleRate: sr, baseLatencyMs, outputLatencyMs, dspBuildMs: this.lastDspBuildMs, inputToDspMs: this.lastInputToDspMs, lookaheadMs: 0, totalMs: this.lastInputToDspMs + baseLatencyMs + outputLatencyMs };
  }

  loadPatch(patch) {
    const nextPatch = typeof patch === 'string' ? JSON.parse(patch) : patch;
    if (!this.patch || !nextPatch || this.patch.id !== nextPatch.id) {
      this.lastNoteMidi = null;
      this.lastNoteOnTimeSec = -999;
    }
    this.patch = nextPatch;
    if (this.patch && this.patch.macroDefaults) {
      this.macroX = clampFinite(this.patch.macroDefaults.x, 0, 1, 0.5);
      this.macroY = clampFinite(this.patch.macroDefaults.y, 0, 1, 0.5);
    }
    if (!this.ctx || !this.patch) return;
    const sig = this.patch.nodes
      .filter((n) => n.type === 'delay' || n.type === 'reverb' || n.type === 'busCompressor' || n.type === 'output')
      .map((n) => n.id + ':' + n.type + ':' + Boolean(n.bypassed))
      .join('|');
    if (sig !== this.lastFxSignature) this._rebuildMasterFx();
    else this.masterFxChain.forEach((f) => f.update && f.update());
  }

  setMacroXY(x, y) {
    this.macroX = clampFinite(x, 0, 1, 0.5);
    this.macroY = clampFinite(y, 0, 1, 0.5);
    this.masterFxChain.forEach((f) => f.update && f.update());
  }

  setLatchEnabled(enabled) {
    this.latchEnabled = Boolean(enabled);
    if (!this.latchEnabled) {
      const notes = Array.from(this.latchedNotes);
      this.latchedNotes.clear();
      notes.forEach((m) => this.noteOff(m));
    }
  }

  async noteOn(midi, velocity = 100, inputTimeStampMs) {
    if (!this.patch) return;
    if (this.latchEnabled && this.latchedNotes.has(midi)) {
      this.latchedNotes.delete(midi);
      this.pendingMidiCancelledAt.set(midi, this.noteEpoch);
      if (this.ctx) {
        const now = this.ctx.currentTime;
        for (const [id, v] of this.voices.entries()) {
          if (v.midi === midi && !v.released) this._releaseVoice(id, now);
        }
      }
      return;
    }
    if (this.latchEnabled) this.latchedNotes.add(midi);
    const reqEpoch = ++this.noteEpoch;
    if (!this.ctx || this.ctx.state !== 'running' || this.initPromise || (!this.workletReady && !this.workletAttempted && !this.workletLoading && Boolean(this.ctx.audioWorklet))) {
      await this.init();
    }
    if (!this.patch || !this.ctx || this.ctx.state === 'closed') return;
    if (reqEpoch <= this.lastAllNotesOffEpoch || (this.pendingMidiCancelledAt.get(midi) ?? 0) >= reqEpoch) {
      return;
    }
    const buildStart = performance.now();
    const now = this.ctx.currentTime;
    const velNorm = clampFinite(velocity / 127, 0.02, 1, 0.78);
    const maxVoices = Math.max(1, Math.min(16, this.patch.polyphony || 8));
    while (this.voices.size >= maxVoices) {
      let stealKey = null;
      for (const [k, v] of this.voices.entries()) {
        if (v.released) { stealKey = k; break; }
      }
      if (!stealKey) stealKey = this.voices.keys().next().value;
      if (!stealKey) break;
      this._stopVoice(stealKey);
    }
    const id = 'v_' + (++this.voiceCounter);
    const voice = this._buildVoice(id, midi, velNorm, now);
    const doneMs = performance.now();
    this.lastDspBuildMs = Math.max(0, doneMs - buildStart);
    this.lastInputToDspMs = inputTimeStampMs !== undefined && Number.isFinite(inputTimeStampMs) ? Math.max(0, Math.min(250, doneMs - inputTimeStampMs)) : this.lastDspBuildMs;
    if (voice) this.voices.set(id, voice);
    this.lastNoteMidi = midi;
    this.lastNoteOnTimeSec = now;
  }

  noteOff(midi) {
    if (this.latchEnabled && this.latchedNotes.has(midi)) return;
    this.pendingMidiCancelledAt.set(midi, this.noteEpoch);
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const [id, v] of this.voices.entries()) {
      if (v.midi === midi && !v.released) {
        if (this.sustainPedal) v.sustained = true;
        else this._releaseVoice(id, now);
      }
    }
  }

  allNotesOff() {
    this.lastAllNotesOffEpoch = this.noteEpoch;
    this.latchedNotes.clear();
    for (const id of Array.from(this.voices.keys())) this._stopVoice(id);
    this.lastNoteMidi = null;
    this.lastNoteOnTimeSec = -999;
  }

  handleMidiMessage(data, inputTimeStampMs) {
    const bytes = Array.from(data);
    if (bytes.length < 2) return;
    const status = bytes[0] & 0xf0;
    const d1 = bytes[1] || 0;
    const d2 = bytes[2] || 0;

    if (status === 0x90 && d2 > 0) void this.noteOn(d1, d2, inputTimeStampMs);
    else if (status === 0x80 || (status === 0x90 && d2 === 0)) this.noteOff(d1);
    else if (status === 0xb0) {
      if (d1 === 1) this.modWheel = d2 / 127;
      else if (d1 === 7 && this.masterGain && this.ctx) this.masterGain.gain.setTargetAtTime((d2 / 127) * 1.1, this.ctx.currentTime, 0.02);
      else if (d1 === 64) {
        this.sustainPedal = d2 >= 64;
        if (!this.sustainPedal && this.ctx) {
          const now = this.ctx.currentTime;
          for (const [id, v] of this.voices.entries()) {
            if (v.sustained && !v.released) this._releaseVoice(id, now);
          }
        }
      } else if (d1 === 74) this.filterCutoffMod = (d2 / 127 - 0.5) * 4000;
      else if (d1 === 120 || d1 === 123) this.allNotesOff();
    } else if (status === 0xc0 && this.programChangeHandler) {
      this.programChangeHandler(d1);
    } else if (status === 0xe0) {
      this.pitchBendSemitones = ((((d2 << 7) | d1) - 8192) / 8192) * 2;
    }
  }

  attachMidiAccess(midiAccess) {
    midiAccess.inputs.forEach((input) => {
      input.onmidimessage = (ev) => ev.data && this.handleMidiMessage(ev.data, ev.timeStamp);
    });
  }

  _prepareBuffers() {
    const len = this.ctx.sampleRate * 2;
    this.noiseWhite = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    this.noisePink = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const w = this.noiseWhite.getChannelData(0);
    const p = this.noisePink.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const wn = Math.random() * 2 - 1;
      w[i] = wn;
      b0 = 0.99886 * b0 + wn * 0.0555179;
      b1 = 0.99332 * b1 + wn * 0.0750759;
      b2 = 0.96900 * b2 + wn * 0.1538520;
      b3 = 0.86650 * b3 + wn * 0.3104856;
      b4 = 0.55000 * b4 + wn * 0.5329522;
      b5 = -0.7616 * b5 - wn * 0.0168980;
      p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + wn * 0.5362) * 0.11;
      b6 = wn * 0.115926;
    }
    const organReal = new Float32Array(16), organImag = new Float32Array(16);
    [1, 0.8, 0.65, 0.5, 0.1, 0.35, 0.05, 0.28, 0, 0, 0, 0.14].forEach((v, i) => { organImag[i + 1] = v; });
    this.periodicWaves.set('organ', this.ctx.createPeriodicWave(organReal, organImag));
    const reedReal = new Float32Array(24), reedImag = new Float32Array(24);
    for (let k = 1; k < 24; k++) reedImag[k] = (k % 2 === 1 ? 1.0 : 0.45) / Math.pow(k, 0.82);
    this.periodicWaves.set('reed', this.ctx.createPeriodicWave(reedReal, reedImag));
    const strReal = new Float32Array(20), strImag = new Float32Array(20);
    for (let k = 1; k < 20; k++) strImag[k] = 1 / Math.pow(k, 1.08);
    this.periodicWaves.set('strings', this.ctx.createPeriodicWave(strReal, strImag));
    const glassReal = new Float32Array(24), glassImag = new Float32Array(24);
    [1, 0, 0.52, 0, 0.28, 0.14, 0, 0.18, 0, 0, 0.09, 0, 0.06].forEach((v, i) => { glassImag[i + 1] = v; });
    this.periodicWaves.set('glass', this.ctx.createPeriodicWave(glassReal, glassImag));
    const choirReal = new Float32Array(24), choirImag = new Float32Array(24);
    [1, 0.65, 0.85, 0.35, 0.55, 0.18, 0.42, 0.12, 0.22, 0.08].forEach((v, i) => { choirImag[i + 1] = v; });
    this.periodicWaves.set('choir', this.ctx.createPeriodicWave(choirReal, choirImag));
    const hollowReal = new Float32Array(16), hollowImag = new Float32Array(16);
    [1, 0.05, 0.72, 0.02, 0.4, 0, 0.22, 0, 0.12].forEach((v, i) => { hollowImag[i + 1] = v; });
    this.periodicWaves.set('hollow', this.ctx.createPeriodicWave(hollowReal, hollowImag));
  }

  _getMasterOffset(nodeId, key) {
    const slots = this.patch && this.patch.modMatrix;
    if (!Array.isArray(slots)) return 0;
    const getV = (n) => (n === 'macroX' ? this.macroX : n === 'macroY' ? this.macroY : n === 'modWheel' ? this.modWheel : null);
    let tot = 0;
    for (const s of slots) {
      if (!s.enabled || s.targetNodeId !== nodeId || s.targetParam !== key) continue;
      const sv = getV(s.source); if (sv === null) continue;
      const vv = s.via && s.via !== 'none' ? getV(s.via) : 1; if (vv === null) continue;
      tot += applyModCurve(sv, s.curve) * s.amount * vv;
    }
    return tot;
  }

  _rebuildMasterFx() {
    if (!this.ctx || !this.patch || !this.masterInputBus || !this.masterSafetyClipper) return;
    this.lastFxSignature = this.patch.nodes
      .filter((n) => n.type === 'delay' || n.type === 'reverb' || n.type === 'busCompressor' || n.type === 'output')
      .map((n) => n.id + ':' + n.type + ':' + Boolean(n.bypassed))
      .join('|');
    try { this.masterInputBus.disconnect(); } catch {}
    this.masterFxChain.forEach((n) => { try { n.stop && n.stop(); n.input.disconnect(); n.output.disconnect(); } catch {} });
    this.masterFxChain = [];
    const fxNodes = this.patch.nodes.filter((n) => !n.bypassed && (n.type === 'delay' || n.type === 'reverb' || n.type === 'busCompressor' || n.type === 'output'));
    const weight = (t) => (t === 'delay' ? 1 : t === 'reverb' ? 2 : t === 'busCompressor' ? 3 : 4);
    fxNodes.sort((a, b) => weight(a.type) - weight(b.type));
    let prev = this.masterInputBus;
    for (const node of fxNodes) {
      const p = node.params || {};
      if (node.type === 'output') {
        const g = this.ctx.createGain(); g.gain.value = clampFinite(p.gain, 0, 1.6, 0.82);
        const pan = this.ctx.createStereoPanner(); pan.pan.value = clampFinite(p.pan, -1, 1, 0);
        g.connect(pan); prev.connect(g); prev = pan;
        this.masterFxChain.push({ id: node.id, input: g, output: pan });
      } else if (node.type === 'delay') {
        const inp = this.ctx.createGain(), out = this.ctx.createGain(), dry = this.ctx.createGain(), wet = this.ctx.createGain();
        const sp = this.ctx.createChannelSplitter(2), mg = this.ctx.createChannelMerger(2);
        const dL = this.ctx.createDelay(2.5), dR = this.ctx.createDelay(2.5);
        const tL = this.ctx.createBiquadFilter(), tR = this.ctx.createBiquadFilter(); tL.type = 'lowpass'; tR.type = 'lowpass';
        const hL = this.ctx.createBiquadFilter(), hR = this.ctx.createBiquadFilter(); hL.type = 'highpass'; hR.type = 'highpass';
        const fbSL = this.ctx.createGain(), fbSR = this.ctx.createGain(), fbCL = this.ctx.createGain(), fbCR = this.ctx.createGain();
        const modO = this.ctx.createOscillator(), mGL = this.ctx.createGain(), mGR = this.ctx.createGain();
        modO.connect(mGL); modO.connect(mGR); mGL.connect(dL.delayTime); mGR.connect(dR.delayTime); modO.start();
        inp.connect(dry); dry.connect(out); inp.connect(sp); sp.connect(dL, 0); sp.connect(dR, 1);
        dL.connect(hL); hL.connect(tL); dR.connect(hR); hR.connect(tR);
        tL.connect(fbSL); fbSL.connect(dL); tL.connect(fbCL); fbCL.connect(dR);
        tR.connect(fbSR); fbSR.connect(dR); tR.connect(fbCR); fbCR.connect(dL);
        tL.connect(mg, 0, 0); tR.connect(mg, 0, 1); mg.connect(wet); wet.connect(out);
        const update = () => {
          const tm = clampFinite(p.time, 0.02, 2.2, 0.26), pp = clampFinite(p.pingPong, 0, 1, 0.45);
          const fb = clampFinite((Number(p.feedback) || 0.32) + this._getMasterOffset(node.id, 'feedback') * 0.45, 0, 0.92, 0.32);
          const tn = clampFinite((Number(p.tone) || 3400) * Math.pow(2, this._getMasterOffset(node.id, 'tone') * 2), 200, 16000, 3400);
          const mx = clampFinite((Number(p.mix) || 0.22) + this._getMasterOffset(node.id, 'mix') * 0.6, 0, 1, 0.22);
          dL.delayTime.value = tm; dR.delayTime.value = Math.min(2.4, tm * (1 + pp * 0.28));
          const selfA = fb * (1 - pp * 0.85), crossA = fb * pp * 0.85;
          fbSL.gain.value = selfA; fbSR.gain.value = selfA; fbCL.gain.value = crossA; fbCR.gain.value = crossA;
          tL.frequency.value = tn; tR.frequency.value = tn;
          const hp = clampFinite(p.highpass, 30, 1500, 120); hL.frequency.value = hp; hR.frequency.value = hp;
          modO.frequency.value = clampFinite(p.modRate, 0.05, 5, 0.55);
          const ms = clampFinite(p.modDepth, 0, 1, 0.14) * 0.0045; mGL.gain.value = ms; mGR.gain.value = -ms;
          dry.gain.value = 1 - mx * 0.4; wet.gain.value = mx;
        };
        update();
        prev.connect(inp); prev = out;
        this.masterFxChain.push({ id: node.id, input: inp, output: out, update, stop: () => { try { modO.stop(); } catch {} } });
      } else if (node.type === 'reverb') {
        const inp = this.ctx.createGain(), out = this.ctx.createGain(), dry = this.ctx.createGain(), wet = this.ctx.createGain();
        const pre = this.ctx.createDelay(0.5), conv = this.ctx.createConvolver(), sGain = this.ctx.createGain();
        sGain.gain.value = 0;
        const dur = clampFinite(p.size, 0.2, 14, 1.4), damp = clampFinite(p.damping, 0.05, 1, 0.5);
        const len = Math.floor(this.ctx.sampleRate * dur), buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
        for (let c = 0; c < 2; c++) {
          const ch = buf.getChannelData(c); let lp = 0;
          for (let i = 0; i < len; i++) { lp += (1 - damp * 0.72) * ((Math.random() * 2 - 1) - lp); ch[i] = lp * Math.pow(1 - i / len, 1.85 + damp * 2.1) * 0.42; }
        }
        conv.buffer = buf;
        inp.connect(dry); dry.connect(out); inp.connect(pre); pre.connect(conv); conv.connect(wet); wet.connect(out);
        let sw = null;
        if (this.workletReady) {
          try {
            sw = new AudioWorkletNode(this.ctx, 'timbre-shimmer-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers' });
            pre.connect(sw); sw.connect(conv); sw.connect(sGain); sGain.connect(wet);
          } catch { sw = null; }
        }
        const update = () => {
          pre.delayTime.value = clampFinite(p.preDelay, 0, 250, 16) / 1000;
          const dm = clampFinite((Number(p.damping) || 0.5) + this._getMasterOffset(node.id, 'damping') * 0.55, 0.05, 1, 0.5);
          const sm = clampFinite((Number(p.shimmerMix) || 0) + this._getMasterOffset(node.id, 'shimmerMix') * 0.75, 0, 1, 0);
          const md = clampFinite((Number(p.modulation) || 0.25) + this._getMasterOffset(node.id, 'modulation') * 0.65, 0, 1, 0.25);
          const fr = Boolean(p.freeze);
          const mx = clampFinite((Number(p.mix) || 0.28) + this._getMasterOffset(node.id, 'mix') * 0.65, 0, 1, 0.28);
          if (sw) {
            sw.parameters.get('pitchRatio').value = Math.pow(2, clampFinite(p.shimmerPitch, -24, 24, 12) / 12);
            sw.parameters.get('shimmerMix').value = sm; sw.parameters.get('damping').value = dm;
            sw.parameters.get('modulation').value = md; sw.parameters.get('freeze').value = fr ? 1 : 0;
            sGain.gain.value = fr ? 0.85 : sm * 0.55;
          }
          dry.gain.value = 1 - mx * 0.35; wet.gain.value = mx;
        };
        update();
        prev.connect(inp); prev = out;
        this.masterFxChain.push({ id: node.id, input: inp, output: out, update, stop: () => { if (sw) try { sw.port.postMessage('stop'); } catch {} } });
      } else if (node.type === 'busCompressor') {
        const inp = this.ctx.createGain(), out = this.ctx.createGain(), dry = this.ctx.createGain(), wet = this.ctx.createGain();
        const comp = this.ctx.createDynamicsCompressor(), shaper = this.ctx.createWaveShaper(), shDry = this.ctx.createGain(), shWet = this.ctx.createGain(), makeup = this.ctx.createGain();
        shaper.oversample = '2x';
        inp.connect(dry); dry.connect(out);
        inp.connect(comp); comp.connect(shDry); shDry.connect(makeup); comp.connect(shaper); shaper.connect(shWet); shWet.connect(makeup); makeup.connect(wet); wet.connect(out);
        let lastDrive = -1;
        const update = () => {
          comp.threshold.value = clampFinite((Number(p.threshold) ?? -16) + this._getMasterOffset(node.id, 'threshold') * 20, -60, 0, -16);
          comp.ratio.value = clampFinite(p.ratio, 1, 20, 4.0);
          comp.knee.value = clampFinite(p.knee, 0, 40, 12);
          comp.attack.value = clampFinite(p.attackMs, 1, 150, 12) / 1000;
          comp.release.value = clampFinite(p.releaseMs, 20, 1000, 180) / 1000;
          const tg = clampFinite(p.tapeGlue, 0, 1, 0.22);
          const dVal = 1 + tg * 0.65 * 14;
          if (Math.abs(dVal - lastDrive) > 0.05) {
            const c = new Float32Array(1024), norm = Math.tanh(dVal) || 1;
            for (let i = 0; i < 1024; i++) { const x = (i * 2) / 1023 - 1; c[i] = Math.tanh(x * dVal) / norm; }
            shaper.curve = c; lastDrive = dVal;
          }
          shDry.gain.value = 1 - tg * 0.75; shWet.gain.value = tg * 0.75;
          makeup.gain.value = clampFinite((Number(p.makeup) || 1.25) + this._getMasterOffset(node.id, 'makeup') * 1.2, 0.2, 4.0, 1.25);
          const mx = clampFinite((Number(p.mix) ?? 0.85) + this._getMasterOffset(node.id, 'mix') * 0.75, 0, 1, 0.85);
          dry.gain.value = 1 - mx; wet.gain.value = mx;
        };
        update();
        prev.connect(inp); prev = out;
        this.masterFxChain.push({ id: node.id, input: inp, output: out, update });
      }
    }
    prev.connect(this.masterSafetyClipper);
  }

  _buildVoice(id, midi, velNorm, now) {
    const ctx = this.ctx;
    if (!ctx || !this.patch || !this.masterInputBus) return null;
    const nyquistSafe = Math.min(18000, ctx.sampleRate * 0.4);
    const baseFreq = 440 * Math.pow(2, (midi - 69) / 12);
    const voiceRandom = Math.random() * 2 - 1;
    const cleanup = [], stops = [], releases = [];
    const audioIn = new Map(), audioOut = new Map(), cvOut = new Map(), cvTarget = new Map(), modTargets = new Map();
    const track = (n) => { cleanup.push(n); return n; };
    const glideSec = clampFinite(this.patch.glideMs, 0, 1200, 0) / 1000;
    let glideConst = null;
    if (glideSec > 0.001 && this.lastNoteMidi !== null && this.lastNoteMidi !== midi && now - this.lastNoteOnTimeSec < 2.2) {
      const startCents = clampFinite((this.lastNoteMidi - midi) * 100, -2400, 2400, 0);
      if (Math.abs(startCents) > 0.5) {
        glideConst = track(ctx.createConstantSource());
        glideConst.offset.setValueAtTime(startCents, now);
        glideConst.offset.linearRampToValueAtTime(0, now + glideSec);
        glideConst.start(now);
        stops.push(() => glideConst.stop());
      }
    }

    try {
    for (const node of this.patch.nodes) {
      if (node.type === 'delay' || node.type === 'reverb' || node.type === 'busCompressor' || node.type === 'output') continue;
      if (node.bypassed) {
        const g = track(ctx.createGain());
        audioIn.set(node.id + ':in', g); audioIn.set(node.id + ':inA', g); audioOut.set(node.id + ':out', g);
        continue;
      }
      const p = node.params || {};
      if (node.type === 'oscillator') {
        const uRaw = Math.max(1, Math.min(5, Math.round(Number(p.unison) || 1)));
        const count = uRaw === 5 ? 5 : uRaw === 3 ? 3 : 1;
        const g = track(ctx.createGain()), amp = track(ctx.createGain()), pSum = track(ctx.createGain()), pConst = track(ctx.createConstantSource());
        pConst.offset.value = 0; pConst.connect(pSum); pConst.start(now); stops.push(() => pConst.stop());
        if (glideConst) glideConst.connect(pSum);
        g.gain.value = clampFinite(p.gain, 0, 1.5, 0.7) * velNorm;
        g.connect(amp);
        const wf = String(p.waveform || 'sawtooth');
        const freq = clampFinite(baseFreq * Math.pow(2, clampFinite(p.octave, -3, 3, 0) + (clampFinite(p.semitone, -24, 24, 0) + this.pitchBendSemitones) / 12), 15, nyquistSafe, 220);
        const detune = clampFinite(p.detune, -100, 100, 0);
        const uDetune = clampFinite(p.unisonDetune, 0, 60, 14);
        const spread = clampFinite(p.stereoSpread, 0, 1, 0.55);
        let altOk = false;
        if (wf in ALT_CARRIER_MODES && this.workletReady) {
          try {
            const sConst = track(ctx.createConstantSource()), pwC = track(ctx.createConstantSource()), wtC = track(ctx.createConstantSource()), vwC = track(ctx.createConstantSource()), shC = track(ctx.createConstantSource()), ncC = track(ctx.createConstantSource()), nqC = track(ctx.createConstantSource());
            [sConst, pwC, wtC, vwC, shC, ncC, nqC].forEach((c) => { c.offset.value = 0; c.start(now); stops.push(() => c.stop()); });
            const parsedH = wf === 'customHarmonics' ? parseHarmonicsArr(p.customHarmonics) : null;
            for (let i = 0; i < count; i++) {
              const w = track(new AudioWorkletNode(ctx, 'timbre-carrier-processor', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] }));
              const pan = track(ctx.createStereoPanner()), sg = track(ctx.createGain());
              sg.gain.value = 1 / Math.sqrt(count);
              const norm = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
              w.parameters.get('mode').value = ALT_CARRIER_MODES[wf];
              w.parameters.get('frequency').value = freq;
              w.parameters.get('detune').value = detune + norm * uDetune;
              w.parameters.get('pulseWidth').value = clampFinite(p.pulseWidth, 0.04, 0.96, 0.35);
              w.parameters.get('wavetableBank').value = WT_BANK_MAP[String(p.wavetableBank || 'analog')] || 0;
              w.parameters.get('wavetablePos').value = clampFinite(p.wavetablePos, 0, 1, 0.25);
              w.parameters.get('formantVowel').value = clampFinite(p.formantVowel, 0, 4, 0);
              w.parameters.get('formantShift').value = clampFinite(p.formantShift, -12, 12, 0);
              w.parameters.get('noiseCutoff').value = clampFinite(p.noiseCutoff, 0.25, 4, 1);
              w.parameters.get('noiseQ').value = clampFinite(p.noiseQ, 0.5, 32, 8);
              if (parsedH) w.port.postMessage({ type: 'harmonics', values: parsedH });
              pSum.connect(w.parameters.get('detune'));
              sConst.connect(w.parameters.get('shapeCv'));
              pwC.connect(w.parameters.get('pulseWidth'));
              wtC.connect(w.parameters.get('wavetablePos'));
              vwC.connect(w.parameters.get('formantVowel'));
              shC.connect(w.parameters.get('formantShift'));
              ncC.connect(w.parameters.get('noiseCutoff'));
              nqC.connect(w.parameters.get('noiseQ'));
              pan.pan.value = norm * spread;
              w.connect(sg); sg.connect(pan); pan.connect(g);
              stops.push(() => { try { w.port.postMessage('stop'); } catch {} });
            }
            cvTarget.set(node.id + ':shape', { param: sConst.offset, scale: 1.0 });
            modTargets.set(node.id + ':pulseWidth', { param: pwC.offset, scale: 0.45 });
            modTargets.set(node.id + ':wavetablePos', { param: wtC.offset, scale: 0.55 });
            modTargets.set(node.id + ':formantVowel', { param: vwC.offset, scale: 2.0 });
            modTargets.set(node.id + ':formantShift', { param: shC.offset, scale: 8.0 });
            modTargets.set(node.id + ':noiseCutoff', { param: ncC.offset, scale: 1.5 });
            modTargets.set(node.id + ':noiseQ', { param: nqC.offset, scale: 12.0 });
            altOk = true;
          } catch { altOk = false; }
        }
        if (!altOk) {
          for (let i = 0; i < count; i++) {
            const osc = track(ctx.createOscillator()), pan = track(ctx.createStereoPanner()), sg = track(ctx.createGain());
            sg.gain.value = 1 / Math.sqrt(count);
            if (this.periodicWaves.has(wf)) osc.setPeriodicWave(this.periodicWaves.get(wf));
            else if (wf === 'customHarmonics') {
              const r = new Float32Array(17), im = new Float32Array(17), h = parseHarmonicsArr(p.customHarmonics);
              for (let k = 0; k < 16; k++) im[k + 1] = h[k];
              osc.setPeriodicWave(ctx.createPeriodicWave(r, im));
            } else osc.type = safeOscType(wf, 'sawtooth');
            const norm = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
            osc.frequency.value = freq;
            osc.detune.value = detune + norm * uDetune;
            pan.pan.value = norm * spread;
            pSum.connect(osc.detune); osc.connect(sg); sg.connect(pan); pan.connect(g);
            osc.start(now); stops.push(() => osc.stop());
          }
        }
        audioOut.set(node.id + ':out', amp);
        cvTarget.set(node.id + ':pitch', { param: pConst.offset, scale: 1200 });
        cvTarget.set(node.id + ':amp', { param: amp.gain, scale: 0.75 });
        modTargets.set(node.id + ':pitch', { param: pConst.offset, scale: 1200 });
        modTargets.set(node.id + ':detune', { param: pConst.offset, scale: 100 });
        modTargets.set(node.id + ':gain', { param: g.gain, scale: 0.8 });
      } else if (node.type === 'fmOperator') {
        const m = track(ctx.createOscillator()), mg = track(ctx.createGain()), g = track(ctx.createGain()), amp = track(ctx.createGain());
        const nSrc = track(ctx.createBufferSource()), nBp = track(ctx.createBiquadFilter()), nFm = track(ctx.createGain()), modAudioIn = track(ctx.createGain());
        nSrc.buffer = this.noiseWhite; nSrc.loop = true; nBp.type = 'bandpass'; nBp.Q.value = 1.6;
        nBp.frequency.value = clampFinite(p.noiseBandwidth, 200, Math.min(12000, nyquistSafe * 0.9), 2400);
        nFm.gain.value = clampFinite(p.noiseFmDepth, 0, 1200, 0) * (0.45 + velNorm * 0.55);
        modAudioIn.gain.value = 650;
        const cwf = String(p.carrierWave || 'sine');
        m.type = safeOscType(p.modWave, 'sine');
        const cf = clampFinite(baseFreq * Math.pow(2, clampFinite(p.octave, -3, 3, 0) + this.pitchBendSemitones / 12), 15, Math.min(14000, nyquistSafe), 220);
        m.frequency.value = clampFinite(cf * clampFinite(p.ratio, 0.25, 16, 2), 10, nyquistSafe, 440);
        mg.gain.value = clampFinite(p.modIndex, 0, 2000, 260) * (0.4 + velNorm * 0.6);
        g.gain.value = clampFinite(p.gain, 0, 1.5, 0.75) * velNorm;
        m.connect(mg); nSrc.connect(nBp); nBp.connect(nFm); g.connect(amp);
        let altFmOk = false;
        if (cwf in ALT_CARRIER_MODES && this.workletReady) {
          try {
            const cw = track(new AudioWorkletNode(ctx, 'timbre-carrier-processor', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] }));
            const cfp = cw.parameters.get('frequency'), cdp = cw.parameters.get('detune');
            cw.parameters.get('mode').value = ALT_CARRIER_MODES[cwf];
            cfp.value = cf;
            cw.parameters.get('pulseWidth').value = clampFinite(p.pulseWidth, 0.04, 0.96, 0.35);
            cw.parameters.get('wavetableBank').value = WT_BANK_MAP[String(p.wavetableBank || 'analog')] || 0;
            cw.parameters.get('wavetablePos').value = clampFinite(p.wavetablePos, 0, 1, 0.25);
            cw.parameters.get('formantVowel').value = clampFinite(p.formantVowel, 0, 4, 0);
            cw.parameters.get('formantShift').value = clampFinite(p.formantShift, -12, 12, 0);
            cw.parameters.get('noiseCutoff').value = clampFinite(p.noiseCutoff, 0.25, 4, 1);
            cw.parameters.get('noiseQ').value = clampFinite(p.noiseQ, 0.5, 32, 8);
            if (cwf === 'customHarmonics') cw.port.postMessage({ type: 'harmonics', values: parseHarmonicsArr(p.customHarmonics) });
            mg.connect(cfp); nFm.connect(cfp); modAudioIn.connect(cfp); cw.connect(g);
            if (glideConst) { glideConst.connect(cdp); glideConst.connect(m.detune); }
            m.start(now); nSrc.start(now); stops.push(() => { try { cw.port.postMessage('stop'); } catch {} m.stop(); nSrc.stop(); });
            cvTarget.set(node.id + ':pitch', { param: cdp, scale: 1200 });
            cvTarget.set(node.id + ':shape', { param: cw.parameters.get('shapeCv'), scale: 1.0 });
            modTargets.set(node.id + ':pitch', { param: cdp, scale: 1200 });
            modTargets.set(node.id + ':pulseWidth', { param: cw.parameters.get('pulseWidth'), scale: 0.45 });
            modTargets.set(node.id + ':wavetablePos', { param: cw.parameters.get('wavetablePos'), scale: 0.55 });
            modTargets.set(node.id + ':formantVowel', { param: cw.parameters.get('formantVowel'), scale: 2.0 });
            modTargets.set(node.id + ':formantShift', { param: cw.parameters.get('formantShift'), scale: 8.0 });
            modTargets.set(node.id + ':noiseCutoff', { param: cw.parameters.get('noiseCutoff'), scale: 1.5 });
            modTargets.set(node.id + ':noiseQ', { param: cw.parameters.get('noiseQ'), scale: 12.0 });
            altFmOk = true;
          } catch { altFmOk = false; }
        }
        if (!altFmOk) {
          const c = track(ctx.createOscillator());
          c.type = safeOscType(cwf, 'sine'); c.frequency.value = cf;
          if (glideConst) { glideConst.connect(c.detune); glideConst.connect(m.detune); }
          mg.connect(c.frequency); nFm.connect(c.frequency); modAudioIn.connect(c.frequency);
          c.connect(g); c.start(now); m.start(now); nSrc.start(now); stops.push(() => { c.stop(); m.stop(); nSrc.stop(); });
          cvTarget.set(node.id + ':pitch', { param: c.detune, scale: 1200 });
          modTargets.set(node.id + ':pitch', { param: c.detune, scale: 1200 });
        }
        audioIn.set(node.id + ':modIn', modAudioIn);
        audioOut.set(node.id + ':out', amp);
        cvTarget.set(node.id + ':index', { param: mg.gain, scale: 700 });
        cvTarget.set(node.id + ':amp', { param: amp.gain, scale: 0.75 });
        modTargets.set(node.id + ':modIndex', { param: mg.gain, scale: 700 });
        modTargets.set(node.id + ':noiseFmDepth', { param: nFm.gain, scale: 550 });
        modTargets.set(node.id + ':noiseBandwidth', { param: nBp.detune, scale: 2400 });
        modTargets.set(node.id + ':gain', { param: g.gain, scale: 0.8 });
      } else if (node.type === 'physicalString') {
        const g = track(ctx.createGain()), amp = track(ctx.createGain());
        g.gain.value = clampFinite(p.gain, 0, 1.5, 0.85); g.connect(amp);
        const freq = clampFinite(baseFreq * Math.pow(2, clampFinite(p.octave, -3, 3, 0) + this.pitchBendSemitones / 12), 25, 5500, 220);
        let ok = false;
        if (this.workletReady) {
          try {
            const w = track(new AudioWorkletNode(ctx, 'timbre-karplus-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] }));
            w.onprocessorerror = () => { this.workletReady = false; };
            const excIn = track(ctx.createGain()); excIn.connect(w);
            const dp = w.parameters.get('detune');
            if (glideConst) glideConst.connect(dp);
            w.parameters.get('frequency').value = freq;
            w.parameters.get('damping').value = clampFinite(p.damping, 0.02, 0.99, 0.45);
            w.parameters.get('decay').value = clampFinite(p.decay, 0.5, 0.995, 0.985);
            w.parameters.get('brightness').value = clampFinite(p.brightness, 0.05, 1, 0.72);
            w.parameters.get('sympathetic').value = clampFinite(p.sympathetic, 0, 1, 0);
            w.parameters.get('bowPressure').value = clampFinite(p.bowPressure, 0.05, 1, 0.56);
            w.parameters.get('bowPosition').value = clampFinite(p.bowPosition, 0.04, 0.48, 0.14);
            w.parameters.get('rosin').value = clampFinite(p.rosin, 0, 1, 0.32);
            w.parameters.get('exciterMix').value = clampFinite(p.exciterMix, 0, 1, 0.7);
            w.parameters.get('excitationMode').value = p.excitation === 'bow' ? 1 : p.excitation === 'hammer' ? 2 : 0;
            w.parameters.get('velocity').value = velNorm;
            w.parameters.get('gate').setValueAtTime(1, now);
            w.connect(g);
            stops.push(() => { try { w.port.postMessage('stop'); } catch {} });
            releases.push((t) => { w.parameters.get('gate').setValueAtTime(0, t); return 0.42; });
            audioIn.set(node.id + ':exciter', excIn);
            cvTarget.set(node.id + ':pitch', { param: dp, scale: 1200 });
            cvTarget.set(node.id + ':bow', { param: w.parameters.get('bowPressure'), scale: 0.38 });
            modTargets.set(node.id + ':pitch', { param: dp, scale: 1200 });
            modTargets.set(node.id + ':bowPressure', { param: w.parameters.get('bowPressure'), scale: 0.38 });
            modTargets.set(node.id + ':damping', { param: w.parameters.get('damping'), scale: 0.35 });
            modTargets.set(node.id + ':brightness', { param: w.parameters.get('brightness'), scale: 0.4 });
            modTargets.set(node.id + ':rosin', { param: w.parameters.get('rosin'), scale: 0.45 });
            ok = true;
          } catch { this.workletReady = false; }
        }
        if (!ok) {
          const o = track(ctx.createOscillator()); o.type = 'sawtooth'; o.frequency.value = freq;
          if (glideConst) glideConst.connect(o.detune);
          o.connect(g); o.start(now); stops.push(() => o.stop());
          cvTarget.set(node.id + ':pitch', { param: o.detune, scale: 1200 });
          modTargets.set(node.id + ':pitch', { param: o.detune, scale: 1200 });
        }
        audioOut.set(node.id + ':out', amp);
        cvTarget.set(node.id + ':amp', { param: amp.gain, scale: 0.75 });
        modTargets.set(node.id + ':gain', { param: g.gain, scale: 0.7 });
      } else if (node.type === 'modalResonator') {
        const g = track(ctx.createGain()), amp = track(ctx.createGain());
        g.gain.value = clampFinite(p.gain, 0, 1.5, 0.85); g.connect(amp);
        const freq = clampFinite(baseFreq * Math.pow(2, clampFinite(p.octave, -3, 3, 0) + this.pitchBendSemitones / 12), 20, 4000, 220);
        let ok = false;
        if (this.workletReady) {
          try {
            const w = track(new AudioWorkletNode(ctx, 'timbre-modal-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] }));
            w.onprocessorerror = () => { this.workletReady = false; };
            const excIn = track(ctx.createGain()); excIn.connect(w);
            const dp = w.parameters.get('detune');
            if (glideConst) glideConst.connect(dp);
            w.parameters.get('frequency').value = freq;
            w.parameters.get('material').value = MODAL_MAT_MAP[String(p.material || 'bell')] ?? 1;
            w.parameters.get('inharmonicity').value = clampFinite(p.inharmonicity, 0, 1, 0.15);
            w.parameters.get('brightness').value = clampFinite(p.brightness, 0.05, 1, 0.65);
            w.parameters.get('decay').value = clampFinite(p.decay, 0.08, 8.0, 1.4);
            w.parameters.get('damping').value = clampFinite(p.damping, 0.02, 0.98, 0.45);
            w.parameters.get('exciterType').value = p.exciterType === 'pluck' ? 1 : p.exciterType === 'continuous' ? 2 : 0;
            w.parameters.get('exciterMix').value = clampFinite(p.exciterMix, 0, 1, 0.7);
            w.parameters.get('velocity').value = velNorm;
            w.parameters.get('gate').setValueAtTime(1, now);
            w.connect(g);
            stops.push(() => { try { w.port.postMessage('stop'); } catch {} });
            releases.push((t) => { w.parameters.get('gate').setValueAtTime(0, t); return Math.min(1.6, Math.max(0.2, clampFinite(p.decay, 0.08, 8, 1.4) * 0.45)); });
            audioIn.set(node.id + ':exciter', excIn);
            cvTarget.set(node.id + ':pitch', { param: dp, scale: 1200 });
            cvTarget.set(node.id + ':brightness', { param: w.parameters.get('brightness'), scale: 0.45 });
            modTargets.set(node.id + ':pitch', { param: dp, scale: 1200 });
            modTargets.set(node.id + ':brightness', { param: w.parameters.get('brightness'), scale: 0.45 });
            modTargets.set(node.id + ':inharmonicity', { param: w.parameters.get('inharmonicity'), scale: 0.45 });
            modTargets.set(node.id + ':damping', { param: w.parameters.get('damping'), scale: 0.4 });
            ok = true;
          } catch { this.workletReady = false; }
        }
        if (!ok) {
          const o = track(ctx.createOscillator()); o.type = 'sine'; o.frequency.value = freq;
          if (glideConst) glideConst.connect(o.detune);
          o.connect(g); o.start(now); stops.push(() => o.stop());
          cvTarget.set(node.id + ':pitch', { param: o.detune, scale: 1200 });
          modTargets.set(node.id + ':pitch', { param: o.detune, scale: 1200 });
        }
        audioOut.set(node.id + ':out', amp);
        cvTarget.set(node.id + ':amp', { param: amp.gain, scale: 0.75 });
        modTargets.set(node.id + ':gain', { param: g.gain, scale: 0.7 });
      } else if (node.type === 'blownPipe') {
        const g = track(ctx.createGain()), amp = track(ctx.createGain());
        g.gain.value = clampFinite(p.gain, 0, 1.5, 0.85); g.connect(amp);
        const freq = clampFinite(baseFreq * Math.pow(2, clampFinite(p.octave, -2, 2, 0) + this.pitchBendSemitones / 12), 25, 4000, 220);
        let ok = false;
        if (this.workletReady) {
          try {
            const w = track(new AudioWorkletNode(ctx, 'timbre-pipe-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] }));
            w.onprocessorerror = () => { this.workletReady = false; };
            const excIn = track(ctx.createGain()); excIn.connect(w);
            const dp = w.parameters.get('detune');
            if (glideConst) glideConst.connect(dp);
            w.parameters.get('frequency').value = freq;
            w.parameters.get('boreType').value = PIPE_BORE_MAP[String(p.boreType || 'flute')] ?? 0;
            w.parameters.get('breathPressure').value = clampFinite(p.breathPressure, 0.05, 1.25, 0.65);
            w.parameters.get('embouchure').value = clampFinite(p.embouchure, 0.05, 1.0, 0.55);
            w.parameters.get('breathNoise').value = clampFinite(p.breathNoise, 0, 1, 0.25);
            w.parameters.get('damping').value = clampFinite(p.damping, 0.05, 0.95, 0.38);
            w.parameters.get('overblow').value = clampFinite(p.overblow, 0, 1, 0);
            w.parameters.get('exciterMix').value = clampFinite(p.exciterMix, 0, 1, 0.5);
            w.parameters.get('velocity').value = velNorm;
            w.parameters.get('gate').setValueAtTime(1, now);
            w.connect(g);
            stops.push(() => { try { w.port.postMessage('stop'); } catch {} });
            releases.push((t) => { w.parameters.get('gate').setValueAtTime(0, t); return 0.32; });
            audioIn.set(node.id + ':exciter', excIn);
            cvTarget.set(node.id + ':pitch', { param: dp, scale: 1200 });
            cvTarget.set(node.id + ':breath', { param: w.parameters.get('breathPressure'), scale: 0.45 });
            modTargets.set(node.id + ':pitch', { param: dp, scale: 1200 });
            modTargets.set(node.id + ':breathPressure', { param: w.parameters.get('breathPressure'), scale: 0.45 });
            modTargets.set(node.id + ':embouchure', { param: w.parameters.get('embouchure'), scale: 0.4 });
            modTargets.set(node.id + ':breathNoise', { param: w.parameters.get('breathNoise'), scale: 0.5 });
            modTargets.set(node.id + ':damping', { param: w.parameters.get('damping'), scale: 0.4 });
            modTargets.set(node.id + ':overblow', { param: w.parameters.get('overblow'), scale: 0.55 });
            ok = true;
          } catch { this.workletReady = false; }
        }
        if (!ok) {
          const o = track(ctx.createOscillator()); o.type = 'triangle'; o.frequency.value = freq;
          if (glideConst) glideConst.connect(o.detune);
          o.connect(g); o.start(now); stops.push(() => o.stop());
          cvTarget.set(node.id + ':pitch', { param: o.detune, scale: 1200 });
          modTargets.set(node.id + ':pitch', { param: o.detune, scale: 1200 });
        }
        audioOut.set(node.id + ':out', amp);
        cvTarget.set(node.id + ':amp', { param: amp.gain, scale: 0.75 });
        modTargets.set(node.id + ':gain', { param: g.gain, scale: 0.7 });
      } else if (node.type === 'subHarmonic') {
        const g = track(ctx.createGain()), amp = track(ctx.createGain()), fifthCv = track(ctx.createGain());
        g.gain.value = clampFinite(p.gain, 0, 1.4, 0.72) * velNorm; fifthCv.gain.value = 1;
        fifthCv.connect(g); g.connect(amp);
        const pSum = track(ctx.createGain()), pConst = track(ctx.createConstantSource());
        pConst.offset.value = 0; pConst.connect(pSum); pConst.start(now); stops.push(() => pConst.stop());
        if (glideConst) glideConst.connect(pSum);
        const wf = safeOscType(p.waveform, 'triangle');
        const freq = clampFinite(baseFreq * Math.pow(2, clampFinite(p.octave, -2, 2, 0) + this.pitchBendSemitones / 12), 16, 14000, 220);
        const det = clampFinite(p.detune, -40, 40, 4), spread = clampFinite(p.stereoSpread, 0, 1, 0.45);
        const specs = [
          { key: 'sub2Level', mult: 0.25, pan: -0.15, dm: -1.0, up: false },
          { key: 'sub1Level', mult: 0.5, pan: 0.15, dm: -0.5, up: false },
          { key: 'fundLevel', mult: 1.0, pan: 0.0, dm: 0.0, up: false },
          { key: 'fifthLevel', mult: Math.pow(2, 7 / 12), pan: -0.75, dm: 0.65, up: true },
          { key: 'octUpLevel', mult: 2.0, pan: 0.75, dm: 1.0, up: true },
        ];
        const oscs = specs.map((s) => {
          const o = track(ctx.createOscillator()), sg = track(ctx.createGain()), pan = track(ctx.createStereoPanner());
          o.type = wf; o.frequency.value = clampFinite(freq * s.mult, 12, 18000, 220); o.detune.value = det * s.dm;
          sg.gain.value = clampFinite(p[s.key], 0, 1, 0.5) * 0.42; pan.pan.value = s.pan * spread;
          pSum.connect(o.detune); o.connect(sg); sg.connect(pan); pan.connect(s.up ? fifthCv : g);
          o.start(now); stops.push(() => o.stop());
          return sg;
        });
        audioOut.set(node.id + ':out', amp);
        cvTarget.set(node.id + ':pitch', { param: pConst.offset, scale: 1200 });
        cvTarget.set(node.id + ':fifth', { param: fifthCv.gain, scale: 0.85 });
        cvTarget.set(node.id + ':amp', { param: amp.gain, scale: 0.75 });
        modTargets.set(node.id + ':pitch', { param: pConst.offset, scale: 1200 });
        modTargets.set(node.id + ':detune', { param: pConst.offset, scale: 45 });
        modTargets.set(node.id + ':sub2Level', { param: oscs[0].gain, scale: 0.42 });
        modTargets.set(node.id + ':sub1Level', { param: oscs[1].gain, scale: 0.42 });
        modTargets.set(node.id + ':fundLevel', { param: oscs[2].gain, scale: 0.42 });
        modTargets.set(node.id + ':fifthLevel', { param: oscs[3].gain, scale: 0.42 });
        modTargets.set(node.id + ':octUpLevel', { param: oscs[4].gain, scale: 0.42 });
        modTargets.set(node.id + ':gain', { param: g.gain, scale: 0.7 });
      } else if (node.type === 'noise') {
        const src = track(ctx.createBufferSource()), bp = track(ctx.createBiquadFilter()), g = track(ctx.createGain()), amp = track(ctx.createGain());
        src.buffer = p.color === 'white' ? this.noiseWhite : this.noisePink; src.loop = true;
        bp.type = 'bandpass'; bp.frequency.value = clampFinite(p.tone, 80, Math.min(16000, nyquistSafe), 2200); bp.Q.value = clampFinite(p.q, 0.3, 16, 1.8);
        g.gain.value = clampFinite(p.gain, 0, 1.5, 0.2) * velNorm;
        src.connect(bp); bp.connect(g); g.connect(amp); src.start(now); stops.push(() => src.stop());
        audioOut.set(node.id + ':out', amp);
        cvTarget.set(node.id + ':amp', { param: amp.gain, scale: 0.75 });
        modTargets.set(node.id + ':tone', { param: bp.detune, scale: 2400 });
        modTargets.set(node.id + ':gain', { param: g.gain, scale: 0.5 });
      } else if (node.type === 'combFilter') {
        const inp = track(ctx.createGain()), out = track(ctx.createGain()), dry = track(ctx.createGain()), wet = track(ctx.createGain());
        const d = track(ctx.createDelay(0.12)), lp = track(ctx.createBiquadFilter()), fb = track(ctx.createGain()), shaper = track(ctx.createWaveShaper());
        const cCurve = new Float32Array(512); for (let i = 0; i < 512; i++) cCurve[i] = Math.tanh(((i * 2) / 511 - 1) * 1.4) / 1.4; shaper.curve = cCurve;
        lp.type = 'lowpass'; lp.frequency.value = Math.min(nyquistSafe, Math.max(900, 14500 - clampFinite(p.damping, 0, 0.95, 0.42) * 13000));
        const keyTrack = Boolean(p.keyTrack ?? true), ratio = clampFinite(p.ratio, 0.04, 4, 0.15), ms = clampFinite(p.delayMs, 0.3, 50, 4.5);
        const delayVal = clampFinite(keyTrack ? (1 / Math.max(25, baseFreq)) * ratio : ms / 1000, 0.00025, 0.09, 0.004);
        d.delayTime.value = delayVal;
        const safeDScale = Math.min(0.0022, Math.max(0.00008, delayVal * 0.55));
        const mode = String(p.mode || 'feedback'), rawFb = clampFinite(p.feedback, -0.88, 0.88, 0.56), mix = clampFinite(p.mix, 0, 1, 0.45);
        const signedFb = mode === 'feedforward' ? 0 : mode === 'feedback' ? Math.abs(rawFb) : rawFb;
        const safeFbScale = Math.min(0.24, Math.max(0.05, 0.93 - Math.abs(signedFb)));
        fb.gain.value = signedFb;
        dry.gain.value = mode === 'feedforward' ? 1 - mix * 0.15 : 1 - mix * 0.45; wet.gain.value = mix * (mode === 'feedforward' ? -0.88 : 0.6);
        inp.connect(dry); dry.connect(out); inp.connect(d); d.connect(lp); lp.connect(wet); wet.connect(out); lp.connect(shaper); shaper.connect(fb); fb.connect(d);
        audioIn.set(node.id + ':in', inp); audioOut.set(node.id + ':out', out);
        cvTarget.set(node.id + ':freq', { param: d.delayTime, scale: safeDScale });
        cvTarget.set(node.id + ':fb', { param: fb.gain, scale: safeFbScale });
        modTargets.set(node.id + ':ratio', { param: d.delayTime, scale: safeDScale });
        modTargets.set(node.id + ':delayMs', { param: d.delayTime, scale: safeDScale });
        modTargets.set(node.id + ':feedback', { param: fb.gain, scale: safeFbScale });
        modTargets.set(node.id + ':mix', { param: wet.gain, scale: 0.5 });
      } else if (node.type === 'filter') {
        const inp = track(ctx.createGain()), bq = track(ctx.createBiquadFilter());
        bq.type = safeFilterType(p.mode, 'lowpass');
        bq.frequency.value = clampFinite(clampFinite(p.cutoff, 40, nyquistSafe, 3200) + (baseFreq - 261.63) * clampFinite(p.keyTrack, 0, 1.5, 0.35) * 2.5 + this.filterCutoffMod, 40, nyquistSafe, 3200);
        const baseQ = clampFinite(p.resonance, 0.35, 18, 2.2);
        bq.Q.value = baseQ; bq.gain.value = clampFinite(p.gain, -24, 24, 6);
        inp.connect(bq);
        audioIn.set(node.id + ':in', inp); audioOut.set(node.id + ':out', bq);
        cvTarget.set(node.id + ':cutoff', { param: bq.detune, scale: 2400 });
        modTargets.set(node.id + ':cutoff', { param: bq.detune, scale: 2400 });
        modTargets.set(node.id + ':resonance', { param: bq.Q, scale: Math.min(4.0, Math.max(0.15, (baseQ - 0.35) * 0.75)) });
        modTargets.set(node.id + ':gain', { param: bq.gain, scale: 10 });
      } else if (node.type === 'parametricEq') {
        const inp = track(ctx.createGain()), ls = track(ctx.createBiquadFilter()), m1 = track(ctx.createBiquadFilter()), m2 = track(ctx.createBiquadFilter()), hs = track(ctx.createBiquadFilter()), trim = track(ctx.createGain()), amp = track(ctx.createGain());
        ls.type = 'lowshelf'; ls.frequency.value = clampFinite(p.lowFreq, 40, 2000, 180); ls.gain.value = clampFinite(p.lowGain, -18, 18, 2.5);
        m1.type = 'peaking'; m1.frequency.value = clampFinite(p.mid1Freq, 80, 6000, 420); m1.gain.value = clampFinite(p.mid1Gain, -18, 18, 5.0); m1.Q.value = clampFinite(p.mid1Q, 0.3, 12, 2.2);
        m2.type = 'peaking'; m2.frequency.value = clampFinite(p.mid2Freq, 200, Math.min(12000, nyquistSafe), 2400); m2.gain.value = clampFinite(p.mid2Gain, -18, 18, 4.5); m2.Q.value = clampFinite(p.mid2Q, 0.3, 12, 2.4);
        hs.type = 'highshelf'; hs.frequency.value = clampFinite(p.highFreq, 800, Math.min(16000, nyquistSafe), 5200); hs.gain.value = clampFinite(p.highGain, -18, 18, -2.0);
        trim.gain.value = clampFinite(p.outputGain, 0, 2, 1.0);
        inp.connect(ls); ls.connect(m1); m1.connect(m2); m2.connect(hs); hs.connect(trim); trim.connect(amp);
        audioIn.set(node.id + ':in', inp); audioOut.set(node.id + ':out', amp);
        cvTarget.set(node.id + ':amp', { param: amp.gain, scale: 0.75 });
        modTargets.set(node.id + ':lowGain', { param: ls.gain, scale: 10 });
        modTargets.set(node.id + ':mid1Freq', { param: m1.detune, scale: 1800 });
        modTargets.set(node.id + ':mid1Gain', { param: m1.gain, scale: 10 });
        modTargets.set(node.id + ':mid2Freq', { param: m2.detune, scale: 1800 });
        modTargets.set(node.id + ':mid2Gain', { param: m2.gain, scale: 10 });
        modTargets.set(node.id + ':highGain', { param: hs.gain, scale: 10 });
        modTargets.set(node.id + ':outputGain', { param: trim.gain, scale: 0.7 });
      } else if (node.type === 'shaper') {
        const inp = track(ctx.createGain()), out = track(ctx.createGain()), dry = track(ctx.createGain()), wet = track(ctx.createGain()), ws = track(ctx.createWaveShaper());
        const drive = clampFinite(p.drive, 0, 1, 0.25), asym = clampFinite(p.asymmetry, 0, 1, 0.15), mix = clampFinite(p.mix, 0, 1, 0.6);
        const curve = new Float32Array(512), k = 1 + drive * 18;
        for (let i = 0; i < 512; i++) curve[i] = Math.tanh(((i * 2) / 512 - 1 + asym * 0.35) * k) / Math.tanh(k);
        ws.curve = curve; ws.oversample = '2x';
        dry.gain.value = 1 - mix; wet.gain.value = mix;
        inp.connect(dry); dry.connect(out); inp.connect(ws); ws.connect(wet); wet.connect(out);
        audioIn.set(node.id + ':in', inp); audioOut.set(node.id + ':out', out);
        modTargets.set(node.id + ':mix', { param: wet.gain, scale: 0.6 });
      } else if (node.type === 'formantFilter') {
        const inp = track(ctx.createGain()), out = track(ctx.createGain());
        let ok = false;
        if (this.workletReady) {
          try {
            const w = track(new AudioWorkletNode(ctx, 'timbre-formant-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers' }));
            inp.connect(w); w.connect(out);
            const vp = w.parameters.get('vowel'), sp = w.parameters.get('shift'), rp = w.parameters.get('resonance'), spp = w.parameters.get('spread'), mp = w.parameters.get('mix');
            vp.value = clampFinite(p.vowel, 0, 4, 0.5); sp.value = clampFinite(p.shift, -12, 12, 0); rp.value = clampFinite(p.resonance, 1.5, 24, 7.5); spp.value = clampFinite(p.spread, 0.5, 1.6, 1.0); mp.value = clampFinite(p.mix, 0, 1, 0.9);
            stops.push(() => { try { w.port.postMessage('stop'); } catch {} });
            cvTarget.set(node.id + ':vowel', { param: vp, scale: 2.0 }); cvTarget.set(node.id + ':shift', { param: sp, scale: 8.0 });
            modTargets.set(node.id + ':vowel', { param: vp, scale: 2.0 }); modTargets.set(node.id + ':shift', { param: sp, scale: 8.0 }); modTargets.set(node.id + ':resonance', { param: rp, scale: 6.0 }); modTargets.set(node.id + ':spread', { param: spp, scale: 0.4 }); modTargets.set(node.id + ':mix', { param: mp, scale: 0.6 });
            ok = true;
          } catch {}
        }
        if (!ok) inp.connect(out);
        audioIn.set(node.id + ':in', inp); audioOut.set(node.id + ':out', out);
      } else if (node.type === 'wavefolder') {
        const inp = track(ctx.createGain()), out = track(ctx.createGain());
        let ok = false;
        if (this.workletReady) {
          try {
            const w = track(new AudioWorkletNode(ctx, 'timbre-wavefolder-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers' }));
            inp.connect(w); w.connect(out);
            const fp = w.parameters.get('folds'), sp = w.parameters.get('symmetry'), stp = w.parameters.get('stages'), tp = w.parameters.get('postTone'), mp = w.parameters.get('mix');
            fp.value = clampFinite(p.folds, 1, 8, 2.4); sp.value = clampFinite(p.symmetry, -0.65, 0.65, 0); stp.value = Math.max(1, Math.min(4, Math.round(Number(p.stages) || 2))); tp.value = clampFinite(p.postTone, 400, 16000, 7200); mp.value = clampFinite(p.mix, 0, 1, 0.85);
            stops.push(() => { try { w.port.postMessage('stop'); } catch {} });
            cvTarget.set(node.id + ':fold', { param: fp, scale: 3.5 }); cvTarget.set(node.id + ':symmetry', { param: sp, scale: 0.4 });
            modTargets.set(node.id + ':folds', { param: fp, scale: 3.5 }); modTargets.set(node.id + ':symmetry', { param: sp, scale: 0.4 }); modTargets.set(node.id + ':postTone', { param: tp, scale: 4000 }); modTargets.set(node.id + ':mix', { param: mp, scale: 0.6 });
            ok = true;
          } catch {}
        }
        if (!ok) inp.connect(out);
        audioIn.set(node.id + ':in', inp); audioOut.set(node.id + ':out', out);
      } else if (node.type === 'ringMod') {
        const carIn = track(ctx.createGain()), extIn = track(ctx.createGain()), modSum = track(ctx.createGain()), intG = track(ctx.createGain()), extG = track(ctx.createGain()), modOsc = track(ctx.createOscillator()), out = track(ctx.createGain());
        const modSource = String(p.modSource || 'internal'), tuneMode = String(p.tuneMode || 'keyTrack');
        const oscFreq = tuneMode === 'freeHz' ? clampFinite(p.frequency, 20, 4000, 320) : clampFinite(baseFreq * clampFinite(p.ratio, 0.125, 8.0, 1.41), 15, nyquistSafe, 320);
        modOsc.type = safeOscType(p.waveform, 'sine'); modOsc.frequency.value = oscFreq;
        intG.gain.value = modSource === 'external' ? 0 : 1; extG.gain.value = modSource === 'internal' ? 0 : 1;
        modOsc.connect(intG); intG.connect(modSum); extIn.connect(extG); extG.connect(modSum);
        let ok = false;
        if (this.workletReady) {
          try {
            const w = track(new AudioWorkletNode(ctx, 'timbre-ringmod-processor', { numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers' }));
            carIn.connect(w, 0, 0); modSum.connect(w, 0, 1); w.connect(out);
            const mp = w.parameters.get('mix'), dp = w.parameters.get('drive');
            w.parameters.get('mode').value = RINGMOD_MAP[String(p.mode || 'ring')] ?? 0;
            dp.value = clampFinite(p.drive, 0.3, 3.0, 1.0); mp.value = clampFinite(p.mix, 0, 1, 0.75);
            modOsc.start(now); stops.push(() => { modOsc.stop(); try { w.port.postMessage('stop'); } catch {} });
            cvTarget.set(node.id + ':freq', { param: modOsc.detune, scale: 1200 }); cvTarget.set(node.id + ':mix', { param: mp, scale: 0.6 });
            modTargets.set(node.id + ':frequency', { param: modOsc.detune, scale: 1200 }); modTargets.set(node.id + ':ratio', { param: modOsc.detune, scale: 1200 }); modTargets.set(node.id + ':drive', { param: dp, scale: 0.8 }); modTargets.set(node.id + ':mix', { param: mp, scale: 0.6 });
            ok = true;
          } catch {}
        }
        if (!ok) { modOsc.start(now); stops.push(() => modOsc.stop()); carIn.connect(out); }
        audioIn.set(node.id + ':in', carIn); audioIn.set(node.id + ':mod', extIn); audioOut.set(node.id + ':out', out);
      } else if (node.type === 'bitcrusher') {
        const inp = track(ctx.createGain()), out = track(ctx.createGain());
        let ok = false;
        if (this.workletReady) {
          try {
            const w = track(new AudioWorkletNode(ctx, 'timbre-bitcrusher-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers' }));
            inp.connect(w); w.connect(out);
            const bp = w.parameters.get('bits'), dp = w.parameters.get('downsample'), tp = w.parameters.get('postTone'), mp = w.parameters.get('mix');
            bp.value = clampFinite(p.bits, 2, 16, 8); dp.value = clampFinite(p.downsample, 1, 32, 4); w.parameters.get('dither').value = clampFinite(p.dither, 0, 1, 0.12); tp.value = clampFinite(p.postTone, 400, 16000, 9500); mp.value = clampFinite(p.mix, 0, 1, 0.8);
            stops.push(() => { try { w.port.postMessage('stop'); } catch {} });
            cvTarget.set(node.id + ':bits', { param: bp, scale: 6.0 }); cvTarget.set(node.id + ':rate', { param: dp, scale: 12.0 });
            modTargets.set(node.id + ':bits', { param: bp, scale: 6.0 }); modTargets.set(node.id + ':downsample', { param: dp, scale: 12.0 }); modTargets.set(node.id + ':postTone', { param: tp, scale: 4500 }); modTargets.set(node.id + ':mix', { param: mp, scale: 0.6 });
            ok = true;
          } catch {}
        }
        if (!ok) inp.connect(out);
        audioIn.set(node.id + ':in', inp); audioOut.set(node.id + ':out', out);
      } else if (node.type === 'crossfader') {
        const inA = track(ctx.createGain()), inB = track(ctx.createGain()), amp = track(ctx.createGain());
        let ok = false;
        if (this.workletReady) {
          try {
            const w = track(new AudioWorkletNode(ctx, 'timbre-crossfader-processor', { numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers' }));
            inA.connect(w, 0, 0); inB.connect(w, 0, 1); w.connect(amp);
            const bp = w.parameters.get('balance'), ga = w.parameters.get('gainA'), gb = w.parameters.get('gainB'), og = w.parameters.get('outputGain');
            bp.value = clampFinite(p.balance, 0, 1, 0.5); w.parameters.get('curve').value = CROSSFADE_MAP[String(p.curve || 'equalPower')] ?? 0; ga.value = clampFinite(p.gainA, 0, 1.5, 1.0); gb.value = clampFinite(p.gainB, 0, 1.5, 1.0); og.value = clampFinite(p.outputGain, 0, 1.5, 1.0);
            stops.push(() => { try { w.port.postMessage('stop'); } catch {} });
            cvTarget.set(node.id + ':fade', { param: bp, scale: 0.5 });
            modTargets.set(node.id + ':balance', { param: bp, scale: 0.5 }); modTargets.set(node.id + ':gainA', { param: ga, scale: 0.6 }); modTargets.set(node.id + ':gainB', { param: gb, scale: 0.6 }); modTargets.set(node.id + ':outputGain', { param: og, scale: 0.6 });
            ok = true;
          } catch {}
        }
        if (!ok) { inA.connect(amp); inB.connect(amp); }
        audioIn.set(node.id + ':inA', inA); audioIn.set(node.id + ':inB', inB); audioOut.set(node.id + ':out', amp);
        cvTarget.set(node.id + ':amp', { param: amp.gain, scale: 0.75 });
      } else if (node.type === 'chorus') {
        const inp = track(ctx.createGain()), out = track(ctx.createGain()), dry = track(ctx.createGain()), wet = track(ctx.createGain()), lp = track(ctx.createBiquadFilter());
        lp.type = 'lowpass'; lp.frequency.value = clampFinite(p.tone, 400, 14000, 6400);
        const mx = clampFinite(p.mix, 0, 1, 0.52); dry.gain.value = 1 - mx * 0.42; wet.gain.value = mx * 0.95;
        inp.connect(dry); dry.connect(out);
        const tc = Math.max(2, Math.min(6, Math.round(Number(p.voices) || 4))), rate = clampFinite(p.rate, 0.04, 4.5, 0.42), depth = clampFinite(p.depth, 0, 1, 0.55), w = clampFinite(p.stereoWidth, 0, 1, 0.85);
        const mc = track(ctx.createConstantSource()), rc = track(ctx.createGain()), dc = track(ctx.createGain());
        mc.offset.value = 1; mc.start(now); stops.push(() => mc.stop()); rc.gain.value = 0; dc.gain.value = 0; mc.connect(rc); mc.connect(dc);
        for (let i = 0; i < tc; i++) {
          const d = track(ctx.createDelay(0.06)), lfo = track(ctx.createOscillator()), dg = track(ctx.createGain()), pan = track(ctx.createStereoPanner()), tg = track(ctx.createGain());
          d.delayTime.value = 0.008 + i * 0.0032; lfo.frequency.value = rate * (0.84 + (i / Math.max(1, tc - 1)) * 0.34);
          dg.gain.value = depth * 0.0042; tg.gain.value = 1 / Math.sqrt(tc); pan.pan.value = ((i / (tc - 1)) * 2 - 1) * w;
          inp.connect(d); rc.connect(lfo.frequency); dc.connect(dg.gain); lfo.connect(dg); dg.connect(d.delayTime); d.connect(tg); tg.connect(pan); pan.connect(lp);
          lfo.start(now); stops.push(() => lfo.stop());
        }
        lp.connect(wet); wet.connect(out);
        audioIn.set(node.id + ':in', inp); audioOut.set(node.id + ':out', out);
        cvTarget.set(node.id + ':rate', { param: rc.gain, scale: 1.5 }); cvTarget.set(node.id + ':depth', { param: dc.gain, scale: 0.004 });
        modTargets.set(node.id + ':rate', { param: rc.gain, scale: 1.5 }); modTargets.set(node.id + ':depth', { param: dc.gain, scale: 0.004 }); modTargets.set(node.id + ':mix', { param: wet.gain, scale: 0.6 });
      } else if (node.type === 'granularCloud') {
        const inp = track(ctx.createGain()), out = track(ctx.createGain());
        let ok = false;
        if (this.workletReady) {
          try {
            const gw = track(new AudioWorkletNode(ctx, 'timbre-granular-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers' }));
            inp.connect(gw); gw.connect(out);
            const gsp = gw.parameters.get('grainSize'), dnp = gw.parameters.get('density'), pp = gw.parameters.get('pitchShift'), spp = gw.parameters.get('spray'), fbp = gw.parameters.get('feedback'), mxp = gw.parameters.get('mix');
            gsp.value = clampFinite(p.grainSize, 20, 450, 165); dnp.value = clampFinite(p.density, 1, 24, 11); pp.value = clampFinite(p.pitchShift, -24, 24, 12);
            gw.parameters.get('pitchSnap').value = p.pitchSnap === 'octave' ? 1 : p.pitchSnap === 'free' ? 2 : 0;
            spp.value = clampFinite(p.spray, 0, 1, 0.45); gw.parameters.get('stereoScatter').value = clampFinite(p.stereoScatter, 0, 1, 0.78);
            fbp.value = clampFinite(p.feedback, 0, 0.75, 0.25); gw.parameters.get('freeze').value = p.freeze ? 1 : 0; mxp.value = clampFinite(p.mix, 0, 1, 0.55);
            stops.push(() => { try { gw.port.postMessage('stop'); } catch {} });
            audioIn.set(node.id + ':in', inp); audioOut.set(node.id + ':out', out);
            cvTarget.set(node.id + ':pitch', { param: pp, scale: 12 }); cvTarget.set(node.id + ':density', { param: dnp, scale: 10 }); cvTarget.set(node.id + ':mix', { param: mxp, scale: 0.65 });
            modTargets.set(node.id + ':grainSize', { param: gsp, scale: 140 }); modTargets.set(node.id + ':density', { param: dnp, scale: 10 }); modTargets.set(node.id + ':pitchShift', { param: pp, scale: 12 }); modTargets.set(node.id + ':spray', { param: spp, scale: 0.5 }); modTargets.set(node.id + ':feedback', { param: fbp, scale: 0.35 }); modTargets.set(node.id + ':mix', { param: mxp, scale: 0.65 });
            ok = true;
          } catch { ok = false; }
        }
        if (!ok) {
          const dry = track(ctx.createGain()), wet = track(ctx.createGain()), d1 = track(ctx.createDelay(0.5)), mx = clampFinite(p.mix, 0, 1, 0.55);
          d1.delayTime.value = 0.11; dry.gain.value = 1 - mx * 0.4; wet.gain.value = mx;
          inp.connect(dry); dry.connect(out); inp.connect(d1); d1.connect(wet); wet.connect(out);
          audioIn.set(node.id + ':in', inp); audioOut.set(node.id + ':out', out);
        }
      } else if (node.type === 'phaser') {
        const inp = track(ctx.createGain()), out = track(ctx.createGain());
        let ok = false;
        if (this.workletReady) {
          try {
            const w = track(new AudioWorkletNode(ctx, 'timbre-phaser-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers' }));
            inp.connect(w); w.connect(out);
            const rp = w.parameters.get('rate'), dp = w.parameters.get('depth'), cp = w.parameters.get('centerFreq'), fp = w.parameters.get('feedback'), mp = w.parameters.get('mix');
            w.parameters.get('mode').value = PHASER_MODE_MAP[String(p.mode || 'phaser')] ?? 0;
            rp.value = clampFinite(p.rate, 0.03, 8.0, 0.45); dp.value = clampFinite(p.depth, 0, 1, 0.65); cp.value = clampFinite(p.centerFreq, 120, 5000, 900);
            fp.value = clampFinite(p.feedback, -0.88, 0.88, 0.55); w.parameters.get('stereoPhase').value = clampFinite(p.stereoPhase, 0, 180, 90); mp.value = clampFinite(p.mix, 0, 1, 0.6);
            stops.push(() => { try { w.port.postMessage('stop'); } catch {} });
            audioIn.set(node.id + ':in', inp); audioOut.set(node.id + ':out', out);
            cvTarget.set(node.id + ':rate', { param: rp, scale: 2.5 }); cvTarget.set(node.id + ':center', { param: cp, scale: 1200 }); cvTarget.set(node.id + ':mix', { param: mp, scale: 0.6 });
            modTargets.set(node.id + ':rate', { param: rp, scale: 2.5 }); modTargets.set(node.id + ':depth', { param: dp, scale: 0.5 }); modTargets.set(node.id + ':centerFreq', { param: cp, scale: 1200 }); modTargets.set(node.id + ':mix', { param: mp, scale: 0.6 });
            ok = true;
          } catch {}
        }
        if (!ok) {
          const dry = track(ctx.createGain()), wet = track(ctx.createGain()), lfo = track(ctx.createOscillator()), lg = track(ctx.createGain()), mx = clampFinite(p.mix, 0, 1, 0.6);
          const aps = [0, 1, 2, 3].map(() => { const a = track(ctx.createBiquadFilter()); a.type = 'allpass'; a.frequency.value = clampFinite(p.centerFreq, 120, 5000, 900); return a; });
          lfo.frequency.value = clampFinite(p.rate, 0.03, 8.0, 0.45); lg.gain.value = clampFinite(p.depth, 0, 1, 0.65) * 1800; lfo.connect(lg);
          aps.forEach((a, i) => { lg.connect(a.detune); if (i === 0) inp.connect(a); else aps[i - 1].connect(a); });
          dry.gain.value = 1 - mx * 0.4; wet.gain.value = mx * 0.85;
          inp.connect(dry); dry.connect(out); aps[3].connect(wet); wet.connect(out); lfo.start(now); stops.push(() => lfo.stop());
          audioIn.set(node.id + ':in', inp); audioOut.set(node.id + ':out', out);
          cvTarget.set(node.id + ':rate', { param: lfo.frequency, scale: 2.5 }); cvTarget.set(node.id + ':center', { param: aps[0].frequency, scale: 1200 }); cvTarget.set(node.id + ':mix', { param: wet.gain, scale: 0.6 });
          modTargets.set(node.id + ':rate', { param: lfo.frequency, scale: 2.5 }); modTargets.set(node.id + ':mix', { param: wet.gain, scale: 0.6 });
        }
      } else if (node.type === 'envelope') {
        const vca = track(ctx.createGain()), vcaAmp = track(ctx.createGain()), cs = track(ctx.createConstantSource()), cvg = track(ctx.createGain());
        vca.connect(vcaAmp); cs.offset.value = 1; cs.connect(cvg); cs.start(now); stops.push(() => cs.stop());
        const a = clampFinite(p.attack, 0.002, 14, 0.015), d = clampFinite(p.decay, 0.005, 14, 0.35);
        const s = clampFinite(p.sustain, 0, 1, 0.65), r = clampFinite(p.release, 0.01, 18, 0.45);
        const isAmbient = String(p.curve || 'standard') === 'ambient';
        const vs = clampFinite(p.velocitySens, 0, 1, 0.7);
        const peak = Math.max(0.01, (1 - vs) + vs * velNorm);
        const computeAdsrAt = (elapsed) => {
          if (elapsed <= 0) return 0.0001;
          if (elapsed < a) {
            const fr = Math.min(1, elapsed / a);
            return Math.max(0.0001, 0.0001 + (peak - 0.0001) * (isAmbient ? fr * fr * (3 - 2 * fr) : fr));
          }
          const sl = Math.max(0.0001, peak * s);
          if (elapsed < a + d) return Math.max(0.0001, peak * Math.pow(sl / peak, Math.min(1, (elapsed - a) / d)));
          return sl;
        };
        [vca.gain, cvg.gain].forEach((param) => {
          param.cancelScheduledValues(now);
          param.setValueAtTime(0.0001, now);
          if (isAmbient && a >= 0.08) {
            param.linearRampToValueAtTime(peak * 0.28, now + a * 0.45);
            param.linearRampToValueAtTime(peak, now + a);
          } else param.linearRampToValueAtTime(peak, now + a);
          param.exponentialRampToValueAtTime(Math.max(0.0001, peak * s), now + a + d);
        });
        releases.push((t) => {
          const safeT = Math.max(now, t);
          const fallbackVal = computeAdsrAt(safeT - now);
          [vca.gain, cvg.gain].forEach((param) => {
            if (typeof param.cancelAndHoldAtTime === 'function') {
              try { param.cancelAndHoldAtTime(safeT); }
              catch { param.cancelScheduledValues(safeT); param.setValueAtTime(fallbackVal, safeT); }
            } else {
              param.cancelScheduledValues(safeT);
              param.setValueAtTime(fallbackVal, safeT);
            }
            param.exponentialRampToValueAtTime(0.0001, safeT + r);
          });
          return r;
        });
        audioIn.set(node.id + ':in', vca); audioOut.set(node.id + ':out', vcaAmp); cvOut.set(node.id + ':cv', cvg);
        cvTarget.set(node.id + ':amp', { param: vcaAmp.gain, scale: 0.65 });
        modTargets.set(node.id + ':amp', { param: vcaAmp.gain, scale: 0.65 });
      } else if (node.type === 'lfo') {
        const wfMode = String(p.waveform || 'sine'), isW = wfMode === 'wander', isSV = wfMode === 'sharpVibrato';
        const rate = clampFinite(p.rate, 0.015, 40, 5.2), delayS = clampFinite(p.delay, 0, 8, 0.18);
        const humanRate = isSV ? rate * (1 + voiceRandom * 0.045) : rate;
        const osc = track(ctx.createOscillator()), dg = track(ctx.createGain()), g = track(ctx.createGain());
        dg.gain.setValueAtTime(0.0001, now);
        if (delayS > 0.01) { dg.gain.setValueAtTime(0.0001, now + delayS * 0.35); dg.gain.linearRampToValueAtTime(1, now + delayS); }
        else dg.gain.setValueAtTime(1, now);
        osc.frequency.value = humanRate; g.gain.value = clampFinite(p.depth, 0, 1.5, 0.35) * (1 + this.modWheel * 1.4);
        if (isW) {
          const o2 = track(ctx.createOscillator()), o3 = track(ctx.createOscillator()), g1 = track(ctx.createGain()), g2 = track(ctx.createGain()), g3 = track(ctx.createGain());
          o2.frequency.value = rate * 1.4142; o3.frequency.value = rate * 0.618;
          g1.gain.value = 0.5; g2.gain.value = 0.32; g3.gain.value = 0.22;
          osc.connect(g1); o2.connect(g2); o3.connect(g3); g1.connect(dg); g2.connect(dg); g3.connect(dg);
          osc.start(now); o2.start(now); o3.start(now); stops.push(() => { osc.stop(); o2.stop(); o3.stop(); });
        } else if (isSV) {
          const o2 = track(ctx.createOscillator()), biasC = track(ctx.createConstantSource()), g1 = track(ctx.createGain()), g2 = track(ctx.createGain());
          osc.type = 'sine'; o2.type = 'sine'; o2.frequency.value = humanRate * 0.37; biasC.offset.value = 0.42;
          g1.gain.value = 0.48; g2.gain.value = 0.12;
          osc.connect(g1); o2.connect(g2); g1.connect(dg); g2.connect(dg); biasC.connect(dg);
          osc.start(now); o2.start(now); biasC.start(now); stops.push(() => { osc.stop(); o2.stop(); biasC.stop(); });
        } else {
          osc.type = safeOscType(p.waveform, 'sine'); osc.connect(dg); osc.start(now); stops.push(() => osc.stop());
        }
        dg.connect(g);
        cvOut.set(node.id + ':cv', g);
        modTargets.set(node.id + ':rate', { param: osc.frequency, scale: 6 });
        modTargets.set(node.id + ':depth', { param: g.gain, scale: 0.6 });
      } else if (node.type === 'sampleHold') {
        const sIn = track(ctx.createConstantSource()); sIn.offset.value = 0; sIn.start(now); stops.push(() => sIn.stop());
        let ok = false;
        if (this.workletReady) {
          try {
            const w = track(new AudioWorkletNode(ctx, 'timbre-samplehold-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] }));
            sIn.connect(w); stops.push(() => { try { w.port.postMessage('stop'); } catch {} });
            const rp = w.parameters.get('rate'), sp = w.parameters.get('slew'), dp = w.parameters.get('depth');
            w.parameters.get('mode').value = SH_MODE_MAP[String(p.sourceMode || 'random')] ?? 0;
            rp.value = clampFinite(p.rate, 0.2, 30, 4.5); sp.value = clampFinite(p.slew, 0, 1, 0.15); dp.value = clampFinite(p.depth, 0, 1.5, 0.65);
            w.parameters.get('unipolar').value = p.unipolar ? 1 : 0; w.parameters.get('seed').value = 1000 + ((this.voiceCounter * 7919) % 90000);
            cvOut.set(node.id + ':cv', w); cvTarget.set(node.id + ':in', { param: sIn.offset, scale: 1.0 }); cvTarget.set(node.id + ':rate', { param: rp, scale: 10.0 });
            modTargets.set(node.id + ':rate', { param: rp, scale: 10.0 }); modTargets.set(node.id + ':slew', { param: sp, scale: 0.5 }); modTargets.set(node.id + ':depth', { param: dp, scale: 0.65 });
            ok = true;
          } catch {}
        }
        if (!ok) {
          const fc = track(ctx.createConstantSource()), fg = track(ctx.createGain()); fc.offset.value = (Math.random() * 2 - 1) * clampFinite(p.depth, 0, 1.5, 0.65);
          fc.connect(fg); fc.start(now); stops.push(() => fc.stop()); cvOut.set(node.id + ':cv', fg); cvTarget.set(node.id + ':in', { param: sIn.offset, scale: 1.0 });
        }
      } else if (node.type === 'slopeEnv') {
        let ok = false;
        if (this.workletReady) {
          try {
            const w = track(new AudioWorkletNode(ctx, 'timbre-slope-processor', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] }));
            stops.push(() => { try { w.port.postMessage('stop'); } catch {} });
            const rp = w.parameters.get('rise'), fp = w.parameters.get('fall'), dp = w.parameters.get('depth'), gp = w.parameters.get('gate');
            w.parameters.get('mode').value = SLOPE_MODE_MAP[String(p.mode || 'oneShot')] ?? 0;
            rp.value = clampFinite(p.rise, 0.002, 10, 0.04); fp.value = clampFinite(p.fall, 0.004, 12, 0.45);
            w.parameters.get('shape').value = clampFinite(p.shape, -1, 1, 0.35); dp.value = clampFinite(p.depth, 0, 1.5, 0.85);
            w.parameters.get('bipolar').value = p.bipolar ? 1 : 0; gp.value = 1;
            releases.push((t) => { gp.setValueAtTime(0, Math.max(now, t)); return clampFinite(p.fall, 0.01, 4.0, 0.25); });
            cvOut.set(node.id + ':cv', w); cvTarget.set(node.id + ':riseCv', { param: rp, scale: 0.8 }); cvTarget.set(node.id + ':fallCv', { param: fp, scale: 1.5 });
            modTargets.set(node.id + ':rise', { param: rp, scale: 0.8 }); modTargets.set(node.id + ':fall', { param: fp, scale: 1.5 }); modTargets.set(node.id + ':depth', { param: dp, scale: 0.65 });
            ok = true;
          } catch {}
        }
        if (!ok) {
          const fc = track(ctx.createConstantSource()), fg = track(ctx.createGain()); fc.offset.value = 1;
          const rs = clampFinite(p.rise, 0.002, 6, 0.04), fl = clampFinite(p.fall, 0.005, 8, 0.45), dp = clampFinite(p.depth, 0, 1.5, 0.85);
          fg.gain.setValueAtTime(0.0001, now); fg.gain.linearRampToValueAtTime(dp, now + rs); fg.gain.linearRampToValueAtTime(0.0001, now + rs + fl);
          fc.connect(fg); fc.start(now); stops.push(() => fc.stop()); cvOut.set(node.id + ':cv', fg);
        }
      } else if (node.type === 'stepSequencer') {
        let ok = false;
        if (this.workletReady) {
          try {
            const w = track(new AudioWorkletNode(ctx, 'timbre-stepseq-processor', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] }));
            stops.push(() => { try { w.port.postMessage('stop'); } catch {} });
            const rp = w.parameters.get('rate'), gp = w.parameters.get('glide'), dp = w.parameters.get('depth');
            rp.value = clampFinite(p.rate, 0.2, 30, 4.0); w.parameters.get('steps').value = Math.max(2, Math.min(8, Math.round(Number(p.steps) || 8)));
            w.parameters.get('direction').value = SEQ_DIR_MAP[String(p.direction || 'forward')] ?? 0;
            gp.value = clampFinite(p.glide, 0, 1, 0.08); dp.value = clampFinite(p.depth, 0, 1.5, 0.7);
            w.parameters.get('seed').value = 300 + ((this.voiceCounter * 3571) % 80000);
            for (let s = 1; s <= 8; s++) w.parameters.get('step' + s).value = clampFinite(p['step' + s], -1, 1, 0);
            cvOut.set(node.id + ':cv', w); cvTarget.set(node.id + ':rate', { param: rp, scale: 8.0 });
            modTargets.set(node.id + ':rate', { param: rp, scale: 8.0 }); modTargets.set(node.id + ':glide', { param: gp, scale: 0.5 }); modTargets.set(node.id + ':depth', { param: dp, scale: 0.65 });
            ok = true;
          } catch {}
        }
        if (!ok) {
          const fc = track(ctx.createConstantSource()), fg = track(ctx.createGain()); fc.offset.value = clampFinite(p.step1, -1, 1, 0.8) * clampFinite(p.depth, 0, 1.5, 0.7);
          fc.connect(fg); fc.start(now); stops.push(() => fc.stop()); cvOut.set(node.id + ':cv', fg);
        }
      } else if (node.type === 'envFollower') {
        const sIn = track(ctx.createGain()); let ok = false;
        if (this.workletReady) {
          try {
            const w = track(new AudioWorkletNode(ctx, 'timbre-envfollower-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] }));
            sIn.connect(w); stops.push(() => { try { w.port.postMessage('stop'); } catch {} });
            const sp = w.parameters.get('sensitivity'), dp = w.parameters.get('depth');
            w.parameters.get('attackMs').value = clampFinite(p.attackMs, 1, 250, 8); w.parameters.get('releaseMs').value = clampFinite(p.releaseMs, 10, 1500, 140);
            sp.value = clampFinite(p.sensitivity, 0.2, 4.0, 1.5); w.parameters.get('invert').value = p.invert ? 1 : 0; dp.value = clampFinite(p.depth, 0, 1.5, 1.0);
            audioIn.set(node.id + ':in', sIn); cvOut.set(node.id + ':cv', w);
            modTargets.set(node.id + ':sensitivity', { param: sp, scale: 1.5 }); modTargets.set(node.id + ':depth', { param: dp, scale: 0.65 });
            ok = true;
          } catch {}
        }
        if (!ok) {
          const fc = track(ctx.createConstantSource()), fg = track(ctx.createGain()); fc.offset.value = 0; fc.connect(fg); fc.start(now); stops.push(() => fc.stop());
          audioIn.set(node.id + ':in', sIn); cvOut.set(node.id + ':cv', fg);
        }
      } else if (node.type === 'quantizer') {
        const iC = track(ctx.createConstantSource()); iC.offset.value = 0; iC.start(now); stops.push(() => iC.stop());
        let ok = false;
        if (this.workletReady) {
          try {
            const w = track(new AudioWorkletNode(ctx, 'timbre-quantizer-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] }));
            iC.connect(w); stops.push(() => { try { w.port.postMessage('stop'); } catch {} });
            const op = w.parameters.get('octaves'), tp = w.parameters.get('transpose');
            w.parameters.get('scale').value = QUANT_SCALE_MAP[String(p.scale || 'pentatonicMinor')] ?? 3;
            w.parameters.get('root').value = Math.max(0, Math.min(11, Math.round(Number(p.root) || 0)));
            op.value = clampFinite(p.octaves, 0.25, 3.0, 1.0); tp.value = clampFinite(p.transpose, -24, 24, 0);
            w.parameters.get('glideMs').value = clampFinite(p.glideMs, 0, 200, 0);
            cvOut.set(node.id + ':cv', w); cvTarget.set(node.id + ':in', { param: iC.offset, scale: 1.0 });
            modTargets.set(node.id + ':transpose', { param: tp, scale: 12 }); modTargets.set(node.id + ':octaves', { param: op, scale: 1.0 });
            ok = true;
          } catch {}
        }
        if (!ok) {
          const fg = track(ctx.createGain()); fg.gain.value = clampFinite(p.octaves, 0.25, 3.0, 1.0);
          iC.connect(fg); cvOut.set(node.id + ':cv', fg); cvTarget.set(node.id + ':in', { param: iC.offset, scale: 1.0 });
        }
      } else if (node.type === 'cvUtility') {
        const aC = track(ctx.createConstantSource()), bC = track(ctx.createConstantSource());
        aC.offset.value = 0; bC.offset.value = 0; aC.start(now); bC.start(now); stops.push(() => { aC.stop(); bC.stop(); });
        let ok = false;
        if (this.workletReady) {
          try {
            const w = track(new AudioWorkletNode(ctx, 'timbre-cvutil-processor', { numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [1] }));
            aC.connect(w, 0, 0); bC.connect(w, 0, 1); stops.push(() => { try { w.port.postMessage('stop'); } catch {} });
            const gAp = w.parameters.get('gainA'), gBp = w.parameters.get('gainB'), op = w.parameters.get('offset');
            gAp.value = clampFinite(p.gainA, -2, 2, 1.0); gBp.value = clampFinite(p.gainB, -2, 2, 0.5); op.value = clampFinite(p.offset, -1.5, 1.5, 0);
            w.parameters.get('rectify').value = CV_RECT_MAP[String(p.rectify || 'none')] ?? 0;
            w.parameters.get('slewMs').value = clampFinite(p.slewMs, 0, 250, 0);
            cvOut.set(node.id + ':cv', w); cvTarget.set(node.id + ':inA', { param: aC.offset, scale: 1.0 }); cvTarget.set(node.id + ':inB', { param: bC.offset, scale: 1.0 });
            modTargets.set(node.id + ':gainA', { param: gAp, scale: 1.0 }); modTargets.set(node.id + ':gainB', { param: gBp, scale: 1.0 }); modTargets.set(node.id + ':offset', { param: op, scale: 0.75 });
            ok = true;
          } catch {}
        }
        if (!ok) {
          const gA = track(ctx.createGain()), gB = track(ctx.createGain()), oC = track(ctx.createConstantSource()), oS = track(ctx.createGain());
          gA.gain.value = clampFinite(p.gainA, -2, 2, 1.0); gB.gain.value = clampFinite(p.gainB, -2, 2, 0.5); oC.offset.value = clampFinite(p.offset, -1.5, 1.5, 0);
          aC.connect(gA); gA.connect(oS); bC.connect(gB); gB.connect(oS); oC.connect(oS); oC.start(now); stops.push(() => oC.stop());
          cvOut.set(node.id + ':cv', oS); cvTarget.set(node.id + ':inA', { param: aC.offset, scale: 1.0 }); cvTarget.set(node.id + ':inB', { param: bC.offset, scale: 1.0 });
        }
      }
    }

    const masterEntry = this.masterFxChain.length ? this.masterFxChain[0].input : this.masterInputBus;
    const fxIndex = new Map(this.masterFxChain.map((f, i) => [f.id, i]));
    for (const c of this.patch.connections) {
      const sa = audioOut.get(c.fromNode + ':' + c.fromPort);
      const sc = cvOut.get(c.fromNode + ':' + c.fromPort);
      if (sa) {
        const targetNode = this.patch.nodes.find((n) => n.id === c.toNode);
        if (targetNode && (targetNode.type === 'delay' || targetNode.type === 'reverb' || targetNode.type === 'busCompressor' || targetNode.type === 'output')) {
          const idx = fxIndex.get(c.toNode);
          const sg = track(ctx.createGain()); sg.gain.value = clampFinite(c.amount, 0, 2, 1);
          sa.connect(sg); sg.connect(idx !== undefined ? this.masterFxChain[idx].input : masterEntry);
        } else {
          const ti = audioIn.get(c.toNode + ':' + c.toPort);
          if (ti) { const lg = track(ctx.createGain()); lg.gain.value = clampFinite(c.amount, 0, 2, 1); sa.connect(lg); lg.connect(ti); }
        }
      } else if (sc) {
        const tc = cvTarget.get(c.toNode + ':' + c.toPort);
        if (tc) { const ag = track(ctx.createGain()); ag.gain.value = clampFinite(c.amount, -1.5, 1.5, 0.2) * tc.scale; sc.connect(ag); ag.connect(tc.param); }
      }
    }

    if (Array.isArray(this.patch.modMatrix) && this.patch.modMatrix.length > 0) {
      const cs = track(ctx.createConstantSource()); cs.offset.value = 1; cs.start(now); stops.push(() => cs.stop());
      let matrixNoiseOut = null;
      const getMatrixNoise = () => {
        if (!matrixNoiseOut) {
          const src = track(ctx.createBufferSource()), lp = track(ctx.createBiquadFilter());
          src.buffer = this.noisePink; src.loop = true; lp.type = 'lowpass'; lp.frequency.value = 45;
          src.connect(lp); src.start(now); stops.push(() => src.stop());
          matrixNoiseOut = lp;
        }
        return matrixNoiseOut;
      };
      const getStatic = (s) => (s === 'velocity' ? velNorm : s === 'keyTrack' ? Math.max(-1, Math.min(1, (midi - 60) / 36)) : s === 'modWheel' ? this.modWheel : s === 'macroX' ? this.macroX : s === 'macroY' ? this.macroY : s === 'random' ? voiceRandom : null);
      for (const slot of this.patch.modMatrix) {
        if (!slot.enabled) continue;
        const t = modTargets.get(slot.targetNodeId + ':' + slot.targetParam);
        if (!t) continue;
        const srcCv = slot.source === 'noise' ? getMatrixNoise() : (cvOut.get(slot.source + ':cv') || null);
        const sv = srcCv ? null : getStatic(slot.source);
        if (!srcCv && sv === null) continue;
        const viaCv = slot.via && slot.via !== 'none' ? cvOut.get(slot.via + ':cv') || null : null;
        const sg = track(ctx.createGain()), vg = track(ctx.createGain());
        (srcCv || cs).connect(vg);
        if (viaCv) { vg.gain.value = 0; viaCv.connect(vg.gain); }
        else { vg.gain.value = slot.via && slot.via !== 'none' ? (getStatic(slot.via) ?? 1) : 1; }
        sg.gain.value = srcCv ? applyModCurve(slot.amount, slot.curve) * t.scale : applyModCurve(sv, slot.curve) * slot.amount * t.scale;
        vg.connect(sg); sg.connect(t.param);
      }
    }
    return { midi, released: false, sustained: false, releaseTimer: null, cleanup, stops, releases };
    } catch {
      stops.forEach((s) => { try { s(); } catch {} });
      cleanup.forEach((n) => { try { n.disconnect(); } catch {} });
      return null;
    }
  }

  _releaseVoice(id, now) {
    const v = this.voices.get(id);
    if (!v || v.released) return;
    v.released = true;
    let maxR = 0.08;
    v.releases.forEach((fn) => { maxR = Math.max(maxR, fn(now)); });
    v.releaseTimer = setTimeout(() => this._stopVoice(id), (maxR + 0.12) * 1000);
  }

  _stopVoice(id) {
    const v = this.voices.get(id);
    if (!v) return;
    if (v.releaseTimer !== null) clearTimeout(v.releaseTimer);
    v.stops.forEach((s) => { try { s(); } catch {} });
    v.cleanup.forEach((n) => { try { n.disconnect(); } catch {} });
    this.voices.delete(id);
  }
}
`;
}
