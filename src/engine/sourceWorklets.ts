export const MODAL_MATERIAL_INDEX: Record<string, number> = {
  marimba: 0,
  bell: 1,
  kalimba: 2,
  steelDrum: 3,
  plate: 4,
  harmonic: 5,
};

export const PIPE_BORE_INDEX: Record<string, number> = {
  flute: 0,
  clarinet: 1,
  reed: 2,
  organPipe: 3,
};

export const SOURCE_WORKLET_CODE = `
class ModalResonatorProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'frequency', defaultValue: 220, minValue: 20, maxValue: 4000, automationRate: 'a-rate' },
      { name: 'material', defaultValue: 0, minValue: 0, maxValue: 5, automationRate: 'k-rate' },
      { name: 'inharmonicity', defaultValue: 0.15, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'brightness', defaultValue: 0.65, minValue: 0.05, maxValue: 1, automationRate: 'a-rate' },
      { name: 'decay', defaultValue: 1.4, minValue: 0.08, maxValue: 8.0, automationRate: 'k-rate' },
      { name: 'damping', defaultValue: 0.45, minValue: 0.02, maxValue: 0.98, automationRate: 'k-rate' },
      { name: 'exciterType', defaultValue: 0, minValue: 0, maxValue: 2, automationRate: 'k-rate' },
      { name: 'exciterMix', defaultValue: 0.7, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'gate', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'velocity', defaultValue: 0.8, minValue: 0.01, maxValue: 1, automationRate: 'k-rate' }
    ];
  }

  constructor() {
    super();
    this.numModes = 8;
    this.y1 = new Float32Array(this.numModes);
    this.y2 = new Float32Array(this.numModes);
    this.x1 = 0;
    this.lastTriggered = false;
    this.strikeSamples = 0;
    this.strikeTotal = 64;
    this.contEnv = 0;
    this.noiseLp = 0;
    this.seed = 9187;
    this.stopped = false;
    this.ratios = [
      [1.0, 3.98, 9.21, 14.8, 20.1, 25.6, 31.4, 37.9],   // 0: Marimba / Wood bar
      [1.0, 2.0, 2.42, 3.0, 4.18, 5.43, 6.79, 8.21],    // 1: Bronze Bell / Bowl
      [1.0, 2.76, 5.40, 8.93, 13.34, 18.6, 24.5, 31.2], // 2: Kalimba / Tine
      [1.0, 2.0, 3.0, 4.04, 5.15, 6.28, 7.45, 8.71],    // 3: Steel Drum
      [1.0, 1.59, 2.14, 2.65, 3.16, 3.89, 4.48, 5.21],  // 4: Metallic Plate / Gong
      [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0]          // 5: Harmonic Bank
    ];
    this.amps = [
      [1.0, 0.42, 0.16, 0.07, 0.03, 0.02, 0.01, 0.008],
      [1.0, 0.72, 0.58, 0.44, 0.32, 0.22, 0.14, 0.09],
      [1.0, 0.54, 0.25, 0.12, 0.06, 0.03, 0.015, 0.008],
      [1.0, 0.68, 0.45, 0.30, 0.18, 0.11, 0.06, 0.03],
      [0.85, 0.78, 0.62, 0.48, 0.36, 0.25, 0.18, 0.12],
      [1.0, 0.65, 0.45, 0.32, 0.22, 0.15, 0.10, 0.06]
    ];
    this.port.onmessage = (e) => {
      if (e.data === 'stop') this.stopped = true;
    };
  }

  nextRand() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return (this.seed / 4294967296) * 2 - 1;
  }

  clamp(v, min, max, fb) {
    if (!Number.isFinite(v)) return fb;
    return v < min ? min : v > max ? max : v;
  }

  process(inputs, outputs, parameters) {
    if (this.stopped) return false;
    const output = outputs[0];
    if (!output || !output[0]) return true;
    const ch = output[0];
    const ext = inputs[0] && inputs[0][0] ? inputs[0][0] : null;

    const freqArr = parameters.frequency;
    const brightArr = parameters.brightness;
    const matIdx = Math.round(this.clamp(parameters.material[0], 0, 5, 0));
    const inharm = this.clamp(parameters.inharmonicity[0], 0, 1, 0.15);
    const decaySec = this.clamp(parameters.decay[0], 0.08, 8.0, 1.4);
    const damping = this.clamp(parameters.damping[0], 0.02, 0.98, 0.45);
    const excType = Math.round(this.clamp(parameters.exciterType[0], 0, 2, 0));
    const excMix = this.clamp(parameters.exciterMix[0], 0, 1, 0.7);
    const gate = this.clamp(parameters.gate[0], 0, 1, 0);
    const vel = this.clamp(parameters.velocity[0], 0.01, 1, 0.8);

    const ratioRow = this.ratios[matIdx] || this.ratios[0];
    const ampRow = this.amps[matIdx] || this.amps[0];
    const maxModeHz = sampleRate * 0.42;

    if (gate > 0.5 && !this.lastTriggered) {
      this.lastTriggered = true;
      const b0 = this.clamp(brightArr[0], 0.05, 1, 0.65);
      // Harder mallet = shorter sharper impact; softer mallet = longer warmer thump
      this.strikeTotal = excType === 1 ? Math.max(24, Math.round(sampleRate * 0.004)) : Math.max(18, Math.round(sampleRate * (0.008 - b0 * 0.0062)));
      this.strikeSamples = this.strikeTotal;
      if (excType === 2) this.contEnv = 0.2;
    } else if (gate < 0.5) {
      this.lastTriggered = false;
    }

    for (let i = 0; i < ch.length; i++) {
      const f0 = this.clamp(freqArr.length > 1 ? freqArr[i] : freqArr[0], 20, 4000, 220);
      const bright = this.clamp(brightArr.length > 1 ? brightArr[i] : brightArr[0], 0.05, 1, 0.65);

      let exc = 0;
      if (ext && Number.isFinite(ext[i])) {
        exc += Math.max(-2, Math.min(2, ext[i])) * excMix * 0.4;
      }

      if (excType === 2) {
        const target = gate > 0.5 ? 1.0 : 0.0;
        this.contEnv += (target - this.contEnv) * (gate > 0.5 ? 0.0018 : 0.004);
        if (this.contEnv > 0.001) {
          const n = this.nextRand();
          this.noiseLp += (0.12 + bright * 0.72) * (n - this.noiseLp);
          exc += this.noiseLp * this.contEnv * vel * 0.055;
        }
      } else if (this.strikeSamples > 0) {
        const phase = 1 - this.strikeSamples / Math.max(1, this.strikeTotal);
        const win = Math.sin(phase * Math.PI);
        if (excType === 1) {
          // Plucked transient
          const n = this.nextRand();
          this.noiseLp += (0.2 + bright * 0.75) * (n - this.noiseLp);
          exc += (win * 0.35 + this.noiseLp * 0.65 * win) * vel * 0.36;
        } else {
          // Struck mallet impulse
          const n = this.nextRand();
          this.noiseLp += (0.15 + bright * 0.65) * (n - this.noiseLp);
          exc += (win * 0.72 + this.noiseLp * 0.28 * win) * vel * 0.42;
        }
        this.strikeSamples--;
      }

      const x0 = exc;
      const xDiff = x0 - this.x1;
      this.x1 = x0;

      let sum = 0;
      for (let m = 0; m < this.numModes; m++) {
        const baseRatio = ratioRow[m];
        const warp = 1 + (inharm - 0.15) * 0.55 * (m * 0.28);
        const modeFreq = f0 * Math.max(0.5, baseRatio * Math.max(0.45, warp));
        if (modeFreq >= maxModeHz || modeFreq < 18) {
          this.y1[m] *= 0.99;
          this.y2[m] *= 0.99;
          continue;
        }

        const omega = (6.28318530718 * modeFreq) / sampleRate;
        // High modes decay faster proportional to damping
        const modeDecay = Math.max(0.03, decaySec / (1 + m * damping * 1.45));
        const releaseMul = gate > 0.5 ? 1.0 : (excType === 2 ? 0.35 : 0.92);
        const r = Math.min(0.99992, Math.max(0.85, Math.exp(-3.0 / (modeDecay * releaseMul * sampleRate))));
        const a1 = -2.0 * r * Math.cos(omega);
        const a2 = r * r;

        const gainWeight = ampRow[m] * Math.pow(bright, m * 0.42) * (1 - r);
        const y0 = gainWeight * 22.0 * xDiff - a1 * this.y1[m] - a2 * this.y2[m];
        if (Number.isFinite(y0)) {
          this.y2[m] = this.y1[m];
          this.y1[m] = Math.max(-4.0, Math.min(4.0, y0));
          sum += this.y1[m];
        } else {
          this.y1[m] = 0;
          this.y2[m] = 0;
        }
      }

      ch[i] = this.clamp(Math.tanh(sum * 0.85), -1.2, 1.2, 0);
    }

    return true;
  }
}

class BlownPipeProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'frequency', defaultValue: 220, minValue: 25, maxValue: 4000, automationRate: 'a-rate' },
      { name: 'boreType', defaultValue: 0, minValue: 0, maxValue: 3, automationRate: 'k-rate' },
      { name: 'breathPressure', defaultValue: 0.65, minValue: 0.05, maxValue: 1.25, automationRate: 'a-rate' },
      { name: 'embouchure', defaultValue: 0.55, minValue: 0.05, maxValue: 1.0, automationRate: 'k-rate' },
      { name: 'breathNoise', defaultValue: 0.25, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'damping', defaultValue: 0.38, minValue: 0.05, maxValue: 0.95, automationRate: 'k-rate' },
      { name: 'overblow', defaultValue: 0.0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'exciterMix', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'gate', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'velocity', defaultValue: 0.8, minValue: 0.01, maxValue: 1, automationRate: 'k-rate' }
    ];
  }

  constructor() {
    super();
    this.maxDelay = 8192;
    this.bore = new Float32Array(this.maxDelay);
    this.jet = new Float32Array(2048);
    this.writeIdx = 0;
    this.jetIdx = 0;
    this.lpState = 0;
    this.noiseLp = 0;
    this.dcIn = 0;
    this.dcOut = 0;
    this.breathEnv = 0;
    this.chiffEnv = 0;
    this.lastTriggered = false;
    this.seed = 2741;
    this.stopped = false;
    this.port.onmessage = (e) => {
      if (e.data === 'stop') this.stopped = true;
    };
  }

  nextRand() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return (this.seed / 4294967296) * 2 - 1;
  }

  clamp(v, min, max, fb) {
    if (!Number.isFinite(v)) return fb;
    return v < min ? min : v > max ? max : v;
  }

  readFrac(buf, maxLen, writeIdx, delaySamples) {
    const d = Math.max(2, Math.min(maxLen - 3, delaySamples));
    const intD = Math.floor(d);
    const frac = d - intD;
    const i1 = (writeIdx - intD + maxLen) % maxLen;
    const i2 = (i1 - 1 + maxLen) % maxLen;
    const s1 = Number.isFinite(buf[i1]) ? buf[i1] : 0;
    const s2 = Number.isFinite(buf[i2]) ? buf[i2] : 0;
    return s1 * (1 - frac) + s2 * frac;
  }

  process(inputs, outputs, parameters) {
    if (this.stopped) return false;
    const output = outputs[0];
    if (!output || !output[0]) return true;
    const ch = output[0];
    const ext = inputs[0] && inputs[0][0] ? inputs[0][0] : null;

    const freqArr = parameters.frequency;
    const pressArr = parameters.breathPressure;
    const boreType = Math.round(this.clamp(parameters.boreType[0], 0, 3, 0));
    const embouchure = this.clamp(parameters.embouchure[0], 0.05, 1.0, 0.55);
    const breathNoise = this.clamp(parameters.breathNoise[0], 0, 1, 0.25);
    const damping = this.clamp(parameters.damping[0], 0.05, 0.95, 0.38);
    const overblow = this.clamp(parameters.overblow[0], 0, 1, 0);
    const excMix = this.clamp(parameters.exciterMix[0], 0, 1, 0.5);
    const gate = this.clamp(parameters.gate[0], 0, 1, 0);
    const vel = this.clamp(parameters.velocity[0], 0.01, 1, 0.8);

    if (gate > 0.5 && !this.lastTriggered) {
      this.lastTriggered = true;
      this.chiffEnv = 1.0;
    } else if (gate < 0.5) {
      this.lastTriggered = false;
    }

    const lpAlpha = Math.max(0.08, 1 - damping * 0.72);

    for (let i = 0; i < ch.length; i++) {
      const freq = this.clamp(freqArr.length > 1 ? freqArr[i] : freqArr[0], 25, 4000, 220);
      const pressKnob = this.clamp(pressArr.length > 1 ? pressArr[i] : pressArr[0], 0.05, 1.25, 0.65);

      const targetEnv = gate > 0.5 ? 1.0 : 0.0;
      const envSpeed = gate > 0.5 ? (boreType === 3 ? 0.0025 : 0.0014) : 0.0028;
      this.breathEnv += (targetEnv - this.breathEnv) * envSpeed;
      this.chiffEnv *= 0.9965;

      const rawN = this.nextRand();
      this.noiseLp += (0.28 + embouchure * 0.45) * (rawN - this.noiseLp);
      const extSample = ext && Number.isFinite(ext[i]) ? Math.max(-2, Math.min(2, ext[i])) * excMix * 0.3 : 0;

      // Closed-open cylindrical bore (clarinet) runs at half-period with inverting (-1) round-trip reflection -> odd harmonics at f0
      // Open-open / conical bores (flute, double reed, organ pipe) run at full-period with positive (+1) round-trip reflection -> all harmonics at f0
      const isClarinet = boreType === 1;
      const boreDelay = isClarinet
        ? Math.max(4, sampleRate / (freq * 2.0) - 0.5)
        : Math.max(4, sampleRate / freq - 0.5);

      const boreDelayed = this.readFrac(this.bore, this.maxDelay, this.writeIdx, boreDelay);
      this.lpState = this.lpState + lpAlpha * (boreDelayed - this.lpState);

      const reflectSign = isClarinet ? -0.92 : 0.90;
      const reflected = this.lpState * reflectSign;

      const pressure = (pressKnob * (0.45 + vel * 0.55) + this.chiffEnv * 0.16) * this.breathEnv;
      const turb = this.noiseLp * breathNoise * (0.08 + this.chiffEnv * 0.22 + pressKnob * 0.08) * this.breathEnv;

      let boreIn = 0;
      let outRaw = 0;

      if (boreType === 0 || boreType === 3) {
        // Flute / Organ Pipe air-jet nonlinear edge model
        const jetRatio = boreType === 3 ? 0.24 : 0.34 * (0.65 + (1 - embouchure) * 0.55) * (1 - overblow * 0.45);
        const jetDelay = Math.max(2, Math.min(1800, boreDelay * jetRatio));
        const jetDrive = pressure * 0.55 - reflected * 0.62 + turb + extSample;
        this.jet[this.jetIdx] = this.clamp(jetDrive, -1.5, 1.5, 0);
        const jetOut = this.readFrac(this.jet, 2048, this.jetIdx, jetDelay);
        this.jetIdx = (this.jetIdx + 1) % 2048;

        // Edge-tone sigmoid cubic nonlinearity: x - x^3
        const x = this.clamp(jetOut * (1.25 + overblow * 0.85), -1.5, 1.5, 0);
        const jetNl = Math.tanh(x - 0.33 * x * x * x) * (boreType === 3 ? 0.52 : 0.72);
        boreIn = reflected * (0.78 + (1 - damping) * 0.15) + jetNl * 0.38 + turb * 0.7;
        outRaw = this.lpState * 0.72 + jetNl * 0.24 + turb * 0.32;
      } else {
        // Clarinet / Double-Reed pressure-controlled valve model
        const diff = pressure - reflected;
        const stiffness = boreType === 2 ? 1.15 + embouchure * 0.9 : 0.75 + embouchure * 0.65;
        let valve = 0.78 - stiffness * Math.abs(diff);
        if (valve < 0) valve = 0;
        if (valve > 1) valve = 1;
        // Asymmetric reed saturation for double-reed oboe/duduk bite
        const asym = boreType === 2 ? Math.tanh((diff + 0.12) * 1.8) * 0.22 : 0;
        boreIn = pressure * valve * 0.58 + reflected * (0.66 + valve * 0.24) + asym + turb + extSample;
        outRaw = this.lpState * 0.8 + boreIn * 0.2 + turb * 0.2;
      }

      this.bore[this.writeIdx] = this.clamp(boreIn, -1.4, 1.4, 0);
      this.writeIdx = (this.writeIdx + 1) % this.maxDelay;

      const dcBlocked = outRaw - this.dcIn + 0.995 * this.dcOut;
      if (Number.isFinite(dcBlocked)) {
        this.dcIn = outRaw;
        this.dcOut = dcBlocked;
        ch[i] = this.clamp(Math.tanh(dcBlocked * 1.15), -1.2, 1.2, 0);
      } else {
        this.dcIn = 0;
        this.dcOut = 0;
        this.lpState = 0;
        ch[i] = 0;
      }
    }

    return true;
  }
}

registerProcessor('timbre-modal-processor', ModalResonatorProcessor);
registerProcessor('timbre-pipe-processor', BlownPipeProcessor);
`;
