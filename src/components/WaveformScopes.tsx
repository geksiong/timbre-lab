import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, Pause, Play, Trash2 } from 'lucide-react';
import { SynthEngine } from '../engine/SynthEngine';

type ScopeMode = 'split' | 'overlay' | 'osc' | 'fft' | 'fftTime';
type TimeWindowSec = 4 | 8 | 16;

interface WaveformScopesProps {
  engine: SynthEngine;
  compact?: boolean;
  theme?: 'light' | 'dark';
}

interface SpectrogramFrame {
  timeMs: number;
  bins: Uint8Array;
  fundHz: number;
  centroidHz: number;
}

const SPECTROGRAM_ROWS = 128;
const MIN_SPEC_FREQ = 45;
const MAX_SPEC_FREQ = 14000;
const MAX_HISTORY_FRAMES = 560;
const SAMPLE_INTERVAL_MS = 32;
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function freqToNoteName(hz: number): string {
  if (!Number.isFinite(hz) || hz < 20 || hz > 20000) return '--';
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

function formatFreqLabel(hz: number): string {
  if (hz >= 1000) {
    const khz = hz / 1000;
    return Number.isInteger(khz) ? `${khz}k` : `${khz.toFixed(1)}k`;
  }
  return `${Math.round(hz)}`;
}

function buildSpectrogramLut(stops: [number, [number, number, number]][]): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 4);

  for (let v = 0; v < 256; v++) {
    let s0 = stops[0];
    let s1 = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (v >= stops[i][0] && v <= stops[i + 1][0]) {
        s0 = stops[i];
        s1 = stops[i + 1];
        break;
      }
    }
    const span = Math.max(1, s1[0] - s0[0]);
    const t = (v - s0[0]) / span;
    const idx = v * 4;
    lut[idx] = Math.round(s0[1][0] + (s1[1][0] - s0[1][0]) * t);
    lut[idx + 1] = Math.round(s0[1][1] + (s1[1][1] - s0[1][1]) * t);
    lut[idx + 2] = Math.round(s0[1][2] + (s1[1][2] - s0[1][2]) * t);
    lut[idx + 3] = 255;
  }
  return lut;
}

const SPECTROGRAM_LUT_DARK = buildSpectrogramLut([
  [0, [9, 13, 21]],      // #090D15 obsidian floor
  [18, [12, 32, 56]],    // deep navy
  [82, [8, 145, 178]],   // calibrated cyan (#0891B2)
  [152, [34, 211, 238]], // bright cyan (#22D3EE)
  [206, [245, 158, 11]], // telemetry amber (#F59E0B)
  [255, [254, 243, 199]],// peak warm white (#FEF3C7)
]);

const SPECTROGRAM_LUT_LIGHT = buildSpectrogramLut([
  [0, [248, 250, 252]],  // #F8FAFC paper floor
  [18, [224, 242, 254]], // sky tint (#E0F2FE)
  [82, [56, 189, 248]],  // sky (#38BDF8)
  [152, [2, 132, 199]],  // deep cyan (#0284C7)
  [206, [217, 119, 6]],  // burnt amber (#D97706)
  [255, [154, 52, 18]],  // peak rust (#9A3412)
]);

export const WaveformScopes: React.FC<WaveformScopesProps> = ({
  engine,
  compact = false,
  theme = 'light',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<ScopeMode>('split');
  const [expanded, setExpanded] = useState(false);
  const [timeWindowSec, setTimeWindowSec] = useState<TimeWindowSec>(8);
  const [frozen, setFrozen] = useState(false);
  const [showPitchTrack, setShowPitchTrack] = useState(true);
  const [telemetry, setTelemetry] = useState({
    peakDb: '-inf',
    estHz: '---',
    note: '--',
    centroid: '---',
  });

  const peakHoldRef = useRef<Float32Array>(new Float32Array(256));
  const historyRef = useRef<SpectrogramFrame[]>([]);
  const lastSampleTimeRef = useRef<number>(0);
  const frozenTimeRef = useRef<number>(0);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  const toggleFreeze = () => {
    setFrozen((prev) => {
      if (!prev) {
        frozenTimeRef.current = performance.now();
      }
      return !prev;
    });
  };

  const clearHistory = () => {
    historyRef.current = [];
    lastSampleTimeRef.current = 0;
  };

  useEffect(() => {
    let rafId = 0;
    let frameCount = 0;

    if (!offscreenRef.current) {
      const off = document.createElement('canvas');
      off.width = 256;
      off.height = SPECTROGRAM_ROWS;
      offscreenRef.current = off;
    }

    const draw = () => {
      const canvas = canvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      if (!canvas || !rect || rect.width < 2 || rect.height < 2) {
        rafId = requestAnimationFrame(draw);
        return;
      }

      const nowMs = performance.now();
      const timeData = engine.getTimeDomainData();
      const freqData = engine.getFrequencyData();
      const sampleRate = engine.getContext()?.sampleRate || 48000;
      const nyquist = sampleRate / 2;
      const maxSpecFreq = Math.min(MAX_SPEC_FREQ, nyquist);

      // Analyze current FFT frame for fundamental & spectral centroid
      let maxBin = 0;
      let maxBinVal = 0;
      let weightedFreqSum = 0;
      let energySum = 0;
      const halfBins = Math.min(freqData.length - 1, Math.floor((maxSpecFreq / nyquist) * freqData.length));

      for (let i = 2; i <= halfBins; i++) {
        const val = freqData[i];
        if (val > maxBinVal) {
          maxBinVal = val;
          maxBin = i;
        }
        if (val > 18) {
          const e = val * val;
          const hz = (i * nyquist) / freqData.length;
          weightedFreqSum += hz * e;
          energySum += e;
        }
      }

      // Subharmonic check so bright harmonics don't jump fundamental by +1 octave
      let fundBin = maxBin;
      if (maxBinVal > 24 && fundBin >= 6) {
        const halfIdx = Math.round(fundBin / 2);
        const thirdIdx = Math.round(fundBin / 3);
        const halfVal = Math.max(
          freqData[Math.max(1, halfIdx - 1)],
          freqData[halfIdx],
          freqData[Math.min(halfBins, halfIdx + 1)]
        );
        const thirdVal = Math.max(
          freqData[Math.max(1, thirdIdx - 1)],
          freqData[thirdIdx],
          freqData[Math.min(halfBins, thirdIdx + 1)]
        );
        if (thirdVal >= maxBinVal * 0.5 && thirdIdx >= 2) {
          fundBin = thirdIdx;
        } else if (halfVal >= maxBinVal * 0.48 && halfIdx >= 2) {
          fundBin = halfIdx;
        }
      }

      const fundHz = maxBinVal > 24 ? (fundBin * nyquist) / freqData.length : 0;
      const centroidHz = energySum > 0 ? weightedFreqSum / energySum : 0;

      // Record timestamped log-frequency column into rolling spectrogram history
      if (!frozen && nowMs - lastSampleTimeRef.current >= SAMPLE_INTERVAL_MS) {
        lastSampleTimeRef.current = nowMs;
        const bins = new Uint8Array(SPECTROGRAM_ROWS);
        const logRatio = maxSpecFreq / MIN_SPEC_FREQ;
        for (let r = 0; r < SPECTROGRAM_ROWS; r++) {
          const fLow = MIN_SPEC_FREQ * Math.pow(logRatio, Math.max(0, r - 0.5) / (SPECTROGRAM_ROWS - 1));
          const fHigh = MIN_SPEC_FREQ * Math.pow(logRatio, Math.min(SPECTROGRAM_ROWS - 1, r + 0.5) / (SPECTROGRAM_ROWS - 1));
          const b0 = Math.max(1, Math.min(freqData.length - 1, Math.floor((fLow / nyquist) * freqData.length)));
          const b1 = Math.max(b0, Math.min(freqData.length - 1, Math.ceil((fHigh / nyquist) * freqData.length)));
          let peak = 0;
          for (let b = b0; b <= b1; b++) {
            if (freqData[b] > peak) peak = freqData[b];
          }
          bins[r] = peak;
        }
        historyRef.current.push({ timeMs: nowMs, bins, fundHz, centroidHz });
        if (historyRef.current.length > MAX_HISTORY_FRAMES) {
          historyRef.current.shift();
        }
      }

      const dpr = window.devicePixelRatio || 1;
      const targetW = Math.max(120, Math.floor(rect.width * dpr));
      const targetH = Math.max(64, Math.floor(rect.height * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const isLight = theme === 'light';
      const lut = isLight ? SPECTROGRAM_LUT_LIGHT : SPECTROGRAM_LUT_DARK;

      const ctx = canvas.getContext('2d');
      if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          ctx.clearRect(0, 0, w, h);

          ctx.fillStyle = isLight ? '#F8FAFC' : '#090D15';
          ctx.fillRect(0, 0, w, h);

          // Zero-crossing trigger & peak
          let maxAmp = 0;
          let triggerIdx = 0;
          for (let i = 1; i < timeData.length / 2; i++) {
            const abs = Math.abs(timeData[i]);
            if (abs > maxAmp) maxAmp = abs;
            if (triggerIdx === 0 && timeData[i - 1] < 0 && timeData[i] >= 0) {
              triggerIdx = i;
            }
          }
          for (let i = timeData.length / 2; i < timeData.length; i++) {
            const abs = Math.abs(timeData[i]);
            if (abs > maxAmp) maxAmp = abs;
          }

          const drawGrid = () => {
            ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(148, 163, 184, 0.08)';
            ctx.lineWidth = 1 * dpr;
            const cols = 8;
            const rows = 4;
            for (let c = 1; c < cols; c++) {
              const x = Math.round((w / cols) * c) + 0.5;
              ctx.beginPath();
              ctx.moveTo(x, 0);
              ctx.lineTo(x, h);
              ctx.stroke();
            }
            for (let r = 1; r < rows; r++) {
              const y = Math.round((h / rows) * r) + 0.5;
              ctx.beginPath();
              ctx.moveTo(0, y);
              ctx.lineTo(w, y);
              ctx.stroke();
            }
          };

          const drawOsc = (x0: number, y0: number, boxW: number, boxH: number) => {
            ctx.strokeStyle = isLight ? 'rgba(217, 119, 6, 0.22)' : 'rgba(245, 158, 11, 0.18)';
            ctx.lineWidth = 1 * dpr;
            ctx.beginPath();
            ctx.moveTo(x0, y0 + boxH / 2);
            ctx.lineTo(x0 + boxW, y0 + boxH / 2);
            ctx.stroke();

            const samplesToShow = Math.min(720, timeData.length - triggerIdx);
            ctx.strokeStyle = isLight ? '#D97706' : '#F59E0B';
            ctx.lineWidth = 2 * dpr;
            ctx.lineJoin = 'round';
            ctx.beginPath();
            for (let i = 0; i < samplesToShow; i++) {
              const x = x0 + (i / (samplesToShow - 1)) * boxW;
              const v = Math.max(-1, Math.min(1, timeData[triggerIdx + i] * 1.15));
              const y = y0 + boxH / 2 - v * (boxH * 0.42);
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.stroke();

            ctx.strokeStyle = isLight ? 'rgba(217, 119, 6, 0.16)' : 'rgba(245, 158, 11, 0.22)';
            ctx.lineWidth = 5 * dpr;
            ctx.stroke();
          };

          const drawFft = (x0: number, y0: number, boxW: number, boxH: number) => {
            const bars = 96;
            const minFreq = 45;
            const maxFreq = Math.min(16000, nyquist);
            const peakHold = peakHoldRef.current;

            ctx.beginPath();
            for (let b = 0; b < bars; b++) {
              const t = b / (bars - 1);
              const freq = minFreq * Math.pow(maxFreq / minFreq, t);
              const bin = Math.min(
                freqData.length - 1,
                Math.max(1, Math.round((freq / nyquist) * freqData.length))
              );
              const mag = freqData[bin] / 255;
              if (mag > peakHold[b]) peakHold[b] = mag;
              else peakHold[b] = Math.max(0, peakHold[b] - 0.008);

              const x = x0 + t * boxW;
              const barH = mag * (boxH * 0.85);
              const y = y0 + boxH - barH;

              if (b === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.strokeStyle = isLight ? '#0891B2' : '#06B6D4';
            ctx.lineWidth = 1.8 * dpr;
            ctx.stroke();

            ctx.lineTo(x0 + boxW, y0 + boxH);
            ctx.lineTo(x0, y0 + boxH);
            ctx.closePath();
            const grad = ctx.createLinearGradient(0, y0, 0, y0 + boxH);
            grad.addColorStop(0, isLight ? 'rgba(8, 145, 178, 0.24)' : 'rgba(6, 182, 212, 0.28)');
            grad.addColorStop(1, isLight ? 'rgba(8, 145, 178, 0.02)' : 'rgba(6, 182, 212, 0.02)');
            ctx.fillStyle = grad;
            ctx.fill();

            ctx.fillStyle = isLight ? 'rgba(8, 145, 178, 0.5)' : 'rgba(6, 182, 212, 0.45)';
            for (let b = 0; b < bars; b += 2) {
              const t = b / (bars - 1);
              const x = x0 + t * boxW;
              const py = y0 + boxH - peakHold[b] * (boxH * 0.85);
              ctx.fillRect(x, py, Math.max(2, (boxW / bars) * 0.8), 1.5 * dpr);
            }
          };

          const drawFftTime = () => {
            const leftGutter = Math.round(40 * dpr);
            const rightPad = Math.round(8 * dpr);
            const topPad = Math.round(6 * dpr);
            const bottomGutter = Math.round(16 * dpr);
            const plotW = Math.max(40, w - leftGutter - rightPad);
            const plotH = Math.max(24, h - topPad - bottomGutter);

            const endTime = frozen ? frozenTimeRef.current : nowMs;
            const windowMs = timeWindowSec * 1000;
            const startTime = endTime - windowMs;
            const history = historyRef.current;

            const off = offscreenRef.current!;
            const imgW = Math.min(480, Math.max(120, Math.floor(plotW / dpr)));
            if (off.width !== imgW || off.height !== SPECTROGRAM_ROWS) {
              off.width = imgW;
              off.height = SPECTROGRAM_ROWS;
            }
            const offCtx = off.getContext('2d');
            if (offCtx) {
              const imgData = offCtx.createImageData(imgW, SPECTROGRAM_ROWS);
              const pixels = imgData.data;

              // Find first index near startTime
              let cursor = 0;
              while (cursor < history.length && history[cursor].timeMs < startTime - SAMPLE_INTERVAL_MS) {
                cursor++;
              }

              for (let col = 0; col < imgW; col++) {
                const colTime = startTime + (col / Math.max(1, imgW - 1)) * windowMs;
                while (
                  cursor + 1 < history.length &&
                  Math.abs(history[cursor + 1].timeMs - colTime) <= Math.abs(history[cursor].timeMs - colTime)
                ) {
                  cursor++;
                }
                const frame = cursor < history.length ? history[cursor] : null;
                const valid = frame && Math.abs(frame.timeMs - colTime) <= SAMPLE_INTERVAL_MS * 3.5;

                if (valid && frame) {
                  const bins = frame.bins;
                  for (let row = 0; row < SPECTROGRAM_ROWS; row++) {
                    const lutIdx = bins[SPECTROGRAM_ROWS - 1 - row] * 4;
                    const pIdx = (row * imgW + col) * 4;
                    pixels[pIdx] = lut[lutIdx];
                    pixels[pIdx + 1] = lut[lutIdx + 1];
                    pixels[pIdx + 2] = lut[lutIdx + 2];
                    pixels[pIdx + 3] = 255;
                  }
                } else {
                  for (let row = 0; row < SPECTROGRAM_ROWS; row++) {
                    const pIdx = (row * imgW + col) * 4;
                    pixels[pIdx] = isLight ? 248 : 9;
                    pixels[pIdx + 1] = isLight ? 250 : 13;
                    pixels[pIdx + 2] = isLight ? 252 : 21;
                    pixels[pIdx + 3] = 255;
                  }
                }
              }
              offCtx.putImageData(imgData, 0, 0);
              ctx.imageSmoothingEnabled = true;
              ctx.drawImage(off, leftGutter, topPad, plotW, plotH);
            }

            // Plot border
            ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.16)' : 'rgba(148, 163, 184, 0.18)';
            ctx.lineWidth = 1 * dpr;
            ctx.strokeRect(leftGutter + 0.5, topPad + 0.5, plotW - 1, plotH - 1);

            // Log frequency grid lines & Y axis labels
            const freqTicks = plotH > 120 * dpr ? [100, 250, 500, 1000, 2000, 5000, 10000] : [100, 500, 2000, 8000];
            const logRatio = maxSpecFreq / MIN_SPEC_FREQ;
            ctx.font = `${Math.round(9.5 * dpr)}px "JetBrains Mono", monospace`;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';

            for (const f of freqTicks) {
              if (f < MIN_SPEC_FREQ || f > maxSpecFreq) continue;
              const norm = Math.log(f / MIN_SPEC_FREQ) / Math.log(logRatio);
              const y = topPad + (1 - norm) * plotH;
              ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.1)' : 'rgba(148, 163, 184, 0.12)';
              ctx.beginPath();
              ctx.moveTo(leftGutter, Math.round(y) + 0.5);
              ctx.lineTo(leftGutter + plotW, Math.round(y) + 0.5);
              ctx.stroke();

              ctx.fillStyle = isLight ? 'rgba(51, 65, 85, 0.85)' : 'rgba(148, 163, 184, 0.78)';
              ctx.fillText(formatFreqLabel(f), leftGutter - 5 * dpr, y);
            }

            // Time grid lines & X axis labels
            const timeSteps = 4;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            for (let s = 0; s <= timeSteps; s++) {
              const frac = s / timeSteps;
              const x = leftGutter + frac * plotW;
              if (s > 0 && s < timeSteps) {
                ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(148, 163, 184, 0.1)';
                ctx.beginPath();
                ctx.moveTo(Math.round(x) + 0.5, topPad);
                ctx.lineTo(Math.round(x) + 0.5, topPad + plotH);
                ctx.stroke();
              }
              const secAgo = -Math.round((1 - frac) * timeWindowSec);
              const label = s === timeSteps ? (frozen ? 'Hold' : 'Now') : `${secAgo}s`;
              ctx.fillStyle =
                s === timeSteps
                  ? isLight
                    ? 'rgba(8, 145, 178, 0.95)'
                    : 'rgba(6, 182, 212, 0.9)'
                  : isLight
                    ? 'rgba(51, 65, 85, 0.8)'
                    : 'rgba(148, 163, 184, 0.72)';
              ctx.textAlign = s === 0 ? 'left' : s === timeSteps ? 'right' : 'center';
              ctx.fillText(label, x, topPad + plotH + 3 * dpr);
            }

            // Fundamental pitch tracker polyline
            if (showPitchTrack && history.length > 1) {
              ctx.save();
              ctx.beginPath();
              ctx.rect(leftGutter, topPad, plotW, plotH);
              ctx.clip();

              ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.85)' : 'rgba(254, 243, 199, 0.85)';
              ctx.lineWidth = 1.5 * dpr;
              ctx.lineJoin = 'round';
              ctx.beginPath();
              let penDown = false;
              let prevTime = 0;
              for (const frame of history) {
                if (frame.timeMs < startTime - SAMPLE_INTERVAL_MS || frame.timeMs > endTime + SAMPLE_INTERVAL_MS) {
                  continue;
                }
                if (frame.fundHz >= MIN_SPEC_FREQ && frame.fundHz <= maxSpecFreq) {
                  const x = leftGutter + ((frame.timeMs - startTime) / windowMs) * plotW;
                  const norm = Math.log(frame.fundHz / MIN_SPEC_FREQ) / Math.log(logRatio);
                  const y = topPad + (1 - norm) * plotH;
                  if (!penDown || frame.timeMs - prevTime > SAMPLE_INTERVAL_MS * 4) {
                    ctx.moveTo(x, y);
                  } else {
                    ctx.lineTo(x, y);
                  }
                  penDown = true;
                  prevTime = frame.timeMs;
                } else {
                  penDown = false;
                }
              }
              ctx.stroke();
              ctx.restore();
            }

            // Interactive crosshair probe
            const ptr = pointerRef.current;
            if (ptr) {
              const px = ptr.x * dpr;
              const py = ptr.y * dpr;
              if (px >= leftGutter && px <= leftGutter + plotW && py >= topPad && py <= topPad + plotH) {
                const relX = (px - leftGutter) / plotW;
                const relY = 1 - (py - topPad) / plotH;
                const probeFreq = MIN_SPEC_FREQ * Math.pow(logRatio, Math.max(0, Math.min(1, relY)));
                const probeTime = startTime + relX * windowMs;
                const secAgo = ((probeTime - endTime) / 1000).toFixed(2);

                // Find nearest frame & bin magnitude
                let nearestFrame: SpectrogramFrame | null = null;
                let bestDist = Infinity;
                for (const fr of history) {
                  const dist = Math.abs(fr.timeMs - probeTime);
                  if (dist < bestDist) {
                    bestDist = dist;
                    nearestFrame = fr;
                  }
                }
                let magDbText = '-- dB';
                if (nearestFrame && bestDist <= SAMPLE_INTERVAL_MS * 4) {
                  const row = Math.max(0, Math.min(SPECTROGRAM_ROWS - 1, Math.round(relY * (SPECTROGRAM_ROWS - 1))));
                  const val = nearestFrame.bins[row];
                  const db = -90 + (val / 255) * 82;
                  magDbText = val <= 2 ? '<-88 dB' : `${db.toFixed(0)} dB`;
                }

                ctx.save();
                ctx.setLineDash([3 * dpr, 3 * dpr]);
                ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.55)' : 'rgba(241, 245, 249, 0.5)';
                ctx.lineWidth = 1 * dpr;
                ctx.beginPath();
                ctx.moveTo(px, topPad);
                ctx.lineTo(px, topPad + plotH);
                ctx.moveTo(leftGutter, py);
                ctx.lineTo(leftGutter + plotW, py);
                ctx.stroke();
                ctx.restore();

                const noteStr = freqToNoteName(probeFreq);
                const probeText = `${noteStr} · ${Math.round(probeFreq)} Hz · ${secAgo}s · ${magDbText}`;
                ctx.font = `${Math.round(10 * dpr)}px "JetBrains Mono", monospace`;
                const textW = ctx.measureText(probeText).width + 12 * dpr;
                const boxH = 17 * dpr;
                const hudX = leftGutter + plotW - textW - 6 * dpr;
                const hudY = topPad + 5 * dpr;
                ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.94)' : 'rgba(7, 9, 14, 0.88)';
                ctx.fillRect(hudX, hudY, textW, boxH);
                ctx.strokeStyle = isLight ? 'rgba(8, 145, 178, 0.5)' : 'rgba(6, 182, 212, 0.45)';
                ctx.lineWidth = 1 * dpr;
                ctx.strokeRect(hudX, hudY, textW, boxH);
                ctx.fillStyle = isLight ? '#0F172A' : '#E2E8F0';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(probeText, hudX + 6 * dpr, hudY + boxH / 2);
              }
            }
          };

          if (mode === 'fftTime') {
            drawFftTime();
          } else {
            drawGrid();
            if (mode === 'split') {
              const halfW = Math.floor(w / 2);
              drawOsc(0, 0, halfW - 2 * dpr, h);
              ctx.fillStyle = isLight ? '#CBD5E1' : '#1E293B';
              ctx.fillRect(halfW - dpr, 0, 2 * dpr, h);
              drawFft(halfW + 2 * dpr, 0, w - halfW - 2 * dpr, h);
            } else if (mode === 'overlay') {
              drawFft(0, 0, w, h);
              drawOsc(0, 0, w, h);
            } else if (mode === 'osc') {
              drawOsc(0, 0, w, h);
            } else {
              drawFft(0, 0, w, h);
            }
          }

          frameCount++;
          if (frameCount % 6 === 0) {
            const db = maxAmp > 0.0005 ? (20 * Math.log10(maxAmp)).toFixed(1) : '-inf';
            const estHz = fundHz > 0 ? `${Math.round(fundHz)}` : '---';
            const note = fundHz > 0 ? freqToNoteName(fundHz) : '--';
            const centroid =
              centroidHz > 0
                ? centroidHz >= 1000
                  ? `${(centroidHz / 1000).toFixed(1)}k`
                  : `${Math.round(centroidHz)}`
                : '---';
            setTelemetry({ peakDb: db, estHz, note, centroid });
          }
        }
      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [engine, mode, timeWindowSec, frozen, showPitchTrack, theme]);

  const heightClass = compact
    ? expanded
      ? 'h-52 sm:h-56'
      : 'h-20 sm:h-24'
    : 'h-52 sm:h-64';

  return (
    <div className="bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden flex flex-col">
      <div className="px-3 py-1.5 bg-slate-50 dark:bg-[#111622] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2.5 text-xs">
          <span className="font-medium text-slate-900 dark:text-slate-200 whitespace-nowrap">Signal Scopes</span>
          <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
          <span className="font-mono tabular-nums text-amber-700 dark:text-amber-400 whitespace-nowrap">
            Peak {telemetry.peakDb} dB
          </span>
          <span className="text-slate-300 dark:text-slate-600 hidden sm:inline" aria-hidden="true">·</span>
          <span className="font-mono tabular-nums text-cyan-700 dark:text-cyan-400 hidden sm:inline whitespace-nowrap">
            Fund {telemetry.estHz} Hz {telemetry.note !== '--' ? `(${telemetry.note})` : ''}
          </span>
          {mode === 'fftTime' && (
            <>
              <span className="text-slate-300 dark:text-slate-600 hidden xl:inline" aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300 hidden xl:inline whitespace-nowrap">
                Centroid {telemetry.centroid} Hz
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {mode === 'fftTime' && (
            <div className="flex items-center gap-1">
              <div className="flex items-center bg-slate-100 dark:bg-[#07090E] p-0.5 rounded border border-slate-200 dark:border-slate-800">
                {([4, 8, 16] as TimeWindowSec[]).map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setTimeWindowSec(sec)}
                    className={`px-1.5 py-0.5 text-[10px] font-mono rounded transition-colors whitespace-nowrap shrink-0 ${
                      timeWindowSec === sec
                        ? 'bg-white dark:bg-slate-800 text-cyan-700 dark:text-cyan-300 shadow-xs dark:shadow-none'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                    title={`Show last ${sec} seconds`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setShowPitchTrack((v) => !v)}
                className={`px-2 py-0.5 text-[11px] font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
                  showPitchTrack
                    ? 'bg-amber-500/15 border-amber-500/45 text-amber-800 dark:text-amber-300'
                    : 'bg-white dark:bg-[#07090E] border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
                title="Overlay tracked fundamental pitch over time"
              >
                Pitch
              </button>

              <button
                type="button"
                onClick={toggleFreeze}
                className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
                  frozen
                    ? 'bg-cyan-500/15 border-cyan-500/45 text-cyan-800 dark:text-cyan-300'
                    : 'bg-white dark:bg-[#07090E] border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
                title={frozen ? 'Resume live spectrogram' : 'Freeze spectrogram'}
              >
                {frozen ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                <span>{frozen ? 'Live' : 'Freeze'}</span>
              </button>

              <button
                type="button"
                onClick={clearHistory}
                className="p-1 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 bg-white dark:bg-[#07090E] border border-slate-300 dark:border-slate-800 rounded shrink-0"
                title="Clear spectrogram history"
                aria-label="Clear spectrogram history"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-[#07090E] p-0.5 rounded border border-slate-200 dark:border-slate-800">
            {(
              [
                { id: 'split', label: 'Split' },
                { id: 'overlay', label: 'Overlay' },
                { id: 'osc', label: 'Wave' },
                { id: 'fft', label: 'FFT' },
                { id: 'fftTime', label: 'FFT×Time' },
              ] as { id: ScopeMode; label: string }[]
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  mode === m.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs dark:shadow-none'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {compact && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="p-1 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-[#07090E] border border-slate-300 dark:border-slate-800 rounded shrink-0"
              title={expanded ? 'Collapse scope height' : 'Expand scope height'}
              aria-label={expanded ? 'Collapse scope height' : 'Expand scope height'}
            >
              {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      <div className={`relative w-full ${heightClass}`}>
        <canvas
          ref={canvasRef}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            pointerRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
          }}
          onPointerLeave={() => {
            pointerRef.current = null;
          }}
          className={`w-full h-full block ${mode === 'fftTime' ? 'cursor-crosshair' : ''}`}
        />

        {mode === 'split' && (
          <>
            <span className="pointer-events-none absolute top-1.5 left-2 text-[10px] font-mono text-amber-700 dark:text-amber-400/80">
              Time Domain
            </span>
            <span className="pointer-events-none absolute top-1.5 left-[51.5%] text-[10px] font-mono text-cyan-700 dark:text-cyan-400/80">
              FFT Spectrum
            </span>
          </>
        )}

        {mode === 'fftTime' && (
          <div className="pointer-events-none absolute top-1.5 left-12 flex items-center gap-2 text-[10px] font-mono text-slate-700 dark:text-slate-300/85 bg-white/85 dark:bg-[#07090E]/75 border border-slate-200 dark:border-transparent px-1.5 py-0.5 rounded">
            <span>-90 dB</span>
            <span
              className="inline-block w-14 h-1.5 rounded-sm border border-slate-300/60 dark:border-transparent"
              style={{
                background:
                  theme === 'light'
                    ? 'linear-gradient(90deg, #F8FAFC 0%, #E0F2FE 20%, #38BDF8 45%, #0284C7 65%, #D97706 85%, #9A3412 100%)'
                    : 'linear-gradient(90deg, #090D15 0%, #0C2038 20%, #0891B2 45%, #22D3EE 65%, #F59E0B 85%, #FEF3C7 100%)',
              }}
            />
            <span>-8 dB</span>
          </div>
        )}
      </div>
    </div>
  );
};
