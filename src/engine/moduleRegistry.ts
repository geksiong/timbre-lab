import { ModuleDefinition, ModuleType, SynthNode } from './types';

export const MODULE_REGISTRY: Record<ModuleType, ModuleDefinition> = {
  oscillator: {
    type: 'oscillator',
    label: 'Oscillator',
    category: 'source',
    description: 'Multi-waveform oscillator with harmonic blend and pitch CV input.',
    acousticGuide:
      'Generates the core repeating sound wave. Sawtooth and Warm Bowed shapes naturally contain the rich overtones needed before filtering.',
    bowedTip:
      'Layer a quiet Warm Bowed or Rich Reed oscillator underneath a Physical String to add lush ensemble body and sustain.',
    ports: [
      { id: 'pitch', label: 'Pitch CV', direction: 'in', signal: 'cv' },
      { id: 'amp', label: 'Amp CV', direction: 'in', signal: 'cv' },
      { id: 'out', label: 'Audio Out', direction: 'out', signal: 'audio' },
    ],
    params: [
      {
        key: 'waveform',
        label: 'Waveform',
        type: 'select',
        options: [
          { value: 'sawtooth', label: 'Sawtooth' },
          { value: 'triangle', label: 'Triangle' },
          { value: 'sine', label: 'Sine' },
          { value: 'square', label: 'Square' },
          { value: 'organ', label: 'Drawbar Organ' },
          { value: 'reed', label: 'Rich Reed' },
          { value: 'strings', label: 'Warm Bowed' },
          { value: 'glass', label: 'Glass Bell Pad' },
          { value: 'choir', label: 'Formant Choir' },
          { value: 'hollow', label: 'Hollow Fifth' },
        ],
        defaultValue: 'sawtooth',
        tooltip: 'Choose the harmonic shape of the wave. Glass Bell, Formant Choir, and Warm Bowed excel for ambient pads.',
      },
      { key: 'octave', label: 'Octave', type: 'range', min: -3, max: 3, step: 1, unit: 'oct', defaultValue: 0 },
      { key: 'semitone', label: 'Semitone', type: 'range', min: -12, max: 12, step: 1, unit: 'st', defaultValue: 0 },
      { key: 'detune', label: 'Fine Detune', type: 'range', min: -100, max: 100, step: 1, unit: 'cents', defaultValue: 0, tooltip: 'Tiny pitch offset in hundredths of a semitone. 5–12 cents creates natural ensemble shimmer.' },
      {
        key: 'unison',
        label: 'Unison Voices',
        type: 'select',
        options: [
          { value: '1', label: '1 Voice (Mono)' },
          { value: '3', label: '3 Voices (Lush)' },
          { value: '5', label: '5 Voices (Super Pad)' },
        ],
        defaultValue: '1',
        tooltip: 'Stacks multiple detuned voices per note for wide cinematic ambient pads.',
      },
      { key: 'unisonDetune', label: 'Unison Spread', type: 'range', min: 0, max: 60, step: 1, unit: 'cents', defaultValue: 14, tooltip: 'Pitch spread across stacked unison voices.' },
      { key: 'stereoSpread', label: 'Stereo Width', type: 'range', min: 0, max: 1, step: 0.02, unit: '', defaultValue: 0.55, tooltip: 'Pans stacked unison voices across the stereo field.' },
      { key: 'gain', label: 'Level', type: 'range', min: 0, max: 1, step: 0.01, unit: '', defaultValue: 0.7 },
    ],
  },
  fmOperator: {
    type: 'fmOperator',
    label: 'FM Operator',
    category: 'source',
    description: '2-operator FM synthesizer with Noise-FM grit, external audio FM input, and index CV.',
    acousticGuide:
      'Rapidly wobbles the pitch of a main tone (Carrier) using another wave or filtered noise (Modulator) to create complex metallic, woody, or gritty rosin textures.',
    bowedTip:
      'Turn up Noise FM Depth (80–250 Hz) with Noise Bandwidth around 1.8–3.2 kHz to simulate horsehair rosin scraping against the string.',
    ports: [
      { id: 'modIn', label: 'Mod Audio In', direction: 'in', signal: 'audio' },
      { id: 'pitch', label: 'Pitch CV', direction: 'in', signal: 'cv' },
      { id: 'index', label: 'Index CV', direction: 'in', signal: 'cv' },
      { id: 'amp', label: 'Amp CV', direction: 'in', signal: 'cv' },
      { id: 'out', label: 'Audio Out', direction: 'out', signal: 'audio' },
    ],
    params: [
      {
        key: 'carrierWave',
        label: 'Carrier Wave',
        type: 'select',
        options: [
          { value: 'sine', label: 'Sine' },
          { value: 'triangle', label: 'Triangle' },
          { value: 'sawtooth', label: 'Sawtooth' },
          { value: 'square', label: 'Square' },
        ],
        defaultValue: 'sine',
      },
      {
        key: 'modWave',
        label: 'Modulator Wave',
        type: 'select',
        options: [
          { value: 'sine', label: 'Sine' },
          { value: 'triangle', label: 'Triangle' },
          { value: 'sawtooth', label: 'Sawtooth' },
        ],
        defaultValue: 'sine',
      },
      { key: 'octave', label: 'Octave', type: 'range', min: -2, max: 2, step: 1, unit: 'oct', defaultValue: 0 },
      { key: 'ratio', label: 'Mod Ratio', type: 'range', min: 0.25, max: 12, step: 0.05, unit: 'x', defaultValue: 2.0, tooltip: 'Whole numbers (1x, 2x) sound musical and harmonic; fractional ratios sound metallic or woody.' },
      { key: 'modIndex', label: 'FM Depth', type: 'range', min: 0, max: 1200, step: 5, unit: 'Hz', defaultValue: 260, tooltip: 'How strongly the periodic modulator bends the carrier wave.' },
      { key: 'feedback', label: 'Self Feedback', type: 'range', min: 0, max: 0.85, step: 0.01, unit: '', defaultValue: 0.12 },
      { key: 'noiseFmDepth', label: 'Noise FM Depth', type: 'range', min: 0, max: 900, step: 5, unit: 'Hz', defaultValue: 0, tooltip: 'FM-from-Noise: injects random filtered noise into carrier frequency to simulate bow rosin scrape or breath turbulence.' },
      { key: 'noiseBandwidth', label: 'Noise FM Tone', type: 'range', min: 350, max: 8500, step: 25, unit: 'Hz', scale: 'log', defaultValue: 2400, tooltip: 'Center frequency of the noise modulator. Lower sounds woody; higher adds airy bow hiss.' },
      { key: 'gain', label: 'Level', type: 'range', min: 0, max: 1, step: 0.01, unit: '', defaultValue: 0.75 },
    ],
  },
  physicalString: {
    type: 'physicalString',
    label: 'Physical String',
    category: 'source',
    description: 'Karplus-Strong waveguide resonator with Helmholtz stick-slip bowing, sympathetic buzz, and external exciter input.',
    acousticGuide:
      'Simulates a real vibrating string using a microscopic loop of sound waves bouncing between the bridge and fingered fret, shaped by friction and damping.',
    bowedTip:
      'Set Excitation to Bowed Friction, adjust Bow Pressure (0.45–0.75) for grip/bite, and sweep Bow Position lower (0.08–0.14) to sound closer to the bridge.',
    ports: [
      { id: 'exciter', label: 'Exciter Audio In', direction: 'in', signal: 'audio' },
      { id: 'pitch', label: 'Pitch CV', direction: 'in', signal: 'cv' },
      { id: 'bow', label: 'Bow Pressure CV', direction: 'in', signal: 'cv' },
      { id: 'amp', label: 'Amp CV', direction: 'in', signal: 'cv' },
      { id: 'out', label: 'Audio Out', direction: 'out', signal: 'audio' },
    ],
    params: [
      {
        key: 'excitation',
        label: 'Excitation',
        type: 'select',
        options: [
          { value: 'pluck', label: 'Plucked String' },
          { value: 'bow', label: 'Bowed Friction' },
          { value: 'hammer', label: 'Struck Hammer' },
        ],
        defaultValue: 'pluck',
        tooltip: 'Choose how the string is set in motion: plucked burst, continuous stick-slip bowing, or soft hammer strike.',
      },
      { key: 'octave', label: 'Octave', type: 'range', min: -2, max: 2, step: 1, unit: 'oct', defaultValue: 0 },
      { key: 'bowPressure', label: 'Bow Pressure', type: 'range', min: 0.05, max: 1, step: 0.01, unit: '', defaultValue: 0.56, tooltip: 'How hard the bow hair presses the string. Higher pressure yields grittier stick-slip bite.' },
      { key: 'bowPosition', label: 'Bow Position', type: 'range', min: 0.04, max: 0.48, step: 0.01, unit: '', defaultValue: 0.14, tooltip: 'Where the bow touches the string: 0.08 is bright near the bridge; 0.35 is hollow over the fingerboard.' },
      { key: 'rosin', label: 'Rosin Grit', type: 'range', min: 0, max: 1, step: 0.01, unit: '', defaultValue: 0.32, tooltip: 'Adds subtle micro-friction noise from horsehair rosin catching the string.' },
      { key: 'damping', label: 'Damping', type: 'range', min: 0.05, max: 0.98, step: 0.01, unit: '', defaultValue: 0.45, tooltip: 'How quickly high harmonics fade inside the string loop (higher = warmer, silkier string).' },
      { key: 'decay', label: 'String Decay', type: 'range', min: 0.65, max: 0.998, step: 0.002, unit: '', defaultValue: 0.985, tooltip: 'How long the string keeps ringing after excitation stops.' },
      { key: 'brightness', label: 'Pick / Bow Bite', type: 'range', min: 0.1, max: 1, step: 0.01, unit: '', defaultValue: 0.72 },
      { key: 'sympathetic', label: 'Jawari / Buzz', type: 'range', min: 0, max: 1, step: 0.01, unit: '', defaultValue: 0.0, tooltip: 'Simulates curved bridge buzz and sympathetic string shimmer (great for Sarangi or Sitar).' },
      { key: 'exciterMix', label: 'Ext Exciter Mix', type: 'range', min: 0, max: 1, step: 0.01, unit: '', defaultValue: 0.7, tooltip: 'Amount of external audio (such as Breath/Noise) fed into the string resonator.' },
      { key: 'gain', label: 'Level', type: 'range', min: 0, max: 1.2, step: 0.01, unit: '', defaultValue: 0.85 },
    ],
  },
  noise: {
    type: 'noise',
    label: 'Breath / Noise',
    category: 'source',
    description: 'Filtered white or pink noise for bow rosin, flute breath chiff, and percussion.',
    acousticGuide:
      'Produces non-pitched air or friction texture. Real acoustic instruments always contain subtle noise from bow hair scraping or air blowing.',
    bowedTip:
      'Mix a subtle Pink Noise layer at 2–3.5 kHz into a Comb Filter or Physical String Exciter to recreate realistic bow stroke onset.',
    ports: [
      { id: 'amp', label: 'Amp CV', direction: 'in', signal: 'cv' },
      { id: 'out', label: 'Audio Out', direction: 'out', signal: 'audio' },
    ],
    params: [
      {
        key: 'color',
        label: 'Noise Color',
        type: 'select',
        options: [
          { value: 'white', label: 'White (Airy)' },
          { value: 'pink', label: 'Pink (Warm)' },
        ],
        defaultValue: 'pink',
      },
      { key: 'tone', label: 'Band Center', type: 'range', min: 200, max: 9000, step: 25, unit: 'Hz', scale: 'log', defaultValue: 2200 },
      { key: 'q', label: 'Focus Q', type: 'range', min: 0.4, max: 12, step: 0.1, unit: '', defaultValue: 1.8 },
      { key: 'gain', label: 'Level', type: 'range', min: 0, max: 1, step: 0.01, unit: '', defaultValue: 0.2 },
    ],
  },
  combFilter: {
    type: 'combFilter',
    label: 'Comb Filter',
    category: 'processor',
    description: 'Tuned delay-line comb filter modeling bow contact point notches and wooden air resonances.',
    acousticGuide:
      'Mixes a tiny delayed copy of the sound back onto itself, creating evenly spaced peaks and notches like the teeth of a comb—essential for acoustic chamber and string physics.',
    bowedTip:
      'Turn Pitch Lock ON with Feedforward mode and Ratio ~0.14 (1/7) to mimic a violin bow touching the string 1/7th of the way from the bridge, or use Feedback mode for hollow wood resonance.',
    ports: [
      { id: 'in', label: 'Audio In', direction: 'in', signal: 'audio' },
      { id: 'freq', label: 'Delay / Pitch CV', direction: 'in', signal: 'cv' },
      { id: 'fb', label: 'Feedback CV', direction: 'in', signal: 'cv' },
      { id: 'out', label: 'Audio Out', direction: 'out', signal: 'audio' },
    ],
    params: [
      {
        key: 'mode',
        label: 'Comb Mode',
        type: 'select',
        options: [
          { value: 'feedforward', label: 'Feedforward (Bow Notch)' },
          { value: 'feedback', label: 'Feedback (Resonant Body)' },
          { value: 'bipolar', label: 'Bipolar (Hollow Odd)' },
        ],
        defaultValue: 'feedback',
        tooltip: 'Feedforward carves natural bow-position notches; Feedback rings out resonant peaks; Bipolar emphasizes odd hollow harmonics.',
      },
      {
        key: 'keyTrack',
        label: 'Pitch Lock (Key Track)',
        type: 'toggle',
        defaultValue: true,
        tooltip: 'When ON, comb spacing automatically tracks the note you play so harmonic notches stay musical across the keyboard.',
      },
      {
        key: 'ratio',
        label: 'Harmonic Ratio',
        type: 'range',
        min: 0.05,
        max: 4.0,
        step: 0.01,
        unit: 'x',
        defaultValue: 0.15,
        tooltip: 'Used when Pitch Lock is ON. 0.14 matches bowing 1/7th from the bridge; 0.50 emphasizes octaves; 1.00 reinforces the fundamental.',
      },
      {
        key: 'delayMs',
        label: 'Fixed Delay',
        type: 'range',
        min: 0.4,
        max: 45,
        step: 0.1,
        unit: 'ms',
        scale: 'log',
        defaultValue: 4.5,
        tooltip: 'Used when Pitch Lock is OFF. Models a fixed wooden box or air chamber size (2–8 ms for violin/erhu bodies).',
      },
      {
        key: 'feedback',
        label: 'Resonance / Feedback',
        type: 'range',
        min: -0.92,
        max: 0.92,
        step: 0.01,
        unit: '',
        defaultValue: 0.56,
        tooltip: 'Controls how strongly the comb peaks ring. Negative values create a darker, hollow woody cavity tone.',
      },
      {
        key: 'damping',
        label: 'Air / Wood Damping',
        type: 'range',
        min: 0,
        max: 0.95,
        step: 0.01,
        unit: '',
        defaultValue: 0.42,
        tooltip: 'Softens sharp high-frequency ringing inside the comb loop, just like spruce and maple wood.',
      },
      {
        key: 'mix',
        label: 'Dry / Wet Mix',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.01,
        unit: '',
        defaultValue: 0.45,
      },
    ],
  },
  filter: {
    type: 'filter',
    label: 'Multimode Filter',
    category: 'processor',
    description: 'Resonant filter & acoustic body formant shaper with cutoff CV input.',
    acousticGuide:
      'Shapes brightness by cutting harsh highs (Lowpass) or focusing on a vocal resonance band (Bandpass / Formant Peak).',
    bowedTip:
      'Wire an Envelope or LFO into Cutoff CV so louder or sustained bow strokes open up upper harmonics dynamically.',
    ports: [
      { id: 'in', label: 'Audio In', direction: 'in', signal: 'audio' },
      { id: 'cutoff', label: 'Cutoff CV', direction: 'in', signal: 'cv' },
      { id: 'out', label: 'Audio Out', direction: 'out', signal: 'audio' },
    ],
    params: [
      {
        key: 'mode',
        label: 'Filter Type',
        type: 'select',
        options: [
          { value: 'lowpass', label: 'Lowpass' },
          { value: 'bandpass', label: 'Bandpass (Body)' },
          { value: 'highpass', label: 'Highpass' },
          { value: 'peaking', label: 'Formant Peak' },
          { value: 'notch', label: 'Notch' },
        ],
        defaultValue: 'lowpass',
      },
      { key: 'cutoff', label: 'Cutoff', type: 'range', min: 80, max: 16000, step: 10, unit: 'Hz', scale: 'log', defaultValue: 3200 },
      { key: 'resonance', label: 'Resonance Q', type: 'range', min: 0.3, max: 18, step: 0.1, unit: '', defaultValue: 2.2 },
      { key: 'keyTrack', label: 'Key Track', type: 'range', min: 0, max: 1, step: 0.05, unit: '', defaultValue: 0.35 },
      { key: 'gain', label: 'Peak Gain', type: 'range', min: -12, max: 18, step: 0.5, unit: 'dB', defaultValue: 6 },
    ],
  },
  parametricEq: {
    type: 'parametricEq',
    label: 'Parametric EQ',
    category: 'processor',
    description: '4-band precision acoustic equalizer for sculpting fixed wooden soundbox formants and air brilliance.',
    acousticGuide:
      'Unlike pitch-tracking filters, a real wooden instrument body has fixed resonant peaks (formants) that stay at the same frequencies no matter which note you play.',
    bowedTip:
      'Boost Band 1 (250–500 Hz) for warm cavity depth, boost Band 2 (1.6–3.0 kHz) for bridge/wood presence, and use High Shelf above 4.5 kHz to tame synthetic fizz.',
    ports: [
      { id: 'in', label: 'Audio In', direction: 'in', signal: 'audio' },
      { id: 'amp', label: 'Level CV', direction: 'in', signal: 'cv' },
      { id: 'out', label: 'Audio Out', direction: 'out', signal: 'audio' },
    ],
    params: [
      { key: 'lowFreq', label: 'Low Shelf Freq', type: 'range', min: 60, max: 500, step: 5, unit: 'Hz', scale: 'log', defaultValue: 180 },
      { key: 'lowGain', label: 'Low Shelf Gain', type: 'range', min: -15, max: 15, step: 0.5, unit: 'dB', defaultValue: 2.5 },
      { key: 'mid1Freq', label: 'Body Peak 1 Freq', type: 'range', min: 150, max: 1800, step: 10, unit: 'Hz', scale: 'log', defaultValue: 420, tooltip: 'Models the main air-cavity resonance (Helmholtz resonance ~280 Hz cello, ~450 Hz violin/erhu).' },
      { key: 'mid1Gain', label: 'Body Peak 1 Gain', type: 'range', min: -15, max: 15, step: 0.5, unit: 'dB', defaultValue: 5.0 },
      { key: 'mid1Q', label: 'Body Peak 1 Q', type: 'range', min: 0.4, max: 10, step: 0.1, unit: '', defaultValue: 2.2, tooltip: 'Controls how narrow or wide the resonance peak is.' },
      { key: 'mid2Freq', label: 'Bridge Peak 2 Freq', type: 'range', min: 700, max: 6500, step: 20, unit: 'Hz', scale: 'log', defaultValue: 2400, tooltip: 'Models the wooden bridge / "nasal" vocal formant (1.8–3.2 kHz for bowed strings).' },
      { key: 'mid2Gain', label: 'Bridge Peak 2 Gain', type: 'range', min: -15, max: 15, step: 0.5, unit: 'dB', defaultValue: 4.5 },
      { key: 'mid2Q', label: 'Bridge Peak 2 Q', type: 'range', min: 0.4, max: 10, step: 0.1, unit: '', defaultValue: 2.4 },
      { key: 'highFreq', label: 'Air Shelf Freq', type: 'range', min: 2200, max: 12000, step: 50, unit: 'Hz', scale: 'log', defaultValue: 5200 },
      { key: 'highGain', label: 'Air Shelf Gain', type: 'range', min: -15, max: 15, step: 0.5, unit: 'dB', defaultValue: -2.0, tooltip: 'Cut slightly (-2 to -6 dB) to smooth harsh digital highs; boost to bring out crisp rosin air.' },
      { key: 'outputGain', label: 'Output Trim', type: 'range', min: 0.2, max: 1.8, step: 0.02, unit: 'x', defaultValue: 1.0 },
    ],
  },
  shaper: {
    type: 'shaper',
    label: 'Warmth / Shaper',
    category: 'processor',
    description: 'Asymmetric harmonic saturation and acoustic wood-body warmth.',
    acousticGuide:
      'Gently rounds off sharp wave peaks to add warm even-order harmonics, similar to wooden soundboard saturation.',
    bowedTip:
      'Use light Drive (0.15–0.3) with Even Harmonics (0.2) after a Physical String to thicken thin notes.',
    ports: [
      { id: 'in', label: 'Audio In', direction: 'in', signal: 'audio' },
      { id: 'out', label: 'Audio Out', direction: 'out', signal: 'audio' },
    ],
    params: [
      { key: 'drive', label: 'Drive', type: 'range', min: 0, max: 1, step: 0.01, unit: '', defaultValue: 0.25 },
      { key: 'asymmetry', label: 'Even Harmonics', type: 'range', min: 0, max: 0.6, step: 0.01, unit: '', defaultValue: 0.15 },
      { key: 'mix', label: 'Mix', type: 'range', min: 0, max: 1, step: 0.01, unit: '', defaultValue: 0.6 },
    ],
  },
  chorus: {
    type: 'chorus',
    label: 'Stereo Ensemble',
    category: 'processor',
    description: 'Multi-tap BBD-style stereo chorus and string ensemble modulator for wide, shimmering motion.',
    acousticGuide:
      'Splits the signal across several gently drifting micro-delays panned left and right, turning dry tones into lush, breathing stereo soundscapes.',
    ports: [
      { id: 'in', label: 'Audio In', direction: 'in', signal: 'audio' },
      { id: 'rate', label: 'Rate CV', direction: 'in', signal: 'cv' },
      { id: 'depth', label: 'Depth CV', direction: 'in', signal: 'cv' },
      { id: 'out', label: 'Audio Out', direction: 'out', signal: 'audio' },
    ],
    params: [
      {
        key: 'voices',
        label: 'Ensemble Taps',
        type: 'select',
        options: [
          { value: '2', label: '2-Tap Classic Chorus' },
          { value: '4', label: '4-Tap Stereo Ensemble' },
          { value: '6', label: '6-Tap Deep Dimension' },
        ],
        defaultValue: '4',
      },
      { key: 'rate', label: 'Drift Rate', type: 'range', min: 0.04, max: 4.5, step: 0.02, unit: 'Hz', scale: 'log', defaultValue: 0.42 },
      { key: 'depth', label: 'Mod Depth', type: 'range', min: 0, max: 1, step: 0.01, unit: '', defaultValue: 0.55 },
      { key: 'stereoWidth', label: 'Stereo Width', type: 'range', min: 0, max: 1, step: 0.02, unit: '', defaultValue: 0.85 },
      { key: 'tone', label: 'Warmth Tone', type: 'range', min: 800, max: 12000, step: 50, unit: 'Hz', scale: 'log', defaultValue: 6400 },
      { key: 'mix', label: 'Dry / Wet Mix', type: 'range', min: 0, max: 1, step: 0.01, unit: '', defaultValue: 0.52 },
    ],
  },
  granularCloud: {
    type: 'granularCloud',
    label: 'Granular Cloud',
    category: 'processor',
    description: 'Real-time stereo granular micro-sampler with harmonic pitch shifting, time spray, and cloud freeze.',
    acousticGuide:
      'Captures incoming sound into a circular buffer and scatters dozens of overlapping, windowed micro-grains across pitch and stereo space—creating crystalline ambient mists.',
    ports: [
      { id: 'in', label: 'Audio In', direction: 'in', signal: 'audio' },
      { id: 'pitch', label: 'Pitch CV', direction: 'in', signal: 'cv' },
      { id: 'density', label: 'Density CV', direction: 'in', signal: 'cv' },
      { id: 'mix', label: 'Mix CV', direction: 'in', signal: 'cv' },
      { id: 'out', label: 'Audio Out', direction: 'out', signal: 'audio' },
    ],
    params: [
      { key: 'grainSize', label: 'Grain Size', type: 'range', min: 20, max: 450, step: 2, unit: 'ms', defaultValue: 165, tooltip: 'Duration of each windowed micro-grain. Longer grains feel silky; shorter grains sparkle.' },
      { key: 'density', label: 'Grain Density', type: 'range', min: 1, max: 24, step: 0.5, unit: '/s', defaultValue: 11, tooltip: 'How many overlapping grains spawn per second.' },
      { key: 'pitchShift', label: 'Cloud Pitch', type: 'range', min: -24, max: 24, step: 1, unit: 'st', defaultValue: 12, tooltip: 'Semitone shift of spawned grains (+12 = octave shimmer, +7 = fifth, -12 = sub).' },
      {
        key: 'pitchSnap',
        label: 'Pitch Mode',
        type: 'select',
        options: [
          { value: 'octFifth', label: 'Octave + Fifth Shimmer' },
          { value: 'octave', label: 'Octave Lock' },
          { value: 'free', label: 'Continuous Semitones' },
        ],
        defaultValue: 'octFifth',
        tooltip: 'Octave + Fifth alternates harmonic intervals across grains for orchestral shimmer.',
      },
      { key: 'spray', label: 'Time Spray', type: 'range', min: 0, max: 1, step: 0.01, unit: '', defaultValue: 0.45, tooltip: 'Randomizes where grains read from inside the buffer.' },
      { key: 'stereoScatter', label: 'Stereo Scatter', type: 'range', min: 0, max: 1, step: 0.01, unit: '', defaultValue: 0.78 },
      { key: 'feedback', label: 'Cloud Feedback', type: 'range', min: 0, max: 0.75, step: 0.01, unit: '', defaultValue: 0.25 },
      { key: 'freeze', label: 'Freeze Buffer', type: 'toggle', defaultValue: false, tooltip: 'Locks the current sound inside the granular buffer for an infinite evolving cloud.' },
      { key: 'mix', label: 'Dry / Wet Mix', type: 'range', min: 0, max: 1, step: 0.01, unit: '', defaultValue: 0.55 },
    ],
  },
  envelope: {
    type: 'envelope',
    label: 'ADSR Envelope',
    category: 'modulator',
    description: 'Shapes amplitude, filter sweeps, FM brightness, or multi-second ambient pad swells over each note.',
    acousticGuide:
      'Controls how a note fades in when pressed (Attack), settles (Decay/Sustain), and fades out when released (Release).',
    bowedTip:
      'Real bowed notes swell in over 0.08–0.18s; for lush ambient pads try 1.5–6.0s Attack and 3.0–10.0s Release.',
    ports: [
      { id: 'in', label: 'Audio In (VCA)', direction: 'in', signal: 'audio' },
      { id: 'amp', label: 'Amp CV', direction: 'in', signal: 'cv' },
      { id: 'out', label: 'Audio Out', direction: 'out', signal: 'audio' },
      { id: 'cv', label: 'Envelope CV', direction: 'out', signal: 'cv' },
    ],
    params: [
      { key: 'attack', label: 'Attack', type: 'range', min: 0.002, max: 12.0, step: 0.005, unit: 's', scale: 'log', defaultValue: 0.015 },
      { key: 'decay', label: 'Decay', type: 'range', min: 0.01, max: 12.0, step: 0.01, unit: 's', scale: 'log', defaultValue: 0.35 },
      { key: 'sustain', label: 'Sustain', type: 'range', min: 0, max: 1, step: 0.01, unit: '', defaultValue: 0.65 },
      { key: 'release', label: 'Release', type: 'range', min: 0.01, max: 16.0, step: 0.01, unit: 's', scale: 'log', defaultValue: 0.45 },
      {
        key: 'curve',
        label: 'Swell Curve',
        type: 'select',
        options: [
          { value: 'standard', label: 'Standard Linear' },
          { value: 'ambient', label: 'Ambient Slow Swell' },
        ],
        defaultValue: 'standard',
      },
      { key: 'velocitySens', label: 'Velocity Sens', type: 'range', min: 0, max: 1, step: 0.05, unit: '', defaultValue: 0.7 },
    ],
  },
  lfo: {
    type: 'lfo',
    label: 'LFO Modulator',
    category: 'modulator',
    description: 'Sub-audio & glacial ambient modulator with organic wander drift and delayed onset.',
    acousticGuide:
      'A slow, invisible wave used to animate other knobs automatically—pitch for vibrato, filter cutoff for breathing pads, or granular mix for evolving clouds.',
    bowedTip:
      'Use 5.0–5.8 Hz for expressive vibrato, or drop to 0.03–0.15 Hz with Organic Wander for glacial ambient drift.',
    ports: [
      { id: 'cv', label: 'Mod CV Out', direction: 'out', signal: 'cv' },
    ],
    params: [
      {
        key: 'waveform',
        label: 'Waveform',
        type: 'select',
        options: [
          { value: 'sine', label: 'Sine' },
          { value: 'triangle', label: 'Triangle' },
          { value: 'wander', label: 'Organic Wander' },
          { value: 'square', label: 'Square' },
          { value: 'sawtooth', label: 'Ramp' },
        ],
        defaultValue: 'sine',
      },
      { key: 'rate', label: 'Rate', type: 'range', min: 0.02, max: 24, step: 0.01, unit: 'Hz', scale: 'log', defaultValue: 5.2 },
      { key: 'depth', label: 'Depth', type: 'range', min: 0, max: 1, step: 0.01, unit: '', defaultValue: 0.35 },
      { key: 'delay', label: 'Onset Delay', type: 'range', min: 0, max: 6.0, step: 0.02, unit: 's', defaultValue: 0.18, tooltip: 'Waits briefly after a note begins before fading in vibrato or ambient drift.' },
    ],
  },
  delay: {
    type: 'delay',
    label: 'Stereo Delay',
    category: 'fx',
    description: 'Stereo ping-pong & tape-modulated feedback echo with low/high damping.',
    acousticGuide:
      'Repeats the sound across left and right stereo channels with optional analog tape pitch drift and warm filtering.',
    ports: [
      { id: 'in', label: 'Audio In', direction: 'in', signal: 'audio' },
      { id: 'out', label: 'Audio Out', direction: 'out', signal: 'audio' },
    ],
    params: [
      { key: 'time', label: 'Delay Time', type: 'range', min: 0.02, max: 2.0, step: 0.01, unit: 's', defaultValue: 0.26 },
      { key: 'feedback', label: 'Feedback', type: 'range', min: 0, max: 0.92, step: 0.01, unit: '', defaultValue: 0.32 },
      { key: 'pingPong', label: 'Ping-Pong Spread', type: 'range', min: 0, max: 1, step: 0.02, unit: '', defaultValue: 0.45, tooltip: 'Cross-pans echoes between left and right stereo channels.' },
      { key: 'modDepth', label: 'Tape Drift', type: 'range', min: 0, max: 1, step: 0.01, unit: '', defaultValue: 0.14, tooltip: 'Adds gentle analog tape wow and flutter to echo tails.' },
      { key: 'modRate', label: 'Drift Rate', type: 'range', min: 0.1, max: 4.5, step: 0.05, unit: 'Hz', defaultValue: 0.55 },
      { key: 'tone', label: 'Echo High Cut', type: 'range', min: 400, max: 10000, step: 50, unit: 'Hz', scale: 'log', defaultValue: 3400 },
      { key: 'highpass', label: 'Echo Low Cut', type: 'range', min: 40, max: 900, step: 10, unit: 'Hz', scale: 'log', defaultValue: 120, tooltip: 'Trims sub-bass buildup in long ambient feedback loops.' },
      { key: 'mix', label: 'Wet Mix', type: 'range', min: 0, max: 1, step: 0.01, unit: '', defaultValue: 0.22 },
    ],
  },
  reverb: {
    type: 'reverb',
    label: 'Shimmer & Hall Reverb',
    category: 'fx',
    description: 'Expansive acoustic hall & cathedral shimmer reverb with pitch-shifted recirculation and tail freeze.',
    acousticGuide:
      'Places instruments inside vast resonant halls or celestial shimmer tanks where octave and fifth harmonics bloom infinitely.',
    ports: [
      { id: 'in', label: 'Audio In', direction: 'in', signal: 'audio' },
      { id: 'out', label: 'Audio Out', direction: 'out', signal: 'audio' },
    ],
    params: [
      { key: 'size', label: 'Decay Size', type: 'range', min: 0.2, max: 14.0, step: 0.05, unit: 's', scale: 'log', defaultValue: 1.4 },
      { key: 'preDelay', label: 'Pre-Delay', type: 'range', min: 0, max: 250, step: 2, unit: 'ms', defaultValue: 16, tooltip: 'Brief gap before reverb blooms, preserving note clarity.' },
      { key: 'damping', label: 'Air Damping', type: 'range', min: 0.05, max: 1, step: 0.02, unit: '', defaultValue: 0.55 },
      { key: 'shimmerMix', label: 'Shimmer Intensity', type: 'range', min: 0, max: 1, step: 0.01, unit: '', defaultValue: 0, tooltip: 'Feeds pitch-shifted harmonics back into the reverb tail for ethereal shimmer.' },
      {
        key: 'shimmerPitch',
        label: 'Shimmer Interval',
        type: 'select',
        options: [
          { value: '12', label: '+12 st (Octave Up)' },
          { value: '7', label: '+7 st (Fifth Up)' },
          { value: '24', label: '+24 st (Double Octave)' },
          { value: '-12', label: '-12 st (Sub Octave)' },
        ],
        defaultValue: '12',
      },
      { key: 'modulation', label: 'Tail Drift', type: 'range', min: 0, max: 1, step: 0.02, unit: '', defaultValue: 0.25 },
      { key: 'freeze', label: 'Freeze Tail', type: 'toggle', defaultValue: false, tooltip: 'Holds the current reverb wash indefinitely as a harmonic drone bed.' },
      { key: 'mix', label: 'Wet Mix', type: 'range', min: 0, max: 1, step: 0.01, unit: '', defaultValue: 0.28 },
    ],
  },
  output: {
    type: 'output',
    label: 'Master Output',
    category: 'io',
    description: 'Stereo output bus feeding the hardware speakers and waveform analyzers.',
    ports: [
      { id: 'in', label: 'Audio In', direction: 'in', signal: 'audio' },
    ],
    params: [
      { key: 'gain', label: 'Master Gain', type: 'range', min: 0, max: 1.5, step: 0.01, unit: '', defaultValue: 0.82 },
      { key: 'pan', label: 'Stereo Pan', type: 'range', min: -1, max: 1, step: 0.02, unit: '', defaultValue: 0 },
    ],
  },
};

export function createDefaultNode(type: ModuleType, id: string, position: { x: number; y: number }): SynthNode {
  const def = MODULE_REGISTRY[type];
  const params: Record<string, number | string | boolean> = {};
  for (const p of def.params) {
    params[p.key] = p.defaultValue;
  }
  return {
    id,
    type,
    label: def.label,
    position,
    params,
  };
}
