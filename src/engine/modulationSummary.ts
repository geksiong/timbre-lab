import { MODULE_REGISTRY } from './moduleRegistry';
import { ModMatrixSlot, SynthPatch } from './types';

export interface NodeModulationSummary {
  nodeId: string;
  hasMacroX: boolean;
  hasMacroY: boolean;
  hasVelocity: boolean;
  hasModWheel: boolean;
  hasKeyTrack: boolean;
  modSlotCount: number;
  cvConnectionCount: number;
  totalRoutes: number;
  modulatedParamKeys: Set<string>;
  paramSourceTags: Record<string, string[]>;
  slots: ModMatrixSlot[];
}

function formatSourceShortTag(source: string, patch: SynthPatch): string {
  switch (source) {
    case 'macroX':
      return 'X';
    case 'macroY':
      return 'Y';
    case 'velocity':
      return 'VEL';
    case 'modWheel':
      return 'CC1';
    case 'keyTrack':
      return 'KEY';
    case 'random':
      return 'RND';
    case 'noise':
      return 'NSE';
    default: {
      const node = patch.nodes.find((n) => n.id === source);
      if (!node) return 'CV';
      if (node.type === 'lfo') return 'LFO';
      if (node.type === 'envelope') return 'ENV';
      if (node.type === 'stepSequencer') return 'SEQ';
      if (node.type === 'sampleHold') return 'S&H';
      if (node.type === 'slopeEnv') return 'SLP';
      if (node.type === 'envFollower') return 'EF';
      return 'CV';
    }
  }
}

export function computePatchModulationSummary(
  patch: SynthPatch
): Map<string, NodeModulationSummary> {
  const map = new Map<string, NodeModulationSummary>();

  const ensure = (nodeId: string): NodeModulationSummary => {
    let entry = map.get(nodeId);
    if (!entry) {
      entry = {
        nodeId,
        hasMacroX: false,
        hasMacroY: false,
        hasVelocity: false,
        hasModWheel: false,
        hasKeyTrack: false,
        modSlotCount: 0,
        cvConnectionCount: 0,
        totalRoutes: 0,
        modulatedParamKeys: new Set<string>(),
        paramSourceTags: {},
        slots: [],
      };
      map.set(nodeId, entry);
    }
    return entry;
  };

  for (const slot of patch.modMatrix ?? []) {
    if (!slot.enabled) continue;
    const entry = ensure(slot.targetNodeId);
    entry.modSlotCount += 1;
    entry.totalRoutes += 1;
    entry.slots.push(slot);
    entry.modulatedParamKeys.add(slot.targetParam);

    const sourcesToCheck = [slot.source, slot.via].filter(
      (s): s is string => Boolean(s && s !== 'none')
    );
    for (const src of sourcesToCheck) {
      if (src === 'macroX') entry.hasMacroX = true;
      else if (src === 'macroY') entry.hasMacroY = true;
      else if (src === 'velocity') entry.hasVelocity = true;
      else if (src === 'modWheel') entry.hasModWheel = true;
      else if (src === 'keyTrack') entry.hasKeyTrack = true;
    }

    const tag = formatSourceShortTag(slot.source, patch);
    const existingTags = entry.paramSourceTags[slot.targetParam] ?? [];
    if (!existingTags.includes(tag)) {
      entry.paramSourceTags[slot.targetParam] = [...existingTags, tag];
    }
  }

  for (const conn of patch.connections) {
    const srcNode = patch.nodes.find((n) => n.id === conn.fromNode);
    const dstNode = patch.nodes.find((n) => n.id === conn.toNode);
    const srcSig =
      srcNode &&
      MODULE_REGISTRY[srcNode.type]?.ports.find((p) => p.id === conn.fromPort)?.signal;
    const dstSig =
      dstNode &&
      MODULE_REGISTRY[dstNode.type]?.ports.find((p) => p.id === conn.toPort)?.signal;

    if (srcSig === 'cv' || dstSig === 'cv') {
      const entry = ensure(conn.toNode);
      entry.cvConnectionCount += 1;
      entry.totalRoutes += 1;
    }
  }

  return map;
}

export function arePatchesEquivalent(a: SynthPatch, b: SynthPatch): boolean {
  const stripMeta = (p: SynthPatch) => ({
    name: p.name,
    polyphony: p.polyphony,
    glideMs: p.glideMs,
    description: p.description,
    macroLabels: p.macroLabels ?? null,
    nodes: p.nodes,
    connections: p.connections,
    modMatrix: p.modMatrix ?? [],
  });
  return JSON.stringify(stripMeta(a)) === JSON.stringify(stripMeta(b));
}

export interface ScaleDefinition {
  id: string;
  label: string;
  intervals: number[]; // pitch classes 0..11 relative to C
}

export const MUSICAL_SCALES: ScaleDefinition[] = [
  { id: 'chromatic', label: 'Chromatic (All)', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  { id: 'major', label: 'C Major', intervals: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'minor', label: 'C Minor', intervals: [0, 2, 3, 5, 7, 8, 10] },
  { id: 'pentMajor', label: 'Pentatonic Maj', intervals: [0, 2, 4, 7, 9] },
  { id: 'pentMinor', label: 'Pentatonic Min', intervals: [0, 3, 5, 7, 10] },
  { id: 'dorian', label: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10] },
  { id: 'hijaz', label: 'Hijaz / Phrygian Dom', intervals: [0, 1, 4, 5, 7, 8, 10] },
];

export const CORE_ESSENTIAL_PARAM_KEYS: Record<string, string[]> = {
  oscillator: ['waveform', 'pulseWidth', 'wavetableBank', 'wavetablePos', 'formantVowel', 'noiseCutoff', 'octave', 'unison', 'gain'],
  fmOperator: ['carrierWave', 'pulseWidth', 'wavetableBank', 'wavetablePos', 'formantVowel', 'noiseCutoff', 'ratio', 'modIndex', 'noiseFmDepth', 'gain'],
  physicalString: ['excitation', 'bowPressure', 'damping', 'brightness', 'rosin', 'gain'],
  modalResonator: ['material', 'exciterType', 'decay', 'brightness', 'inharmonicity', 'gain'],
  blownPipe: ['boreType', 'breathPressure', 'embouchure', 'breathNoise', 'damping', 'gain'],
  subHarmonic: ['waveform', 'sub1Level', 'fundLevel', 'fifthLevel', 'octUpLevel', 'gain'],
  parametricEq: ['lowGain', 'mid1Freq', 'mid1Gain', 'mid2Freq', 'mid2Gain', 'highGain'],
  granularCloud: ['grainSize', 'density', 'pitchShift', 'spray', 'freeze', 'mix'],
  reverb: ['size', 'shimmerMix', 'damping', 'freeze', 'mix'],
  busCompressor: ['threshold', 'ratio', 'makeup', 'mix'],
};
