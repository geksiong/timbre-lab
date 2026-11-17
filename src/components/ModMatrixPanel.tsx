import React, { useMemo } from 'react';
import { Plus, Power, Trash2, ArrowRight, Sparkles } from 'lucide-react';
import { MODULE_REGISTRY } from '../engine/moduleRegistry';
import { ModCurveType, ModMatrixSlot, SynthPatch } from '../engine/types';
import { PrecisionSlider } from './PrecisionSlider';

interface ModMatrixPanelProps {
  patch: SynthPatch;
  onUpdateModMatrix: (slots: ModMatrixSlot[]) => void;
  onBackToPatchbay?: () => void;
}

interface TargetOption {
  value: string; // `${nodeId}:${paramKey}`
  nodeId: string;
  paramKey: string;
  label: string;
}

const MODULATABLE_PARAMS: Record<string, { key: string; label: string }[]> = {
  oscillator: [
    { key: 'pitch', label: 'Pitch' },
    { key: 'detune', label: 'Fine Detune' },
    { key: 'pulseWidth', label: 'Pulse Width (PWM)' },
    { key: 'wavetablePos', label: 'Wavetable Morph Pos' },
    { key: 'formantVowel', label: 'Vocal Formant Vowel' },
    { key: 'formantShift', label: 'Vocal Formant Shift' },
    { key: 'noiseCutoff', label: 'Noise Filter Pitch' },
    { key: 'noiseQ', label: 'Noise Resonance Q' },
    { key: 'gain', label: 'Output Level' },
  ],
  fmOperator: [
    { key: 'pitch', label: 'Carrier Pitch' },
    { key: 'modIndex', label: 'FM Depth' },
    { key: 'noiseFmDepth', label: 'Noise FM Depth' },
    { key: 'noiseBandwidth', label: 'Noise FM Tone' },
    { key: 'pulseWidth', label: 'Pulse Width (PWM)' },
    { key: 'wavetablePos', label: 'Wavetable Morph Pos' },
    { key: 'formantVowel', label: 'Vocal Formant Vowel' },
    { key: 'formantShift', label: 'Vocal Formant Shift' },
    { key: 'noiseCutoff', label: 'Noise Filter Pitch' },
    { key: 'noiseQ', label: 'Noise Resonance Q' },
    { key: 'gain', label: 'Output Level' },
  ],
  physicalString: [
    { key: 'pitch', label: 'String Pitch' },
    { key: 'bowPressure', label: 'Bow Pressure' },
    { key: 'damping', label: 'String Damping' },
    { key: 'brightness', label: 'Bow Bite' },
    { key: 'rosin', label: 'Rosin Grit' },
    { key: 'gain', label: 'Output Level' },
  ],
  noise: [
    { key: 'tone', label: 'Band Center Freq' },
    { key: 'gain', label: 'Noise Level' },
  ],
  combFilter: [
    { key: 'ratio', label: 'Comb Ratio / Delay' },
    { key: 'feedback', label: 'Comb Resonance' },
    { key: 'mix', label: 'Comb Wet Mix' },
  ],
  filter: [
    { key: 'cutoff', label: 'Filter Cutoff' },
    { key: 'resonance', label: 'Resonance Q' },
    { key: 'gain', label: 'Formant Gain' },
  ],
  parametricEq: [
    { key: 'lowGain', label: 'Low Shelf Gain' },
    { key: 'mid1Freq', label: 'Body Peak 1 Freq' },
    { key: 'mid1Gain', label: 'Body Peak 1 Gain' },
    { key: 'mid2Freq', label: 'Bridge Peak 2 Freq' },
    { key: 'mid2Gain', label: 'Bridge Peak 2 Gain' },
    { key: 'highGain', label: 'Air Shelf Gain' },
    { key: 'outputGain', label: 'EQ Output Level' },
  ],
  shaper: [{ key: 'mix', label: 'Warmth Mix' }],
  chorus: [
    { key: 'rate', label: 'Ensemble Rate' },
    { key: 'depth', label: 'Ensemble Depth' },
    { key: 'mix', label: 'Chorus Wet Mix' },
  ],
  granularCloud: [
    { key: 'grainSize', label: 'Grain Size' },
    { key: 'density', label: 'Grain Density' },
    { key: 'pitchShift', label: 'Cloud Pitch' },
    { key: 'spray', label: 'Time Spray' },
    { key: 'feedback', label: 'Cloud Feedback' },
    { key: 'mix', label: 'Cloud Wet Mix' },
  ],
  envelope: [{ key: 'amp', label: 'Envelope VCA Level' }],
  lfo: [
    { key: 'rate', label: 'LFO Rate' },
    { key: 'depth', label: 'LFO Depth' },
  ],
  delay: [
    { key: 'feedback', label: 'Echo Feedback' },
    { key: 'tone', label: 'Echo High Cut' },
    { key: 'mix', label: 'Echo Wet Mix' },
  ],
  reverb: [
    { key: 'shimmerMix', label: 'Shimmer Intensity' },
    { key: 'damping', label: 'Air Damping' },
    { key: 'modulation', label: 'Tail Drift' },
    { key: 'mix', label: 'Reverb Wet Mix' },
  ],
};

export const ModMatrixPanel: React.FC<ModMatrixPanelProps> = ({
  patch,
  onUpdateModMatrix,
  onBackToPatchbay,
}) => {
  const slots = patch.modMatrix ?? [];

  const sourceOptions = useMemo(() => {
    const base = [
      { value: 'macroX', label: `Macro XY · Horizontal X (${patch.macroLabels?.x ?? 'Tone'})` },
      { value: 'macroY', label: `Macro XY · Vertical Y (${patch.macroLabels?.y ?? 'Space'})` },
      { value: 'velocity', label: 'Note Velocity (Strike / Bow Speed)' },
      { value: 'keyTrack', label: 'Key Track (Keyboard Pitch)' },
      { value: 'modWheel', label: 'Mod Wheel (MIDI CC1)' },
      { value: 'random', label: 'Per-Note Random Variation' },
      { value: 'noise', label: 'Organic Friction Noise' },
    ];
    const nodeMods = patch.nodes
      .filter((n) => n.type === 'lfo' || n.type === 'envelope')
      .map((n) => ({
        value: n.id,
        label: `${n.label || MODULE_REGISTRY[n.type].label} (${n.type.toUpperCase()})`,
      }));
    return [...base, ...nodeMods];
  }, [patch.nodes, patch.macroLabels]);

  const viaOptions = useMemo(() => {
    return [
      { value: 'none', label: 'Direct (No Via)' },
      ...sourceOptions.filter((s) => s.value !== 'noise'),
    ];
  }, [sourceOptions]);

  const targetOptions = useMemo(() => {
    const opts: TargetOption[] = [];
    for (const node of patch.nodes) {
      const list = MODULATABLE_PARAMS[node.type];
      if (!list) continue;
      const nodeLabel = node.label || MODULE_REGISTRY[node.type].label;
      for (const p of list) {
        opts.push({
          value: `${node.id}:${p.key}`,
          nodeId: node.id,
          paramKey: p.key,
          label: `${nodeLabel} · ${p.label}`,
        });
      }
    }
    return opts;
  }, [patch.nodes]);

  const handleAddSlot = () => {
    const firstTarget = targetOptions[0];
    if (!firstTarget) return;
    const defaultSrc =
      patch.nodes.find((n) => n.type === 'lfo')?.id || 'velocity';
    const next: ModMatrixSlot = {
      id: `mod_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      enabled: true,
      source: defaultSrc,
      via: 'none',
      targetNodeId: firstTarget.nodeId,
      targetParam: firstTarget.paramKey,
      amount: 0.35,
      curve: 'linear',
    };
    onUpdateModMatrix([...slots, next]);
  };

  const handleUpdateSlot = (id: string, updates: Partial<ModMatrixSlot>) => {
    onUpdateModMatrix(slots.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  const handleDeleteSlot = (id: string) => {
    onUpdateModMatrix(slots.filter((s) => s.id !== id));
  };

  const applyAmbientRecipe = (recipe: 'macroXYSpace' | 'wanderCloud' | 'envSwellCloud') => {
    const lfoNode = patch.nodes.find((n) => n.type === 'lfo');
    const fltNode = patch.nodes.find((n) => n.type === 'filter');
    const envNode = patch.nodes.find((n) => n.type === 'envelope');
    const choNode = patch.nodes.find((n) => n.type === 'chorus');
    const grnNode = patch.nodes.find((n) => n.type === 'granularCloud');
    const revNode = patch.nodes.find((n) => n.type === 'reverb');
    const delNode = patch.nodes.find((n) => n.type === 'delay');

    const newSlots: ModMatrixSlot[] = [];
    const uid = (tag: string) =>
      `mod_${tag}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;

    if (recipe === 'macroXYSpace') {
      if (fltNode) {
        newSlots.push({
          id: uid('mxf'),
          enabled: true,
          source: 'macroX',
          via: 'none',
          targetNodeId: fltNode.id,
          targetParam: 'cutoff',
          amount: 0.55,
          curve: 'exp',
          label: 'Macro X → Air Filter Cutoff',
        });
      }
      if (choNode) {
        newSlots.push({
          id: uid('mxc'),
          enabled: true,
          source: 'macroX',
          via: 'none',
          targetNodeId: choNode.id,
          targetParam: 'mix',
          amount: 0.35,
          curve: 'linear',
          label: 'Macro X → Chorus Mix',
        });
      }
      if (revNode) {
        newSlots.push({
          id: uid('myr'),
          enabled: true,
          source: 'macroY',
          via: 'none',
          targetNodeId: revNode.id,
          targetParam: 'shimmerMix',
          amount: 0.6,
          curve: 'scurve',
          label: 'Macro Y → Shimmer Intensity',
        });
      }
      if (delNode) {
        newSlots.push({
          id: uid('myd'),
          enabled: true,
          source: 'macroY',
          via: 'none',
          targetNodeId: delNode.id,
          targetParam: 'mix',
          amount: 0.35,
          curve: 'linear',
          label: 'Macro Y → Echo Wash',
        });
      }
    } else if (recipe === 'wanderCloud' && lfoNode) {
      if (grnNode) {
        newSlots.push({
          id: uid('wgs'),
          enabled: true,
          source: lfoNode.id,
          via: 'none',
          targetNodeId: grnNode.id,
          targetParam: 'spray',
          amount: 0.42,
          curve: 'linear',
          label: 'LFO Drift → Cloud Spray',
        });
      }
      if (choNode) {
        newSlots.push({
          id: uid('wcd'),
          enabled: true,
          source: lfoNode.id,
          via: 'none',
          targetNodeId: choNode.id,
          targetParam: 'depth',
          amount: 0.32,
          curve: 'linear',
          label: 'LFO Drift → Chorus Depth',
        });
      }
      if (fltNode) {
        newSlots.push({
          id: uid('wf'),
          enabled: true,
          source: lfoNode.id,
          via: 'none',
          targetNodeId: fltNode.id,
          targetParam: 'cutoff',
          amount: 0.25,
          curve: 'linear',
          label: 'LFO Drift → Filter Breathe',
        });
      }
    } else if (recipe === 'envSwellCloud' && envNode) {
      if (grnNode) {
        newSlots.push({
          id: uid('egm'),
          enabled: true,
          source: envNode.id,
          via: 'none',
          targetNodeId: grnNode.id,
          targetParam: 'mix',
          amount: 0.4,
          curve: 'scurve',
          label: 'Envelope Swell → Cloud Mix',
        });
      }
      if (fltNode) {
        newSlots.push({
          id: uid('ef'),
          enabled: true,
          source: envNode.id,
          via: 'none',
          targetNodeId: fltNode.id,
          targetParam: 'cutoff',
          amount: 0.38,
          curve: 'linear',
          label: 'Envelope Swell → Filter Cutoff',
        });
      }
    }

    if (newSlots.length > 0) {
      onUpdateModMatrix([...slots, ...newSlots]);
    }
  };

  const applyBowedRecipe = (recipe: 'lfoCutoffAmp' | 'velBowBite' | 'modWheelVibrato') => {
    const lfoNode = patch.nodes.find((n) => n.type === 'lfo');
    const fltNode = patch.nodes.find((n) => n.type === 'filter');
    const eqNode = patch.nodes.find((n) => n.type === 'parametricEq');
    const envNode = patch.nodes.find((n) => n.type === 'envelope');
    const strNode = patch.nodes.find((n) => n.type === 'physicalString');
    const fmNode = patch.nodes.find((n) => n.type === 'fmOperator');
    const oscNode = patch.nodes.find((n) => n.type === 'oscillator');

    const newSlots: ModMatrixSlot[] = [];
    const uid = (tag: string) =>
      `mod_${tag}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;

    if (recipe === 'lfoCutoffAmp' && lfoNode) {
      if (fltNode) {
        newSlots.push({
          id: uid('lc'),
          enabled: true,
          source: lfoNode.id,
          via: 'none',
          targetNodeId: fltNode.id,
          targetParam: 'cutoff',
          amount: 0.24,
          curve: 'linear',
          label: 'LFO Shimmer → Filter Cutoff',
        });
      } else if (eqNode) {
        newSlots.push({
          id: uid('leq'),
          enabled: true,
          source: lfoNode.id,
          via: 'none',
          targetNodeId: eqNode.id,
          targetParam: 'mid2Freq',
          amount: 0.2,
          curve: 'linear',
          label: 'LFO Shimmer → Bridge Formant',
        });
      }
      if (envNode) {
        newSlots.push({
          id: uid('la'),
          enabled: true,
          source: lfoNode.id,
          via: 'none',
          targetNodeId: envNode.id,
          targetParam: 'amp',
          amount: 0.18,
          curve: 'linear',
          label: 'LFO Swell → Bow Amplitude',
        });
      }
    } else if (recipe === 'velBowBite') {
      if (strNode) {
        newSlots.push({
          id: uid('vb'),
          enabled: true,
          source: 'velocity',
          via: 'none',
          targetNodeId: strNode.id,
          targetParam: 'bowPressure',
          amount: 0.42,
          curve: 'exp',
          label: 'Velocity → Bow Pressure',
        });
      }
      if (fmNode) {
        newSlots.push({
          id: uid('vn'),
          enabled: true,
          source: 'velocity',
          via: 'none',
          targetNodeId: fmNode.id,
          targetParam: 'noiseFmDepth',
          amount: 0.38,
          curve: 'linear',
          label: 'Velocity → Rosin Noise FM',
        });
      }
      if (fltNode) {
        newSlots.push({
          id: uid('vf'),
          enabled: true,
          source: 'velocity',
          via: 'none',
          targetNodeId: fltNode.id,
          targetParam: 'cutoff',
          amount: 0.36,
          curve: 'linear',
          label: 'Velocity → Brightness',
        });
      }
    } else if (recipe === 'modWheelVibrato' && lfoNode) {
      const pitchTarget = strNode || oscNode || fmNode;
      if (pitchTarget) {
        newSlots.push({
          id: uid('mwv'),
          enabled: true,
          source: lfoNode.id,
          via: 'modWheel',
          targetNodeId: pitchTarget.id,
          targetParam: 'pitch',
          amount: 0.22,
          curve: 'scurve',
          label: 'LFO × ModWheel → Vibrato',
        });
      }
      if (eqNode) {
        newSlots.push({
          id: uid('mwf'),
          enabled: true,
          source: 'modWheel',
          via: 'none',
          targetNodeId: eqNode.id,
          targetParam: 'mid2Gain',
          amount: 0.35,
          curve: 'linear',
          label: 'ModWheel → Bridge Presence',
        });
      }
    }

    if (newSlots.length > 0) {
      onUpdateModMatrix([...slots, ...newSlots]);
    }
  };

  return (
    <div className="flex-1 h-full bg-[#F4F6FA] dark:bg-[#0B0F17] overflow-y-auto p-4 lg:p-6">
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Header + Plain-English Guide */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Complex Modulation Matrix
              </h2>
              <span className="text-xs font-mono tabular-nums text-cyan-700 dark:text-cyan-400">
                {slots.filter((s) => s.enabled).length} / {slots.length} active
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
              Route expressive performance controls—like note velocity, keyboard pitch, Mod Wheel, LFOs, or envelopes—to modulate multiple parameters at once. Use the optional <span className="text-slate-900 dark:text-slate-200 font-medium">Via</span> column to let one control scale the depth of another.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onBackToPatchbay && (
              <button
                type="button"
                onClick={onBackToPatchbay}
                className="h-9 px-3 text-xs font-medium bg-white dark:bg-[#111622] border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500 text-slate-800 dark:text-slate-200 rounded-md transition-colors whitespace-nowrap"
              >
                View Patchbay
              </button>
            )}
            <button
              type="button"
              onClick={handleAddSlot}
              disabled={targetOptions.length === 0}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 dark:bg-cyan-500 dark:hover:bg-cyan-400 disabled:opacity-40 text-white dark:text-slate-950 rounded-md transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Routing Slot</span>
            </button>
          </div>
        </div>

        {/* One-Click Bowed & Ambient Expression Recipes */}
        <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-2.5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
              <Sparkles className="w-3.5 h-3.5 text-cyan-700 dark:text-cyan-400 shrink-0" />
              <span className="font-medium">Ambient Expression Recipes:</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => applyAmbientRecipe('macroXYSpace')}
                className="h-8 px-3 text-xs font-medium bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 hover:border-cyan-500/60 text-slate-800 dark:text-slate-200 rounded transition-colors whitespace-nowrap"
              >
                + Macro X/Y → Filter &amp; Shimmer
              </button>
              <button
                type="button"
                onClick={() => applyAmbientRecipe('wanderCloud')}
                className="h-8 px-3 text-xs font-medium bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 hover:border-cyan-500/60 text-slate-800 dark:text-slate-200 rounded transition-colors whitespace-nowrap"
              >
                + LFO Drift → Chorus &amp; Cloud Spray
              </button>
              <button
                type="button"
                onClick={() => applyAmbientRecipe('envSwellCloud')}
                className="h-8 px-3 text-xs font-medium bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 hover:border-cyan-500/60 text-slate-800 dark:text-slate-200 rounded transition-colors whitespace-nowrap"
              >
                + Envelope → Cloud Mix &amp; Cutoff
              </button>
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800/70">
            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <span className="font-medium">Bowed Acoustic Recipes:</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => applyBowedRecipe('lfoCutoffAmp')}
                className="h-8 px-3 text-xs font-medium bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 hover:border-amber-500/60 text-slate-700 dark:text-slate-300 rounded transition-colors whitespace-nowrap"
              >
                + LFO → Cutoff &amp; Amp Swell
              </button>
              <button
                type="button"
                onClick={() => applyBowedRecipe('velBowBite')}
                className="h-8 px-3 text-xs font-medium bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 hover:border-amber-500/60 text-slate-700 dark:text-slate-300 rounded transition-colors whitespace-nowrap"
              >
                + Velocity → Bow Bite &amp; Rosin
              </button>
              <button
                type="button"
                onClick={() => applyBowedRecipe('modWheelVibrato')}
                className="h-8 px-3 text-xs font-medium bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 hover:border-amber-500/60 text-slate-700 dark:text-slate-300 rounded transition-colors whitespace-nowrap"
              >
                + Mod Wheel × LFO → Vibrato
              </button>
            </div>
          </div>
        </div>

        {/* Routing Rows */}
        {slots.length === 0 ? (
          <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-lg p-8 text-center space-y-3">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              No modulation matrix slots configured for this patch yet.
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              Add a custom modulation slot or try one of the Bowed Expression Recipes above to make notes respond dynamically to how hard and expressively you play.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {/* Desktop Column Header */}
            <div className="hidden lg:grid lg:grid-cols-[44px_minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_48px] gap-3 px-3 text-[11px] font-medium text-slate-600 dark:text-slate-400">
              <div>On</div>
              <div>Source</div>
              <div>Via Scaler</div>
              <div>Destination Parameter</div>
              <div>Depth &amp; Curve</div>
              <div className="text-right">Remove</div>
            </div>

            {slots.map((slot) => {
              const targetVal = `${slot.targetNodeId}:${slot.targetParam}`;
              return (
                <div
                  key={slot.id}
                  className={`bg-white dark:bg-[#111622] border rounded-lg p-3 grid grid-cols-1 lg:grid-cols-[44px_minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_48px] gap-3 items-center transition-opacity ${
                    slot.enabled ? 'border-slate-200 dark:border-slate-800' : 'border-slate-200/70 dark:border-slate-800/60 opacity-55'
                  }`}
                >
                  {/* Enable Toggle */}
                  <div className="flex items-center justify-between lg:justify-start">
                    <span className="lg:hidden text-xs text-slate-600 dark:text-slate-400">Routing Slot</span>
                    <button
                      type="button"
                      onClick={() => handleUpdateSlot(slot.id, { enabled: !slot.enabled })}
                      title={slot.enabled ? 'Mute routing' : 'Enable routing'}
                      className={`w-9 h-9 rounded border flex items-center justify-center transition-colors ${
                        slot.enabled
                          ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-700 dark:text-cyan-400'
                          : 'bg-slate-50 dark:bg-[#0B0F17] border-slate-300 dark:border-slate-700 text-slate-500'
                      }`}
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Source */}
                  <div className="space-y-1">
                    <label className="lg:hidden block text-[11px] text-slate-600 dark:text-slate-400">Source</label>
                    <select
                      value={slot.source}
                      onChange={(e) => handleUpdateSlot(slot.id, { source: e.target.value })}
                      className="w-full h-9 px-2.5 text-xs bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500 dark:focus:border-cyan-400"
                    >
                      {sourceOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Via */}
                  <div className="space-y-1">
                    <label className="lg:hidden block text-[11px] text-slate-600 dark:text-slate-400">Via Scaler</label>
                    <select
                      value={slot.via || 'none'}
                      onChange={(e) => handleUpdateSlot(slot.id, { via: e.target.value })}
                      className="w-full h-9 px-2.5 text-xs bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 rounded text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500 dark:focus:border-cyan-400"
                    >
                      {viaOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Target */}
                  <div className="space-y-1">
                    <label className="lg:hidden block text-[11px] text-slate-600 dark:text-slate-400">Destination</label>
                    <div className="flex items-center gap-1.5">
                      <ArrowRight className="w-3.5 h-3.5 text-cyan-700 dark:text-cyan-400 hidden lg:block shrink-0" />
                      <select
                        value={targetVal}
                        onChange={(e) => {
                          const [nodeId, paramKey] = e.target.value.split(':');
                          handleUpdateSlot(slot.id, {
                            targetNodeId: nodeId,
                            targetParam: paramKey,
                          });
                        }}
                        className="w-full h-9 px-2.5 text-xs bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500 dark:focus:border-cyan-400"
                      >
                        {targetOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Depth + Curve */}
                  <div className="space-y-1.5">
                    <PrecisionSlider
                      compact
                      value={slot.amount}
                      min={-1}
                      max={1}
                      step={0.02}
                      fineStep={0.005}
                      accent="cyan"
                      onChange={(val) => handleUpdateSlot(slot.id, { amount: val })}
                    />
                    <select
                      value={slot.curve}
                      onChange={(e) =>
                        handleUpdateSlot(slot.id, { curve: e.target.value as ModCurveType })
                      }
                      aria-label="Modulation curve"
                      className="w-full h-7 px-2 text-[11px] bg-slate-100 dark:bg-[#07090E] border border-slate-200 dark:border-slate-800 rounded text-slate-700 dark:text-slate-300 focus:outline-none focus:border-cyan-500 dark:focus:border-cyan-400"
                    >
                      <option value="linear">Curve: Linear</option>
                      <option value="exp">Curve: Exponential</option>
                      <option value="scurve">Curve: S-Curve Smooth</option>
                    </select>
                  </div>

                  {/* Delete */}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleDeleteSlot(slot.id)}
                      title="Remove modulation slot"
                      className="w-9 h-9 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-500/40 flex items-center justify-center transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
