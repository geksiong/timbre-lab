import { ModMatrixSlot, PresetCategory, SynthConnection, SynthNode, SynthPatch } from '../engine/types';

interface GmDef {
  program: number;
  name: string;
  family: string;
  category: PresetCategory;
  archetype:
    | 'piano'
    | 'epiano'
    | 'harpsi'
    | 'bell'
    | 'organ'
    | 'guitar'
    | 'eguitar'
    | 'bass'
    | 'synthbass'
    | 'bowed'
    | 'pizz'
    | 'pad'
    | 'brass'
    | 'reed'
    | 'pipe'
    | 'lead'
    | 'fx'
    | 'ethnic-pluck'
    | 'ethnic-wind'
    | 'perc'
    | 'sfx';
  cutoff?: number;
  ratio?: number;
  modIndex?: number;
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
  waveform?: string;
  detune?: number;
  lfoDepth?: number;
  reverbMix?: number;
}

const GM_DEFINITIONS: GmDef[] = [
  // 0-7 Piano
  { program: 0, name: 'Acoustic Grand Piano', family: 'Piano', category: 'gm-piano', archetype: 'piano', cutoff: 3800, ratio: 2.0, modIndex: 180, decay: 1.4, sustain: 0.08, release: 0.45 },
  { program: 1, name: 'Bright Acoustic Piano', family: 'Piano', category: 'gm-piano', archetype: 'piano', cutoff: 5800, ratio: 2.0, modIndex: 280, decay: 1.3, sustain: 0.08, release: 0.4 },
  { program: 2, name: 'Electric Grand Piano', family: 'Piano', category: 'gm-piano', archetype: 'epiano', cutoff: 4200, ratio: 1.0, modIndex: 220, decay: 1.2, sustain: 0.14, release: 0.42 },
  { program: 3, name: 'Honky-Tonk Piano', family: 'Piano', category: 'gm-piano', archetype: 'piano', cutoff: 4400, ratio: 2.01, modIndex: 260, detune: 14, decay: 1.25, sustain: 0.1 },
  { program: 4, name: 'Electric Piano 1 (Rhodes)', family: 'Piano', category: 'gm-piano', archetype: 'epiano', cutoff: 3200, ratio: 1.0, modIndex: 165, decay: 1.5, sustain: 0.16, lfoDepth: 0.08 },
  { program: 5, name: 'Electric Piano 2 (FM Tine)', family: 'Piano', category: 'gm-piano', archetype: 'epiano', cutoff: 4800, ratio: 14.0, modIndex: 240, decay: 1.35, sustain: 0.12 },
  { program: 6, name: 'Harpsichord', family: 'Piano', category: 'gm-piano', archetype: 'harpsi', cutoff: 6400, decay: 0.85, sustain: 0.05, release: 0.18 },
  { program: 7, name: 'Clavinet', family: 'Piano', category: 'gm-piano', archetype: 'harpsi', cutoff: 5200, decay: 0.55, sustain: 0.06, release: 0.15 },

  // 8-15 Chromatic Percussion
  { program: 8, name: 'Celesta', family: 'Chromatic Percussion', category: 'gm-chromatic', archetype: 'bell', ratio: 3.0, modIndex: 110, decay: 0.9, sustain: 0.03 },
  { program: 9, name: 'Glockenspiel', family: 'Chromatic Percussion', category: 'gm-chromatic', archetype: 'bell', ratio: 2.75, modIndex: 320, decay: 0.75, sustain: 0.01 },
  { program: 10, name: 'Music Box', family: 'Chromatic Percussion', category: 'gm-chromatic', archetype: 'bell', ratio: 4.0, modIndex: 190, decay: 0.8, sustain: 0.02 },
  { program: 11, name: 'Vibraphone', family: 'Chromatic Percussion', category: 'gm-chromatic', archetype: 'bell', ratio: 4.0, modIndex: 95, decay: 1.6, sustain: 0.05, lfoDepth: 0.15 },
  { program: 12, name: 'Marimba', family: 'Chromatic Percussion', category: 'gm-chromatic', archetype: 'bell', ratio: 4.0, modIndex: 75, decay: 0.35, sustain: 0.01 },
  { program: 13, name: 'Xylophone', family: 'Chromatic Percussion', category: 'gm-chromatic', archetype: 'bell', ratio: 3.0, modIndex: 150, decay: 0.25, sustain: 0.01 },
  { program: 14, name: 'Tubular Bells', family: 'Chromatic Percussion', category: 'gm-chromatic', archetype: 'bell', ratio: 1.414, modIndex: 420, decay: 2.4, sustain: 0.05 },
  { program: 15, name: 'Dulcimer', family: 'Chromatic Percussion', category: 'gm-chromatic', archetype: 'ethnic-pluck', cutoff: 4800, decay: 1.2 },

  // 16-23 Organ
  { program: 16, name: 'Drawbar Organ', family: 'Organ', category: 'gm-organ', archetype: 'organ', cutoff: 4200, lfoDepth: 0.08 },
  { program: 17, name: 'Percussive Organ', family: 'Organ', category: 'gm-organ', archetype: 'organ', cutoff: 5000, decay: 0.2, sustain: 0.72 },
  { program: 18, name: 'Rock Organ', family: 'Organ', category: 'gm-organ', archetype: 'organ', cutoff: 4600, detune: 8 },
  { program: 19, name: 'Church Organ', family: 'Organ', category: 'gm-organ', archetype: 'organ', cutoff: 3400, attack: 0.05, release: 0.65, reverbMix: 0.45 },
  { program: 20, name: 'Reed Organ', family: 'Organ', category: 'gm-organ', archetype: 'organ', waveform: 'reed', cutoff: 2600, attack: 0.04 },
  { program: 21, name: 'Accordion', family: 'Organ', category: 'gm-organ', archetype: 'organ', waveform: 'reed', cutoff: 3200, detune: 10 },
  { program: 22, name: 'Harmonica', family: 'Organ', category: 'gm-organ', archetype: 'reed', cutoff: 2900, lfoDepth: 0.14 },
  { program: 23, name: 'Tango Accordion', family: 'Organ', category: 'gm-organ', archetype: 'organ', waveform: 'reed', cutoff: 3600, detune: 12 },

  // 24-31 Guitar
  { program: 24, name: 'Acoustic Guitar (Nylon)', family: 'Guitar', category: 'gm-guitar', archetype: 'guitar', cutoff: 2800, decay: 1.1 },
  { program: 25, name: 'Acoustic Guitar (Steel)', family: 'Guitar', category: 'gm-guitar', archetype: 'guitar', cutoff: 4600, decay: 1.3 },
  { program: 26, name: 'Electric Guitar (Jazz)', family: 'Guitar', category: 'gm-guitar', archetype: 'guitar', cutoff: 2100, decay: 1.25 },
  { program: 27, name: 'Electric Guitar (Clean)', family: 'Guitar', category: 'gm-guitar', archetype: 'guitar', cutoff: 4200, decay: 1.2 },
  { program: 28, name: 'Electric Guitar (Muted)', family: 'Guitar', category: 'gm-guitar', archetype: 'guitar', cutoff: 1800, decay: 0.25 },
  { program: 29, name: 'Overdriven Guitar', family: 'Guitar', category: 'gm-guitar', archetype: 'eguitar', cutoff: 3200, sustain: 0.45 },
  { program: 30, name: 'Distortion Guitar', family: 'Guitar', category: 'gm-guitar', archetype: 'eguitar', cutoff: 3600, sustain: 0.6 },
  { program: 31, name: 'Guitar Harmonics', family: 'Guitar', category: 'gm-guitar', archetype: 'bell', ratio: 2.0, modIndex: 90, decay: 1.4, sustain: 0.04 },

  // 32-39 Bass
  { program: 32, name: 'Acoustic Bass', family: 'Bass', category: 'gm-bass', archetype: 'bass', cutoff: 1100, decay: 0.65, sustain: 0.12 },
  { program: 33, name: 'Electric Bass (Finger)', family: 'Bass', category: 'gm-bass', archetype: 'bass', cutoff: 1400, decay: 0.7, sustain: 0.22 },
  { program: 34, name: 'Electric Bass (Pick)', family: 'Bass', category: 'gm-bass', archetype: 'bass', cutoff: 2200, decay: 0.65, sustain: 0.18 },
  { program: 35, name: 'Fretless Bass', family: 'Bass', category: 'gm-bass', archetype: 'bass', cutoff: 1650, attack: 0.025, sustain: 0.35, lfoDepth: 0.08 },
  { program: 36, name: 'Slap Bass 1', family: 'Bass', category: 'gm-bass', archetype: 'synthbass', ratio: 2.0, modIndex: 440, cutoff: 2800, decay: 0.35 },
  { program: 37, name: 'Slap Bass 2', family: 'Bass', category: 'gm-bass', archetype: 'synthbass', ratio: 3.0, modIndex: 520, cutoff: 3200, decay: 0.3 },
  { program: 38, name: 'Synth Bass 1', family: 'Bass', category: 'gm-bass', archetype: 'synthbass', cutoff: 1600, modIndex: 220, decay: 0.4 },
  { program: 39, name: 'Synth Bass 2', family: 'Bass', category: 'gm-bass', archetype: 'synthbass', cutoff: 2400, modIndex: 360, decay: 0.32 },

  // 40-47 Strings
  { program: 40, name: 'Violin', family: 'Strings', category: 'gm-strings', archetype: 'bowed', cutoff: 3200, attack: 0.11, lfoDepth: 0.14 },
  { program: 41, name: 'Viola', family: 'Strings', category: 'gm-strings', archetype: 'bowed', cutoff: 2300, attack: 0.13, lfoDepth: 0.12 },
  { program: 42, name: 'Cello', family: 'Strings', category: 'gm-strings', archetype: 'bowed', cutoff: 1750, attack: 0.14, lfoDepth: 0.11 },
  { program: 43, name: 'Contrabass', family: 'Strings', category: 'gm-strings', archetype: 'bowed', cutoff: 1100, attack: 0.16, lfoDepth: 0.08 },
  { program: 44, name: 'Tremolo Strings', family: 'Strings', category: 'gm-strings', archetype: 'bowed', cutoff: 3000, attack: 0.08, lfoDepth: 0.28 },
  { program: 45, name: 'Pizzicato Strings', family: 'Strings', category: 'gm-strings', archetype: 'pizz', cutoff: 2200, decay: 0.32 },
  { program: 46, name: 'Orchestral Harp', family: 'Strings', category: 'gm-strings', archetype: 'ethnic-pluck', cutoff: 4400, decay: 1.5 },
  { program: 47, name: 'Timpani', family: 'Strings', category: 'gm-strings', archetype: 'perc', cutoff: 780, decay: 0.85 },

  // 48-55 Ensemble
  { program: 48, name: 'String Ensemble 1', family: 'Ensemble', category: 'gm-ensemble', archetype: 'pad', waveform: 'strings', cutoff: 3400, attack: 0.25, detune: 12 },
  { program: 49, name: 'String Ensemble 2', family: 'Ensemble', category: 'gm-ensemble', archetype: 'pad', waveform: 'strings', cutoff: 2400, attack: 0.42, detune: 16 },
  { program: 50, name: 'Synth Strings 1', family: 'Ensemble', category: 'gm-ensemble', archetype: 'pad', waveform: 'sawtooth', cutoff: 3800, attack: 0.18, detune: 14 },
  { program: 51, name: 'Synth Strings 2', family: 'Ensemble', category: 'gm-ensemble', archetype: 'pad', waveform: 'sawtooth', cutoff: 2800, attack: 0.35, detune: 18 },
  { program: 52, name: 'Choir Aahs', family: 'Ensemble', category: 'gm-ensemble', archetype: 'pad', waveform: 'reed', cutoff: 1600, attack: 0.32, reverbMix: 0.4 },
  { program: 53, name: 'Voice Oohs', family: 'Ensemble', category: 'gm-ensemble', archetype: 'pad', waveform: 'triangle', cutoff: 1200, attack: 0.28, reverbMix: 0.4 },
  { program: 54, name: 'Synth Voice', family: 'Ensemble', category: 'gm-ensemble', archetype: 'pad', waveform: 'sawtooth', cutoff: 1900, attack: 0.22 },
  { program: 55, name: 'Orchestra Hit', family: 'Ensemble', category: 'gm-ensemble', archetype: 'brass', cutoff: 5200, attack: 0.005, decay: 0.38, sustain: 0.05 },

  // 56-63 Brass
  { program: 56, name: 'Trumpet', family: 'Brass', category: 'gm-brass', archetype: 'brass', cutoff: 3600, attack: 0.035, lfoDepth: 0.09 },
  { program: 57, name: 'Trombone', family: 'Brass', category: 'gm-brass', archetype: 'brass', cutoff: 2200, attack: 0.05, lfoDepth: 0.08 },
  { program: 58, name: 'Tuba', family: 'Brass', category: 'gm-brass', archetype: 'brass', cutoff: 1150, attack: 0.07 },
  { program: 59, name: 'Muted Trumpet', family: 'Brass', category: 'gm-brass', archetype: 'brass', cutoff: 2800, attack: 0.03 },
  { program: 60, name: 'French Horn', family: 'Brass', category: 'gm-brass', archetype: 'brass', cutoff: 1850, attack: 0.085, reverbMix: 0.32 },
  { program: 61, name: 'Brass Section', family: 'Brass', category: 'gm-brass', archetype: 'brass', cutoff: 3900, attack: 0.045, detune: 11 },
  { program: 62, name: 'Synth Brass 1', family: 'Brass', category: 'gm-brass', archetype: 'brass', cutoff: 4400, attack: 0.025, detune: 14 },
  { program: 63, name: 'Synth Brass 2', family: 'Brass', category: 'gm-brass', archetype: 'brass', cutoff: 3400, attack: 0.055, detune: 18 },

  // 64-71 Reed
  { program: 64, name: 'Soprano Sax', family: 'Reed', category: 'gm-reed', archetype: 'reed', cutoff: 3400, lfoDepth: 0.12 },
  { program: 65, name: 'Alto Sax', family: 'Reed', category: 'gm-reed', archetype: 'reed', cutoff: 2600, lfoDepth: 0.13 },
  { program: 66, name: 'Tenor Sax', family: 'Reed', category: 'gm-reed', archetype: 'reed', cutoff: 2100, lfoDepth: 0.11 },
  { program: 67, name: 'Baritone Sax', family: 'Reed', category: 'gm-reed', archetype: 'reed', cutoff: 1500, lfoDepth: 0.08 },
  { program: 68, name: 'Oboe', family: 'Reed', category: 'gm-reed', archetype: 'reed', cutoff: 2900, attack: 0.04, lfoDepth: 0.1 },
  { program: 69, name: 'English Horn', family: 'Reed', category: 'gm-reed', archetype: 'reed', cutoff: 2100, attack: 0.05 },
  { program: 70, name: 'Bassoon', family: 'Reed', category: 'gm-reed', archetype: 'reed', cutoff: 1400, attack: 0.05 },
  { program: 71, name: 'Clarinet', family: 'Reed', category: 'gm-reed', archetype: 'reed', waveform: 'square', cutoff: 2300, attack: 0.04 },

  // 72-79 Pipe
  { program: 72, name: 'Piccolo', family: 'Pipe', category: 'gm-pipe', archetype: 'pipe', cutoff: 5600, lfoDepth: 0.12 },
  { program: 73, name: 'Flute', family: 'Pipe', category: 'gm-pipe', archetype: 'pipe', cutoff: 3600, lfoDepth: 0.12 },
  { program: 74, name: 'Recorder', family: 'Pipe', category: 'gm-pipe', archetype: 'pipe', cutoff: 2800, lfoDepth: 0.08 },
  { program: 75, name: 'Pan Flute', family: 'Pipe', category: 'gm-pipe', archetype: 'pipe', cutoff: 3100, attack: 0.06 },
  { program: 76, name: 'Blown Bottle', family: 'Pipe', category: 'gm-pipe', archetype: 'pipe', cutoff: 2200, attack: 0.09 },
  { program: 77, name: 'Shakuhachi', family: 'Pipe', category: 'gm-pipe', archetype: 'ethnic-wind', cutoff: 2600 },
  { program: 78, name: 'Whistle', family: 'Pipe', category: 'gm-pipe', archetype: 'pipe', cutoff: 4500, lfoDepth: 0.1 },
  { program: 79, name: 'Ocarina', family: 'Pipe', category: 'gm-pipe', archetype: 'pipe', cutoff: 2000, lfoDepth: 0.07 },

  // 80-87 Synth Lead
  { program: 80, name: 'Lead 1 (Square)', family: 'Synth Lead', category: 'gm-synth-lead', archetype: 'lead', waveform: 'square', cutoff: 4200 },
  { program: 81, name: 'Lead 2 (Sawtooth)', family: 'Synth Lead', category: 'gm-synth-lead', archetype: 'lead', waveform: 'sawtooth', cutoff: 4800, detune: 10 },
  { program: 82, name: 'Lead 3 (Calliope)', family: 'Synth Lead', category: 'gm-synth-lead', archetype: 'pipe', cutoff: 3900 },
  { program: 83, name: 'Lead 4 (Chiff)', family: 'Synth Lead', category: 'gm-synth-lead', archetype: 'lead', waveform: 'triangle', cutoff: 3600 },
  { program: 84, name: 'Lead 5 (Charang)', family: 'Synth Lead', category: 'gm-synth-lead', archetype: 'eguitar', cutoff: 4200, sustain: 0.72 },
  { program: 85, name: 'Lead 6 (Voice)', family: 'Synth Lead', category: 'gm-synth-lead', archetype: 'lead', waveform: 'reed', cutoff: 2200 },
  { program: 86, name: 'Lead 7 (Fifths)', family: 'Synth Lead', category: 'gm-synth-lead', archetype: 'lead', waveform: 'sawtooth', cutoff: 4100, detune: 15 },
  { program: 87, name: 'Lead 8 (Bass + Lead)', family: 'Synth Lead', category: 'gm-synth-lead', archetype: 'lead', waveform: 'sawtooth', cutoff: 3500 },

  // 88-95 Synth Pad
  { program: 88, name: 'Pad 1 (New Age)', family: 'Synth Pad', category: 'gm-synth-pad', archetype: 'pad', waveform: 'triangle', cutoff: 3200, attack: 0.35, reverbMix: 0.45 },
  { program: 89, name: 'Pad 2 (Warm)', family: 'Synth Pad', category: 'gm-synth-pad', archetype: 'pad', waveform: 'sawtooth', cutoff: 1800, attack: 0.45, detune: 14 },
  { program: 90, name: 'Pad 3 (Polysynth)', family: 'Synth Pad', category: 'gm-synth-pad', archetype: 'pad', waveform: 'sawtooth', cutoff: 3600, attack: 0.16, detune: 16 },
  { program: 91, name: 'Pad 4 (Choir)', family: 'Synth Pad', category: 'gm-synth-pad', archetype: 'pad', waveform: 'reed', cutoff: 1900, attack: 0.38 },
  { program: 92, name: 'Pad 5 (Bowed)', family: 'Synth Pad', category: 'gm-synth-pad', archetype: 'pad', waveform: 'strings', cutoff: 2600, attack: 0.55 },
  { program: 93, name: 'Pad 6 (Metallic)', family: 'Synth Pad', category: 'gm-synth-pad', archetype: 'fx', ratio: 2.75, modIndex: 210, attack: 0.4 },
  { program: 94, name: 'Pad 7 (Halo)', family: 'Synth Pad', category: 'gm-synth-pad', archetype: 'pad', waveform: 'sine', cutoff: 2800, attack: 0.5, reverbMix: 0.5 },
  { program: 95, name: 'Pad 8 (Sweep)', family: 'Synth Pad', category: 'gm-synth-pad', archetype: 'pad', waveform: 'sawtooth', cutoff: 2400, attack: 0.65, lfoDepth: 0.32 },

  // 96-103 Synth Effects
  { program: 96, name: 'FX 1 (Rain)', family: 'Synth Effects', category: 'gm-synth-fx', archetype: 'fx', ratio: 3.14, modIndex: 350, decay: 1.5, reverbMix: 0.5 },
  { program: 97, name: 'FX 2 (Soundtrack)', family: 'Synth Effects', category: 'gm-synth-fx', archetype: 'pad', waveform: 'sawtooth', cutoff: 2100, attack: 0.45, detune: 22 },
  { program: 98, name: 'FX 3 (Crystal)', family: 'Synth Effects', category: 'gm-synth-fx', archetype: 'bell', ratio: 4.5, modIndex: 260, decay: 1.6 },
  { program: 99, name: 'FX 4 (Atmosphere)', family: 'Synth Effects', category: 'gm-synth-fx', archetype: 'fx', ratio: 1.5, modIndex: 190, attack: 0.25 },
  { program: 100, name: 'FX 5 (Brightness)', family: 'Synth Effects', category: 'gm-synth-fx', archetype: 'bell', ratio: 2.0, modIndex: 380, decay: 1.2 },
  { program: 101, name: 'FX 6 (Goblins)', family: 'Synth Effects', category: 'gm-synth-fx', archetype: 'fx', ratio: 1.41, modIndex: 480, attack: 0.3 },
  { program: 102, name: 'FX 7 (Echoes)', family: 'Synth Effects', category: 'gm-synth-fx', archetype: 'pad', waveform: 'triangle', cutoff: 2600, attack: 0.35, reverbMix: 0.52 },
  { program: 103, name: 'FX 8 (Sci-Fi)', family: 'Synth Effects', category: 'gm-synth-fx', archetype: 'fx', ratio: 5.25, modIndex: 550, decay: 1.4 },

  // 104-111 Ethnic
  { program: 104, name: 'Sitar', family: 'Ethnic (GM)', category: 'gm-ethnic', archetype: 'ethnic-pluck', cutoff: 3400, decay: 1.5 },
  { program: 105, name: 'Banjo', family: 'Ethnic (GM)', category: 'gm-ethnic', archetype: 'ethnic-pluck', cutoff: 4800, decay: 0.55 },
  { program: 106, name: 'Shamisen', family: 'Ethnic (GM)', category: 'gm-ethnic', archetype: 'ethnic-pluck', cutoff: 3200, decay: 0.45 },
  { program: 107, name: 'Koto', family: 'Ethnic (GM)', category: 'gm-ethnic', archetype: 'ethnic-pluck', cutoff: 4200, decay: 1.2 },
  { program: 108, name: 'Kalimba', family: 'Ethnic (GM)', category: 'gm-ethnic', archetype: 'bell', ratio: 2.75, modIndex: 180, decay: 0.7 },
  { program: 109, name: 'Bagpipe', family: 'Ethnic (GM)', category: 'gm-ethnic', archetype: 'reed', cutoff: 1500, attack: 0.04 },
  { program: 110, name: 'Fiddle', family: 'Ethnic (GM)', category: 'gm-ethnic', archetype: 'bowed', cutoff: 3100, attack: 0.09, lfoDepth: 0.15 },
  { program: 111, name: 'Shanai', family: 'Ethnic (GM)', category: 'gm-ethnic', archetype: 'reed', cutoff: 2200, attack: 0.03, lfoDepth: 0.14 },

  // 112-119 Percussive
  { program: 112, name: 'Tinkle Bell', family: 'Percussive', category: 'gm-percussion', archetype: 'bell', ratio: 3.5, modIndex: 310, decay: 0.55, sustain: 0.01 },
  { program: 113, name: 'Agogo', family: 'Percussive', category: 'gm-percussion', archetype: 'bell', ratio: 2.4, modIndex: 280, decay: 0.35, sustain: 0.01 },
  { program: 114, name: 'Steel Drums', family: 'Percussive', category: 'gm-percussion', archetype: 'bell', ratio: 2.0, modIndex: 300, decay: 0.62, sustain: 0.04 },
  { program: 115, name: 'Woodblock', family: 'Percussive', category: 'gm-percussion', archetype: 'perc', cutoff: 2400, decay: 0.12 },
  { program: 116, name: 'Taiko Drum', family: 'Percussive', category: 'gm-percussion', archetype: 'perc', cutoff: 420, decay: 0.72 },
  { program: 117, name: 'Melodic Tom', family: 'Percussive', category: 'gm-percussion', archetype: 'perc', cutoff: 650, decay: 0.45 },
  { program: 118, name: 'Synth Drum', family: 'Percussive', category: 'gm-percussion', archetype: 'perc', cutoff: 1400, decay: 0.35 },
  { program: 119, name: 'Reverse Cymbal', family: 'Percussive', category: 'gm-percussion', archetype: 'sfx', attack: 0.85, decay: 0.25 },

  // 120-127 Sound Effects
  { program: 120, name: 'Guitar Fret Noise', family: 'Sound Effects', category: 'gm-sfx', archetype: 'sfx', cutoff: 3200, decay: 0.18 },
  { program: 121, name: 'Breath Noise', family: 'Sound Effects', category: 'gm-sfx', archetype: 'sfx', cutoff: 2200, decay: 0.45 },
  { program: 122, name: 'Seashore', family: 'Sound Effects', category: 'gm-sfx', archetype: 'sfx', cutoff: 1100, attack: 0.6, decay: 1.8 },
  { program: 123, name: 'Bird Tweet', family: 'Sound Effects', category: 'gm-sfx', archetype: 'fx', ratio: 1.5, modIndex: 620, decay: 0.28 },
  { program: 124, name: 'Telephone Ring', family: 'Sound Effects', category: 'gm-sfx', archetype: 'fx', ratio: 1.25, modIndex: 420, decay: 0.6, lfoDepth: 0.35 },
  { program: 125, name: 'Helicopter', family: 'Sound Effects', category: 'gm-sfx', archetype: 'sfx', cutoff: 600, lfoDepth: 0.5, decay: 1.2 },
  { program: 126, name: 'Applause', family: 'Sound Effects', category: 'gm-sfx', archetype: 'sfx', cutoff: 2600, attack: 0.2, decay: 1.5 },
  { program: 127, name: 'Gunshot', family: 'Sound Effects', category: 'gm-sfx', archetype: 'sfx', cutoff: 1800, attack: 0.002, decay: 0.42 },
];

function buildGmPatch(def: GmDef): SynthPatch {
  const nodes: SynthNode[] = [];
  const connections: SynthConnection[] = [];
  const modMatrix: ModMatrixSlot[] = [];

  const revMix = def.reverbMix ?? 0.22;
  const cutoff = def.cutoff ?? 3200;
  const attack = def.attack ?? 0.01;
  const decay = def.decay ?? 0.6;
  const sustain = def.sustain ?? 0.55;
  const release = def.release ?? 0.35;

  if (def.archetype === 'piano' || def.archetype === 'epiano' || def.archetype === 'bell' || def.archetype === 'fx') {
    nodes.push(
      {
        id: 'fm1',
        type: 'fmOperator',
        label: def.archetype === 'bell' ? 'FM Bell Core' : 'FM Harmonic Core',
        position: { x: 60, y: 90 },
        params: {
          carrierWave: 'sine',
          modWave: 'sine',
          octave: 0,
          ratio: def.ratio ?? 2.0,
          modIndex: def.modIndex ?? 220,
          feedback: def.archetype === 'piano' ? 0.18 : 0.08,
          gain: 0.8,
        },
      },
      {
        id: 'flt1',
        type: 'filter',
        label: 'Tone Filter',
        position: { x: 350, y: 110 },
        params: { mode: 'lowpass', cutoff, resonance: 1.4, keyTrack: 0.45, gain: 4 },
      },
      {
        id: 'env1',
        type: 'envelope',
        label: 'Amp & Index Env',
        position: { x: 620, y: 110 },
        params: { attack, decay, sustain: def.sustain ?? 0.08, release, velocitySens: 0.85 },
      },
      {
        id: 'rev1',
        type: 'reverb',
        label: 'Chamber Reverb',
        position: { x: 890, y: 110 },
        params: { size: 1.5, damping: 0.5, mix: revMix },
      },
      {
        id: 'out1',
        type: 'output',
        label: 'Master Output',
        position: { x: 1160, y: 110 },
        params: { gain: 0.9, pan: 0 },
      }
    );
    connections.push(
      { id: 'c1', fromNode: 'fm1', fromPort: 'out', toNode: 'flt1', toPort: 'in', amount: 1 },
      { id: 'c2', fromNode: 'env1', fromPort: 'cv', toNode: 'fm1', toPort: 'index', amount: 0.42 },
      { id: 'c3', fromNode: 'flt1', fromPort: 'out', toNode: 'env1', toPort: 'in', amount: 1 },
      { id: 'c4', fromNode: 'env1', fromPort: 'out', toNode: 'rev1', toPort: 'in', amount: 1 },
      { id: 'c5', fromNode: 'rev1', fromPort: 'out', toNode: 'out1', toPort: 'in', amount: 1 }
    );
    if (def.lfoDepth) {
      nodes.push({
        id: 'lfo1',
        type: 'lfo',
        label: 'Tremolo / Vibrato',
        position: { x: 60, y: 310 },
        params: { waveform: 'sine', rate: 5.0, depth: def.lfoDepth, delay: 0.1 },
      });
      connections.push({ id: 'c6', fromNode: 'lfo1', fromPort: 'cv', toNode: 'fm1', toPort: 'amp', amount: 0.35 });
    }
  } else if (def.archetype === 'guitar' || def.archetype === 'harpsi' || def.archetype === 'ethnic-pluck' || def.archetype === 'pizz') {
    nodes.push(
      {
        id: 'str1',
        type: 'physicalString',
        label: 'Plucked Waveguide',
        position: { x: 60, y: 95 },
        params: {
          excitation: 'pluck',
          octave: 0,
          damping: def.archetype === 'pizz' ? 0.68 : 0.42,
          decay: def.archetype === 'pizz' ? 0.955 : 0.986,
          brightness: def.archetype === 'harpsi' ? 0.94 : 0.76,
          sympathetic: def.program === 104 ? 0.65 : 0.04,
          gain: 0.92,
        },
      },
      {
        id: 'flt1',
        type: 'filter',
        label: 'Body Resonance',
        position: { x: 350, y: 110 },
        params: { mode: 'lowpass', cutoff, resonance: 1.8, keyTrack: 0.45, gain: 5 },
      },
      {
        id: 'env1',
        type: 'envelope',
        label: 'Pluck Decay',
        position: { x: 620, y: 110 },
        params: { attack: 0.003, decay, sustain: def.sustain ?? 0.06, release: 0.35, velocitySens: 0.8 },
      },
      {
        id: 'rev1',
        type: 'reverb',
        label: 'Room Ambience',
        position: { x: 890, y: 110 },
        params: { size: 1.35, damping: 0.55, mix: revMix },
      },
      {
        id: 'out1',
        type: 'output',
        label: 'Master Output',
        position: { x: 1160, y: 110 },
        params: { gain: 0.9, pan: 0 },
      }
    );
    connections.push(
      { id: 'c1', fromNode: 'str1', fromPort: 'out', toNode: 'flt1', toPort: 'in', amount: 1 },
      { id: 'c2', fromNode: 'flt1', fromPort: 'out', toNode: 'env1', toPort: 'in', amount: 1 },
      { id: 'c3', fromNode: 'env1', fromPort: 'out', toNode: 'rev1', toPort: 'in', amount: 1 },
      { id: 'c4', fromNode: 'rev1', fromPort: 'out', toNode: 'out1', toPort: 'in', amount: 1 }
    );
  } else if (def.archetype === 'sfx') {
    nodes.push(
      {
        id: 'noise1',
        type: 'noise',
        label: 'FX Noise Source',
        position: { x: 60, y: 100 },
        params: { color: 'pink', tone: cutoff, q: 2.2, gain: 0.65 },
      },
      {
        id: 'lfo1',
        type: 'lfo',
        label: 'Sweep LFO',
        position: { x: 60, y: 290 },
        params: { waveform: 'sine', rate: def.program === 125 ? 11 : 0.45, depth: def.lfoDepth ?? 0.35, delay: 0 },
      },
      {
        id: 'flt1',
        type: 'filter',
        label: 'Resonant Sweeper',
        position: { x: 350, y: 110 },
        params: { mode: 'bandpass', cutoff, resonance: 3.4, keyTrack: 0.25, gain: 6 },
      },
      {
        id: 'env1',
        type: 'envelope',
        label: 'Contour Env',
        position: { x: 620, y: 110 },
        params: { attack, decay, sustain: 0.3, release: 0.4, velocitySens: 0.7 },
      },
      {
        id: 'rev1',
        type: 'reverb',
        label: 'Space Reverb',
        position: { x: 890, y: 110 },
        params: { size: 2.2, damping: 0.5, mix: 0.35 },
      },
      {
        id: 'out1',
        type: 'output',
        label: 'Master Output',
        position: { x: 1160, y: 110 },
        params: { gain: 0.9, pan: 0 },
      }
    );
    connections.push(
      { id: 'c1', fromNode: 'noise1', fromPort: 'out', toNode: 'flt1', toPort: 'in', amount: 1 },
      { id: 'c2', fromNode: 'lfo1', fromPort: 'cv', toNode: 'flt1', toPort: 'cutoff', amount: 0.45 },
      { id: 'c3', fromNode: 'flt1', fromPort: 'out', toNode: 'env1', toPort: 'in', amount: 1 },
      { id: 'c4', fromNode: 'env1', fromPort: 'out', toNode: 'rev1', toPort: 'in', amount: 1 },
      { id: 'c5', fromNode: 'rev1', fromPort: 'out', toNode: 'out1', toPort: 'in', amount: 1 }
    );
  } else if (def.archetype === 'perc') {
    nodes.push(
      {
        id: 'osc1',
        type: 'oscillator',
        label: 'Drum Shell',
        position: { x: 60, y: 90 },
        params: { waveform: 'sine', octave: -1, semitone: 0, detune: 0, gain: 0.85 },
      },
      {
        id: 'pitchEnv',
        type: 'envelope',
        label: 'Head Drop',
        position: { x: 60, y: 290 },
        params: { attack: 0.002, decay: 0.08, sustain: 0, release: 0.05, velocitySens: 0.6 },
      },
      {
        id: 'flt1',
        type: 'filter',
        label: 'Shell Tone',
        position: { x: 350, y: 110 },
        params: { mode: 'lowpass', cutoff, resonance: 2.2, keyTrack: 0.3, gain: 4 },
      },
      {
        id: 'env1',
        type: 'envelope',
        label: 'Impact Decay',
        position: { x: 620, y: 110 },
        params: { attack: 0.002, decay, sustain: 0.01, release: 0.25, velocitySens: 0.9 },
      },
      {
        id: 'rev1',
        type: 'reverb',
        label: 'Stage Hall',
        position: { x: 890, y: 110 },
        params: { size: 1.6, damping: 0.5, mix: 0.24 },
      },
      {
        id: 'out1',
        type: 'output',
        label: 'Master Output',
        position: { x: 1160, y: 110 },
        params: { gain: 0.95, pan: 0 },
      }
    );
    connections.push(
      { id: 'c1', fromNode: 'osc1', fromPort: 'out', toNode: 'flt1', toPort: 'in', amount: 1 },
      { id: 'c2', fromNode: 'pitchEnv', fromPort: 'cv', toNode: 'osc1', toPort: 'pitch', amount: 0.85 },
      { id: 'c3', fromNode: 'flt1', fromPort: 'out', toNode: 'env1', toPort: 'in', amount: 1 },
      { id: 'c4', fromNode: 'env1', fromPort: 'out', toNode: 'rev1', toPort: 'in', amount: 1 },
      { id: 'c5', fromNode: 'rev1', fromPort: 'out', toNode: 'out1', toPort: 'in', amount: 1 }
    );
  } else if (def.archetype === 'bowed') {
    const isTremolo = def.program === 44;
    const isBass = def.program === 43;
    const isCello = def.program === 42;
    const isViola = def.program === 41;
    const strOct = isBass ? -1 : 0;

    const mid1Freq = isBass ? 140 : isCello ? 235 : isViola ? 340 : 440;
    const mid2Freq = isBass ? 960 : isCello ? 1480 : isViola ? 1950 : 2550;
    const airGain = isBass ? -4.5 : isCello ? -3.0 : -1.5;

    nodes.push(
      {
        id: 'str1',
        type: 'physicalString',
        label: 'Bowed String Core',
        position: { x: 40, y: 60 },
        params: {
          excitation: 'bow',
          octave: strOct,
          bowPressure: isBass ? 0.68 : isCello ? 0.64 : 0.58,
          bowPosition: isTremolo ? 0.1 : 0.14,
          rosin: isTremolo ? 0.42 : 0.32,
          damping: isBass ? 0.52 : isCello ? 0.46 : 0.38,
          decay: 0.986,
          brightness: isBass ? 0.62 : 0.76,
          sympathetic: 0.02,
          exciterMix: 0.65,
          gain: 0.78,
        },
      },
      {
        id: 'osc1',
        type: 'oscillator',
        label: 'Warm Harmonic Layer',
        position: { x: 40, y: 260 },
        params: { waveform: 'strings', octave: strOct, semitone: 0, detune: 5, gain: 0.36 },
      },
      {
        id: 'fm1',
        type: 'fmOperator',
        label: 'Rosin Texture (Noise FM)',
        position: { x: 40, y: 450 },
        params: {
          carrierWave: 'triangle',
          modWave: 'sine',
          octave: strOct,
          ratio: 1.0,
          modIndex: 75,
          feedback: 0.12,
          noiseFmDepth: isTremolo ? 210 : 145,
          noiseBandwidth: isBass ? 1400 : 2600,
          gain: 0.24,
        },
      },
      {
        id: 'lfo1',
        type: 'lfo',
        label: isTremolo ? 'Tremolo Bow LFO' : 'Vibrato & Swell LFO',
        position: { x: 40, y: 650 },
        params: {
          waveform: 'sine',
          rate: isTremolo ? 8.2 : 5.3,
          depth: def.lfoDepth ?? 0.14,
          delay: isTremolo ? 0.04 : 0.22,
        },
      },
      {
        id: 'comb1',
        type: 'combFilter',
        label: 'Bow Position Comb',
        position: { x: 330, y: 110 },
        params: {
          mode: 'feedforward',
          keyTrack: true,
          ratio: 0.13,
          delayMs: 3.5,
          feedback: 0.45,
          damping: 0.44,
          mix: 0.38,
        },
      },
      {
        id: 'eq1',
        type: 'parametricEq',
        label: `${def.name} Wooden Body`,
        position: { x: 600, y: 110 },
        params: {
          lowFreq: isBass ? 95 : 175,
          lowGain: isBass ? 4.0 : 2.0,
          mid1Freq,
          mid1Gain: 5.5,
          mid1Q: 2.1,
          mid2Freq,
          mid2Gain: 5.0,
          mid2Q: 2.3,
          highFreq: 4800,
          highGain: airGain,
          outputGain: 1.0,
        },
      },
      {
        id: 'flt1',
        type: 'filter',
        label: 'Bow Brilliance Filter',
        position: { x: 600, y: 330 },
        params: { mode: 'lowpass', cutoff, resonance: 1.35, keyTrack: 0.42, gain: 4 },
      },
      {
        id: 'env1',
        type: 'envelope',
        label: 'Bow Contour Env',
        position: { x: 870, y: 130 },
        params: { attack, decay, sustain: 0.86, release: 0.36, velocitySens: 0.76 },
      },
      {
        id: 'rev1',
        type: 'reverb',
        label: 'Concert Hall',
        position: { x: 1130, y: 130 },
        params: { size: 1.85, damping: 0.48, mix: Math.max(0.28, revMix) },
      },
      {
        id: 'out1',
        type: 'output',
        label: 'Master Output',
        position: { x: 1390, y: 130 },
        params: { gain: 0.9, pan: 0 },
      }
    );

    connections.push(
      { id: 'c1', fromNode: 'str1', fromPort: 'out', toNode: 'comb1', toPort: 'in', amount: 1 },
      { id: 'c2', fromNode: 'osc1', fromPort: 'out', toNode: 'comb1', toPort: 'in', amount: 0.72 },
      { id: 'c3', fromNode: 'fm1', fromPort: 'out', toNode: 'comb1', toPort: 'in', amount: 0.48 },
      { id: 'c4', fromNode: 'lfo1', fromPort: 'cv', toNode: 'str1', toPort: 'pitch', amount: isTremolo ? 0.06 : 0.14 },
      { id: 'c5', fromNode: 'lfo1', fromPort: 'cv', toNode: 'osc1', toPort: 'pitch', amount: isTremolo ? 0.06 : 0.14 },
      { id: 'c6', fromNode: 'lfo1', fromPort: 'cv', toNode: 'flt1', toPort: 'cutoff', amount: isTremolo ? 0.22 : 0.1 },
      { id: 'c7', fromNode: 'comb1', fromPort: 'out', toNode: 'eq1', toPort: 'in', amount: 1 },
      { id: 'c8', fromNode: 'eq1', fromPort: 'out', toNode: 'flt1', toPort: 'in', amount: 1 },
      { id: 'c9', fromNode: 'flt1', fromPort: 'out', toNode: 'env1', toPort: 'in', amount: 1 },
      { id: 'c10', fromNode: 'env1', fromPort: 'cv', toNode: 'flt1', toPort: 'cutoff', amount: 0.3 },
      { id: 'c11', fromNode: 'env1', fromPort: 'cv', toNode: 'str1', toPort: 'bow', amount: 0.25 },
      { id: 'c12', fromNode: 'env1', fromPort: 'out', toNode: 'rev1', toPort: 'in', amount: 1 },
      { id: 'c13', fromNode: 'rev1', fromPort: 'out', toNode: 'out1', toPort: 'in', amount: 1 }
    );

    if (isTremolo) {
      connections.push({
        id: 'c14',
        fromNode: 'lfo1',
        fromPort: 'cv',
        toNode: 'env1',
        toPort: 'amp',
        amount: 0.42,
      });
    }

    modMatrix.push(
      {
        id: 'm1',
        enabled: true,
        source: 'velocity',
        via: 'none',
        targetNodeId: 'str1',
        targetParam: 'bowPressure',
        amount: 0.35,
        curve: 'linear',
        label: 'Velocity → Bow Bite',
      },
      {
        id: 'm2',
        enabled: true,
        source: 'velocity',
        via: 'none',
        targetNodeId: 'fm1',
        targetParam: 'noiseFmDepth',
        amount: 0.32,
        curve: 'exp',
        label: 'Velocity → Rosin Texture',
      },
      {
        id: 'm3',
        enabled: true,
        source: 'lfo1',
        via: isTremolo ? 'none' : 'modWheel',
        targetNodeId: 'env1',
        targetParam: 'amp',
        amount: isTremolo ? 0.35 : 0.18,
        curve: 'linear',
        label: 'LFO → Bow Tremolo',
      }
    );
  } else {
    // Organ, Bass, SynthBass, Pad, Brass, Reed, Pipe, Lead, E-Guitar
    const wf =
      def.waveform ??
      (def.archetype === 'organ'
        ? 'organ'
        : def.archetype === 'reed'
          ? 'reed'
          : def.archetype === 'pipe' || def.archetype === 'ethnic-wind'
            ? 'triangle'
            : 'sawtooth');

    const oct = def.archetype === 'bass' || def.archetype === 'synthbass' ? -1 : 0;

    nodes.push(
      {
        id: 'osc1',
        type: 'oscillator',
        label: 'Primary Oscillator',
        position: { x: 60, y: 80 },
        params: { waveform: wf, octave: oct, semitone: 0, detune: 0, gain: 0.72 },
      },
      {
        id: 'osc2',
        type: 'oscillator',
        label: 'Sub / Detune Osc',
        position: { x: 60, y: 270 },
        params: {
          waveform: def.archetype === 'pipe' ? 'sine' : wf,
          octave: def.archetype === 'organ' ? 1 : oct,
          semitone: 0,
          detune: def.detune ?? 7,
          gain: 0.34,
        },
      },
      {
        id: 'lfo1',
        type: 'lfo',
        label: 'Modulation LFO',
        position: { x: 60, y: 460 },
        params: { waveform: 'sine', rate: 5.2, depth: def.lfoDepth ?? 0.09, delay: 0.2 },
      },
      {
        id: 'flt1',
        type: 'filter',
        label: 'Timbre Filter',
        position: { x: 360, y: 115 },
        params: {
          mode: 'lowpass',
          cutoff,
          resonance: def.archetype === 'synthbass' || def.archetype === 'lead' ? 3.8 : 1.6,
          keyTrack: 0.45,
          gain: 5,
        },
      },
      {
        id: 'env1',
        type: 'envelope',
        label: 'Amplitude & Filter Env',
        position: { x: 630, y: 115 },
        params: { attack, decay, sustain, release, velocitySens: 0.72 },
      },
      {
        id: 'rev1',
        type: 'reverb',
        label: 'Studio Reverb',
        position: { x: 900, y: 115 },
        params: { size: 1.6, damping: 0.52, mix: revMix },
      },
      {
        id: 'out1',
        type: 'output',
        label: 'Master Output',
        position: { x: 1170, y: 115 },
        params: { gain: 0.88, pan: 0 },
      }
    );
    connections.push(
      { id: 'c1', fromNode: 'osc1', fromPort: 'out', toNode: 'flt1', toPort: 'in', amount: 1 },
      { id: 'c2', fromNode: 'osc2', fromPort: 'out', toNode: 'flt1', toPort: 'in', amount: 0.75 },
      { id: 'c3', fromNode: 'lfo1', fromPort: 'cv', toNode: 'osc1', toPort: 'pitch', amount: 0.1 },
      { id: 'c4', fromNode: 'env1', fromPort: 'cv', toNode: 'flt1', toPort: 'cutoff', amount: def.archetype === 'brass' || def.archetype === 'synthbass' ? 0.48 : 0.22 },
      { id: 'c5', fromNode: 'flt1', fromPort: 'out', toNode: 'env1', toPort: 'in', amount: 1 },
      { id: 'c6', fromNode: 'env1', fromPort: 'out', toNode: 'rev1', toPort: 'in', amount: 1 },
      { id: 'c7', fromNode: 'rev1', fromPort: 'out', toNode: 'out1', toPort: 'in', amount: 1 }
    );
  }

  return {
    schemaVersion: '1.0',
    id: `gm-${def.program}`,
    name: def.name,
    category: def.category,
    regionOrFamily: `GM #${def.program + 1} · ${def.family}`,
    gmProgram: def.program,
    description: `General MIDI Program #${def.program + 1} (${def.family}) synthesized via modular WebAudio graph.`,
    tags: ['gm', def.family.toLowerCase(), def.archetype],
    polyphony: def.archetype === 'bass' || def.archetype === 'synthbass' ? 4 : 8,
    glideMs: def.archetype === 'lead' ? 20 : 0,
    nodes,
    connections,
    ...(modMatrix.length > 0 ? { modMatrix } : {}),
  };
}

export const GM_PRESETS: SynthPatch[] = GM_DEFINITIONS.map(buildGmPatch);

export const GM_FAMILY_TABS: { id: PresetCategory | 'gm-all'; label: string }[] = [
  { id: 'gm-all', label: 'All GM (128)' },
  { id: 'gm-piano', label: 'Piano' },
  { id: 'gm-chromatic', label: 'Chromatic' },
  { id: 'gm-organ', label: 'Organ' },
  { id: 'gm-guitar', label: 'Guitar' },
  { id: 'gm-bass', label: 'Bass' },
  { id: 'gm-strings', label: 'Strings' },
  { id: 'gm-ensemble', label: 'Ensemble' },
  { id: 'gm-brass', label: 'Brass' },
  { id: 'gm-reed', label: 'Reed' },
  { id: 'gm-pipe', label: 'Pipe' },
  { id: 'gm-synth-lead', label: 'Synth Lead' },
  { id: 'gm-synth-pad', label: 'Synth Pad' },
  { id: 'gm-synth-fx', label: 'Synth FX' },
  { id: 'gm-ethnic', label: 'GM Ethnic' },
  { id: 'gm-percussion', label: 'Percussive' },
  { id: 'gm-sfx', label: 'Sound FX' },
];
