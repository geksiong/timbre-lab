import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Gauge, Lock, Unlock, Pin, VolumeX, X } from 'lucide-react';
import { MUSICAL_SCALES } from '../engine/modulationSummary';
import { SynthEngine } from '../engine/SynthEngine';
import { LatencyMetrics } from '../engine/types';
import { PrecisionSlider } from './PrecisionSlider';

interface PlayableKeyboardProps {
  engine: SynthEngine;
  activeNotes: number[];
  compactDock?: boolean;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const QWERTY_MAP: Record<string, number> = {
  z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11,
  q: 12, '2': 13, w: 14, '3': 15, e: 16, r: 17, '5': 18, t: 19, '6': 20, y: 21, '7': 22, u: 23, i: 24,
};

const KEYBOARD_LABELS: Record<number, string> = {
  0: 'Z', 1: 'S', 2: 'X', 3: 'D', 4: 'C', 5: 'V', 6: 'G', 7: 'B', 8: 'H', 9: 'N', 10: 'J', 11: 'M',
  12: 'Q', 13: '2', 14: 'W', 15: '3', 16: 'E', 17: 'R', 18: '5', 19: 'T', 20: '6', 21: 'Y', 22: '7', 23: 'U', 24: 'I',
};

export const PlayableKeyboard: React.FC<PlayableKeyboardProps> = ({
  engine,
  activeNotes,
  compactDock = false,
}) => {
  const [baseOctave, setBaseOctave] = useState(3); // C3 = MIDI 48
  const [sustain, setSustain] = useState(false);
  const [latchEnabled, setLatchEnabled] = useState(false);
  const [latchedNotes, setLatchedNotes] = useState<number[]>([]);
  const [velocity, setVelocity] = useState(104);
  const [pitchBend, setPitchBend] = useState(0);
  const [modWheel, setModWheel] = useState(0.15);
  const [latency, setLatency] = useState<LatencyMetrics>(() => engine.getLatencyMetrics());
  const [latencyOpen, setLatencyOpen] = useState(false);
  const [scaleId, setScaleId] = useState<string>('chromatic');
  const [scaleLock, setScaleLock] = useState(false);

  const activeScale = useMemo(
    () => MUSICAL_SCALES.find((s) => s.id === scaleId) ?? MUSICAL_SCALES[0],
    [scaleId]
  );
  const isNoteInScale = (midi: number) =>
    scaleId === 'chromatic' || activeScale.intervals.includes(((midi % 12) + 12) % 12);

  useEffect(() => {
    engine.setModWheel(0.15);
    const st = engine.getLatchState();
    setLatchEnabled(st.enabled);
    setLatchedNotes(st.latchedNotes);
    const unsubLatch = engine.onLatchChange((enabled, notes) => {
      setLatchEnabled(enabled);
      setLatchedNotes(notes);
    });
    const unsubLatency = engine.onLatencyChange(setLatency);
    return () => {
      unsubLatch();
      unsubLatency();
    };
  }, [engine]);

  const activePointersRef = useRef<Map<number, number>>(new Map());
  const heldQwertyRef = useRef<Map<string, number>>(new Map());

  const startMidi = (baseOctave + 1) * 12; // C3 = 48
  const numKeys = 25; // 2 full octaves + top C

  const whiteKeys: { midi: number; offsetIdx: number; label: string; qwerty?: string }[] = [];
  const blackKeys: { midi: number; leftPercent: number; qwerty?: string }[] = [];

  const allNotes = Array.from({ length: numKeys }, (_, i) => startMidi + i);
  const totalWhiteKeys = allNotes.filter((m) => ![1, 3, 6, 8, 10].includes(m % 12)).length;

  let whiteIdx = 0;
  allNotes.forEach((midi, i) => {
    const semi = midi % 12;
    const isBlack = [1, 3, 6, 8, 10].includes(semi);
    const octNum = Math.floor(midi / 12) - 1;
    const qwerty = KEYBOARD_LABELS[i];
    if (!isBlack) {
      whiteKeys.push({
        midi,
        offsetIdx: whiteIdx,
        label: semi === 0 ? `C${octNum}` : NOTE_NAMES[semi],
        qwerty,
      });
      whiteIdx++;
    } else {
      const leftPercent = ((whiteIdx - 0.34) / totalWhiteKeys) * 100;
      blackKeys.push({ midi, leftPercent, qwerty });
    }
  });

  // Computer QWERTY keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key in QWERTY_MAP) {
        const midi = startMidi + QWERTY_MAP[key];
        if (scaleLock && !activeScale.intervals.includes(((midi % 12) + 12) % 12)) {
          return;
        }
        heldQwertyRef.current.set(key, midi);
        void engine.noteOn(midi, velocity, e.timeStamp, 'keyboard');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const midi = heldQwertyRef.current.get(key);
      if (midi !== undefined) {
        heldQwertyRef.current.delete(key);
        engine.noteOff(midi);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [engine, startMidi, velocity, scaleLock, activeScale]);

  const handleKeyPointerDown = (e: React.PointerEvent<HTMLButtonElement>, midi: number) => {
    e.stopPropagation();
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (scaleLock && !isNoteInScale(midi)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relY = Math.max(0.25, Math.min(1, (e.clientY - rect.top) / rect.height));
    const dynVel = Math.round(velocity * (0.65 + relY * 0.35));
    activePointersRef.current.set(e.pointerId, midi);
    void engine.noteOn(midi, Math.min(127, dynVel), e.timeStamp, 'keyboard');
  };

  const handleKeyPointerEnter = (e: React.PointerEvent<HTMLButtonElement>, midi: number) => {
    if (e.buttons === 0 && !activePointersRef.current.has(e.pointerId)) return;
    if (scaleLock && !isNoteInScale(midi)) return;
    const prevMidi = activePointersRef.current.get(e.pointerId);
    if (prevMidi !== undefined && prevMidi !== midi) {
      engine.noteOff(prevMidi);
      activePointersRef.current.set(e.pointerId, midi);
      void engine.noteOn(midi, velocity, e.timeStamp, 'keyboard');
    }
  };

  const handleKeyPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const midi = activePointersRef.current.get(e.pointerId);
    if (midi !== undefined) {
      activePointersRef.current.delete(e.pointerId);
      engine.noteOff(midi);
    }
  };

  useEffect(() => {
    const clearPointer = (e: PointerEvent) => {
      const midi = activePointersRef.current.get(e.pointerId);
      if (midi !== undefined) {
        activePointersRef.current.delete(e.pointerId);
        engine.noteOff(midi);
      }
    };
    const clearAllHeldNotes = () => {
      for (const midi of activePointersRef.current.values()) {
        engine.noteOff(midi);
      }
      activePointersRef.current.clear();
      for (const midi of heldQwertyRef.current.values()) {
        engine.noteOff(midi);
      }
      heldQwertyRef.current.clear();
    };
    window.addEventListener('pointerup', clearPointer);
    window.addEventListener('pointercancel', clearPointer);
    window.addEventListener('blur', clearAllHeldNotes);
    return () => {
      window.removeEventListener('pointerup', clearPointer);
      window.removeEventListener('pointercancel', clearPointer);
      window.removeEventListener('blur', clearAllHeldNotes);
    };
  }, [engine]);

  return (
    <div className="bg-slate-100 dark:bg-[#0B0F17] border-t border-slate-200 dark:border-slate-800 flex flex-col">
      {/* Compact Performance Controls */}
      <div className="px-3 py-1.5 bg-white dark:bg-[#111622] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-x-3 gap-y-1.5 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <div className="flex items-center bg-slate-50 dark:bg-[#07090E] border border-slate-300 dark:border-slate-800 rounded overflow-hidden">
            <button
              type="button"
              onClick={() => setBaseOctave((o) => Math.max(1, o - 1))}
              className="h-8 w-8 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800"
              title="Octave Down"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 text-[11px] font-mono text-slate-800 dark:text-slate-200 whitespace-nowrap">
              Oct C{baseOctave}–C{baseOctave + 2}
            </span>
            <button
              type="button"
              onClick={() => setBaseOctave((o) => Math.min(5, o + 1))}
              className="h-8 w-8 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800"
              title="Octave Up"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              const next = !sustain;
              setSustain(next);
              engine.setSustain(next);
            }}
            className={`inline-flex items-center gap-1.5 h-8 px-2.5 text-[11px] font-medium rounded border transition-colors whitespace-nowrap ${
              sustain
                ? 'bg-cyan-500/15 border-cyan-600/50 dark:border-cyan-500/50 text-cyan-800 dark:text-cyan-300'
                : 'bg-slate-50 dark:bg-[#07090E] border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {sustain ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            <span>Sustain</span>
          </button>

          <div className="flex items-center">
            <button
              type="button"
              onClick={() => {
                const next = !latchEnabled;
                setLatchEnabled(next);
                engine.setLatchEnabled(next);
              }}
              title="Hold Latch: tap keys to drone chords hands-free; tap again to unlatch"
              className={`inline-flex items-center gap-1.5 h-8 px-2.5 text-[11px] font-medium border transition-colors whitespace-nowrap ${
                latchedNotes.length > 0 ? 'rounded-l' : 'rounded'
              } ${
                latchEnabled
                  ? 'bg-amber-500/15 border-amber-600/50 dark:border-amber-500/50 text-amber-800 dark:text-amber-300'
                  : 'bg-slate-50 dark:bg-[#07090E] border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Pin className="w-3 h-3" />
              <span>Hold Latch</span>
              {latchedNotes.length > 0 && (
                <span className="font-mono tabular-nums text-[10px] text-amber-900 dark:text-amber-200">
                  · {latchedNotes.length}
                </span>
              )}
            </button>
            {latchedNotes.length > 0 && (
              <button
                type="button"
                onClick={() => engine.allNotesOff()}
                title="Clear all latched drone notes"
                aria-label="Clear latched notes"
                className="h-8 px-1.5 rounded-r border-y border-r border-amber-600/50 dark:border-amber-500/50 bg-amber-500/20 text-amber-900 dark:text-amber-200 hover:bg-rose-500/20 hover:text-rose-700 dark:hover:text-rose-300 flex items-center justify-center transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Musical Scale Guide & Lock */}
          <div className="flex items-center">
            <select
              value={scaleId}
              onChange={(e) => {
                const nextScale = e.target.value;
                setScaleId(nextScale);
                if (nextScale === 'chromatic') setScaleLock(false);
              }}
              aria-label="Keyboard Scale Guide"
              title="Highlight musical scale notes on the keyboard"
              className={`h-8 px-2 text-[11px] bg-slate-50 dark:bg-[#07090E] border border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-cyan-500 ${
                scaleId !== 'chromatic' ? 'rounded-l' : 'rounded'
              }`}
            >
              {MUSICAL_SCALES.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  Scale: {sc.label}
                </option>
              ))}
            </select>
            {scaleId !== 'chromatic' && (
              <button
                type="button"
                onClick={() => setScaleLock((v) => !v)}
                title={scaleLock ? 'Scale Lock ON: out-of-scale keys muted' : 'Scale Lock OFF: visual guide only'}
                className={`h-8 px-2 text-[11px] font-medium rounded-r border-y border-r transition-colors whitespace-nowrap ${
                  scaleLock
                    ? 'bg-cyan-500/15 border-cyan-600/50 dark:border-cyan-500/50 text-cyan-800 dark:text-cyan-300'
                    : 'bg-slate-50 dark:bg-[#07090E] border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {scaleLock ? 'Locked' : 'Guide'}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => engine.allNotesOff()}
            title="Stop all sounding notes"
            className="inline-flex items-center gap-1 h-8 px-2.5 text-[11px] font-medium rounded bg-slate-50 dark:bg-[#07090E] border border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 whitespace-nowrap"
          >
            <VolumeX className="w-3 h-3" />
            <span className="hidden sm:inline">All Off</span>
          </button>

          {/* End-to-End Latency Telemetry & Breakdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                if (latency.state !== 'running') {
                  void engine.warmUp();
                }
                setLatencyOpen((v) => !v);
              }}
              title="End-to-End Audio Latency (click for pipeline breakdown)"
              className="inline-flex items-center gap-1.5 h-8 px-2.5 text-[11px] font-mono tabular-nums rounded bg-slate-50 dark:bg-[#07090E] border border-slate-300 dark:border-slate-800 hover:border-cyan-600/50 dark:hover:border-cyan-500/50 text-slate-700 dark:text-slate-300 transition-colors whitespace-nowrap"
            >
              <Gauge
                className={`w-3.5 h-3.5 ${
                  latency.state !== 'running'
                    ? 'text-slate-400 dark:text-slate-500'
                    : latency.totalMs <= 20
                      ? 'text-cyan-700 dark:text-cyan-400'
                      : 'text-amber-600 dark:text-amber-400'
                }`}
              />
              <span>
                {latency.state === 'running'
                  ? `E2E ${latency.totalMs.toFixed(1)} ms`
                  : 'E2E Standby'}
              </span>
            </button>

            {latencyOpen && (
              <div className="absolute left-0 bottom-full mb-2 z-40 w-72 bg-white dark:bg-[#111622] border border-slate-300 dark:border-slate-700 rounded-lg shadow-xl p-3 space-y-2 text-[11px]">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-1.5">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">End-to-End Latency</span>
                  <span className="font-mono tabular-nums text-cyan-700 dark:text-cyan-400">
                    {latency.state === 'running' ? `${latency.totalMs.toFixed(1)} ms` : 'Standby'}
                  </span>
                </div>

                <div className="space-y-1 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Input → DSP ({latency.lastSource})</span>
                    <span>{latency.inputToDspMs.toFixed(2)} ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Voice Build</span>
                    <span>{latency.dspBuildMs.toFixed(2)} ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Audio Base Buffer</span>
                    <span>{latency.baseLatencyMs.toFixed(1)} ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">HW Output Latency</span>
                    <span>
                      {latency.outputLatencyMs > 0
                        ? `${latency.outputLatencyMs.toFixed(1)} ms`
                        : '0.0 ms (unreported)'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Master Lookahead</span>
                    <span className="text-cyan-700 dark:text-cyan-400">{latency.lookaheadMs.toFixed(1)} ms</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Buffer Hint</span>
                    <div className="flex items-center bg-slate-100 dark:bg-[#07090E] border border-slate-200 dark:border-slate-800 rounded p-0.5 text-[10px] font-mono">
                      <button
                        type="button"
                        onClick={() => void engine.setLatencyMode('interactive')}
                        className={`px-2 py-0.5 rounded transition-colors ${
                          latency.latencyMode === 'interactive'
                            ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs dark:shadow-none'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        Interactive
                      </button>
                      <button
                        type="button"
                        onClick={() => void engine.setLatencyMode('ultralow')}
                        title="Request latencyHint: 0 minimum OS audio quantum"
                        className={`px-2 py-0.5 rounded transition-colors ${
                          latency.latencyMode === 'ultralow'
                            ? 'bg-cyan-500/20 text-cyan-800 dark:text-cyan-300'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        Ultra-Low (0)
                      </button>
                    </div>
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 flex items-center justify-between">
                    <span>
                      {(latency.sampleRate / 1000).toFixed(1)} kHz · {latency.renderQuantumSamples} smp ({latency.renderQuantumMs.toFixed(2)} ms)
                    </span>
                    <span>{latency.latencyMode === 'ultralow' ? 'min-quantum' : 'interactive'}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-4 text-[11px] flex-wrap min-w-0 max-w-full">
          <div className="hidden md:block shrink-0">
            <PrecisionSlider
              compact
              label="Pitch"
              value={pitchBend}
              min={-1}
              max={1}
              step={0.02}
              fineStep={0.002}
              onChange={(v) => {
                setPitchBend(v);
                engine.setPitchBend(v);
              }}
              onRelease={() => {
                setPitchBend(0);
                engine.setPitchBend(0);
              }}
              className="w-40"
            />
          </div>

          <div className="hidden sm:block shrink-0">
            <PrecisionSlider
              compact
              label="Mod"
              value={modWheel}
              min={0}
              max={1}
              step={0.02}
              fineStep={0.002}
              accent="cyan"
              onChange={(v) => {
                setModWheel(v);
                engine.setModWheel(v);
              }}
              className="w-40"
            />
          </div>

          <div className="shrink-0">
            <PrecisionSlider
              compact
              label="Vel"
              value={velocity}
              min={1}
              max={127}
              step={1}
              integer
              onChange={(v) => setVelocity(v)}
              className="w-36 sm:w-40"
            />
          </div>
        </div>
      </div>

      {/* Piano Keys Surface (Horizontally scrollable on narrow phones so touch keys stay >= 44px) */}
      <div className="overflow-x-auto touch-pan-x">
        <div
          className={`relative ${
            compactDock ? 'h-24 sm:h-[104px]' : 'h-28 sm:h-32'
          } min-w-[660px] w-full select-none touch-none flex`}
        >
          {whiteKeys.map((wk) => {
            const isLatched = latchedNotes.includes(wk.midi);
            const isActive = activeNotes.includes(wk.midi) || isLatched;
            const inScale = isNoteInScale(wk.midi);
            const isRoot = scaleId !== 'chromatic' && wk.midi % 12 === 0;
            const mutedByScale = scaleId !== 'chromatic' && !inScale;
            return (
              <button
                key={wk.midi}
                type="button"
                onPointerDown={(e) => handleKeyPointerDown(e, wk.midi)}
                onPointerEnter={(e) => handleKeyPointerEnter(e, wk.midi)}
                onPointerUp={handleKeyPointerUp}
                className={`relative flex-1 h-full border-r border-slate-300 dark:border-slate-800 last:border-r-0 flex flex-col justify-end items-center pb-1.5 transition-colors duration-75 ${
                  isLatched
                    ? 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-900 dark:text-cyan-200'
                    : isActive
                      ? 'bg-amber-100 dark:bg-amber-500/25 text-amber-900 dark:text-amber-200'
                      : mutedByScale
                        ? scaleLock
                          ? 'bg-slate-200/75 dark:bg-[#0E131E] text-slate-400/60 dark:text-slate-600 cursor-not-allowed'
                          : 'bg-slate-100/90 dark:bg-[#121725] text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-[#192033]'
                        : isRoot
                          ? 'bg-cyan-50/60 dark:bg-[#172234] hover:bg-cyan-50 dark:hover:bg-[#1D2B42] text-cyan-800 dark:text-cyan-300'
                          : 'bg-white dark:bg-[#171E2E] hover:bg-slate-50 dark:hover:bg-[#1E263A] text-slate-500 dark:text-slate-400'
                }`}
              >
                {scaleId !== 'chromatic' && inScale && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full mb-1 ${
                      isRoot
                        ? 'bg-cyan-600 dark:bg-cyan-400'
                        : 'bg-amber-500/60 dark:bg-amber-400/50'
                    }`}
                  />
                )}
                {wk.qwerty && (
                  <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 hidden md:block">
                    {wk.qwerty}
                  </span>
                )}
                <span className="text-[10px] font-mono font-medium mt-0.5">{wk.label}</span>
              </button>
            );
          })}

          {blackKeys.map((bk) => {
            const isLatched = latchedNotes.includes(bk.midi);
            const isActive = activeNotes.includes(bk.midi) || isLatched;
            const inScale = isNoteInScale(bk.midi);
            const mutedByScale = scaleId !== 'chromatic' && !inScale;
            const widthPercent = (0.64 / totalWhiteKeys) * 100;
            return (
              <button
                key={bk.midi}
                type="button"
                style={{ left: `${bk.leftPercent}%`, width: `${widthPercent}%` }}
                onPointerDown={(e) => handleKeyPointerDown(e, bk.midi)}
                onPointerEnter={(e) => handleKeyPointerEnter(e, bk.midi)}
                onPointerUp={handleKeyPointerUp}
                className={`absolute top-0 h-[62%] z-10 rounded-b-md border border-slate-400 dark:border-slate-900 flex flex-col justify-end items-center pb-1.5 transition-colors duration-75 ${
                  isLatched
                    ? 'bg-cyan-500 dark:bg-cyan-400 text-white dark:text-slate-950'
                    : isActive
                      ? 'bg-amber-500 text-slate-950'
                      : mutedByScale
                        ? scaleLock
                          ? 'bg-slate-400/70 dark:bg-[#0D111A] text-slate-500/50 dark:text-slate-600 cursor-not-allowed'
                          : 'bg-slate-600 dark:bg-[#0B0F17] text-slate-400 dark:text-slate-500 hover:bg-slate-500 dark:hover:bg-[#111726]'
                        : 'bg-slate-800 dark:bg-[#07090E] hover:bg-slate-700 dark:hover:bg-[#0F1522] text-slate-300 dark:text-slate-400'
                }`}
              >
                {scaleId !== 'chromatic' && inScale && (
                  <span className="w-1 h-1 rounded-full bg-amber-400 mb-0.5" />
                )}
                {bk.qwerty && (
                  <span className="text-[9px] font-mono hidden md:block">{bk.qwerty}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
