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
  const p = def.program;

  if (def.archetype === 'piano') {
    const isBright = p === 1;
    const isHonky = p === 3;
    const pianoHarmonics = isBright
      ? '1,0.82,0.62,0.45,0.3,0.2,0.14,0.09,0.06,0.038,0.024,0.015,0.009,0.005,0,0'
      : isHonky
        ? '1,0.75,0.52,0.34,0.22,0.14,0.08,0.05,0.03,0.018,0.01,0,0,0,0,0'
        : '1,0.68,0.44,0.28,0.16,0.1,0.06,0.035,0.02,0.012,0.006,0.003,0,0,0,0';
    nodes.push(
      {
        id: 'osc1',
        type: 'oscillator',
        label: 'Triple-String Soundboard Core',
        position: { x: 40, y: 60 },
        params: {
          waveform: 'customHarmonics',
          customHarmonics: pianoHarmonics,
          octave: 0,
          semitone: 0,
          detune: 0,
          unison: '3',
          unisonDetune: isHonky ? 17 : isBright ? 3.5 : 2.5,
          stereoSpread: isHonky ? 0.52 : 0.24,
          gain: 0.68,
        },
      },
      {
        id: 'fm1',
        type: 'fmOperator',
        label: 'Warm Felt Hammer Body',
        position: { x: 40, y: 270 },
        params: {
          carrierWave: 'sine',
          modWave: 'sine',
          octave: 0,
          ratio: 1.0,
          modIndex: isBright ? 48 : 28,
          feedback: 0.04,
          gain: 0.46,
        },
      },
      {
        id: 'slope1',
        type: 'slopeEnv',
        label: 'Felt Hammer Transient',
        position: { x: 40, y: 480 },
        params: { mode: 'oneShot', rise: 0.002, fall: 0.16, shape: -0.4, depth: 0.85, bipolar: false },
      },
      {
        id: 'eq1',
        type: 'parametricEq',
        label: 'Spruce Soundboard',
        position: { x: 330, y: 90 },
        params: {
          lowFreq: 130,
          lowGain: 3.0,
          mid1Freq: 340,
          mid1Gain: 3.0,
          mid1Q: 1.6,
          mid2Freq: isBright ? 2400 : 1950,
          mid2Gain: isBright ? 3.5 : 1.5,
          mid2Q: 1.7,
          highFreq: 5200,
          highGain: isBright ? -0.5 : -3.5,
          outputGain: 1.04,
        },
      },
      {
        id: 'flt1',
        type: 'filter',
        label: 'Damper Tone',
        position: { x: 600, y: 90 },
        params: { mode: 'lowpass', cutoff: isBright ? 4800 : 3200, resonance: 0.9, keyTrack: 0.55, gain: 0 },
      },
      ...(isHonky
        ? [
            {
              id: 'cho1',
              type: 'chorus' as const,
              label: 'Saloon Detuned Unison',
              position: { x: 600, y: 310 },
              params: { voices: '2', rate: 1.25, depth: 0.34, stereoWidth: 0.58, tone: 5400, mix: 0.4 },
            },
          ]
        : []),
      {
        id: 'env1',
        type: 'envelope',
        label: 'Piano String Decay',
        position: { x: 870, y: 90 },
        params: { attack: 0.003, decay: decay + 0.35, sustain: 0.05, release, velocitySens: 0.86 },
      },
      {
        id: 'bus1',
        type: 'busCompressor',
        label: 'Soundboard Glue',
        position: { x: 1130, y: 90 },
        params: { threshold: -18, ratio: 2.4, knee: 12, attackMs: 12, releaseMs: 160, tapeGlue: 0.16, makeup: 1.12, mix: 0.72 },
      },
      {
        id: 'rev1',
        type: 'reverb',
        label: 'Concert Stage',
        position: { x: 1390, y: 90 },
        params: { size: 1.75, damping: 0.52, mix: revMix },
      },
      {
        id: 'out1',
        type: 'output',
        label: 'Master Output',
        position: { x: 1650, y: 90 },
        params: { gain: 0.88, pan: 0 },
      }
    );
    connections.push(
      { id: 'c1', fromNode: 'osc1', fromPort: 'out', toNode: 'eq1', toPort: 'in', amount: 1 },
      { id: 'c2', fromNode: 'fm1', fromPort: 'out', toNode: 'eq1', toPort: 'in', amount: 0.72 },
      { id: 'c3', fromNode: 'slope1', fromPort: 'cv', toNode: 'fm1', toPort: 'index', amount: 0.22 },
      { id: 'c4', fromNode: 'slope1', fromPort: 'cv', toNode: 'flt1', toPort: 'cutoff', amount: 0.42 },
      { id: 'c5', fromNode: 'eq1', fromPort: 'out', toNode: 'flt1', toPort: 'in', amount: 1 },
      ...(isHonky
        ? [
            { id: 'c6', fromNode: 'flt1', fromPort: 'out', toNode: 'cho1', toPort: 'in', amount: 1 },
            { id: 'c7', fromNode: 'cho1', fromPort: 'out', toNode: 'env1', toPort: 'in', amount: 1 },
          ]
        : [{ id: 'c6', fromNode: 'flt1', fromPort: 'out', toNode: 'env1', toPort: 'in', amount: 1 }]),
      { id: 'c8', fromNode: 'env1', fromPort: 'out', toNode: 'bus1', toPort: 'in', amount: 1 },
      { id: 'c9', fromNode: 'bus1', fromPort: 'out', toNode: 'rev1', toPort: 'in', amount: 1 },
      { id: 'c10', fromNode: 'rev1', fromPort: 'out', toNode: 'out1', toPort: 'in', amount: 1 }
    );
    modMatrix.push(
      {
        id: 'mp1',
        enabled: true,
        source: 'velocity',
        via: 'none',
        targetNodeId: 'flt1',
        targetParam: 'cutoff',
        amount: 0.45,
        curve: 'exp',
        label: 'Velocity → Hammer Brightness',
      },
      {
        id: 'mp2',
        enabled: true,
        source: 'velocity',
        via: 'none',
        targetNodeId: 'fm1',
        targetParam: 'modIndex',
        amount: 0.28,
        curve: 'linear',
        label: 'Velocity → Strike Warmth',
      }
    );
  } else if (def.archetype === 'epiano') {
    const isRhodes = p === 4;
    const isCp80 = p === 2;
    nodes.push(
      {
        id: 'osc1',
        type: 'oscillator',
        label: isCp80 ? 'CP-80 Harp Harmonics' : 'Pure Fundamental Sine',
        position: { x: 40, y: 60 },
        params: isCp80
          ? {
              waveform: 'customHarmonics',
              customHarmonics: '1,0.72,0.48,0.3,0.18,0.11,0.06,0.03,0,0,0,0,0,0,0,0',
              octave: 0,
              semitone: 0,
              detune: 0,
              unison: '3',
              unisonDetune: 3,
              stereoSpread: 0.28,
              gain: 0.58,
            }
          : {
              waveform: 'sine',
              octave: 0,
              semitone: 0,
              detune: 0,
              gain: 0.62,
            },
      },
      {
        id: 'fm1',
        type: 'fmOperator',
        label: isRhodes ? 'Suitcase Bell Core' : 'FM Tine Core',
        position: { x: 40, y: 270 },
        params: {
          carrierWave: 'sine',
          modWave: 'sine',
          octave: 0,
          ratio: isRhodes || isCp80 ? 1.0 : 7.0,
          modIndex: isRhodes ? 90 : isCp80 ? 75 : 105,
          feedback: 0.04,
          gain: 0.44,
        },
      },
      {
        id: 'slope1',
        type: 'slopeEnv',
        label: 'Tine Strike Decay',
        position: { x: 40, y: 470 },
        params: { mode: 'oneShot', rise: 0.002, fall: 0.09, shape: -0.45, depth: 0.85, bipolar: false },
      },
      {
        id: 'flt1',
        type: 'filter',
        label: 'Pickup Tone Filter',
        position: { x: 320, y: 90 },
        params: { mode: 'lowpass', cutoff: isRhodes ? 2800 : 4400, resonance: 0.85, keyTrack: 0.48, gain: 0 },
      },
      {
        id: 'eq1',
        type: 'parametricEq',
        label: 'Tine & Bell EQ',
        position: { x: 590, y: 90 },
        params: {
          lowFreq: 140,
          lowGain: isRhodes ? 3.5 : 1.5,
          mid1Freq: 320,
          mid1Gain: isRhodes ? 3.5 : 2.0,
          mid1Q: 1.6,
          mid2Freq: isRhodes ? 1900 : 2800,
          mid2Gain: 2.5,
          mid2Q: 1.8,
          highFreq: 5500,
          highGain: isRhodes ? -3.0 : -0.5,
          outputGain: 1.02,
        },
      },
      {
        id: 'cho1',
        type: 'chorus',
        label: 'Suitcase Stereo Chorus',
        position: { x: 860, y: 90 },
        params: { voices: '4', rate: 0.44, depth: 0.36, stereoWidth: 0.78, tone: 5800, mix: 0.32 },
      },
      {
        id: 'env1',
        type: 'envelope',
        label: 'Tine Decay',
        position: { x: 1130, y: 90 },
        params: { attack: 0.004, decay, sustain: def.sustain ?? 0.14, release: 0.42, velocitySens: 0.85 },
      },
      {
        id: 'rev1',
        type: 'reverb',
        label: 'Studio Room',
        position: { x: 1390, y: 90 },
        params: { size: 1.6, damping: 0.5, mix: revMix },
      },
      {
        id: 'out1',
        type: 'output',
        label: 'Master Output',
        position: { x: 1650, y: 90 },
        params: { gain: 0.88, pan: 0 },
      }
    );
    connections.push(
      { id: 'c1', fromNode: 'osc1', fromPort: 'out', toNode: 'flt1', toPort: 'in', amount: 0.9 },
      { id: 'c2', fromNode: 'fm1', fromPort: 'out', toNode: 'flt1', toPort: 'in', amount: 0.75 },
      { id: 'c3', fromNode: 'slope1', fromPort: 'cv', toNode: 'fm1', toPort: 'index', amount: 0.32 },
      { id: 'c4', fromNode: 'flt1', fromPort: 'out', toNode: 'eq1', toPort: 'in', amount: 1 },
      { id: 'c5', fromNode: 'eq1', fromPort: 'out', toNode: 'cho1', toPort: 'in', amount: 1 },
      { id: 'c6', fromNode: 'cho1', fromPort: 'out', toNode: 'env1', toPort: 'in', amount: 1 },
      { id: 'c7', fromNode: 'env1', fromPort: 'out', toNode: 'rev1', toPort: 'in', amount: 1 },
      { id: 'c8', fromNode: 'rev1', fromPort: 'out', toNode: 'out1', toPort: 'in', amount: 1 }
    );
    if (def.lfoDepth) {
      nodes.push({
        id: 'lfo1',
        type: 'lfo',
        label: 'Auto-Pan / Tremolo',
        position: { x: 320, y: 310 },
        params: { waveform: 'sine', rate: 4.8, depth: def.lfoDepth, delay: 0.08 },
      });
      connections.push({ id: 'c9', fromNode: 'lfo1', fromPort: 'cv', toNode: 'env1', toPort: 'amp', amount: 0.32 });
    }
    modMatrix.push({
      id: 'me1',
      enabled: true,
      source: 'velocity',
      via: 'none',
      targetNodeId: 'fm1',
      targetParam: 'modIndex',
      amount: 0.35,
      curve: 'exp',
      label: 'Velocity → Tine Bell',
    });
  } else if (def.archetype === 'bell') {
    const isMarimba = p === 12;
    const isXylo = p === 13;
    const isVibe = p === 11;
    const isCelesta = p === 8;
    const isTubular = p === 14;
    const isKalimba = p === 108;
    const isSteelDrum = p === 114;
    const isGuitHarm = p === 31;
    const isMusicBox = p === 10;

    const material = isMarimba || isXylo
      ? 'marimba'
      : isVibe || isCelesta || isGuitHarm
        ? 'harmonic'
        : isKalimba || isMusicBox
          ? 'kalimba'
          : isSteelDrum
            ? 'steelDrum'
            : 'bell';
    const brightness = isMarimba ? 0.42 : isVibe ? 0.48 : isCelesta ? 0.55 : isKalimba ? 0.60 : isGuitHarm ? 0.62 : isTubular ? 0.74 : 0.80;
    const inharmonicity = isVibe ? 0.04 : isCelesta ? 0.06 : isMarimba ? 0.12 : isSteelDrum ? 0.14 : isTubular ? 0.24 : p === 113 ? 0.34 : 0.18;
    const modalDecay = isXylo ? 0.26 : p === 113 ? 0.34 : isMarimba ? 0.46 : isVibe ? 2.1 : isTubular ? 3.4 : isGuitHarm ? 1.5 : 0.95;
    const modalDamp = isMarimba ? 0.70 : isVibe ? 0.58 : isTubular ? 0.28 : 0.46;
    const sineGain = isMarimba || isVibe || isCelesta || isKalimba || isSteelDrum || isMusicBox || isGuitHarm ? 0.52 : 0.28;

    nodes.push(
      {
        id: 'mod1',
        type: 'modalResonator',
        label: `${def.name} Resonator`,
        position: { x: 40, y: 60 },
        params: {
          material,
          exciterType: isKalimba || isGuitHarm ? 'pluck' : 'mallet',
          octave: isGuitHarm ? 1 : 0,
          inharmonicity,
          brightness,
          decay: modalDecay,
          damping: modalDamp,
          exciterMix: 0.7,
          gain: 0.72,
        },
      },
      {
        id: 'osc1',
        type: 'oscillator',
        label: 'Pure Fundamental Sine',
        position: { x: 40, y: 270 },
        params: {
          waveform: 'sine',
          octave: isGuitHarm ? 1 : 0,
          semitone: 0,
          detune: 0,
          gain: sineGain,
        },
      },
      {
        id: 'slope1',
        type: 'slopeEnv',
        label: 'Mallet Impact Snap',
        position: { x: 40, y: 470 },
        params: { mode: 'oneShot', rise: 0.002, fall: isMarimba ? 0.04 : 0.065, shape: -0.4, depth: 0.75, bipolar: false },
      },
      {
        id: 'eq1',
        type: 'parametricEq',
        label: isMarimba ? 'Rosewood Pipe Resonator' : 'Body & Tube EQ',
        position: { x: 330, y: 90 },
        params: isMarimba
          ? { lowFreq: 140, lowGain: 2.0, mid1Freq: 260, mid1Gain: 5.5, mid1Q: 2.0, mid2Freq: 1100, mid2Gain: 2.0, mid2Q: 1.6, highFreq: 2900, highGain: -6.0, outputGain: 1.05 }
          : isXylo
            ? { lowFreq: 160, lowGain: -3.0, mid1Freq: 620, mid1Gain: 3.5, mid1Q: 1.9, mid2Freq: 2150, mid2Gain: 5.0, mid2Q: 2.1, highFreq: 5600, highGain: -2.5, outputGain: 1.04 }
            : { lowFreq: 160, lowGain: 1.5, mid1Freq: 340, mid1Gain: 3.5, mid1Q: 1.7, mid2Freq: 2100, mid2Gain: 2.5, mid2Q: 1.7, highFreq: 5200, highGain: isVibe ? -4.0 : -1.5, outputGain: 1.04 },
      },
      {
        id: 'env1',
        type: 'envelope',
        label: 'Resonator Decay',
        position: { x: 600, y: 90 },
        params: { attack: 0.002, decay: Math.max(0.28, decay), sustain: def.sustain ?? 0.03, release: isTubular ? 1.1 : 0.45, velocitySens: 0.85 },
      },
      {
        id: 'rev1',
        type: 'reverb',
        label: 'Hall Ambience',
        position: { x: 870, y: 90 },
        params: { size: isTubular || p === 98 ? 2.6 : 1.55, damping: 0.46, mix: isTubular ? 0.34 : revMix },
      },
      {
        id: 'out1',
        type: 'output',
        label: 'Master Output',
        position: { x: 1140, y: 90 },
        params: { gain: 0.9, pan: 0 },
      }
    );
    connections.push(
      { id: 'c1', fromNode: 'mod1', fromPort: 'out', toNode: 'eq1', toPort: 'in', amount: 0.9 },
      { id: 'c2', fromNode: 'osc1', fromPort: 'out', toNode: 'eq1', toPort: 'in', amount: 0.8 },
      { id: 'c3', fromNode: 'slope1', fromPort: 'cv', toNode: 'mod1', toPort: 'brightness', amount: 0.48 },
      { id: 'c4', fromNode: 'eq1', fromPort: 'out', toNode: 'env1', toPort: 'in', amount: 1 },
      { id: 'c5', fromNode: 'env1', fromPort: 'out', toNode: 'rev1', toPort: 'in', amount: 1 },
      { id: 'c6', fromNode: 'rev1', fromPort: 'out', toNode: 'out1', toPort: 'in', amount: 1 }
    );
    if (isVibe || def.lfoDepth) {
      nodes.push({
        id: 'lfo1',
        type: 'lfo',
        label: isVibe ? 'Vibe Fan Tremolo' : 'Shimmer LFO',
        position: { x: 330, y: 310 },
        params: { waveform: 'sine', rate: isVibe ? 5.4 : 4.8, depth: def.lfoDepth ?? 0.16, delay: 0.08 },
      });
      connections.push({ id: 'c7', fromNode: 'lfo1', fromPort: 'cv', toNode: 'env1', toPort: 'amp', amount: 0.38 });
    }
  } else if (def.archetype === 'fx') {
    nodes.push(
      {
        id: 'fm1',
        type: 'fmOperator',
        label: 'FM Harmonic Core',
        position: { x: 40, y: 80 },
        params: {
          carrierWave: 'sine',
          modWave: 'sine',
          octave: 0,
          ratio: def.ratio ?? 2.0,
          modIndex: def.modIndex ?? 280,
          feedback: 0.14,
          noiseFmDepth: p === 99 || p === 101 ? 85 : 0,
          noiseBandwidth: 2800,
          gain: 0.78,
        },
      },
      {
        id: 'flt1',
        type: 'filter',
        label: 'Tone Filter',
        position: { x: 330, y: 90 },
        params: { mode: 'lowpass', cutoff, resonance: 2.2, keyTrack: 0.45, gain: 4 },
      },
      {
        id: 'cho1',
        type: 'chorus',
        label: 'Stereo Spread',
        position: { x: 600, y: 90 },
        params: { voices: '4', rate: 0.38, depth: 0.5, stereoWidth: 0.85, tone: 6400, mix: 0.42 },
      },
      {
        id: 'env1',
        type: 'envelope',
        label: 'Amp & Index Env',
        position: { x: 870, y: 90 },
        params: { attack, decay, sustain: def.sustain ?? 0.25, release, velocitySens: 0.8 },
      },
      {
        id: 'rev1',
        type: 'reverb',
        label: 'Space Reverb',
        position: { x: 1140, y: 90 },
        params: { size: 2.4, damping: 0.45, mix: Math.max(0.32, revMix) },
      },
      {
        id: 'out1',
        type: 'output',
        label: 'Master Output',
        position: { x: 1410, y: 90 },
        params: { gain: 0.88, pan: 0 },
      }
    );
    connections.push(
      { id: 'c1', fromNode: 'fm1', fromPort: 'out', toNode: 'flt1', toPort: 'in', amount: 1 },
      { id: 'c2', fromNode: 'env1', fromPort: 'cv', toNode: 'fm1', toPort: 'index', amount: 0.45 },
      { id: 'c3', fromNode: 'flt1', fromPort: 'out', toNode: 'cho1', toPort: 'in', amount: 1 },
      { id: 'c4', fromNode: 'cho1', fromPort: 'out', toNode: 'env1', toPort: 'in', amount: 1 },
      { id: 'c5', fromNode: 'env1', fromPort: 'out', toNode: 'rev1', toPort: 'in', amount: 1 },
      { id: 'c6', fromNode: 'rev1', fromPort: 'out', toNode: 'out1', toPort: 'in', amount: 1 }
    );
    if (def.lfoDepth) {
      nodes.push({
        id: 'lfo1',
        type: 'lfo',
        label: 'FX Mod LFO',
        position: { x: 40, y: 290 },
        params: { waveform: 'sine', rate: 6.2, depth: def.lfoDepth, delay: 0.05 },
      });
      connections.push({ id: 'c7', fromNode: 'lfo1', fromPort: 'cv', toNode: 'fm1', toPort: 'pitch', amount: 0.28 });
    }
  } else if (def.archetype === 'guitar' || def.archetype === 'harpsi' || def.archetype === 'ethnic-pluck' || def.archetype === 'pizz') {
    const isNylon = p === 24;
    const isSteel = p === 25;
    const isJazz = p === 26;
    const isClean = p === 27;
    const isMuted = p === 28;
    const isPizz = def.archetype === 'pizz';
    const isHarp = p === 46;
    const isHarpsi = p === 6;
    const isClav = p === 7;
    const isSitar = p === 104;
    const isBanjo = p === 105;
    const isShamisen = p === 106;

    const strDamp = isMuted ? 0.84 : isPizz ? 0.72 : isJazz ? 0.64 : isNylon ? 0.56 : isHarpsi ? 0.24 : isSteel || isBanjo ? 0.30 : 0.40;
    const strDecay = isMuted ? 0.92 : isPizz ? 0.955 : isShamisen ? 0.966 : isBanjo ? 0.968 : isHarp || isSitar ? 0.993 : 0.986;
    const strBright = isMuted ? 0.38 : isJazz ? 0.48 : isPizz ? 0.52 : isNylon ? 0.56 : isHarp ? 0.72 : isHarpsi || isBanjo ? 0.94 : 0.84;

    const eqParams = isNylon
      ? { lowFreq: 108, lowGain: 4.5, mid1Freq: 245, mid1Gain: 4.0, mid1Q: 1.8, mid2Freq: 1850, mid2Gain: 2.0, mid2Q: 1.8, highFreq: 4200, highGain: -4.5, outputGain: 1.05 }
      : isSteel
        ? { lowFreq: 100, lowGain: 3.5, mid1Freq: 210, mid1Gain: 3.0, mid1Q: 1.7, mid2Freq: 2900, mid2Gain: 4.5, mid2Q: 1.9, highFreq: 6800, highGain: 1.5, outputGain: 1.02 }
        : isJazz
          ? { lowFreq: 120, lowGain: 2.5, mid1Freq: 380, mid1Gain: 4.5, mid1Q: 1.7, mid2Freq: 1350, mid2Gain: 1.5, mid2Q: 1.6, highFreq: 2600, highGain: -6.5, outputGain: 1.08 }
          : isBanjo
            ? { lowFreq: 150, lowGain: -4.0, mid1Freq: 950, mid1Gain: 6.0, mid1Q: 2.3, mid2Freq: 2700, mid2Gain: 7.0, mid2Q: 2.4, highFreq: 6000, highGain: -2.0, outputGain: 1.02 }
            : isHarpsi
              ? { lowFreq: 160, lowGain: -3.5, mid1Freq: 680, mid1Gain: 4.0, mid1Q: 2.0, mid2Freq: 3100, mid2Gain: 5.5, mid2Q: 2.1, highFreq: 7200, highGain: -1.5, outputGain: 1.0 }
              : isClav
                ? { lowFreq: 140, lowGain: 1.5, mid1Freq: 520, mid1Gain: 4.5, mid1Q: 2.0, mid2Freq: 2100, mid2Gain: 6.5, mid2Q: 2.2, highFreq: 4800, highGain: -3.0, outputGain: 1.02 }
                : isHarp
                  ? { lowFreq: 115, lowGain: 3.0, mid1Freq: 320, mid1Gain: 3.5, mid1Q: 1.7, mid2Freq: 1650, mid2Gain: 2.5, mid2Q: 1.7, highFreq: 4800, highGain: -2.5, outputGain: 1.05 }
                  : { lowFreq: 135, lowGain: 3.0, mid1Freq: 340, mid1Gain: 4.5, mid1Q: 1.9, mid2Freq: 1950, mid2Gain: 4.0, mid2Q: 2.0, highFreq: 4800, highGain: -3.0, outputGain: 1.04 };

    nodes.push(
      {
        id: 'str1',
        type: 'physicalString',
        label: 'Plucked String',
        position: { x: 40, y: 60 },
        params: {
          excitation: 'pluck',
          octave: 0,
          damping: strDamp,
          decay: strDecay,
          brightness: strBright,
          sympathetic: isSitar ? 0.72 : isShamisen ? 0.36 : isBanjo ? 0.22 : 0.04,
          gain: 0.94,
        },
      },
      {
        id: 'slope1',
        type: 'slopeEnv',
        label: 'Pick / Finger Pop',
        position: { x: 40, y: 270 },
        params: { mode: 'oneShot', rise: 0.002, fall: 0.048, shape: -0.4, depth: 0.78, bipolar: false },
      },
      {
        id: 'comb1',
        type: 'combFilter',
        label: 'Pluck Position Comb',
        position: { x: 320, y: 90 },
        params: {
          mode: 'feedforward',
          keyTrack: true,
          ratio: isBanjo ? 0.10 : isNylon ? 0.20 : 0.14,
          delayMs: 3.0,
          feedback: 0.4,
          damping: 0.42,
          mix: 0.35,
        },
      },
      ...(isClav
        ? [
            {
              id: 'shp1',
              type: 'shaper' as const,
              label: 'Pickup Bark',
              position: { x: 320, y: 310 },
              params: { drive: 0.34, asymmetry: 0.22, mix: 0.55 },
            },
          ]
        : []),
      {
        id: 'eq1',
        type: 'parametricEq',
        label: `${def.name} Body`,
        position: { x: 590, y: 90 },
        params: eqParams,
      },
      {
        id: 'flt1',
        type: 'filter',
        label: 'Soundhole Tone',
        position: { x: 860, y: 90 },
        params: { mode: 'lowpass', cutoff, resonance: 1.4, keyTrack: 0.45, gain: 0 },
      },
      ...(isClean || p === 15
        ? [
            {
              id: 'cho1',
              type: 'chorus' as const,
              label: 'Course / Clean Chorus',
              position: { x: 860, y: 310 },
              params: { voices: '2', rate: 0.38, depth: 0.28, stereoWidth: 0.65, tone: 5800, mix: 0.28 },
            },
          ]
        : []),
      {
        id: 'env1',
        type: 'envelope',
        label: 'Pluck Decay',
        position: { x: 1130, y: 90 },
        params: { attack: 0.002, decay, sustain: def.sustain ?? 0.05, release: isHarpsi || isClav ? 0.16 : 0.38, velocitySens: 0.82 },
      },
      {
        id: 'rev1',
        type: 'reverb',
        label: 'Room Ambience',
        position: { x: 1390, y: 90 },
        params: { size: isHarp ? 1.9 : 1.3, damping: 0.54, mix: revMix },
      },
      {
        id: 'out1',
        type: 'output',
        label: 'Master Output',
        position: { x: 1650, y: 90 },
        params: { gain: 0.9, pan: 0 },
      }
    );
    connections.push(
      { id: 'c1', fromNode: 'str1', fromPort: 'out', toNode: 'comb1', toPort: 'in', amount: 1 },
      { id: 'c2', fromNode: 'slope1', fromPort: 'cv', toNode: 'flt1', toPort: 'cutoff', amount: 0.46 },
      ...(isClav
        ? [
            { id: 'c3', fromNode: 'comb1', fromPort: 'out', toNode: 'shp1', toPort: 'in', amount: 1 },
            { id: 'c4', fromNode: 'shp1', fromPort: 'out', toNode: 'eq1', toPort: 'in', amount: 1 },
          ]
        : [{ id: 'c3', fromNode: 'comb1', fromPort: 'out', toNode: 'eq1', toPort: 'in', amount: 1 }]),
      { id: 'c5', fromNode: 'eq1', fromPort: 'out', toNode: 'flt1', toPort: 'in', amount: 1 },
      ...(isClean || p === 15
        ? [
            { id: 'c6', fromNode: 'flt1', fromPort: 'out', toNode: 'cho1', toPort: 'in', amount: 1 },
            { id: 'c7', fromNode: 'cho1', fromPort: 'out', toNode: 'env1', toPort: 'in', amount: 1 },
          ]
        : [{ id: 'c6', fromNode: 'flt1', fromPort: 'out', toNode: 'env1', toPort: 'in', amount: 1 }]),
      { id: 'c8', fromNode: 'env1', fromPort: 'out', toNode: 'rev1', toPort: 'in', amount: 1 },
      { id: 'c9', fromNode: 'rev1', fromPort: 'out', toNode: 'out1', toPort: 'in', amount: 1 }
    );
  } else if (def.archetype === 'eguitar') {
    const isDist = p === 30;
    nodes.push(
      {
        id: 'str1',
        type: 'physicalString',
        label: 'Electric String',
        position: { x: 40, y: 60 },
        params: { excitation: 'pluck', octave: 0, damping: 0.30, decay: 0.992, brightness: 0.86, sympathetic: 0.04, gain: 0.88 },
      },
      {
        id: 'osc1',
        type: 'oscillator',
        label: 'Harmonic Sustain',
        position: { x: 40, y: 270 },
        params: { waveform: 'sawtooth', octave: 0, semitone: 0, detune: 3, gain: isDist ? 0.28 : 0.16 },
      },
      {
        id: 'shp1',
        type: 'shaper',
        label: 'Tube Preamp Drive',
        position: { x: 320, y: 90 },
        params: { drive: isDist ? 0.72 : 0.48, asymmetry: 0.28, mix: 0.88 },
      },
      {
        id: 'fld1',
        type: 'wavefolder',
        label: 'Amp Harmonic Clip',
        position: { x: 580, y: 90 },
        params: { folds: isDist ? 2.4 : 1.5, symmetry: 0.18, stages: '1', postTone: 4600, mix: isDist ? 0.5 : 0.3 },
      },
      {
        id: 'eq1',
        type: 'parametricEq',
        label: '4x12 Guitar Cab',
        position: { x: 840, y: 90 },
        params: {
          lowFreq: 110,
          lowGain: 2.5,
          mid1Freq: 250,
          mid1Gain: 3.0,
          mid1Q: 1.6,
          mid2Freq: 2150,
          mid2Gain: 5.0,
          mid2Q: 1.9,
          highFreq: 4200,
          highGain: -9.5,
          outputGain: 1.02,
        },
      },
      {
        id: 'env1',
        type: 'envelope',
        label: 'Amp Sustain Env',
        position: { x: 1110, y: 90 },
        params: { attack: 0.004, decay: 0.8, sustain, release: 0.28, velocitySens: 0.78 },
      },
      {
        id: 'bus1',
        type: 'busCompressor',
        label: 'Cab Glue',
        position: { x: 1370, y: 90 },
        params: { threshold: -16, ratio: 3.5, knee: 10, attackMs: 10, releaseMs: 140, tapeGlue: 0.25, makeup: 1.15, mix: 0.8 },
      },
      {
        id: 'rev1',
        type: 'reverb',
        label: 'Studio Room',
        position: { x: 1630, y: 90 },
        params: { size: 1.35, damping: 0.52, mix: revMix },
      },
      {
        id: 'out1',
        type: 'output',
        label: 'Master Output',
        position: { x: 1890, y: 90 },
        params: { gain: 0.84, pan: 0 },
      }
    );
    connections.push(
      { id: 'c1', fromNode: 'str1', fromPort: 'out', toNode: 'shp1', toPort: 'in', amount: 1 },
      { id: 'c2', fromNode: 'osc1', fromPort: 'out', toNode: 'shp1', toPort: 'in', amount: 0.65 },
      { id: 'c3', fromNode: 'shp1', fromPort: 'out', toNode: 'fld1', toPort: 'in', amount: 1 },
      { id: 'c4', fromNode: 'fld1', fromPort: 'out', toNode: 'eq1', toPort: 'in', amount: 1 },
      { id: 'c5', fromNode: 'eq1', fromPort: 'out', toNode: 'env1', toPort: 'in', amount: 1 },
      { id: 'c6', fromNode: 'env1', fromPort: 'out', toNode: 'bus1', toPort: 'in', amount: 1 },
      { id: 'c7', fromNode: 'bus1', fromPort: 'out', toNode: 'rev1', toPort: 'in', amount: 1 },
      { id: 'c8', fromNode: 'rev1', fromPort: 'out', toNode: 'out1', toPort: 'in', amount: 1 }
    );
  } else if (def.archetype === 'bass') {
    const isAcoustic = p === 32;
    const isPick = p === 34;
    const isFretless = p === 35;

    nodes.push(
      {
        id: 'str1',
        type: 'physicalString',
        label: isAcoustic ? 'Gut Upright String' : 'Bass String',
        position: { x: 40, y: 60 },
        params: {
          excitation: 'pluck',
          octave: -1,
          damping: isAcoustic ? 0.66 : isPick ? 0.36 : 0.56,
          decay: 0.986,
          brightness: isAcoustic ? 0.44 : isPick ? 0.82 : 0.56,
          sympathetic: isFretless ? 0.08 : 0.02,
          gain: 0.94,
        },
      },
      {
        id: 'sub1',
        type: 'subHarmonic',
        label: 'Sub Fundamental Weight',
        position: { x: 40, y: 270 },
        params: {
          waveform: 'triangle',
          octave: -1,
          sub2Level: 0,
          sub1Level: 0.14,
          fundLevel: 0.88,
          fifthLevel: 0,
          octUpLevel: 0,
          detune: 2,
          stereoSpread: 0.15,
          gain: 0.46,
        },
      },
      {
        id: 'slope1',
        type: 'slopeEnv',
        label: 'Finger Attack',
        position: { x: 40, y: 480 },
        params: { mode: 'oneShot', rise: 0.002, fall: 0.065, shape: -0.35, depth: 0.72, bipolar: false },
      },
      {
        id: 'eq1',
        type: 'parametricEq',
        label: isAcoustic ? 'Upright Hollow Body' : 'Bass Cabinet EQ',
        position: { x: 330, y: 90 },
        params: isAcoustic
          ? { lowFreq: 85, lowGain: 4.5, mid1Freq: 215, mid1Gain: 5.0, mid1Q: 1.9, mid2Freq: 880, mid2Gain: 2.0, mid2Q: 1.6, highFreq: 2400, highGain: -6.0, outputGain: 1.06 }
          : isPick
            ? { lowFreq: 95, lowGain: 3.5, mid1Freq: 320, mid1Gain: 2.0, mid1Q: 1.5, mid2Freq: 1950, mid2Gain: 5.5, mid2Q: 2.0, highFreq: 4200, highGain: -3.5, outputGain: 1.04 }
            : { lowFreq: 90, lowGain: 4.0, mid1Freq: 420, mid1Gain: 4.5, mid1Q: 1.8, mid2Freq: 1150, mid2Gain: 2.0, mid2Q: 1.6, highFreq: 3000, highGain: -5.0, outputGain: 1.05 },
      },
      {
        id: 'flt1',
        type: 'filter',
        label: 'Lowpass Tone',
        position: { x: 600, y: 90 },
        params: { mode: 'lowpass', cutoff, resonance: 1.4, keyTrack: 0.38, gain: 0 },
      },
      {
        id: 'env1',
        type: 'envelope',
        label: 'Pluck Contour',
        position: { x: 870, y: 90 },
        params: { attack: attack, decay, sustain, release: 0.28, velocitySens: 0.78 },
      },
      {
        id: 'bus1',
        type: 'busCompressor',
        label: 'Bass Punch',
        position: { x: 1130, y: 90 },
        params: { threshold: -15, ratio: 3.8, knee: 10, attackMs: 10, releaseMs: 120, tapeGlue: 0.22, makeup: 1.15, mix: 0.8 },
      },
      {
        id: 'rev1',
        type: 'reverb',
        label: 'Room Air',
        position: { x: 1390, y: 90 },
        params: { size: 1.15, damping: 0.62, mix: isAcoustic ? 0.2 : 0.12 },
      },
      {
        id: 'out1',
        type: 'output',
        label: 'Master Output',
        position: { x: 1650, y: 90 },
        params: { gain: 0.9, pan: 0 },
      }
    );
    connections.push(
      { id: 'c1', fromNode: 'str1', fromPort: 'out', toNode: 'eq1', toPort: 'in', amount: 1 },
      { id: 'c2', fromNode: 'sub1', fromPort: 'out', toNode: 'eq1', toPort: 'in', amount: 0.75 },
      { id: 'c3', fromNode: 'slope1', fromPort: 'cv', toNode: 'flt1', toPort: 'cutoff', amount: 0.42 },
      { id: 'c4', fromNode: 'eq1', fromPort: 'out', toNode: 'flt1', toPort: 'in', amount: 1 },
      { id: 'c5', fromNode: 'flt1', fromPort: 'out', toNode: 'env1', toPort: 'in', amount: 1 },
      { id: 'c6', fromNode: 'env1', fromPort: 'out', toNode: 'bus1', toPort: 'in', amount: 1 },
      { id: 'c7', fromNode: 'bus1', fromPort: 'out', toNode: 'rev1', toPort: 'in', amount: 1 },
      { id: 'c8', fromNode: 'rev1', fromPort: 'out', toNode: 'out1', toPort: 'in', amount: 1 }
    );
    if (isFretless) {
      nodes.push({
        id: 'lfo1',
        type: 'lfo',
        label: 'Fretless Vibrato',
        position: { x: 330, y: 310 },
        params: { waveform: 'sine', rate: 4.8, depth: 0.1, delay: 0.2 },
      });
      connections.push({ id: 'c9', fromNode: 'lfo1', fromPort: 'cv', toNode: 'str1', toPort: 'pitch', amount: 0.1 });
    }
  } else if (def.archetype === 'synthbass') {
    const isSlap = p === 36 || p === 37;
    nodes.push(
      {
        id: isSlap ? 'str1' : 'sub1',
        type: isSlap ? 'physicalString' : 'subHarmonic',
        label: isSlap ? 'Slap Steel String' : 'Analog Sub Stack',
        position: { x: 40, y: 60 },
        params: isSlap
          ? { excitation: 'pluck', octave: -1, damping: 0.30, decay: 0.982, brightness: 0.92, sympathetic: 0.12, gain: 0.88 }
          : { waveform: 'sawtooth', octave: -1, sub2Level: 0.1, sub1Level: 0.55, fundLevel: 0.9, fifthLevel: 0, octUpLevel: 0, detune: 8, stereoSpread: 0.25, gain: 0.78 },
      },
      {
        id: 'fm1',
        type: 'fmOperator',
        label: isSlap ? 'Thumb Pop Snap' : 'Bass Drive Core',
        position: { x: 40, y: 270 },
        params: { carrierWave: 'triangle', modWave: 'sine', octave: -1, ratio: def.ratio ?? 2.0, modIndex: def.modIndex ?? 280, feedback: 0.18, gain: isSlap ? 0.45 : 0.42 },
      },
      {
        id: 'slope1',
        type: 'slopeEnv',
        label: 'Snap Envelope',
        position: { x: 40, y: 480 },
        params: { mode: 'oneShot', rise: 0.002, fall: 0.09, shape: -0.45, depth: 0.88, bipolar: false },
      },
      {
        id: 'fld1',
        type: 'wavefolder',
        label: isSlap ? 'Slap Harmonic Bite' : 'Acid Folder',
        position: { x: 330, y: 90 },
        params: { folds: isSlap ? 1.5 : 1.9, symmetry: 0.15, stages: '1', postTone: 5200, mix: 0.36 },
      },
      {
        id: 'flt1',
        type: 'filter',
        label: 'Resonant Bass Filter',
        position: { x: 600, y: 90 },
        params: { mode: 'lowpass', cutoff, resonance: isSlap ? 2.2 : 4.2, keyTrack: 0.42, gain: 0 },
      },
      {
        id: 'env1',
        type: 'envelope',
        label: 'Bass Envelope',
        position: { x: 870, y: 90 },
        params: { attack: 0.003, decay, sustain: 0.24, release: 0.22, velocitySens: 0.82 },
      },
      {
        id: 'bus1',
        type: 'busCompressor',
        label: 'Tight Punch',
        position: { x: 1130, y: 90 },
        params: { threshold: -14, ratio: 4.5, knee: 8, attackMs: 6, releaseMs: 110, tapeGlue: 0.25, makeup: 1.2, mix: 0.85 },
      },
      {
        id: 'rev1',
        type: 'reverb',
        label: 'Tight Room',
        position: { x: 1390, y: 90 },
        params: { size: 1.0, damping: 0.6, mix: 0.12 },
      },
      {
        id: 'out1',
        type: 'output',
        label: 'Master Output',
        position: { x: 1650, y: 90 },
        params: { gain: 0.88, pan: 0 },
      }
    );
    const sId = isSlap ? 'str1' : 'sub1';
    connections.push(
      { id: 'c1', fromNode: sId, fromPort: 'out', toNode: 'fld1', toPort: 'in', amount: 0.95 },
      { id: 'c2', fromNode: 'fm1', fromPort: 'out', toNode: 'fld1', toPort: 'in', amount: 0.65 },
      { id: 'c3', fromNode: 'slope1', fromPort: 'cv', toNode: 'fm1', toPort: 'index', amount: 0.55 },
      { id: 'c4', fromNode: 'slope1', fromPort: 'cv', toNode: 'flt1', toPort: 'cutoff', amount: 0.58 },
      { id: 'c5', fromNode: 'fld1', fromPort: 'out', toNode: 'flt1', toPort: 'in', amount: 1 },
      { id: 'c6', fromNode: 'flt1', fromPort: 'out', toNode: 'env1', toPort: 'in', amount: 1 },
      { id: 'c7', fromNode: 'env1', fromPort: 'out', toNode: 'bus1', toPort: 'in', amount: 1 },
      { id: 'c8', fromNode: 'bus1', fromPort: 'out', toNode: 'rev1', toPort: 'in', amount: 1 },
      { id: 'c9', fromNode: 'rev1', fromPort: 'out', toNode: 'out1', toPort: 'in', amount: 1 }
    );
  } else if (def.archetype === 'perc') {
    const isWoodblock = p === 115;
    const isTaiko = p === 116;
    const isTimpani = p === 47;
    const isSynthDrum = p === 118;

    nodes.push(
      {
        id: 'mod1',
        type: 'modalResonator',
        label: isWoodblock ? 'Hollow Wood Block' : 'Drumhead Membrane',
        position: { x: 40, y: 60 },
        params: {
          material: isWoodblock ? 'marimba' : 'plate',
          exciterType: 'mallet',
          octave: isTaiko ? -2 : isWoodblock ? 0 : -1,
          inharmonicity: isWoodblock ? 0.34 : isTaiko ? 0.14 : 0.08,
          brightness: isWoodblock ? 0.88 : isSynthDrum ? 0.65 : 0.36,
          decay: isWoodblock ? 0.14 : isTimpani ? 1.45 : isTaiko ? 0.95 : 0.52,
          damping: isWoodblock ? 0.48 : 0.74,
          exciterMix: 0.7,
          gain: isWoodblock ? 0.96 : 0.62,
        },
      },
      ...(!isWoodblock
        ? [
            {
              id: 'osc1',
              type: 'oscillator' as const,
              label: 'Kettle / Shell Fundamental',
              position: { x: 40, y: 270 },
              params: { waveform: isSynthDrum ? 'triangle' : 'sine', octave: isTaiko ? -2 : -1, semitone: 0, detune: 0, gain: 0.74 },
            },
          ]
        : []),
      {
        id: 'slope1',
        type: 'slopeEnv',
        label: 'Head Stretch Transient',
        position: { x: 40, y: 470 },
        params: { mode: 'oneShot', rise: 0.002, fall: isWoodblock ? 0.025 : 0.055, shape: -0.5, depth: 0.85, bipolar: false },
      },
      {
        id: 'eq1',
        type: 'parametricEq',
        label: isWoodblock ? 'Slit Wood Resonance' : 'Kettle / Drum Shell',
        position: { x: 330, y: 90 },
        params: isWoodblock
          ? { lowFreq: 200, lowGain: -6.0, mid1Freq: 1150, mid1Gain: 7.0, mid1Q: 3.4, mid2Freq: 2600, mid2Gain: 3.5, mid2Q: 2.0, highFreq: 5500, highGain: -3.0, outputGain: 1.05 }
          : { lowFreq: 90, lowGain: 5.0, mid1Freq: 200, mid1Gain: 4.0, mid1Q: 1.8, mid2Freq: 950, mid2Gain: -2.0, mid2Q: 1.4, highFreq: 2800, highGain: -5.5, outputGain: 1.05 },
      },
      {
        id: 'env1',
        type: 'envelope',
        label: 'Impact Decay',
        position: { x: 600, y: 90 },
        params: { attack: 0.002, decay: Math.max(0.14, decay), sustain: 0.01, release: 0.25, velocitySens: 0.9 },
      },
      {
        id: 'bus1',
        type: 'busCompressor',
        label: 'Drum Punch',
        position: { x: 870, y: 90 },
        params: { threshold: -14, ratio: 4.5, knee: 8, attackMs: 5, releaseMs: 110, tapeGlue: 0.28, makeup: 1.22, mix: 0.85 },
      },
      {
        id: 'rev1',
        type: 'reverb',
        label: 'Stage Hall',
        position: { x: 1130, y: 90 },
        params: { size: isTimpani || isTaiko ? 1.85 : 1.2, damping: 0.5, mix: 0.24 },
      },
      {
        id: 'out1',
        type: 'output',
        label: 'Master Output',
        position: { x: 1390, y: 90 },
        params: { gain: 0.92, pan: 0 },
      }
    );
    connections.push(
      { id: 'c1', fromNode: 'mod1', fromPort: 'out', toNode: 'eq1', toPort: 'in', amount: 1 },
      { id: 'c2', fromNode: 'slope1', fromPort: 'cv', toNode: 'mod1', toPort: 'brightness', amount: 0.55 },
      ...(!isWoodblock
        ? [
            { id: 'c3', fromNode: 'osc1', fromPort: 'out', toNode: 'eq1', toPort: 'in', amount: 0.85 },
            { id: 'c4', fromNode: 'slope1', fromPort: 'cv', toNode: 'osc1', toPort: 'pitch', amount: isSynthDrum ? 1.1 : 0.65 },
          ]
        : []),
      { id: 'c5', fromNode: 'eq1', fromPort: 'out', toNode: 'env1', toPort: 'in', amount: 1 },
      { id: 'c6', fromNode: 'env1', fromPort: 'out', toNode: 'bus1', toPort: 'in', amount: 1 },
      { id: 'c7', fromNode: 'bus1', fromPort: 'out', toNode: 'rev1', toPort: 'in', amount: 1 },
      { id: 'c8', fromNode: 'rev1', fromPort: 'out', toNode: 'out1', toPort: 'in', amount: 1 }
    );
  } else if (def.archetype === 'bowed') {
    const isTremolo = p === 44;
    const isBass = p === 43;
    const isCello = p === 42;
    const isViola = p === 41;
    const strOct = isBass ? -1 : 0;

    const mid1Freq = isBass ? 140 : isCello ? 235 : isViola ? 340 : 440;
    const mid2Freq = isBass ? 960 : isCello ? 1480 : isViola ? 1950 : 2550;
    const airGain = isBass ? -5.0 : isCello ? -3.5 : -2.5;

    nodes.push(
      {
        id: 'str1',
        type: 'physicalString',
        label: 'Bowed String Core',
        position: { x: 40, y: 60 },
        params: {
          excitation: 'bow',
          octave: strOct,
          bowPressure: isBass ? 0.58 : isCello ? 0.54 : 0.48,
          bowPosition: isTremolo ? 0.11 : 0.16,
          rosin: isTremolo ? 0.24 : 0.16,
          damping: isBass ? 0.58 : isCello ? 0.52 : 0.46,
          decay: 0.986,
          brightness: isBass ? 0.56 : 0.66,
          sympathetic: 0.02,
          exciterMix: 0.65,
          gain: 0.66,
        },
      },
      {
        id: 'osc1',
        type: 'oscillator',
        label: 'Warm Bowed Layer',
        position: { x: 40, y: 260 },
        params: { waveform: 'strings', octave: strOct, semitone: 0, detune: 4, gain: 0.48 },
      },
      {
        id: 'fm1',
        type: 'fmOperator',
        label: 'Subtle Bow Hair Texture',
        position: { x: 40, y: 450 },
        params: {
          carrierWave: 'sine',
          modWave: 'sine',
          octave: strOct,
          ratio: 1.0,
          modIndex: 28,
          feedback: 0.05,
          noiseFmDepth: isTremolo ? 88 : 52,
          noiseBandwidth: isBass ? 1100 : 1850,
          gain: 0.18,
        },
      },
      {
        id: 'slope1',
        type: 'slopeEnv',
        label: 'Bow Hair Catch',
        position: { x: 40, y: 640 },
        params: { mode: 'oneShot', rise: 0.008, fall: 0.085, shape: -0.35, depth: 0.6, bipolar: false },
      },
      {
        id: 'lfo1',
        type: 'lfo',
        label: isTremolo ? 'Tremolo Bow LFO' : 'Vibrato & Swell LFO',
        position: { x: 330, y: 520 },
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
          ratio: 0.14,
          delayMs: 3.5,
          feedback: 0.4,
          damping: 0.48,
          mix: 0.32,
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
          mid1Gain: 5.0,
          mid1Q: 2.0,
          mid2Freq,
          mid2Gain: 4.0,
          mid2Q: 2.1,
          highFreq: 4600,
          highGain: airGain,
          outputGain: 1.0,
        },
      },
      {
        id: 'flt1',
        type: 'filter',
        label: 'Bow Brilliance Filter',
        position: { x: 600, y: 330 },
        params: { mode: 'lowpass', cutoff, resonance: 1.1, keyTrack: 0.45, gain: 0 },
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
      { id: 'c2', fromNode: 'osc1', fromPort: 'out', toNode: 'comb1', toPort: 'in', amount: 0.82 },
      { id: 'c3', fromNode: 'fm1', fromPort: 'out', toNode: 'comb1', toPort: 'in', amount: 0.45 },
      { id: 'c4', fromNode: 'slope1', fromPort: 'cv', toNode: 'str1', toPort: 'bow', amount: 0.35 },
      { id: 'c5', fromNode: 'lfo1', fromPort: 'cv', toNode: 'str1', toPort: 'pitch', amount: isTremolo ? 0.06 : 0.14 },
      { id: 'c6', fromNode: 'lfo1', fromPort: 'cv', toNode: 'osc1', toPort: 'pitch', amount: isTremolo ? 0.06 : 0.14 },
      { id: 'c7', fromNode: 'lfo1', fromPort: 'cv', toNode: 'flt1', toPort: 'cutoff', amount: isTremolo ? 0.22 : 0.1 },
      { id: 'c8', fromNode: 'comb1', fromPort: 'out', toNode: 'eq1', toPort: 'in', amount: 1 },
      { id: 'c9', fromNode: 'eq1', fromPort: 'out', toNode: 'flt1', toPort: 'in', amount: 1 },
      { id: 'c10', fromNode: 'flt1', fromPort: 'out', toNode: 'env1', toPort: 'in', amount: 1 },
      { id: 'c11', fromNode: 'env1', fromPort: 'cv', toNode: 'flt1', toPort: 'cutoff', amount: 0.3 },
      { id: 'c12', fromNode: 'env1', fromPort: 'cv', toNode: 'str1', toPort: 'bow', amount: 0.2 },
      { id: 'c13', fromNode: 'env1', fromPort: 'out', toNode: 'rev1', toPort: 'in', amount: 1 },
      { id: 'c14', fromNode: 'rev1', fromPort: 'out', toNode: 'out1', toPort: 'in', amount: 1 }
    );

    if (isTremolo) {
      connections.push({
        id: 'c15',
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
        amount: 0.28,
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
        amount: 0.22,
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
  } else if (def.archetype === 'reed') {
    const isClarinet = p === 71;
    const isOboe = p === 68;
    const isEngHorn = p === 69;
    const isBassoon = p === 70;
    const isBariSax = p === 67;
    const isBagpipe = p === 109;
    const isShanai = p === 111;
    const isHarmonica = p === 22;
    const isSax = p >= 64 && p <= 67;

    const oct = isBassoon || isBariSax ? -1 : 0;
    const useFormant = isOboe || isEngHorn || isBassoon || isBagpipe || isShanai || isHarmonica;

    const eqParams = isClarinet
      ? { lowFreq: 160, lowGain: 3.0, mid1Freq: 480, mid1Gain: 3.0, mid1Q: 1.6, mid2Freq: 1650, mid2Gain: 1.5, mid2Q: 1.5, highFreq: 3800, highGain: -5.0, outputGain: 1.06 }
      : isBassoon
        ? { lowFreq: 110, lowGain: 3.5, mid1Freq: 440, mid1Gain: 5.0, mid1Q: 2.0, mid2Freq: 1150, mid2Gain: 2.0, mid2Q: 1.7, highFreq: 2200, highGain: -6.0, outputGain: 1.06 }
        : isOboe || isEngHorn
          ? { lowFreq: 200, lowGain: -2.0, mid1Freq: isEngHorn ? 850 : 1050, mid1Gain: 4.5, mid1Q: 2.0, mid2Freq: isEngHorn ? 1650 : 2100, mid2Gain: 3.5, mid2Q: 1.9, highFreq: 4600, highGain: -4.0, outputGain: 1.04 }
          : isSax
            ? { lowFreq: 150, lowGain: 2.0, mid1Freq: p === 64 ? 1450 : p === 65 ? 1150 : p === 66 ? 880 : 620, mid1Gain: 4.0, mid1Q: 1.7, mid2Freq: 2300, mid2Gain: 2.5, mid2Q: 1.7, highFreq: 4600, highGain: -4.0, outputGain: 1.04 }
            : { lowFreq: 160, lowGain: 1.5, mid1Freq: 1150, mid1Gain: 4.5, mid1Q: 2.0, mid2Freq: 2350, mid2Gain: 3.0, mid2Q: 1.8, highFreq: 4800, highGain: -4.5, outputGain: 1.02 };

    nodes.push(
      {
        id: 'pipe1',
        type: 'blownPipe',
        label: isClarinet ? 'Cylindrical Bore' : 'Double / Conical Reed',
        position: { x: 40, y: 60 },
        params: {
          boreType: isClarinet ? 'clarinet' : 'reed',
          octave: oct,
          breathPressure: isBagpipe || isShanai ? 0.72 : 0.65,
          embouchure: isOboe || isShanai ? 0.66 : isClarinet ? 0.56 : 0.60,
          breathNoise: isSax ? 0.06 : 0.04,
          damping: isClarinet || isBassoon ? 0.55 : 0.42,
          overblow: 0.0,
          exciterMix: 0.4,
          gain: 0.56,
        },
      },
      {
        id: 'osc1',
        type: 'oscillator',
        label: isClarinet ? 'Woody Odd Harmonics' : 'Warm Reed Core',
        position: { x: 40, y: 260 },
        params: isClarinet
          ? {
              waveform: 'customHarmonics',
              customHarmonics: '1,0,0.34,0,0.14,0,0.06,0,0.02,0,0,0,0,0,0,0',
              octave: oct,
              semitone: 0,
              detune: 0,
              gain: 0.5,
            }
          : {
              waveform: isSax ? 'customHarmonics' : 'reed',
              ...(isSax ? { customHarmonics: '1,0.65,0.48,0.32,0.2,0.12,0.07,0.04,0.02,0,0,0,0,0,0,0' } : {}),
              octave: oct,
              semitone: 0,
              detune: 0,
              gain: 0.46,
            },
      },
      ...(isBagpipe
        ? [
            {
              id: 'sub1',
              type: 'subHarmonic' as const,
              label: 'Bagpipe Fifth Drones',
              position: { x: 40, y: 460 },
              params: { waveform: 'sawtooth', octave: -1, sub2Level: 0.3, sub1Level: 0.45, fundLevel: 0.5, fifthLevel: 0.42, octUpLevel: 0, detune: 5, stereoSpread: 0.35, gain: 0.36 },
            },
          ]
        : [
            {
              id: 'slope1',
              type: 'slopeEnv' as const,
              label: 'Tongue Attack Burst',
              position: { x: 40, y: 460 },
              params: { mode: 'oneShot', rise: 0.008, fall: 0.09, shape: -0.35, depth: 0.65, bipolar: false },
            },
          ]),
      {
        id: 'lfo1',
        type: 'lfo',
        label: 'Embouchure Vibrato',
        position: { x: 40, y: 650 },
        params: { waveform: 'sine', rate: 5.3, depth: def.lfoDepth ?? 0.11, delay: 0.2 },
      },
      {
        id: 'flt1',
        type: 'filter',
        label: 'Reed Tone Filter',
        position: { x: 320, y: 90 },
        params: { mode: 'lowpass', cutoff, resonance: 1.05, keyTrack: 0.45, gain: 0 },
      },
      ...(useFormant
        ? [
            {
              id: 'fmt1',
              type: 'formantFilter' as const,
              label: 'Vocal / Bore Formant',
              position: { x: 580, y: 90 },
              params: {
                vowel: isBassoon ? 3.1 : isOboe ? 0.65 : isEngHorn ? 1.0 : 0.5,
                shift: isBassoon ? -6 : isEngHorn ? -3 : 1,
                resonance: 4.5,
                spread: 1.0,
                mix: 0.38,
              },
            },
          ]
        : []),
      {
        id: 'eq1',
        type: 'parametricEq',
        label: `${def.name} Bore`,
        position: { x: useFormant ? 840 : 580, y: 90 },
        params: eqParams,
      },
      {
        id: 'env1',
        type: 'envelope',
        label: 'Breath Envelope',
        position: { x: useFormant ? 1100 : 850, y: 90 },
        params: { attack: attack || 0.04, decay: 0.22, sustain: 0.88, release: 0.22, velocitySens: 0.72 },
      },
      {
        id: 'rev1',
        type: 'reverb',
        label: 'Concert Hall',
        position: { x: useFormant ? 1360 : 1110, y: 90 },
        params: { size: 1.65, damping: 0.5, mix: revMix },
      },
      {
        id: 'out1',
        type: 'output',
        label: 'Master Output',
        position: { x: useFormant ? 1620 : 1370, y: 90 },
        params: { gain: 0.88, pan: 0 },
      }
    );
    connections.push(
      { id: 'c1', fromNode: 'pipe1', fromPort: 'out', toNode: 'flt1', toPort: 'in', amount: 0.85 },
      { id: 'c2', fromNode: 'osc1', fromPort: 'out', toNode: 'flt1', toPort: 'in', amount: 0.85 },
      ...(isBagpipe
        ? [{ id: 'c3', fromNode: 'sub1', fromPort: 'out', toNode: 'flt1', toPort: 'in', amount: 0.62 }]
        : [
            { id: 'c3', fromNode: 'slope1', fromPort: 'cv', toNode: 'pipe1', toPort: 'breath', amount: 0.35 },
            { id: 'c4', fromNode: 'slope1', fromPort: 'cv', toNode: 'flt1', toPort: 'cutoff', amount: 0.28 },
          ]),
      { id: 'c5', fromNode: 'lfo1', fromPort: 'cv', toNode: 'pipe1', toPort: 'pitch', amount: 0.12 },
      { id: 'c6', fromNode: 'lfo1', fromPort: 'cv', toNode: 'osc1', toPort: 'pitch', amount: 0.12 },
      ...(useFormant
        ? [
            { id: 'c7', fromNode: 'flt1', fromPort: 'out', toNode: 'fmt1', toPort: 'in', amount: 1 },
            { id: 'c8', fromNode: 'fmt1', fromPort: 'out', toNode: 'eq1', toPort: 'in', amount: 1 },
          ]
        : [{ id: 'c7', fromNode: 'flt1', fromPort: 'out', toNode: 'eq1', toPort: 'in', amount: 1 }]),
      { id: 'c9', fromNode: 'eq1', fromPort: 'out', toNode: 'env1', toPort: 'in', amount: 1 },
      { id: 'c10', fromNode: 'env1', fromPort: 'out', toNode: 'rev1', toPort: 'in', amount: 1 },
      { id: 'c11', fromNode: 'rev1', fromPort: 'out', toNode: 'out1', toPort: 'in', amount: 1 }
    );
  } else if (def.archetype === 'pipe' || def.archetype === 'ethnic-wind') {
    const isPiccolo = p === 72;
    const isRecorder = p === 74;
    const isPanFlute = p === 75;
    const isBottle = p === 76;
    const isShaku = p === 77;
    const isWhistle = p === 78;
    const isOcarina = p === 79;
    const isCalliope = p === 82;

    const oct = isPiccolo || isPanFlute || isWhistle ? 1 : 0;
    const boreType = isRecorder || isCalliope ? 'organPipe' : 'flute';

    nodes.push(
      {
        id: 'pipe1',
        type: 'blownPipe',
        label: isCalliope ? 'Steam Calliope Pipe' : 'Acoustic Air Pipe',
        position: { x: 40, y: 60 },
        params: {
          boreType,
          octave: oct,
          breathPressure: isOcarina ? 0.56 : isCalliope ? 0.72 : 0.62,
          embouchure: isWhistle ? 0.72 : isShaku ? 0.46 : 0.58,
          breathNoise: isBottle ? 0.16 : isShaku ? 0.15 : isPanFlute ? 0.11 : isOcarina ? 0.04 : 0.07,
          damping: isOcarina ? 0.72 : isRecorder ? 0.54 : isShaku ? 0.50 : 0.42,
          overblow: isShaku ? 0.08 : 0.0,
          exciterMix: 0.45,
          gain: 0.56,
        },
      },
      {
        id: 'osc1',
        type: 'oscillator',
        label: 'Silky Flute Core',
        position: { x: 40, y: 260 },
        params: {
          waveform: isCalliope ? 'triangle' : 'sine',
          octave: oct,
          semitone: 0,
          detune: 0,
          gain: 0.48,
        },
      },
      {
        id: 'slope1',
        type: 'slopeEnv',
        label: isShaku ? 'Meri Pitch & Breath' : 'Breath Attack Burst',
        position: { x: 40, y: 460 },
        params: { mode: 'oneShot', rise: isShaku ? 0.025 : 0.015, fall: isShaku ? 0.14 : 0.095, shape: -0.25, depth: 0.6, bipolar: false },
      },
      {
        id: 'lfo1',
        type: 'lfo',
        label: 'Breath Vibrato',
        position: { x: 40, y: 650 },
        params: { waveform: 'sine', rate: 5.2, depth: def.lfoDepth ?? 0.11, delay: 0.2 },
      },
      {
        id: 'eq1',
        type: 'parametricEq',
        label: `${def.name} Bore`,
        position: { x: 330, y: 90 },
        params: isOcarina
          ? { lowFreq: 200, lowGain: 2.0, mid1Freq: 620, mid1Gain: 4.0, mid1Q: 1.6, mid2Freq: 1600, mid2Gain: -3.0, mid2Q: 1.4, highFreq: 2400, highGain: -7.5, outputGain: 1.06 }
          : isBottle
            ? { lowFreq: 180, lowGain: 3.0, mid1Freq: 420, mid1Gain: 5.0, mid1Q: 2.0, mid2Freq: 2400, mid2Gain: 2.0, mid2Q: 1.6, highFreq: 4800, highGain: -4.0, outputGain: 1.05 }
            : isPiccolo || isWhistle
              ? { lowFreq: 250, lowGain: -3.0, mid1Freq: 1100, mid1Gain: 3.0, mid1Q: 1.6, mid2Freq: 2800, mid2Gain: 3.5, mid2Q: 1.7, highFreq: 6800, highGain: -3.0, outputGain: 1.0 }
              : { lowFreq: 180, lowGain: 1.5, mid1Freq: 460, mid1Gain: 3.0, mid1Q: 1.6, mid2Freq: 2300, mid2Gain: 2.0, mid2Q: 1.5, highFreq: 5000, highGain: -4.5, outputGain: 1.04 },
      },
      {
        id: 'flt1',
        type: 'filter',
        label: 'Air Smoothness',
        position: { x: 600, y: 90 },
        params: { mode: 'lowpass', cutoff: isPiccolo ? 6500 : isOcarina ? 2000 : cutoff, resonance: 0.85, keyTrack: 0.45, gain: 0 },
      },
      {
        id: 'env1',
        type: 'envelope',
        label: 'Breath Contour',
        position: { x: 870, y: 90 },
        params: { attack: attack || 0.045, decay: 0.28, sustain: 0.85, release: 0.28, velocitySens: 0.72 },
      },
      {
        id: 'rev1',
        type: 'reverb',
        label: 'Room Hall',
        position: { x: 1130, y: 90 },
        params: { size: 1.9, damping: 0.5, mix: Math.max(0.24, revMix) },
      },
      {
        id: 'out1',
        type: 'output',
        label: 'Master Output',
        position: { x: 1390, y: 90 },
        params: { gain: 0.9, pan: 0 },
      }
    );
    connections.push(
      { id: 'c1', fromNode: 'pipe1', fromPort: 'out', toNode: 'eq1', toPort: 'in', amount: 0.85 },
      { id: 'c2', fromNode: 'osc1', fromPort: 'out', toNode: 'eq1', toPort: 'in', amount: 0.85 },
      { id: 'c3', fromNode: 'slope1', fromPort: 'cv', toNode: 'pipe1', toPort: 'breath', amount: 0.32 },
      ...(isShaku
        ? [
            { id: 'c4', fromNode: 'slope1', fromPort: 'cv', toNode: 'pipe1', toPort: 'pitch', amount: -0.18 },
            { id: 'c5', fromNode: 'slope1', fromPort: 'cv', toNode: 'osc1', toPort: 'pitch', amount: -0.18 },
          ]
        : []),
      { id: 'c6', fromNode: 'lfo1', fromPort: 'cv', toNode: 'pipe1', toPort: 'pitch', amount: 0.12 },
      { id: 'c7', fromNode: 'lfo1', fromPort: 'cv', toNode: 'osc1', toPort: 'pitch', amount: 0.12 },
      { id: 'c8', fromNode: 'eq1', fromPort: 'out', toNode: 'flt1', toPort: 'in', amount: 1 },
      { id: 'c9', fromNode: 'flt1', fromPort: 'out', toNode: 'env1', toPort: 'in', amount: 1 },
      { id: 'c10', fromNode: 'env1', fromPort: 'out', toNode: 'rev1', toPort: 'in', amount: 1 },
      { id: 'c11', fromNode: 'rev1', fromPort: 'out', toNode: 'out1', toPort: 'in', amount: 1 }
    );
  } else if (def.archetype === 'brass') {
    const isOrchHit = p === 55;
    const isTrumpet = p === 56;
    const isTrombone = p === 57;
    const isTuba = p === 58;
    const isMuted = p === 59;
    const isHorn = p === 60;
    const isSection = p === 61;
    const isSynthBrass = p === 62 || p === 63;

    const oct = isTuba ? -2 : isTrombone ? -1 : 0;

    nodes.push(
      {
        id: 'osc1',
        type: 'oscillator',
        label: isSection || isSynthBrass || isOrchHit ? 'Brass Section Ensemble' : 'Lip-Reed Wave',
        position: { x: 40, y: 60 },
        params: {
          waveform: 'sawtooth',
          octave: oct,
          semitone: 0,
          detune: 0,
          unison: isSection || isSynthBrass || isOrchHit ? '3' : '1',
          unisonDetune: def.detune ?? 12,
          stereoSpread: 0.55,
          gain: 0.64,
        },
      },
      {
        id: isTuba || isSection || isHorn || isOrchHit ? 'sub1' : 'osc2',
        type: isTuba || isSection || isHorn || isOrchHit ? 'subHarmonic' : 'oscillator',
        label: isTuba || isSection || isHorn || isOrchHit ? 'Brass Chest Sub' : 'Warm Lip Layer',
        position: { x: 40, y: 270 },
        params:
          isTuba || isSection || isHorn || isOrchHit
            ? {
                waveform: isHorn || isTuba ? 'triangle' : 'sawtooth',
                octave: oct,
                sub2Level: 0,
                sub1Level: isTuba ? 0.42 : 0.24,
                fundLevel: 0.85,
                fifthLevel: 0,
                octUpLevel: isSection || isOrchHit ? 0.28 : 0.06,
                detune: 4,
                stereoSpread: 0.38,
                gain: 0.48,
              }
            : { waveform: 'triangle', octave: oct, semitone: 0, detune: 3, gain: 0.44 },
      },
      {
        id: 'slope1',
        type: 'slopeEnv',
        label: 'Brass Flare Envelope',
        position: { x: 40, y: 480 },
        params: { mode: 'oneShot', rise: isHorn ? 0.065 : isOrchHit ? 0.004 : 0.032, fall: isOrchHit ? 0.28 : 0.38, shape: 0.2, depth: 0.85, bipolar: false },
      },
      ...(isMuted
        ? [
            {
              id: 'fmt1',
              type: 'formantFilter' as const,
              label: 'Harmon Mute Tract',
              position: { x: 330, y: 90 },
              params: { vowel: 1.9, shift: 4, resonance: 7.5, spread: 1.1, mix: 0.68 },
            },
          ]
        : []),
      {
        id: 'eq1',
        type: 'parametricEq',
        label: `${def.name} Bell Formant`,
        position: { x: isMuted ? 590 : 330, y: 90 },
        params: isHorn
          ? { lowFreq: 130, lowGain: 2.5, mid1Freq: 340, mid1Gain: 4.5, mid1Q: 1.7, mid2Freq: 950, mid2Gain: 2.0, mid2Q: 1.6, highFreq: 2600, highGain: -5.5, outputGain: 1.05 }
          : isTuba
            ? { lowFreq: 95, lowGain: 5.0, mid1Freq: 260, mid1Gain: 4.5, mid1Q: 1.8, mid2Freq: 720, mid2Gain: 2.0, mid2Q: 1.6, highFreq: 1800, highGain: -6.5, outputGain: 1.08 }
            : isTrombone
              ? { lowFreq: 130, lowGain: 2.5, mid1Freq: 480, mid1Gain: 4.0, mid1Q: 1.8, mid2Freq: 1150, mid2Gain: 3.5, mid2Q: 1.8, highFreq: 3400, highGain: -4.5, outputGain: 1.04 }
              : isTrumpet || isMuted
                ? { lowFreq: 180, lowGain: -2.0, mid1Freq: 1150, mid1Gain: 4.5, mid1Q: 1.9, mid2Freq: 2500, mid2Gain: 3.0, mid2Q: 1.8, highFreq: 5200, highGain: -4.0, outputGain: 1.02 }
                : { lowFreq: 140, lowGain: 2.5, mid1Freq: 680, mid1Gain: 3.5, mid1Q: 1.7, mid2Freq: 2100, mid2Gain: 3.0, mid2Q: 1.7, highFreq: 4800, highGain: -3.5, outputGain: 1.02 },
      },
      {
        id: 'flt1',
        type: 'filter',
        label: 'Bell Flare Cutoff',
        position: { x: isMuted ? 850 : 590, y: 90 },
        params: { mode: 'lowpass', cutoff, resonance: isSynthBrass ? 2.4 : 1.35, keyTrack: 0.45, gain: 0 },
      },
      {
        id: 'env1',
        type: 'envelope',
        label: 'Breath & Lip Env',
        position: { x: isMuted ? 1110 : 850, y: 90 },
        params: { attack, decay, sustain, release: 0.24, velocitySens: 0.8 },
      },
      {
        id: 'rev1',
        type: 'reverb',
        label: 'Concert Hall',
        position: { x: isMuted ? 1370 : 1110, y: 90 },
        params: { size: 1.7, damping: 0.48, mix: revMix },
      },
      {
        id: 'out1',
        type: 'output',
        label: 'Master Output',
        position: { x: isMuted ? 1630 : 1370, y: 90 },
        params: { gain: 0.88, pan: 0 },
      }
    );
    const secondSrc = isTuba || isSection || isHorn || isOrchHit ? 'sub1' : 'osc2';
    const firstDest = isMuted ? 'fmt1' : 'eq1';
    connections.push(
      { id: 'c1', fromNode: 'osc1', fromPort: 'out', toNode: firstDest, toPort: 'in', amount: 0.9 },
      { id: 'c2', fromNode: secondSrc, fromPort: 'out', toNode: firstDest, toPort: 'in', amount: 0.72 },
      { id: 'c3', fromNode: 'slope1', fromPort: 'cv', toNode: 'flt1', toPort: 'cutoff', amount: 0.58 },
      ...(isMuted ? [{ id: 'c4', fromNode: 'fmt1', fromPort: 'out', toNode: 'eq1', toPort: 'in', amount: 1 }] : []),
      { id: 'c5', fromNode: 'eq1', fromPort: 'out', toNode: 'flt1', toPort: 'in', amount: 1 },
      { id: 'c6', fromNode: 'flt1', fromPort: 'out', toNode: 'env1', toPort: 'in', amount: 1 },
      { id: 'c7', fromNode: 'env1', fromPort: 'out', toNode: 'rev1', toPort: 'in', amount: 1 },
      { id: 'c8', fromNode: 'rev1', fromPort: 'out', toNode: 'out1', toPort: 'in', amount: 1 }
    );
    if (def.lfoDepth) {
      nodes.push({
        id: 'lfo1',
        type: 'lfo',
        label: 'Brass Vibrato',
        position: { x: 330, y: 320 },
        params: { waveform: 'sine', rate: 5.2, depth: def.lfoDepth, delay: 0.25 },
      });
      connections.push({ id: 'c9', fromNode: 'lfo1', fromPort: 'cv', toNode: 'osc1', toPort: 'pitch', amount: 0.1 });
    }
    modMatrix.push({
      id: 'mb1',
      enabled: true,
      source: 'velocity',
      via: 'none',
      targetNodeId: 'flt1',
      targetParam: 'cutoff',
      amount: 0.48,
      curve: 'exp',
      label: 'Velocity → Brass Flare',
    });
  } else if (def.archetype === 'organ') {
    const isReedOrgan = p === 20 || p === 21 || p === 23;
    const isPercOrgan = p === 17;
    const isRockOrgan = p === 18;
    const isChurch = p === 19;

    nodes.push(
      {
        id: 'osc1',
        type: 'oscillator',
        label: isReedOrgan ? 'Free-Reed Rank' : 'Tonewheel / Pipe Core',
        position: { x: 40, y: 60 },
        params: { waveform: isReedOrgan ? 'reed' : 'organ', octave: 0, semitone: 0, detune: 0, gain: 0.65 },
      },
      {
        id: isReedOrgan ? 'osc2' : 'sub1',
        type: isReedOrgan ? 'oscillator' : 'subHarmonic',
        label: isReedOrgan ? 'Musette Detuned Reed' : 'Drawbar Stops (16\'–4\')',
        position: { x: 40, y: 270 },
        params: isReedOrgan
          ? { waveform: 'reed', octave: 0, semitone: 0, detune: def.detune ?? 11, gain: 0.48 }
          : {
              waveform: isChurch ? 'triangle' : 'sine',
              octave: 0,
              sub2Level: isChurch ? 0.2 : 0,
              sub1Level: 0.55,
              fundLevel: 0.7,
              fifthLevel: isPercOrgan || isRockOrgan ? 0.38 : 0.22,
              octUpLevel: isChurch || isPercOrgan ? 0.45 : 0.28,
              detune: isRockOrgan ? 6 : 3,
              stereoSpread: 0.42,
              gain: 0.56,
            },
      },
      ...(isRockOrgan
        ? [
            {
              id: 'shp1',
              type: 'shaper' as const,
              label: 'Leslie Tube Grit',
              position: { x: 320, y: 90 },
              params: { drive: 0.45, asymmetry: 0.25, mix: 0.65 },
            },
          ]
        : []),
      {
        id: 'eq1',
        type: 'parametricEq',
        label: isReedOrgan ? 'Bellows Wood Chest' : 'Organ Cabinet EQ',
        position: { x: isRockOrgan ? 580 : 320, y: 90 },
        params: isReedOrgan
          ? { lowFreq: 140, lowGain: 2.0, mid1Freq: 580, mid1Gain: 4.5, mid1Q: 1.8, mid2Freq: 1950, mid2Gain: 3.5, mid2Q: 1.9, highFreq: 4800, highGain: -4.0, outputGain: 1.0 }
          : { lowFreq: 110, lowGain: 2.5, mid1Freq: 420, mid1Gain: 2.0, mid1Q: 1.4, mid2Freq: 2100, mid2Gain: 3.0, mid2Q: 1.6, highFreq: 5600, highGain: -2.0, outputGain: 1.0 },
      },
      ...(isChurch
        ? [
            {
              id: 'cho1',
              type: 'chorus' as const,
              label: 'Cathedral Rank Ensemble',
              position: { x: 590, y: 90 },
              params: { voices: '4', rate: 0.28, depth: 0.36, stereoWidth: 0.78, tone: 5800, mix: 0.36 },
            },
          ]
        : [
            {
              id: 'phs1',
              type: 'phaser' as const,
              label: isReedOrgan ? 'Bellows Air Swirl' : 'Rotary Leslie Speaker',
              position: { x: isRockOrgan ? 840 : 590, y: 90 },
              params: { mode: 'phaser', rate: isRockOrgan ? 3.8 : 0.75, depth: 0.48, centerFreq: 1100, feedback: 0.32, stereoPhase: 120, mix: isReedOrgan ? 0.22 : 0.42 },
            },
          ]),
      {
        id: 'env1',
        type: 'envelope',
        label: 'Key Gate Envelope',
        position: { x: isRockOrgan ? 1100 : 860, y: 90 },
        params: { attack: attack || 0.008, decay, sustain: def.sustain ?? 0.9, release, velocitySens: 0.45 },
      },
      {
        id: 'rev1',
        type: 'reverb',
        label: isChurch ? 'Cathedral Nave' : 'Room Reverb',
        position: { x: isRockOrgan ? 1360 : 1120, y: 90 },
        params: { size: isChurch ? 3.6 : 1.4, damping: 0.48, mix: revMix },
      },
      {
        id: 'out1',
        type: 'output',
        label: 'Master Output',
        position: { x: isRockOrgan ? 1620 : 1380, y: 90 },
        params: { gain: 0.86, pan: 0 },
      }
    );
    const secondOrganSrc = isReedOrgan ? 'osc2' : 'sub1';
    const preEqTarget = isRockOrgan ? 'shp1' : 'eq1';
    const swirlNode = isChurch ? 'cho1' : 'phs1';
    connections.push(
      { id: 'c1', fromNode: 'osc1', fromPort: 'out', toNode: preEqTarget, toPort: 'in', amount: 0.9 },
      { id: 'c2', fromNode: secondOrganSrc, fromPort: 'out', toNode: preEqTarget, toPort: 'in', amount: 0.85 },
      ...(isRockOrgan ? [{ id: 'c3', fromNode: 'shp1', fromPort: 'out', toNode: 'eq1', toPort: 'in', amount: 1 }] : []),
      { id: 'c4', fromNode: 'eq1', fromPort: 'out', toNode: swirlNode, toPort: 'in', amount: 1 },
      { id: 'c5', fromNode: swirlNode, fromPort: 'out', toNode: 'env1', toPort: 'in', amount: 1 },
      { id: 'c6', fromNode: 'env1', fromPort: 'out', toNode: 'rev1', toPort: 'in', amount: 1 },
      { id: 'c7', fromNode: 'rev1', fromPort: 'out', toNode: 'out1', toPort: 'in', amount: 1 }
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
        params: { waveform: 'sine', rate: p === 125 ? 11 : 0.45, depth: def.lfoDepth ?? 0.35, delay: 0 },
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
  } else {
    // Pad, Choir, String Ensemble, Synth Lead
    const isChoir = p === 52 || p === 53 || p === 91 || p === 85;
    const isStringEns = p === 48 || p === 49 || p === 92;
    const wf = def.waveform ?? (def.archetype === 'pad' ? 'sawtooth' : 'sawtooth');

    nodes.push(
      {
        id: 'osc1',
        type: 'oscillator',
        label: isChoir ? 'Choir Harmonic Source' : isStringEns ? '5-Voice String Ensemble' : 'Primary Oscillator',
        position: { x: 40, y: 60 },
        params: {
          waveform: wf,
          octave: 0,
          semitone: 0,
          detune: 0,
          unison: def.archetype === 'pad' ? '3' : '1',
          unisonDetune: def.detune ?? 14,
          stereoSpread: 0.68,
          gain: 0.68,
        },
      },
      {
        id: 'osc2',
        type: 'oscillator',
        label: 'Detune / Layer Osc',
        position: { x: 40, y: 270 },
        params: { waveform: isChoir ? 'triangle' : wf, octave: p === 87 ? -1 : 0, semitone: p === 86 ? 7 : 0, detune: def.detune ?? 7, gain: 0.34 },
      },
      {
        id: 'lfo1',
        type: 'lfo',
        label: 'Modulation LFO',
        position: { x: 40, y: 470 },
        params: { waveform: 'sine', rate: isChoir || def.archetype === 'pad' ? 0.35 : 5.2, depth: def.lfoDepth ?? 0.14, delay: 0.25 },
      },
      ...(isChoir
        ? [
            {
              id: 'fmt1',
              type: 'formantFilter' as const,
              label: 'Vocal Tract Formant',
              position: { x: 330, y: 90 },
              params: { vowel: p === 53 ? 3.7 : p === 91 ? 1.8 : 0.15, shift: 0, resonance: 7.2, spread: 1.0, mix: 0.86 },
            },
          ]
        : []),
      {
        id: 'flt1',
        type: 'filter',
        label: 'Timbre Filter',
        position: { x: isChoir ? 600 : 330, y: 90 },
        params: { mode: 'lowpass', cutoff, resonance: def.archetype === 'lead' ? 3.2 : 1.5, keyTrack: 0.45, gain: 0 },
      },
      ...(def.archetype === 'pad'
        ? [
            {
              id: 'cho1',
              type: 'chorus' as const,
              label: 'Stereo Ensemble',
              position: { x: isChoir ? 870 : 600, y: 90 },
              params: { voices: '4', rate: 0.32, depth: 0.48, stereoWidth: 0.86, tone: 6200, mix: 0.45 },
            },
          ]
        : []),
      {
        id: 'env1',
        type: 'envelope',
        label: 'Contour Envelope',
        position: { x: isChoir ? 1130 : def.archetype === 'pad' ? 870 : 600, y: 90 },
        params: { attack, decay, sustain, release, curve: def.archetype === 'pad' ? 'ambient' : 'standard', velocitySens: 0.72 },
      },
      {
        id: 'rev1',
        type: 'reverb',
        label: 'Studio Hall',
        position: { x: isChoir ? 1390 : def.archetype === 'pad' ? 1130 : 870, y: 90 },
        params: { size: def.archetype === 'pad' ? 2.8 : 1.5, damping: 0.5, mix: revMix },
      },
      {
        id: 'out1',
        type: 'output',
        label: 'Master Output',
        position: { x: isChoir ? 1650 : def.archetype === 'pad' ? 1390 : 1130, y: 90 },
        params: { gain: 0.86, pan: 0 },
      }
    );
    const firstStage = isChoir ? 'fmt1' : 'flt1';
    const postFilter = def.archetype === 'pad' ? 'cho1' : 'env1';
    connections.push(
      { id: 'c1', fromNode: 'osc1', fromPort: 'out', toNode: firstStage, toPort: 'in', amount: 0.9 },
      { id: 'c2', fromNode: 'osc2', fromPort: 'out', toNode: firstStage, toPort: 'in', amount: 0.7 },
      ...(isChoir
        ? [
            { id: 'c3', fromNode: 'fmt1', fromPort: 'out', toNode: 'flt1', toPort: 'in', amount: 1 },
            { id: 'c4', fromNode: 'lfo1', fromPort: 'cv', toNode: 'fmt1', toPort: 'vowel', amount: 0.25 },
          ]
        : [{ id: 'c3', fromNode: 'lfo1', fromPort: 'cv', toNode: 'osc1', toPort: 'pitch', amount: 0.08 }]),
      { id: 'c5', fromNode: 'env1', fromPort: 'cv', toNode: 'flt1', toPort: 'cutoff', amount: 0.24 },
      { id: 'c6', fromNode: 'flt1', fromPort: 'out', toNode: postFilter, toPort: 'in', amount: 1 },
      ...(def.archetype === 'pad'
        ? [{ id: 'c7', fromNode: 'cho1', fromPort: 'out', toNode: 'env1', toPort: 'in', amount: 1 }]
        : []),
      { id: 'c8', fromNode: 'env1', fromPort: 'out', toNode: 'rev1', toPort: 'in', amount: 1 },
      { id: 'c9', fromNode: 'rev1', fromPort: 'out', toNode: 'out1', toPort: 'in', amount: 1 }
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
    glideMs: def.archetype === 'lead' || p === 35 ? 24 : 0,
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
