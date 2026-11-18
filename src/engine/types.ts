export type ModuleType =
  | 'oscillator'
  | 'fmOperator'
  | 'physicalString'
  | 'modalResonator'
  | 'blownPipe'
  | 'subHarmonic'
  | 'noise'
  | 'filter'
  | 'combFilter'
  | 'parametricEq'
  | 'formantFilter'
  | 'shaper'
  | 'wavefolder'
  | 'ringMod'
  | 'bitcrusher'
  | 'crossfader'
  | 'chorus'
  | 'granularCloud'
  | 'envelope'
  | 'lfo'
  | 'sampleHold'
  | 'slopeEnv'
  | 'stepSequencer'
  | 'envFollower'
  | 'delay'
  | 'reverb'
  | 'output';

export type PortSignalType = 'audio' | 'cv';

export type PortDirection = 'in' | 'out';

export interface PortSpec {
  id: string;
  label: string;
  direction: PortDirection;
  signal: PortSignalType;
}

export type ParamControlType = 'range' | 'select' | 'toggle';

export interface ParamSpec {
  key: string;
  label: string;
  type: ParamControlType;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  scale?: 'linear' | 'log';
  options?: { value: string; label: string }[];
  defaultValue: number | string | boolean;
  /** Plain-English explanation shown in the inspector */
  tooltip?: string;
  /** Optional visibility predicate evaluated against the node's active params */
  visibleWhen?: (params: Record<string, number | string | boolean>) => boolean;
}

export interface ModuleDefinition {
  type: ModuleType;
  label: string;
  category: 'source' | 'processor' | 'modulator' | 'fx' | 'io';
  description: string;
  /** Plain-English explanation of what this DSP module does acoustically */
  acousticGuide?: string;
  /** Specific practical tip for simulating bowed instruments */
  bowedTip?: string;
  ports: PortSpec[];
  params: ParamSpec[];
}

export interface SynthNode {
  id: string;
  type: ModuleType;
  label?: string;
  position: { x: number; y: number };
  bypassed?: boolean;
  params: Record<string, number | string | boolean>;
}

export interface SynthConnection {
  id: string;
  fromNode: string;
  fromPort: string;
  toNode: string;
  toPort: string;
  /** Modulation depth (-1..1 or Hz/gain scalar depending on target) or audio gain (0..2) */
  amount: number;
}

export type ModSourceType =
  | 'velocity'
  | 'keyTrack'
  | 'modWheel'
  | 'macroX'
  | 'macroY'
  | 'random'
  | 'noise'
  | string;

export type ModCurveType = 'linear' | 'exp' | 'scurve';

export interface ModMatrixSlot {
  id: string;
  enabled: boolean;
  source: ModSourceType;
  via?: ModSourceType | 'none';
  targetNodeId: string;
  targetParam: string;
  /** Bipolar modulation depth (-1..1) */
  amount: number;
  curve: ModCurveType;
  label?: string;
}

export type PresetCategory =
  | 'ethnic'
  | 'ambient'
  | 'gm-piano'
  | 'gm-chromatic'
  | 'gm-organ'
  | 'gm-guitar'
  | 'gm-bass'
  | 'gm-strings'
  | 'gm-ensemble'
  | 'gm-brass'
  | 'gm-reed'
  | 'gm-pipe'
  | 'gm-synth-lead'
  | 'gm-synth-pad'
  | 'gm-synth-fx'
  | 'gm-ethnic'
  | 'gm-percussion'
  | 'gm-sfx'
  | 'custom';

export interface SynthPatch {
  schemaVersion: '1.0';
  id: string;
  name: string;
  category: PresetCategory;
  regionOrFamily?: string;
  gmProgram?: number;
  description: string;
  tags: string[];
  polyphony: number;
  glideMs: number;
  macroLabels?: { x: string; y: string };
  macroDefaults?: { x: number; y: number };
  nodes: SynthNode[];
  connections: SynthConnection[];
  modMatrix?: ModMatrixSlot[];
  updatedAt?: string;
}

export interface TuneNote {
  /** Start beat in quarter-note beats */
  beat: number;
  /** Duration in quarter-note beats */
  duration: number;
  /** MIDI note number 0-127 */
  midi: number;
  /** Velocity 1-127 */
  velocity: number;
}

export interface TuneSequence {
  id: string;
  title: string;
  origin: string;
  bpm: number;
  suggestedPresetId: string;
  description: string;
  totalBeats: number;
  notes: TuneNote[];
}

export interface MidiDeviceInfo {
  id: string;
  name: string;
  manufacturer: string;
  state: string;
}

export interface MidiActivityEvent {
  timestamp: number;
  bytes: number[];
  summary: string;
}

export interface LatencyMetrics {
  state: 'standby' | 'suspended' | 'running';
  latencyMode: 'interactive' | 'ultralow';
  sampleRate: number;
  renderQuantumSamples: number;
  renderQuantumMs: number;
  baseLatencyMs: number;
  outputLatencyMs: number;
  dspBuildMs: number;
  inputToDspMs: number;
  lookaheadMs: number;
  totalMs: number;
  lastSource: 'keyboard' | 'midi' | 'tune' | 'engine';
}
