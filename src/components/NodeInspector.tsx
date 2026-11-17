import React, { useMemo, useRef, useState } from 'react';
import { Trash2, Power, Copy, Unlink, HelpCircle, ChevronDown, ChevronUp, PanelRightClose } from 'lucide-react';
import { MODULE_REGISTRY } from '../engine/moduleRegistry';
import {
  HARMONIC_PRESETS,
  computeCarrierPreviewSamples,
  getFormantVowelName,
  parseHarmonicsString,
  serializeHarmonics,
} from '../engine/carrierWaves';
import { SynthConnection, SynthNode, SynthPatch } from '../engine/types';
import { PrecisionSlider } from './PrecisionSlider';

interface NodeInspectorProps {
  patch: SynthPatch;
  selectedNodeId: string | null;
  onUpdateNodeParam: (nodeId: string, key: string, value: number | string | boolean) => void;
  onToggleBypass: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onDuplicateNode: (nodeId: string) => void;
  onUpdateConnectionAmount: (connId: string, amount: number) => void;
  onDeleteConnection: (connId: string) => void;
  onUpdatePatchMeta: (
    updates: Partial<Pick<SynthPatch, 'name' | 'polyphony' | 'description' | 'macroLabels'>>
  ) => void;
  onCollapse?: () => void;
}

const CV_TARGET_PORTS = new Set([
  'cutoff',
  'pitch',
  'index',
  'bow',
  'freq',
  'fb',
  'amp',
  'rate',
  'depth',
  'density',
  'mix',
  'shape',
]);

function biquadDbAtFreq(
  type: 'lowshelf' | 'highshelf' | 'peaking',
  freqHz: number,
  f0: number,
  gainDb: number,
  q: number,
  fs = 48000
): number {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * Math.max(20, Math.min(20000, f0))) / fs;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha =
    type === 'peaking'
      ? sinW0 / (2 * Math.max(0.3, q))
      : (sinW0 / 2) * Math.sqrt((A + 1 / A) * (1 / 0.707 - 1) + 2);

  let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;

  if (type === 'peaking') {
    b0 = 1 + alpha * A;
    b1 = -2 * cosW0;
    b2 = 1 - alpha * A;
    a0 = 1 + alpha / A;
    a1 = -2 * cosW0;
    a2 = 1 - alpha / A;
  } else if (type === 'lowshelf') {
    const sq = 2 * Math.sqrt(A) * alpha;
    b0 = A * (A + 1 - (A - 1) * cosW0 + sq);
    b1 = 2 * A * (A - 1 - (A + 1) * cosW0);
    b2 = A * (A + 1 - (A - 1) * cosW0 - sq);
    a0 = A + 1 + (A - 1) * cosW0 + sq;
    a1 = -2 * (A - 1 + (A + 1) * cosW0);
    a2 = A + 1 + (A - 1) * cosW0 - sq;
  } else {
    const sq = 2 * Math.sqrt(A) * alpha;
    b0 = A * (A + 1 + (A - 1) * cosW0 + sq);
    b1 = -2 * A * (A - 1 + (A + 1) * cosW0);
    b2 = A * (A + 1 + (A - 1) * cosW0 - sq);
    a0 = A + 1 - (A - 1) * cosW0 + sq;
    a1 = 2 * (A - 1 - (A + 1) * cosW0);
    a2 = A + 1 - (A - 1) * cosW0 - sq;
  }

  const w = (2 * Math.PI * freqHz) / fs;
  const cosW = Math.cos(w);
  const sinW = Math.sin(w);
  const cos2W = Math.cos(2 * w);
  const sin2W = Math.sin(2 * w);

  const numRe = b0 + b1 * cosW + b2 * cos2W;
  const numIm = -(b1 * sinW + b2 * sin2W);
  const denRe = a0 + a1 * cosW + a2 * cos2W;
  const denIm = -(a1 * sinW + a2 * sin2W);

  const magSq = (numRe * numRe + numIm * numIm) / Math.max(1e-12, denRe * denRe + denIm * denIm);
  return 10 * Math.log10(Math.max(1e-6, magSq));
}

const EqResponseCurve: React.FC<{ params: Record<string, number | string | boolean> }> = ({
  params,
}) => {
  const pathData = useMemo(() => {
    const lowFreq = Number(params.lowFreq ?? 180);
    const lowGain = Number(params.lowGain ?? 2.5);
    const mid1Freq = Number(params.mid1Freq ?? 420);
    const mid1Gain = Number(params.mid1Gain ?? 5.0);
    const mid1Q = Number(params.mid1Q ?? 2.2);
    const mid2Freq = Number(params.mid2Freq ?? 2400);
    const mid2Gain = Number(params.mid2Gain ?? 4.5);
    const mid2Q = Number(params.mid2Q ?? 2.4);
    const highFreq = Number(params.highFreq ?? 5200);
    const highGain = Number(params.highGain ?? -2.0);

    const w = 240;
    const h = 84;
    const minF = 40;
    const maxF = 15000;
    const points: string[] = [];

    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      const f = minF * Math.pow(maxF / minF, t);
      const db =
        biquadDbAtFreq('lowshelf', f, lowFreq, lowGain, 0.7) +
        biquadDbAtFreq('peaking', f, mid1Freq, mid1Gain, mid1Q) +
        biquadDbAtFreq('peaking', f, mid2Freq, mid2Gain, mid2Q) +
        biquadDbAtFreq('highshelf', f, highFreq, highGain, 0.7);
      const clampedDb = Math.max(-18, Math.min(18, db));
      const x = t * w;
      const y = h / 2 - (clampedDb / 18) * (h / 2 - 6);
      points.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return points.join(' ');
  }, [params]);

  return (
    <div className="bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-md p-2.5 space-y-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-slate-700 dark:text-slate-300">Body Resonance Curve</span>
        <span className="font-mono tabular-nums text-slate-500">40 Hz – 15 kHz</span>
      </div>
      <svg viewBox="0 0 240 84" className="w-full h-[84px] overflow-visible">
        <line x1="0" y1="42" x2="240" y2="42" className="stroke-slate-300 dark:stroke-slate-800" strokeWidth="1" strokeDasharray="3 3" />
        <line x1="60" y1="0" x2="60" y2="84" className="stroke-slate-200 dark:stroke-slate-800" strokeWidth="1" />
        <line x1="120" y1="0" x2="120" y2="84" className="stroke-slate-200 dark:stroke-slate-800" strokeWidth="1" />
        <line x1="180" y1="0" x2="180" y2="84" className="stroke-slate-200 dark:stroke-slate-800" strokeWidth="1" />
        <path d={pathData} fill="none" className="stroke-amber-600 dark:stroke-amber-500" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
};

const CarrierWaveformPreview: React.FC<{
  waveform: string;
  params: Record<string, number | string | boolean>;
}> = ({ waveform, params }) => {
  const { pathData, badgeText } = useMemo(() => {
    const samples = computeCarrierPreviewSamples(waveform, params, 128);
    const w = 240;
    const h = 68;
    const mid = h / 2;
    const pts: string[] = [];
    for (let i = 0; i < samples.length; i++) {
      const x = (i / (samples.length - 1)) * w;
      const y = mid - samples[i] * (mid - 6);
      pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }

    let badge = waveform;
    if (waveform === 'pulse') {
      badge = `${Math.round(Number(params.pulseWidth ?? 0.35) * 100)}% duty`;
    } else if (waveform === 'wavetable') {
      badge = `${String(params.wavetableBank ?? 'analog')} · ${Math.round(Number(params.wavetablePos ?? 0.25) * 100)}%`;
    } else if (waveform === 'vocalFormant') {
      const shift = Number(params.formantShift ?? 0);
      badge = `Vowel ${getFormantVowelName(Number(params.formantVowel ?? 0))}${shift !== 0 ? ` (${shift > 0 ? '+' : ''}${shift}st)` : ''}`;
    } else if (waveform === 'filteredNoise') {
      badge = `${Number(params.noiseCutoff ?? 1).toFixed(2)}x · Q ${Number(params.noiseQ ?? 8).toFixed(1)}`;
    } else if (waveform === 'customHarmonics') {
      badge = '16-partial additive';
    }

    return { pathData: pts.join(' '), badgeText: badge };
  }, [waveform, params]);

  return (
    <div className="bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-md p-2.5 space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="font-medium text-slate-700 dark:text-slate-300">Carrier Cycle Preview</span>
        <span className="font-mono tabular-nums text-amber-700 dark:text-amber-400 truncate">
          {badgeText}
        </span>
      </div>
      <svg viewBox="0 0 240 68" className="w-full h-[68px] overflow-visible">
        <line x1="0" y1="34" x2="240" y2="34" className="stroke-slate-300 dark:stroke-slate-800" strokeWidth="1" strokeDasharray="3 3" />
        <line x1="120" y1="0" x2="120" y2="68" className="stroke-slate-200 dark:stroke-slate-800" strokeWidth="1" />
        <path d={pathData} fill="none" className="stroke-amber-600 dark:stroke-amber-400" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

const CustomHarmonicsEditor: React.FC<{
  rawValue: unknown;
  onChange: (serialized: string) => void;
}> = ({ rawValue, onChange }) => {
  const harmonics = useMemo(() => parseHarmonicsString(rawValue), [rawValue]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const updateFromPointer = (clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const relX = Math.max(0, Math.min(0.9999, (clientX - rect.left) / Math.max(1, rect.width)));
    const idx = Math.floor(relX * 16);
    const relY = 1 - (clientY - rect.top) / Math.max(1, rect.height);
    const level = Math.max(0, Math.min(1, Math.round(relY * 20) / 20));
    const next = [...harmonics];
    next[idx] = level;
    if (next.every((v) => v < 0.01)) {
      next[0] = 0.05;
    }
    onChange(serializeHarmonics(next));
  };

  const activeCount = harmonics.filter((v) => v >= 0.02).length;

  return (
    <div className="bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-md p-2.5 space-y-2.5">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="font-medium text-slate-700 dark:text-slate-300">
          Harmonic Partials (H1–H16)
        </span>
        <span className="font-mono tabular-nums text-slate-500">
          {activeCount}/16 active
        </span>
      </div>

      <div
        ref={containerRef}
        role="group"
        aria-label="Custom 16-harmonic partial bar editor"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          draggingRef.current = true;
          updateFromPointer(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (!draggingRef.current) return;
          updateFromPointer(e.clientX, e.clientY);
        }}
        onPointerUp={() => {
          draggingRef.current = false;
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
        }}
        className="h-24 w-full grid grid-cols-16 gap-1 items-end p-1.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111622] cursor-crosshair select-none touch-none"
      >
        {harmonics.map((amp, i) => {
          const pct = Math.max(4, Math.round(amp * 100));
          return (
            <div key={i} className="h-full flex flex-col justify-end items-center group" title={`H${i + 1}: ${Math.round(amp * 100)}%`}>
              <div
                className={`w-full rounded-t-sm transition-colors ${
                  amp >= 0.02
                    ? i === 0
                      ? 'bg-amber-600 dark:bg-amber-400'
                      : 'bg-amber-500/80 dark:bg-amber-500/75 group-hover:bg-amber-600 dark:group-hover:bg-amber-400'
                    : 'bg-slate-200 dark:bg-slate-800'
                }`}
                style={{ height: `${pct}%` }}
              />
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-500 px-0.5">
        <span>H1</span>
        <span>H4</span>
        <span>H8</span>
        <span>H12</span>
        <span>H16</span>
      </div>

      <div className="flex flex-wrap gap-1 pt-0.5">
        {HARMONIC_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onChange(serializeHarmonics(preset.values))}
            className="px-2 py-1 text-[11px] font-medium rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111622] text-slate-700 dark:text-slate-300 hover:border-amber-500/60 hover:text-amber-700 dark:hover:text-amber-300 transition-colors whitespace-nowrap shrink-0"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export const NodeInspector: React.FC<NodeInspectorProps> = ({
  patch,
  selectedNodeId,
  onUpdateNodeParam,
  onToggleBypass,
  onDeleteNode,
  onDuplicateNode,
  onUpdateConnectionAmount,
  onDeleteConnection,
  onUpdatePatchMeta,
  onCollapse,
}) => {
  const [guideExpanded, setGuideExpanded] = useState(true);
  const selectedNode: SynthNode | undefined = patch.nodes.find((n) => n.id === selectedNodeId);
  const def = selectedNode ? MODULE_REGISTRY[selectedNode.type] : null;

  const nodeConnections: SynthConnection[] = selectedNode
    ? patch.connections.filter(
        (c) => c.fromNode === selectedNode.id || c.toNode === selectedNode.id
      )
    : [];

  const getNodeLabel = (id: string) => {
    const n = patch.nodes.find((x) => x.id === id);
    return n?.label || (n ? MODULE_REGISTRY[n.type].label : id);
  };

  return (
    <aside className="h-full bg-white dark:bg-[#111622] border-l border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">
            {selectedNode ? selectedNode.label || def?.label : 'Patch Properties'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {selectedNode
              ? `${def?.category.toUpperCase()} · ${selectedNode.type}`
              : `${patch.nodes.length} modules · ${patch.connections.length} cables`}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {selectedNode && selectedNode.type !== 'output' && (
            <>
              <button
                type="button"
                onClick={() => onToggleBypass(selectedNode.id)}
                title={selectedNode.bypassed ? 'Enable module' : 'Bypass module'}
                className={`p-2 rounded border transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center ${
                  selectedNode.bypassed
                    ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                    : 'bg-amber-500/12 dark:bg-amber-500/10 border-amber-500/50 dark:border-amber-500/40 text-amber-700 dark:text-amber-400'
                }`}
              >
                <Power className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onDuplicateNode(selectedNode.id)}
                title="Duplicate module"
                className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:border-slate-300 dark:hover:border-slate-700 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onDeleteNode(selectedNode.id)}
                title="Delete module"
                className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/40 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              title="Collapse right inspector"
              className="hidden lg:flex p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:border-slate-300 dark:hover:border-slate-700 transition-colors min-w-[32px] min-h-[36px] items-center justify-center"
            >
              <PanelRightClose className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {selectedNode && def ? (
          <>
            {/* Plain-English Acoustic Guide & Bowed Instrument Tip */}
            {(def.acousticGuide || def.bowedTip) && (
              <div className="bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
                <button
                  type="button"
                  onClick={() => setGuideExpanded((v) => !v)}
                  className="w-full px-3 py-2 flex items-center justify-between text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 text-cyan-700 dark:text-cyan-400" />
                    <span>What This Does</span>
                  </span>
                  {guideExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  )}
                </button>
                {guideExpanded && (
                  <div className="px-3 pb-3 pt-1.5 space-y-2 border-t border-slate-200 dark:border-slate-800/70 text-[11px] leading-relaxed">
                    {def.acousticGuide && (
                      <p className="text-slate-700 dark:text-slate-300">{def.acousticGuide}</p>
                    )}
                    {def.bowedTip && (
                      <p className="text-cyan-800 dark:text-cyan-300/90">
                        <span className="font-semibold text-cyan-900 dark:text-cyan-300">Bowed Tip: </span>
                        {def.bowedTip}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Live Frequency Response Graph for Parametric EQ */}
            {selectedNode.type === 'parametricEq' && (
              <EqResponseCurve params={selectedNode.params} />
            )}

            {/* Live Carrier Waveform Preview for Oscillator & FM Operator */}
            {(selectedNode.type === 'oscillator' || selectedNode.type === 'fmOperator') && (
              <CarrierWaveformPreview
                waveform={String(
                  selectedNode.type === 'oscillator'
                    ? selectedNode.params.waveform ?? 'sawtooth'
                    : selectedNode.params.carrierWave ?? 'sine'
                )}
                params={selectedNode.params}
              />
            )}

            {/* Custom 16-Partial Harmonic Editor */}
            {((selectedNode.type === 'oscillator' &&
              selectedNode.params.waveform === 'customHarmonics') ||
              (selectedNode.type === 'fmOperator' &&
                selectedNode.params.carrierWave === 'customHarmonics')) && (
              <CustomHarmonicsEditor
                rawValue={selectedNode.params.customHarmonics}
                onChange={(val) => onUpdateNodeParam(selectedNode.id, 'customHarmonics', val)}
              />
            )}

            <div className="space-y-4">
              {def.params.map((param) => {
                if (param.visibleWhen && !param.visibleWhen(selectedNode.params)) {
                  return null;
                }
                const rawVal = selectedNode.params[param.key] ?? param.defaultValue;

                if (param.type === 'toggle') {
                  const enabled = Boolean(rawVal);
                  return (
                    <div key={param.key} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          {param.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => onUpdateNodeParam(selectedNode.id, param.key, !enabled)}
                          className={`h-8 px-3 rounded text-xs font-medium border transition-colors ${
                            enabled
                              ? 'bg-cyan-500/15 border-cyan-600/50 dark:border-cyan-500/60 text-cyan-800 dark:text-cyan-300'
                              : 'bg-slate-100 dark:bg-[#0B0F17] border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {enabled ? 'On' : 'Off'}
                        </button>
                      </div>
                      {param.tooltip && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">{param.tooltip}</p>
                      )}
                    </div>
                  );
                }

                if (param.type === 'select' && param.options) {
                  return (
                    <div key={param.key} className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                        {param.label}
                      </label>
                      <select
                        value={String(rawVal)}
                        onChange={(e) =>
                          onUpdateNodeParam(selectedNode.id, param.key, e.target.value)
                        }
                        className="w-full h-10 px-3 text-xs bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500"
                      >
                        {param.options.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      {param.tooltip && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">{param.tooltip}</p>
                      )}
                    </div>
                  );
                }

                const numVal = Number(rawVal);
                const min = param.min ?? 0;
                const max = param.max ?? 1;
                const step = param.step ?? 0.01;
                const isCyan = def.category === 'modulator' || def.category === 'processor';
                const isInt =
                  param.key === 'octave' ||
                  param.key === 'semitone' ||
                  param.key === 'grainSize' ||
                  param.key === 'pitchShift' ||
                  param.key === 'preDelay';

                return (
                  <div key={param.key} className="space-y-1">
                    <PrecisionSlider
                      label={
                        param.key === 'formantVowel'
                          ? `${param.label} (${getFormantVowelName(numVal)})`
                          : param.label
                      }
                      value={numVal}
                      min={min}
                      max={max}
                      step={step}
                      integer={isInt}
                      scale={param.scale || 'linear'}
                      unit={param.unit}
                      accent={isCyan ? 'cyan' : 'amber'}
                      onChange={(val) => onUpdateNodeParam(selectedNode.id, param.key, val)}
                    />
                    {param.tooltip && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">{param.tooltip}</p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
              <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Module Wiring ({nodeConnections.length})
              </h3>
              {nodeConnections.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No cables attached. Drag or tap ports on the patchbay to wire this module.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {nodeConnections.map((conn) => {
                    const isOutgoing = conn.fromNode === selectedNode.id;
                    const isCv = conn.fromPort === 'cv' || CV_TARGET_PORTS.has(conn.toPort);
                    return (
                      <div
                        key={conn.id}
                        className="p-2.5 rounded-md bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-slate-700 dark:text-slate-300 font-medium break-words leading-snug">
                            {isOutgoing
                              ? `→ ${getNodeLabel(conn.toNode)} (${conn.toPort})`
                              : `← ${getNodeLabel(conn.fromNode)} (${conn.fromPort})`}
                          </span>
                          <button
                            type="button"
                            onClick={() => onDeleteConnection(conn.id)}
                            title="Disconnect cable"
                            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded shrink-0"
                          >
                            <Unlink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <PrecisionSlider
                          compact
                          value={conn.amount}
                          min={isCv ? -1 : 0}
                          max={isCv ? 1 : 1.5}
                          step={0.02}
                          fineStep={0.002}
                          accent={isCv ? 'cyan' : 'amber'}
                          onChange={(val) => onUpdateConnectionAmount(conn.id, val)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Instrument Name
              </label>
              <input
                type="text"
                value={patch.name}
                onChange={(e) => onUpdatePatchMeta({ name: e.target.value })}
                className="w-full h-10 px-3 text-xs bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <PrecisionSlider
              label="Max Polyphony"
              value={patch.polyphony}
              min={1}
              max={16}
              step={1}
              integer
              unit="voices"
              onChange={(val) => onUpdatePatchMeta({ polyphony: val })}
            />

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Patch Notes
              </label>
              <textarea
                rows={3}
                value={patch.description}
                onChange={(e) => onUpdatePatchMeta({ description: e.target.value })}
                className="w-full p-2.5 text-xs bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 rounded-md text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Macro X Axis Label
                </label>
                <input
                  type="text"
                  value={patch.macroLabels?.x ?? 'Tone / Filter'}
                  onChange={(e) =>
                    onUpdatePatchMeta({
                      macroLabels: {
                        x: e.target.value,
                        y: patch.macroLabels?.y ?? 'Space / Shimmer',
                      },
                    })
                  }
                  className="w-full h-9 px-2.5 text-xs bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 rounded-md text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Macro Y Axis Label
                </label>
                <input
                  type="text"
                  value={patch.macroLabels?.y ?? 'Space / Shimmer'}
                  onChange={(e) =>
                    onUpdatePatchMeta({
                      macroLabels: {
                        x: patch.macroLabels?.x ?? 'Tone / Filter',
                        y: e.target.value,
                      },
                    })
                  }
                  className="w-full h-9 px-2.5 text-xs bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 rounded-md text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 space-y-1.5">
              <p className="font-medium text-slate-700 dark:text-slate-300">Quick Patching Guide</p>
              <p>Click any module card on the patchbay to see what it does acoustically and calibrate its controls.</p>
              <p>
                <span className="text-amber-700 dark:text-amber-400 font-medium">Amber ports</span> carry audio signals.{' '}
                <span className="text-cyan-700 dark:text-cyan-400 font-medium">Cyan ports</span> carry modulation CV (envelopes and LFOs).
              </p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
