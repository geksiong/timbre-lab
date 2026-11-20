import React, { useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

interface PrecisionSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  fineStep?: number;
  integer?: boolean;
  scale?: 'linear' | 'log';
  unit?: string;
  label?: string;
  accent?: 'amber' | 'cyan';
  compact?: boolean;
  showSteppers?: boolean;
  defaultValue?: number;
  onChange: (value: number) => void;
  onDragStart?: () => void;
  onCommit?: () => void;
  onRelease?: () => void;
  className?: string;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function countDecimals(num: number): number {
  if (!Number.isFinite(num)) return 0;
  const str = num.toString();
  if (str.includes('e-')) {
    const parts = str.split('e-');
    return parseInt(parts[1], 10) || 0;
  }
  const dot = str.indexOf('.');
  return dot === -1 ? 0 : str.length - dot - 1;
}

function roundToStep(val: number, step: number): number {
  const decimals = Math.min(5, Math.max(0, countDecimals(step)));
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

function formatDisplayValue(val: number, step: number, integer?: boolean): string {
  if (integer) return String(Math.round(val));
  const stepDecimals = countDecimals(step);
  const valDecimals = countDecimals(val);
  const decimals = Math.min(4, Math.max(stepDecimals, valDecimals));
  return val.toFixed(decimals);
}

export const PrecisionSlider: React.FC<PrecisionSliderProps> = ({
  value,
  min,
  max,
  step = 0.01,
  fineStep,
  integer = false,
  scale = 'linear',
  unit,
  label,
  accent = 'amber',
  compact = false,
  showSteppers = !compact,
  defaultValue,
  onChange,
  onDragStart,
  onCommit,
  onRelease,
  className = '',
}) => {
  const effectiveFineStep = integer
    ? 1
    : fineStep ?? Math.max(0.0005, Number((step / 10).toPrecision(2)));

  const [fineMode, setFineMode] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(() => formatDisplayValue(value, step, integer));

  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startNorm: number;
    wasFine: boolean;
  } | null>(null);

  useEffect(() => {
    if (!isEditing) {
      setDraft(formatDisplayValue(value, step, integer));
    }
  }, [value, step, integer, isEditing]);

  const isLog = scale === 'log' && min > 0 && max > min;

  const valueToNorm = (v: number): number => {
    const c = clamp(v, min, max);
    if (isLog) {
      return (Math.log(c) - Math.log(min)) / (Math.log(max) - Math.log(min));
    }
    return max === min ? 0 : (c - min) / (max - min);
  };

  const normToValue = (norm: number): number => {
    const n = clamp(norm, 0, 1);
    if (isLog) {
      return min * Math.pow(max / min, n);
    }
    return min + n * (max - min);
  };

  const quantize = (raw: number, useFine: boolean): number => {
    const clamped = clamp(raw, min, max);
    if (integer) return clamp(Math.round(clamped), min, max);
    const activeStep = useFine ? effectiveFineStep : step;
    const stepped = Math.round((clamped - min) / activeStep) * activeStep + min;
    return clamp(roundToStep(stepped, activeStep), min, max);
  };

  const norm = valueToNorm(value);
  const pct = norm * 100;

  const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const track = trackRef.current;
    if (!track) return;
    onDragStart?.();
    track.setPointerCapture(e.pointerId);
    track.focus();

    const rect = track.getBoundingClientRect();
    const useFine = e.shiftKey || fineMode;

    if (useFine) {
      dragRef.current = {
        active: true,
        startX: e.clientX,
        startNorm: valueToNorm(value),
        wasFine: true,
      };
    } else {
      const clickNorm = clamp((e.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
      const nextVal = quantize(normToValue(clickNorm), false);
      onChange(nextVal);
      dragRef.current = {
        active: true,
        startX: e.clientX,
        startNorm: clickNorm,
        wasFine: false,
      };
    }
  };

  const handleTrackDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (defaultValue === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    onDragStart?.();
    const clampedDefault = clamp(defaultValue, min, max);
    onChange(integer ? Math.round(clampedDefault) : clampedDefault);
    onCommit?.();
  };

  const handleTrackPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const track = trackRef.current;
    if (!drag || !drag.active || !track) return;

    const rect = track.getBoundingClientRect();
    const useFine = e.shiftKey || fineMode;

    // Re-anchor smoothly if user toggles Shift mid-drag
    if (useFine !== drag.wasFine) {
      drag.startX = e.clientX;
      drag.startNorm = valueToNorm(value);
      drag.wasFine = useFine;
    }

    const sensitivity = useFine ? 0.1 : 1;
    const deltaNorm = ((e.clientX - drag.startX) / Math.max(1, rect.width)) * sensitivity;
    const nextNorm = clamp(drag.startNorm + deltaNorm, 0, 1);
    const nextVal = quantize(normToValue(nextNorm), useFine);
    onChange(nextVal);
  };

  const handleTrackPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.active) {
      dragRef.current = null;
      if (trackRef.current?.hasPointerCapture(e.pointerId)) {
        trackRef.current.releasePointerCapture(e.pointerId);
      }
      onCommit?.();
      onRelease?.();
    }
  };

  const nudge = (direction: 1 | -1, useFine: boolean) => {
    onDragStart?.();
    const delta = useFine ? effectiveFineStep : step;
    const next = clamp(roundToStep(value + direction * delta, delta), min, max);
    onChange(integer ? Math.round(next) : next);
    onCommit?.();
  };

  const handleTrackKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const useFine = e.shiftKey || fineMode;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      nudge(1, useFine);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      nudge(-1, useFine);
    } else if (e.key === 'Home') {
      e.preventDefault();
      onDragStart?.();
      onChange(min);
      onCommit?.();
    } else if (e.key === 'End') {
      e.preventDefault();
      onDragStart?.();
      onChange(max);
      onCommit?.();
    }
  };

  const commitDraft = (rawText: string) => {
    const parsed = parseFloat(rawText.trim());
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
      const clamped = clamp(parsed, min, max);
      const finalVal = integer ? Math.round(clamped) : roundToStep(clamped, Math.min(effectiveFineStep, 0.0001));
      onChange(finalVal);
      setDraft(formatDisplayValue(finalVal, step, integer));
      onCommit?.();
    } else {
      setDraft(formatDisplayValue(value, step, integer));
    }
  };

  const fillClass = accent === 'cyan' ? 'bg-cyan-600 dark:bg-cyan-500' : 'bg-amber-600 dark:bg-amber-500';
  const thumbBorderClass =
    accent === 'cyan'
      ? 'border-cyan-700 dark:border-cyan-300 bg-cyan-600 dark:bg-cyan-400'
      : 'border-amber-700 dark:border-amber-300 bg-amber-500 dark:bg-amber-400';
  const fineActiveClass =
    accent === 'cyan'
      ? 'bg-cyan-500/15 border-cyan-600/50 dark:border-cyan-500/60 text-cyan-700 dark:text-cyan-300'
      : 'bg-amber-500/15 border-amber-600/50 dark:border-amber-500/60 text-amber-800 dark:text-amber-300';

  if (compact) {
    return (
      <div className={`flex items-center gap-1.5 min-w-0 ${className}`}>
        {label && (
          <span className="text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap shrink-0">
            {label}
          </span>
        )}
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label={label || 'Value'}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          onPointerDown={handleTrackPointerDown}
          onPointerMove={handleTrackPointerMove}
          onPointerUp={handleTrackPointerUp}
          onPointerCancel={handleTrackPointerUp}
          onDoubleClick={handleTrackDoubleClick}
          onKeyDown={handleTrackKeyDown}
          title={
            defaultValue !== undefined
              ? 'Drag to adjust · Shift for 10x fine · Double-click to reset'
              : 'Drag to adjust · Hold Shift for 10x fine control'
          }
          className="relative flex-1 min-w-[44px] h-7 flex items-center cursor-ew-resize touch-none select-none focus:outline-none group"
        >
          <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              className={`h-full ${fillClass} opacity-85`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div
            style={{ left: `calc(${pct}% - 6px)` }}
            className={`absolute w-3 h-3.5 rounded-xs border border-white dark:border-[#07090E] shadow ${thumbBorderClass} group-focus-visible:ring-2 group-focus-visible:ring-cyan-500`}
          />
        </div>

        <div className="flex items-center shrink-0">
          <input
            type="text"
            inputMode="decimal"
            value={draft}
            aria-label={`${label || 'Parameter'} numeric value`}
            onFocus={(e) => {
              onDragStart?.();
              setIsEditing(true);
              e.target.select();
            }}
            onChange={(e) => {
              setDraft(e.target.value);
              const parsed = parseFloat(e.target.value);
              if (!Number.isNaN(parsed) && Number.isFinite(parsed) && !e.target.value.endsWith('.')) {
                const clamped = clamp(parsed, min, max);
                onChange(integer ? Math.round(clamped) : clamped);
              }
            }}
            onBlur={() => {
              setIsEditing(false);
              commitDraft(draft);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitDraft(draft);
                setIsEditing(false);
                e.currentTarget.blur();
              } else if (e.key === 'Escape') {
                setIsEditing(false);
                setDraft(formatDisplayValue(value, step, integer));
                e.currentTarget.blur();
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                nudge(1, e.shiftKey || fineMode);
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                nudge(-1, e.shiftKey || fineMode);
              }
            }}
            className="w-12 h-7 px-1 text-right text-[11px] font-mono tabular-nums bg-slate-50 dark:bg-[#07090E] border border-slate-300 dark:border-slate-700/90 focus:border-amber-500 rounded text-slate-900 dark:text-slate-100 focus:outline-none"
          />
          {unit && (
            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 ml-1 whitespace-nowrap">
              {unit}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-1.5 ${className}`}>
      {/* Row 1: Full-width readable parameter label + Fine toggle */}
      <div className="flex items-start justify-between gap-2">
        {label ? (
          <span className="text-xs font-medium text-slate-800 dark:text-slate-200 leading-snug">
            {label}
          </span>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => setFineMode((v) => !v)}
          title="Toggle 10x fine resolution drag & step mode (or hold Shift)"
          className={`px-1.5 py-0.5 text-[10px] font-mono rounded border transition-colors whitespace-nowrap shrink-0 ${
            fineMode
              ? fineActiveClass
              : 'bg-slate-100 dark:bg-[#0B0F17] border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
          }`}
        >
          Fine
        </button>
      </div>

      {/* Row 2: Precision Track + Steppers + Numeric Input */}
      <div className="flex items-center gap-2">
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label={label || 'Parameter slider'}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          onPointerDown={handleTrackPointerDown}
          onPointerMove={handleTrackPointerMove}
          onPointerUp={handleTrackPointerUp}
          onPointerCancel={handleTrackPointerUp}
          onDoubleClick={handleTrackDoubleClick}
          onKeyDown={handleTrackKeyDown}
          title={
            defaultValue !== undefined
              ? 'Drag to adjust · Shift or Fine for 10x · Double-click to reset'
              : 'Drag to adjust · Hold Shift or toggle Fine for 10x resolution · Use arrow keys to step'
          }
          className="relative flex-1 min-w-[90px] h-7 flex items-center cursor-ew-resize touch-none select-none focus:outline-none group"
        >
          <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-[#07090E] border border-slate-300 dark:border-slate-800 overflow-hidden relative">
            <div
              className={`h-full ${fillClass} ${fineMode ? 'opacity-100' : 'opacity-90'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div
            style={{ left: `calc(${pct}% - 7px)` }}
            className={`absolute w-3.5 h-4 rounded-xs border border-white dark:border-[#07090E] shadow-sm transition-transform duration-75 ${thumbBorderClass} ${
              fineMode ? 'ring-2 ring-slate-900/20 dark:ring-white/25' : ''
            } group-hover:scale-110 group-focus-visible:ring-2 group-focus-visible:ring-cyan-500`}
          />
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {showSteppers && (
            <button
              type="button"
              onClick={() => nudge(-1, fineMode)}
              title={`Decrease (${fineMode ? effectiveFineStep : step})`}
              className="w-7 h-7 rounded bg-slate-100 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600 text-slate-700 dark:text-slate-300 flex items-center justify-center active:scale-95"
            >
              <Minus className="w-3 h-3" />
            </button>
          )}

          <div className="relative flex items-center">
            <input
              type="text"
              inputMode="decimal"
              value={draft}
              aria-label={`${label || 'Parameter'} numeric value`}
              onFocus={(e) => {
                onDragStart?.();
                setIsEditing(true);
                e.target.select();
              }}
              onChange={(e) => {
                setDraft(e.target.value);
                const parsed = parseFloat(e.target.value);
                if (!Number.isNaN(parsed) && Number.isFinite(parsed) && !e.target.value.endsWith('.')) {
                  const clamped = clamp(parsed, min, max);
                  onChange(integer ? Math.round(clamped) : clamped);
                }
              }}
              onBlur={() => {
                setIsEditing(false);
                commitDraft(draft);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commitDraft(draft);
                  setIsEditing(false);
                  e.currentTarget.blur();
                } else if (e.key === 'Escape') {
                  setIsEditing(false);
                  setDraft(formatDisplayValue(value, step, integer));
                  e.currentTarget.blur();
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  nudge(1, e.shiftKey || fineMode);
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  nudge(-1, e.shiftKey || fineMode);
                }
              }}
              className="w-[64px] h-7 px-1.5 text-right text-xs font-mono tabular-nums bg-slate-50 dark:bg-[#07090E] border border-slate-300 dark:border-slate-700 focus:border-amber-500 rounded text-slate-900 dark:text-slate-100 focus:outline-none"
            />
            {unit && (
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 ml-1 min-w-[20px] whitespace-nowrap">
                {unit}
              </span>
            )}
          </div>

          {showSteppers && (
            <button
              type="button"
              onClick={() => nudge(1, fineMode)}
              title={`Increase (${fineMode ? effectiveFineStep : step})`}
              className="w-7 h-7 rounded bg-slate-100 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600 text-slate-700 dark:text-slate-300 flex items-center justify-center active:scale-95"
            >
              <Plus className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
