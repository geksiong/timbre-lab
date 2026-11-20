import React, { useMemo, useRef, useState } from 'react';
import {
  Trash2,
  Power,
  Copy,
  Unlink,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  PanelRightClose,
  Sliders,
  ArrowUpRight,
} from 'lucide-react';
import {
  MODULE_CATEGORY_META,
  MODULE_REGISTRY,
  isCyanModuleCategory,
} from '../engine/moduleRegistry';
import {
  HARMONIC_PRESETS,
  getFormantVowelName,
  parseHarmonicsString,
  serializeHarmonics,
} from '../engine/carrierWaves';
import {
  CORE_ESSENTIAL_PARAM_KEYS,
  computePatchModulationSummary,
} from '../engine/modulationSummary';
import { SynthEngine } from '../engine/SynthEngine';
import { ParamSpec, SynthConnection, SynthNode, SynthPatch } from '../engine/types';
import { MODULATABLE_PARAMS } from './ModMatrixPanel';
import { ModuleVisualizer } from './ModuleVisualizer';
import { PrecisionSlider } from './PrecisionSlider';

interface NodeInspectorProps {
  patch: SynthPatch;
  selectedNodeId: string | null;
  showAllParams: boolean;
  engine?: SynthEngine;
  theme?: 'light' | 'dark';
  onToggleShowAllParams: () => void;
  onUpdateNodeParam: (
    nodeId: string,
    key: string,
    value: number | string | boolean,
    recordHistory?: boolean
  ) => void;
  onToggleBypass: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onDuplicateNode: (nodeId: string) => void;
  onUpdateConnectionAmount: (connId: string, amount: number, recordHistory?: boolean) => void;
  onDeleteConnection: (connId: string) => void;
  onUpdatePatchMeta: (
    updates: Partial<Pick<SynthPatch, 'name' | 'polyphony' | 'description' | 'macroLabels'>>
  ) => void;
  onOpenModMatrixForNode?: (nodeId: string) => void;
  onQuickMapMacro?: (nodeId: string, paramKey: string, axis: 'macroX' | 'macroY') => void;
  onDragStartHistory?: () => void;
  onCommitHistory?: () => void;
  onCollapse?: () => void;
}


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
  showAllParams,
  engine,
  theme = 'light',
  onToggleShowAllParams,
  onUpdateNodeParam,
  onToggleBypass,
  onDeleteNode,
  onDuplicateNode,
  onUpdateConnectionAmount,
  onDeleteConnection,
  onUpdatePatchMeta,
  onOpenModMatrixForNode,
  onQuickMapMacro,
  onDragStartHistory,
  onCommitHistory,
  onCollapse,
}) => {
  const [guideExpanded, setGuideExpanded] = useState(false);
  const [localAdvancedOpen, setLocalAdvancedOpen] = useState(false);
  const selectedNode: SynthNode | undefined = patch.nodes.find((n) => n.id === selectedNodeId);
  const def = selectedNode ? MODULE_REGISTRY[selectedNode.type] : null;

  const modSummary = useMemo(() => {
    if (!selectedNode) return null;
    return computePatchModulationSummary(patch).get(selectedNode.id) ?? null;
  }, [patch, selectedNode]);

  const modulatableKeySet = useMemo(() => {
    if (!selectedNode) return new Set<string>();
    const list = MODULATABLE_PARAMS[selectedNode.type] ?? [];
    return new Set(list.map((p) => p.key));
  }, [selectedNode]);

  const nodeConnections: SynthConnection[] = selectedNode
    ? patch.connections.filter(
        (c) => c.fromNode === selectedNode.id || c.toNode === selectedNode.id
      )
    : [];

  const getNodeLabel = (id: string) => {
    const n = patch.nodes.find((x) => x.id === id);
    return n?.label || (n ? MODULE_REGISTRY[n.type].label : id);
  };

  const formatSourceReadable = (src: string) => {
    if (src === 'macroX') return `Macro X (${patch.macroLabels?.x ?? 'Tone'})`;
    if (src === 'macroY') return `Macro Y (${patch.macroLabels?.y ?? 'Space'})`;
    if (src === 'velocity') return 'Velocity';
    if (src === 'modWheel') return 'Mod Wheel';
    if (src === 'keyTrack') return 'Key Track';
    if (src === 'random') return 'Per-Note Random';
    if (src === 'noise') return 'Friction Noise';
    return getNodeLabel(src);
  };

  const { coreParams, advancedParams } = useMemo(() => {
    if (!selectedNode || !def) return { coreParams: [] as ParamSpec[], advancedParams: [] as ParamSpec[] };
    const visible = def.params.filter(
      (p) => !p.visibleWhen || p.visibleWhen(selectedNode.params)
    );
    if (visible.length <= 6) {
      return { coreParams: visible, advancedParams: [] as ParamSpec[] };
    }
    const coreKeyList = CORE_ESSENTIAL_PARAM_KEYS[selectedNode.type];
    if (coreKeyList) {
      const coreSet = new Set(coreKeyList);
      const core = visible.filter((p) => coreSet.has(p.key));
      const adv = visible.filter((p) => !coreSet.has(p.key));
      if (core.length > 0 && adv.length > 0) {
        return { coreParams: core, advancedParams: adv };
      }
    }
    return {
      coreParams: visible.slice(0, 5),
      advancedParams: visible.slice(5),
    };
  }, [selectedNode, def]);

  return (
    <aside className="h-full bg-white dark:bg-[#111622] border-l border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">
            {selectedNode ? selectedNode.label || def?.label : 'Patch Properties'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {selectedNode && def
              ? `${MODULE_CATEGORY_META[def.category].label.toUpperCase()} · ${selectedNode.type}`
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

      {/* Pinned Parameter-Reactive Waveform / Response Visualizer (always visible while scrolling) */}
      {selectedNode && def && (
        <div className="shrink-0 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#0D121C]">
          <ModuleVisualizer node={selectedNode} engine={engine} theme={theme} />
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {selectedNode && def ? (
          <>
            {/* Modulation Links Driving This Module */}
            {modSummary && modSummary.totalRoutes > 0 && (
              <div className="bg-cyan-500/8 dark:bg-cyan-500/10 border border-cyan-600/30 dark:border-cyan-500/35 rounded-md p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-cyan-900 dark:text-cyan-200">
                    Active Modulations ({modSummary.totalRoutes})
                  </span>
                  {onOpenModMatrixForNode && (
                    <button
                      type="button"
                      onClick={() => onOpenModMatrixForNode(selectedNode.id)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-700 dark:text-cyan-300 hover:underline"
                    >
                      <span>Mod Matrix</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
                {modSummary.slots.length > 0 && (
                  <div className="space-y-1">
                    {modSummary.slots.map((slot) => (
                      <div
                        key={slot.id}
                        className="flex items-center justify-between gap-2 text-[11px] text-slate-700 dark:text-slate-300"
                      >
                        <span className="truncate">
                          {formatSourceReadable(slot.source)} →{' '}
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {slot.targetParam}
                          </span>
                        </span>
                        <span className="font-mono tabular-nums text-cyan-700 dark:text-cyan-300 shrink-0">
                          {slot.amount >= 0 ? '+' : ''}
                          {Math.round(slot.amount * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {modSummary.cvConnectionCount > 0 && (
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    +{modSummary.cvConnectionCount} direct patchbay CV cable
                    {modSummary.cvConnectionCount > 1 ? 's' : ''} attached
                  </p>
                )}
              </div>
            )}

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

            {/* Custom 16-Partial Harmonic Editor */}
            {((selectedNode.type === 'oscillator' &&
              selectedNode.params.waveform === 'customHarmonics') ||
              (selectedNode.type === 'fmOperator' &&
                selectedNode.params.carrierWave === 'customHarmonics')) && (
              <CustomHarmonicsEditor
                rawValue={selectedNode.params.customHarmonics}
                onChange={(val) => onUpdateNodeParam(selectedNode.id, 'customHarmonics', val, true)}
              />
            )}

            {/* Progressive Disclosure Toolbar when module has Advanced params */}
            {advancedParams.length > 0 && (
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5">
                  <Sliders className="w-3 h-3" />
                  <span>
                    {showAllParams
                      ? `All Parameters (${coreParams.length + advancedParams.length})`
                      : `Core Controls (${coreParams.length})`}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={onToggleShowAllParams}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded border transition-colors ${
                    showAllParams
                      ? 'bg-cyan-500/15 border-cyan-600/45 text-cyan-800 dark:text-cyan-300'
                      : 'bg-slate-50 dark:bg-[#0B0F17] border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400'
                  }`}
                >
                  {showAllParams ? 'Pro: All' : 'Essential'}
                </button>
              </div>
            )}

            <div className="space-y-4">
              {coreParams.map((param) => {
                const rawVal = selectedNode.params[param.key] ?? param.defaultValue;
                const paramTags = modSummary?.paramSourceTags[param.key] ?? [];
                const canQuickMap = modulatableKeySet.has(param.key);

                const renderParamHeaderExtras = () => (
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1 flex-wrap">
                      {paramTags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] font-mono font-semibold text-cyan-700 dark:text-cyan-300 bg-cyan-500/12 border border-cyan-600/30 dark:border-cyan-500/35 px-1.5 py-0.5 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    {canQuickMap && onQuickMapMacro && (
                      <div className="flex items-center gap-1 opacity-75 hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => onQuickMapMacro(selectedNode.id, param.key, 'macroX')}
                          title={`Map ${param.label} to Macro X`}
                          className={`px-1.5 py-0.5 text-[10px] font-mono rounded border transition-colors ${
                            paramTags.includes('X')
                              ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-800 dark:text-cyan-200'
                              : 'bg-slate-50 dark:bg-[#0B0F17] border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-cyan-700 dark:hover:text-cyan-300 hover:border-cyan-500/50'
                          }`}
                        >
                          +X
                        </button>
                        <button
                          type="button"
                          onClick={() => onQuickMapMacro(selectedNode.id, param.key, 'macroY')}
                          title={`Map ${param.label} to Macro Y`}
                          className={`px-1.5 py-0.5 text-[10px] font-mono rounded border transition-colors ${
                            paramTags.includes('Y')
                              ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-800 dark:text-cyan-200'
                              : 'bg-slate-50 dark:bg-[#0B0F17] border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-cyan-700 dark:hover:text-cyan-300 hover:border-cyan-500/50'
                          }`}
                        >
                          +Y
                        </button>
                      </div>
                    )}
                  </div>
                );

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
                          onClick={() => onUpdateNodeParam(selectedNode.id, param.key, !enabled, true)}
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
                          onUpdateNodeParam(selectedNode.id, param.key, e.target.value, true)
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
                const isCyan = isCyanModuleCategory(def.category);
                const isInt =
                  param.key === 'octave' ||
                  param.key === 'semitone' ||
                  param.key === 'grainSize' ||
                  param.key === 'pitchShift' ||
                  param.key === 'preDelay';

                return (
                  <div key={param.key} className="space-y-1">
                    {(paramTags.length > 0 || canQuickMap) && renderParamHeaderExtras()}
                    <PrecisionSlider
                      label={
                        param.key === 'formantVowel'
                          ? `${param.label} (${getFormantVowelName(numVal)})`
                          : param.label
                      }
                      value={numVal}
                      defaultValue={typeof param.defaultValue === 'number' ? param.defaultValue : undefined}
                      min={min}
                      max={max}
                      step={step}
                      integer={isInt}
                      scale={param.scale || 'linear'}
                      unit={param.unit}
                      accent={isCyan ? 'cyan' : 'amber'}
                      onDragStart={onDragStartHistory}
                      onCommit={onCommitHistory}
                      onChange={(val) => onUpdateNodeParam(selectedNode.id, param.key, val, false)}
                    />
                    {param.tooltip && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">{param.tooltip}</p>
                    )}
                  </div>
                );
              })}

              {advancedParams.length > 0 && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 space-y-3">
                  {!showAllParams && (
                    <button
                      type="button"
                      onClick={() => setLocalAdvancedOpen((v) => !v)}
                      className="w-full px-3 py-2 rounded-md bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors"
                    >
                      <span>Advanced Calibration ({advancedParams.length})</span>
                      {localAdvancedOpen ? (
                        <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                      )}
                    </button>
                  )}

                  {(showAllParams || localAdvancedOpen) && (
                    <div className="space-y-4 pt-1">
                      {advancedParams.map((param) => {
                        const rawVal = selectedNode.params[param.key] ?? param.defaultValue;
                        const paramTags = modSummary?.paramSourceTags[param.key] ?? [];
                        const canQuickMap = modulatableKeySet.has(param.key);

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
                                  onClick={() => onUpdateNodeParam(selectedNode.id, param.key, !enabled, true)}
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
                                  onUpdateNodeParam(selectedNode.id, param.key, e.target.value, true)
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
                        const isCyan = isCyanModuleCategory(def.category);
                        const isInt =
                          param.key === 'octave' ||
                          param.key === 'semitone' ||
                          param.key === 'grainSize' ||
                          param.key === 'pitchShift' ||
                          param.key === 'preDelay';

                        return (
                          <div key={param.key} className="space-y-1">
                            {(paramTags.length > 0 || canQuickMap) && (
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <div className="flex items-center gap-1 flex-wrap">
                                  {paramTags.map((tag) => (
                                    <span
                                      key={tag}
                                      className="text-[10px] font-mono font-semibold text-cyan-700 dark:text-cyan-300 bg-cyan-500/12 border border-cyan-600/30 dark:border-cyan-500/35 px-1.5 py-0.5 rounded"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                                {canQuickMap && onQuickMapMacro && (
                                  <div className="flex items-center gap-1 opacity-75 hover:opacity-100 transition-opacity">
                                    <button
                                      type="button"
                                      onClick={() => onQuickMapMacro(selectedNode.id, param.key, 'macroX')}
                                      title={`Map ${param.label} to Macro X`}
                                      className={`px-1.5 py-0.5 text-[10px] font-mono rounded border transition-colors ${
                                        paramTags.includes('X')
                                          ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-800 dark:text-cyan-200'
                                          : 'bg-slate-50 dark:bg-[#0B0F17] border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-cyan-700 dark:hover:text-cyan-300 hover:border-cyan-500/50'
                                      }`}
                                    >
                                      +X
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onQuickMapMacro(selectedNode.id, param.key, 'macroY')}
                                      title={`Map ${param.label} to Macro Y`}
                                      className={`px-1.5 py-0.5 text-[10px] font-mono rounded border transition-colors ${
                                        paramTags.includes('Y')
                                          ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-800 dark:text-cyan-200'
                                          : 'bg-slate-50 dark:bg-[#0B0F17] border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-cyan-700 dark:hover:text-cyan-300 hover:border-cyan-500/50'
                                      }`}
                                    >
                                      +Y
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                            <PrecisionSlider
                              label={
                                param.key === 'formantVowel'
                                  ? `${param.label} (${getFormantVowelName(numVal)})`
                                  : param.label
                              }
                              value={numVal}
                              defaultValue={typeof param.defaultValue === 'number' ? param.defaultValue : undefined}
                              min={min}
                              max={max}
                              step={step}
                              integer={isInt}
                              scale={param.scale || 'linear'}
                              unit={param.unit}
                              accent={isCyan ? 'cyan' : 'amber'}
                              onDragStart={onDragStartHistory}
                              onCommit={onCommitHistory}
                              onChange={(val) => onUpdateNodeParam(selectedNode.id, param.key, val, false)}
                            />
                            {param.tooltip && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">{param.tooltip}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
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
                    const fromNodeObj = patch.nodes.find((n) => n.id === conn.fromNode);
                    const toNodeObj = patch.nodes.find((n) => n.id === conn.toNode);
                    const fromSig = fromNodeObj
                      ? MODULE_REGISTRY[fromNodeObj.type]?.ports.find((p) => p.id === conn.fromPort)?.signal
                      : undefined;
                    const toSig = toNodeObj
                      ? MODULE_REGISTRY[toNodeObj.type]?.ports.find((p) => p.id === conn.toPort)?.signal
                      : undefined;
                    const isCv = fromSig === 'cv' || toSig === 'cv' || conn.fromPort === 'cv';
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
                          defaultValue={isCv ? 0.25 : 1}
                          min={isCv ? -1 : 0}
                          max={isCv ? 1 : 1.5}
                          step={0.02}
                          fineStep={0.002}
                          accent={isCv ? 'cyan' : 'amber'}
                          onDragStart={onDragStartHistory}
                          onCommit={onCommitHistory}
                          onChange={(val) => onUpdateConnectionAmount(conn.id, val, false)}
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
