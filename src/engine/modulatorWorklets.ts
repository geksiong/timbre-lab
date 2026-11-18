export const SH_MODE_INDEX: Record<string, number> = {
  random: 0,
  quantized: 1,
  external: 2,
};

export const SLOPE_MODE_INDEX: Record<string, number> = {
  oneShot: 0,
  asr: 1,
  loop: 2,
};

export const SEQ_DIR_INDEX: Record<string, number> = {
  forward: 0,
  pendulum: 1,
  random: 2,
};

export const MODULATOR_WORKLET_CODE = `
class SampleHoldProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'mode', defaultValue: 0, minValue: 0, maxValue: 2, automationRate: 'k-rate' },
      { name: 'rate', defaultValue: 4.5, minValue: 0.1, maxValue: 40, automationRate: 'a-rate' },
      { name: 'slew', defaultValue: 0.15, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'depth', defaultValue: 0.65, minValue: 0, maxValue: 1.5, automationRate: 'k-rate' },
      { name: 'unipolar', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'seed', defaultValue: 7331, minValue: 1, maxValue: 999999, automationRate: 'k-rate' }
    ];
  }
  constructor() {
    super();
    this.phase = 1.0; // trigger sample immediately on first sample
    this.held = 0;
    this.slewed = 0;
    this.seed = 7331;
    this.seeded = false;
    this.stopped = false;
    this.quantSteps = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];
    this.port.onmessage = (e) => {
      if (e.data === 'stop') this.stopped = true;
    };
  }
  nextRand() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return (this.seed / 4294967296) * 2 - 1;
  }
  process(inputs, outputs, parameters) {
    if (this.stopped) return false;
    const output = outputs[0];
    if (!output || !output[0]) return true;
    const out = output[0];
    const extIn = inputs[0] && inputs[0][0] ? inputs[0][0] : null;

    if (!this.seeded) {
      this.seeded = true;
      const pSeed = Math.floor(parameters.seed[0] || 7331);
      this.seed = (pSeed * 2654435761) >>> 0 || 7331;
    }

    const mode = Math.round(parameters.mode[0] || 0);
    const rateArr = parameters.rate;
    const slew = Math.max(0, Math.min(1, parameters.slew[0] || 0));
    const depth = Math.max(0, Math.min(1.5, parameters.depth[0] ?? 0.65));
    const unipolar = (parameters.unipolar[0] || 0) >= 0.5;

    // Map slew 0..1 -> smoothing time constant ~0.1ms .. 450ms
    const slewTime = 0.0001 + slew * slew * 0.45;
    const slewCoeff = 1 - Math.exp(-1 / (slewTime * sampleRate));

    for (let i = 0; i < out.length; i++) {
      const rate = Math.max(0.1, Math.min(40, rateArr.length > 1 ? rateArr[i] : rateArr[0]));
      this.phase += rate / sampleRate;
      if (this.phase >= 1.0) {
        this.phase -= Math.floor(this.phase);
        if (mode === 2 && extIn) {
          const s = extIn[i];
          this.held = Number.isFinite(s) ? Math.max(-1.5, Math.min(1.5, s)) : 0;
        } else if (mode === 1) {
          const idx = Math.floor(((this.nextRand() + 1) * 0.5) * this.quantSteps.length);
          this.held = this.quantSteps[Math.min(this.quantSteps.length - 1, Math.max(0, idx))];
        } else {
          this.held = this.nextRand();
        }
      }

      this.slewed += slewCoeff * (this.held - this.slewed);
      const val = unipolar ? (this.slewed * 0.5 + 0.5) : this.slewed;
      out[i] = Number.isFinite(val) ? val * depth : 0;
    }
    return true;
  }
}

class SlopeGeneratorProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'mode', defaultValue: 0, minValue: 0, maxValue: 2, automationRate: 'k-rate' },
      { name: 'rise', defaultValue: 0.04, minValue: 0.002, maxValue: 10.0, automationRate: 'a-rate' },
      { name: 'fall', defaultValue: 0.45, minValue: 0.004, maxValue: 12.0, automationRate: 'a-rate' },
      { name: 'shape', defaultValue: 0.35, minValue: -1, maxValue: 1, automationRate: 'k-rate' },
      { name: 'depth', defaultValue: 0.85, minValue: 0, maxValue: 1.5, automationRate: 'k-rate' },
      { name: 'bipolar', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'gate', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' }
    ];
  }
  constructor() {
    super();
    this.stage = 1; // 0=idle, 1=rise, 2=hold, 3=fall
    this.pos = 0;   // 0..1 progress along stage
    this.val = 0;
    this.prevGate = 0;
    this.stopped = false;
    this.port.onmessage = (e) => {
      if (e.data === 'stop') this.stopped = true;
    };
  }
  shapeCurve(t, shape) {
    const x = Math.max(0, Math.min(1, t));
    if (Math.abs(shape) < 0.02) return x;
    // shape > 0 -> exponential (slower start, steeper end); shape < 0 -> logarithmic (snappy start)
    const exp = Math.pow(3.5, shape);
    return Math.pow(x, exp);
  }
  process(inputs, outputs, parameters) {
    if (this.stopped) return false;
    const output = outputs[0];
    if (!output || !output[0]) return true;
    const out = output[0];

    const mode = Math.round(parameters.mode[0] || 0); // 0=oneShot AD, 1=ASR, 2=loop
    const riseArr = parameters.rise;
    const fallArr = parameters.fall;
    const shape = Math.max(-1, Math.min(1, parameters.shape[0] ?? 0.35));
    const depth = Math.max(0, Math.min(1.5, parameters.depth[0] ?? 0.85));
    const bipolar = (parameters.bipolar[0] || 0) >= 0.5;
    const gate = (parameters.gate[0] || 0) >= 0.5;

    if (gate && !this.prevGate) {
      this.stage = 1;
      this.pos = 0;
    } else if (!gate && this.prevGate) {
      if (mode === 1 && this.stage !== 3 && this.stage !== 0) {
        this.stage = 3;
        this.pos = 1 - this.val;
      }
    }
    this.prevGate = gate;

    for (let i = 0; i < out.length; i++) {
      const riseSec = Math.max(0.002, Math.min(10.0, riseArr.length > 1 ? riseArr[i] : riseArr[0]));
      const fallSec = Math.max(0.004, Math.min(12.0, fallArr.length > 1 ? fallArr[i] : fallArr[0]));

      if (this.stage === 1) {
        this.pos += 1 / (riseSec * sampleRate);
        if (this.pos >= 1) {
          this.pos = 0;
          this.val = 1;
          this.stage = (mode === 1 && gate) ? 2 : 3;
        } else {
          this.val = this.shapeCurve(this.pos, -shape);
        }
      } else if (this.stage === 2) {
        this.val = 1;
        if (!gate) {
          this.stage = 3;
          this.pos = 0;
        }
      } else if (this.stage === 3) {
        this.pos += 1 / (fallSec * sampleRate);
        if (this.pos >= 1) {
          this.pos = 0;
          this.val = 0;
          if (mode === 2 && gate) {
            this.stage = 1;
          } else {
            this.stage = 0;
          }
        } else {
          this.val = 1 - this.shapeCurve(this.pos, -shape);
        }
      } else {
        this.val = 0;
      }

      const sig = bipolar ? (this.val * 2 - 1) : this.val;
      out[i] = Number.isFinite(sig) ? sig * depth : 0;
    }
    return true;
  }
}

class StepSequencerProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rate', defaultValue: 4.0, minValue: 0.2, maxValue: 30, automationRate: 'a-rate' },
      { name: 'steps', defaultValue: 8, minValue: 2, maxValue: 8, automationRate: 'k-rate' },
      { name: 'direction', defaultValue: 0, minValue: 0, maxValue: 2, automationRate: 'k-rate' },
      { name: 'glide', defaultValue: 0.08, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'depth', defaultValue: 0.7, minValue: 0, maxValue: 1.5, automationRate: 'k-rate' },
      { name: 'step1', defaultValue: 0.8, minValue: -1, maxValue: 1, automationRate: 'k-rate' },
      { name: 'step2', defaultValue: 0.2, minValue: -1, maxValue: 1, automationRate: 'k-rate' },
      { name: 'step3', defaultValue: 0.6, minValue: -1, maxValue: 1, automationRate: 'k-rate' },
      { name: 'step4', defaultValue: -0.2, minValue: -1, maxValue: 1, automationRate: 'k-rate' },
      { name: 'step5', defaultValue: 1.0, minValue: -1, maxValue: 1, automationRate: 'k-rate' },
      { name: 'step6', defaultValue: 0.4, minValue: -1, maxValue: 1, automationRate: 'k-rate' },
      { name: 'step7', defaultValue: 0.0, minValue: -1, maxValue: 1, automationRate: 'k-rate' },
      { name: 'step8', defaultValue: -0.5, minValue: -1, maxValue: 1, automationRate: 'k-rate' },
      { name: 'seed', defaultValue: 313, minValue: 1, maxValue: 999999, automationRate: 'k-rate' }
    ];
  }
  constructor() {
    super();
    this.phase = 0;
    this.stepIdx = 0;
    this.pingDir = 1;
    this.slewed = 0;
    this.initialized = false;
    this.seed = 313;
    this.stopped = false;
    this.port.onmessage = (e) => {
      if (e.data === 'stop') this.stopped = true;
    };
  }
  nextRand() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  process(inputs, outputs, parameters) {
    if (this.stopped) return false;
    const output = outputs[0];
    if (!output || !output[0]) return true;
    const out = output[0];

    const rateArr = parameters.rate;
    const numSteps = Math.max(2, Math.min(8, Math.round(parameters.steps[0] || 8)));
    const dir = Math.round(parameters.direction[0] || 0);
    const glide = Math.max(0, Math.min(1, parameters.glide[0] || 0));
    const depth = Math.max(0, Math.min(1.5, parameters.depth[0] ?? 0.7));
    const stepVals = [
      parameters.step1[0] ?? 0,
      parameters.step2[0] ?? 0,
      parameters.step3[0] ?? 0,
      parameters.step4[0] ?? 0,
      parameters.step5[0] ?? 0,
      parameters.step6[0] ?? 0,
      parameters.step7[0] ?? 0,
      parameters.step8[0] ?? 0,
    ];

    if (!this.initialized) {
      this.initialized = true;
      const pSeed = Math.floor(parameters.seed[0] || 313);
      this.seed = (pSeed * 2654435761) >>> 0 || 313;
      this.slewed = stepVals[0];
    }

    const glideTime = 0.0002 + glide * glide * 0.3;
    const glideCoeff = 1 - Math.exp(-1 / (glideTime * sampleRate));

    for (let i = 0; i < out.length; i++) {
      const rate = Math.max(0.2, Math.min(30, rateArr.length > 1 ? rateArr[i] : rateArr[0]));
      this.phase += rate / sampleRate;
      if (this.phase >= 1.0) {
        this.phase -= Math.floor(this.phase);
        if (dir === 2) {
          this.stepIdx = Math.floor(this.nextRand() * numSteps);
        } else if (dir === 1) {
          this.stepIdx += this.pingDir;
          if (this.stepIdx >= numSteps - 1) {
            this.stepIdx = numSteps - 1;
            this.pingDir = -1;
          } else if (this.stepIdx <= 0) {
            this.stepIdx = 0;
            this.pingDir = 1;
          }
        } else {
          this.stepIdx = (this.stepIdx + 1) % numSteps;
        }
      }

      const target = stepVals[this.stepIdx % numSteps] || 0;
      this.slewed += glideCoeff * (target - this.slewed);
      out[i] = Number.isFinite(this.slewed) ? this.slewed * depth : 0;
    }
    return true;
  }
}

class EnvFollowerProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'attackMs', defaultValue: 8, minValue: 1, maxValue: 250, automationRate: 'k-rate' },
      { name: 'releaseMs', defaultValue: 140, minValue: 10, maxValue: 1500, automationRate: 'k-rate' },
      { name: 'sensitivity', defaultValue: 1.5, minValue: 0.2, maxValue: 4.0, automationRate: 'k-rate' },
      { name: 'invert', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'depth', defaultValue: 1.0, minValue: 0, maxValue: 1.5, automationRate: 'k-rate' }
    ];
  }
  constructor() {
    super();
    this.env = 0;
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
    const inCh0 = inputs[0] && inputs[0][0] ? inputs[0][0] : null;
    const inCh1 = inputs[0] && inputs[0][1] ? inputs[0][1] : inCh0;

    const atkSec = Math.max(0.001, Math.min(0.25, (parameters.attackMs[0] || 8) / 1000));
    const relSec = Math.max(0.01, Math.min(1.5, (parameters.releaseMs[0] || 140) / 1000));
    const sens = Math.max(0.2, Math.min(4.0, parameters.sensitivity[0] || 1.5));
    const invert = (parameters.invert[0] || 0) >= 0.5;
    const depth = Math.max(0, Math.min(1.5, parameters.depth[0] ?? 1.0));

    const atkCoeff = 1 - Math.exp(-1 / (atkSec * sampleRate));
    const relCoeff = 1 - Math.exp(-1 / (relSec * sampleRate));

    for (let i = 0; i < out.length; i++) {
      const l = inCh0 && Number.isFinite(inCh0[i]) ? Math.abs(inCh0[i]) : 0;
      const r = inCh1 && Number.isFinite(inCh1[i]) ? Math.abs(inCh1[i]) : 0;
      const rect = Math.min(1.2, (l + r) * 0.5 * sens);
      const coeff = rect > this.env ? atkCoeff : relCoeff;
      this.env += coeff * (rect - this.env);
      const val = invert ? (1 - Math.min(1, this.env)) : Math.min(1.2, this.env);
      out[i] = Number.isFinite(val) ? val * depth : 0;
    }
    return true;
  }
}

registerProcessor('timbre-samplehold-processor', SampleHoldProcessor);
registerProcessor('timbre-slope-processor', SlopeGeneratorProcessor);
registerProcessor('timbre-stepseq-processor', StepSequencerProcessor);
registerProcessor('timbre-envfollower-processor', EnvFollowerProcessor);
`;
