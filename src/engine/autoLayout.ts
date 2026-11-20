import { MODULE_REGISTRY } from './moduleRegistry';
import { SynthNode, SynthPatch } from './types';

export type AutoLayoutMode = '2d-flow' | 'wide-bus';

export const NODE_WIDTH = 256;
export const NODE_HEADER_H = 36;
export const NODE_SUMMARY_H = 28;
export const NODE_PORTS_PAD_TOP = 6;
export const NODE_PORTS_PAD_BOTTOM = 6;
export const NODE_PORT_ROW_H = 30;

export function getNodeHeight(node: SynthNode): number {
  const def = MODULE_REGISTRY[node.type];
  if (!def) return NODE_HEADER_H + NODE_SUMMARY_H + 42;
  const inCount = def.ports.filter((p) => p.direction === 'in').length;
  const outCount = def.ports.filter((p) => p.direction === 'out').length;
  const rows = Math.max(1, Math.max(inCount, outCount));
  return NODE_HEADER_H + NODE_SUMMARY_H + NODE_PORTS_PAD_TOP + NODE_PORTS_PAD_BOTTOM + rows * NODE_PORT_ROW_H;
}

function snap8(v: number): number {
  return Math.round(v / 8) * 8;
}

function getPortSignal(node: SynthNode, portId: string): 'audio' | 'cv' {
  return MODULE_REGISTRY[node.type]?.ports.find((p) => p.id === portId)?.signal ?? 'audio';
}

function getPortRowFraction(node: SynthNode, portId: string, direction: 'in' | 'out'): number {
  const def = MODULE_REGISTRY[node.type];
  if (!def) return 0.5;
  const sameDir = def.ports.filter((p) => p.direction === direction);
  if (sameDir.length <= 1) return 0.5;
  const idx = Math.max(0, sameDir.findIndex((p) => p.id === portId));
  return (idx + 0.5) / sameDir.length;
}

const TYPE_SORT_WEIGHT: Record<string, number> = {
  physicalString: 0,
  blownPipe: 1,
  modalResonator: 2,
  oscillator: 3,
  fmOperator: 4,
  subHarmonic: 5,
  noise: 6,
  combFilter: 10,
  formantFilter: 11,
  filter: 12,
  parametricEq: 13,
  shaper: 14,
  wavefolder: 15,
  ringMod: 16,
  bitcrusher: 17,
  crossfader: 18,
  chorus: 20,
  phaser: 21,
  granularCloud: 22,
  envelope: 25,
  delay: 30,
  reverb: 31,
  busCompressor: 32,
  output: 40,
  slopeEnv: 50,
  lfo: 51,
  sampleHold: 52,
  stepSequencer: 53,
  envFollower: 54,
  quantizer: 55,
  cvUtility: 56,
};

export function computeAutoLayout(patch: SynthPatch, mode: AutoLayoutMode = '2d-flow'): SynthNode[] {
  const nodes = patch.nodes;
  if (nodes.length === 0) return nodes;

  const nodeMap = new Map<string, SynthNode>(nodes.map((n) => [n.id, n]));
  const originalOrder = new Map<string, number>(nodes.map((n, idx) => [n.id, idx]));

  interface DirEdge {
    from: string;
    to: string;
    fromPort: string;
    toPort: string;
    signal: 'audio' | 'cv';
  }

  const audioEdges: DirEdge[] = [];
  const cvEdges: DirEdge[] = [];
  const modEdges: { from: string; to: string }[] = [];

  const audioConnectedIds = new Set<string>();
  const allConnectedIds = new Set<string>();

  for (const c of patch.connections) {
    const fn = nodeMap.get(c.fromNode);
    const tn = nodeMap.get(c.toNode);
    if (!fn || !tn || fn.id === tn.id) continue;
    const fromSig = getPortSignal(fn, c.fromPort);
    const toSig = getPortSignal(tn, c.toPort);
    allConnectedIds.add(fn.id);
    allConnectedIds.add(tn.id);
    if (fromSig === 'audio' && toSig === 'audio') {
      audioEdges.push({
        from: fn.id,
        to: tn.id,
        fromPort: c.fromPort,
        toPort: c.toPort,
        signal: 'audio',
      });
      audioConnectedIds.add(fn.id);
      audioConnectedIds.add(tn.id);
    } else {
      cvEdges.push({
        from: fn.id,
        to: tn.id,
        fromPort: c.fromPort,
        toPort: c.toPort,
        signal: 'cv',
      });
    }
  }

  for (const slot of patch.modMatrix ?? []) {
    if (slot.enabled === false) continue;
    if (nodeMap.has(slot.source) && nodeMap.has(slot.targetNodeId) && slot.source !== slot.targetNodeId) {
      allConnectedIds.add(slot.source);
      allConnectedIds.add(slot.targetNodeId);
      modEdges.push({ from: slot.source, to: slot.targetNodeId });
    }
  }

  // Classify nodes: Audio Spine vs CV/Modulator vs Unwired
  const audioSpineIds = new Set<string>();
  const cvNodeIds = new Set<string>();
  const unwiredIds: string[] = [];

  for (const n of nodes) {
    if (n.type === 'output') {
      audioSpineIds.add(n.id);
      continue;
    }
    if (!allConnectedIds.has(n.id)) {
      unwiredIds.push(n.id);
      continue;
    }
    if (audioConnectedIds.has(n.id)) {
      audioSpineIds.add(n.id);
      continue;
    }
    const cat = MODULE_REGISTRY[n.type]?.category;
    if (cat === 'modulator' || cat === 'utility') {
      cvNodeIds.add(n.id);
    } else {
      // Source/filter/fx node only connected via CV (rare, e.g. envFollower/mod-only)
      audioSpineIds.add(n.id);
    }
  }

  // Build acyclic audio graph (break any accidental cycle via DFS)
  const audioAdj = new Map<string, string[]>();
  const audioInDeg = new Map<string, number>();
  for (const id of audioSpineIds) {
    audioAdj.set(id, []);
    audioInDeg.set(id, 0);
  }

  const rawAudioOut = new Map<string, string[]>();
  for (const id of audioSpineIds) rawAudioOut.set(id, []);
  for (const e of audioEdges) {
    if (audioSpineIds.has(e.from) && audioSpineIds.has(e.to)) {
      const list = rawAudioOut.get(e.from)!;
      if (!list.includes(e.to)) list.push(e.to);
    }
  }

  const dfsState = new Map<string, 0 | 1 | 2>();
  const safeAudioEdgeList: [string, string][] = [];
  const visitAudio = (u: string) => {
    dfsState.set(u, 1);
    for (const v of rawAudioOut.get(u) || []) {
      const st = dfsState.get(v) ?? 0;
      if (st === 1) continue; // cycle back-edge ignored
      safeAudioEdgeList.push([u, v]);
      if (st === 0) visitAudio(v);
    }
    dfsState.set(u, 2);
  };
  for (const id of audioSpineIds) {
    if ((dfsState.get(id) ?? 0) === 0) visitAudio(id);
  }

  for (const [u, v] of safeAudioEdgeList) {
    audioAdj.get(u)!.push(v);
    audioInDeg.set(v, (audioInDeg.get(v) ?? 0) + 1);
  }

  // Longest-path topological ranking for Audio Spine
  const rawRank = new Map<string, number>();
  for (const id of audioSpineIds) rawRank.set(id, 0);

  const queue: string[] = [];
  for (const id of audioSpineIds) {
    if ((audioInDeg.get(id) ?? 0) === 0) queue.push(id);
  }

  const inDegWork = new Map(audioInDeg);
  while (queue.length > 0) {
    const u = queue.shift()!;
    const ru = rawRank.get(u) ?? 0;
    for (const v of audioAdj.get(u) || []) {
      rawRank.set(v, Math.max(rawRank.get(v) ?? 0, ru + 1));
      const nextDeg = (inDegWork.get(v) ?? 1) - 1;
      inDegWork.set(v, nextDeg);
      if (nextDeg === 0) queue.push(v);
    }
  }

  // Ensure Output nodes always sit at the final stage of the Audio Spine
  let maxNonOutputRank = 0;
  for (const id of audioSpineIds) {
    const node = nodeMap.get(id)!;
    if (node.type !== 'output') {
      maxNonOutputRank = Math.max(maxNonOutputRank, rawRank.get(id) ?? 0);
    }
  }
  for (const id of audioSpineIds) {
    const node = nodeMap.get(id)!;
    if (node.type === 'output') {
      const current = rawRank.get(id) ?? 0;
      if (current <= maxNonOutputRank && audioSpineIds.size > 1) {
        rawRank.set(id, maxNonOutputRank + 1);
      }
    }
  }

  // Place CV-only nodes relative to their downstream targets (including CV->CV chains)
  const cvTargetMap = new Map<string, string[]>();
  for (const id of cvNodeIds) cvTargetMap.set(id, []);
  for (const e of cvEdges) {
    if (cvNodeIds.has(e.from)) {
      const list = cvTargetMap.get(e.from)!;
      if (!list.includes(e.to)) list.push(e.to);
    }
  }
  for (const m of modEdges) {
    if (cvNodeIds.has(m.from)) {
      const list = cvTargetMap.get(m.from)!;
      if (!list.includes(m.to)) list.push(m.to);
    }
  }

  // Resolve target rank for CV nodes (reverse topological / memoized with cycle guard)
  const visitingCv = new Set<string>();
  const resolveCvRank = (id: string): number => {
    if (rawRank.has(id)) return rawRank.get(id)!;
    if (visitingCv.has(id)) return 0;
    visitingCv.add(id);

    const targets = cvTargetMap.get(id) || [];
    let minTargetRank = Infinity;
    for (const t of targets) {
      if (audioSpineIds.has(t)) {
        minTargetRank = Math.min(minTargetRank, rawRank.get(t) ?? 0);
      } else if (cvNodeIds.has(t)) {
        minTargetRank = Math.min(minTargetRank, resolveCvRank(t));
      }
    }

    visitingCv.delete(id);
    const assigned = Number.isFinite(minTargetRank) ? minTargetRank - 1 : 0;
    rawRank.set(id, assigned);
    return assigned;
  };

  for (const id of cvNodeIds) {
    resolveCvRank(id);
  }

  // Handle CV nodes that RECEIVE from an Audio node (e.g. envFollower fed by audio, or CV node with incoming edge from audio)
  // For envFollower whose input comes from audio stage k and outputs CV to stage m:
  // Ensure it sits at least 1 stage after its audio feeder if it doesn't precede all audio.
  for (const e of [...audioEdges, ...cvEdges]) {
    if (audioSpineIds.has(e.from) && cvNodeIds.has(e.to)) {
      const fromRank = rawRank.get(e.from) ?? 0;
      const toRank = rawRank.get(e.to) ?? 0;
      if (toRank <= fromRank) {
        rawRank.set(e.to, fromRank + 1);
      }
    }
  }

  // Normalize ranks so minimum stage is 0
  let minRank = 0;
  for (const r of rawRank.values()) {
    if (r < minRank) minRank = r;
  }
  const shift = -minRank;
  const stageOf = new Map<string, number>();
  let maxStage = 0;
  for (const [id, r] of rawRank.entries()) {
    const s = r + shift;
    stageOf.set(id, s);
    if (s > maxStage) maxStage = s;
  }

  const totalStages = maxStage + 1;

  // Bucket into audio spine & CV lane per stage
  const audioBuckets: string[][] = Array.from({ length: totalStages }, () => []);
  const cvBuckets: string[][] = Array.from({ length: totalStages }, () => []);

  for (const id of audioSpineIds) {
    const s = stageOf.get(id) ?? 0;
    audioBuckets[s].push(id);
  }
  for (const id of cvNodeIds) {
    const s = stageOf.get(id) ?? 0;
    cvBuckets[s].push(id);
  }

  const defaultSort = (a: string, b: string) => {
    const na = nodeMap.get(a)!;
    const nb = nodeMap.get(b)!;
    const wa = TYPE_SORT_WEIGHT[na.type] ?? 20;
    const wb = TYPE_SORT_WEIGHT[nb.type] ?? 20;
    if (wa !== wb) return wa - wb;
    return (originalOrder.get(a) ?? 0) - (originalOrder.get(b) ?? 0);
  };

  for (let s = 0; s < totalStages; s++) {
    audioBuckets[s].sort(defaultSort);
    cvBuckets[s].sort(defaultSort);
  }

  // Build neighbor lookup for barycenter crossing minimization
  const allWirePairs: { from: string; to: string; fromPort: string; toPort: string }[] = [
    ...audioEdges,
    ...cvEdges,
    ...modEdges.map((m) => ({ from: m.from, to: m.to, fromPort: 'cv', toPort: 'cv' })),
  ];

  const getRankIndex = (id: string): number => {
    const s = stageOf.get(id) ?? 0;
    const aIdx = audioBuckets[s].indexOf(id);
    if (aIdx >= 0) return aIdx;
    const cIdx = cvBuckets[s].indexOf(id);
    return audioBuckets[s].length + Math.max(0, cIdx);
  };

  const sortBucketByBarycenter = (bucket: string[], stage: number, direction: 'forward' | 'backward') => {
    if (bucket.length <= 1) return;
    const scores = new Map<string, number>();
    bucket.forEach((id, currentIdx) => {
      let sum = 0;
      let count = 0;
      const node = nodeMap.get(id)!;
      for (const w of allWirePairs) {
        if (direction === 'forward' && w.to === id) {
          const fs = stageOf.get(w.from) ?? 0;
          if (fs < stage) {
            const fromNode = nodeMap.get(w.from)!;
            const portBias = getPortRowFraction(fromNode, w.fromPort, 'out') * 0.25;
            const distWeight = 1 / Math.max(1, stage - fs);
            sum += (getRankIndex(w.from) + portBias) * distWeight;
            count += distWeight;
          }
        } else if (direction === 'backward' && w.from === id) {
          const ts = stageOf.get(w.to) ?? 0;
          if (ts > stage) {
            const toNode = nodeMap.get(w.to)!;
            const portBias = getPortRowFraction(toNode, w.toPort, 'in') * 0.25;
            const distWeight = 1 / Math.max(1, ts - stage);
            sum += (getRankIndex(w.to) + portBias) * distWeight;
            count += distWeight;
          }
        }
        // Also check outgoing connections for CV nodes during forward sweep so modulators sort by target Y
        if (direction === 'forward' && cvNodeIds.has(id) && w.from === id) {
          const ts = stageOf.get(w.to) ?? 0;
          if (ts >= stage) {
            sum += getRankIndex(w.to) * 0.6;
            count += 0.6;
          }
        }
        void node;
      }
      scores.set(id, count > 0 ? sum / count : currentIdx + 0.001 * (TYPE_SORT_WEIGHT[node.type] ?? 20));
    });

    bucket.sort((a, b) => {
      const diff = (scores.get(a) ?? 0) - (scores.get(b) ?? 0);
      if (Math.abs(diff) > 1e-4) return diff;
      return defaultSort(a, b);
    });
  };

  for (let pass = 0; pass < 4; pass++) {
    for (let s = 0; s < totalStages; s++) {
      sortBucketByBarycenter(audioBuckets[s], s, 'forward');
      sortBucketByBarycenter(cvBuckets[s], s, 'forward');
    }
    for (let s = totalStages - 1; s >= 0; s--) {
      sortBucketByBarycenter(audioBuckets[s], s, 'backward');
      sortBucketByBarycenter(cvBuckets[s], s, 'backward');
    }
  }

  // Determine 2D tier wrapping
  let colsPerTier = totalStages;
  if (mode === '2d-flow') {
    if (totalStages <= 4) {
      colsPerTier = totalStages;
    } else if (totalStages <= 6) {
      colsPerTier = 3;
    } else if (totalStages <= 8) {
      colsPerTier = 4;
    } else if (totalStages <= 10) {
      colsPerTier = 5;
    } else {
      const targetRows = Math.ceil(totalStages / 4);
      colsPerTier = Math.ceil(totalStages / targetRows);
    }
  }
  colsPerTier = Math.max(1, colsPerTier);
  const numTiers = Math.ceil(totalStages / colsPerTier);

  const START_X = 56;
  const START_Y = 64;
  const COL_GAP = 104;
  const COL_STEP = NODE_WIDTH + COL_GAP;
  const NODE_GAP_Y = 28;
  const CV_BAND_GAP = 54;
  const TIER_GUTTER_Y = 96;

  const positions = new Map<string, { x: number; y: number }>();
  let currentTierTop = START_Y;

  for (let tier = 0; tier < numTiers; tier++) {
    const sStart = tier * colsPerTier;
    const sEnd = Math.min(totalStages - 1, sStart + colsPerTier - 1);

    // For each stage in this tier, determine whether CV nodes sit in the primary column
    // (when the column has NO audio spine nodes, e.g. Stage 0 modulators feeding Stage 1 sources)
    // or in the dedicated CV modulation sub-band below the audio spine.
    const primaryIdsPerStage = new Map<number, string[]>();
    const subCvIdsPerStage = new Map<number, string[]>();

    for (let s = sStart; s <= sEnd; s++) {
      if (audioBuckets[s].length > 0) {
        primaryIdsPerStage.set(s, audioBuckets[s]);
        subCvIdsPerStage.set(s, cvBuckets[s]);
      } else {
        primaryIdsPerStage.set(s, cvBuckets[s]);
        subCvIdsPerStage.set(s, []);
      }
    }

    const stackHeight = (ids: string[]) => {
      if (ids.length === 0) return 0;
      let total = 0;
      for (let i = 0; i < ids.length; i++) {
        total += getNodeHeight(nodeMap.get(ids[i])!);
        if (i < ids.length - 1) total += NODE_GAP_Y;
      }
      return total;
    };

    let maxPrimaryHeight = 0;
    for (let s = sStart; s <= sEnd; s++) {
      maxPrimaryHeight = Math.max(maxPrimaryHeight, stackHeight(primaryIdsPerStage.get(s)!));
    }

    // Place primary stack per column, vertically centering single/smaller stacks relative to feeding nodes in this tier
    for (let s = sStart; s <= sEnd; s++) {
      const col = s - sStart;
      const x = snap8(START_X + col * COL_STEP);
      const ids = primaryIdsPerStage.get(s)!;
      if (ids.length === 0) continue;

      const h = stackHeight(ids);
      let topY = currentTierTop + (maxPrimaryHeight - h) / 2;

      // If single primary node and fed by nodes already placed in this tier, align to feeder center
      if (ids.length === 1 && col > 0) {
        const targetId = ids[0];
        const feederCenters: number[] = [];
        for (const e of allWirePairs) {
          if (e.to === targetId) {
            const fs = stageOf.get(e.from) ?? -1;
            if (fs >= sStart && fs < s && positions.has(e.from)) {
              const fPos = positions.get(e.from)!;
              const fH = getNodeHeight(nodeMap.get(e.from)!);
              feederCenters.push(fPos.y + fH / 2);
            }
          }
        }
        if (feederCenters.length > 0) {
          const avgCenter = feederCenters.reduce((a, b) => a + b, 0) / feederCenters.length;
          const idealTop = avgCenter - h / 2;
          const minTop = currentTierTop;
          const maxTop = currentTierTop + Math.max(0, maxPrimaryHeight - h);
          topY = Math.max(minTop, Math.min(maxTop, idealTop));
        }
      }

      let cursorY = topY;
      for (const id of ids) {
        positions.set(id, { x, y: snap8(cursorY) });
        cursorY += getNodeHeight(nodeMap.get(id)!) + NODE_GAP_Y;
      }
    }

    // Place CV sub-band below the primary spine of this tier
    let maxSubCvHeight = 0;
    const subCvTop = currentTierTop + maxPrimaryHeight + CV_BAND_GAP;

    for (let s = sStart; s <= sEnd; s++) {
      const subIds = subCvIdsPerStage.get(s)!;
      if (subIds.length === 0) continue;
      const col = s - sStart;
      const x = snap8(START_X + col * COL_STEP);
      let cursorY = subCvTop;
      for (const id of subIds) {
        positions.set(id, { x, y: snap8(cursorY) });
        cursorY += getNodeHeight(nodeMap.get(id)!) + NODE_GAP_Y;
      }
      maxSubCvHeight = Math.max(maxSubCvHeight, stackHeight(subIds));
    }

    const tierTotalHeight =
      maxSubCvHeight > 0 ? maxPrimaryHeight + CV_BAND_GAP + maxSubCvHeight : maxPrimaryHeight;

    currentTierTop = snap8(currentTierTop + tierTotalHeight + TIER_GUTTER_Y);
  }

  // Place completely unwired nodes neatly in a compact 2D row below the main graph
  if (unwiredIds.length > 0) {
    unwiredIds.sort(defaultSort);
    const unwiredCols = Math.max(3, Math.min(colsPerTier, 4));
    let rowTop = positions.size > 0 ? currentTierTop - 24 : START_Y;
    for (let i = 0; i < unwiredIds.length; i += unwiredCols) {
      const slice = unwiredIds.slice(i, i + unwiredCols);
      let maxRowH = 0;
      slice.forEach((id, idx) => {
        const x = snap8(START_X + idx * COL_STEP);
        positions.set(id, { x, y: snap8(rowTop) });
        maxRowH = Math.max(maxRowH, getNodeHeight(nodeMap.get(id)!));
      });
      rowTop += maxRowH + NODE_GAP_Y;
    }
  }

  return nodes.map((n) => ({
    ...n,
    position: positions.get(n.id) ?? n.position,
  }));
}
