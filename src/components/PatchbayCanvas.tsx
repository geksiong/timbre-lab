import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  ZoomIn,
  ZoomOut,
  Maximize2,
  LayoutGrid,
  Unlink,
  Power,
  X,
  AudioLines,
} from 'lucide-react';
import {
  ADDABLE_CATEGORY_ORDER,
  MODULE_CATEGORY_META,
  MODULE_REGISTRY,
  isCyanModuleCategory,
} from '../engine/moduleRegistry';
import {
  AutoLayoutMode,
  NODE_HEADER_H,
  NODE_PORTS_PAD_TOP,
  NODE_PORT_ROW_H,
  NODE_SUMMARY_H,
  NODE_WIDTH,
  getNodeHeight,
} from '../engine/autoLayout';
import { formatCarrierSummary, isAlternativeCarrierWaveform } from '../engine/carrierWaves';
import { ModuleType, PortSpec, SynthConnection, SynthNode, SynthPatch } from '../engine/types';
import { PrecisionSlider } from './PrecisionSlider';

interface PatchbayCanvasProps {
  patch: SynthPatch;
  selectedNodeId: string | null;
  activeNotesCount: number;
  layoutMode: AutoLayoutMode;
  onChangeLayoutMode: (mode: AutoLayoutMode) => void;
  onSelectNode: (nodeId: string | null) => void;
  onMoveNode: (nodeId: string, position: { x: number; y: number }) => void;
  onAddNode: (type: ModuleType, position: { x: number; y: number }) => void;
  onToggleBypass: (nodeId: string) => void;
  onAddConnection: (fromNode: string, fromPort: string, toNode: string, toPort: string) => void;
  onUpdateConnectionAmount: (connId: string, amount: number) => void;
  onDeleteConnection: (connId: string) => void;
  onAutoLayout: (mode?: AutoLayoutMode) => void;
  onOpenSampleAnalyzer?: () => void;
  theme?: 'light' | 'dark';
}

function getPortCenter(node: SynthNode, portId: string, direction: 'in' | 'out'): { x: number; y: number } {
  const def = MODULE_REGISTRY[node.type];
  if (!def) {
    return { x: node.position.x, y: node.position.y };
  }
  const sameDir = def.ports.filter((p) => p.direction === direction);
  const idx = Math.max(0, sameDir.findIndex((p) => p.id === portId));
  return {
    x: node.position.x + (direction === 'in' ? 0 : NODE_WIDTH),
    y:
      node.position.y +
      NODE_HEADER_H +
      NODE_SUMMARY_H +
      NODE_PORTS_PAD_TOP +
      idx * NODE_PORT_ROW_H +
      NODE_PORT_ROW_H / 2,
  };
}

function getNodeSummary(node: SynthNode): string {
  const p = node.params;
  switch (node.type) {
    case 'oscillator': {
      const uni = Number(p.unison ?? 1);
      const wf = String(p.waveform ?? 'saw');
      const wfText = isAlternativeCarrierWaveform(wf) ? formatCarrierSummary(wf, p) : wf;
      return `${wfText}${uni > 1 ? ` ${uni}x` : ''} · ${Number(p.octave ?? 0)} oct`;
    }
    case 'fmOperator': {
      const cwf = String(p.carrierWave ?? 'sine');
      const cPrefix = isAlternativeCarrierWaveform(cwf) ? `${formatCarrierSummary(cwf, p)} · ` : '';
      return `${cPrefix}ratio ${Number(p.ratio ?? 2).toFixed(2)}x · idx ${Math.round(Number(p.modIndex ?? 260))}`;
    }
    case 'physicalString':
      return `${String(p.excitation ?? 'pluck')} · damp ${Number(p.damping ?? 0.45).toFixed(2)}`;
    case 'modalResonator':
      return `${String(p.material ?? 'bell')} · ${String(p.exciterType ?? 'mallet')} · ${Number(p.decay ?? 1.4).toFixed(1)}s`;
    case 'blownPipe':
      return `${String(p.boreType ?? 'flute')} · breath ${Math.round(Number(p.breathPressure ?? 0.65) * 100)}%`;
    case 'subHarmonic':
      return `${String(p.waveform ?? 'triangle')} · sub ${Math.round(Number(p.sub1Level ?? 0.55) * 100)}% · 5th ${Math.round(Number(p.fifthLevel ?? 0.25) * 100)}%`;
    case 'noise':
      return `${String(p.color ?? 'pink')} · ${Math.round(Number(p.tone ?? 2200))} Hz`;
    case 'combFilter': {
      const mode = String(p.mode ?? 'feedback');
      const locked = Boolean(p.keyTrack ?? true);
      return `${mode} · ${locked ? `${Number(p.ratio ?? 0.15).toFixed(2)}x` : `${Number(p.delayMs ?? 4.5).toFixed(1)} ms`}`;
    }
    case 'parametricEq':
      return `${Math.round(Number(p.mid1Freq ?? 420))}Hz / ${Math.round(Number(p.mid2Freq ?? 2400))}Hz`;
    case 'filter':
      return `${String(p.mode ?? 'lowpass')} · ${Math.round(Number(p.cutoff ?? 3200))} Hz`;
    case 'shaper':
      return `drive ${Math.round(Number(p.drive ?? 0.25) * 100)}% · mix ${Math.round(Number(p.mix ?? 0.6) * 100)}%`;
    case 'formantFilter':
      return `vowel ${Number(p.vowel ?? 0.5).toFixed(1)} · Q ${Number(p.resonance ?? 7.5).toFixed(1)}`;
    case 'wavefolder':
      return `fold ${Number(p.folds ?? 2.4).toFixed(1)}x · ${Number(p.stages ?? 2)}stg`;
    case 'ringMod':
      return `${String(p.mode ?? 'ring')} · ${p.tuneMode === 'freeHz' ? `${Math.round(Number(p.frequency ?? 320))}Hz` : `${Number(p.ratio ?? 1.41).toFixed(2)}x`}`;
    case 'bitcrusher':
      return `${Number(p.bits ?? 8).toFixed(0)}-bit · ${Number(p.downsample ?? 4)}x hold`;
    case 'crossfader':
      return `A↔B ${Math.round(Number(p.balance ?? 0.5) * 100)}% · ${String(p.curve ?? 'equalPower')}`;
    case 'chorus':
      return `${Number(p.voices ?? 4)}-tap · ${Number(p.rate ?? 0.42).toFixed(2)} Hz · ${Math.round(Number(p.mix ?? 0.52) * 100)}%`;
    case 'phaser':
      return `${String(p.mode ?? 'phaser')} · ${Number(p.rate ?? 0.45).toFixed(2)} Hz · ${Math.round(Number(p.mix ?? 0.6) * 100)}%`;
    case 'granularCloud': {
      const frozen = Boolean(p.freeze);
      const st = Number(p.pitchShift ?? 12);
      return `${frozen ? 'FROZEN · ' : ''}${st >= 0 ? `+${st}` : st}st · ${Math.round(Number(p.mix ?? 0.55) * 100)}%`;
    }
    case 'envelope':
      return `A ${Number(p.attack ?? 0.015).toFixed(2)}s · R ${Number(p.release ?? 0.45).toFixed(2)}s`;
    case 'lfo':
      return `${String(p.waveform ?? 'sine')} · ${Number(p.rate ?? 5.2).toFixed(2)} Hz`;
    case 'sampleHold':
      return `${String(p.sourceMode ?? 'random')} · ${Number(p.rate ?? 4.5).toFixed(1)} Hz · slew ${Math.round(Number(p.slew ?? 0.15) * 100)}%`;
    case 'slopeEnv':
      return `${String(p.mode ?? 'oneShot')} · R ${Number(p.rise ?? 0.04).toFixed(2)}s / F ${Number(p.fall ?? 0.45).toFixed(2)}s`;
    case 'stepSequencer':
      return `${Number(p.steps ?? 8)} steps · ${Number(p.rate ?? 4.0).toFixed(1)} Hz · ${String(p.direction ?? 'forward')}`;
    case 'envFollower':
      return `A ${Math.round(Number(p.attackMs ?? 8))}ms · R ${Math.round(Number(p.releaseMs ?? 140))}ms${p.invert ? ' · INV' : ''}`;
    case 'quantizer': {
      const tr = Number(p.transpose ?? 0);
      return `${String(p.scale ?? 'pentatonicMinor')}${tr !== 0 ? ` · ${tr > 0 ? `+${tr}` : tr}st` : ''}`;
    }
    case 'cvUtility':
      return `A×${Number(p.gainA ?? 1).toFixed(1)} + B×${Number(p.gainB ?? 0.5).toFixed(1)}${p.rectify && p.rectify !== 'none' ? ` · ${String(p.rectify)}` : ''}`;
    case 'delay':
      return `${Math.round(Number(p.time ?? 0.26) * 1000)} ms · fb ${Math.round(Number(p.feedback ?? 0.32) * 100)}%`;
    case 'reverb': {
      const sh = Number(p.shimmerMix ?? 0);
      const fr = Boolean(p.freeze);
      return `${Number(p.size ?? 1.4).toFixed(1)}s${fr ? ' · FRZ' : sh > 0.02 ? ` · shm ${Math.round(sh * 100)}%` : ''} · ${Math.round(Number(p.mix ?? 0.28) * 100)}%`;
    }
    case 'busCompressor':
      return `${Math.round(Number(p.threshold ?? -16))} dB · ${Number(p.ratio ?? 4).toFixed(1)}:1 · mix ${Math.round(Number(p.mix ?? 0.85) * 100)}%`;
    case 'output':
      return `gain ${Math.round(Number(p.gain ?? 0.82) * 100)}%`;
    default:
      return '';
  }
}

function buildPendingBezier(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(48, Math.abs(x2 - x1) * 0.5);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

interface CableRoute {
  d: string;
  midX: number;
  midY: number;
  midAngleDeg: number;
  showMidChevron: boolean;
}

function buildCableRoute(
  start: { x: number; y: number },
  end: { x: number; y: number },
  fromNode: SynthNode,
  toNode: SynthNode,
  allNodes: SynthNode[],
  laneOffsetIndex: number
): CableRoute {
  const x1 = start.x;
  const y1 = start.y;
  const x2 = end.x;
  const y2 = end.y;

  // Standard left-to-right forward curve
  if (x2 >= x1 + 24) {
    const dx = Math.max(44, Math.min(200, (x2 - x1) * 0.48));
    const cp1x = x1 + dx;
    const cp1y = y1;
    const cp2x = x2 - dx;
    const cp2y = y2;

    // Evaluate cubic bezier position & tangent at t = 0.5
    const midX = 0.125 * x1 + 0.375 * cp1x + 0.375 * cp2x + 0.125 * x2;
    const midY = 0.125 * y1 + 0.375 * cp1y + 0.375 * cp2y + 0.125 * y2;
    const tanX = 0.75 * (cp1x - x1) + 1.5 * (cp2x - cp1x) + 0.75 * (x2 - cp2x);
    const tanY = 0.75 * (cp1y - y1) + 1.5 * (cp2y - cp1y) + 0.75 * (y2 - cp2y);
    const dist = Math.hypot(x2 - x1, y2 - y1);

    return {
      d: `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`,
      midX,
      midY,
      midAngleDeg: (Math.atan2(tanY, tanX) * 180) / Math.PI,
      showMidChevron: dist > 200,
    };
  }

  // Wrapped tier transition or backward feedback: route cleanly through open horizontal gutter
  const fromTop = fromNode.position.y;
  const fromBottom = fromTop + getNodeHeight(fromNode);
  const toTop = toNode.position.y;
  const toBottom = toTop + getNodeHeight(toNode);
  const laneShift = ((laneOffsetIndex % 5) - 2) * 7;

  let channelY: number;

  if (toTop > fromBottom + 32) {
    // Tier-wrap downward (end of upper tier -> start of lower tier)
    let tierUpperBottom = fromBottom;
    let tierLowerTop = toTop;
    for (const n of allNodes) {
      const ny1 = n.position.y;
      const ny2 = ny1 + getNodeHeight(n);
      // Nodes in the same upper band as fromNode
      if (ny1 < toTop - 24 && ny2 <= toTop - 12 && ny2 > fromTop) {
        tierUpperBottom = Math.max(tierUpperBottom, ny2);
      }
      // Nodes in the same lower band as toNode
      if (ny1 >= fromBottom + 12 && ny1 < toBottom && ny1 < tierLowerTop) {
        tierLowerTop = Math.min(tierLowerTop, ny1);
      }
    }
    if (tierLowerTop - tierUpperBottom >= 34) {
      channelY = (tierUpperBottom + tierLowerTop) / 2 + laneShift;
    } else {
      channelY = (y1 + y2) / 2 + laneShift;
    }
  } else if (fromTop > toBottom + 32) {
    // Upward return (lower tier -> upper tier)
    let tierUpperBottom = toBottom;
    let tierLowerTop = fromTop;
    for (const n of allNodes) {
      const ny1 = n.position.y;
      const ny2 = ny1 + getNodeHeight(n);
      if (ny1 < fromTop - 24 && ny2 <= fromTop - 12 && ny2 > toTop) {
        tierUpperBottom = Math.max(tierUpperBottom, ny2);
      }
      if (ny1 >= toBottom + 12 && ny1 < fromBottom && ny1 < tierLowerTop) {
        tierLowerTop = Math.min(tierLowerTop, ny1);
      }
    }
    if (tierLowerTop - tierUpperBottom >= 34) {
      channelY = (tierUpperBottom + tierLowerTop) / 2 + laneShift;
    } else {
      channelY = (y1 + y2) / 2 + laneShift;
    }
  } else {
    // Same-tier feedback loop (e.g. env1 -> flt1): arc cleanly underneath both cards
    let maxRowBottom = Math.max(fromBottom, toBottom);
    const minX = Math.min(toNode.position.x, fromNode.position.x) - 20;
    const maxX = Math.max(toNode.position.x, fromNode.position.x) + NODE_WIDTH + 20;
    for (const n of allNodes) {
      const ny1 = n.position.y;
      const ny2 = ny1 + getNodeHeight(n);
      if (n.position.x + NODE_WIDTH > minX && n.position.x < maxX && ny1 < maxRowBottom && ny2 > Math.min(fromTop, toTop)) {
        maxRowBottom = Math.max(maxRowBottom, ny2);
      }
    }
    channelY = maxRowBottom + 32 + Math.abs(laneShift);
  }

  const stub = 34;
  const xOut = x1 + stub;
  const xIn = x2 - stub;
  const dy1 = channelY - y1;
  const dy2 = y2 - channelY;
  const dir1 = dy1 >= 0 ? 1 : -1;
  const dir2 = dy2 >= 0 ? 1 : -1;
  const r1 = Math.min(22, Math.abs(dy1) * 0.45);
  const r2 = Math.min(22, Math.abs(dy2) * 0.45);

  const d = [
    `M ${x1} ${y1}`,
    `L ${xOut - r1} ${y1}`,
    `Q ${xOut} ${y1}, ${xOut} ${y1 + dir1 * r1}`,
    `L ${xOut} ${channelY - dir1 * r1}`,
    `Q ${xOut} ${channelY}, ${xOut - r1} ${channelY}`,
    `L ${xIn + r2} ${channelY}`,
    `Q ${xIn} ${channelY}, ${xIn} ${channelY + dir2 * r2}`,
    `L ${xIn} ${y2 - dir2 * r2}`,
    `Q ${xIn} ${y2}, ${xIn + r2} ${y2}`,
    `L ${x2} ${y2}`,
  ].join(' ');

  return {
    d,
    midX: (xOut + xIn) / 2,
    midY: channelY,
    midAngleDeg: xIn <= xOut ? 180 : 0,
    showMidChevron: true,
  };
}

export const PatchbayCanvas: React.FC<PatchbayCanvasProps> = ({
  patch,
  selectedNodeId,
  activeNotesCount,
  layoutMode,
  onChangeLayoutMode,
  onSelectNode,
  onMoveNode,
  onAddNode,
  onToggleBypass,
  onAddConnection,
  onUpdateConnectionAmount,
  onDeleteConnection,
  onAutoLayout,
  onOpenSampleAnalyzer,
  theme = 'light',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pan, setPan] = useState({ x: 24, y: 24 });
  const [zoom, setZoom] = useState(0.92);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [addMenuQuery, setAddMenuQuery] = useState('');
  const [selectedConnId, setSelectedConnId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredConnId, setHoveredConnId] = useState<string | null>(null);
  const pendingFitRef = useRef(false);

  // Pending tap-to-connect or drag-to-connect source port
  const [pendingWire, setPendingWire] = useState<{
    fromNode: string;
    fromPort: string;
    signal: 'audio' | 'cv';
    cursorX?: number;
    cursorY?: number;
    isDragging: boolean;
  } | null>(null);

  const dragNodeRef = useRef<{
    nodeId: string;
    startX: number;
    startY: number;
    origPosX: number;
    origPosY: number;
  } | null>(null);

  const panStateRef = useRef<{
    startX: number;
    startY: number;
    origPanX: number;
    origPanY: number;
  } | null>(null);

  useEffect(() => {
    const resetInteractions = () => {
      dragNodeRef.current = null;
      panStateRef.current = null;
      setPendingWire((prev) =>
        prev?.isDragging ? { ...prev, isDragging: false, cursorX: undefined, cursorY: undefined } : prev
      );
    };
    window.addEventListener('pointerup', resetInteractions);
    window.addEventListener('pointercancel', resetInteractions);
    window.addEventListener('blur', resetInteractions);
    return () => {
      window.removeEventListener('pointerup', resetInteractions);
      window.removeEventListener('pointercancel', resetInteractions);
      window.removeEventListener('blur', resetInteractions);
    };
  }, []);

  const clientToGraph = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    };
  };

  const handleFitView = useCallback(() => {
    if (!containerRef.current || patch.nodes.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const n of patch.nodes) {
      const h = getNodeHeight(n);
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + NODE_WIDTH);
      maxY = Math.max(maxY, n.position.y + h);
    }
    const padX = 96;
    const padY = 120;
    const contentW = Math.max(300, maxX - minX + padX);
    const contentH = Math.max(200, maxY - minY + padY);
    const nextZoom = Math.max(
      0.42,
      Math.min(1.08, Math.min(rect.width / contentW, rect.height / contentH))
    );
    setZoom(nextZoom);
    setPan({
      x: (rect.width - (maxX - minX) * nextZoom) / 2 - minX * nextZoom,
      y: Math.max(48, (rect.height - (maxY - minY) * nextZoom) / 2) - minY * nextZoom,
    });
  }, [patch.nodes]);

  useEffect(() => {
    if (!pendingFitRef.current) return;
    pendingFitRef.current = false;
    const raf = window.requestAnimationFrame(() => {
      handleFitView();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [patch.nodes, handleFitView]);

  const triggerAutoLayout = (mode?: AutoLayoutMode) => {
    pendingFitRef.current = true;
    onAutoLayout(mode);
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.canvasBg) return;
    setSelectedConnId(null);
    onSelectNode(null);
    setPendingWire(null);
    setAddMenuOpen(false);
    panStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origPanX: pan.x,
      origPanY: pan.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragNodeRef.current) {
      const dx = (e.clientX - dragNodeRef.current.startX) / zoom;
      const dy = (e.clientY - dragNodeRef.current.startY) / zoom;
      onMoveNode(dragNodeRef.current.nodeId, {
        x: Math.round((dragNodeRef.current.origPosX + dx) / 8) * 8,
        y: Math.round((dragNodeRef.current.origPosY + dy) / 8) * 8,
      });
      return;
    }

    if (panStateRef.current) {
      const dx = e.clientX - panStateRef.current.startX;
      const dy = e.clientY - panStateRef.current.startY;
      setPan({
        x: panStateRef.current.origPanX + dx,
        y: panStateRef.current.origPanY + dy,
      });
      return;
    }

    if (pendingWire?.isDragging) {
      const pt = clientToGraph(e.clientX, e.clientY);
      setPendingWire((prev) => (prev ? { ...prev, cursorX: pt.x, cursorY: pt.y } : null));
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragNodeRef.current = null;
    panStateRef.current = null;

    if (pendingWire?.isDragging) {
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const portEl = el?.closest('[data-port-dir="in"]') as HTMLElement | null;
      if (portEl) {
        const toNode = portEl.dataset.nodeId!;
        const toPort = portEl.dataset.portId!;
        const toSignal = portEl.dataset.portSignal as 'audio' | 'cv';
        if (toNode !== pendingWire.fromNode && toSignal === pendingWire.signal) {
          onAddConnection(pendingWire.fromNode, pendingWire.fromPort, toNode, toPort);
          setPendingWire(null);
          return;
        }
      }
      setPendingWire((prev) => (prev ? { ...prev, isDragging: false, cursorX: undefined, cursorY: undefined } : null));
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 0) {
      const delta = -e.deltaY * 0.001;
      setZoom((z) => Math.max(0.4, Math.min(1.6, z + delta)));
    }
  };

  const handlePortPointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    node: SynthNode,
    port: PortSpec
  ) => {
    e.stopPropagation();

    if (port.direction === 'out') {
      if (pendingWire && pendingWire.fromNode === node.id && pendingWire.fromPort === port.id) {
        setPendingWire(null);
        return;
      }
      const pt = clientToGraph(e.clientX, e.clientY);
      setPendingWire({
        fromNode: node.id,
        fromPort: port.id,
        signal: port.signal,
        cursorX: pt.x,
        cursorY: pt.y,
        isDragging: true,
      });
    } else if (port.direction === 'in' && pendingWire) {
      if (pendingWire.fromNode !== node.id && pendingWire.signal === port.signal) {
        onAddConnection(pendingWire.fromNode, pendingWire.fromPort, node.id, port.id);
        setPendingWire(null);
      }
    }
  };

  const selectedConn: SynthConnection | undefined = useMemo(
    () => patch.connections.find((c) => c.id === selectedConnId),
    [patch.connections, selectedConnId]
  );

  const focusNodeId = !pendingWire ? hoveredNodeId ?? selectedNodeId : null;

  const { wiredPortKeys, upstreamNodeIds, downstreamNodeIds } = useMemo(() => {
    const portKeys = new Set<string>();
    const upstream = new Set<string>();
    const downstream = new Set<string>();
    for (const c of patch.connections) {
      portKeys.add(`${c.fromNode}:out:${c.fromPort}`);
      portKeys.add(`${c.toNode}:in:${c.toPort}`);
      if (focusNodeId) {
        if (c.toNode === focusNodeId) upstream.add(c.fromNode);
        if (c.fromNode === focusNodeId) downstream.add(c.toNode);
      }
    }
    if (selectedConn && !focusNodeId) {
      upstream.add(selectedConn.fromNode);
      downstream.add(selectedConn.toNode);
    }
    return {
      wiredPortKeys: portKeys,
      upstreamNodeIds: upstream,
      downstreamNodeIds: downstream,
    };
  }, [patch.connections, focusNodeId, selectedConn]);

  const nodeById = useMemo(
    () => new Map<string, SynthNode>(patch.nodes.map((n) => [n.id, n])),
    [patch.nodes]
  );

  const selectedConnEndpoints = useMemo(() => {
    if (!selectedConn) return null;
    const fn = nodeById.get(selectedConn.fromNode);
    const tn = nodeById.get(selectedConn.toNode);
    if (!fn || !tn) return null;
    const fDef = MODULE_REGISTRY[fn.type];
    const tDef = MODULE_REGISTRY[tn.type];
    const fLabel = fn.label || fDef?.label || fn.type;
    const tLabel = tn.label || tDef?.label || tn.type;
    return { fLabel, tLabel };
  }, [selectedConn, nodeById]);

  const moduleChoices: ModuleType[] = [
    'oscillator',
    'fmOperator',
    'physicalString',
    'modalResonator',
    'blownPipe',
    'subHarmonic',
    'noise',
    'combFilter',
    'filter',
    'parametricEq',
    'formantFilter',
    'shaper',
    'wavefolder',
    'ringMod',
    'bitcrusher',
    'crossfader',
    'chorus',
    'phaser',
    'granularCloud',
    'envelope',
    'lfo',
    'sampleHold',
    'slopeEnv',
    'stepSequencer',
    'envFollower',
    'quantizer',
    'cvUtility',
    'delay',
    'reverb',
    'busCompressor',
  ];

  return (
    <div
      ref={containerRef}
      data-canvas-bg="true"
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={handleCanvasPointerUp}
      onWheel={handleWheel}
      className="relative flex-1 h-full patchbay-grid overflow-hidden select-none touch-none"
    >
      {/* Top-Left Toolbar */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2 flex-wrap">
        <div className="relative">
          <button
            type="button"
            onClick={() =>
              setAddMenuOpen((v) => {
                if (v) setAddMenuQuery('');
                return !v;
              })
            }
            className="inline-flex items-center gap-1.5 h-10 px-3 text-xs font-semibold bg-white/95 dark:bg-[#111622]/95 border border-slate-300 dark:border-slate-700 hover:border-amber-500/70 text-slate-900 dark:text-slate-100 rounded-md transition-colors whitespace-nowrap shrink-0 shadow-xs dark:shadow-none"
          >
            <Plus className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>Add Module</span>
          </button>

          {addMenuOpen && (
            <div className="absolute top-11 left-0 w-64 max-h-[72vh] flex flex-col bg-white dark:bg-[#111622] border border-slate-300 dark:border-slate-700 rounded-lg z-30 shadow-xl overflow-hidden">
              <div className="p-2 border-b border-slate-200 dark:border-slate-800 shrink-0">
                <input
                  type="text"
                  value={addMenuQuery}
                  onChange={(e) => setAddMenuQuery(e.target.value)}
                  placeholder="Filter modules..."
                  autoFocus
                  className="w-full h-8 px-2.5 text-xs bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="overflow-y-auto p-1.5 space-y-2">
                {ADDABLE_CATEGORY_ORDER.map((cat) => {
                  const meta = MODULE_CATEGORY_META[cat];
                  const q = addMenuQuery.trim().toLowerCase();
                  const items = moduleChoices.filter((type) => {
                    const def = MODULE_REGISTRY[type];
                    if (def.category !== cat) return false;
                    if (!q) return true;
                    return (
                      def.label.toLowerCase().includes(q) ||
                      def.description.toLowerCase().includes(q) ||
                      meta.label.toLowerCase().includes(q)
                    );
                  });
                  if (items.length === 0) return null;
                  const isCyan = meta.accent === 'cyan';
                  return (
                    <div key={cat} className="space-y-0.5">
                      <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between">
                        <span>{meta.label}</span>
                        <span className={isCyan ? 'text-cyan-700 dark:text-cyan-400' : 'text-amber-700 dark:text-amber-400'}>
                          {items.length}
                        </span>
                      </div>
                      {items.map((type) => {
                        const def = MODULE_REGISTRY[type];
                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => {
                              const cx = (-pan.x + 280) / zoom;
                              const cy = (-pan.y + 160) / zoom;
                              onAddNode(type, {
                                x: Math.round((cx + (patch.nodes.length % 4) * 32) / 8) * 8,
                                y: Math.round((cy + (patch.nodes.length % 3) * 32) / 8) * 8,
                              });
                              setAddMenuOpen(false);
                              setAddMenuQuery('');
                            }}
                            className="w-full text-left px-2.5 py-1.5 rounded text-xs hover:bg-slate-100 dark:hover:bg-slate-800/80 flex items-center justify-between gap-2 transition-colors min-h-[34px]"
                          >
                            <span className="text-slate-900 dark:text-slate-100 font-medium truncate">
                              {def.label}
                            </span>
                            <span
                              className={`w-1.5 h-1.5 rounded-xs shrink-0 ${
                                isCyan ? 'bg-cyan-600 dark:bg-cyan-400' : 'bg-amber-600 dark:bg-amber-400'
                              }`}
                            />
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Auto Layout & 2D Mode Switcher */}
        <div className="flex items-center bg-white/95 dark:bg-[#111622]/95 border border-slate-300 dark:border-slate-800 rounded-md overflow-hidden shadow-xs dark:shadow-none">
          <button
            type="button"
            onClick={() => triggerAutoLayout(layoutMode)}
            title={
              layoutMode === '2d-flow'
                ? 'Arrange signal flow in a compact 2D multi-tier graph and fit in view'
                : 'Arrange signal flow left-to-right across Audio & CV lanes and fit in view'
            }
            className="inline-flex items-center gap-1.5 h-10 px-3 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span className="hidden sm:inline">Auto Layout</span>
          </button>
          <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 shrink-0" />
          <div className="flex items-center p-1 gap-0.5">
            <button
              type="button"
              onClick={() => {
                onChangeLayoutMode('2d-flow');
                triggerAutoLayout('2d-flow');
              }}
              title="2D Flow: compact multi-tier signal matrix with dedicated CV modulation lanes"
              className={`h-8 px-2.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                layoutMode === '2d-flow'
                  ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70'
              }`}
            >
              2D Flow
            </button>
            <button
              type="button"
              onClick={() => {
                onChangeLayoutMode('wide-bus');
                triggerAutoLayout('wide-bus');
              }}
              title="Wide Bus: unwrapped left-to-right audio spine with CV lane below"
              className={`h-8 px-2.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                layoutMode === 'wide-bus'
                  ? 'bg-cyan-500/15 text-cyan-800 dark:text-cyan-300 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70'
              }`}
            >
              Wide
            </button>
          </div>
        </div>

        {onOpenSampleAnalyzer && (
          <button
            type="button"
            onClick={onOpenSampleAnalyzer}
            title="Upload or record an instrument audio sample to reconstruct a matching synth patch"
            className="inline-flex items-center gap-1.5 h-10 px-3 text-xs font-semibold bg-white/95 dark:bg-[#111622]/95 border border-cyan-600/45 dark:border-cyan-500/45 hover:border-cyan-500 text-cyan-800 dark:text-cyan-300 rounded-md transition-colors whitespace-nowrap shrink-0 shadow-xs dark:shadow-none"
          >
            <AudioLines className="w-3.5 h-3.5" />
            <span>Match Sample</span>
          </button>
        )}

        <div className="flex items-center bg-white/95 dark:bg-[#111622]/95 border border-slate-300 dark:border-slate-800 rounded-md overflow-hidden shadow-xs dark:shadow-none">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.4, z - 0.12))}
            title="Zoom Out"
            className="h-10 w-10 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="px-2 text-[11px] font-mono text-slate-700 dark:text-slate-300 min-w-[44px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(1.6, z + 0.12))}
            title="Zoom In"
            className="h-10 w-10 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleFitView}
            title="Fit graph in view"
            className="h-10 w-10 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border-l border-slate-200 dark:border-slate-800"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tap-to-Connect Instruction Banner */}
      {pendingWire && !pendingWire.isDragging && (
        <div className="absolute top-16 left-3 z-20 px-3 py-2 bg-white dark:bg-[#111622] border border-cyan-600/50 dark:border-cyan-500/60 rounded-md flex items-center gap-3 text-xs text-slate-900 dark:text-slate-100 shadow-sm">
          <span>
            Tap any{' '}
            <span className={pendingWire.signal === 'audio' ? 'text-amber-700 dark:text-amber-400 font-semibold' : 'text-cyan-700 dark:text-cyan-400 font-semibold'}>
              {pendingWire.signal === 'audio' ? 'Amber Audio' : 'Cyan CV'}
            </span>{' '}
            input port to wire cable
          </span>
          <button
            type="button"
            onClick={() => setPendingWire(null)}
            className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Selected Cable Quick Bar */}
      {selectedConn && (
        <div className="absolute top-3 right-3 z-20 px-3 py-2 bg-white/95 dark:bg-[#111622]/95 border border-slate-300 dark:border-slate-700 rounded-md flex items-center gap-3 text-xs shadow-sm flex-wrap">
          {selectedConnEndpoints && (
            <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap max-w-[220px] truncate">
              {selectedConnEndpoints.fLabel} <span className="text-slate-400">→</span> {selectedConnEndpoints.tLabel}
            </span>
          )}
          <PrecisionSlider
            compact
            label="Cable Level"
            value={selectedConn.amount}
            min={selectedConn.fromPort === 'cv' ? -1 : 0}
            max={selectedConn.fromPort === 'cv' ? 1 : 1.5}
            step={0.02}
            fineStep={0.002}
            accent={selectedConn.fromPort === 'cv' ? 'cyan' : 'amber'}
            onChange={(val) => onUpdateConnectionAmount(selectedConn.id, val)}
            className="w-48"
          />
          <button
            type="button"
            onClick={() => {
              onDeleteConnection(selectedConn.id);
              setSelectedConnId(null);
            }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-rose-500/15 text-rose-700 dark:text-rose-400 hover:bg-rose-500/25 font-medium whitespace-nowrap"
          >
            <Unlink className="w-3 h-3" />
            <span>Unwire</span>
          </button>
        </div>
      )}

      {/* Transformed Graph Layer */}
      <div
        data-canvas-bg="true"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
        className="absolute inset-0 pointer-events-none"
      >
        {/* SVG Patch Cables */}
        <svg
          className="overflow-visible absolute top-0 left-0 w-px h-px pointer-events-auto"
          style={{ zIndex: 1 }}
        >
          {patch.connections.map((conn, connIdx) => {
            const fromNode = nodeById.get(conn.fromNode);
            const toNode = nodeById.get(conn.toNode);
            if (!fromNode || !toNode) return null;

            const start = getPortCenter(fromNode, conn.fromPort, 'out');
            const end = getPortCenter(toNode, conn.toPort, 'in');
            const route = buildCableRoute(start, end, fromNode, toNode, patch.nodes, connIdx);

            const fromSignal = MODULE_REGISTRY[fromNode.type]?.ports.find((p) => p.id === conn.fromPort)?.signal;
            const toSignal = MODULE_REGISTRY[toNode.type]?.ports.find((p) => p.id === conn.toPort)?.signal;
            const isCv = fromSignal === 'cv' || toSignal === 'cv';
            const isSelected = selectedConnId === conn.id;
            const isHovered = hoveredConnId === conn.id;
            const isFocusedByNode =
              Boolean(focusNodeId) && (conn.fromNode === focusNodeId || conn.toNode === focusNodeId);
            const isDimmedByNodeFocus = Boolean(focusNodeId) && !selectedConnId && !isFocusedByNode && !isHovered;

            const strokeColor = isSelected
              ? theme === 'light'
                ? '#0F172A'
                : '#F8FAFC'
              : isCv
                ? theme === 'light'
                  ? activeNotesCount > 0 || isFocusedByNode || isHovered
                    ? '#0284C7'
                    : '#0891B2'
                  : activeNotesCount > 0 || isFocusedByNode || isHovered
                    ? '#22D3EE'
                    : '#06B6D4'
                : theme === 'light'
                  ? activeNotesCount > 0 || isFocusedByNode || isHovered
                    ? '#B45309'
                    : '#D97706'
                  : activeNotesCount > 0 || isFocusedByNode || isHovered
                    ? '#FBBF24'
                    : '#F59E0B';

            const strokeOpacity = isSelected || isHovered || isFocusedByNode
              ? 1
              : isDimmedByNodeFocus
                ? 0.22
                : activeNotesCount > 0
                  ? 0.94
                  : 0.82;

            const strokeWidth = isSelected
              ? 3.5
              : isHovered || isFocusedByNode
                ? 3.0
                : 2.3;

            const showFlowPulse = activeNotesCount > 0 && !isDimmedByNodeFocus && !fromNode.bypassed;

            return (
              <g
                key={conn.id}
                onPointerEnter={() => setHoveredConnId(conn.id)}
                onPointerLeave={() => setHoveredConnId((prev) => (prev === conn.id ? null : prev))}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedConnId(conn.id);
                }}
                className="cursor-pointer"
              >
                {/* Wide invisible hit target */}
                <path d={route.d} fill="none" stroke="transparent" strokeWidth={20} />

                {/* Main cable stroke */}
                <path
                  d={route.d}
                  fill="none"
                  stroke={strokeColor}
                  strokeOpacity={strokeOpacity}
                  strokeWidth={strokeWidth}
                  strokeDasharray={isCv ? '6 4' : undefined}
                  strokeLinecap="round"
                />

                {/* Animated directional pulse when voices are active */}
                {showFlowPulse && (
                  <path
                    d={route.d}
                    fill="none"
                    stroke={theme === 'light' ? '#FFFFFF' : '#F8FAFC'}
                    strokeOpacity={isCv ? 0.55 : 0.72}
                    strokeWidth={isCv ? 1.8 : 2.1}
                    strokeLinecap="round"
                    className="cable-flow-pulse pointer-events-none"
                  />
                )}

                {/* Midpoint direction chevron on longer / wrapped paths */}
                {(route.showMidChevron || isFocusedByNode || isHovered || isSelected) && (
                  <g
                    transform={`translate(${route.midX}, ${route.midY}) rotate(${route.midAngleDeg})`}
                    opacity={strokeOpacity}
                    className="pointer-events-none"
                  >
                    <circle
                      r={7}
                      fill={theme === 'light' ? '#F8FAFC' : '#0B0F17'}
                      stroke={strokeColor}
                      strokeWidth={1.3}
                    />
                    <path
                      d="M -2.2 -3 L 2.8 0 L -2.2 3"
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={1.7}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </g>
                )}

                {/* Entry arrowhead just before input jack */}
                <path
                  d={`M ${end.x - 15} ${end.y - 3.8} L ${end.x - 8} ${end.y} L ${end.x - 15} ${end.y + 3.8} Z`}
                  fill={strokeColor}
                  fillOpacity={strokeOpacity}
                  className="pointer-events-none"
                />
              </g>
            );
          })}

          {pendingWire && pendingWire.cursorX !== undefined && pendingWire.cursorY !== undefined && (() => {
            const srcNode = nodeById.get(pendingWire.fromNode);
            if (!srcNode) return null;
            const start = getPortCenter(srcNode, pendingWire.fromPort, 'out');
            const d = buildPendingBezier(start.x, start.y, pendingWire.cursorX, pendingWire.cursorY);
            return (
              <path
                d={d}
                fill="none"
                stroke={
                  pendingWire.signal === 'audio'
                    ? theme === 'light'
                      ? '#D97706'
                      : '#F59E0B'
                    : theme === 'light'
                      ? '#0891B2'
                      : '#06B6D4'
                }
                strokeWidth={2.5}
                strokeDasharray="5 4"
              />
            );
          })()}
        </svg>

        {/* Module Nodes */}
        {patch.nodes.map((node) => {
          const def = MODULE_REGISTRY[node.type];
          if (!def) return null;
          const isSelected = selectedNodeId === node.id;
          const isUpstream = upstreamNodeIds.has(node.id) && !isSelected;
          const isDownstream = downstreamNodeIds.has(node.id) && !isSelected;
          const isInputSource = def.category === 'source';
          const isMasterOutput = node.type === 'output';
          const isUnrelatedDuringFocus =
            Boolean(focusNodeId) && !isSelected && !isUpstream && !isDownstream;
          const inPorts = def.ports.filter((p) => p.direction === 'in');
          const outPorts = def.ports.filter((p) => p.direction === 'out');
          const portRows = Math.max(inPorts.length, outPorts.length);
          const isModOrProc = isCyanModuleCategory(def.category);

          const cardSurfaceClass = isUpstream && !isDownstream
            ? 'bg-cyan-50/75 dark:bg-[#10202C]'
            : isDownstream || isMasterOutput
              ? 'bg-emerald-50/70 dark:bg-[#10221C]'
              : isInputSource
                ? 'bg-amber-50/70 dark:bg-[#1E1A14]'
                : 'bg-white dark:bg-[#161D2E]';

          const cardBorderClass = isSelected
            ? 'border-slate-900 dark:border-white ring-[3px] ring-amber-500/75 dark:ring-amber-400/75 shadow-lg'
            : isUpstream && isDownstream
              ? 'border-cyan-600 dark:border-cyan-400 ring-[3px] ring-cyan-500/50 dark:ring-cyan-400/50 shadow-md'
              : isUpstream
                ? 'border-cyan-600 dark:border-cyan-400 ring-[3px] ring-cyan-500/50 dark:ring-cyan-400/50 shadow-md'
                : isDownstream
                  ? 'border-emerald-600 dark:border-emerald-400 ring-[3px] ring-emerald-500/50 dark:ring-emerald-400/50 shadow-md'
                  : isMasterOutput
                    ? 'border-emerald-600 dark:border-emerald-400 ring-2 ring-emerald-500/50 dark:ring-emerald-400/45 shadow-md'
                    : isInputSource
                      ? 'border-amber-600 dark:border-amber-400 ring-2 ring-amber-500/45 dark:ring-amber-400/40 shadow-md'
                      : 'border-slate-300 dark:border-slate-700/90 hover:border-slate-400 dark:hover:border-slate-600 shadow-xs dark:shadow-none';

          const headerBgClass = isUpstream && !isDownstream
            ? 'bg-cyan-100/95 dark:bg-cyan-900/55 border-cyan-300 dark:border-cyan-700/70'
            : isDownstream || isMasterOutput
              ? 'bg-emerald-100/95 dark:bg-emerald-900/55 border-emerald-300 dark:border-emerald-700/70'
              : isInputSource
                ? 'bg-amber-100/95 dark:bg-amber-900/50 border-amber-300 dark:border-amber-700/70'
                : 'bg-slate-50 dark:bg-[#111622] border-slate-200 dark:border-slate-800';

          const summaryBgClass = isUpstream && !isDownstream
            ? 'bg-cyan-50/90 dark:bg-[#0D1A24] border-cyan-200/80 dark:border-cyan-900/50'
            : isDownstream || isMasterOutput
              ? 'bg-emerald-50/90 dark:bg-[#0C1B16] border-emerald-200/80 dark:border-emerald-900/50'
              : isInputSource
                ? 'bg-amber-50/90 dark:bg-[#19150F] border-amber-200/80 dark:border-amber-900/50'
                : 'bg-slate-100/70 dark:bg-[#121827] border-slate-200/80 dark:border-slate-800/70';

          const headerDotClass = isMasterOutput || isDownstream
            ? 'bg-emerald-600 dark:bg-emerald-400'
            : isUpstream
              ? 'bg-cyan-600 dark:bg-cyan-400'
              : isModOrProc
                ? 'bg-cyan-600 dark:bg-cyan-400'
                : 'bg-amber-600 dark:bg-amber-400';

          const roleTag = isUpstream && isDownstream
            ? 'IN ↔ OUT'
            : isUpstream
              ? '← IN'
              : isDownstream
                ? 'OUT →'
                : isMasterOutput
                  ? 'OUTPUT'
                  : isInputSource
                    ? 'INPUT'
                    : null;

          const roleTagColor = isUpstream
            ? 'text-cyan-800 dark:text-cyan-200'
            : isDownstream || isMasterOutput
              ? 'text-emerald-800 dark:text-emerald-200'
              : 'text-amber-800 dark:text-amber-200';

          return (
            <div
              key={node.id}
              style={{
                left: node.position.x,
                top: node.position.y,
                width: NODE_WIDTH,
                zIndex: isSelected ? 12 : hoveredNodeId === node.id ? 10 : isMasterOutput || isInputSource ? 7 : 5,
              }}
              onPointerEnter={() => setHoveredNodeId(node.id)}
              onPointerLeave={() => setHoveredNodeId((prev) => (prev === node.id ? null : prev))}
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelectNode(node.id);
                setSelectedConnId(null);
              }}
              className={`absolute pointer-events-auto rounded-lg border transition-all duration-100 ${cardSurfaceClass} ${
                node.bypassed ? 'opacity-50' : isUnrelatedDuringFocus ? 'opacity-70' : ''
              } ${cardBorderClass}`}
            >
              {/* Drag Handle Header (36px) */}
              <div
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelectNode(node.id);
                  dragNodeRef.current = {
                    nodeId: node.id,
                    startX: e.clientX,
                    startY: e.clientY,
                    origPosX: node.position.x,
                    origPosY: node.position.y,
                  };
                }}
                className={`h-[36px] px-3 border-b rounded-t-lg flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing ${headerBgClass}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2.5 h-2.5 rounded-xs shrink-0 ${headerDotClass}`} />
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap truncate">
                    {node.label || def.label}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {roleTag && (
                    <span className={`text-[11px] font-mono font-bold tracking-wider whitespace-nowrap ${roleTagColor}`}>
                      {roleTag}
                    </span>
                  )}
                  {node.type !== 'output' && (
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => onToggleBypass(node.id)}
                      title={node.bypassed ? 'Enable' : 'Bypass'}
                      className={`p-1 rounded shrink-0 ${
                        node.bypassed
                          ? 'text-slate-400 dark:text-slate-500'
                          : 'text-amber-700 dark:text-amber-400 hover:bg-slate-200/70 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Power className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Compact Summary Readout (28px) */}
              <div className={`h-[28px] px-3 flex items-center border-b ${summaryBgClass}`}>
                <span className="text-[11px] font-mono text-slate-700 dark:text-slate-300 truncate">
                  {getNodeSummary(node)}
                </span>
              </div>

              {/* Ports Grid */}
              <div className="py-[6px] relative">
                {Array.from({ length: portRows }).map((_, rowIdx) => {
                  const inPort = inPorts[rowIdx];
                  const outPort = outPorts[rowIdx];
                  const inWired = inPort ? wiredPortKeys.has(`${node.id}:in:${inPort.id}`) : false;
                  const outWired = outPort ? wiredPortKeys.has(`${node.id}:out:${outPort.id}`) : false;

                  const canAcceptPending = (p?: PortSpec) =>
                    Boolean(
                      p &&
                        pendingWire &&
                        pendingWire.fromNode !== node.id &&
                        pendingWire.signal === p.signal
                    );

                  return (
                    <div
                      key={rowIdx}
                      className="h-[30px] flex items-center justify-between px-3 relative"
                    >
                      {/* Input Port */}
                      {inPort ? (
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            type="button"
                            data-port-dir="in"
                            data-node-id={node.id}
                            data-port-id={inPort.id}
                            data-port-signal={inPort.signal}
                            onPointerDown={(e) => handlePortPointerDown(e, node, inPort)}
                            title={`Input: ${inPort.label} (${inPort.signal})`}
                            className="absolute -left-[22px] w-[44px] h-[30px] flex items-center justify-center group"
                          >
                            <span
                              className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-transform ${
                                inPort.signal === 'audio'
                                  ? 'bg-white dark:bg-[#0B0F17] border-amber-600 dark:border-amber-400 group-hover:scale-125'
                                  : 'bg-white dark:bg-[#0B0F17] border-cyan-600 dark:border-cyan-400 group-hover:scale-125'
                              } ${
                                canAcceptPending(inPort)
                                  ? 'ring-4 ring-cyan-500/35 scale-125'
                                  : ''
                              }`}
                            >
                              {inWired && (
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    inPort.signal === 'audio'
                                      ? 'bg-amber-600 dark:bg-amber-400'
                                      : 'bg-cyan-600 dark:bg-cyan-400'
                                  }`}
                                />
                              )}
                            </span>
                          </button>
                          <span
                            className={`text-[11px] whitespace-nowrap pl-1 ${
                              inWired
                                ? 'text-slate-900 dark:text-slate-100 font-medium'
                                : 'text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {inPort.label}
                          </span>
                        </div>
                      ) : (
                        <span />
                      )}

                      {/* Output Port */}
                      {outPort ? (
                        <div className="flex items-center gap-2 shrink-0 ml-auto">
                          <span
                            className={`text-[11px] whitespace-nowrap pr-1 text-right ${
                              outWired
                                ? 'text-slate-900 dark:text-slate-100 font-medium'
                                : 'text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {outPort.label}
                          </span>
                          <button
                            type="button"
                            data-port-dir="out"
                            data-node-id={node.id}
                            data-port-id={outPort.id}
                            data-port-signal={outPort.signal}
                            onPointerDown={(e) => handlePortPointerDown(e, node, outPort)}
                            title={`Output: ${outPort.label} (${outPort.signal})`}
                            className="absolute -right-[22px] w-[44px] h-[30px] flex items-center justify-center group"
                          >
                            <span
                              className={`w-3.5 h-3.5 rounded-full border-2 transition-transform ${
                                outPort.signal === 'audio'
                                  ? outWired
                                    ? 'bg-amber-500 border-white dark:border-[#07090E] group-hover:scale-125'
                                    : 'bg-amber-500/45 border-amber-600/80 dark:border-amber-400/70 group-hover:scale-125'
                                  : outWired
                                    ? 'bg-cyan-600 dark:bg-cyan-400 border-white dark:border-[#07090E] group-hover:scale-125'
                                    : 'bg-cyan-500/45 border-cyan-600/80 dark:border-cyan-400/70 group-hover:scale-125'
                              } ${
                                pendingWire?.fromNode === node.id &&
                                pendingWire?.fromPort === outPort.id
                                  ? 'ring-4 ring-amber-500/40 scale-125'
                                  : ''
                              }`}
                            />
                          </button>
                        </div>
                      ) : (
                        <span />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
