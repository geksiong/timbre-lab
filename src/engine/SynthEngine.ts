import {
  LatencyMetrics,
  MidiActivityEvent,
  ModCurveType,
  ModMatrixSlot,
  ModuleType,
  SynthConnection,
  SynthNode,
  SynthPatch,
} from './types';

const KARPLUS_WORKLET_CODE = `
class KarplusStrongProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'frequency', defaultValue: 220, minValue: 20, maxValue: 6000, automationRate: 'a-rate' },
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
    this.bowPhase = 0;
    this.bowEnv = 0;
    this.prevPluckFilter = 0;
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

    if (gate > 0.5 && !this.lastTriggered) {
      this.lastTriggered = true;
      const f = this.safeClamp(freqArr[0], 20, 6000, 220);
      const period = Math.max(4, Math.min(this.maxDelay - 2, Math.round(sampleRate / f)));
      this.exciterSamplesLeft = mode === 2 ? Math.round(period * 0.45) : period;
      this.prevPluckFilter = 0;
      if (mode === 1) {
        this.bowEnv = 0.15;
      }
    } else if (gate < 0.5) {
      this.lastTriggered = false;
    }

    for (let i = 0; i < channel.length; i++) {
      const freq = this.safeClamp(freqArr.length > 1 ? freqArr[i] : freqArr[0], 20, 6000, 220);
      const bowPressure = this.safeClamp(bowPressureArr.length > 1 ? bowPressureArr[i] : bowPressureArr[0], 0.05, 1.0, 0.56);
      const exactDelay = Math.max(4, Math.min(this.maxDelay - 4, sampleRate / freq - 0.5));
      const intDelay = Math.floor(exactDelay);
      const frac = exactDelay - intDelay;

      const readIdx1 = (this.writeIndex - intDelay + this.maxDelay) % this.maxDelay;
      const readIdx2 = (readIdx1 - 1 + this.maxDelay) % this.maxDelay;
      const s1 = Number.isFinite(this.buffer[readIdx1]) ? this.buffer[readIdx1] : 0;
      const s2 = Number.isFinite(this.buffer[readIdx2]) ? this.buffer[readIdx2] : 0;
      const delayedSample = s1 * (1 - frac) + s2 * frac;

      const lpCoeff = 1 - damping * 0.65;
      const filtered = this.lastOut + lpCoeff * (delayedSample - this.lastOut);
      this.lastOut = Number.isFinite(filtered) ? filtered : 0;

      let exciter = 0;
      if (extInput) {
        const ext = extInput[i];
        if (Number.isFinite(ext)) {
          exciter += Math.max(-2, Math.min(2, ext)) * exciterMix * 0.45;
        }
      }

      if (mode === 1) {
        const targetEnv = gate > 0.5 ? 1.0 : 0.0;
        const envRate = gate > 0.5 ? 0.0012 : 0.0035;
        this.bowEnv += (targetEnv - this.bowEnv) * envRate;

        if (this.bowEnv > 0.002) {
          this.bowPhase += freq / sampleRate;
          if (this.bowPhase >= 1 || !Number.isFinite(this.bowPhase)) this.bowPhase = this.bowPhase >= 1 ? this.bowPhase - Math.floor(this.bowPhase) : 0;

          const stringVel = delayedSample - this.lastOut * 0.52;
          const bowVel = (0.18 + velocity * 0.45) * (0.6 + brightness * 0.4);
          const relVel = bowVel - stringVel;
          const gripSlope = 4.2 - bowPressure * 2.5;
          const friction = 1.0 / (1.0 + Math.pow(Math.abs(relVel) * gripSlope, 2));

          const sawDrive = (this.bowPhase * 2 - 1) * (0.025 + bowPressure * 0.032);
          const rawRosin = this.nextRand();
          this.rosinLp += (0.25 + brightness * 0.55) * (rawRosin - this.rosinLp);
          const rosinForce = this.rosinLp * rosin * (0.015 + bowPressure * 0.035);

          exciter += (relVel * friction * (0.14 + bowPressure * 0.22) + sawDrive + rosinForce) * this.bowEnv * velocity;
        }
      } else if (this.exciterSamplesLeft > 0) {
        const rawNoise = this.nextRand();
        const shaped = this.prevPluckFilter + brightness * (rawNoise - this.prevPluckFilter);
        this.prevPluckFilter = shaped;
        const env = mode === 2 ? Math.sin((this.exciterSamplesLeft / 64) * Math.PI) : 1;
        exciter += shaped * velocity * 0.65 * (mode === 2 ? Math.max(0.2, env) : 1);
        this.exciterSamplesLeft--;
      }

      const activeDecay = mode === 1
        ? (gate > 0.5 ? 0.945 + (1 - damping) * 0.035 : decay * 0.94)
        : (gate > 0.5 ? decay : Math.min(decay, 0.965));

      let nextVal = exciter + this.lastOut * activeDecay;

      if (sympathetic > 0.01) {
        const buzz = Math.tanh(nextVal * (1 + sympathetic * 5.5)) - nextVal;
        nextVal += buzz * sympathetic * 0.35;
      }

      nextVal = this.safeClamp(nextVal, -1.4, 1.4, 0);
      this.buffer[this.writeIndex] = nextVal;

      let outSample = nextVal;
      if (mode === 1) {
        const bowTapOffset = Math.max(1, Math.min(intDelay - 1, Math.round(exactDelay * bowPosition)));
        const tapIdx = (this.writeIndex - bowTapOffset + this.maxDelay) % this.maxDelay;
        const tapVal = Number.isFinite(this.buffer[tapIdx]) ? this.buffer[tapIdx] : 0;
        outSample = nextVal - tapVal * 0.42;
      }

      this.writeIndex = (this.writeIndex + 1) % this.maxDelay;

      const dcBlocked = outSample - this.dcIn + 0.995 * this.dcOut;
      if (Number.isFinite(dcBlocked)) {
        this.dcIn = outSample;
        this.dcOut = dcBlocked;
        channel[i] = this.safeClamp(dcBlocked * 0.85, -1.25, 1.25, 0);
      } else {
        this.dcIn = 0;
        this.dcOut = 0;
        this.lastOut = 0;
        channel[i] = 0;
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
    for (let i = 0; i < this.maxGrains; i++) {
      this.grains.push({ active: false, pos: 0, age: 0, len: 4096, rate: 1, panL: 0.7, panR: 0.7 });
    }
    this.port.onmessage = (e) => {
      if (e.data === 'stop') this.stopped = true;
    };
  }

  rand() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  readInterp(buf, pos) {
    const wrapped = ((pos % this.bufLen) + this.bufLen) % this.bufLen;
    const i0 = Math.floor(wrapped);
    const i1 = (i0 + 1) % this.bufLen;
    const f = wrapped - i0;
    return buf[i0] * (1 - f) + buf[i1] * f;
  }

  process(inputs, outputs, parameters) {
    if (this.stopped) return false;
    const input = inputs[0];
    const output = outputs[0];
    if (!output || !output[0]) return true;
    const outL = output[0];
    const outR = output[1] || output[0];
    const inL = input && input[0] ? input[0] : null;
    const inR = input && input[1] ? input[1] : inL;

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
        const recL = Math.tanh(dryL + this.lastOutL * fb * 0.65);
        const recR = Math.tanh(dryR + this.lastOutR * fb * 0.65);
        this.bufL[this.writeIdx] = recL;
        this.bufR[this.writeIdx] = recR;
        this.writeIdx = (this.writeIdx + 1) % this.bufLen;
      }

      this.spawnCounter--;
      if (this.spawnCounter <= 0) {
        this.spawnCounter = spawnPeriod;
        for (let g = 0; g < this.maxGrains; g++) {
          const gr = this.grains[g];
          if (!gr.active) {
            let st = pitchSt;
            if (pitchSnap === 0) {
              const toggle = this.grainToggle % 3;
              st = toggle === 0 ? pitchSt : toggle === 1 ? 7 : 0;
              this.grainToggle++;
            } else if (pitchSnap === 1) {
              st = (this.grainToggle % 2 === 0) ? pitchSt : 0;
              this.grainToggle++;
            }
            const rate = Math.pow(2, st / 12);
            const maxBack = freeze ? this.bufLen * 0.92 : Math.min(this.bufLen * 0.85, Math.max(grainSamples * 2, sampleRate * 1.35));
            const offset = 128 + this.rand() * spray * maxBack;
            const pan = 0.5 + (this.rand() * 2 - 1) * 0.48 * scatter;
            gr.active = true;
            gr.pos = (this.writeIdx - offset + this.bufLen) % this.bufLen;
            gr.age = 0;
            gr.len = Math.max(256, Math.round(grainSamples * (0.75 + this.rand() * 0.5)));
            gr.rate = Math.max(0.25, Math.min(4.0, rate));
            gr.panL = Math.cos(pan * Math.PI * 0.5);
            gr.panR = Math.sin(pan * Math.PI * 0.5);
            break;
          }
        }
      }

      let wetL = 0;
      let wetR = 0;
      let activeCount = 0;
      for (let g = 0; g < this.maxGrains; g++) {
        const gr = this.grains[g];
        if (!gr.active) continue;
        const phase = gr.age / gr.len;
        if (phase >= 1) {
          gr.active = false;
          continue;
        }
        const win = 0.5 * (1 - Math.cos(6.28318530718 * phase));
        const sL = this.readInterp(this.bufL, gr.pos);
        const sR = this.readInterp(this.bufR, gr.pos);
        wetL += sL * win * gr.panL;
        wetR += sR * win * gr.panR;
        gr.pos = (gr.pos + gr.rate) % this.bufLen;
        gr.age++;
        activeCount++;
      }

      const norm = activeCount > 1 ? 1 / Math.sqrt(activeCount * 0.55) : 1;
      wetL *= norm;
      wetR *= norm;
      this.lastOutL = Number.isFinite(wetL) ? wetL : 0;
      this.lastOutR = Number.isFinite(wetR) ? wetR : 0;

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
    this.inBufL = new Float32Array(this.winLen);
    this.inBufR = new Float32Array(this.winLen);
    this.inWrite = 0;
    this.phase = 0;

    this.tankLenL = 7919;
    this.tankLenR = 9371;
    this.tankL = new Float32Array(this.tankLenL);
    this.tankR = new Float32Array(this.tankLenR);
    this.tankIdxL = 0;
    this.tankIdxR = 0;
    this.lpL = 0;
    this.lpR = 0;
    this.modPhase = 0;
    this.stopped = false;
    this.port.onmessage = (e) => {
      if (e.data === 'stop') this.stopped = true;
    };
  }

  readWin(buf, delaySamples) {
    const pos = ((this.inWrite - delaySamples) % this.winLen + this.winLen) % this.winLen;
    const i0 = Math.floor(pos);
    const i1 = (i0 + 1) % this.winLen;
    const f = pos - i0;
    return buf[i0] * (1 - f) + buf[i1] * f;
  }

  process(inputs, outputs, parameters) {
    if (this.stopped) return false;
    const input = inputs[0];
    const output = outputs[0];
    if (!output || !output[0]) return true;
    const outL = output[0];
    const outR = output[1] || output[0];
    const inL = input && input[0] ? input[0] : null;
    const inR = input && input[1] ? input[1] : inL;

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

      const tOutL = this.tankL[this.tankIdxL];
      const tOutR = this.tankR[this.tankIdxR];

      this.modPhase += 0.45 / sampleRate;
      if (this.modPhase >= 1) this.modPhase -= 1;
      const modOffset = Math.sin(this.modPhase * 6.2831853) * modAmt * 28;

      const srcL = freeze ? tOutL : sL + tOutR * (0.35 + shimmerMix * 0.36);
      const srcR = freeze ? tOutR : sR + tOutL * (0.35 + shimmerMix * 0.36);

      this.inBufL[this.inWrite] = Math.tanh(srcL * 0.85);
      this.inBufR[this.inWrite] = Math.tanh(srcR * 0.85);

      this.phase = ((this.phase + phaseStep) % 1 + 1) % 1;
      const pA = this.phase;
      const pB = (this.phase + 0.5) % 1;
      const wA = 0.5 * (1 - Math.cos(6.2831853 * pA));
      const wB = 0.5 * (1 - Math.cos(6.2831853 * pB));
      const dA = 64 + pA * (this.winLen - 160) + modOffset;
      const dB = 64 + pB * (this.winLen - 160) - modOffset;

      const shiftedL = this.readWin(this.inBufL, dA) * wA + this.readWin(this.inBufL, dB) * wB;
      const shiftedR = this.readWin(this.inBufR, dA) * wA + this.readWin(this.inBufR, dB) * wB;

      this.inWrite = (this.inWrite + 1) % this.winLen;

      const mixSigL = freeze ? tOutL * 0.996 : sL * (1 - shimmerMix * 0.35) + shiftedL * shimmerMix * 0.9;
      const mixSigR = freeze ? tOutR * 0.996 : sR * (1 - shimmerMix * 0.35) + shiftedR * shimmerMix * 0.9;

      this.lpL += lpCoeff * (mixSigL - this.lpL);
      this.lpR += lpCoeff * (mixSigR - this.lpR);

      if (!freeze) {
        this.tankL[this.tankIdxL] = Math.tanh(sL * 0.45 + this.lpR * (0.48 + shimmerMix * 0.25));
        this.tankR[this.tankIdxR] = Math.tanh(sR * 0.45 + this.lpL * (0.48 + shimmerMix * 0.25));
      } else {
        this.tankL[this.tankIdxL] = Math.tanh(this.lpL * 0.9985);
        this.tankR[this.tankIdxR] = Math.tanh(this.lpR * 0.9985);
      }

      this.tankIdxL = (this.tankIdxL + 1) % this.tankLenL;
      this.tankIdxR = (this.tankIdxR + 1) % this.tankLenR;

      outL[i] = Number.isFinite(this.lpL) ? this.lpL : 0;
      outR[i] = Number.isFinite(this.lpR) ? this.lpR : 0;
    }
    return true;
  }
}

registerProcessor('timbre-karplus-processor', KarplusStrongProcessor);
registerProcessor('timbre-safety-limiter', SafetyLimiterProcessor);
registerProcessor('timbre-granular-processor', GranularCloudProcessor);
registerProcessor('timbre-shimmer-processor', ShimmerTankProcessor);
`;

interface ActiveVoice {
  id: string;
  midi: number;
  velocity: number;
  startedAt: number;
  released: boolean;
  sustained: boolean;
  releaseTimer?: number;
  cleanupNodes: AudioNode[];
  outputSendGains: GainNode[];
  stopCallbacks: (() => void)[];
  releaseCallbacks: ((now: number) => number)[];
  nodeControllers: Map<string, VoiceNodeController>;
  modSlotUpdaters: Map<string, (slot: ModMatrixSlot, now: number) => void>;
}

interface VoiceNodeController {
  type: string;
  updateParams: (params: Record<string, number | string | boolean>, now: number) => void;
  setPitchBend?: (semitones: number, now: number) => void;
  setModWheel?: (amount: number, now: number) => void;
}

interface MasterFxInstance {
  id: string;
  type: 'delay' | 'reverb' | 'output';
  input: AudioNode;
  output: AudioNode;
  updateParams: (params: Record<string, number | string | boolean>, now: number) => void;
  dispose: () => void;
}

function finiteNum(val: unknown, fallback: number): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function clampFinite(val: unknown, min: number, max: number, fallback: number): number {
  const n = finiteNum(val, fallback);
  return Math.max(min, Math.min(max, n));
}

const VALID_OSC_TYPES = new Set<OscillatorType>(['sine', 'square', 'sawtooth', 'triangle']);
const VALID_FILTER_TYPES = new Set<BiquadFilterType>([
  'lowpass',
  'highpass',
  'bandpass',
  'lowshelf',
  'highshelf',
  'peaking',
  'notch',
  'allpass',
]);

function safeOscType(val: unknown, fallback: OscillatorType = 'sine'): OscillatorType {
  const s = String(val ?? fallback) as OscillatorType;
  return VALID_OSC_TYPES.has(s) ? s : fallback;
}

function safeFilterType(val: unknown, fallback: BiquadFilterType = 'lowpass'): BiquadFilterType {
  const s = String(val ?? fallback) as BiquadFilterType;
  return VALID_FILTER_TYPES.has(s) ? s : fallback;
}

function applyModCurve(value: number, curve: ModCurveType): number {
  if (!Number.isFinite(value)) return 0;
  if (curve === 'exp') {
    return Math.sign(value) * value * value;
  }
  if (curve === 'scurve') {
    return Math.tanh(value * 2.2) / Math.tanh(2.2);
  }
  return value;
}

function setAudioParam(
  param: AudioParam,
  value: number,
  t: number,
  smoothSec: number,
  immediate: boolean
): void {
  if (immediate) {
    param.setValueAtTime(value, t);
  } else {
    param.setTargetAtTime(value, t, smoothSec);
  }
}

export class SynthEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private masterSafetyClipper: WaveShaperNode | null = null;
  private masterSafetyWorklet: AudioWorkletNode | null = null;
  private masterGain: GainNode | null = null;
  private masterInputBus: GainNode | null = null;
  private fxInputBuses: Map<string, GainNode> = new Map();
  private lastFxSignature = '';

  private patch: SynthPatch | null = null;
  private voices: Map<string, ActiveVoice> = new Map();
  private voiceCounter = 0;
  private pendingCleanupTimers = new Set<number>();
  private noteEpoch = 0;
  private pendingMidiCancelledAt = new Map<number, number>();
  private lastAllNotesOffEpoch = 0;

  private pitchBendSemitones = 0;
  private modWheel = 0;
  private macroX = 0.5;
  private macroY = 0.5;
  private sustainPedal = false;
  private latchEnabled = false;
  private latchedNotes = new Set<number>();
  private filterCutoffMod = 0;

  private workletReady = false;
  private workletAttempted = false;
  private workletLoading: Promise<void> | null = null;
  private initPromise: Promise<AudioContext> | null = null;

  private latencyMode: 'interactive' | 'ultralow' = 'interactive';
  private lastDspBuildMs = 0;
  private lastInputToDspMs = 0;
  private lastTriggerSource: LatencyMetrics['lastSource'] = 'engine';
  private latencyListeners = new Set<(metrics: LatencyMetrics) => void>();
  private latencyPollTimer: number | null = null;
  private uiNotifyQueued = false;

  private noiseBufferWhite: AudioBuffer | null = null;
  private noiseBufferPink: AudioBuffer | null = null;
  private periodicWaves: Map<string, PeriodicWave> = new Map();
  private shaperCurves: Map<string, Float32Array<ArrayBuffer>> = new Map();
  private combLoopCurve: Float32Array<ArrayBuffer> | null = null;
  private reverbIrCache: Map<string, AudioBuffer> = new Map();
  private masterFxChain: MasterFxInstance[] = [];

  private timeDomainBuf: Float32Array<ArrayBuffer> = new Float32Array(new ArrayBuffer(4096 * 4));
  private freqDomainBuf: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(2048));

  private voiceListeners = new Set<(notes: number[]) => void>();
  private latchListeners = new Set<(enabled: boolean, latchedNotes: number[]) => void>();
  private programChangeListeners = new Set<(program: number) => void>();
  private midiActivityListeners = new Set<(ev: MidiActivityEvent) => void>();
  private outputSinkId = '';

  public isAudioOutputSelectionSupported(): boolean {
    if (typeof AudioContext === 'undefined') return false;
    return (
      typeof (AudioContext.prototype as unknown as { setSinkId?: unknown }).setSinkId ===
      'function'
    );
  }

  public getOutputDeviceId(): string {
    return this.outputSinkId || 'default';
  }

  public async setOutputDevice(
    deviceId: string
  ): Promise<{ ok: boolean; error?: string }> {
    const normalized = !deviceId || deviceId === 'default' ? '' : deviceId;
    this.outputSinkId = normalized;
    if (!this.ctx) {
      return { ok: true };
    }
    const sinkable = this.ctx as AudioContext & {
      setSinkId?: (id: string) => Promise<void>;
    };
    if (typeof sinkable.setSinkId !== 'function') {
      return {
        ok: false,
        error: 'Audio output device routing is not supported in this browser.',
      };
    }
    try {
      await sinkable.setSinkId(normalized);
      return { ok: true };
    } catch (err) {
      if (normalized !== '') {
        this.outputSinkId = '';
        await sinkable.setSinkId('').catch(() => undefined);
      }
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Unable to route audio to selected output device.',
      };
    }
  }

  public warmUp(): Promise<AudioContext> {
    return this.init();
  }

  public async init(existingCtx?: AudioContext): Promise<AudioContext> {
    if (this.ctx && (this.ctx.state as string) === 'closed') {
      this.resetContextState();
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (existingCtx) {
          this.ctx = existingCtx;
        } else {
          const hint: AudioContextLatencyCategory | number =
            this.latencyMode === 'ultralow' ? 0 : 'interactive';
          try {
            this.ctx = new AudioCtx({ latencyHint: hint });
          } catch {
            this.ctx = new AudioCtx();
          }
        }
        this.ctx.onstatechange = () => {
          this.emitLatencyMetrics();
        };
        this.buildMasterChain(this.ctx);
        if (this.outputSinkId) {
          const sinkable = this.ctx as AudioContext & {
            setSinkId?: (id: string) => Promise<void>;
          };
          if (typeof sinkable.setSinkId === 'function') {
            void sinkable.setSinkId(this.outputSinkId).catch(() => {
              this.outputSinkId = '';
            });
          }
        }
      }

      if (this.ctx.state !== 'running') {
        try {
          await this.ctx.resume();
        } catch {
          // Ignore transient resume rejection when invoked outside user gesture
        }
      }

      if (!this.workletReady && !this.workletAttempted && !this.workletLoading && this.ctx.audioWorklet) {
        this.workletLoading = this.registerKarplusWorklet(this.ctx);
      }
      if (this.workletLoading) {
        await this.workletLoading.catch(() => undefined);
      }

      if (this.workletReady && !this.masterSafetyWorklet) {
        this.attachSafetyWorklet();
      }

      this.ensureLatencyPolling();
      this.emitLatencyMetrics();
      return this.ctx!;
    })().finally(() => {
      this.initPromise = null;
    });

    return this.initPromise;
  }

  private ensureLatencyPolling(): void {
    if (this.latencyPollTimer !== null) return;
    this.latencyPollTimer = window.setInterval(() => {
      if (this.ctx && this.ctx.state === 'running' && this.latencyListeners.size > 0) {
        this.emitLatencyMetrics();
      }
    }, 1000);
  }

  private resetContextState(): void {
    this.allNotesOff();
    for (const fx of this.masterFxChain) {
      fx.dispose();
    }
    this.masterFxChain = [];
    this.fxInputBuses.clear();
    this.periodicWaves.clear();
    this.reverbIrCache.clear();
    this.noiseBufferWhite = null;
    this.noiseBufferPink = null;
    this.masterSafetyWorklet = null;
    this.masterSafetyClipper = null;
    this.masterGain = null;
    this.analyser = null;
    this.masterInputBus = null;
    this.workletReady = false;
    this.workletAttempted = false;
    this.workletLoading = null;
    this.lastFxSignature = '';
    this.ctx = null;
    this.emitLatencyMetrics();
  }

  private buildMasterChain(ctx: AudioContext): void {
    this.masterInputBus = ctx.createGain();
    this.masterInputBus.gain.value = 1;

    // Zero-lookahead soft-knee safety clipper (replaces DynamicsCompressorNode's ~6ms lookahead delay)
    this.masterSafetyClipper = ctx.createWaveShaper();
    this.masterSafetyClipper.oversample = 'none';
    this.masterSafetyClipper.curve = this.getMasterSafetyCurve();

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.85;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 4096;
    this.analyser.minDecibels = -90;
    this.analyser.maxDecibels = -8;
    this.analyser.smoothingTimeConstant = 0.65;
    this.timeDomainBuf = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4));
    this.freqDomainBuf = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));

    this.masterInputBus.connect(this.masterSafetyClipper);
    this.masterSafetyClipper.connect(this.masterGain);
    this.masterGain.connect(this.analyser);
    this.analyser.connect(ctx.destination);

    if (!this.noiseBufferWhite || !this.noiseBufferPink) {
      this.prepareNoiseBuffers();
    }
    if (this.periodicWaves.size === 0) {
      this.preparePeriodicWaves();
    }
    this.rebuildMasterFxChain();
    if (this.workletReady) {
      this.attachSafetyWorklet();
    }
  }

  private attachSafetyWorklet(): void {
    if (!this.ctx || !this.masterSafetyClipper || !this.masterGain || !this.workletReady) return;
    if (this.masterSafetyWorklet) return;
    try {
      const safetyNode = new AudioWorkletNode(this.ctx, 'timbre-safety-limiter', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers',
      });
      safetyNode.onprocessorerror = () => {
        try {
          this.masterSafetyClipper?.disconnect();
          safetyNode.disconnect();
        } catch {
          // ignore
        }
        if (this.masterSafetyClipper && this.masterGain) {
          this.masterSafetyClipper.connect(this.masterGain);
        }
        this.masterSafetyWorklet = null;
      };
      this.masterSafetyClipper.disconnect();
      this.masterSafetyClipper.connect(safetyNode);
      safetyNode.connect(this.masterGain);
      this.masterSafetyWorklet = safetyNode;
    } catch {
      this.masterSafetyWorklet = null;
    }
  }

  private recoverMasterChain(): void {
    if (!this.ctx || (this.ctx.state as string) === 'closed') return;
    try {
      this.masterInputBus?.disconnect();
      this.masterSafetyClipper?.disconnect();
      this.masterSafetyWorklet?.disconnect();
      this.masterGain?.disconnect();
      this.analyser?.disconnect();
    } catch {
      // ignore
    }
    for (const fx of this.masterFxChain) {
      fx.dispose();
    }
    this.masterFxChain = [];
    for (const bus of this.fxInputBuses.values()) {
      try {
        bus.disconnect();
      } catch {
        // ignore
      }
    }
    this.masterSafetyWorklet = null;
    this.lastFxSignature = '';
    this.buildMasterChain(this.ctx);
  }

  private async registerKarplusWorklet(ctx: AudioContext): Promise<void> {
    this.workletAttempted = true;
    try {
      const blob = new Blob([KARPLUS_WORKLET_CODE], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      this.workletReady = true;
    } catch {
      this.workletReady = false;
    }
  }

  public getContext(): AudioContext | null {
    return this.ctx;
  }

  private computeFxSignature(patch: SynthPatch): string {
    return patch.nodes
      .filter((n) => n.type === 'delay' || n.type === 'reverb' || n.type === 'output')
      .map((n) => `${n.id}:${n.type}:${Boolean(n.bypassed)}`)
      .join('|');
  }

  public loadPatch(patch: SynthPatch): void {
    this.patch = patch;
    if (!this.ctx) return;
    const sig = this.computeFxSignature(patch);
    if (sig !== this.lastFxSignature) {
      this.rebuildMasterFxChain();
    } else {
      const now = this.ctx.currentTime;
      for (const fx of this.masterFxChain) {
        const node = patch.nodes.find((n) => n.id === fx.id);
        if (node) {
          fx.updateParams(node.params, now);
        }
      }
    }
  }

  public getPatch(): SynthPatch | null {
    return this.patch;
  }

  public updateNodeParams(nodeId: string, params: Record<string, number | string | boolean>): void {
    if (!this.patch) return;
    const node = this.patch.nodes.find((n) => n.id === nodeId);
    if (node) {
      node.params = { ...node.params, ...params };
    }
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    for (const fx of this.masterFxChain) {
      if (fx.id === nodeId) {
        fx.updateParams(params, now);
      }
    }

    for (const voice of this.voices.values()) {
      const ctrl = voice.nodeControllers.get(nodeId);
      if (ctrl) {
        ctrl.updateParams(params, now);
      }
    }
  }

  private getLiveNodeParams(
    nodeId: string,
    fallback: Record<string, number | string | boolean>
  ): Record<string, number | string | boolean> {
    return this.patch?.nodes.find((n) => n.id === nodeId)?.params ?? fallback;
  }

  public updateModMatrixSlots(slots: ModMatrixSlot[]): void {
    if (this.patch) {
      this.patch.modMatrix = slots;
    }
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const activeIds = new Set(slots.map((s) => s.id));
    for (const voice of this.voices.values()) {
      for (const [slotId, updater] of voice.modSlotUpdaters.entries()) {
        if (!activeIds.has(slotId)) {
          updater(
            {
              id: slotId,
              enabled: false,
              source: '',
              targetNodeId: '',
              targetParam: '',
              amount: 0,
              curve: 'linear',
            },
            now
          );
          voice.modSlotUpdaters.delete(slotId);
        }
      }
      for (const slot of slots) {
        const updater = voice.modSlotUpdaters.get(slot.id);
        if (updater) {
          updater(slot, now);
        }
      }
    }
    this.refreshMasterFxParams(now);
  }

  private getMasterModOffset(nodeId: string, paramKey: string): number {
    const slots = this.patch?.modMatrix;
    if (!slots || slots.length === 0) return 0;
    const getVal = (name: string): number | null => {
      switch (name) {
        case 'macroX':
          return this.macroX;
        case 'macroY':
          return this.macroY;
        case 'modWheel':
          return this.modWheel;
        default:
          return null;
      }
    };
    let total = 0;
    for (const slot of slots) {
      if (!slot.enabled || slot.targetNodeId !== nodeId || slot.targetParam !== paramKey) {
        continue;
      }
      const srcVal = getVal(slot.source);
      if (srcVal === null) continue;
      let viaVal = 1;
      if (slot.via && slot.via !== 'none') {
        const v = getVal(slot.via);
        if (v === null) continue;
        viaVal = v;
      }
      total += applyModCurve(srcVal, slot.curve) * slot.amount * viaVal;
    }
    return total;
  }

  private refreshMasterFxParams(t: number): void {
    if (!this.ctx || !this.patch) return;
    for (const fx of this.masterFxChain) {
      fx.updateParams({}, t);
    }
  }

  public async noteOn(
    midi: number,
    velocity = 100,
    inputTimeStampMs?: number,
    source: LatencyMetrics['lastSource'] = 'engine'
  ): Promise<void> {
    if (!this.patch) return;

    if (this.latchEnabled && this.latchedNotes.has(midi)) {
      this.latchedNotes.delete(midi);
      this.pendingMidiCancelledAt.set(midi, this.noteEpoch);
      if (this.ctx) {
        const now = this.ctx.currentTime;
        for (const [key, voice] of this.voices.entries()) {
          if (voice.midi === midi && !voice.released) {
            this.releaseVoice(key, now);
          }
        }
      }
      this.emitLatchState();
      return;
    }

    if (this.latchEnabled) {
      this.latchedNotes.add(midi);
      this.emitLatchState();
    }

    const reqEpoch = ++this.noteEpoch;
    let ctx = this.ctx;
    if (
      !ctx ||
      ctx.state !== 'running' ||
      this.initPromise ||
      (!this.workletReady && !this.workletAttempted && !this.workletLoading && Boolean(ctx.audioWorklet))
    ) {
      ctx = await this.init();
    }
    if (!this.patch || (ctx.state as string) === 'closed') return;
    if (
      reqEpoch <= this.lastAllNotesOffEpoch ||
      (this.pendingMidiCancelledAt.get(midi) ?? 0) >= reqEpoch
    ) {
      return;
    }

    const buildStartMs = performance.now();
    const now = ctx.currentTime;
    const velNorm = clampFinite(velocity / 127, 0.02, 1, 0.78);

    // Retrigger existing same-note active voices smoothly
    for (const [key, v] of this.voices.entries()) {
      if (v.midi === midi && !v.released) {
        this.releaseVoice(key, now);
      }
    }

    // Enforce polyphony cap: prefer stealing oldest already-released voice first
    const maxVoices = Math.max(1, Math.min(16, this.patch.polyphony || 8));
    while (this.voices.size >= maxVoices) {
      let stealKey: string | null = null;
      let oldestReleasedTime = Infinity;
      let oldestActiveTime = Infinity;
      let oldestActiveKey: string | null = null;

      for (const [k, v] of this.voices.entries()) {
        if (v.released) {
          if (v.startedAt < oldestReleasedTime) {
            oldestReleasedTime = v.startedAt;
            stealKey = k;
          }
        } else if (v.startedAt < oldestActiveTime) {
          oldestActiveTime = v.startedAt;
          oldestActiveKey = k;
        }
      }

      const targetKey = stealKey ?? oldestActiveKey;
      if (!targetKey) break;
      this.softStealVoice(targetKey, now);
    }

    const voiceId = `v_${++this.voiceCounter}_${midi}`;
    const voice = this.buildVoiceGraph(voiceId, midi, velNorm, now);
    const dispatchDoneMs = performance.now();
    this.lastDspBuildMs = Math.max(0, dispatchDoneMs - buildStartMs);
    this.lastInputToDspMs =
      inputTimeStampMs !== undefined && Number.isFinite(inputTimeStampMs)
        ? Math.max(0, Math.min(250, dispatchDoneMs - inputTimeStampMs))
        : this.lastDspBuildMs;
    this.lastTriggerSource = source;

    if (voice) {
      this.voices.set(voiceId, voice);
    }
    this.scheduleUiUpdate();
  }

  public noteOff(midi: number): void {
    if (this.latchEnabled && this.latchedNotes.has(midi)) {
      return;
    }
    this.pendingMidiCancelledAt.set(midi, this.noteEpoch);
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const [key, voice] of this.voices.entries()) {
      if (voice.midi === midi && !voice.released) {
        if (this.sustainPedal) {
          voice.sustained = true;
        } else {
          this.releaseVoice(key, now);
        }
      }
    }
  }

  public allNotesOff(): void {
    this.lastAllNotesOffEpoch = this.noteEpoch;
    if (this.latchedNotes.size > 0) {
      this.latchedNotes.clear();
      this.emitLatchState();
    }
    for (const key of Array.from(this.voices.keys())) {
      this.forceStopVoice(key);
    }
    this.emitActiveNotes();
  }

  public setPitchBend(normalized: number): void {
    this.pitchBendSemitones = Math.max(-1, Math.min(1, normalized)) * 2;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const voice of this.voices.values()) {
      for (const ctrl of voice.nodeControllers.values()) {
        ctrl.setPitchBend?.(this.pitchBendSemitones, now);
      }
    }
  }

  public setModWheel(value: number): void {
    this.modWheel = Math.max(0, Math.min(1, value));
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const voice of this.voices.values()) {
      for (const ctrl of voice.nodeControllers.values()) {
        ctrl.setModWheel?.(this.modWheel, now);
      }
      if (this.patch?.modMatrix) {
        for (const slot of this.patch.modMatrix) {
          if (slot.source === 'modWheel' || slot.via === 'modWheel') {
            voice.modSlotUpdaters.get(slot.id)?.(slot, now);
          }
        }
      }
    }
    this.refreshMasterFxParams(now);
  }

  public setMacroXY(x: number, y: number): void {
    this.macroX = Math.max(0, Math.min(1, finiteNum(x, 0.5)));
    this.macroY = Math.max(0, Math.min(1, finiteNum(y, 0.5)));
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.patch?.modMatrix) {
      for (const voice of this.voices.values()) {
        for (const slot of this.patch.modMatrix) {
          if (
            slot.source === 'macroX' ||
            slot.source === 'macroY' ||
            slot.via === 'macroX' ||
            slot.via === 'macroY'
          ) {
            voice.modSlotUpdaters.get(slot.id)?.(slot, now);
          }
        }
      }
    }
    this.refreshMasterFxParams(now);
  }

  public getMacroXY(): { x: number; y: number } {
    return { x: this.macroX, y: this.macroY };
  }

  public setLatchEnabled(enabled: boolean): void {
    this.latchEnabled = enabled;
    if (!enabled) {
      this.clearLatchedNotes();
    } else {
      this.emitLatchState();
    }
  }

  public clearLatchedNotes(): void {
    const toRelease = Array.from(this.latchedNotes);
    this.latchedNotes.clear();
    if (this.ctx && toRelease.length > 0) {
      const now = this.ctx.currentTime;
      for (const midi of toRelease) {
        this.pendingMidiCancelledAt.set(midi, this.noteEpoch);
        for (const [key, voice] of this.voices.entries()) {
          if (voice.midi === midi && !voice.released && !voice.sustained) {
            this.releaseVoice(key, now);
          }
        }
      }
    }
    this.emitLatchState();
  }

  public getLatchState(): { enabled: boolean; latchedNotes: number[] } {
    return { enabled: this.latchEnabled, latchedNotes: Array.from(this.latchedNotes) };
  }

  public setSustain(enabled: boolean): void {
    this.sustainPedal = enabled;
    if (!enabled && this.ctx) {
      const now = this.ctx.currentTime;
      for (const [key, voice] of this.voices.entries()) {
        if (voice.sustained && !voice.released) {
          this.releaseVoice(key, now);
        }
      }
    }
  }

  public setFilterCutoffOffset(normalized: number): void {
    this.filterCutoffMod = (normalized - 0.5) * 4000;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const voice of this.voices.values()) {
      for (const ctrl of voice.nodeControllers.values()) {
        if (ctrl.type === 'filter') {
          ctrl.updateParams({}, now);
        }
      }
    }
  }

  public handleMidiMessage(data: Uint8Array | number[], inputTimeStampMs?: number): void {
    const bytes = Array.from(data);
    if (bytes.length < 2) return;
    const status = bytes[0] & 0xf0;
    const d1 = bytes[1] ?? 0;
    const d2 = bytes[2] ?? 0;

    let summary = '';
    if (status === 0x90 && d2 > 0) {
      void this.noteOn(d1, d2, inputTimeStampMs, 'midi');
      summary = `Note On · MIDI ${d1} · Vel ${d2}`;
    } else if (status === 0x80 || (status === 0x90 && d2 === 0)) {
      this.noteOff(d1);
      summary = `Note Off · MIDI ${d1}`;
    } else if (status === 0xb0) {
      if (d1 === 1) {
        this.setModWheel(d2 / 127);
        summary = `CC1 Mod Wheel · ${Math.round((d2 / 127) * 100)}%`;
      } else if (d1 === 7) {
        if (this.masterGain && this.ctx) {
          this.masterGain.gain.setTargetAtTime((d2 / 127) * 1.1, this.ctx.currentTime, 0.02);
        }
        summary = `CC7 Volume · ${Math.round((d2 / 127) * 100)}%`;
      } else if (d1 === 64) {
        this.setSustain(d2 >= 64);
        summary = `CC64 Sustain · ${d2 >= 64 ? 'On' : 'Off'}`;
      } else if (d1 === 74) {
        this.setFilterCutoffOffset(d2 / 127);
        summary = `CC74 Cutoff · ${d2}`;
      } else if (d1 === 120 || d1 === 123) {
        this.allNotesOff();
        summary = `All Notes Off`;
      } else {
        summary = `CC${d1} · ${d2}`;
      }
    } else if (status === 0xc0) {
      for (const cb of this.programChangeListeners) {
        cb(d1);
      }
      summary = `Program Change · GM #${d1 + 1}`;
    } else if (status === 0xe0) {
      const value14 = (d2 << 7) | d1;
      const bend = (value14 - 8192) / 8192;
      this.setPitchBend(bend);
      summary = `Pitch Bend · ${bend >= 0 ? '+' : ''}${(bend * 2).toFixed(2)} st`;
    }

    if (summary) {
      const ev: MidiActivityEvent = { timestamp: Date.now(), bytes, summary };
      for (const cb of this.midiActivityListeners) {
        cb(ev);
      }
    }
  }

  public getTimeDomainData(): Float32Array {
    if (!this.analyser) return this.timeDomainBuf;
    this.analyser.getFloatTimeDomainData(this.timeDomainBuf);
    for (let i = 0; i < this.timeDomainBuf.length; i += 16) {
      if (!Number.isFinite(this.timeDomainBuf[i])) {
        this.timeDomainBuf.fill(0);
        this.recoverMasterChain();
        break;
      }
    }
    return this.timeDomainBuf;
  }

  public getFrequencyData(): Uint8Array {
    if (!this.analyser) return this.freqDomainBuf;
    this.analyser.getByteFrequencyData(this.freqDomainBuf);
    return this.freqDomainBuf;
  }

  public getActiveNotes(): number[] {
    const notes = new Set<number>();
    for (const v of this.voices.values()) {
      if (!v.released) notes.add(v.midi);
    }
    return Array.from(notes);
  }

  public onActiveNotesChange(cb: (notes: number[]) => void): () => void {
    this.voiceListeners.add(cb);
    return () => this.voiceListeners.delete(cb);
  }

  public onLatchChange(cb: (enabled: boolean, latchedNotes: number[]) => void): () => void {
    this.latchListeners.add(cb);
    return () => this.latchListeners.delete(cb);
  }

  public onProgramChange(cb: (program: number) => void): () => void {
    this.programChangeListeners.add(cb);
    return () => this.programChangeListeners.delete(cb);
  }

  public onMidiActivity(cb: (ev: MidiActivityEvent) => void): () => void {
    this.midiActivityListeners.add(cb);
    return () => this.midiActivityListeners.delete(cb);
  }

  public getLatencyMode(): 'interactive' | 'ultralow' {
    return this.latencyMode;
  }

  public async setLatencyMode(mode: 'interactive' | 'ultralow'): Promise<void> {
    if (this.latencyMode === mode) return;
    this.latencyMode = mode;
    const prevCtx = this.ctx;
    if (prevCtx) {
      this.resetContextState();
      try {
        if ((prevCtx.state as string) !== 'closed') {
          await prevCtx.close();
        }
      } catch {
        // Ignore AudioContext close error
      }
      await this.init();
    } else {
      this.emitLatencyMetrics();
    }
  }

  public getLatencyMetrics(): LatencyMetrics {
    const ctx = this.ctx;
    const quantumSamples = 128;
    if (!ctx || (ctx.state as string) === 'closed') {
      return {
        state: 'standby',
        latencyMode: this.latencyMode,
        sampleRate: 48000,
        renderQuantumSamples: quantumSamples,
        renderQuantumMs: (quantumSamples / 48000) * 1000,
        baseLatencyMs: 0,
        outputLatencyMs: 0,
        dspBuildMs: this.lastDspBuildMs,
        inputToDspMs: this.lastInputToDspMs,
        lookaheadMs: 0,
        totalMs: 0,
        lastSource: this.lastTriggerSource,
      };
    }

    const sampleRate = ctx.sampleRate || 48000;
    const renderQuantumMs = (quantumSamples / sampleRate) * 1000;
    const rawBase =
      typeof ctx.baseLatency === 'number' && Number.isFinite(ctx.baseLatency)
        ? ctx.baseLatency * 1000
        : 0;
    const baseLatencyMs = rawBase > 0 ? rawBase : renderQuantumMs;
    const rawOut =
      typeof (ctx as AudioContext & { outputLatency?: number }).outputLatency === 'number'
        ? (ctx as AudioContext & { outputLatency?: number }).outputLatency! * 1000
        : 0;
    const outputLatencyMs = Number.isFinite(rawOut) && rawOut > 0 ? rawOut : 0;
    const state: LatencyMetrics['state'] =
      ctx.state === 'running' ? 'running' : 'suspended';
    const totalMs = this.lastInputToDspMs + baseLatencyMs + outputLatencyMs;

    return {
      state,
      latencyMode: this.latencyMode,
      sampleRate,
      renderQuantumSamples: quantumSamples,
      renderQuantumMs,
      baseLatencyMs,
      outputLatencyMs,
      dspBuildMs: this.lastDspBuildMs,
      inputToDspMs: this.lastInputToDspMs,
      lookaheadMs: 0,
      totalMs,
      lastSource: this.lastTriggerSource,
    };
  }

  public onLatencyChange(cb: (metrics: LatencyMetrics) => void): () => void {
    this.latencyListeners.add(cb);
    cb(this.getLatencyMetrics());
    return () => this.latencyListeners.delete(cb);
  }

  private scheduleUiUpdate(): void {
    if (this.uiNotifyQueued) return;
    this.uiNotifyQueued = true;
    queueMicrotask(() => {
      this.uiNotifyQueued = false;
      this.emitActiveNotes();
      this.emitLatencyMetrics();
    });
  }

  private emitLatencyMetrics(): void {
    if (this.latencyListeners.size === 0) return;
    const metrics = this.getLatencyMetrics();
    for (const cb of this.latencyListeners) {
      cb(metrics);
    }
  }

  private emitActiveNotes(): void {
    const active = this.getActiveNotes();
    for (const cb of this.voiceListeners) {
      cb(active);
    }
  }

  private emitLatchState(): void {
    const latched = Array.from(this.latchedNotes);
    for (const cb of this.latchListeners) {
      cb(this.latchEnabled, latched);
    }
  }

  private midiToFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  private releaseVoice(voiceId: string, now: number): void {
    const voice = this.voices.get(voiceId);
    if (!voice || voice.released) return;
    voice.released = true;

    let maxRelease = 0.08;
    for (const rel of voice.releaseCallbacks) {
      maxRelease = Math.max(maxRelease, rel(now));
    }

    this.scheduleUiUpdate();
    voice.releaseTimer = window.setTimeout(() => {
      this.forceStopVoice(voiceId);
    }, (maxRelease + 0.12) * 1000);
  }

  private softStealVoice(voiceId: string, now: number): void {
    const voice = this.voices.get(voiceId);
    if (!voice) return;
    this.voices.delete(voiceId);
    if (voice.releaseTimer !== undefined) {
      clearTimeout(voice.releaseTimer);
    }
    if (voice.outputSendGains.length > 0) {
      for (const g of voice.outputSendGains) {
        try {
          g.gain.cancelScheduledValues(now);
          g.gain.setValueAtTime(Math.max(0.0001, finiteNum(g.gain.value, 0)), now);
          g.gain.linearRampToValueAtTime(0, now + 0.012);
        } catch {
          // ignore
        }
      }
      const tid = window.setTimeout(() => {
        this.pendingCleanupTimers.delete(tid);
        this.cleanupVoiceNodes(voice);
      }, 20);
      this.pendingCleanupTimers.add(tid);
    } else {
      this.cleanupVoiceNodes(voice);
    }
    this.emitActiveNotes();
  }

  private forceStopVoice(voiceId: string): void {
    const voice = this.voices.get(voiceId);
    if (!voice) return;
    if (voice.releaseTimer !== undefined) {
      clearTimeout(voice.releaseTimer);
    }
    this.voices.delete(voiceId);
    this.cleanupVoiceNodes(voice);
    this.emitActiveNotes();
  }

  private cleanupVoiceNodes(voice: ActiveVoice): void {
    for (const stop of voice.stopCallbacks) {
      try {
        stop();
      } catch {
        // Ignore already stopped oscillators
      }
    }
    for (const node of voice.cleanupNodes) {
      try {
        node.disconnect();
      } catch {
        // Ignore already disconnected nodes
      }
    }
  }

  private getOrCreateFxInputBus(nodeId: string): GainNode {
    let bus = this.fxInputBuses.get(nodeId);
    if (!bus) {
      bus = this.ctx!.createGain();
      bus.gain.value = 1;
      this.fxInputBuses.set(nodeId, bus);
    }
    return bus;
  }

  private rebuildMasterFxChain(): void {
    if (!this.ctx || !this.masterInputBus || !this.masterSafetyClipper || !this.patch) return;

    this.lastFxSignature = this.computeFxSignature(this.patch);

    try {
      this.masterInputBus.disconnect();
    } catch {
      // ignore
    }
    for (const bus of this.fxInputBuses.values()) {
      try {
        bus.disconnect();
      } catch {
        // ignore
      }
    }
    for (const fx of this.masterFxChain) {
      fx.dispose();
    }
    this.masterFxChain = [];

    const now = this.ctx.currentTime;
    const fxNodes = this.patch.nodes.filter(
      (n) => (n.type === 'delay' || n.type === 'reverb' || n.type === 'output') && !n.bypassed
    );

    const orderWeight = (t: string) => (t === 'delay' ? 1 : t === 'reverb' ? 2 : 3);
    fxNodes.sort((a, b) => orderWeight(a.type) - orderWeight(b.type));

    let prevOut: AudioNode = this.masterInputBus;

    for (const node of fxNodes) {
      let fx: MasterFxInstance | null = null;
      if (node.type === 'delay') {
        fx = this.createMasterDelay(node, now);
      } else if (node.type === 'reverb') {
        fx = this.createMasterReverb(node, now);
      } else if (node.type === 'output') {
        fx = this.createMasterOutput(node, now);
      }
      if (fx) {
        prevOut.connect(fx.input);
        const directBus = this.getOrCreateFxInputBus(node.id);
        directBus.connect(fx.input);
        prevOut = fx.output;
        this.masterFxChain.push(fx);
      }
    }

    prevOut.connect(this.masterSafetyClipper);

    // Any bypassed or removed FX direct buses chain forward into the next active FX (or masterSafetyClipper)
    const fxOrder = this.patch.nodes.filter(
      (n) => n.type === 'delay' || n.type === 'reverb' || n.type === 'output'
    );
    fxOrder.sort((a, b) => orderWeight(a.type) - orderWeight(b.type));

    for (const [id, bus] of this.fxInputBuses.entries()) {
      const stillInPatch = this.patch.nodes.some((n) => n.id === id);
      if (!stillInPatch && this.voices.size === 0) {
        this.fxInputBuses.delete(id);
        continue;
      }
      const stillActive = this.masterFxChain.some((fx) => fx.id === id);
      if (!stillActive) {
        const idx = fxOrder.findIndex((n) => n.id === id);
        let fallbackTarget: AudioNode = this.masterSafetyClipper;
        if (idx >= 0) {
          for (let j = idx + 1; j < fxOrder.length; j++) {
            const nextFx = this.masterFxChain.find((fx) => fx.id === fxOrder[j].id);
            if (nextFx) {
              fallbackTarget = nextFx.input;
              break;
            }
          }
        }
        bus.connect(fallbackTarget);
      }
    }
  }

  private createMasterDelay(node: SynthNode, now: number): MasterFxInstance {
    const ctx = this.ctx!;
    const input = ctx.createGain();
    const output = ctx.createGain();
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();

    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);
    const delayL = ctx.createDelay(2.5);
    const delayR = ctx.createDelay(2.5);
    const toneL = ctx.createBiquadFilter();
    const toneR = ctx.createBiquadFilter();
    toneL.type = 'lowpass';
    toneR.type = 'lowpass';
    const hpL = ctx.createBiquadFilter();
    const hpR = ctx.createBiquadFilter();
    hpL.type = 'highpass';
    hpR.type = 'highpass';

    const fbSelfL = ctx.createGain();
    const fbSelfR = ctx.createGain();
    const fbCrossLR = ctx.createGain();
    const fbCrossRL = ctx.createGain();

    const modOsc = ctx.createOscillator();
    modOsc.type = 'sine';
    const modGainL = ctx.createGain();
    const modGainR = ctx.createGain();
    modOsc.connect(modGainL);
    modOsc.connect(modGainR);
    modGainL.connect(delayL.delayTime);
    modGainR.connect(delayR.delayTime);
    modOsc.start(now);

    input.connect(dryGain);
    dryGain.connect(output);

    input.connect(splitter);
    splitter.connect(delayL, 0);
    splitter.connect(delayR, 1);

    delayL.connect(hpL);
    hpL.connect(toneL);
    delayR.connect(hpR);
    hpR.connect(toneR);

    toneL.connect(fbSelfL);
    fbSelfL.connect(delayL);
    toneL.connect(fbCrossLR);
    fbCrossLR.connect(delayR);

    toneR.connect(fbSelfR);
    fbSelfR.connect(delayR);
    toneR.connect(fbCrossRL);
    fbCrossRL.connect(delayL);

    toneL.connect(merger, 0, 0);
    toneR.connect(merger, 0, 1);
    merger.connect(wetGain);
    wetGain.connect(output);

    const updateParams = (p: Record<string, number | string | boolean>, t: number) => {
      const merged = { ...this.getLiveNodeParams(node.id, node.params), ...p };
      const time = clampFinite(merged.time, 0.02, 2.2, 0.26);
      const fb = clampFinite(
        finiteNum(merged.feedback, 0.32) + this.getMasterModOffset(node.id, 'feedback') * 0.45,
        0,
        0.92,
        0.32
      );
      const pingPong = clampFinite(merged.pingPong, 0, 1, 0.45);
      const modDepth = clampFinite(merged.modDepth, 0, 1, 0.14);
      const modRate = clampFinite(merged.modRate, 0.05, 5, 0.55);
      const tone = clampFinite(
        finiteNum(merged.tone, 3400) * Math.pow(2, this.getMasterModOffset(node.id, 'tone') * 2.0),
        200,
        16000,
        3400
      );
      const highpass = clampFinite(merged.highpass, 30, 1500, 120);
      const mix = clampFinite(
        finiteNum(merged.mix, 0.22) + this.getMasterModOffset(node.id, 'mix') * 0.6,
        0,
        1,
        0.22
      );

      const offsetR = time * (1 + pingPong * 0.28);
      delayL.delayTime.setTargetAtTime(time, t, 0.035);
      delayR.delayTime.setTargetAtTime(Math.min(2.4, offsetR), t, 0.035);

      const selfAmt = fb * (1 - pingPong * 0.85);
      const crossAmt = fb * (pingPong * 0.85);
      fbSelfL.gain.setTargetAtTime(selfAmt, t, 0.02);
      fbSelfR.gain.setTargetAtTime(selfAmt, t, 0.02);
      fbCrossLR.gain.setTargetAtTime(crossAmt, t, 0.02);
      fbCrossRL.gain.setTargetAtTime(crossAmt, t, 0.02);

      toneL.frequency.setTargetAtTime(tone, t, 0.02);
      toneR.frequency.setTargetAtTime(tone, t, 0.02);
      hpL.frequency.setTargetAtTime(highpass, t, 0.02);
      hpR.frequency.setTargetAtTime(highpass, t, 0.02);

      modOsc.frequency.setTargetAtTime(modRate, t, 0.02);
      const modSec = modDepth * 0.0045;
      modGainL.gain.setTargetAtTime(modSec, t, 0.02);
      modGainR.gain.setTargetAtTime(-modSec, t, 0.02);

      dryGain.gain.setTargetAtTime(1 - mix * 0.4, t, 0.02);
      wetGain.gain.setTargetAtTime(mix, t, 0.02);
    };

    updateParams(node.params, now);

    return {
      id: node.id,
      type: 'delay',
      input,
      output,
      updateParams,
      dispose: () => {
        try {
          modOsc.stop();
        } catch {
          // ignore
        }
        input.disconnect();
        output.disconnect();
        splitter.disconnect();
        merger.disconnect();
        delayL.disconnect();
        delayR.disconnect();
        toneL.disconnect();
        toneR.disconnect();
        hpL.disconnect();
        hpR.disconnect();
        fbSelfL.disconnect();
        fbSelfR.disconnect();
        fbCrossLR.disconnect();
        fbCrossRL.disconnect();
      },
    };
  }

  private createMasterReverb(node: SynthNode, now: number): MasterFxInstance {
    const ctx = this.ctx!;
    const input = ctx.createGain();
    const output = ctx.createGain();
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    const preDelayNode = ctx.createDelay(0.5);
    const convolver = ctx.createConvolver();

    let shimmerWorklet: AudioWorkletNode | null = null;
    const shimmerGain = ctx.createGain();
    shimmerGain.gain.value = 0;

    input.connect(dryGain);
    dryGain.connect(output);
    input.connect(preDelayNode);
    preDelayNode.connect(convolver);
    convolver.connect(wetGain);

    if (this.workletReady) {
      try {
        shimmerWorklet = new AudioWorkletNode(ctx, 'timbre-shimmer-processor', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [2],
          channelCount: 2,
          channelCountMode: 'explicit',
          channelInterpretation: 'speakers',
        });
        preDelayNode.connect(shimmerWorklet);
        shimmerWorklet.connect(convolver);
        shimmerWorklet.connect(shimmerGain);
        shimmerGain.connect(wetGain);
      } catch {
        shimmerWorklet = null;
      }
    }

    wetGain.connect(output);

    let lastSize = -1;
    let lastDamp = -1;

    const updateParams = (p: Record<string, number | string | boolean>, t: number) => {
      const merged = { ...this.getLiveNodeParams(node.id, node.params), ...p };
      const size = clampFinite(merged.size, 0.2, 14, 1.4);
      const preDelayMs = clampFinite(merged.preDelay, 0, 250, 16);
      const damping = clampFinite(
        finiteNum(merged.damping, 0.55) + this.getMasterModOffset(node.id, 'damping') * 0.55,
        0.05,
        1,
        0.55
      );
      const shimmerMix = clampFinite(
        finiteNum(merged.shimmerMix, 0) + this.getMasterModOffset(node.id, 'shimmerMix') * 0.75,
        0,
        1,
        0
      );
      const shimmerSt = clampFinite(merged.shimmerPitch, -24, 24, 12);
      const modulation = clampFinite(
        finiteNum(merged.modulation, 0.25) + this.getMasterModOffset(node.id, 'modulation') * 0.65,
        0,
        1,
        0.25
      );
      const freeze = Boolean(merged.freeze);
      const mix = clampFinite(
        finiteNum(merged.mix, 0.28) + this.getMasterModOffset(node.id, 'mix') * 0.65,
        0,
        1,
        0.28
      );

      preDelayNode.delayTime.setTargetAtTime(preDelayMs / 1000, t, 0.02);

      if (Math.abs(size - lastSize) > 0.12 || Math.abs(damping - lastDamp) > 0.05) {
        convolver.buffer = this.getOrCreateImpulse(size, damping);
        lastSize = size;
        lastDamp = damping;
      }

      if (shimmerWorklet) {
        const pitchRatio = Math.pow(2, shimmerSt / 12);
        shimmerWorklet.parameters.get('pitchRatio')?.setTargetAtTime(pitchRatio, t, 0.02);
        shimmerWorklet.parameters.get('shimmerMix')?.setTargetAtTime(shimmerMix, t, 0.02);
        shimmerWorklet.parameters.get('damping')?.setTargetAtTime(damping, t, 0.02);
        shimmerWorklet.parameters.get('modulation')?.setTargetAtTime(modulation, t, 0.02);
        shimmerWorklet.parameters.get('freeze')?.setValueAtTime(freeze ? 1 : 0, t);
        shimmerGain.gain.setTargetAtTime(freeze ? 0.85 : shimmerMix * 0.55, t, 0.02);
      }

      dryGain.gain.setTargetAtTime(1 - mix * 0.35, t, 0.02);
      wetGain.gain.setTargetAtTime(mix, t, 0.02);
    };

    updateParams(node.params, now);

    return {
      id: node.id,
      type: 'reverb',
      input,
      output,
      updateParams,
      dispose: () => {
        if (shimmerWorklet) {
          try {
            shimmerWorklet.port.postMessage('stop');
            shimmerWorklet.disconnect();
          } catch {
            // ignore
          }
        }
        input.disconnect();
        output.disconnect();
        preDelayNode.disconnect();
        convolver.disconnect();
        shimmerGain.disconnect();
      },
    };
  }

  private createMasterOutput(node: SynthNode, now: number): MasterFxInstance {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner();
    gain.connect(panner);

    const updateParams = (p: Record<string, number | string | boolean>, t: number) => {
      const merged = { ...this.getLiveNodeParams(node.id, node.params), ...p };
      const g = clampFinite(merged.gain, 0, 1.6, 0.82);
      const pan = clampFinite(merged.pan, -1, 1, 0);
      gain.gain.setTargetAtTime(g, t, 0.02);
      panner.pan.setTargetAtTime(pan, t, 0.02);
    };

    updateParams(node.params, now);

    return {
      id: node.id,
      type: 'output',
      input: gain,
      output: panner,
      updateParams,
      dispose: () => {
        gain.disconnect();
        panner.disconnect();
      },
    };
  }

  private buildVoiceGraph(
    voiceId: string,
    midi: number,
    velNorm: number,
    now: number
  ): ActiveVoice | null {
    if (!this.ctx || !this.patch || !this.masterInputBus) return null;

    const ctx = this.ctx;
    const baseFreq = this.midiToFreq(midi);
    const voiceRandom = Math.random() * 2 - 1;

    const cleanupNodes: AudioNode[] = [];
    const outputSendGains: GainNode[] = [];
    const stopCallbacks: (() => void)[] = [];
    const releaseCallbacks: ((t: number) => number)[] = [];
    const nodeControllers = new Map<string, VoiceNodeController>();
    const modSlotUpdaters = new Map<string, (slot: ModMatrixSlot, t: number) => void>();

    const audioInputs = new Map<string, GainNode>();
    const audioOutputs = new Map<string, AudioNode>();
    const cvOutputs = new Map<string, AudioNode>();
    const cvTargets = new Map<string, { param: AudioParam; baseScale: number }>();
    const modParamTargets = new Map<string, { param: AudioParam; baseScale: number }>();

    const track = <T extends AudioNode>(n: T): T => {
      cleanupNodes.push(n);
      return n;
    };

    try {
    // Pass 1: Instantiate per-voice audio/modulator nodes
    for (const node of this.patch.nodes) {
      if (node.type === 'delay' || node.type === 'reverb' || node.type === 'output') {
        continue;
      }

      if (node.bypassed) {
        const pass = track(ctx.createGain());
        audioInputs.set(`${node.id}:in`, pass);
        audioOutputs.set(`${node.id}:out`, pass);
        continue;
      }

      switch (node.type) {
        case 'oscillator': {
          const unisonCount = Math.max(1, Math.min(5, Math.round(finiteNum(node.params.unison, 1))));
          const oscCount = unisonCount === 5 ? 5 : unisonCount === 3 ? 3 : 1;
          const levelGain = track(ctx.createGain());
          const ampCvTarget = track(ctx.createGain());
          ampCvTarget.gain.value = 1;
          const pitchSum = track(ctx.createGain());
          pitchSum.gain.value = 1;
          const pitchConst = track(ctx.createConstantSource());
          pitchConst.offset.value = 0;
          pitchConst.connect(pitchSum);
          pitchConst.start(now);
          stopCallbacks.push(() => pitchConst.stop());

          const subOscs: { osc: OscillatorNode; pan: StereoPannerNode; idx: number }[] = [];
          const normLevel = 1 / Math.sqrt(oscCount);

          for (let i = 0; i < oscCount; i++) {
            const osc = track(ctx.createOscillator());
            const pan = track(ctx.createStereoPanner());
            const subGain = track(ctx.createGain());
            subGain.gain.value = normLevel;
            pitchSum.connect(osc.detune);
            osc.connect(subGain);
            subGain.connect(pan);
            pan.connect(levelGain);
            osc.start(now);
            stopCallbacks.push(() => osc.stop());
            subOscs.push({ osc, pan, idx: i });
          }
          levelGain.connect(ampCvTarget);

          const applyOsc = (p: Record<string, number | string | boolean>, t: number, immediate = false) => {
            const merged = { ...this.getLiveNodeParams(node.id, node.params), ...p };
            const wf = String(merged.waveform ?? 'sawtooth');
            const periodic = this.periodicWaves.get(wf);
            const oct = clampFinite(merged.octave, -3, 3, 0);
            const st = clampFinite(merged.semitone, -24, 24, 0);
            const det = clampFinite(merged.detune, -100, 100, 0);
            const uniDetune = clampFinite(merged.unisonDetune, 0, 60, 14);
            const spread = clampFinite(merged.stereoSpread, 0, 1, 0.55);
            const freq = clampFinite(
              baseFreq * Math.pow(2, oct + (st + this.pitchBendSemitones) / 12),
              15,
              18000,
              220
            );

            for (const sub of subOscs) {
              if (periodic) {
                sub.osc.setPeriodicWave(periodic);
              } else {
                sub.osc.type = safeOscType(wf, 'sawtooth');
              }
              setAudioParam(sub.osc.frequency, freq, t, 0.005, immediate);
              const normOffset =
                oscCount === 1 ? 0 : (sub.idx / (oscCount - 1)) * 2 - 1;
              setAudioParam(sub.osc.detune, det + normOffset * uniDetune, t, 0.006, immediate);
              setAudioParam(sub.pan.pan, normOffset * spread, t, 0.01, immediate);
            }
            setAudioParam(levelGain.gain, clampFinite(merged.gain, 0, 1.5, 0.7) * velNorm, t, 0.005, immediate);
          };

          applyOsc(node.params, now, true);

          audioOutputs.set(`${node.id}:out`, ampCvTarget);
          cvTargets.set(`${node.id}:pitch`, { param: pitchConst.offset, baseScale: 1200 });
          cvTargets.set(`${node.id}:amp`, { param: ampCvTarget.gain, baseScale: 0.75 });

          modParamTargets.set(`${node.id}:detune`, { param: pitchConst.offset, baseScale: 100 });
          modParamTargets.set(`${node.id}:pitch`, { param: pitchConst.offset, baseScale: 1200 });
          modParamTargets.set(`${node.id}:gain`, { param: levelGain.gain, baseScale: 0.8 });

          nodeControllers.set(node.id, {
            type: 'oscillator',
            updateParams: applyOsc,
            setPitchBend: (_semi, t) => applyOsc({}, t),
          });
          break;
        }

        case 'fmOperator': {
          const carrier = track(ctx.createOscillator());
          const mod = track(ctx.createOscillator());
          const modHarmonic = track(ctx.createOscillator());
          const modGain = track(ctx.createGain());
          const fbGain = track(ctx.createGain());

          // Noise-FM subchain
          const noiseSrc = track(ctx.createBufferSource());
          noiseSrc.buffer = this.noiseBufferWhite;
          noiseSrc.loop = true;
          const noiseBp = track(ctx.createBiquadFilter());
          noiseBp.type = 'bandpass';
          noiseBp.Q.value = 1.6;
          const noiseFmGain = track(ctx.createGain());

          // External Audio FM In port
          const modAudioIn = track(ctx.createGain());
          modAudioIn.gain.value = 650;

          const levelGain = track(ctx.createGain());
          const ampCvTarget = track(ctx.createGain());
          ampCvTarget.gain.value = 1;

          mod.connect(modGain);
          modHarmonic.connect(fbGain);
          fbGain.connect(modGain);
          modGain.connect(carrier.frequency);

          noiseSrc.connect(noiseBp);
          noiseBp.connect(noiseFmGain);
          noiseFmGain.connect(carrier.frequency);

          modAudioIn.connect(carrier.frequency);

          carrier.connect(levelGain);
          levelGain.connect(ampCvTarget);

          const applyFm = (p: Record<string, number | string | boolean>, t: number, immediate = false) => {
            const merged = { ...this.getLiveNodeParams(node.id, node.params), ...p };
            carrier.type = safeOscType(merged.carrierWave, 'sine');
            mod.type = safeOscType(merged.modWave, 'sine');
            modHarmonic.type = 'sine';

            const oct = clampFinite(merged.octave, -3, 3, 0);
            const ratio = clampFinite(merged.ratio, 0.25, 16, 2.0);
            const modIndex = clampFinite(merged.modIndex, 0, 2000, 260);
            const feedback = clampFinite(merged.feedback, 0, 0.95, 0.12);
            const noiseDepth = clampFinite(merged.noiseFmDepth, 0, 1200, 0);
            const maxBp = Math.min(10000, ctx.sampleRate * 0.36);
            const noiseBw = clampFinite(merged.noiseBandwidth, 200, maxBp, 2400);
            const cFreq = clampFinite(baseFreq * Math.pow(2, oct + this.pitchBendSemitones / 12), 15, 16000, 220);

            setAudioParam(carrier.frequency, cFreq, t, 0.005, immediate);
            setAudioParam(mod.frequency, clampFinite(cFreq * ratio, 10, 20000, 440), t, 0.005, immediate);
            setAudioParam(modHarmonic.frequency, clampFinite(cFreq * ratio * 2, 10, 20000, 880), t, 0.005, immediate);
            setAudioParam(modGain.gain, modIndex * (0.4 + velNorm * 0.6), t, 0.006, immediate);
            setAudioParam(fbGain.gain, modIndex * feedback * 0.65, t, 0.006, immediate);
            setAudioParam(noiseBp.frequency, noiseBw, t, 0.01, immediate);
            setAudioParam(noiseFmGain.gain, noiseDepth * (0.45 + velNorm * 0.55), t, 0.008, immediate);
            setAudioParam(levelGain.gain, clampFinite(merged.gain, 0, 1.5, 0.75) * velNorm, t, 0.005, immediate);
          };

          applyFm(node.params, now, true);
          carrier.start(now);
          mod.start(now);
          modHarmonic.start(now);
          noiseSrc.start(now);
          stopCallbacks.push(() => {
            carrier.stop();
            mod.stop();
            modHarmonic.stop();
            noiseSrc.stop();
          });

          audioInputs.set(`${node.id}:modIn`, modAudioIn);
          audioOutputs.set(`${node.id}:out`, ampCvTarget);
          cvTargets.set(`${node.id}:pitch`, { param: carrier.detune, baseScale: 1200 });
          cvTargets.set(`${node.id}:index`, { param: modGain.gain, baseScale: 700 });
          cvTargets.set(`${node.id}:amp`, { param: ampCvTarget.gain, baseScale: 0.75 });

          modParamTargets.set(`${node.id}:pitch`, { param: carrier.detune, baseScale: 1200 });
          modParamTargets.set(`${node.id}:modIndex`, { param: modGain.gain, baseScale: 700 });
          modParamTargets.set(`${node.id}:noiseFmDepth`, { param: noiseFmGain.gain, baseScale: 550 });
          modParamTargets.set(`${node.id}:noiseBandwidth`, { param: noiseBp.detune, baseScale: 1500 });
          modParamTargets.set(`${node.id}:gain`, { param: levelGain.gain, baseScale: 0.8 });

          nodeControllers.set(node.id, {
            type: 'fmOperator',
            updateParams: applyFm,
            setPitchBend: (_semi, t) => applyFm({}, t),
          });
          break;
        }

        case 'physicalString': {
          const levelGain = track(ctx.createGain());
          const ampCvTarget = track(ctx.createGain());
          ampCvTarget.gain.value = 1;
          levelGain.connect(ampCvTarget);

          let usedWorklet = false;
          if (this.workletReady) {
            try {
              const worklet = track(
                new AudioWorkletNode(ctx, 'timbre-karplus-processor', {
                  numberOfInputs: 1,
                  numberOfOutputs: 1,
                  outputChannelCount: [1],
                })
              );
              worklet.onprocessorerror = () => {
                this.workletReady = false;
              };
              const exciterIn = track(ctx.createGain());
              exciterIn.gain.value = 1;
              exciterIn.connect(worklet);
              worklet.connect(levelGain);

            const freqParam = worklet.parameters.get('frequency')!;
            const dampParam = worklet.parameters.get('damping')!;
            const decayParam = worklet.parameters.get('decay')!;
            const brightParam = worklet.parameters.get('brightness')!;
            const sympParam = worklet.parameters.get('sympathetic')!;
            const bowPressParam = worklet.parameters.get('bowPressure')!;
            const bowPosParam = worklet.parameters.get('bowPosition')!;
            const rosinParam = worklet.parameters.get('rosin')!;
            const excMixParam = worklet.parameters.get('exciterMix')!;
            const modeParam = worklet.parameters.get('excitationMode')!;
            const gateParam = worklet.parameters.get('gate')!;
            const velParam = worklet.parameters.get('velocity')!;

            const applyString = (p: Record<string, number | string | boolean>, t: number, immediate = false) => {
              const merged = { ...this.getLiveNodeParams(node.id, node.params), ...p };
              const oct = clampFinite(merged.octave, -3, 3, 0);
              const freq = clampFinite(baseFreq * Math.pow(2, oct + this.pitchBendSemitones / 12), 25, 5500, 220);
              const exc = String(merged.excitation ?? 'pluck');
              const modeNum = exc === 'bow' ? 1 : exc === 'hammer' ? 2 : 0;

              setAudioParam(freqParam, freq, t, 0.004, immediate);
              dampParam.setValueAtTime(clampFinite(merged.damping, 0.02, 0.99, 0.45), t);
              decayParam.setValueAtTime(clampFinite(merged.decay, 0.5, 0.995, 0.985), t);
              brightParam.setValueAtTime(clampFinite(merged.brightness, 0.05, 1, 0.72), t);
              sympParam.setValueAtTime(clampFinite(merged.sympathetic, 0, 1, 0), t);
              setAudioParam(bowPressParam, clampFinite(merged.bowPressure, 0.05, 1, 0.56), t, 0.01, immediate);
              bowPosParam.setValueAtTime(clampFinite(merged.bowPosition, 0.04, 0.48, 0.14), t);
              rosinParam.setValueAtTime(clampFinite(merged.rosin, 0, 1, 0.32), t);
              excMixParam.setValueAtTime(clampFinite(merged.exciterMix, 0, 1, 0.7), t);
              modeParam.setValueAtTime(modeNum, t);
              velParam.setValueAtTime(velNorm, t);
              setAudioParam(levelGain.gain, clampFinite(merged.gain, 0, 1.5, 0.85), t, 0.005, immediate);
            };

            applyString(node.params, now, true);
            gateParam.setValueAtTime(1, now);

            releaseCallbacks.push((t) => {
              gateParam.setValueAtTime(0, t);
              return 0.42;
            });
            stopCallbacks.push(() => {
              try {
                worklet.port.postMessage('stop');
              } catch {
                // ignore
              }
            });

            audioInputs.set(`${node.id}:exciter`, exciterIn);
            audioOutputs.set(`${node.id}:out`, ampCvTarget);
            cvTargets.set(`${node.id}:pitch`, { param: freqParam, baseScale: baseFreq * 0.08 });
            cvTargets.set(`${node.id}:bow`, { param: bowPressParam, baseScale: 0.38 });
            cvTargets.set(`${node.id}:amp`, { param: ampCvTarget.gain, baseScale: 0.75 });

            modParamTargets.set(`${node.id}:pitch`, { param: freqParam, baseScale: baseFreq * 0.06 });
            modParamTargets.set(`${node.id}:bowPressure`, { param: bowPressParam, baseScale: 0.38 });
            modParamTargets.set(`${node.id}:damping`, { param: dampParam, baseScale: 0.35 });
            modParamTargets.set(`${node.id}:brightness`, { param: brightParam, baseScale: 0.4 });
            modParamTargets.set(`${node.id}:rosin`, { param: rosinParam, baseScale: 0.45 });
            modParamTargets.set(`${node.id}:gain`, { param: levelGain.gain, baseScale: 0.7 });

              nodeControllers.set(node.id, {
                type: 'physicalString',
                updateParams: applyString,
                setPitchBend: (_semi, t) => applyString({}, t),
              });
              usedWorklet = true;
            } catch {
              this.workletReady = false;
            }
          }
          if (!usedWorklet) {
            // Modal waveguide fallback if AudioWorklet unavailable
            const osc1 = track(ctx.createOscillator());
            const osc2 = track(ctx.createOscillator());
            const bodyFilter = track(ctx.createBiquadFilter());
            const exciterIn = track(ctx.createGain());
            osc1.type = 'sawtooth';
            osc2.type = 'triangle';
            bodyFilter.type = 'lowpass';
            osc1.connect(bodyFilter);
            osc2.connect(bodyFilter);
            exciterIn.connect(bodyFilter);
            bodyFilter.connect(levelGain);

            const applyFallback = (p: Record<string, number | string | boolean>, t: number, immediate = false) => {
              const merged = { ...this.getLiveNodeParams(node.id, node.params), ...p };
              const oct = clampFinite(merged.octave, -3, 3, 0);
              const freq = clampFinite(baseFreq * Math.pow(2, oct + this.pitchBendSemitones / 12), 20, 16000, 220);
              setAudioParam(osc1.frequency, freq, t, 0.005, immediate);
              setAudioParam(osc2.frequency, clampFinite(freq * 2, 20, 18000, 440), t, 0.005, immediate);
              setAudioParam(bodyFilter.frequency, clampFinite(freq * (2 + clampFinite(merged.brightness, 0.05, 1, 0.7) * 6), 80, 16000, 1800), t, 0.01, immediate);
              setAudioParam(levelGain.gain, clampFinite(merged.gain, 0, 1.5, 0.85) * velNorm * 0.55, t, 0.01, immediate);
            };
            applyFallback(node.params, now, true);
            osc1.start(now);
            osc2.start(now);
            stopCallbacks.push(() => {
              osc1.stop();
              osc2.stop();
            });
            audioInputs.set(`${node.id}:exciter`, exciterIn);
            audioOutputs.set(`${node.id}:out`, ampCvTarget);
            cvTargets.set(`${node.id}:pitch`, { param: osc1.detune, baseScale: 1200 });
            cvTargets.set(`${node.id}:bow`, { param: bodyFilter.detune, baseScale: 1800 });
            cvTargets.set(`${node.id}:amp`, { param: ampCvTarget.gain, baseScale: 0.75 });
            modParamTargets.set(`${node.id}:pitch`, { param: osc1.detune, baseScale: 1200 });
            modParamTargets.set(`${node.id}:gain`, { param: levelGain.gain, baseScale: 0.7 });
            nodeControllers.set(node.id, {
              type: 'physicalString',
              updateParams: applyFallback,
              setPitchBend: (_s, t) => applyFallback({}, t),
            });
          }
          break;
        }

        case 'noise': {
          const src = track(ctx.createBufferSource());
          src.loop = true;
          const bp = track(ctx.createBiquadFilter());
          bp.type = 'bandpass';
          const levelGain = track(ctx.createGain());
          const ampCvTarget = track(ctx.createGain());
          ampCvTarget.gain.value = 1;

          src.connect(bp);
          bp.connect(levelGain);
          levelGain.connect(ampCvTarget);

          const applyNoise = (p: Record<string, number | string | boolean>, t: number, immediate = false) => {
            const merged = { ...this.getLiveNodeParams(node.id, node.params), ...p };
            const isWhite = String(merged.color ?? 'pink') === 'white';
            if (!src.buffer) {
              src.buffer = isWhite ? this.noiseBufferWhite : this.noiseBufferPink;
            }
            const maxTone = Math.min(12000, ctx.sampleRate * 0.38);
            setAudioParam(bp.frequency, clampFinite(merged.tone, 80, maxTone, 2200), t, 0.01, immediate);
            setAudioParam(bp.Q, clampFinite(merged.q, 0.3, 16, 1.8), t, 0.01, immediate);
            setAudioParam(levelGain.gain, clampFinite(merged.gain, 0, 1.5, 0.2) * velNorm, t, 0.01, immediate);
          };

          applyNoise(node.params, now, true);
          src.start(now);
          stopCallbacks.push(() => src.stop());

          audioOutputs.set(`${node.id}:out`, ampCvTarget);
          cvTargets.set(`${node.id}:amp`, { param: ampCvTarget.gain, baseScale: 0.75 });
          modParamTargets.set(`${node.id}:tone`, { param: bp.detune, baseScale: 1500 });
          modParamTargets.set(`${node.id}:gain`, { param: levelGain.gain, baseScale: 0.5 });
          nodeControllers.set(node.id, { type: 'noise', updateParams: applyNoise });
          break;
        }

        case 'combFilter': {
          const inBus = track(ctx.createGain());
          const outBus = track(ctx.createGain());
          const dryGain = track(ctx.createGain());
          const wetGain = track(ctx.createGain());
          const delayNode = track(ctx.createDelay(0.12));
          const dampFilter = track(ctx.createBiquadFilter());
          dampFilter.type = 'lowpass';
          const loopLimiter = track(ctx.createWaveShaper());
          loopLimiter.curve = this.getCombLoopCurve();
          const fbGain = track(ctx.createGain());

          inBus.connect(dryGain);
          dryGain.connect(outBus);

          inBus.connect(delayNode);
          delayNode.connect(dampFilter);
          dampFilter.connect(wetGain);
          wetGain.connect(outBus);

          dampFilter.connect(loopLimiter);
          loopLimiter.connect(fbGain);
          fbGain.connect(delayNode);

          let safeDelayScale = 0.0012;
          let initialSignedFb = 0.56;

          const applyComb = (p: Record<string, number | string | boolean>, t: number, immediate = false) => {
            const merged = { ...this.getLiveNodeParams(node.id, node.params), ...p };
            const mode = String(merged.mode ?? 'feedback');
            const keyTrack = Boolean(merged.keyTrack ?? true);
            const ratio = clampFinite(merged.ratio, 0.04, 4, 0.15);
            const delayMs = clampFinite(merged.delayMs, 0.3, 50, 4.5);
            const rawFb = clampFinite(merged.feedback, -0.88, 0.88, 0.56);
            const damping = clampFinite(merged.damping, 0, 0.95, 0.42);
            const mix = clampFinite(merged.mix, 0, 1, 0.45);

            const trackedDelay = (1 / Math.max(25, baseFreq)) * ratio;
            const targetDelay = clampFinite(keyTrack ? trackedDelay : delayMs / 1000, 0.00025, 0.09, 0.004);
            setAudioParam(delayNode.delayTime, targetDelay, t, 0.008, immediate);
            safeDelayScale = Math.min(0.0022, Math.max(0.00008, targetDelay * 0.55));

            const signedFb = mode === 'feedforward' ? 0 : mode === 'feedback' ? Math.abs(rawFb) : rawFb;
            initialSignedFb = signedFb;
            setAudioParam(fbGain.gain, signedFb, t, 0.01, immediate);
            setAudioParam(dampFilter.frequency, Math.max(900, Math.min(14500 - damping * 13000, ctx.sampleRate * 0.4)), t, 0.01, immediate);

            setAudioParam(dryGain.gain, 1 - mix * 0.45, t, 0.01, immediate);
            setAudioParam(wetGain.gain, mix * (mode === 'feedforward' ? 0.85 : 0.6), t, 0.01, immediate);
          };

          applyComb(node.params, now, true);
          const safeFbScale = Math.min(0.24, Math.max(0.05, 0.93 - Math.abs(initialSignedFb)));
          audioInputs.set(`${node.id}:in`, inBus);
          audioOutputs.set(`${node.id}:out`, outBus);
          cvTargets.set(`${node.id}:freq`, { param: delayNode.delayTime, baseScale: safeDelayScale });
          cvTargets.set(`${node.id}:fb`, { param: fbGain.gain, baseScale: safeFbScale });

          modParamTargets.set(`${node.id}:ratio`, { param: delayNode.delayTime, baseScale: safeDelayScale });
          modParamTargets.set(`${node.id}:delayMs`, { param: delayNode.delayTime, baseScale: safeDelayScale });
          modParamTargets.set(`${node.id}:feedback`, { param: fbGain.gain, baseScale: safeFbScale });
          modParamTargets.set(`${node.id}:mix`, { param: wetGain.gain, baseScale: 0.5 });

          nodeControllers.set(node.id, { type: 'combFilter', updateParams: applyComb });
          break;
        }

        case 'filter': {
          const bq = track(ctx.createBiquadFilter());
          const baseQ = clampFinite(node.params.resonance, 0.35, 18, 2.2);
          const maxCut = Math.min(15500, ctx.sampleRate * 0.4);
          const applyFilter = (p: Record<string, number | string | boolean>, t: number, immediate = false) => {
            const merged = { ...this.getLiveNodeParams(node.id, node.params), ...p };
            bq.type = safeFilterType(merged.mode, 'lowpass');
            const baseCut = clampFinite(merged.cutoff, 40, maxCut, 3200);
            const keyTrack = clampFinite(merged.keyTrack, 0, 1.5, 0.35);
            const tracked = baseCut + (baseFreq - 261.63) * keyTrack * 2.5 + this.filterCutoffMod;
            setAudioParam(bq.frequency, clampFinite(tracked, 40, maxCut, 3200), t, 0.01, immediate);
            setAudioParam(bq.Q, clampFinite(merged.resonance, 0.3, 18, 2.2), t, 0.01, immediate);
            setAudioParam(bq.gain, clampFinite(merged.gain, -24, 24, 6), t, 0.01, immediate);
          };

          applyFilter(node.params, now, true);
          const inBus = track(ctx.createGain());
          inBus.connect(bq);

          audioInputs.set(`${node.id}:in`, inBus);
          audioOutputs.set(`${node.id}:out`, bq);
          cvTargets.set(`${node.id}:cutoff`, { param: bq.detune, baseScale: 1800 });

          modParamTargets.set(`${node.id}:cutoff`, { param: bq.detune, baseScale: 1800 });
          modParamTargets.set(`${node.id}:resonance`, {
            param: bq.Q,
            baseScale: Math.min(2.5, Math.max(0.1, (baseQ - 0.45) * 0.5)),
          });
          modParamTargets.set(`${node.id}:gain`, { param: bq.gain, baseScale: 10 });

          nodeControllers.set(node.id, { type: 'filter', updateParams: applyFilter });
          break;
        }

        case 'parametricEq': {
          const inBus = track(ctx.createGain());
          const lowShelf = track(ctx.createBiquadFilter());
          lowShelf.type = 'lowshelf';
          const mid1 = track(ctx.createBiquadFilter());
          mid1.type = 'peaking';
          const mid2 = track(ctx.createBiquadFilter());
          mid2.type = 'peaking';
          const highShelf = track(ctx.createBiquadFilter());
          highShelf.type = 'highshelf';
          const outTrim = track(ctx.createGain());
          const ampCvTarget = track(ctx.createGain());
          ampCvTarget.gain.value = 1;

          inBus.connect(lowShelf);
          lowShelf.connect(mid1);
          mid1.connect(mid2);
          mid2.connect(highShelf);
          highShelf.connect(outTrim);
          outTrim.connect(ampCvTarget);

          const applyEq = (p: Record<string, number | string | boolean>, t: number, immediate = false) => {
            const merged = { ...this.getLiveNodeParams(node.id, node.params), ...p };
            setAudioParam(lowShelf.frequency, clampFinite(merged.lowFreq, 40, 2000, 180), t, 0.01, immediate);
            setAudioParam(lowShelf.gain, clampFinite(merged.lowGain, -18, 18, 2.5), t, 0.01, immediate);

            setAudioParam(mid1.frequency, clampFinite(merged.mid1Freq, 80, 6000, 420), t, 0.01, immediate);
            setAudioParam(mid1.gain, clampFinite(merged.mid1Gain, -18, 18, 5.0), t, 0.01, immediate);
            setAudioParam(mid1.Q, clampFinite(merged.mid1Q, 0.3, 12, 2.2), t, 0.01, immediate);

            setAudioParam(mid2.frequency, clampFinite(merged.mid2Freq, 200, 12000, 2400), t, 0.01, immediate);
            setAudioParam(mid2.gain, clampFinite(merged.mid2Gain, -18, 18, 4.5), t, 0.01, immediate);
            setAudioParam(mid2.Q, clampFinite(merged.mid2Q, 0.3, 12, 2.4), t, 0.01, immediate);

            setAudioParam(highShelf.frequency, clampFinite(merged.highFreq, 800, 16000, 5200), t, 0.01, immediate);
            setAudioParam(highShelf.gain, clampFinite(merged.highGain, -18, 18, -2.0), t, 0.01, immediate);

            setAudioParam(outTrim.gain, clampFinite(merged.outputGain, 0, 2, 1.0), t, 0.01, immediate);
          };

          applyEq(node.params, now, true);
          audioInputs.set(`${node.id}:in`, inBus);
          audioOutputs.set(`${node.id}:out`, ampCvTarget);
          cvTargets.set(`${node.id}:amp`, { param: ampCvTarget.gain, baseScale: 0.75 });

          modParamTargets.set(`${node.id}:lowGain`, { param: lowShelf.gain, baseScale: 10 });
          modParamTargets.set(`${node.id}:mid1Freq`, { param: mid1.detune, baseScale: 1800 });
          modParamTargets.set(`${node.id}:mid1Gain`, { param: mid1.gain, baseScale: 10 });
          modParamTargets.set(`${node.id}:mid2Freq`, { param: mid2.detune, baseScale: 1800 });
          modParamTargets.set(`${node.id}:mid2Gain`, { param: mid2.gain, baseScale: 10 });
          modParamTargets.set(`${node.id}:highGain`, { param: highShelf.gain, baseScale: 10 });
          modParamTargets.set(`${node.id}:outputGain`, { param: outTrim.gain, baseScale: 0.7 });

          nodeControllers.set(node.id, { type: 'parametricEq', updateParams: applyEq });
          break;
        }

        case 'shaper': {
          const inBus = track(ctx.createGain());
          const outBus = track(ctx.createGain());
          const dry = track(ctx.createGain());
          const wet = track(ctx.createGain());
          const ws = track(ctx.createWaveShaper());
          ws.oversample = '2x';

          inBus.connect(dry);
          dry.connect(outBus);
          inBus.connect(ws);
          ws.connect(wet);
          wet.connect(outBus);

          const applyShaper = (p: Record<string, number | string | boolean>, t: number, immediate = false) => {
            const merged = { ...this.getLiveNodeParams(node.id, node.params), ...p };
            const drive = clampFinite(merged.drive, 0, 1, 0.25);
            const asym = clampFinite(merged.asymmetry, 0, 1, 0.15);
            const mix = clampFinite(merged.mix, 0, 1, 0.6);
            ws.curve = this.getShaperCurve(drive, asym);
            setAudioParam(dry.gain, 1 - mix, t, 0.01, immediate);
            setAudioParam(wet.gain, mix, t, 0.01, immediate);
          };

          applyShaper(node.params, now, true);
          audioInputs.set(`${node.id}:in`, inBus);
          audioOutputs.set(`${node.id}:out`, outBus);
          modParamTargets.set(`${node.id}:mix`, { param: wet.gain, baseScale: 0.6 });
          nodeControllers.set(node.id, { type: 'shaper', updateParams: applyShaper });
          break;
        }

        case 'chorus': {
          const inBus = track(ctx.createGain());
          const outBus = track(ctx.createGain());
          const dryGain = track(ctx.createGain());
          const wetGain = track(ctx.createGain());
          const toneFilter = track(ctx.createBiquadFilter());
          toneFilter.type = 'lowpass';

          inBus.connect(dryGain);
          dryGain.connect(outBus);

          const tapCount = Math.max(2, Math.min(6, Math.round(finiteNum(node.params.voices, 4))));
          const lfoRateBase = clampFinite(node.params.rate, 0.04, 4.5, 0.42);
          const tapNorm = 1 / Math.sqrt(tapCount);

          const modConst = track(ctx.createConstantSource());
          modConst.offset.value = 1;
          modConst.start(now);
          stopCallbacks.push(() => modConst.stop());

          const rateCvGain = track(ctx.createGain());
          rateCvGain.gain.value = 0;
          modConst.connect(rateCvGain);

          const depthCvGain = track(ctx.createGain());
          depthCvGain.gain.value = 0;
          modConst.connect(depthCvGain);

          const taps: {
            delay: DelayNode;
            lfo: OscillatorNode;
            depthGain: GainNode;
            pan: StereoPannerNode;
            idx: number;
          }[] = [];

          for (let i = 0; i < tapCount; i++) {
            const delay = track(ctx.createDelay(0.06));
            delay.delayTime.value = 0.008 + i * 0.0032;
            const lfo = track(ctx.createOscillator());
            lfo.type = 'sine';
            lfo.frequency.value = lfoRateBase * (0.88 + i * 0.07);
            const depthGain = track(ctx.createGain());
            const pan = track(ctx.createStereoPanner());
            const tapGain = track(ctx.createGain());
            tapGain.gain.value = tapNorm;

            inBus.connect(delay);
            rateCvGain.connect(lfo.frequency);
            depthCvGain.connect(depthGain.gain);
            lfo.connect(depthGain);
            depthGain.connect(delay.delayTime);
            delay.connect(tapGain);
            tapGain.connect(pan);
            pan.connect(toneFilter);
            lfo.start(now);
            stopCallbacks.push(() => lfo.stop());
            taps.push({ delay, lfo, depthGain, pan, idx: i });
          }

          toneFilter.connect(wetGain);
          wetGain.connect(outBus);

          const applyChorus = (p: Record<string, number | string | boolean>, t: number, immediate = false) => {
            const merged = { ...this.getLiveNodeParams(node.id, node.params), ...p };
            const rate = clampFinite(merged.rate, 0.04, 4.5, 0.42);
            const depth = clampFinite(merged.depth, 0, 1, 0.55);
            const width = clampFinite(merged.stereoWidth, 0, 1, 0.85);
            const tone = clampFinite(merged.tone, 400, 14000, 6400);
            const mix = clampFinite(merged.mix, 0, 1, 0.52);

            setAudioParam(toneFilter.frequency, tone, t, 0.015, immediate);
            setAudioParam(dryGain.gain, 1 - mix * 0.42, t, 0.015, immediate);
            setAudioParam(wetGain.gain, mix * 0.95, t, 0.015, immediate);

            for (const tap of taps) {
              const phaseRatio = 0.84 + (tap.idx / Math.max(1, tapCount - 1)) * 0.34;
              setAudioParam(tap.lfo.frequency, rate * phaseRatio, t, 0.02, immediate);
              setAudioParam(tap.depthGain.gain, depth * 0.0042, t, 0.02, immediate);
              const panPos = tapCount === 1 ? 0 : (tap.idx / (tapCount - 1)) * 2 - 1;
              setAudioParam(tap.pan.pan, panPos * width, t, 0.02, immediate);
            }
          };

          applyChorus(node.params, now, true);
          audioInputs.set(`${node.id}:in`, inBus);
          audioOutputs.set(`${node.id}:out`, outBus);
          cvTargets.set(`${node.id}:rate`, { param: rateCvGain.gain, baseScale: 1.5 });
          cvTargets.set(`${node.id}:depth`, { param: depthCvGain.gain, baseScale: 0.004 });
          modParamTargets.set(`${node.id}:rate`, { param: rateCvGain.gain, baseScale: 1.5 });
          modParamTargets.set(`${node.id}:depth`, { param: depthCvGain.gain, baseScale: 0.004 });
          modParamTargets.set(`${node.id}:mix`, { param: wetGain.gain, baseScale: 0.6 });

          nodeControllers.set(node.id, { type: 'chorus', updateParams: applyChorus });
          break;
        }

        case 'granularCloud': {
          const inBus = track(ctx.createGain());
          const outBus = track(ctx.createGain());

          let usedGranularWorklet = false;
          if (this.workletReady) {
            try {
              const gw = track(
                new AudioWorkletNode(ctx, 'timbre-granular-processor', {
                  numberOfInputs: 1,
                  numberOfOutputs: 1,
                  outputChannelCount: [2],
                  channelCount: 2,
                  channelCountMode: 'explicit',
                  channelInterpretation: 'speakers',
                })
              );
              inBus.connect(gw);
              gw.connect(outBus);

              const grainSizeP = gw.parameters.get('grainSize')!;
              const densityP = gw.parameters.get('density')!;
              const pitchP = gw.parameters.get('pitchShift')!;
              const snapP = gw.parameters.get('pitchSnap')!;
              const sprayP = gw.parameters.get('spray')!;
              const scatterP = gw.parameters.get('stereoScatter')!;
              const fbP = gw.parameters.get('feedback')!;
              const freezeP = gw.parameters.get('freeze')!;
              const mixP = gw.parameters.get('mix')!;

              const applyGranular = (p: Record<string, number | string | boolean>, t: number, immediate = false) => {
                const merged = { ...this.getLiveNodeParams(node.id, node.params), ...p };
                setAudioParam(grainSizeP, clampFinite(merged.grainSize, 20, 450, 165), t, 0.02, immediate);
                setAudioParam(densityP, clampFinite(merged.density, 1, 24, 11), t, 0.02, immediate);
                setAudioParam(pitchP, clampFinite(merged.pitchShift, -24, 24, 12), t, 0.02, immediate);
                const snapStr = String(merged.pitchSnap ?? 'octFifth');
                snapP.setValueAtTime(snapStr === 'octave' ? 1 : snapStr === 'free' ? 2 : 0, t);
                setAudioParam(sprayP, clampFinite(merged.spray, 0, 1, 0.45), t, 0.02, immediate);
                setAudioParam(scatterP, clampFinite(merged.stereoScatter, 0, 1, 0.78), t, 0.02, immediate);
                setAudioParam(fbP, clampFinite(merged.feedback, 0, 0.75, 0.25), t, 0.02, immediate);
                freezeP.setValueAtTime(Boolean(merged.freeze) ? 1 : 0, t);
                setAudioParam(mixP, clampFinite(merged.mix, 0, 1, 0.55), t, 0.02, immediate);
              };

              applyGranular(node.params, now, true);
              stopCallbacks.push(() => {
                try {
                  gw.port.postMessage('stop');
                } catch {
                  // ignore
                }
              });

              audioInputs.set(`${node.id}:in`, inBus);
              audioOutputs.set(`${node.id}:out`, outBus);
              cvTargets.set(`${node.id}:pitch`, { param: pitchP, baseScale: 12 });
              cvTargets.set(`${node.id}:density`, { param: densityP, baseScale: 10 });
              cvTargets.set(`${node.id}:mix`, { param: mixP, baseScale: 0.65 });

              modParamTargets.set(`${node.id}:grainSize`, { param: grainSizeP, baseScale: 140 });
              modParamTargets.set(`${node.id}:density`, { param: densityP, baseScale: 10 });
              modParamTargets.set(`${node.id}:pitchShift`, { param: pitchP, baseScale: 12 });
              modParamTargets.set(`${node.id}:spray`, { param: sprayP, baseScale: 0.5 });
              modParamTargets.set(`${node.id}:feedback`, { param: fbP, baseScale: 0.35 });
              modParamTargets.set(`${node.id}:mix`, { param: mixP, baseScale: 0.65 });

              nodeControllers.set(node.id, { type: 'granularCloud', updateParams: applyGranular });
              usedGranularWorklet = true;
            } catch {
              usedGranularWorklet = false;
            }
          }

          if (!usedGranularWorklet) {
            const dry = track(ctx.createGain());
            const wet = track(ctx.createGain());
            const d1 = track(ctx.createDelay(0.5));
            d1.delayTime.value = 0.095;
            const d2 = track(ctx.createDelay(0.5));
            d2.delayTime.value = 0.165;
            inBus.connect(dry);
            dry.connect(outBus);
            inBus.connect(d1);
            d1.connect(d2);
            d2.connect(wet);
            wet.connect(outBus);

            const applyFallback = (p: Record<string, number | string | boolean>, t: number, immediate = false) => {
              const merged = { ...this.getLiveNodeParams(node.id, node.params), ...p };
              const mix = clampFinite(merged.mix, 0, 1, 0.55);
              setAudioParam(dry.gain, 1 - mix * 0.4, t, 0.02, immediate);
              setAudioParam(wet.gain, mix, t, 0.02, immediate);
            };
            applyFallback(node.params, now, true);
            audioInputs.set(`${node.id}:in`, inBus);
            audioOutputs.set(`${node.id}:out`, outBus);
            cvTargets.set(`${node.id}:mix`, { param: wet.gain, baseScale: 0.65 });
            modParamTargets.set(`${node.id}:mix`, { param: wet.gain, baseScale: 0.65 });
            nodeControllers.set(node.id, { type: 'granularCloud', updateParams: applyFallback });
          }
          break;
        }

        case 'envelope': {
          const vcaIn = track(ctx.createGain());
          vcaIn.gain.value = 0;
          const vcaAmpMod = track(ctx.createGain());
          vcaAmpMod.gain.value = 1;
          vcaIn.connect(vcaAmpMod);

          const cvConst = track(ctx.createConstantSource());
          cvConst.offset.value = 1;
          const cvOutGain = track(ctx.createGain());
          cvOutGain.gain.value = 0;
          cvConst.connect(cvOutGain);
          cvConst.start(now);
          stopCallbacks.push(() => cvConst.stop());

          const p = node.params;
          const attack = clampFinite(p.attack, 0.002, 14, 0.015);
          const decay = clampFinite(p.decay, 0.005, 14, 0.35);
          const sustain = clampFinite(p.sustain, 0, 1, 0.65);
          const release = clampFinite(p.release, 0.01, 18, 0.45);
          const isAmbientCurve = String(p.curve ?? 'standard') === 'ambient';
          const velSens = clampFinite(p.velocitySens, 0, 1, 0.7);
          const peak = Math.max(0.01, (1 - velSens) + velSens * velNorm);

          const computeAdsrAt = (elapsed: number): number => {
            if (elapsed <= 0) return 0.0001;
            if (elapsed < attack) {
              const frac = Math.min(1, elapsed / attack);
              const shaped = isAmbientCurve ? frac * frac * (3 - 2 * frac) : frac;
              return Math.max(0.0001, 0.0001 + (peak - 0.0001) * shaped);
            }
            const sustainLevel = Math.max(0.0001, peak * sustain);
            if (elapsed < attack + decay) {
              const frac = Math.min(1, (elapsed - attack) / decay);
              return Math.max(0.0001, peak * Math.pow(sustainLevel / peak, frac));
            }
            return sustainLevel;
          };

          const scheduleAdsr = (param: AudioParam) => {
            param.cancelScheduledValues(now);
            param.setValueAtTime(0.0001, now);
            if (isAmbientCurve && attack >= 0.08) {
              param.linearRampToValueAtTime(peak * 0.28, now + attack * 0.45);
              param.linearRampToValueAtTime(peak, now + attack);
            } else {
              param.linearRampToValueAtTime(peak, now + attack);
            }
            param.exponentialRampToValueAtTime(Math.max(0.0001, peak * sustain), now + attack + decay);
          };

          scheduleAdsr(vcaIn.gain);
          scheduleAdsr(cvOutGain.gain);

          releaseCallbacks.push((t) => {
            const liveParams = this.getLiveNodeParams(node.id, node.params);
            const relTime = clampFinite(liveParams.release, 0.01, 18, release);
            const safeT = Math.max(now, t);
            const fallbackVal = computeAdsrAt(safeT - now);
            [vcaIn.gain, cvOutGain.gain].forEach((param) => {
              const holdParam = param as AudioParam & { cancelAndHoldAtTime?: (time: number) => void };
              if (typeof holdParam.cancelAndHoldAtTime === 'function') {
                try {
                  holdParam.cancelAndHoldAtTime(safeT);
                } catch {
                  param.cancelScheduledValues(safeT);
                  param.setValueAtTime(fallbackVal, safeT);
                }
              } else {
                param.cancelScheduledValues(safeT);
                param.setValueAtTime(fallbackVal, safeT);
              }
              param.exponentialRampToValueAtTime(0.0001, safeT + relTime);
            });
            return relTime;
          });

          audioInputs.set(`${node.id}:in`, vcaIn);
          audioOutputs.set(`${node.id}:out`, vcaAmpMod);
          cvOutputs.set(`${node.id}:cv`, cvOutGain);
          cvTargets.set(`${node.id}:amp`, { param: vcaAmpMod.gain, baseScale: 0.65 });
          modParamTargets.set(`${node.id}:amp`, { param: vcaAmpMod.gain, baseScale: 0.65 });

          nodeControllers.set(node.id, {
            type: 'envelope',
            updateParams: () => undefined,
          });
          break;
        }

        case 'lfo': {
          const isWander = String(node.params.waveform ?? 'sine') === 'wander';
          const lfoOsc = track(ctx.createOscillator());
          const wanderOsc2 = isWander ? track(ctx.createOscillator()) : null;
          const wanderOsc3 = isWander ? track(ctx.createOscillator()) : null;
          const depthGain = track(ctx.createGain());
          const modScaleGain = track(ctx.createGain());

          if (isWander && wanderOsc2 && wanderOsc3) {
            const g1 = track(ctx.createGain());
            const g2 = track(ctx.createGain());
            const g3 = track(ctx.createGain());
            g1.gain.value = 0.5;
            g2.gain.value = 0.32;
            g3.gain.value = 0.22;
            lfoOsc.type = 'sine';
            wanderOsc2.type = 'sine';
            wanderOsc3.type = 'sine';
            lfoOsc.connect(g1);
            wanderOsc2.connect(g2);
            wanderOsc3.connect(g3);
            g1.connect(depthGain);
            g2.connect(depthGain);
            g3.connect(depthGain);
          } else {
            lfoOsc.connect(depthGain);
          }
          depthGain.connect(modScaleGain);

          const applyLfo = (p: Record<string, number | string | boolean>, t: number, immediate = false) => {
            const merged = { ...this.getLiveNodeParams(node.id, node.params), ...p };
            const rate = clampFinite(merged.rate, 0.015, 40, 5.2);
            if (!isWander) {
              lfoOsc.type = safeOscType(merged.waveform, 'sine');
            }
            setAudioParam(lfoOsc.frequency, rate, t, 0.015, immediate);
            if (wanderOsc2 && wanderOsc3) {
              setAudioParam(wanderOsc2.frequency, rate * 1.4142, t, 0.015, immediate);
              setAudioParam(wanderOsc3.frequency, rate * 0.618, t, 0.015, immediate);
            }
            const depth = clampFinite(merged.depth, 0, 1.5, 0.35);
            const effectiveDepth = depth * (1 + this.modWheel * 1.4);
            setAudioParam(modScaleGain.gain, effectiveDepth, t, 0.02, immediate);
          };

          const onsetDelay = clampFinite(node.params.delay, 0, 8, 0.18);
          depthGain.gain.setValueAtTime(0.0001, now);
          if (onsetDelay > 0.01) {
            depthGain.gain.setValueAtTime(0.0001, now + onsetDelay * 0.35);
            depthGain.gain.linearRampToValueAtTime(1, now + onsetDelay);
          } else {
            depthGain.gain.setValueAtTime(1, now);
          }

          applyLfo(node.params, now, true);
          lfoOsc.start(now);
          wanderOsc2?.start(now);
          wanderOsc3?.start(now);
          stopCallbacks.push(() => {
            lfoOsc.stop();
            wanderOsc2?.stop();
            wanderOsc3?.stop();
          });

          cvOutputs.set(`${node.id}:cv`, modScaleGain);
          modParamTargets.set(`${node.id}:rate`, { param: lfoOsc.frequency, baseScale: 6 });
          modParamTargets.set(`${node.id}:depth`, { param: modScaleGain.gain, baseScale: 0.6 });

          nodeControllers.set(node.id, {
            type: 'lfo',
            updateParams: applyLfo,
            setModWheel: (_mw, t) => applyLfo({}, t),
          });
          break;
        }
      }
    }

    // Pass 2: Wire connections inside voice & into Master FX Bus (through persistent buses)
    const nodeTypeById = new Map<string, ModuleType>();
    for (const n of this.patch.nodes) {
      nodeTypeById.set(n.id, n.type);
    }
    const hasDirectFxLink = (conn: SynthConnection): boolean => {
      const t = nodeTypeById.get(conn.toNode);
      return t === 'delay' || t === 'reverb' || t === 'output';
    };

    const firstFxId = this.masterFxChain[0]?.id;

    for (const conn of this.patch.connections) {
      const srcAudio = audioOutputs.get(`${conn.fromNode}:${conn.fromPort}`);
      const srcCv = cvOutputs.get(`${conn.fromNode}:${conn.fromPort}`);

      if (srcAudio) {
        if (hasDirectFxLink(conn)) {
          const targetBus =
            !firstFxId || conn.toNode === firstFxId
              ? this.masterInputBus
              : this.getOrCreateFxInputBus(conn.toNode);
          const sendGain = track(ctx.createGain());
          sendGain.gain.value = clampFinite(conn.amount, 0, 2, 1);
          srcAudio.connect(sendGain);
          sendGain.connect(targetBus);
          outputSendGains.push(sendGain);
        } else {
          const targetIn = audioInputs.get(`${conn.toNode}:${conn.toPort}`);
          if (targetIn) {
            const linkGain = track(ctx.createGain());
            linkGain.gain.value = clampFinite(conn.amount, 0, 2, 1);
            srcAudio.connect(linkGain);
            linkGain.connect(targetIn);
          }
        }
      } else if (srcCv) {
        const targetCv = cvTargets.get(`${conn.toNode}:${conn.toPort}`);
        if (targetCv) {
          const amtGain = track(ctx.createGain());
          amtGain.gain.value = clampFinite(conn.amount, -1.5, 1.5, 0.25) * targetCv.baseScale;
          srcCv.connect(amtGain);
          amtGain.connect(targetCv.param);
        }
      }
    }

    // Pass 3: Wire Modulation Matrix slots per voice
    if (this.patch.modMatrix && this.patch.modMatrix.length > 0) {
      let matrixConst: ConstantSourceNode | null = null;
      const getMatrixConst = () => {
        if (!matrixConst) {
          matrixConst = track(ctx.createConstantSource());
          matrixConst.offset.value = 1;
          matrixConst.start(now);
          stopCallbacks.push(() => matrixConst?.stop());
        }
        return matrixConst;
      };

      let matrixNoiseOut: AudioNode | null = null;
      const getMatrixNoise = () => {
        if (!matrixNoiseOut) {
          const src = track(ctx.createBufferSource());
          src.buffer = this.noiseBufferPink;
          src.loop = true;
          const lp = track(ctx.createBiquadFilter());
          lp.type = 'lowpass';
          lp.frequency.value = 45;
          src.connect(lp);
          src.start(now);
          stopCallbacks.push(() => src.stop());
          matrixNoiseOut = lp;
        }
        return matrixNoiseOut;
      };

      const getStaticSourceVal = (srcName: string): number | null => {
        switch (srcName) {
          case 'velocity':
            return velNorm;
          case 'keyTrack':
            return Math.max(-1, Math.min(1, (midi - 60) / 36));
          case 'modWheel':
            return this.modWheel;
          case 'macroX':
            return this.macroX;
          case 'macroY':
            return this.macroY;
          case 'random':
            return voiceRandom;
          default:
            return null;
        }
      };

      for (const slot of this.patch.modMatrix) {
        const target = modParamTargets.get(`${slot.targetNodeId}:${slot.targetParam}`);
        if (!target) continue;

        const srcCvNode =
          slot.source === 'noise'
            ? getMatrixNoise()
            : cvOutputs.get(`${slot.source}:cv`) ?? null;
        const staticVal = srcCvNode ? null : getStaticSourceVal(slot.source);

        if (!srcCvNode && staticVal === null) continue;

        const viaCvNode =
          slot.via && slot.via !== 'none' ? cvOutputs.get(`${slot.via}:cv`) ?? null : null;

        const slotGain = track(ctx.createGain());
        const viaGain = track(ctx.createGain());

        if (srcCvNode) {
          srcCvNode.connect(viaGain);
        } else {
          getMatrixConst().connect(viaGain);
        }

        if (viaCvNode) {
          viaGain.gain.value = 0;
          viaCvNode.connect(viaGain.gain);
        }

        viaGain.connect(slotGain);
        slotGain.connect(target.param);

        const applySlot = (curSlot: ModMatrixSlot, t: number, immediate = false) => {
          if (!curSlot.enabled) {
            setAudioParam(slotGain.gain, 0, t, 0.01, immediate);
            return;
          }
          const viaStatic =
            curSlot.via && curSlot.via !== 'none' && !viaCvNode
              ? getStaticSourceVal(curSlot.via) ?? 1
              : 1;

          if (!viaCvNode) {
            setAudioParam(viaGain.gain, viaStatic, t, 0.01, immediate);
          }

          if (srcCvNode) {
            const curvedDepth = applyModCurve(curSlot.amount, curSlot.curve);
            setAudioParam(slotGain.gain, curvedDepth * target.baseScale, t, 0.01, immediate);
          } else if (staticVal !== null) {
            const curvedSrc = applyModCurve(staticVal, curSlot.curve);
            setAudioParam(
              slotGain.gain,
              curvedSrc * curSlot.amount * target.baseScale,
              t,
              0.01,
              immediate
            );
          }
        };

        applySlot(slot, now, true);
        modSlotUpdaters.set(slot.id, (curSlot, t) => applySlot(curSlot, t, false));
      }
    }

    return {
      id: voiceId,
      midi,
      velocity: velNorm,
      startedAt: now,
      released: false,
      sustained: false,
      cleanupNodes,
      outputSendGains,
      stopCallbacks,
      releaseCallbacks,
      nodeControllers,
      modSlotUpdaters,
    };
    } catch {
      for (const stop of stopCallbacks) {
        try {
          stop();
        } catch {
          // ignore
        }
      }
      for (const n of cleanupNodes) {
        try {
          n.disconnect();
        } catch {
          // ignore
        }
      }
      return null;
    }
  }

  private prepareNoiseBuffers(): void {
    if (!this.ctx) return;
    const length = this.ctx.sampleRate * 2;
    const white = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const pink = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const wData = white.getChannelData(0);
    const pData = pink.getChannelData(0);

    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const wn = Math.random() * 2 - 1;
      wData[i] = wn;
      b0 = 0.99886 * b0 + wn * 0.0555179;
      b1 = 0.99332 * b1 + wn * 0.0750759;
      b2 = 0.96900 * b2 + wn * 0.1538520;
      b3 = 0.86650 * b3 + wn * 0.3104856;
      b4 = 0.55000 * b4 + wn * 0.5329522;
      b5 = -0.7616 * b5 - wn * 0.0168980;
      pData[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + wn * 0.5362) * 0.11;
      b6 = wn * 0.115926;
    }
    this.noiseBufferWhite = white;
    this.noiseBufferPink = pink;
  }

  private preparePeriodicWaves(): void {
    if (!this.ctx) return;
    const organReal = new Float32Array(16);
    const organImag = new Float32Array(16);
    [1, 0.8, 0.65, 0.5, 0.1, 0.35, 0.05, 0.28, 0, 0, 0, 0.14].forEach((v, i) => {
      organImag[i + 1] = v;
    });
    this.periodicWaves.set('organ', this.ctx.createPeriodicWave(organReal, organImag));

    const reedReal = new Float32Array(24);
    const reedImag = new Float32Array(24);
    for (let k = 1; k < 24; k++) {
      reedImag[k] = (k % 2 === 1 ? 1.0 : 0.45) / Math.pow(k, 0.82);
    }
    this.periodicWaves.set('reed', this.ctx.createPeriodicWave(reedReal, reedImag));

    const strReal = new Float32Array(20);
    const strImag = new Float32Array(20);
    for (let k = 1; k < 20; k++) {
      strImag[k] = 1 / Math.pow(k, 1.08);
    }
    this.periodicWaves.set('strings', this.ctx.createPeriodicWave(strReal, strImag));

    const glassReal = new Float32Array(24);
    const glassImag = new Float32Array(24);
    [1, 0, 0.52, 0, 0.28, 0.14, 0, 0.18, 0, 0, 0.09, 0, 0.06].forEach((v, i) => {
      glassImag[i + 1] = v;
    });
    this.periodicWaves.set('glass', this.ctx.createPeriodicWave(glassReal, glassImag));

    const choirReal = new Float32Array(24);
    const choirImag = new Float32Array(24);
    [1, 0.65, 0.85, 0.35, 0.55, 0.18, 0.42, 0.12, 0.22, 0.08].forEach((v, i) => {
      choirImag[i + 1] = v;
    });
    this.periodicWaves.set('choir', this.ctx.createPeriodicWave(choirReal, choirImag));

    const hollowReal = new Float32Array(16);
    const hollowImag = new Float32Array(16);
    [1, 0.05, 0.72, 0.02, 0.4, 0, 0.22, 0, 0.12].forEach((v, i) => {
      hollowImag[i + 1] = v;
    });
    this.periodicWaves.set('hollow', this.ctx.createPeriodicWave(hollowReal, hollowImag));
  }

  private getCombLoopCurve(): Float32Array<ArrayBuffer> {
    if (this.combLoopCurve) return this.combLoopCurve;
    const samples = 512;
    const curve = new Float32Array(new ArrayBuffer(samples * 4));
    for (let i = 0; i < samples; i++) {
      const x = ((i * 2) / (samples - 1) - 1) * 1.4;
      // Divide by 1.4 so small-signal slope at 0 is exact unit gain (1.0) instead of 1.4x amplification
      curve[i] = Math.tanh(x) / 1.4;
    }
    this.combLoopCurve = curve;
    return curve;
  }

  private getMasterSafetyCurve(): Float32Array<ArrayBuffer> {
    const samples = 1024;
    const curve = new Float32Array(new ArrayBuffer(samples * 4));
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / (samples - 1) - 1;
      const abs = Math.abs(x);
      curve[i] =
        abs <= 0.78
          ? x
          : Math.sign(x) * (0.78 + 0.2 * Math.tanh((abs - 0.78) / 0.2));
    }
    return curve;
  }

  private getShaperCurve(drive: number, asymmetry: number): Float32Array<ArrayBuffer> {
    const key = `${drive.toFixed(2)}_${asymmetry.toFixed(2)}`;
    const existing = this.shaperCurves.get(key);
    if (existing) return existing;

    const samples = 512;
    const curve = new Float32Array(new ArrayBuffer(samples * 4));
    const k = 1 + drive * 18;
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1 + asymmetry * 0.35;
      curve[i] = Math.tanh(x * k) / Math.tanh(k);
    }
    if (this.shaperCurves.size > 48) {
      const firstKey = this.shaperCurves.keys().next().value;
      if (firstKey !== undefined) this.shaperCurves.delete(firstKey);
    }
    this.shaperCurves.set(key, curve);
    return curve;
  }

  private getOrCreateImpulse(durationSec: number, damping: number): AudioBuffer {
    const key = `${durationSec.toFixed(1)}_${damping.toFixed(2)}`;
    const cached = this.reverbIrCache.get(key);
    if (cached) return cached;

    const ctx = this.ctx!;
    const len = Math.max(128, Math.floor(ctx.sampleRate * durationSec));
    const buffer = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const decay = Math.pow(1 - i / len, 1.85 + damping * 2.1);
        const white = Math.random() * 2 - 1;
        lp = lp + (1 - damping * 0.72) * (white - lp);
        data[i] = lp * decay * 0.42;
      }
    }
    if (this.reverbIrCache.size >= 24) {
      const oldestKey = this.reverbIrCache.keys().next().value;
      if (oldestKey !== undefined) this.reverbIrCache.delete(oldestKey);
    }
    this.reverbIrCache.set(key, buffer);
    return buffer;
  }

  public static async renderPatchOffline(
    patch: SynthPatch,
    midi: number,
    holdSec: number,
    totalSec: number,
    velocity = 100,
    sampleRate = 44100
  ): Promise<AudioBuffer> {
    const lengthSamples = Math.max(1024, Math.ceil(totalSec * sampleRate));
    const OfflineCtx =
      window.OfflineAudioContext ||
      (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
        .webkitOfflineAudioContext;
    const offline = new OfflineCtx(2, lengthSamples, sampleRate);
    const engine = new SynthEngine();
    const offlineAsAudio = offline as unknown as AudioContext;
    engine.ctx = offlineAsAudio;
    engine.patch = patch;

    if (offline.audioWorklet) {
      await engine.registerKarplusWorklet(offlineAsAudio).catch(() => undefined);
    }
    engine.buildMasterChain(offlineAsAudio);

    const velNorm = clampFinite(velocity / 127, 0.02, 1, 0.78);
    const voice = engine.buildVoiceGraph('offline_preview', midi, velNorm, 0);
    if (voice) {
      const releaseAt = Math.max(0.02, Math.min(totalSec - 0.04, holdSec));
      for (const rel of voice.releaseCallbacks) {
        rel(releaseAt);
      }
    }

    const rendered = await offline.startRendering();
    for (const fx of engine.masterFxChain) {
      fx.dispose();
    }
    engine.masterFxChain = [];
    if (voice) {
      engine.cleanupVoiceNodes(voice);
    }
    engine.ctx = null;
    return rendered;
  }

  public dispose(): void {
    if (this.latencyPollTimer !== null) {
      clearInterval(this.latencyPollTimer);
      this.latencyPollTimer = null;
    }
    for (const tid of this.pendingCleanupTimers) {
      clearTimeout(tid);
    }
    this.pendingCleanupTimers.clear();
    this.allNotesOff();
    for (const fx of this.masterFxChain) {
      fx.dispose();
    }
    this.masterFxChain = [];
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
