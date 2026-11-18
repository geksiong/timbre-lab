export const QUANTIZER_SCALE_INDEX: Record<string, number> = {
  chromatic: 0,
  major: 1,
  minor: 2,
  pentatonicMinor: 3,
  pentatonicMajor: 4,
  dorian: 5,
  phrygianDom: 6,
  wholeTone: 7,
  fifths: 8,
};

export const CV_RECTIFY_INDEX: Record<string, number> = {
  none: 0,
  half: 1,
  full: 2,
  clamp01: 3,
};

export const PHASER_MODE_INDEX: Record<string, number> = {
  phaser: 0,
  flanger: 1,
};

export const UTILITY_FX_WORKLET_CODE = `
class QuantizerProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'scale', defaultValue: 3, minValue: 0, maxValue: 8, automationRate: 'k-rate' },
      { name: 'root', defaultValue: 0, minValue: 0, maxValue: 11, automationRate: 'k-rate' },
      { name: 'octaves', defaultValue: 1.0, minValue: 0.25, maxValue: 3.0, automationRate: 'k-rate' },
      { name: 'transpose', defaultValue: 0, minValue: -24, maxValue: 24, automationRate: 'k-rate' },
      { name: 'glideMs', defaultValue: 0, minValue: 0, maxValue: 200, automationRate: 'k-rate' }
    ];
  }
  constructor() {
    super();
    this.scales = [
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      [0, 2, 4, 5, 7, 9, 11],
      [0, 2, 3, 5, 7, 8, 10],
      [0, 3, 5, 7, 10],
      [0, 2, 4, 7, 9],
      [0, 2, 3, 5, 7, 9, 10],
      [0, 1, 4, 5, 7, 8, 10],
      [0, 2, 4, 6, 8, 10],
      [0, 7]
    ];
    this.slewed = 0;
    this.stopped = false;
    this.port.onmessage = (e) => {
      if (e.data === 'stop') this.stopped = true;
    };
  }
  process(inputs, outputs, parameters) {
    if (this.stopped) return false;
    const output = outputs[0];
    if (!output || !output[0]) return true;
    const out = output[0];
    const inCh = inputs[0] && inputs[0][0] ? inputs[0][0] : null;

    const scaleIdx = Math.max(0, Math.min(this.scales.length - 1, Math.round(parameters.scale[0] ?? 3)));
    const scaleNotes = this.scales[scaleIdx];
    const root = Math.round(parameters.root[0] || 0);
    const octaves = Math.max(0.25, Math.min(3.0, parameters.octaves[0] ?? 1.0));
    const transpose = Math.round(parameters.transpose[0] || 0);
    const glideMs = Math.max(0, Math.min(200, parameters.glideMs[0] || 0));

    const glideSec = glideMs * 0.001;
    const glideCoeff = glideSec <= 0.0005 ? 1.0 : 1 - Math.exp(-1 / (glideSec * sampleRate));

    for (let i = 0; i < out.length; i++) {
      const raw = inCh && Number.isFinite(inCh[i]) ? inCh[i] : 0;
      const semi = raw * octaves * 12;
      const octBase = Math.floor(semi / 12);
      const rem = ((semi % 12) + 12) % 12;

      let bestSemi = octBase * 12 + scaleNotes[0];
      let bestDist = 999;
      for (let o = -1; o <= 1; o++) {
        for (let d = 0; d < scaleNotes.length; d++) {
          const cand = (octBase + o) * 12 + scaleNotes[d];
          const dist = Math.abs(semi - cand);
          if (dist < bestDist) {
            bestDist = dist;
            bestSemi = cand;
          }
        }
      }

      const targetCv = (bestSemi + root + transpose) / 12;
      this.slewed += glideCoeff * (targetCv - this.slewed);
      out[i] = Number.isFinite(this.slewed) ? this.slewed : 0;
    }
    return true;
  }
}

class CvUtilityProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'gainA', defaultValue: 1.0, minValue: -2.0, maxValue: 2.0, automationRate: 'k-rate' },
      { name: 'gainB', defaultValue: 0.5, minValue: -2.0, maxValue: 2.0, automationRate: 'k-rate' },
      { name: 'offset', defaultValue: 0.0, minValue: -1.5, maxValue: 1.5, automationRate: 'k-rate' },
      { name: 'rectify', defaultValue: 0, minValue: 0, maxValue: 3, automationRate: 'k-rate' },
      { name: 'slewMs', defaultValue: 0, minValue: 0, maxValue: 250, automationRate: 'k-rate' }
    ];
  }
  constructor() {
    super();
    this.slewed = 0;
    this.stopped = false;
    this.port.onmessage = (e) => {
      if (e.data === 'stop') this.stopped = true;
    };
  }
  process(inputs, outputs, parameters) {
    if (this.stopped) return false;
    const output = outputs[0];
    if (!output || !output[0]) return true;
    const out = output[0];
    const inA = inputs[0] && inputs[0][0] ? inputs[0][0] : null;
    const inB = inputs[1] && inputs[1][0] ? inputs[1][0] : null;

    const gainA = parameters.gainA[0] ?? 1.0;
    const gainB = parameters.gainB[0] ?? 0.5;
    const offset = parameters.offset[0] ?? 0.0;
    const rectMode = Math.round(parameters.rectify[0] || 0);
    const slewMs = Math.max(0, Math.min(250, parameters.slewMs[0] || 0));

    const slewSec = slewMs * 0.001;
    const slewCoeff = slewSec <= 0.0005 ? 1.0 : 1 - Math.exp(-1 / (slewSec * sampleRate));

    for (let i = 0; i < out.length; i++) {
      const a = inA && Number.isFinite(inA[i]) ? inA[i] : 0;
      const b = inB && Number.isFinite(inB[i]) ? inB[i] : 0;
      let val = a * gainA + b * gainB + offset;
      if (rectMode === 1) {
        val = val > 0 ? val : 0;
      } else if (rectMode === 2) {
        val = Math.abs(val);
      } else if (rectMode === 3) {
        val = Math.max(0, Math.min(1, val));
      }
      this.slewed += slewCoeff * (val - this.slewed);
      out[i] = Number.isFinite(this.slewed) ? Math.max(-2.5, Math.min(2.5, this.slewed)) : 0;
    }
    return true;
  }
}

class PhaserFlangerProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'mode', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'rate', defaultValue: 0.45, minValue: 0.03, maxValue: 8.0, automationRate: 'a-rate' },
      { name: 'depth', defaultValue: 0.65, minValue: 0, maxValue: 1.0, automationRate: 'k-rate' },
      { name: 'centerFreq', defaultValue: 900, minValue: 120, maxValue: 5000, automationRate: 'a-rate' },
      { name: 'feedback', defaultValue: 0.55, minValue: -0.9, maxValue: 0.9, automationRate: 'k-rate' },
      { name: 'stereoPhase', defaultValue: 90, minValue: 0, maxValue: 180, automationRate: 'k-rate' },
      { name: 'mix', defaultValue: 0.6, minValue: 0, maxValue: 1, automationRate: 'a-rate' }
    ];
  }
  constructor() {
    super();
    this.phase = 0;
    this.numStages = 6;
    this.apX1L = new Float32Array(this.numStages);
    this.apY1L = new Float32Array(this.numStages);
    this.apX1R = new Float32Array(this.numStages);
    this.apY1R = new Float32Array(this.numStages);
    this.fbL = 0;
    this.fbR = 0;

    this.flBufLen = 1024;
    this.flBufL = new Float32Array(this.flBufLen);
    this.flBufR = new Float32Array(this.flBufLen);
    this.flWrite = 0;

    this.stopped = false;
    this.port.onmessage = (e) => {
      if (e.data === 'stop') this.stopped = true;
    };
  }
  readFlange(buf, delaySamples) {
    const pos = ((this.flWrite - delaySamples) % this.flBufLen + this.flBufLen) % this.flBufLen;
    const i0 = Math.floor(pos);
    const i1 = (i0 + 1) % this.flBufLen;
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

    const mode = Math.round(parameters.mode[0] || 0); // 0=phaser, 1=flanger
    const rateArr = parameters.rate;
    const depth = Math.max(0, Math.min(1, parameters.depth[0] ?? 0.65));
    const centerArr = parameters.centerFreq;
    const feedback = Math.max(-0.88, Math.min(0.88, parameters.feedback[0] ?? 0.55));
    const stereoRad = (Math.max(0, Math.min(180, parameters.stereoPhase[0] ?? 90)) * Math.PI) / 180;
    const mixArr = parameters.mix;

    for (let i = 0; i < outL.length; i++) {
      const dryL = inL && Number.isFinite(inL[i]) ? inL[i] : 0;
      const dryR = inR && Number.isFinite(inR[i]) ? inR[i] : 0;

      const rate = Math.max(0.03, Math.min(8.0, rateArr.length > 1 ? rateArr[i] : rateArr[0]));
      const center = Math.max(120, Math.min(5000, centerArr.length > 1 ? centerArr[i] : centerArr[0]));
      const mix = Math.max(0, Math.min(1, mixArr.length > 1 ? mixArr[i] : mixArr[0]));

      this.phase += (rate * 2 * Math.PI) / sampleRate;
      if (this.phase >= 2 * Math.PI) this.phase -= 2 * Math.PI;

      const lfoL = 0.5 + 0.5 * Math.sin(this.phase);
      const lfoR = 0.5 + 0.5 * Math.sin(this.phase + stereoRad);

      let wetL = 0;
      let wetR = 0;

      if (mode === 0) {
        // 6-stage first-order allpass cascade phaser
        const fL = Math.max(60, Math.min(sampleRate * 0.4, center * Math.pow(2, (lfoL * 2 - 1) * depth * 2.2)));
        const fR = Math.max(60, Math.min(sampleRate * 0.4, center * Math.pow(2, (lfoR * 2 - 1) * depth * 2.2)));
        const tL = Math.tan((Math.PI * fL) / sampleRate);
        const tR = Math.tan((Math.PI * fR) / sampleRate);
        const aL = (1 - tL) / (1 + tL);
        const aR = (1 - tR) / (1 + tR);

        let sigL = Math.tanh(dryL + this.fbL * feedback);
        let sigR = Math.tanh(dryR + this.fbR * feedback);
        for (let s = 0; s < this.numStages; s++) {
          const yL = aL * (sigL - this.apY1L[s]) + this.apX1L[s];
          this.apX1L[s] = sigL;
          this.apY1L[s] = yL;
          sigL = yL;

          const yR = aR * (sigR - this.apY1R[s]) + this.apX1R[s];
          this.apX1R[s] = sigR;
          this.apY1R[s] = yR;
          sigR = yR;
        }
        this.fbL = Number.isFinite(sigL) ? sigL : 0;
        this.fbR = Number.isFinite(sigR) ? sigR : 0;
        wetL = (dryL + sigL) * 0.7;
        wetR = (dryR + sigR) * 0.7;
      } else {
        // Stereo jet flanger (0.3ms .. 8ms modulated delay comb)
        const minSmp = Math.max(4, sampleRate * 0.00035);
        const maxSmp = Math.min(this.flBufLen - 4, sampleRate * (0.001 + (1 - Math.min(1, center / 5000)) * 0.007));
        const dL = minSmp + lfoL * depth * (maxSmp - minSmp);
        const dR = minSmp + lfoR * depth * (maxSmp - minSmp);

        const delL = this.readFlange(this.flBufL, dL);
        const delR = this.readFlange(this.flBufR, dR);

        this.flBufL[this.flWrite] = Math.tanh(dryL + delL * feedback);
        this.flBufR[this.flWrite] = Math.tanh(dryR + delR * feedback);
        this.flWrite = (this.flWrite + 1) % this.flBufLen;

        wetL = (dryL + delL * 0.85) * 0.72;
        wetR = (dryR + delR * 0.85) * 0.72;
      }

      const resL = dryL * (1 - mix) + wetL * mix;
      const resR = dryR * (1 - mix) + wetR * mix;
      outL[i] = Number.isFinite(resL) ? resL : 0;
      outR[i] = Number.isFinite(resR) ? resR : 0;
    }
    return true;
  }
}

registerProcessor('timbre-quantizer-processor', QuantizerProcessor);
registerProcessor('timbre-cvutil-processor', CvUtilityProcessor);
registerProcessor('timbre-phaser-processor', PhaserFlangerProcessor);
`;
