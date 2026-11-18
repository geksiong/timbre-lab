export const CROSSFADE_CURVE_INDEX: Record<string, number> = {
  equalPower: 0,
  linear: 1,
  blendSum: 2,
};

export const RINGMOD_MODE_INDEX: Record<string, number> = {
  ring: 0,
  am: 1,
  rectified: 2,
};

export const PROCESSOR_WORKLET_CODE = `
class CrossfaderProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'balance', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
      { name: 'curve', defaultValue: 0, minValue: 0, maxValue: 2, automationRate: 'k-rate' },
      { name: 'gainA', defaultValue: 1, minValue: 0, maxValue: 1.5, automationRate: 'k-rate' },
      { name: 'gainB', defaultValue: 1, minValue: 0, maxValue: 1.5, automationRate: 'k-rate' },
      { name: 'outputGain', defaultValue: 1, minValue: 0, maxValue: 1.5, automationRate: 'k-rate' }
    ];
  }

  constructor() {
    super();
    this.stopped = false;
    this.port.onmessage = (e) => {
      if (e.data === 'stop') this.stopped = true;
    };
  }

  clamp(v, min, max, fb) {
    if (!Number.isFinite(v)) return fb;
    return v < min ? min : v > max ? max : v;
  }

  process(inputs, outputs, parameters) {
    if (this.stopped) return false;
    const out = outputs[0];
    if (!out || !out[0]) return true;
    const inA = inputs[0];
    const inB = inputs[1];

    const balArr = parameters.balance;
    const curve = Math.round(this.clamp(parameters.curve[0], 0, 2, 0));
    const gainA = this.clamp(parameters.gainA[0], 0, 1.5, 1);
    const gainB = this.clamp(parameters.gainB[0], 0, 1.5, 1);
    const outGain = this.clamp(parameters.outputGain[0], 0, 1.5, 1);

    for (let ch = 0; ch < out.length; ch++) {
      const outCh = out[ch];
      const aCh = inA && inA[ch] ? inA[ch] : (inA && inA[0] ? inA[0] : null);
      const bCh = inB && inB[ch] ? inB[ch] : (inB && inB[0] ? inB[0] : null);

      for (let i = 0; i < outCh.length; i++) {
        const bal = this.clamp(balArr.length > 1 ? balArr[i] : balArr[0], 0, 1, 0.5);
        const a = aCh && Number.isFinite(aCh[i]) ? aCh[i] * gainA : 0;
        const b = bCh && Number.isFinite(bCh[i]) ? bCh[i] * gainB : 0;

        let wA = 1;
        let wB = 0;
        if (curve === 0) {
          const theta = bal * 1.57079632679;
          wA = Math.cos(theta);
          wB = Math.sin(theta);
        } else if (curve === 1) {
          wA = 1 - bal;
          wB = bal;
        } else {
          // blendSum: keeps both full at center (0.5)
          wA = Math.min(1, (1 - bal) * 2);
          wB = Math.min(1, bal * 2);
        }
        outCh[i] = this.clamp((a * wA + b * wB) * outGain, -1.6, 1.6, 0);
      }
    }
    return true;
  }
}

class WavefolderProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'folds', defaultValue: 2.4, minValue: 1, maxValue: 8, automationRate: 'a-rate' },
      { name: 'symmetry', defaultValue: 0, minValue: -0.65, maxValue: 0.65, automationRate: 'a-rate' },
      { name: 'stages', defaultValue: 2, minValue: 1, maxValue: 4, automationRate: 'k-rate' },
      { name: 'postTone', defaultValue: 7200, minValue: 400, maxValue: 16000, automationRate: 'k-rate' },
      { name: 'mix', defaultValue: 0.85, minValue: 0, maxValue: 1, automationRate: 'k-rate' }
    ];
  }

  constructor() {
    super();
    this.prevIn = [0, 0];
    this.dcIn = [0, 0];
    this.dcOut = [0, 0];
    this.lp = [0, 0];
    this.stopped = false;
    this.port.onmessage = (e) => {
      if (e.data === 'stop') this.stopped = true;
    };
  }

  clamp(v, min, max, fb) {
    if (!Number.isFinite(v)) return fb;
    return v < min ? min : v > max ? max : v;
  }

  foldSample(x, drive, sym, stages) {
    let v = (x + sym) * drive;
    for (let s = 0; s < stages; s++) {
      v = Math.sin(v * 1.57079632679);
    }
    return Math.tanh(v * 1.15);
  }

  process(inputs, outputs, parameters) {
    if (this.stopped) return false;
    const inp = inputs[0];
    const out = outputs[0];
    if (!out || !out[0]) return true;

    const foldsArr = parameters.folds;
    const symArr = parameters.symmetry;
    const stages = Math.round(this.clamp(parameters.stages[0], 1, 4, 2));
    const postTone = this.clamp(parameters.postTone[0], 400, Math.min(16000, sampleRate * 0.42), 7200);
    const mix = this.clamp(parameters.mix[0], 0, 1, 0.85);

    const lpAlpha = Math.min(0.98, 1 - Math.exp((-6.2831853 * postTone) / sampleRate));

    for (let ch = 0; ch < out.length; ch++) {
      const outCh = out[ch];
      const inCh = inp && inp[ch] ? inp[ch] : (inp && inp[0] ? inp[0] : null);
      let pIn = this.prevIn[ch] || 0;
      let dcI = this.dcIn[ch] || 0;
      let dcO = this.dcOut[ch] || 0;
      let lpS = this.lp[ch] || 0;

      for (let i = 0; i < outCh.length; i++) {
        const x = inCh && Number.isFinite(inCh[i]) ? inCh[i] : 0;
        const drive = this.clamp(foldsArr.length > 1 ? foldsArr[i] : foldsArr[0], 1, 8, 2.4);
        const sym = this.clamp(symArr.length > 1 ? symArr[i] : symArr[0], -0.65, 0.65, 0);

        // 2x oversampled folding to reduce aliasing
        const mid = 0.5 * (pIn + x);
        pIn = x;
        const f1 = this.foldSample(mid, drive, sym, stages);
        const f2 = this.foldSample(x, drive, sym, stages);
        const folded = 0.5 * (f1 + f2);

        const dc = folded - dcI + 0.995 * dcO;
        dcI = folded;
        dcO = Number.isFinite(dc) ? dc : 0;
        lpS += lpAlpha * (dcO - lpS);

        outCh[i] = this.clamp(x * (1 - mix) + lpS * mix * 0.9, -1.4, 1.4, 0);
      }

      this.prevIn[ch] = pIn;
      this.dcIn[ch] = dcI;
      this.dcOut[ch] = dcO;
      this.lp[ch] = lpS;
    }
    return true;
  }
}

class RingModProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'mode', defaultValue: 0, minValue: 0, maxValue: 2, automationRate: 'k-rate' },
      { name: 'drive', defaultValue: 1.0, minValue: 0.3, maxValue: 3.0, automationRate: 'k-rate' },
      { name: 'mix', defaultValue: 0.75, minValue: 0, maxValue: 1, automationRate: 'a-rate' }
    ];
  }

  constructor() {
    super();
    this.stopped = false;
    this.port.onmessage = (e) => {
      if (e.data === 'stop') this.stopped = true;
    };
  }

  clamp(v, min, max, fb) {
    if (!Number.isFinite(v)) return fb;
    return v < min ? min : v > max ? max : v;
  }

  process(inputs, outputs, parameters) {
    if (this.stopped) return false;
    const car = inputs[0];
    const mod = inputs[1];
    const out = outputs[0];
    if (!out || !out[0]) return true;

    const mode = Math.round(this.clamp(parameters.mode[0], 0, 2, 0));
    const drive = this.clamp(parameters.drive[0], 0.3, 3.0, 1.0);
    const mixArr = parameters.mix;

    for (let ch = 0; ch < out.length; ch++) {
      const outCh = out[ch];
      const cCh = car && car[ch] ? car[ch] : (car && car[0] ? car[0] : null);
      const mCh = mod && mod[ch] ? mod[ch] : (mod && mod[0] ? mod[0] : null);

      for (let i = 0; i < outCh.length; i++) {
        const c = cCh && Number.isFinite(cCh[i]) ? cCh[i] : 0;
        const m = mCh && Number.isFinite(mCh[i]) ? mCh[i] * drive : 0;
        const mix = this.clamp(mixArr.length > 1 ? mixArr[i] : mixArr[0], 0, 1, 0.75);

        let wet = 0;
        if (mode === 0) {
          wet = c * m;
        } else if (mode === 1) {
          wet = c * (0.5 + 0.5 * Math.tanh(m));
        } else {
          wet = c * (m > 0 ? m : 0);
        }
        outCh[i] = this.clamp(c * (1 - mix) + Math.tanh(wet) * mix, -1.4, 1.4, 0);
      }
    }
    return true;
  }
}

class FormantFilterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'vowel', defaultValue: 0, minValue: 0, maxValue: 4, automationRate: 'a-rate' },
      { name: 'shift', defaultValue: 0, minValue: -12, maxValue: 12, automationRate: 'a-rate' },
      { name: 'resonance', defaultValue: 7.5, minValue: 1.5, maxValue: 24, automationRate: 'k-rate' },
      { name: 'spread', defaultValue: 1.0, minValue: 0.5, maxValue: 1.6, automationRate: 'k-rate' },
      { name: 'mix', defaultValue: 0.9, minValue: 0, maxValue: 1, automationRate: 'k-rate' }
    ];
  }

  constructor() {
    super();
    this.vowels = [
      [730, 1090, 2440, 1.0, 0.58, 0.25],
      [530, 1840, 2480, 1.0, 0.62, 0.30],
      [270, 2290, 3010, 1.0, 0.52, 0.28],
      [570, 840, 2410, 1.0, 0.52, 0.22],
      [300, 870, 2240, 1.0, 0.42, 0.18]
    ];
    // 2 channels x 3 formant bands (lp, bp state for Chamberlin SVF)
    this.bp = [new Float32Array(3), new Float32Array(3)];
    this.lp = [new Float32Array(3), new Float32Array(3)];
    this.stopped = false;
    this.port.onmessage = (e) => {
      if (e.data === 'stop') this.stopped = true;
    };
  }

  clamp(v, min, max, fb) {
    if (!Number.isFinite(v)) return fb;
    return v < min ? min : v > max ? max : v;
  }

  process(inputs, outputs, parameters) {
    if (this.stopped) return false;
    const inp = inputs[0];
    const out = outputs[0];
    if (!out || !out[0]) return true;

    const vArr = parameters.vowel;
    const sArr = parameters.shift;
    const q = this.clamp(parameters.resonance[0], 1.5, 24, 7.5);
    const spread = this.clamp(parameters.spread[0], 0.5, 1.6, 1.0);
    const mix = this.clamp(parameters.mix[0], 0, 1, 0.9);
    const damp = 1 / q;
    const maxHz = sampleRate * 0.36;

    for (let ch = 0; ch < out.length; ch++) {
      const outCh = out[ch];
      const inCh = inp && inp[ch] ? inp[ch] : (inp && inp[0] ? inp[0] : null);
      const bpState = this.bp[ch] || this.bp[0];
      const lpState = this.lp[ch] || this.lp[0];

      for (let i = 0; i < outCh.length; i++) {
        const x = inCh && Number.isFinite(inCh[i]) ? inCh[i] : 0;
        const vPos = this.clamp(vArr.length > 1 ? vArr[i] : vArr[0], 0, 4, 0);
        const shiftSt = this.clamp(sArr.length > 1 ? sArr[i] : sArr[0], -12, 12, 0);
        const shiftMul = Math.pow(2, shiftSt / 12);

        const idx0 = Math.min(3, Math.floor(vPos));
        const idx1 = Math.min(4, idx0 + 1);
        const frac = vPos - idx0;
        const row0 = this.vowels[idx0];
        const row1 = this.vowels[idx1];

        let wet = 0;
        for (let b = 0; b < 3; b++) {
          const spMul = b === 0 ? 1.0 : b === 1 ? spread : 0.5 + spread * 0.5;
          const freq = this.clamp((row0[b] * (1 - frac) + row1[b] * frac) * shiftMul * spMul, 80, maxHz, 600);
          const gain = row0[b + 3] * (1 - frac) + row1[b + 3] * frac;
          const fCoeff = Math.min(0.85, 2 * Math.sin((3.14159265 * freq) / sampleRate));

          // 2x oversampled Chamberlin SVF step for stability at high Q
          let bpS = bpState[b];
          let lpS = lpState[b];
          for (let sub = 0; sub < 2; sub++) {
            const hp = x - lpS - damp * bpS;
            bpS += fCoeff * 0.5 * hp;
            lpS += fCoeff * 0.5 * bpS;
          }
          if (!Number.isFinite(bpS) || !Number.isFinite(lpS)) {
            bpS = 0;
            lpS = 0;
          }
          bpState[b] = bpS;
          lpState[b] = lpS;
          wet += bpS * gain;
        }

        const normWet = Math.tanh(wet * (0.45 + 1.8 / Math.sqrt(q)));
        outCh[i] = this.clamp(x * (1 - mix) + normWet * mix, -1.4, 1.4, 0);
      }
    }
    return true;
  }
}

class BitcrusherProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'bits', defaultValue: 8, minValue: 2, maxValue: 16, automationRate: 'a-rate' },
      { name: 'downsample', defaultValue: 4, minValue: 1, maxValue: 32, automationRate: 'a-rate' },
      { name: 'dither', defaultValue: 0.12, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'postTone', defaultValue: 9500, minValue: 400, maxValue: 16000, automationRate: 'k-rate' },
      { name: 'mix', defaultValue: 0.8, minValue: 0, maxValue: 1, automationRate: 'k-rate' }
    ];
  }

  constructor() {
    super();
    this.hold = [0, 0];
    this.counter = [0, 0];
    this.lp = [0, 0];
    this.seed = 6131;
    this.stopped = false;
    this.port.onmessage = (e) => {
      if (e.data === 'stop') this.stopped = true;
    };
  }

  rand() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return (this.seed / 4294967296) * 2 - 1;
  }

  clamp(v, min, max, fb) {
    if (!Number.isFinite(v)) return fb;
    return v < min ? min : v > max ? max : v;
  }

  process(inputs, outputs, parameters) {
    if (this.stopped) return false;
    const inp = inputs[0];
    const out = outputs[0];
    if (!out || !out[0]) return true;

    const bitsArr = parameters.bits;
    const dsArr = parameters.downsample;
    const dither = this.clamp(parameters.dither[0], 0, 1, 0.12);
    const tone = this.clamp(parameters.postTone[0], 400, Math.min(16000, sampleRate * 0.42), 9500);
    const mix = this.clamp(parameters.mix[0], 0, 1, 0.8);
    const lpAlpha = Math.min(0.98, 1 - Math.exp((-6.2831853 * tone) / sampleRate));

    for (let ch = 0; ch < out.length; ch++) {
      const outCh = out[ch];
      const inCh = inp && inp[ch] ? inp[ch] : (inp && inp[0] ? inp[0] : null);
      let held = this.hold[ch] || 0;
      let cnt = this.counter[ch] || 0;
      let lpS = this.lp[ch] || 0;

      for (let i = 0; i < outCh.length; i++) {
        const x = inCh && Number.isFinite(inCh[i]) ? inCh[i] : 0;
        const bits = this.clamp(bitsArr.length > 1 ? bitsArr[i] : bitsArr[0], 2, 16, 8);
        const ds = Math.round(this.clamp(dsArr.length > 1 ? dsArr[i] : dsArr[0], 1, 32, 4));

        cnt++;
        if (cnt >= ds) {
          cnt = 0;
          const levels = Math.pow(2, bits - 1);
          const dith = (this.rand() * dither) / levels;
          held = Math.round((x + dith) * levels) / levels;
        }
        lpS += lpAlpha * (held - lpS);
        outCh[i] = this.clamp(x * (1 - mix) + lpS * mix, -1.4, 1.4, 0);
      }

      this.hold[ch] = held;
      this.counter[ch] = cnt;
      this.lp[ch] = lpS;
    }
    return true;
  }
}

registerProcessor('timbre-crossfader-processor', CrossfaderProcessor);
registerProcessor('timbre-wavefolder-processor', WavefolderProcessor);
registerProcessor('timbre-ringmod-processor', RingModProcessor);
registerProcessor('timbre-formant-processor', FormantFilterProcessor);
registerProcessor('timbre-bitcrusher-processor', BitcrusherProcessor);
`;
