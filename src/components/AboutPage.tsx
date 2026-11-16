import React from 'react';
import { ArrowLeft, BookOpen, Sliders, Library } from 'lucide-react';

interface AboutPageProps {
  totalPresetsCount: number;
  ethnicPresetsCount: number;
  gmPresetsCount: number;
  onBackToPatchbay: () => void;
  onOpenModMatrix: () => void;
  onOpenPresets: () => void;
  onOpenGuide?: () => void;
}

const CAPABILITIES: { index: string; title: string; detail: string }[] = [
  {
    index: '01.',
    title: 'Physical Modeling & Bowed String DSP',
    detail:
      'Custom AudioWorklet Karplus-Strong waveguide resonator simulating Helmholtz stick-slip bow friction, rosin grit, adjustable bow position near the bridge or fingerboard, and sympathetic bridge buzz.',
  },
  {
    index: '02.',
    title: 'Modular Patchbay & Acoustic Sculpting',
    detail:
      'Visual node-graph routing across Oscillators (with custom Fourier PeriodicWaves), 2-Operator FM with FM-from-Noise turbulence, Comb Filters for woody body resonance, 4-Band Parametric EQ, multi-mode Biquad Filters, Waveshapers, ADSR Envelopes, LFOs, Delay, and Convolver Reverb.',
  },
  {
    index: '03.',
    title: 'Modulation Matrix & CV Cabling',
    detail:
      'Combine direct patchbay CV cables with an interactive Modulation Matrix featuring Linear, Exponential, and S-Curve shaping, secondary Via multipliers (such as Mod Wheel or Velocity), and per-voice macro sources.',
  },
  {
    index: '04.',
    title: 'Signal Scopes & FFT×Time Spectrogram',
    detail:
      '4096-point AnalyserNode telemetry displaying a zero-crossing oscilloscope, live FFT spectrum, and a scrolling log-frequency FFT×Time waterfall tracker with fundamental pitch tracking, spectral centroid readout, freeze inspection, and a live crosshair probe.',
  },
  {
    index: '05.',
    title: 'Web MIDI & Built-In Tune Sequencer',
    detail:
      'Connect hardware or virtual MIDI controllers with velocity, 14-bit Pitch Bend, Mod Wheel (CC1), Sustain (CC64), Filter Cutoff (CC74), and General MIDI Program Change support—or play directly with QWERTY keys, touch piano, and built-in audition melodies.',
  },
  {
    index: '06.',
    title: 'Portable JSON Patches & Standalone Engine',
    detail:
      'Save custom patches in browser storage, export portable JSON instrument definitions, and generate a zero-dependency standalone ESM JavaScript synthesizer engine ready to embed into external web applications or games.',
  },
];

export const AboutPage: React.FC<AboutPageProps> = ({
  totalPresetsCount,
  ethnicPresetsCount,
  gmPresetsCount,
  onBackToPatchbay,
  onOpenModMatrix,
  onOpenPresets,
  onOpenGuide,
}) => {
  return (
    <main className="flex-1 h-full overflow-y-auto bg-[#F4F6FA] dark:bg-[#07090E] text-slate-900 dark:text-slate-100">
      <div className="max-w-4xl mx-auto px-6 py-8 lg:px-10 lg:py-12 space-y-10">
        {/* Hero / Overview */}
        <section className="space-y-5 pb-8 border-b border-slate-200 dark:border-slate-800/90">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400">
            <span>About</span>
            <span aria-hidden="true">·</span>
            <span>WebAudio Synthesis Workstation</span>
          </div>

          <h1 className="text-3xl lg:text-4xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 text-balance max-w-2xl">
            Timbre Lab
          </h1>

          <p className="text-base text-slate-700 dark:text-slate-300 leading-relaxed max-w-[68ch]">
            Timbre Lab is a browser-based modular synthesizer and acoustic instrument modeling
            studio. It pairs visual patchbay wiring and custom physical-modeling DSP with real-time
            waveform and FFT×Time spectrographic analysis so you can sculpt expressive bowed strings,
            world folk instruments, and General MIDI timbres directly in the browser.
          </p>

          <div className="flex items-center gap-3 pt-2 flex-wrap">
            <button
              type="button"
              onClick={onBackToPatchbay}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Return to Patchbay</span>
            </button>

            <button
              type="button"
              onClick={onOpenModMatrix}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#111622] border border-slate-300 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700 hover:text-slate-900 dark:hover:text-white rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Sliders className="w-3.5 h-3.5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
              <span>Open Mod Matrix</span>
            </button>

            <button
              type="button"
              onClick={onOpenPresets}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#111622] border border-slate-300 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700 hover:text-slate-900 dark:hover:text-white rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Library className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" aria-hidden="true" />
              <span>Browse {totalPresetsCount} Presets</span>
            </button>

            {onOpenGuide && (
              <button
                type="button"
                onClick={onOpenGuide}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#111622] border border-slate-300 dark:border-slate-800 hover:border-cyan-500/50 hover:text-slate-900 dark:hover:text-white rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <BookOpen className="w-3.5 h-3.5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
                <span>Learner&apos;s Guide</span>
              </button>
            )}
          </div>
        </section>

        {/* Creator Attribution & Technical Specifications */}
        <section className="space-y-4 pb-8 border-b border-slate-200 dark:border-slate-800/90">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 tracking-wide">
            Creator &amp; Studio Profile
          </h2>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 pt-1">
            <div className="border-t border-slate-200 dark:border-slate-800/80 pt-3">
              <dt className="text-xs text-slate-500 dark:text-slate-400">Created By</dt>
              <dd className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                Gek Siong Low
              </dd>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-800/80 pt-3">
              <dt className="text-xs text-slate-500 dark:text-slate-400">Built-In Instrument Library</dt>
              <dd className="mt-1 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {totalPresetsCount} presets ({ethnicPresetsCount} World Ethnic · {gmPresetsCount} General MIDI)
              </dd>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-800/80 pt-3">
              <dt className="text-xs text-slate-500 dark:text-slate-400">Audio Engine Architecture</dt>
              <dd className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                Web Audio API · AudioWorklet Physical String &amp; Safety Limiter · 4096-Bin FFT
              </dd>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-800/80 pt-3">
              <dt className="text-xs text-slate-500 dark:text-slate-400">MIDI &amp; Export Support</dt>
              <dd className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                Web MIDI API · Portable JSON Patch Schema · Standalone ESM Synth Exporter
              </dd>
            </div>
          </dl>
        </section>

        {/* Core Capabilities */}
        <section className="space-y-6 pb-8">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 tracking-wide">
              Core Capabilities
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Every module in the studio includes plain-English acoustic notes and bowed-string tips inside the Inspector.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
            {CAPABILITIES.map((cap) => (
              <article key={cap.index} className="space-y-2 border-t border-slate-200 dark:border-slate-800/80 pt-4">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-baseline gap-2">
                  <span className="font-mono text-xs text-cyan-700 dark:text-cyan-400 tabular-nums shrink-0">
                    {cap.index}
                  </span>
                  <span>{cap.title}</span>
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {cap.detail}
                </p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
};
