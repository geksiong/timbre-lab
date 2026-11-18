import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { MODULE_REGISTRY } from '../engine/moduleRegistry';
import { formatCarrierSummary, isAlternativeCarrierWaveform } from '../engine/carrierWaves';
import { ModuleType, PortSpec, SynthConnection, SynthNode, SynthPatch } from '../engine/types';
import { PrecisionSlider } from './PrecisionSlider';

interface PatchbayCanvasProps {
  patch: SynthPatch;
  selectedNodeId: string | null;
  activeNotesCount: number;
  onSelectNode: (nodeId: string | null) => void;
  onMoveNode: (nodeId: string, position: { x: number; y: number }) => void;
  onAddNode: (type: ModuleType, position: { x: number; y: number }) => void;
  onToggleBypass: (nodeId: string) => void;
  onAddConnection: (fromNode: string, fromPort: string, toNode: string, toPort: string) => void;
  onUpdateConnectionAmount: (connId: string, amount: number) => void;
  onDeleteConnection: (connId: string) => void;
  onAutoLayout: () => void;
  onOpenSampleAnalyzer?: () => void;
  theme?: 'light' | 'dark';
}

const NODE_WIDTH = 256;
const HEADER_H = 36;
const SUMMARY_H = 28;
const PORTS_PAD_TOP = 6;
const PORT_ROW_H = 30;

function getPortCenter(node: SynthNode, portId: string, direction: 'in' | 'out'): { x: number; y: number } {
  const def = MODULE_REGISTRY[node.type];
  if (!def) {
    return { x: node.position.x, y: node.position.y };
  }
  const sameDir = def.ports.filter((p) => p.direction === direction);
  const idx = Math.max(0, sameDir.findIndex((p) => p.id === portId));
  return {
    x: node.position.x + (direction === 'in' ? 0 : NODE_WIDTH),
    y: node.position.y + HEADER_H + SUMMARY_H + PORTS_PAD_TOP + idx * PORT_ROW_H + PORT_ROW_H / 2,
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

function buildBezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(48, Math.abs(x2 - x1) * 0.52);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

export const PatchbayCanvas: React.FC<PatchbayCanvasProps> = ({
  patch,
  selectedNodeId,
  activeNotesCount,
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
  const [selectedConnId, setSelectedConnId] = useState<string | null>(null);

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

  const handleFitView = () => {
    if (!containerRef.current || patch.nodes.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const n of patch.nodes) {
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + NODE_WIDTH);
      maxY = Math.max(maxY, n.position.y + 180);
    }
    const contentW = Math.max(300, maxX - minX + 80);
    const contentH = Math.max(200, maxY - minY + 80);
    const nextZoom = Math.max(0.45, Math.min(1.15, Math.min(rect.width / contentW, rect.height / contentH)));
    setZoom(nextZoom);
    setPan({
      x: (rect.width - contentW * nextZoom) / 2 - (minX - 40) * nextZoom,
      y: (rect.height - contentH * nextZoom) / 2 - (minY - 40) * nextZoom,
    });
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
      // Check if released over an input port element
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
      // Keep tap-to-connect active if user barely moved cursor, otherwise cancel drag
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
            onClick={() => setAddMenuOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 h-10 px-3 text-xs font-semibold bg-white/95 dark:bg-[#111622]/95 border border-slate-300 dark:border-slate-700 hover:border-amber-500/70 text-slate-900 dark:text-slate-100 rounded-md transition-colors whitespace-nowrap shadow-xs dark:shadow-none"
          >
            <Plus className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>Add Module</span>
          </button>

          {addMenuOpen && (
            <div className="absolute top-11 left-0 w-56 max-h-[70vh] overflow-y-auto bg-white dark:bg-[#111622] border border-slate-300 dark:border-slate-700 rounded-lg p-1.5 z-30 shadow-xl">
              {moduleChoices.map((type) => {
                const def = MODULE_REGISTRY[type];
                const isMod = def.category === 'modulator' || def.category === 'processor';
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
                    }}
                    className="w-full text-left px-3 py-2 rounded text-xs hover:bg-slate-100 dark:hover:bg-slate-800/80 flex items-center justify-between gap-2 transition-colors min-h-[38px]"
                  >
                    <span className="text-slate-900 dark:text-slate-100 font-medium">{def.label}</span>
                    <span className={`font-mono text-[10px] ${isMod ? 'text-cyan-700 dark:text-cyan-400' : 'text-amber-700 dark:text-amber-400'}`}>
                      {def.category}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onAutoLayout}
          title="Arrange modules cleanly left to right"
          className="inline-flex items-center gap-1.5 h-10 px-3 text-xs font-medium bg-white/95 dark:bg-[#111622]/95 border border-slate-300 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600 text-slate-700 dark:text-slate-300 rounded-md transition-colors whitespace-nowrap shadow-xs dark:shadow-none"
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Auto Layout</span>
        </button>

        {onOpenSampleAnalyzer && (
          <button
            type="button"
            onClick={onOpenSampleAnalyzer}
            title="Upload or record an instrument audio sample to reconstruct a matching synth patch"
            className="inline-flex items-center gap-1.5 h-10 px-3 text-xs font-semibold bg-white/95 dark:bg-[#111622]/95 border border-cyan-600/45 dark:border-cyan-500/45 hover:border-cyan-500 text-cyan-800 dark:text-cyan-300 rounded-md transition-colors whitespace-nowrap shadow-xs dark:shadow-none"
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
        <div className="absolute top-3 right-3 z-20 px-3 py-2 bg-white/95 dark:bg-[#111622]/95 border border-slate-300 dark:border-slate-700 rounded-md flex items-center gap-3 text-xs shadow-sm">
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
            className="w-56"
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
          {patch.connections.map((conn) => {
            const fromNode = patch.nodes.find((n) => n.id === conn.fromNode);
            const toNode = patch.nodes.find((n) => n.id === conn.toNode);
            if (!fromNode || !toNode) return null;

            const start = getPortCenter(fromNode, conn.fromPort, 'out');
            const end = getPortCenter(toNode, conn.toPort, 'in');
            const path = buildBezierPath(start.x, start.y, end.x, end.y);
            const fromSignal = MODULE_REGISTRY[fromNode.type]?.ports.find((p) => p.id === conn.fromPort)?.signal;
            const toSignal = MODULE_REGISTRY[toNode.type]?.ports.find((p) => p.id === conn.toPort)?.signal;
            const isCv = fromSignal === 'cv' || toSignal === 'cv';
            const isSelected = selectedConnId === conn.id;
            const strokeColor = isSelected
              ? theme === 'light'
                ? '#0F172A'
                : '#F8FAFC'
              : isCv
                ? theme === 'light'
                  ? activeNotesCount > 0
                    ? '#0284C7'
                    : '#0891B2'
                  : activeNotesCount > 0
                    ? '#22D3EE'
                    : '#06B6D4'
                : theme === 'light'
                  ? activeNotesCount > 0
                    ? '#B45309'
                    : '#D97706'
                  : activeNotesCount > 0
                    ? '#FBBF24'
                    : '#F59E0B';

            return (
              <g
                key={conn.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedConnId(conn.id);
                }}
                className="cursor-pointer"
              >
                <path d={path} fill="none" stroke="transparent" strokeWidth={20} />
                <path
                  d={path}
                  fill="none"
                  stroke={strokeColor}
                  strokeOpacity={isSelected ? 1 : activeNotesCount > 0 ? 0.95 : 0.8}
                  strokeWidth={isSelected ? 3.5 : 2.4}
                  strokeDasharray={isCv ? '6 4' : undefined}
                />
              </g>
            );
          })}

          {pendingWire && pendingWire.cursorX !== undefined && pendingWire.cursorY !== undefined && (() => {
            const srcNode = patch.nodes.find((n) => n.id === pendingWire.fromNode);
            if (!srcNode) return null;
            const start = getPortCenter(srcNode, pendingWire.fromPort, 'out');
            const d = buildBezierPath(start.x, start.y, pendingWire.cursorX, pendingWire.cursorY);
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
          const inPorts = def.ports.filter((p) => p.direction === 'in');
          const outPorts = def.ports.filter((p) => p.direction === 'out');
          const portRows = Math.max(inPorts.length, outPorts.length);
          const isModOrProc = def.category === 'modulator' || def.category === 'processor';

          return (
            <div
              key={node.id}
              style={{
                left: node.position.x,
                top: node.position.y,
                width: NODE_WIDTH,
                zIndex: isSelected ? 12 : 5,
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelectNode(node.id);
                setSelectedConnId(null);
              }}
              className={`absolute pointer-events-auto rounded-lg bg-white dark:bg-[#161D2E] border transition-colors duration-100 shadow-xs dark:shadow-none ${
                node.bypassed ? 'opacity-55' : ''
              } ${
                isSelected
                  ? 'border-amber-600 dark:border-amber-500 shadow-[0_0_0_1px_rgba(217,119,6,0.35)]'
                  : 'border-slate-300 dark:border-slate-700/90 hover:border-slate-400 dark:hover:border-slate-600'
              }`}
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
                className="h-[36px] px-3 bg-slate-50 dark:bg-[#111622] border-b border-slate-200 dark:border-slate-800 rounded-t-lg flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-2 h-2 rounded-xs shrink-0 ${
                      isModOrProc ? 'bg-cyan-600 dark:bg-cyan-400' : 'bg-amber-600 dark:bg-amber-400'
                    }`}
                  />
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                    {node.label || def.label}
                  </span>
                </div>
                {node.type !== 'output' && (
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => onToggleBypass(node.id)}
                    title={node.bypassed ? 'Enable' : 'Bypass'}
                    className={`p-1 rounded ${
                      node.bypassed
                        ? 'text-slate-400 dark:text-slate-500'
                        : 'text-amber-700 dark:text-amber-400 hover:bg-slate-200/70 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Power className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Compact Summary Readout (28px) */}
              <div className="h-[28px] px-3 flex items-center border-b border-slate-200/80 dark:border-slate-800/70 bg-slate-100/70 dark:bg-[#121827]">
                <span className="text-[11px] font-mono text-slate-600 dark:text-slate-400 truncate">
                  {getNodeSummary(node)}
                </span>
              </div>

              {/* Ports Grid */}
              <div className="py-[6px] relative">
                {Array.from({ length: portRows }).map((_, rowIdx) => {
                  const inPort = inPorts[rowIdx];
                  const outPort = outPorts[rowIdx];

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
                              className={`w-3.5 h-3.5 rounded-full border-2 transition-transform ${
                                inPort.signal === 'audio'
                                  ? 'bg-white dark:bg-[#0B0F17] border-amber-600 dark:border-amber-400 group-hover:scale-125'
                                  : 'bg-white dark:bg-[#0B0F17] border-cyan-600 dark:border-cyan-400 group-hover:scale-125'
                              } ${
                                canAcceptPending(inPort)
                                  ? 'ring-4 ring-cyan-500/35 scale-125'
                                  : ''
                              }`}
                            />
                          </button>
                          <span className="text-[11px] text-slate-700 dark:text-slate-300 whitespace-nowrap pl-1">
                            {inPort.label}
                          </span>
                        </div>
                      ) : (
                        <span />
                      )}

                      {/* Output Port */}
                      {outPort ? (
                        <div className="flex items-center gap-2 shrink-0 ml-auto">
                          <span className="text-[11px] text-slate-700 dark:text-slate-300 whitespace-nowrap pr-1 text-right">
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
                                  ? 'bg-amber-500 border-white dark:border-[#07090E] group-hover:scale-125'
                                  : 'bg-cyan-600 dark:bg-cyan-400 border-white dark:border-[#07090E] group-hover:scale-125'
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
