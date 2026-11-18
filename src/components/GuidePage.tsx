import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Cable,
  ExternalLink,
  Layers,
  Play,
  Search,
  Sliders,
  Volume2,
} from 'lucide-react';
import { MODULE_REGISTRY } from '../engine/moduleRegistry';
import { ModuleDefinition, ModuleType } from '../engine/types';

export interface GuidePageProps {
  onBackToPatchbay: () => void;
  onOpenModMatrix: () => void;
  onLoadPresetById: (presetId: string, openPatchbay: boolean) => void;
  onAuditionPreset: (presetId: string) => void;
}

type GuideSectionId = 'signal-flow' | 'recipes' | 'modules' | 'modulation' | 'analysis-export';
type ModuleFilter = 'all' | 'source' | 'processor' | 'modulator' | 'fx';

interface InstrumentRecipe {
  id: string;
  family: string;
  title: string;
  presetId: string;
  presetLabel: string;
  goal: string;
  signalChain: string[];
  keySettings: { module: string; detail: string }[];
  whyItWorks: string;
}

const GUIDE_SECTIONS: { id: GuideSectionId; num: string; label: string }[] = [
  { id: 'signal-flow', num: '01', label: 'How Modeling Works' },
  { id: 'recipes', num: '02', label: 'Instrument Recipes' },
  { id: 'modules', num: '03', label: 'Module Reference' },
  { id: 'modulation', num: '04', label: 'Mod Matrix & Controls' },
  { id: 'analysis-export', num: '05', label: 'Scopes, MIDI & Export' },
];

const INSTRUMENT_RECIPES: InstrumentRecipe[] = [
  {
    id: 'recipe-erhu',
    family: 'Bowed Folk & Orchestral',
    title: 'Bowed Strings (Erhu, Violin, Cello, Sarangi)',
    presetId: 'ethnic-erhu',
    presetLabel: 'Erhu (二胡)',
    goal: 'Simulate continuous stick-slip bow grip, rosin texture, bow-contact notches, and fixed wooden soundbox resonance.',
    signalChain: [
      'Physical String (Bowed)',
      'FM Operator (Noise-FM Rosin)',
      'Comb Filter (Bow Notch)',
      'Parametric EQ (Soundbox)',
      'Envelope (Swell)',
      'Chamber Reverb',
    ],
    keySettings: [
      {
        module: 'Physical String',
        detail:
          'Excitation = Bowed Friction · Bow Pressure 0.48–0.68 · Bow Position 0.08–0.15 (bright bridge bite) or 0.28–0.38 (hollow over fingerboard) · Rosin Grit 0.25–0.45.',
      },
      {
        module: 'FM Operator',
        detail:
          'Noise FM Depth 80–220 Hz with Noise FM Tone at 2.0–3.2 kHz adds realistic horsehair micro-turbulence on top of the string core.',
      },
      {
        module: 'Comb Filter',
        detail:
          'Feedforward mode + Pitch Lock ON + Harmonic Ratio ~0.14 (1/7) mimics bowing 1/7th from the bridge, carving natural harmonic dips.',
      },
      {
        module: 'Parametric EQ',
        detail:
          'Fixed formants: Body Peak 1 around 280–450 Hz (+4 to +6 dB) for cavity warmth; Bridge Peak 2 around 1.8–2.8 kHz (+4 to +7 dB) for wooden presence.',
      },
      {
        module: 'Envelope & LFO',
        detail:
          'Attack 0.08–0.18s (gradual bow weight) · LFO Rate 5.0–5.8 Hz with Onset Delay 0.20s so wrist vibrato blooms after note onset.',
      },
    ],
    whyItWorks:
      'Acoustic violins and erhus get their voice from fixed wooden body resonances interacting with a continuous stick-slip exciter. Unlike a simple sawtooth + lowpass filter, Comb + Parametric EQ formants stay anchored in Hz even as you play up and down the scale.',
  },
  {
    id: 'recipe-violin',
    family: 'Orchestral Bowed',
    title: 'Orchestral Violin & Cello Expression',
    presetId: 'gm-40',
    presetLabel: 'GM Violin',
    goal: 'Achieve expressive concert string articulation where harder notes bite faster and Mod Wheel swells vibrato.',
    signalChain: [
      'Physical String + Warm Bowed Osc',
      'Comb Filter',
      'Parametric EQ',
      'Multimode Filter',
      'ADSR Envelope',
    ],
    keySettings: [
      {
        module: 'Mod Matrix (Velocity)',
        detail:
          'Map Note Velocity -> Bow Pressure (Exp curve, +0.35) and Velocity -> Filter Cutoff (+0.30) so strong bow strokes brighten naturally.',
      },
      {
        module: 'Mod Matrix (Via)',
        detail:
          'Map LFO -> String Pitch with Via = Mod Wheel (CC1) so pushing the Mod Wheel introduces lush solo vibrato on sustained notes.',
      },
      {
        module: 'Oscillator Layer',
        detail:
          'Blend a quiet Oscillator set to Warm Bowed (+6 cents detune) underneath Physical String for ensemble chorus thickness.',
      },
    ],
    whyItWorks:
      'Layering Physical String attack realism with a subtle detuned periodic wave bridges solo focus and orchestral section body, while the Mod Matrix ties expression directly to velocity and CC1.',
  },
  {
    id: 'recipe-plucked',
    family: 'Plucked & Sympathetic',
    title: 'Plucked Zithers & Curved-Bridge Shimmer (Guqin, Sitar, Harp)',
    presetId: 'ethnic-sitar',
    presetLabel: 'Sitar (सितार)',
    goal: 'Capture an immediate fingernail/plectrum transient followed by warm string damping and jawari bridge buzz.',
    signalChain: [
      'Physical String (Plucked)',
      'Comb Filter (Feedback Body)',
      'Parametric EQ',
      'Envelope',
      'Delay + Reverb',
    ],
    keySettings: [
      {
        module: 'Physical String',
        detail:
          'Excitation = Plucked String · String Decay 0.980–0.994 · Damping 0.35–0.65 (higher values darken the sustain tail naturally).',
      },
      {
        module: 'Jawari / Sympathetic',
        detail:
          'Raise Jawari / Buzz (0.15–0.45) for sitar, tanpura, or sarangi curved-bridge overtone bloom; keep at 0.0 for clean nylon guitar or harp.',
      },
      {
        module: 'Envelope',
        detail:
          'Fast Attack (0.002–0.01s) and long Release (0.6–1.8s) so strings continue ringing after lifting keys.',
      },
    ],
    whyItWorks:
      'Real strings lose high frequencies faster than low frequencies after a pluck. The Karplus-Strong waveguide lowpass filter inside the loop reproduces that exact natural spectral decay automatically.',
  },
  {
    id: 'recipe-winds',
    family: 'Air & Woodwinds',
    title: 'Breathy Flutes & Reeds (Shakuhachi, Dizi, Concert Flute)',
    presetId: 'ethnic-shakuhachi',
    presetLabel: 'Shakuhachi (尺八)',
    goal: 'Combine airy embouchure chiff on attack with a woody hollow column tone that responds to breath dynamics.',
    signalChain: [
      'FM Operator (Noise-FM Air)',
      'Breath / Noise (Filtered Chiff)',
      'Multimode Filter',
      'Parametric EQ',
      'ADSR Envelope',
    ],
    keySettings: [
      {
        module: 'Breath / Noise + Env',
        detail:
          'Set Breath/Noise Band Center around 1.8–3.6 kHz (White or Pink) and shape it with a crisp Envelope or Amp CV so breath chiff leads the tone.',
      },
      {
        module: 'FM Operator',
        detail:
          'Triangle/Sine carrier + Noise FM Depth 60–160 Hz creates organic air-jet pitch flutter without harsh metallic sidebands.',
      },
      {
        module: 'Comb Filter (Bipolar)',
        detail:
          'Try Bipolar mode or Ratio 0.5x to emphasize odd harmonics for hollow bamboo and clarinet-like cylinder acoustics.',
      },
    ],
    whyItWorks:
      'Flutes sound synthetic when rendered as pure sine waves. Injecting narrowband noise both alongside the tone and into FM carrier frequency reproduces breath turbulence across the mouth hole.',
  },
  {
    id: 'recipe-fm-perc',
    family: 'Brass, Keys & Percussive',
    title: 'FM Tines, Brass Swells & Tuned Percussion (Rhodes, Trumpet, Marimba)',
    presetId: 'gm-5',
    presetLabel: 'Electric Piano 2 (FM Tine)',
    goal: 'Use harmonic or inharmonic FM ratios modulated by Envelope CV for glassy tines, brass flare, or mallet strikes.',
    signalChain: [
      'FM Operator',
      'Warmth / Shaper',
      'Multimode Filter',
      'Envelope (Audio + CV)',
      'Stereo Delay + Reverb',
    ],
    keySettings: [
      {
        module: 'FM Mod Ratio',
        detail:
          'Integer ratios (1.0x brass/reed, 2.0x–4.0x electric tine) stay harmonic; fractional ratios (1.41x, 2.76x, 3.5x) create bells, marimba bars, and steel pans.',
      },
      {
        module: 'Envelope CV -> Index CV',
        detail:
          'Wire an ADSR Envelope CV output into the FM Operator Index CV input so the attack bell/brass burst brightens briefly and decays into a pure sustain.',
      },
      {
        module: 'Warmth / Shaper',
        detail:
          'Even Harmonics (0.15–0.30) + low Drive adds analog tape/tube weight without harsh clipping.',
      },
    ],
    whyItWorks:
      'Brass lips and struck metal bars generate bursts of upper partials at high energy that rapidly calm down as amplitude drops. Modulating FM Index with a fast Envelope directly recreates that physics.',
  },
];

const MODULE_ORDER: ModuleType[] = [
  'physicalString',
  'modalResonator',
  'blownPipe',
  'oscillator',
  'fmOperator',
  'subHarmonic',
  'noise',
  'combFilter',
  'parametricEq',
  'filter',
  'formantFilter',
  'shaper',
  'wavefolder',
  'ringMod',
  'bitcrusher',
  'crossfader',
  'envelope',
  'lfo',
  'sampleHold',
  'slopeEnv',
  'stepSequencer',
  'envFollower',
  'quantizer',
  'cvUtility',
  'chorus',
  'phaser',
  'granularCloud',
  'delay',
  'reverb',
  'busCompressor',
  'output',
];

export const GuidePage: React.FC<GuidePageProps> = ({
  onBackToPatchbay,
  onOpenModMatrix,
  onLoadPresetById,
  onAuditionPreset,
}) => {
  const [activeSection, setActiveSection] = useState<GuideSectionId>('signal-flow');
  const [moduleSearch, setModuleSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>('all');

  const orderedModules: ModuleDefinition[] = useMemo(() => {
    const q = moduleSearch.trim().toLowerCase();
    return MODULE_ORDER.map((t) => MODULE_REGISTRY[t]).filter((def) => {
      if (moduleFilter !== 'all') {
        if (moduleFilter === 'fx' && def.category !== 'fx' && def.category !== 'io') return false;
        if (moduleFilter !== 'fx' && def.category !== moduleFilter) return false;
      }
      if (!q) return true;
      return (
        def.label.toLowerCase().includes(q) ||
        def.description.toLowerCase().includes(q) ||
        (def.acousticGuide || '').toLowerCase().includes(q) ||
        (def.bowedTip || '').toLowerCase().includes(q) ||
        def.params.some((p) => p.label.toLowerCase().includes(q))
      );
    });
  }, [moduleSearch, moduleFilter]);

  const scrollToSection = (id: GuideSectionId) => {
    setActiveSection(id);
    const el = document.getElementById(`guide-${id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <main className="flex-1 h-full overflow-y-auto bg-[#F4F6FA] dark:bg-[#07090E] text-slate-900 dark:text-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10">
        {/* Header */}
        <header className="pb-6 border-b border-slate-200 dark:border-slate-800/90 flex flex-col lg:flex-row lg:items-end justify-between gap-5">
          <div className="space-y-2.5 max-w-3xl">
            <div className="flex items-center gap-2 text-xs font-mono text-cyan-700 dark:text-cyan-400">
              <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
              <span>REFERENCE &amp; LEARNER&apos;S GUIDE</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Acoustic Instrument Modeling &amp; Studio Manual
            </h1>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed max-w-[70ch]">
              Learn how physical waveguides, Noise-FM, comb cavities, fixed-formant EQ, and modulation routing combine to build realistic bowed, plucked, wind, and percussive instruments—and how every control in Timbre Lab works.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={onBackToPatchbay}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md transition-colors whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to Patchbay</span>
            </button>
            <button
              type="button"
              onClick={onOpenModMatrix}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-medium bg-white dark:bg-[#111622] border border-slate-300 dark:border-slate-700 hover:border-cyan-500/60 text-slate-800 dark:text-slate-200 rounded-md transition-colors whitespace-nowrap"
            >
              <Sliders className="w-3.5 h-3.5 text-cyan-700 dark:text-cyan-400" />
              <span>Open Mod Matrix</span>
            </button>
          </div>
        </header>

        {/* Mobile Quick Jump Bar */}
        <nav
          aria-label="Guide sections"
          className="lg:hidden sticky top-0 z-10 -mx-4 px-4 py-2.5 bg-[#F4F6FA]/95 dark:bg-[#07090E]/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto"
        >
          {GUIDE_SECTIONS.map((sec) => (
            <button
              key={sec.id}
              type="button"
              onClick={() => scrollToSection(sec.id)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded whitespace-nowrap shrink-0 border transition-colors ${
                activeSection === sec.id
                  ? 'bg-white dark:bg-[#111622] border-amber-500/60 text-amber-800 dark:text-amber-300'
                  : 'bg-slate-100 dark:bg-[#0B0F17] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <span className="font-mono text-[10px] mr-1 opacity-75">{sec.num}</span>
              {sec.label}
            </button>
          ))}
        </nav>

        <div className="pt-6 lg:pt-8 flex gap-10 items-start">
          {/* Desktop Sticky Sidebar TOC */}
          <aside className="hidden lg:block w-56 shrink-0 sticky top-6 space-y-5">
            <nav aria-label="Guide sections" className="space-y-1">
              <div className="px-2 pb-1.5 text-[11px] font-mono uppercase tracking-wider text-slate-500">
                Contents
              </div>
              {GUIDE_SECTIONS.map((sec) => (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => scrollToSection(sec.id)}
                  className={`w-full text-left px-2.5 py-2 rounded-md text-xs font-medium flex items-center gap-2 transition-colors ${
                    activeSection === sec.id
                      ? 'bg-white dark:bg-[#111622] text-amber-800 dark:text-amber-300 border border-slate-200 dark:border-slate-700/80 shadow-xs dark:shadow-none'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/70 dark:hover:bg-[#0B0F17] border border-transparent'
                  }`}
                >
                  <span className="font-mono text-[11px] text-cyan-700 dark:text-cyan-400 shrink-0">{sec.num}</span>
                  <span className="truncate">{sec.label}</span>
                </button>
              ))}
            </nav>

            <div className="p-3 rounded-lg bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 space-y-2 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
              <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                <span>Live Practice Tip</span>
              </div>
              <p>
                The keyboard &amp; Signal Scopes stay docked at the bottom while you read. Load any recipe button, switch scopes to{' '}
                <span className="font-mono text-cyan-700 dark:text-cyan-300">FFT×Time</span>, and watch how resonances respond as you play!
              </p>
            </div>
          </aside>

          {/* Main Reference Content */}
          <div className="flex-1 min-w-0 space-y-12 pb-10">
            {/* SECTION 01: HOW MODELING WORKS */}
            <section id="guide-signal-flow" className="scroll-mt-16 space-y-5">
              <div className="space-y-1">
                <span className="text-xs font-mono text-cyan-700 dark:text-cyan-400">01 · CORE MENTAL MODEL</span>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  How Physical &amp; Acoustic Instruments Work
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-[68ch]">
                  Every real acoustic instrument splits into two interacting halves: an{' '}
                  <span className="text-slate-900 dark:text-slate-200 font-medium">Exciter</span> that injects energy (bow hair, pluck, breath, or mallet) and a{' '}
                  <span className="text-slate-900 dark:text-slate-200 font-medium">Resonator / Body</span> that colors that energy into wood, brass, silk, or skin tone.
                </p>
              </div>

              {/* Visual 5-Stage Signal Chain Diagram */}
              <div className="bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-4">
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Standard Modular Signal Flow (Left → Right)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                  {[
                    {
                      step: '1. Source',
                      accent: 'border-amber-500/40 bg-amber-500/10 dark:bg-amber-500/5',
                      tag: 'text-amber-800 dark:text-amber-300',
                      items: 'Physical String · Oscillator · FM Operator · Breath/Noise',
                      role: 'Creates raw vibration & friction',
                    },
                    {
                      step: '2. String / Cavity',
                      accent: 'border-cyan-500/40 bg-cyan-500/10 dark:bg-cyan-500/5',
                      tag: 'text-cyan-800 dark:text-cyan-300',
                      items: 'Comb Filter · Warmth Shaper',
                      role: 'Carves bow-point notches & wood resonances',
                    },
                    {
                      step: '3. Formant Body',
                      accent: 'border-cyan-500/40 bg-cyan-500/10 dark:bg-cyan-500/5',
                      tag: 'text-cyan-800 dark:text-cyan-300',
                      items: 'Parametric EQ · Multimode Filter',
                      role: 'Shapes fixed soundbox peaks & brightness',
                    },
                    {
                      step: '4. Articulation',
                      accent: 'border-cyan-500/40 bg-cyan-500/10 dark:bg-cyan-500/5',
                      tag: 'text-cyan-800 dark:text-cyan-300',
                      items: 'ADSR Envelope · LFO · Mod Matrix',
                      role: 'Controls swell, decay & vibrato over time',
                    },
                    {
                      step: '5. Space & Master',
                      accent: 'border-amber-500/40 bg-amber-500/10 dark:bg-amber-500/5',
                      tag: 'text-amber-800 dark:text-amber-300',
                      items: 'Stereo Delay · Reverb · Master Output',
                      role: 'Adds room reflections & stereo balance',
                    },
                  ].map((stage, idx) => (
                    <div
                      key={stage.step}
                      className={`rounded-md border p-3 space-y-1.5 relative ${stage.accent}`}
                    >
                      <div className={`text-[11px] font-mono font-semibold ${stage.tag}`}>
                        {stage.step}
                      </div>
                      <div className="text-xs font-medium text-slate-900 dark:text-slate-100 leading-snug">
                        {stage.items}
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">{stage.role}</p>
                      {idx < 4 && (
                        <ArrowRight
                          className="hidden sm:block w-3.5 h-3.5 text-slate-500 absolute -right-2.5 top-1/2 -translate-y-1/2 bg-white dark:bg-[#0B0F17] rounded-full z-10"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  ))}
                </div>

                {/* Port & Cable Color Legend */}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="flex items-start gap-2.5">
                    <span className="w-3 h-3 rounded-full bg-amber-500 border-2 border-white dark:border-[#07090E] mt-0.5 shrink-0" />
                    <div className="space-y-0.5">
                      <div className="font-semibold text-amber-800 dark:text-amber-300">
                        Amber Ports &amp; Solid Cables (Audio Path)
                      </div>
                      <p className="text-slate-600 dark:text-slate-400 leading-snug">
                        Carry the audible sound waveform from generators into filters, EQ, envelopes, FX, and speakers. Note: Audio feedback loops between separate modules are automatically prevented for stability.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-3 h-3 rounded-full bg-cyan-500 dark:bg-cyan-400 border-2 border-white dark:border-[#07090E] mt-0.5 shrink-0" />
                    <div className="space-y-0.5">
                      <div className="font-semibold text-cyan-800 dark:text-cyan-300">
                        Cyan Ports &amp; Dashed Cables (Control Voltage / CV)
                      </div>
                      <p className="text-slate-600 dark:text-slate-400 leading-snug">
                        Silent control signals from LFOs and Envelopes that move knobs automatically—such as vibrato into Pitch CV, or bow swell into Filter Cutoff CV. Negative cable amounts invert the sweep!
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Patchbay Controls Cheatsheet */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-1">
                  <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <Cable className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                    <span>Wiring Cables</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    Drag from any right-side <span className="text-slate-900 dark:text-slate-200 font-medium">Output</span> port to a matching-color left-side <span className="text-slate-900 dark:text-slate-200 font-medium">Input</span> port, or tap an output once and tap a highlighted target port. Click any cable to adjust gain/depth or unwire.
                  </p>
                </div>
                <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-1">
                  <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-cyan-700 dark:text-cyan-400" />
                    <span>Bypass &amp; Canvas Navigation</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    Click the power icon on a module header to bypass it cleanly and compare before/after tone. Drag empty background to pan, scroll wheel to zoom, or press <span className="text-slate-900 dark:text-slate-200 font-medium">Auto Layout</span> &amp; <span className="text-slate-900 dark:text-slate-200 font-medium">Fit</span>.
                  </p>
                </div>
                <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-1">
                  <div className="font-semibold text-slate-900 dark:text-slate-100">Why Fixed Formants Matter</div>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    When a violinist plays higher notes, the string pitch rises—but the wooden violin body still resonates at ~280 Hz, ~450 Hz, and ~2.4 kHz. That contrast between moving pitch and fixed{' '}
                    <span className="text-slate-900 dark:text-slate-200 font-medium">Parametric EQ</span> peaks is what makes acoustic instruments recognizable.
                  </p>
                </div>
              </div>
            </section>

            {/* SECTION 02: INSTRUMENT RECIPES */}
            <section id="guide-recipes" className="scroll-mt-16 space-y-5">
              <div className="space-y-1">
                <span className="text-xs font-mono text-cyan-700 dark:text-cyan-400">02 · HANDS-ON COOKBOOK</span>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  Instrument Modeling Recipes
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-[68ch]">
                  Load any blueprint below to audition it immediately on the docked keyboard or open its wiring inside the Patchbay.
                </p>
              </div>

              <div className="space-y-4">
                {INSTRUMENT_RECIPES.map((recipe) => (
                  <article
                    key={recipe.id}
                    className="bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden"
                  >
                    <div className="px-4 py-3 bg-slate-50 dark:bg-[#111622] border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-mono text-cyan-700 dark:text-cyan-400 uppercase tracking-wide">
                          {recipe.family}
                        </div>
                        <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100">
                          {recipe.title}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        <button
                          type="button"
                          onClick={() => onAuditionPreset(recipe.presetId)}
                          className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium bg-white dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 hover:border-cyan-500/60 text-cyan-800 dark:text-cyan-300 rounded transition-colors whitespace-nowrap"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Audition {recipe.presetLabel}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onLoadPresetById(recipe.presetId, true)}
                          className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded transition-colors whitespace-nowrap"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Inspect in Patchbay</span>
                        </button>
                      </div>
                    </div>

                    <div className="p-4 space-y-3.5 text-xs">
                      <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{recipe.goal}</p>

                      {/* Chain Breadcrumb */}
                      <div className="flex items-center gap-1.5 flex-wrap bg-slate-50 dark:bg-[#07090E] border border-slate-200 dark:border-slate-800/90 rounded px-3 py-2 font-mono text-[11px]">
                        <span className="text-slate-500 mr-1">Chain:</span>
                        {recipe.signalChain.map((nodeName, idx) => (
                          <React.Fragment key={nodeName}>
                            <span className="text-amber-800 dark:text-amber-300">{nodeName}</span>
                            {idx < recipe.signalChain.length - 1 && (
                              <span className="text-slate-400 dark:text-slate-600">→</span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>

                      {/* Key Parameter Breakdown */}
                      <dl className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {recipe.keySettings.map((item) => (
                          <div
                            key={item.module}
                            className="bg-slate-50 dark:bg-[#111622]/70 border border-slate-200 dark:border-slate-800/80 rounded p-2.5 space-y-1"
                          >
                            <dt className="font-semibold text-slate-900 dark:text-slate-100">{item.module}</dt>
                            <dd className="text-slate-600 dark:text-slate-400 leading-relaxed">{item.detail}</dd>
                          </div>
                        ))}
                      </dl>

                      <p className="text-[11px] text-cyan-800 dark:text-cyan-300/90 bg-cyan-500/10 dark:bg-cyan-500/5 border border-cyan-500/25 dark:border-cyan-500/20 rounded px-3 py-2 leading-relaxed">
                        <span className="font-semibold text-cyan-900 dark:text-cyan-300">Acoustic Insight: </span>
                        {recipe.whyItWorks}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            {/* SECTION 03: MODULE & DSP REFERENCE */}
            <section id="guide-modules" className="scroll-mt-16 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div className="space-y-1">
                  <span className="text-xs font-mono text-cyan-700 dark:text-cyan-400">03 · DSP ENCYCLOPEDIA</span>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                    All {MODULE_ORDER.length} Synth Modules Explained
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                    Synced directly with the studio&apos;s live DSP definitions, ports, and bowed-instrument tips.
                  </p>
                </div>

                {/* Filter + Search */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={moduleSearch}
                      onChange={(e) => setModuleSearch(e.target.value)}
                      placeholder="Filter modules or params..."
                      className="h-8 pl-8 pr-3 text-xs bg-white dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-amber-500 w-48"
                    />
                  </div>
                  <div className="flex items-center bg-slate-100 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded p-0.5 text-[11px]">
                    {(
                      [
                        { id: 'all', label: 'All' },
                        { id: 'source', label: 'Sources' },
                        { id: 'processor', label: 'Processors' },
                        { id: 'modulator', label: 'Modulators' },
                        { id: 'fx', label: 'FX / Out' },
                      ] as { id: ModuleFilter; label: string }[]
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setModuleFilter(f.id)}
                        className={`px-2 py-1 rounded transition-colors whitespace-nowrap ${
                          moduleFilter === f.id
                            ? 'bg-white dark:bg-slate-800 text-amber-800 dark:text-amber-300 font-medium shadow-xs dark:shadow-none'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {orderedModules.map((def) => {
                  const isModOrProc = def.category === 'modulator' || def.category === 'processor';
                  const inPorts = def.ports.filter((p) => p.direction === 'in');
                  const outPorts = def.ports.filter((p) => p.direction === 'out');

                  return (
                    <article
                      key={def.type}
                      className="bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3 flex flex-col"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-xs ${
                                isModOrProc ? 'bg-cyan-500 dark:bg-cyan-400' : 'bg-amber-500 dark:bg-amber-400'
                              }`}
                            />
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{def.label}</h3>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-snug">
                            {def.description}
                          </p>
                        </div>
                        <span
                          className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border shrink-0 ${
                            isModOrProc
                              ? 'border-cyan-500/35 text-cyan-800 dark:text-cyan-300 bg-cyan-500/10'
                              : 'border-amber-500/35 text-amber-800 dark:text-amber-300 bg-amber-500/10'
                          }`}
                        >
                          {def.category}
                        </span>
                      </div>

                      {def.acousticGuide && (
                        <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                          {def.acousticGuide}
                        </p>
                      )}

                      {def.bowedTip && (
                        <p className="text-[11px] text-cyan-800 dark:text-cyan-200/90 bg-cyan-500/10 dark:bg-cyan-500/5 border border-cyan-500/25 dark:border-cyan-500/20 rounded px-2.5 py-2 leading-snug">
                          <span className="font-semibold text-cyan-900 dark:text-cyan-300">Bowed Tip: </span>
                          {def.bowedTip}
                        </p>
                      )}

                      {/* Ports */}
                      <div className="text-[11px] font-mono flex flex-wrap gap-x-4 gap-y-1 pt-1 border-t border-slate-200 dark:border-slate-800/80">
                        {inPorts.length > 0 && (
                          <div className="text-slate-600 dark:text-slate-400">
                            <span className="text-slate-500">In: </span>
                            {inPorts.map((p, idx) => (
                              <React.Fragment key={p.id}>
                                <span className={p.signal === 'cv' ? 'text-cyan-700 dark:text-cyan-400' : 'text-amber-800 dark:text-amber-300'}>
                                  {p.label}
                                </span>
                                {idx < inPorts.length - 1 ? ', ' : ''}
                              </React.Fragment>
                            ))}
                          </div>
                        )}
                        {outPorts.length > 0 && (
                          <div className="text-slate-600 dark:text-slate-400">
                            <span className="text-slate-500">Out: </span>
                            {outPorts.map((p, idx) => (
                              <React.Fragment key={p.id}>
                                <span className={p.signal === 'cv' ? 'text-cyan-700 dark:text-cyan-400' : 'text-amber-800 dark:text-amber-300'}>
                                  {p.label}
                                </span>
                                {idx < outPorts.length - 1 ? ', ' : ''}
                              </React.Fragment>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Controls Summary */}
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed pt-1 border-t border-slate-200/80 dark:border-slate-800/60">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">Controls: </span>
                        {def.params.map((p) => p.label).join(' · ')}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            {/* SECTION 04: MODULATION MATRIX & PRECISION CONTROLS */}
            <section id="guide-modulation" className="scroll-mt-16 space-y-5">
              <div className="space-y-1">
                <span className="text-xs font-mono text-cyan-700 dark:text-cyan-400">04 · EXPRESSION &amp; PRECISION</span>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  Modulation Matrix, CV Cables &amp; Precision Controls
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-[68ch]">
                  Real players never play every note at the exact same brightness or vibrato depth. Timbre Lab supports two complementary modulation layers that add together per voice.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2.5">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    CV Cables vs. Modulation Matrix
                  </h3>
                  <ul className="space-y-2 text-slate-600 dark:text-slate-400 leading-relaxed list-disc pl-4">
                    <li>
                      <span className="text-amber-800 dark:text-amber-300 font-medium">Patchbay CV Cables</span> visually connect LFO or Envelope outputs directly to Pitch, Cutoff, Shape CV (PWM / Wavetable / Formant / Noise), Bow Pressure, Comb Freq/Feedback, FM Index, or Amp CV ports.
                    </li>
                    <li>
                      <span className="text-cyan-800 dark:text-cyan-300 font-medium">Modulation Matrix</span> adds expressive performance sources—<span className="text-slate-900 dark:text-slate-200">Note Velocity</span>, <span className="text-slate-900 dark:text-slate-200">Key Track</span>, <span className="text-slate-900 dark:text-slate-200">Mod Wheel (CC1)</span>, <span className="text-slate-900 dark:text-slate-200">Per-Note Random</span>, and <span className="text-slate-900 dark:text-slate-200">Organic Friction Noise</span>—plus targets with no cable jack (like EQ peak frequencies, Comb Resonance, or Rosin Grit).
                    </li>
                    <li>
                      <span className="text-slate-900 dark:text-slate-200 font-medium">Via Scaler Multiplier:</span> Lets one source scale another dynamically. Classic example: <span className="font-mono text-cyan-800 dark:text-cyan-300">LFO → String Pitch (Via: Mod Wheel)</span> gives zero vibrato at rest and expressive vibrato as you raise CC1.
                    </li>
                    <li>
                      <span className="text-slate-900 dark:text-slate-200 font-medium">Curves:</span> Use <span className="text-slate-900 dark:text-slate-200">Linear</span> for direct scaling, <span className="text-slate-900 dark:text-slate-200">Exponential</span> so gentle playing stays mellow while hard hits bite sharply, and <span className="text-slate-900 dark:text-slate-200">S-Curve</span> for smooth, rounded swells.
                    </li>
                  </ul>
                </div>

                <div className="bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2.5">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Precision Slider &amp; Inspector Shortcuts
                  </h3>
                  <ul className="space-y-2 text-slate-600 dark:text-slate-400 leading-relaxed list-disc pl-4">
                    <li>
                      <span className="text-slate-900 dark:text-slate-200 font-medium">10x Fine Resolution:</span> Hold{' '}
                      <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#07090E] border border-slate-300 dark:border-slate-700 font-mono text-[10px] text-amber-800 dark:text-amber-300">
                        Shift
                      </kbd>{' '}
                      while dragging any slider (or toggle its <span className="font-mono text-slate-900 dark:text-slate-200">Fine</span> button) for ultra-precise micro-tuning of Comb ratios, EQ Q, and pitch detune.
                    </li>
                    <li>
                      <span className="text-slate-900 dark:text-slate-200 font-medium">Exact Numeric Entry:</span> Click any numeric readout box to type an exact value, press <span className="font-mono text-slate-900 dark:text-slate-200">Enter</span> to commit, or <span className="font-mono text-slate-900 dark:text-slate-200">Esc</span> to revert.
                    </li>
                    <li>
                      <span className="text-slate-900 dark:text-slate-200 font-medium">- / + Steppers &amp; Arrow Keys:</span> Step cleanly by fixed increments when calibrating resonant frequencies.
                    </li>
                    <li>
                      <span className="text-slate-900 dark:text-slate-200 font-medium">Quick Bowed Recipes:</span> Inside the Mod Matrix tab, use the three one-click recipe buttons to wire <span className="text-slate-900 dark:text-slate-200">LFO → Cutoff &amp; Amp</span>, <span className="text-slate-900 dark:text-slate-200">Velocity → Bow Bite &amp; Rosin</span>, or <span className="text-slate-900 dark:text-slate-200">Mod Wheel × LFO → Vibrato</span> onto your current patch.
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            {/* SECTION 05: SCOPES, MIDI & EXPORT */}
            <section id="guide-analysis-export" className="scroll-mt-16 space-y-5">
              <div className="space-y-1">
                <span className="text-xs font-mono text-cyan-700 dark:text-cyan-400">05 · ANALYSIS, PLAYABILITY &amp; EMBEDDING</span>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  Reading Signal Scopes, MIDI Control &amp; Standalone Export
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                {/* Signal Scopes */}
                <div className="bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2.5">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Signal Scopes &amp; FFT×Time Tracker
                  </h3>
                  <ul className="space-y-2 text-slate-600 dark:text-slate-400 leading-relaxed">
                    <li>
                      <span className="text-amber-800 dark:text-amber-300 font-medium">Wave / Split / Overlay:</span> Zero-crossing locked time-domain waveform plus live log-frequency FFT spectrum with peak-hold ticks.
                    </li>
                    <li>
                      <span className="text-cyan-800 dark:text-cyan-300 font-medium">FFT×Time Waterfall:</span> Tracks frequency over time (<span className="font-mono">4s / 8s / 16s</span>). Moving bright lines show harmonic pitch &amp; vibrato; horizontal glowing bands across notes reveal fixed soundbox formants!
                    </li>
                    <li>
                      <span className="text-slate-900 dark:text-slate-200 font-medium">Pitch Track &amp; Crosshair Probe:</span> Toggle <span className="font-mono">Pitch</span> to trace detected fundamental note frequency, or click <span className="font-mono">Freeze</span> and hover the spectrogram to inspect exact note name, Hz, time offset, and dB.
                    </li>
                  </ul>
                </div>

                {/* MIDI & Performance */}
                <div className="bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2.5">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Playable Keys &amp; Web MIDI
                  </h3>
                  <ul className="space-y-2 text-slate-600 dark:text-slate-400 leading-relaxed">
                    <li>
                      <span className="text-slate-900 dark:text-slate-200 font-medium">QWERTY Layout:</span> Lower octave keys{' '}
                      <span className="font-mono text-amber-800 dark:text-amber-300">Z–M</span> (white) / <span className="font-mono">S,D,G,H,J</span> (black); upper octave{' '}
                      <span className="font-mono text-amber-800 dark:text-amber-300">Q–I</span> / <span className="font-mono">2,3,5,6,7</span>. Clicking lower down a piano key strikes harder velocity.
                    </li>
                    <li>
                      <span className="text-slate-900 dark:text-slate-200 font-medium">Hardware MIDI CCs:</span> Supports Note On/Off velocity, 14-bit Pitch Bend (±2 st),{' '}
                      <span className="font-mono text-cyan-800 dark:text-cyan-300">CC1</span> Mod Wheel, <span className="font-mono text-cyan-800 dark:text-cyan-300">CC7</span> Master Vol,{' '}
                      <span className="font-mono text-cyan-800 dark:text-cyan-300">CC64</span> Sustain, <span className="font-mono text-cyan-800 dark:text-cyan-300">CC74</span> Filter Cutoff, and Program Change (<span className="font-mono">0xC0</span>) to switch GM patches #1–128.
                    </li>
                    <li>
                      <span className="text-slate-900 dark:text-slate-200 font-medium">Tune Sequencer:</span> Pick any built-in world folk or classical melody in the Transport bar or Presets drawer to audition instruments hands-free.
                    </li>
                  </ul>
                </div>

                {/* Saving & Embedding */}
                <div className="bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2.5">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Patches, JSON &amp; Standalone Engine
                  </h3>
                  <ul className="space-y-2 text-slate-600 dark:text-slate-400 leading-relaxed">
                    <li>
                      <span className="text-slate-900 dark:text-slate-200 font-medium">Browser Library:</span> Save custom creations in the left Presets drawer (<span className="text-slate-900 dark:text-slate-200">Save Patch</span>); they persist locally in browser storage.
                    </li>
                    <li>
                      <span className="text-slate-900 dark:text-slate-200 font-medium">Portable JSON:</span> Export or import validated patch blueprints via <span className="font-mono">Export JSON</span> or inside <span className="font-mono">Embed &amp; API</span>.
                    </li>
                    <li>
                      <span className="text-slate-900 dark:text-slate-200 font-medium">Embeddable .mjs Synth:</span> Download <span className="font-mono text-cyan-800 dark:text-cyan-300">timbre-lab-engine.mjs</span> (zero dependencies) from <span className="font-mono">Embed &amp; API</span> to play your exported JSON patches from raw MIDI bytes inside external web apps or games.
                    </li>
                  </ul>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
};
