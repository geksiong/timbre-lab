import React, { useRef } from 'react';
import { RotateCcw } from 'lucide-react';

interface MacroXYPadProps {
  x: number;
  y: number;
  defaultX?: number;
  defaultY?: number;
  xLabel?: string;
  yLabel?: string;
  onChange: (x: number, y: number) => void;
  compact?: boolean;
}

export const MacroXYPad: React.FC<MacroXYPadProps> = ({
  x,
  y,
  defaultX = 0.5,
  defaultY = 0.5,
  xLabel = 'Tone / Filter',
  yLabel = 'Space / Shimmer',
  onChange,
  compact = false,
}) => {
  const padRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

  const updateFromClient = (clientX: number, clientY: number) => {
    const el = padRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = clamp01((clientX - rect.left) / rect.width);
    const ny = clamp01(1 - (clientY - rect.top) / rect.height);
    onChange(nx, ny);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromClient(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    updateFromClient(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.1 : 0.025;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      onChange(clamp01(x + step), y);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onChange(clamp01(x - step), y);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(x, clamp01(y + step));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(x, clamp01(y - step));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange(defaultX, defaultY);
    }
  };

  const pxPct = (x * 100).toFixed(2);
  const pyPct = ((1 - y) * 100).toFixed(2);

  return (
    <div
      className={`bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-md flex flex-col justify-between min-w-0 overflow-hidden ${
        compact ? 'p-2 h-full' : 'p-2.5'
      }`}
    >
      {/* Header Telemetry */}
      <div className="flex items-center justify-between gap-2 pb-1.5 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
            Macro XY
          </span>
          <span className="text-slate-400 dark:text-slate-600" aria-hidden="true">·</span>
          <span className="text-[10px] font-mono tabular-nums text-cyan-700 dark:text-cyan-400 whitespace-nowrap">
            X {(x * 100).toFixed(0)} · Y {(y * 100).toFixed(0)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onChange(defaultX, defaultY)}
          title="Reset XY pad to patch default"
          className="h-6 w-6 rounded flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      </div>

      {/* Interactive Crosshair Surface */}
      <div
        ref={padRef}
        role="slider"
        tabIndex={0}
        aria-label={`Macro XY Morph Pad: X ${xLabel}, Y ${yLabel}`}
        aria-valuetext={`X ${Math.round(x * 100)}%, Y ${Math.round(y * 100)}%`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        className={`relative w-full ${
          compact ? 'min-h-[68px] flex-1' : 'h-[120px]'
        } bg-slate-100 dark:bg-[#07090E] border border-slate-300 dark:border-slate-800 rounded cursor-crosshair select-none touch-none overflow-hidden focus:outline-none focus:border-cyan-600 dark:focus:border-cyan-500/70`}
      >
        {/* Calibrated 4x4 Hairline Grid */}
        <div className="absolute inset-0 pointer-events-none xy-pad-grid" />

        {/* Soft Telemetry Halo */}
        <div
          className="absolute w-24 h-24 -translate-x-1/2 -translate-y-1/2 pointer-events-none rounded-full"
          style={{
            left: `${pxPct}%`,
            top: `${pyPct}%`,
            background:
              'radial-gradient(circle, rgba(8,145,178,0.20) 0%, rgba(217,119,6,0.08) 50%, transparent 72%)',
          }}
        />

        {/* Crosshair Axes */}
        <div
          className="absolute top-0 bottom-0 w-px bg-cyan-600/40 dark:bg-cyan-500/35 pointer-events-none"
          style={{ left: `${pxPct}%` }}
        />
        <div
          className="absolute left-0 right-0 h-px bg-cyan-600/40 dark:bg-cyan-500/35 pointer-events-none"
          style={{ top: `${pyPct}%` }}
        />

        {/* Puck Handle */}
        <div
          className="absolute w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-600 dark:bg-cyan-400 border-2 border-white dark:border-[#07090E] shadow-[0_0_0_2px_rgba(8,145,178,0.3)] pointer-events-none"
          style={{
            left: `${pxPct}%`,
            top: `${pyPct}%`,
          }}
        />
      </div>

      {/* Axis Labels */}
      <div className="pt-1 flex items-center justify-between gap-2 text-[10px] text-slate-600 dark:text-slate-400 shrink-0">
        <span className="truncate">X: {xLabel}</span>
        <span className="truncate text-right text-cyan-700 dark:text-cyan-400/90">Y: {yLabel}</span>
      </div>
    </div>
  );
};
