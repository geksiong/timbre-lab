import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines,
  BookmarkPlus,
  Check,
  Mic,
  Pause,
  Play,
  RefreshCw,
  Scissors,
  Square,
  Upload,
  Volume2,
  Wand2,
  X,
} from 'lucide-react';
import {
  archetypeLabel,
  autoIsolateNoteBounds,
  midiToNoteLabel,
  reconstructPatchFromSample,
  ReconstructionResult,
  SPECTRUM_BANDS,
  SPECTRUM_MAX_HZ,
  SPECTRUM_MIN_HZ,
  spectrumBandFreq,
  SynthesisArchetype,
} from '../engine/sampleAnalyzer';
import { SynthEngine } from '../engine/SynthEngine';
import { SynthPatch } from '../engine/types';

interface SampleAnalyzerModalProps {
  theme: 'light' | 'dark';
  audioOutputDevices?: { deviceId: string; label: string }[];
  selectedOutputId?: string;
  outputSelectionSupported?: boolean;
  onSelectOutputId?: (deviceId: string) => void | Promise<void>;
  onRefreshAudioDevices?: (requestPermissionIfUnnamed?: boolean) => void | Promise<void>;
  onApplyPatch: (patch: SynthPatch) => void;
  onSaveAndApplyPatch: (patch: SynthPatch, name: string) => void;
  onClose: () => void;
}

type AuditionMode = 'idle' | 'original' | 'synth' | 'ab';

const ARCHETYPE_OPTIONS: { id: SynthesisArchetype; label: string }[] = [
  { id: 'auto', label: 'Auto-Detect' },
  { id: 'physicalPluck', label: 'Plucked' },
  { id: 'physicalBowed', label: 'Bowed' },
  { id: 'windFormant', label: 'Wind / Formant' },
  { id: 'fmBell', label: 'FM Bell' },
  { id: 'ensemblePad', label: 'Ensemble Pad' },
];

function cleanBaseName(filename: string): string {
  const withoutExt = filename.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();
  if (!withoutExt) return 'Sampled Instrument';
  return withoutExt.slice(0, 36);
}

function formatSecMs(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0.00s';
  return `${sec.toFixed(2)}s`;
}

function formatDurationMs(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0 ms';
  if (sec < 1) return `${Math.round(sec * 1000)} ms`;
  return `${sec.toFixed(2)} s`;
}

function formatHz(hz: number): string {
  if (!Number.isFinite(hz) || hz <= 0) return '---';
  return hz >= 1000 ? `${(hz / 1000).toFixed(2)} kHz` : `${Math.round(hz)} Hz`;
}

export const SampleAnalyzerModal: React.FC<SampleAnalyzerModalProps> = ({
  theme,
  audioOutputDevices,
  selectedOutputId,
  outputSelectionSupported,
  onSelectOutputId,
  onRefreshAudioDevices,
  onApplyPatch,
  onSaveAndApplyPatch,
  onClose,
}) => {
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [sourceLabel, setSourceLabel] = useState<string>('');
  const [patchName, setPatchName] = useState<string>('Matched Instrument');
  const [trimStartSec, setTrimStartSec] = useState<number>(0);
  const [trimEndSec, setTrimEndSec] = useState<number>(0);
  const [archetype, setArchetype] = useState<SynthesisArchetype>('auto');

  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [result, setResult] = useState<ReconstructionResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Microphone capture & Audio output target state
  const [micState, setMicState] = useState<'idle' | 'requesting' | 'recording'>('idle');
  const [micLevel, setMicLevel] = useState<number>(0);
  const [micElapsedSec, setMicElapsedSec] = useState<number>(0);
  const [micDevices, setMicDevices] = useState<{ deviceId: string; label: string }[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('default');
  const [localOutputs, setLocalOutputs] = useState<{ deviceId: string; label: string }[]>([]);
  const [localOutputId, setLocalOutputId] = useState<string>('default');
  const [devicesRefreshing, setDevicesRefreshing] = useState<boolean>(false);

  const effectiveOutputDevices = audioOutputDevices ?? localOutputs;
  const effectiveOutputId = selectedOutputId ?? localOutputId;
  const effectiveOutputSupported =
    outputSelectionSupported ??
    (typeof AudioContext !== 'undefined' &&
      typeof (AudioContext.prototype as unknown as { setSinkId?: unknown }).setSinkId ===
        'function');

  // Playback & A/B auditioning
  const [auditionMode, setAuditionMode] = useState<AuditionMode>('idle');
  const [abPhase, setAbPhase] = useState<'A' | 'B'>('A');
  const [playheadSec, setPlayheadSec] = useState<number | null>(null);
  const [heldPitchMidi, setHeldPitchMidi] = useState<number | null>(null);

  // Canvas & interactive refs
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const specCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const envCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const specPointerRef = useRef<{ x: number; y: number } | null>(null);
  const [specHoverTick, setSpecHoverTick] = useState<number>(0);

  const dragHandleRef = useRef<'start' | 'end' | null>(null);
  const analysisJobRef = useRef<number>(0);
  const analysisDebounceRef = useRef<number | null>(null);

  // Audio playback refs
  const previewEngineRef = useRef<SynthEngine | null>(null);
  const sampleAudioCtxRef = useRef<AudioContext | null>(null);
  const activeSampleSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const playheadRafRef = useRef<number>(0);
  const abTimersRef = useRef<number[]>([]);

  // Mic capture refs
  const micStreamRef = useRef<MediaStream | null>(null);
  const micRecorderRef = useRef<MediaRecorder | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const micRafRef = useRef<number>(0);
  const micStartMsRef = useRef<number>(0);

  const applySinkIdToAudioContext = useCallback(
    async (ctx: AudioContext, targetId: string) => {
      const sinkable = ctx as AudioContext & {
        setSinkId?: (id: string) => Promise<void>;
      };
      if (typeof sinkable.setSinkId !== 'function') return;
      const normalized = !targetId || targetId === 'default' ? '' : targetId;
      try {
        await sinkable.setSinkId(normalized);
      } catch {
        // Fallback silently if device is no longer attached
        if (normalized !== '') {
          await sinkable.setSinkId('').catch(() => undefined);
        }
      }
    },
    []
  );

  const getDecodeContext = useCallback((): AudioContext => {
    if (!sampleAudioCtxRef.current || (sampleAudioCtxRef.current.state as string) === 'closed') {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const created = new Ctx();
      sampleAudioCtxRef.current = created;
      if (effectiveOutputId && effectiveOutputId !== 'default') {
        void applySinkIdToAudioContext(created, effectiveOutputId);
      }
    }
    return sampleAudioCtxRef.current;
  }, [applySinkIdToAudioContext, effectiveOutputId]);

  const getPreviewEngine = useCallback((): SynthEngine => {
    if (!previewEngineRef.current) {
      const eng = new SynthEngine();
      if (effectiveOutputId && effectiveOutputId !== 'default') {
        void eng.setOutputDevice(effectiveOutputId);
      }
      previewEngineRef.current = eng;
    }
    return previewEngineRef.current;
  }, [effectiveOutputId]);

  const stopAllAudition = useCallback(() => {
    for (const tid of abTimersRef.current) {
      window.clearTimeout(tid);
    }
    abTimersRef.current = [];
    if (playheadRafRef.current) {
      cancelAnimationFrame(playheadRafRef.current);
      playheadRafRef.current = 0;
    }
    if (activeSampleSrcRef.current) {
      try {
        activeSampleSrcRef.current.stop();
        activeSampleSrcRef.current.disconnect();
      } catch {
        // ignore already stopped
      }
      activeSampleSrcRef.current = null;
    }
    previewEngineRef.current?.allNotesOff();
    setAuditionMode('idle');
    setPlayheadSec(null);
    setHeldPitchMidi(null);
  }, []);

  const stopMicCapture = useCallback(() => {
    if (micRafRef.current) {
      cancelAnimationFrame(micRafRef.current);
      micRafRef.current = 0;
    }
    if (micRecorderRef.current && micRecorderRef.current.state !== 'inactive') {
      try {
        micRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    if (micStreamRef.current) {
      for (const track of micStreamRef.current.getTracks()) {
        track.stop();
      }
      micStreamRef.current = null;
    }
    if (micCtxRef.current) {
      void micCtxRef.current.close().catch(() => undefined);
      micCtxRef.current = null;
    }
    setMicLevel(0);
    setMicState('idle');
  }, []);

  const refreshAudioDevices = useCallback(
    async (requestPermissionIfUnnamed = false) => {
      setDevicesRefreshing(true);
      try {
        if (onRefreshAudioDevices && requestPermissionIfUnnamed) {
          await onRefreshAudioDevices(true);
        }
        if (!navigator.mediaDevices?.enumerateDevices) return;
        let devices = await navigator.mediaDevices.enumerateDevices();
        let inputs = devices.filter((d) => d.kind === 'audioinput');
        let outputs = devices.filter((d) => d.kind === 'audiooutput');
        const hasUnlabeled =
          (inputs.length === 0 || inputs.every((d) => !d.label)) &&
          (outputs.length === 0 || outputs.every((d) => !d.label));

        if (requestPermissionIfUnnamed && hasUnlabeled && navigator.mediaDevices.getUserMedia) {
          try {
            const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            for (const track of tempStream.getTracks()) {
              track.stop();
            }
            devices = await navigator.mediaDevices.enumerateDevices();
            inputs = devices.filter((d) => d.kind === 'audioinput');
            outputs = devices.filter((d) => d.kind === 'audiooutput');
          } catch {
            setErrorMsg('Audio device permission is needed to list device names.');
          }
        }

        const mappedInputs = inputs
          .filter((d) => d.deviceId !== '' && d.deviceId !== 'default')
          .map((d, idx) => ({
            deviceId: d.deviceId,
            label: d.label || `Audio Input ${idx + 1}`,
          }));

        setMicDevices(mappedInputs);
        setSelectedMicId((prev) => {
          if (prev === 'default') return 'default';
          return mappedInputs.some((m) => m.deviceId === prev) ? prev : 'default';
        });

        const mappedOutputs = outputs
          .filter((d) => d.deviceId !== '' && d.deviceId !== 'default')
          .map((d, idx) => ({
            deviceId: d.deviceId,
            label: d.label || `Audio Output ${idx + 1}`,
          }));

        setLocalOutputs(mappedOutputs);
        setLocalOutputId((prev) => {
          if (prev === 'default') return 'default';
          return mappedOutputs.some((m) => m.deviceId === prev) ? prev : 'default';
        });
      } catch {
        // ignore enumeration error
      } finally {
        setDevicesRefreshing(false);
      }
    },
    [onRefreshAudioDevices]
  );

  // Sync audio output target changes to both sample decode context and preview synth engine
  useEffect(() => {
    if (sampleAudioCtxRef.current && (sampleAudioCtxRef.current.state as string) !== 'closed') {
      void applySinkIdToAudioContext(sampleAudioCtxRef.current, effectiveOutputId);
    }
    if (previewEngineRef.current) {
      void previewEngineRef.current.setOutputDevice(effectiveOutputId);
    }
  }, [applySinkIdToAudioContext, effectiveOutputId]);

  const handleOutputTargetChange = async (nextId: string) => {
    if (onSelectOutputId) {
      await onSelectOutputId(nextId);
    } else {
      setLocalOutputId(nextId);
    }
  };

  useEffect(() => {
    void refreshAudioDevices(false);
    const md = navigator.mediaDevices;
    const onDeviceChange = () => {
      void refreshAudioDevices(false);
    };
    md?.addEventListener?.('devicechange', onDeviceChange);
    return () => {
      md?.removeEventListener?.('devicechange', onDeviceChange);
      if (analysisDebounceRef.current !== null) {
        window.clearTimeout(analysisDebounceRef.current);
      }
      stopAllAudition();
      stopMicCapture();
      previewEngineRef.current?.dispose();
      previewEngineRef.current = null;
      if (sampleAudioCtxRef.current && (sampleAudioCtxRef.current.state as string) !== 'closed') {
        void sampleAudioCtxRef.current.close().catch(() => undefined);
      }
    };
  }, [refreshAudioDevices, stopAllAudition, stopMicCapture]);

  // Run DSP analysis & closed-loop reconstruction whenever audio/trim/archetype changes
  const runReconstruction = useCallback(
    async (
      buf: AudioBuffer,
      startSec: number,
      endSec: number,
      name: string,
      arch: SynthesisArchetype
    ) => {
      const jobId = ++analysisJobRef.current;
      setAnalyzing(true);
      setErrorMsg(null);
      try {
        const res = await reconstructPatchFromSample(name, buf, startSec, endSec, arch);
        if (analysisJobRef.current !== jobId) return;
        setResult(res);
      } catch (err) {
        if (analysisJobRef.current !== jobId) return;
        setErrorMsg(
          err instanceof Error ? err.message : 'Unable to analyze audio sample.'
        );
      } finally {
        if (analysisJobRef.current === jobId) {
          setAnalyzing(false);
        }
      }
    },
    []
  );

  // Keep preview engine loaded with latest reconstructed patch
  useEffect(() => {
    if (result?.patch && previewEngineRef.current) {
      previewEngineRef.current.loadPatch(result.patch);
    }
  }, [result]);

  const loadDecodedBuffer = useCallback(
    (decoded: AudioBuffer, displayName: string) => {
      stopAllAudition();
      const base = cleanBaseName(displayName);
      const { startSec, endSec } = autoIsolateNoteBounds(decoded);
      setAudioBuffer(decoded);
      setSourceLabel(displayName);
      setPatchName(`Matched ${base}`);
      setTrimStartSec(startSec);
      setTrimEndSec(endSec);
      void runReconstruction(decoded, startSec, endSec, `Matched ${base}`, archetype);
    },
    [archetype, runReconstruction, stopAllAudition]
  );

  const handleAudioBlobOrFile = useCallback(
    async (blob: Blob, displayName: string) => {
      setErrorMsg(null);
      try {
        const arrayBuf = await blob.arrayBuffer();
        const ctx = getDecodeContext();
        if (ctx.state === 'suspended') {
          await ctx.resume().catch(() => undefined);
        }
        const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
        if (!decoded || decoded.length < 128) {
          setErrorMsg('Audio clip is too short to analyze.');
          return;
        }
        loadDecodedBuffer(decoded, displayName);
      } catch {
        setErrorMsg(
          'Could not decode this audio format. Try WAV, MP3, OGG, FLAC, M4A, or WebM.'
        );
      }
    },
    [getDecodeContext, loadDecodedBuffer]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void handleAudioBlobOrFile(file, file.name);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void handleAudioBlobOrFile(file, file.name);
    }
  };

  // Live microphone recording
  const handleToggleMic = async () => {
    if (micState === 'recording') {
      if (micRecorderRef.current && micRecorderRef.current.state !== 'inactive') {
        micRecorderRef.current.stop();
      }
      return;
    }

    stopAllAudition();
    setErrorMsg(null);

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setErrorMsg('Microphone recording is not supported in this browser.');
      return;
    }

    setMicState('requesting');
    try {
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        ...(selectedMicId !== 'default' ? { deviceId: { exact: selectedMicId } } : {}),
      };
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      } catch (constraintErr) {
        if (
          selectedMicId !== 'default' &&
          constraintErr instanceof DOMException &&
          (constraintErr.name === 'OverconstrainedError' || constraintErr.name === 'NotFoundError')
        ) {
          setSelectedMicId('default');
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
          });
        } else {
          throw constraintErr;
        }
      }
      micStreamRef.current = stream;
      void refreshAudioDevices(false);

      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const micCtx = new Ctx();
      micCtxRef.current = micCtx;
      const source = micCtx.createMediaStreamSource(stream);
      const analyser = micCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const meterBuf = new Float32Array(analyser.fftSize);

      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(stream);
      micRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const recordedBlob = new Blob(chunks, { type: mimeType });
        stopMicCapture();
        if (recordedBlob.size > 0) {
          void handleAudioBlobOrFile(recordedBlob, 'Mic Recording.webm');
        }
      };

      micStartMsRef.current = performance.now();
      setMicElapsedSec(0);
      setMicState('recording');
      recorder.start(100);

      const tickMeter = () => {
        if (!micCtxRef.current || micRecorderRef.current?.state !== 'recording') return;
        analyser.getFloatTimeDomainData(meterBuf);
        let sum = 0;
        for (let i = 0; i < meterBuf.length; i++) {
          sum += meterBuf[i] * meterBuf[i];
        }
        const rms = Math.sqrt(sum / meterBuf.length);
        setMicLevel(Math.min(1, rms * 3.8));
        const elapsed = (performance.now() - micStartMsRef.current) / 1000;
        setMicElapsedSec(elapsed);
        if (elapsed >= 8.0 && micRecorderRef.current?.state === 'recording') {
          micRecorderRef.current.stop();
          return;
        }
        micRafRef.current = requestAnimationFrame(tickMeter);
      };
      micRafRef.current = requestAnimationFrame(tickMeter);
    } catch {
      stopMicCapture();
      setErrorMsg('Microphone access was denied or no audio input device was found.');
    }
  };

  // Schedule debounced re-analysis when trim handles move
  const scheduleTrimReanalysis = useCallback(
    (nextStart: number, nextEnd: number) => {
      if (!audioBuffer) return;
      if (analysisDebounceRef.current !== null) {
        window.clearTimeout(analysisDebounceRef.current);
      }
      analysisDebounceRef.current = window.setTimeout(() => {
        analysisDebounceRef.current = null;
        void runReconstruction(audioBuffer, nextStart, nextEnd, patchName, archetype);
      }, 180);
    },
    [archetype, audioBuffer, patchName, runReconstruction]
  );

  // Waveform peak cache for responsive trimmer drawing
  const waveformPeaks = useMemo(() => {
    if (!audioBuffer) return null;
    const cols = 360;
    const ch0 = audioBuffer.getChannelData(0);
    const step = Math.max(1, Math.floor(ch0.length / cols));
    const mins = new Float32Array(cols);
    const maxs = new Float32Array(cols);
    for (let c = 0; c < cols; c++) {
      const start = c * step;
      const end = c === cols - 1 ? ch0.length : Math.min(ch0.length, start + step);
      let lo = 1;
      let hi = -1;
      for (let i = start; i < end; i++) {
        const v = ch0[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      mins[c] = lo;
      maxs[c] = hi;
    }
    return { mins, maxs, cols };
  }, [audioBuffer]);

  // Draw Waveform & Interactive Trimmers
  useEffect(() => {
    const canvas = waveCanvasRef.current;
    if (!canvas || !audioBuffer || !waveformPeaks) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;

    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(rect.width * dpr);
    const h = Math.floor(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isLight = theme === 'light';
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = isLight ? '#F8FAFC' : '#07090E';
    ctx.fillRect(0, 0, w, h);

    const dur = Math.max(0.01, audioBuffer.duration);
    const startX = (trimStartSec / dur) * w;
    const endX = (trimEndSec / dur) * w;

    // Subtle center line
    ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.1)' : 'rgba(148, 163, 184, 0.14)';
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    // Active region highlight
    ctx.fillStyle = isLight ? 'rgba(217, 119, 6, 0.08)' : 'rgba(245, 158, 11, 0.08)';
    ctx.fillRect(startX, 0, Math.max(2, endX - startX), h);

    // Waveform bars
    const midY = h / 2;
    const ampScale = h * 0.43;
    for (let c = 0; c < waveformPeaks.cols; c++) {
      const x = (c / (waveformPeaks.cols - 1)) * w;
      const inWindow = x >= startX && x <= endX;
      ctx.strokeStyle = inWindow
        ? isLight
          ? '#D97706'
          : '#F59E0B'
        : isLight
          ? 'rgba(100, 116, 139, 0.35)'
          : 'rgba(148, 163, 184, 0.28)';
      ctx.lineWidth = Math.max(1.2, (w / waveformPeaks.cols) * 0.72);
      const yTop = midY - waveformPeaks.maxs[c] * ampScale;
      const yBot = midY - waveformPeaks.mins[c] * ampScale;
      ctx.beginPath();
      ctx.moveTo(x, yTop);
      ctx.lineTo(x, Math.max(yTop + 1 * dpr, yBot));
      ctx.stroke();
    }

    // Dimmed inactive regions outside handles
    ctx.fillStyle = isLight ? 'rgba(241, 245, 249, 0.62)' : 'rgba(7, 9, 14, 0.62)';
    ctx.fillRect(0, 0, Math.max(0, startX), h);
    ctx.fillRect(endX, 0, Math.max(0, w - endX), h);

    // Trim handle lines & grip tabs
    const drawHandle = (x: number, label: string, alignRight: boolean) => {
      const clampedX = Math.max(2 * dpr, Math.min(w - 2 * dpr, x));
      ctx.strokeStyle = isLight ? '#B45309' : '#FBBF24';
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.moveTo(clampedX, 0);
      ctx.lineTo(clampedX, h);
      ctx.stroke();

      const tabW = 24 * dpr;
      const tabH = 16 * dpr;
      const tabX = alignRight ? clampedX - tabW : clampedX;
      ctx.fillStyle = isLight ? '#D97706' : '#F59E0B';
      ctx.fillRect(tabX, 0, tabW, tabH);
      ctx.fillStyle = '#0F172A';
      ctx.font = `600 ${Math.round(9.5 * dpr)}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, tabX + tabW / 2, tabH / 2 + 0.5 * dpr);
    };

    drawHandle(startX, 'IN', false);
    drawHandle(endX, 'OUT', true);

    // Playback cursor
    if (playheadSec !== null && playheadSec >= 0 && playheadSec <= dur) {
      const px = (playheadSec / dur) * w;
      ctx.strokeStyle = isLight ? '#0891B2' : '#22D3EE';
      ctx.lineWidth = 1.8 * dpr;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
    }
  }, [audioBuffer, waveformPeaks, trimStartSec, trimEndSec, playheadSec, theme]);

  // Draw Side-by-Side / Overlay FFT Spectrum Comparison
  useEffect(() => {
    const canvas = specCanvasRef.current;
    if (!canvas || !result) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;

    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(rect.width * dpr);
    const h = Math.floor(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isLight = theme === 'light';
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = isLight ? '#F8FAFC' : '#07090E';
    ctx.fillRect(0, 0, w, h);

    const padL = 36 * dpr;
    const padR = 12 * dpr;
    const padT = 12 * dpr;
    const padB = 20 * dpr;
    const plotW = Math.max(40, w - padL - padR);
    const plotH = Math.max(30, h - padT - padB);

    const minDb = -66;
    const maxDb = 2;
    const logRatio = SPECTRUM_MAX_HZ / SPECTRUM_MIN_HZ;

    // Horizontal dB grid
    ctx.font = `${Math.round(9.5 * dpr)}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const db of [-60, -40, -20, 0]) {
      const norm = (db - minDb) / (maxDb - minDb);
      const y = padT + (1 - norm) * plotH;
      ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(148, 163, 184, 0.1)';
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.moveTo(padL, Math.round(y) + 0.5);
      ctx.lineTo(padL + plotW, Math.round(y) + 0.5);
      ctx.stroke();

      ctx.fillStyle = isLight ? 'rgba(51, 65, 85, 0.8)' : 'rgba(148, 163, 184, 0.72)';
      ctx.fillText(`${db}`, padL - 5 * dpr, y);
    }

    // Vertical frequency grid
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const f of [100, 250, 500, 1000, 2000, 5000, 10000]) {
      const t = Math.log(f / SPECTRUM_MIN_HZ) / Math.log(logRatio);
      const x = padL + t * plotW;
      ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(148, 163, 184, 0.1)';
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, padT);
      ctx.lineTo(Math.round(x) + 0.5, padT + plotH);
      ctx.stroke();

      ctx.fillStyle = isLight ? 'rgba(51, 65, 85, 0.8)' : 'rgba(148, 163, 184, 0.72)';
      ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x, padT + plotH + 4 * dpr);
    }

    // Plot curve helper
    const drawCurve = (
      spec: Float32Array,
      stroke: string,
      fill: string | null
    ) => {
      ctx.beginPath();
      for (let i = 0; i < SPECTRUM_BANDS; i++) {
        const t = i / (SPECTRUM_BANDS - 1);
        const x = padL + t * plotW;
        const db = Math.max(minDb, Math.min(maxDb, spec[i]));
        const y = padT + (1 - (db - minDb) / (maxDb - minDb)) * plotH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2 * dpr;
      ctx.lineJoin = 'round';
      ctx.stroke();

      if (fill) {
        ctx.lineTo(padL + plotW, padT + plotH);
        ctx.lineTo(padL, padT + plotH);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      }
    };

    drawCurve(
      result.profile.sampleSpectrumDb,
      isLight ? '#D97706' : '#F59E0B',
      isLight ? 'rgba(217, 119, 6, 0.12)' : 'rgba(245, 158, 11, 0.12)'
    );
    drawCurve(
      result.synthSpectrumDb,
      isLight ? '#0891B2' : '#06B6D4',
      isLight ? 'rgba(8, 145, 178, 0.11)' : 'rgba(6, 182, 212, 0.11)'
    );

    // Interactive hover probe
    const ptr = specPointerRef.current;
    if (ptr) {
      const px = ptr.x * dpr;
      const py = ptr.y * dpr;
      if (px >= padL && px <= padL + plotW && py >= padT && py <= padT + plotH) {
        const rel = (px - padL) / plotW;
        const bandIdx = Math.max(
          0,
          Math.min(SPECTRUM_BANDS - 1, Math.round(rel * (SPECTRUM_BANDS - 1)))
        );
        const hz = spectrumBandFreq(bandIdx);
        const origDb = result.profile.sampleSpectrumDb[bandIdx];
        const synDb = result.synthSpectrumDb[bandIdx];

        ctx.save();
        ctx.setLineDash([3 * dpr, 3 * dpr]);
        ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.45)' : 'rgba(226, 232, 240, 0.45)';
        ctx.lineWidth = 1 * dpr;
        ctx.beginPath();
        ctx.moveTo(px, padT);
        ctx.lineTo(px, padT + plotH);
        ctx.stroke();
        ctx.restore();

        const hud = `${Math.round(hz)} Hz · Orig ${origDb.toFixed(1)} dB · Synth ${synDb.toFixed(1)} dB`;
        ctx.font = `${Math.round(9.5 * dpr)}px "JetBrains Mono", monospace`;
        const boxW = ctx.measureText(hud).width + 12 * dpr;
        const boxH = 16 * dpr;
        const boxX = padL + plotW - boxW - 4 * dpr;
        const boxY = padT + 2 * dpr;
        ctx.fillStyle = isLight ? 'rgba(255,255,255,0.92)' : 'rgba(7,9,14,0.88)';
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.strokeStyle = isLight ? '#CBD5E1' : '#334155';
        ctx.lineWidth = 1 * dpr;
        ctx.strokeRect(boxX, boxY, boxW, boxH);
        ctx.fillStyle = isLight ? '#0F172A' : '#E2E8F0';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(hud, boxX + 6 * dpr, boxY + boxH / 2);
      }
    }
  }, [result, theme, specHoverTick]);

  // Draw Amplitude Envelope Comparison
  useEffect(() => {
    const canvas = envCanvasRef.current;
    if (!canvas || !result) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;

    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(rect.width * dpr);
    const h = Math.floor(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isLight = theme === 'light';
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = isLight ? '#F8FAFC' : '#07090E';
    ctx.fillRect(0, 0, w, h);

    const padX = 10 * dpr;
    const padY = 10 * dpr;
    const plotW = Math.max(20, w - padX * 2);
    const plotH = Math.max(20, h - padY * 2);

    ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(148, 163, 184, 0.1)';
    ctx.lineWidth = 1 * dpr;
    for (const frac of [0.25, 0.5, 0.75]) {
      const y = Math.round(padY + frac * plotH) + 0.5;
      ctx.beginPath();
      ctx.moveTo(padX, y);
      ctx.lineTo(padX + plotW, y);
      ctx.stroke();
    }

    const drawEnv = (env: Float32Array, stroke: string, dashed = false) => {
      ctx.save();
      if (dashed) ctx.setLineDash([4 * dpr, 3 * dpr]);
      ctx.beginPath();
      for (let i = 0; i < env.length; i++) {
        const x = padX + (i / (env.length - 1)) * plotW;
        const y = padY + (1 - env[i]) * plotH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2 * dpr;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();
    };

    drawEnv(result.profile.sampleEnvelope, isLight ? '#D97706' : '#F59E0B', false);
    drawEnv(result.synthEnvelope, isLight ? '#0891B2' : '#06B6D4', true);
  }, [result, theme]);

  // Pointer drag handlers for interactive trim handles
  const updateTrimFromClientX = (clientX: number, handle: 'start' | 'end') => {
    const canvas = waveCanvasRef.current;
    if (!canvas || !audioBuffer) return;
    const rect = canvas.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    const sec = frac * audioBuffer.duration;
    const minGap = Math.min(0.1, audioBuffer.duration * 0.2);

    let nextStart = trimStartSec;
    let nextEnd = trimEndSec;
    if (handle === 'start') {
      nextStart = Math.max(0, Math.min(trimEndSec - minGap, sec));
      setTrimStartSec(nextStart);
    } else {
      nextEnd = Math.min(audioBuffer.duration, Math.max(trimStartSec + minGap, sec));
      setTrimEndSec(nextEnd);
    }
    scheduleTrimReanalysis(nextStart, nextEnd);
  };

  const handleWavePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!audioBuffer) return;
    const canvas = waveCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const startPx = (trimStartSec / audioBuffer.duration) * rect.width;
    const endPx = (trimEndSec / audioBuffer.duration) * rect.width;
    const handle = Math.abs(relX - startPx) <= Math.abs(relX - endPx) ? 'start' : 'end';
    dragHandleRef.current = handle;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateTrimFromClientX(e.clientX, handle);
  };

  const handleWavePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragHandleRef.current) return;
    updateTrimFromClientX(e.clientX, dragHandleRef.current);
  };

  const handleWavePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragHandleRef.current) {
      dragHandleRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  // Playback helpers
  const playTrimmedOriginal = useCallback(
    async (onEnded?: () => void) => {
      if (!audioBuffer) return;
      const ctx = getDecodeContext();
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => undefined);
      }
      if (activeSampleSrcRef.current) {
        try {
          activeSampleSrcRef.current.stop();
          activeSampleSrcRef.current.disconnect();
        } catch {
          // ignore
        }
      }
      const span = Math.max(0.05, trimEndSec - trimStartSec);
      const src = ctx.createBufferSource();
      src.buffer = audioBuffer;
      const fadeGain = ctx.createGain();
      const now = ctx.currentTime;
      fadeGain.gain.setValueAtTime(0.001, now);
      fadeGain.gain.linearRampToValueAtTime(0.95, now + 0.008);
      fadeGain.gain.setValueAtTime(0.95, now + Math.max(0.01, span - 0.015));
      fadeGain.gain.linearRampToValueAtTime(0.001, now + span);
      src.connect(fadeGain);
      fadeGain.connect(ctx.destination);
      activeSampleSrcRef.current = src;

      const startWall = performance.now();
      const tick = () => {
        const elapsed = (performance.now() - startWall) / 1000;
        if (elapsed >= span) {
          setPlayheadSec(null);
          return;
        }
        setPlayheadSec(trimStartSec + elapsed);
        playheadRafRef.current = requestAnimationFrame(tick);
      };
      if (playheadRafRef.current) cancelAnimationFrame(playheadRafRef.current);
      playheadRafRef.current = requestAnimationFrame(tick);

      src.onended = () => {
        if (activeSampleSrcRef.current === src) {
          activeSampleSrcRef.current = null;
          setPlayheadSec(null);
          onEnded?.();
        }
      };
      src.start(now, trimStartSec, span);
    },
    [audioBuffer, getDecodeContext, trimEndSec, trimStartSec]
  );

  const playReconstructedSynth = useCallback(
    async (midi: number, holdMs: number, onEnded?: () => void) => {
      if (!result) return;
      const eng = getPreviewEngine();
      await eng.init();
      eng.loadPatch(result.patch);
      await eng.noteOn(midi, 104);
      const offTid = window.setTimeout(() => {
        eng.noteOff(midi);
        const doneTid = window.setTimeout(() => {
          onEnded?.();
        }, 280);
        abTimersRef.current.push(doneTid);
      }, holdMs);
      abTimersRef.current.push(offTid);
    },
    [getPreviewEngine, result]
  );

  const handlePlayOriginal = () => {
    stopAllAudition();
    setAuditionMode('original');
    void playTrimmedOriginal(() => {
      setAuditionMode('idle');
    });
  };

  const handlePlaySynth = () => {
    if (!result) return;
    stopAllAudition();
    setAuditionMode('synth');
    const holdMs = Math.round(
      Math.max(320, Math.min(1800, (trimEndSec - trimStartSec) * 780))
    );
    void playReconstructedSynth(result.profile.midiNote, holdMs, () => {
      setAuditionMode('idle');
    });
  };

  const handlePlayAbCompare = () => {
    if (!result || !audioBuffer) return;
    stopAllAudition();
    setAuditionMode('ab');
    setAbPhase('A');
    const sampleSpanMs = Math.round(Math.max(300, Math.min(2200, (trimEndSec - trimStartSec) * 1000)));
    const synthHoldMs = Math.round(Math.max(350, Math.min(1600, sampleSpanMs * 0.72)));

    const runCycle = () => {
      setAbPhase('A');
      void playTrimmedOriginal(() => {
        const gap1 = window.setTimeout(() => {
          setAbPhase('B');
          void playReconstructedSynth(result.profile.midiNote, synthHoldMs, () => {
            const gap2 = window.setTimeout(() => {
              runCycle();
            }, 340);
            abTimersRef.current.push(gap2);
          });
        }, 240);
        abTimersRef.current.push(gap1);
      });
    };

    runCycle();
  };

  const handleAutoIsolate = () => {
    if (!audioBuffer) return;
    stopAllAudition();
    const { startSec, endSec } = autoIsolateNoteBounds(audioBuffer);
    setTrimStartSec(startSec);
    setTrimEndSec(endSec);
    void runReconstruction(audioBuffer, startSec, endSec, patchName, archetype);
  };

  const handleArchetypeChange = (nextArch: SynthesisArchetype) => {
    setArchetype(nextArch);
    if (audioBuffer) {
      void runReconstruction(audioBuffer, trimStartSec, trimEndSec, patchName, nextArch);
    }
  };

  const handleQuickPitchDown = async (midi: number) => {
    if (!result) return;
    const eng = getPreviewEngine();
    await eng.init();
    eng.loadPatch(result.patch);
    setHeldPitchMidi(midi);
    await eng.noteOn(midi, 102);
  };

  const handleQuickPitchUp = (midi: number) => {
    previewEngineRef.current?.noteOff(midi);
    setHeldPitchMidi((prev) => (prev === midi ? null : prev));
  };

  const buildNamedPatch = (): SynthPatch | null => {
    if (!result) return null;
    const cleanName = patchName.trim() || result.patch.name;
    return {
      ...result.patch,
      name: cleanName,
      updatedAt: new Date().toISOString(),
    };
  };

  const handleLoadIntoPatchbay = () => {
    const p = buildNamedPatch();
    if (!p) return;
    stopAllAudition();
    onApplyPatch(p);
    onClose();
  };

  const handleSaveAndLoad = () => {
    const p = buildNamedPatch();
    if (!p) return;
    stopAllAudition();
    onSaveAndApplyPatch(p, p.name);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/55 dark:bg-black/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-5">
      <div className="w-full max-w-6xl h-[92vh] bg-[#F4F6FA] dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 rounded-xl overflow-hidden shadow-2xl flex flex-col">
        {/* Modal Header */}
        <div className="px-5 py-3.5 bg-white dark:bg-[#111622] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
              Audio Sample Analyzer & Patch Reconstructor
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 truncate">
              Upload an instrument recording or capture via microphone to extract pitch, ADSR, formants, and harmonics offline.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              stopAllAudition();
              stopMicCapture();
              onClose();
            }}
            aria-label="Close analyzer modal"
            className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-md transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Main 2-Column Workspace */}
        <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          {/* Left Column: Capture & Interactive Note Trimmer */}
          <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111622] p-4 sm:p-5 flex flex-col gap-4 lg:overflow-y-auto">
            {/* Drag-and-Drop & Microphone Capture */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              className={`rounded-lg border border-dashed p-4 transition-colors ${
                isDragOver
                  ? 'border-amber-500 bg-amber-500/10'
                  : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {audioBuffer ? sourceLabel : 'Drop an audio sample here'}
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400">
                    {audioBuffer
                      ? `${audioBuffer.duration.toFixed(2)}s · ${audioBuffer.sampleRate} Hz · ${audioBuffer.numberOfChannels} ch`
                      : 'WAV, MP3, OGG, FLAC, M4A, or WebM (single sustained or plucked note works best)'}
                  </div>
                </div>
                <AudioLines className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-semibold bg-white dark:bg-[#161D2E] border border-slate-300 dark:border-slate-700 hover:border-amber-500 text-slate-800 dark:text-slate-100 rounded-md transition-colors whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>{audioBuffer ? 'Replace File' : 'Browse Audio'}</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a,.webm,.aac"
                  onChange={handleFileInput}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => void handleToggleMic()}
                  disabled={micState === 'requesting'}
                  className={`inline-flex items-center gap-1.5 h-9 px-3 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap ${
                    micState === 'recording'
                      ? 'bg-rose-600 border-rose-500 text-white hover:bg-rose-500'
                      : 'bg-white dark:bg-[#161D2E] border-slate-300 dark:border-slate-700 hover:border-cyan-500 text-slate-800 dark:text-slate-100'
                  }`}
                >
                  {micState === 'recording' ? (
                    <>
                      <Square className="w-3 h-3 fill-current" />
                      <span className="font-mono tabular-nums">
                        Stop ({micElapsedSec.toFixed(1)}s)
                      </span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                      <span>{micState === 'requesting' ? 'Opening Mic...' : 'Record Mic'}</span>
                    </>
                  )}
                </button>
              </div>

              {/* Microphone Source & Audio Output Target Selectors */}
              <div className="mt-2.5 space-y-2">
                <div className="flex items-center gap-1.5">
                  <label
                    htmlFor="sample-mic-source"
                    className="w-[74px] text-[11px] font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap shrink-0"
                  >
                    Mic Source
                  </label>
                  <select
                    id="sample-mic-source"
                    value={selectedMicId}
                    onChange={(e) => setSelectedMicId(e.target.value)}
                    disabled={micState !== 'idle'}
                    className="flex-1 min-w-0 h-8 px-2 text-[11px] bg-white dark:bg-[#161D2E] border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500 disabled:opacity-50 truncate"
                  >
                    <option value="default">System Default Microphone</option>
                    {micDevices.map((dev) => (
                      <option key={dev.deviceId} value={dev.deviceId}>
                        {dev.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void refreshAudioDevices(true)}
                    disabled={micState !== 'idle' || devicesRefreshing}
                    title="Detect or refresh audio input & output devices"
                    aria-label="Refresh audio device list"
                    className="h-8 w-8 shrink-0 inline-flex items-center justify-center bg-white dark:bg-[#161D2E] border border-slate-300 dark:border-slate-700 hover:border-cyan-500 text-slate-700 dark:text-slate-200 rounded-md transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${devicesRefreshing ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <label
                    htmlFor="sample-audio-target"
                    className="w-[74px] inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap shrink-0"
                  >
                    <Volume2 className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>Audio Out</span>
                  </label>
                  <select
                    id="sample-audio-target"
                    value={effectiveOutputSupported ? effectiveOutputId : 'default'}
                    onChange={(e) => void handleOutputTargetChange(e.target.value)}
                    disabled={!effectiveOutputSupported}
                    title={
                      effectiveOutputSupported
                        ? 'Select speaker, headphone, or audio interface for A/B preview'
                        : 'Audio output device selection is not supported in this browser'
                    }
                    className="flex-1 min-w-0 h-8 px-2 text-[11px] bg-white dark:bg-[#161D2E] border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500 disabled:opacity-50 truncate"
                  >
                    <option value="default">
                      {effectiveOutputSupported
                        ? 'System Default Output'
                        : 'System Default Output (Routing unsupported)'}
                    </option>
                    {effectiveOutputSupported &&
                      effectiveOutputDevices.map((dev) => (
                        <option key={dev.deviceId} value={dev.deviceId}>
                          {dev.label}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {micState === 'recording' && (
                <div className="mt-3 space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-rose-600 dark:text-rose-400">
                    <span>Recording live input (max 8.0s)</span>
                    <span>{Math.round(micLevel * 100)}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-rose-500 transition-[width] duration-75"
                      style={{ width: `${Math.round(micLevel * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {errorMsg && (
              <div className="p-3 rounded-md bg-rose-500/10 border border-rose-500/40 text-xs text-rose-700 dark:text-rose-300">
                {errorMsg}
              </div>
            )}

            {/* Interactive Waveform Trimmer */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Note Trimmer
                </span>
                {audioBuffer && (
                  <span className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    {formatSecMs(trimStartSec)} – {formatSecMs(trimEndSec)} ·{' '}
                    <span className="text-amber-700 dark:text-amber-400">
                      {formatDurationMs(trimEndSec - trimStartSec)}
                    </span>
                  </span>
                )}
              </div>

              <div className="relative h-32 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#07090E] overflow-hidden">
                {audioBuffer ? (
                  <canvas
                    ref={waveCanvasRef}
                    onPointerDown={handleWavePointerDown}
                    onPointerMove={handleWavePointerMove}
                    onPointerUp={handleWavePointerUp}
                    onPointerCancel={handleWavePointerUp}
                    className="w-full h-full block cursor-ew-resize touch-none"
                  />
                ) : (
                  <div className="h-full flex items-center justify-center px-4 text-center text-xs text-slate-500 dark:text-slate-400">
                    Load an audio file or record an instrument note to inspect and trim the transient.
                  </div>
                )}
              </div>

              {audioBuffer && (
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleAutoIsolate}
                    className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium bg-slate-100 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 hover:border-amber-500 text-slate-800 dark:text-slate-200 rounded-md transition-colors whitespace-nowrap"
                  >
                    <Scissors className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    <span>Auto-Isolate Note</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void runReconstruction(
                        audioBuffer,
                        trimStartSec,
                        trimEndSec,
                        patchName,
                        archetype
                      )
                    }
                    disabled={analyzing}
                    className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium bg-slate-100 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 hover:border-cyan-500 text-slate-800 dark:text-slate-200 rounded-md transition-colors whitespace-nowrap disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 ${analyzing ? 'animate-spin' : ''}`} />
                    <span>Re-Analyze</span>
                  </button>
                </div>
              )}
            </div>

            {/* Synthesis Model Override & Patch Name */}
            <div className="space-y-3 pt-1 border-t border-slate-200 dark:border-slate-800">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Synthesis Topology
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {ARCHETYPE_OPTIONS.map((opt) => {
                    const isSelected = archetype === opt.id;
                    const isDetected =
                      archetype === 'auto' && result?.archetypeUsed === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleArchetypeChange(opt.id)}
                        className={`h-8 px-2 text-[11px] font-medium rounded border transition-colors whitespace-nowrap truncate ${
                          isSelected
                            ? 'bg-cyan-600 dark:bg-cyan-500 border-cyan-600 dark:border-cyan-400 text-white dark:text-slate-950 font-semibold'
                            : isDetected
                              ? 'bg-cyan-500/12 border-cyan-500/50 text-cyan-800 dark:text-cyan-300'
                              : 'bg-slate-50 dark:bg-[#0B0F17] border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="matched-patch-name"
                  className="block text-xs font-semibold text-slate-800 dark:text-slate-200"
                >
                  Reconstructed Patch Name
                </label>
                <input
                  id="matched-patch-name"
                  type="text"
                  value={patchName}
                  onChange={(e) => setPatchName(e.target.value)}
                  placeholder="Matched Instrument"
                  className="w-full h-9 px-3 text-xs bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Right Column: A/B Auditioning, Spectrum & Envelope Comparison, Telemetry */}
          <div className="lg:col-span-7 p-4 sm:p-5 flex flex-col gap-4 lg:overflow-y-auto">
            {!result ? (
              <div className="flex-1 min-h-[320px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111622] flex flex-col items-center justify-center p-8 text-center">
                <Wand2 className="w-8 h-8 text-amber-600 dark:text-amber-400 mb-3" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {analyzing ? 'Extracting Acoustic Fingerprint...' : 'Ready to Analyze an Instrument Sample'}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mt-1.5 leading-relaxed">
                  {analyzing
                    ? 'Measuring fundamental pitch, ADSR contour, harmonic profile, body resonances, and calibrating the modular patch offline.'
                    : 'Upload a short recording or record a note with your microphone on the left. Timbre Lab will reconstruct a playable modular synth patch and plot the matched spectrum.'}
                </p>
              </div>
            ) : (
              <>
                {/* A/B Audition & Pitch Verification Bar */}
                <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-lg p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={handlePlayOriginal}
                        className={`inline-flex items-center gap-1.5 h-9 px-3 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap ${
                          auditionMode === 'original' || (auditionMode === 'ab' && abPhase === 'A')
                            ? 'bg-amber-500 border-amber-500 text-slate-950'
                            : 'bg-slate-50 dark:bg-[#0B0F17] border-slate-300 dark:border-slate-700 hover:border-amber-500 text-slate-800 dark:text-slate-100'
                        }`}
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Play Original (A)</span>
                      </button>

                      <button
                        type="button"
                        onClick={handlePlaySynth}
                        className={`inline-flex items-center gap-1.5 h-9 px-3 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap ${
                          auditionMode === 'synth' || (auditionMode === 'ab' && abPhase === 'B')
                            ? 'bg-cyan-600 dark:bg-cyan-500 border-cyan-600 dark:border-cyan-400 text-white dark:text-slate-950'
                            : 'bg-slate-50 dark:bg-[#0B0F17] border-slate-300 dark:border-slate-700 hover:border-cyan-500 text-slate-800 dark:text-slate-100'
                        }`}
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Play Synth (B · {result.profile.noteName})</span>
                      </button>

                      <button
                        type="button"
                        onClick={
                          auditionMode === 'ab' ? stopAllAudition : handlePlayAbCompare
                        }
                        className={`inline-flex items-center gap-1.5 h-9 px-3 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap ${
                          auditionMode === 'ab'
                            ? 'bg-slate-900 dark:bg-slate-100 border-slate-900 dark:border-slate-100 text-white dark:text-slate-950'
                            : 'bg-slate-50 dark:bg-[#0B0F17] border-slate-300 dark:border-slate-700 hover:border-slate-500 text-slate-800 dark:text-slate-100'
                        }`}
                      >
                        {auditionMode === 'ab' ? (
                          <Pause className="w-3.5 h-3.5" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {auditionMode === 'ab' ? `Looping A/B (${abPhase})` : 'A/B Compare'}
                        </span>
                      </button>

                      {auditionMode !== 'idle' && (
                        <button
                          type="button"
                          onClick={stopAllAudition}
                          aria-label="Stop playback"
                          className="h-9 px-2.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-md inline-flex items-center gap-1"
                        >
                          <Square className="w-3 h-3 fill-current" />
                          <span>Stop</span>
                        </button>
                      )}
                    </div>

                    <span className="text-xs font-mono tabular-nums text-cyan-700 dark:text-cyan-400 font-semibold whitespace-nowrap">
                      Spectral Fit {result.matchScorePct}%
                    </span>
                  </div>

                  {/* Quick Multi-Pitch Audition Strip */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-200/80 dark:border-slate-800/80">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 mr-1 whitespace-nowrap">
                      Hold to test synth pitch:
                    </span>
                    {[-12, -5, 0, 4, 7, 12].map((offset) => {
                      const testMidi = Math.max(
                        24,
                        Math.min(96, result.profile.midiNote + offset)
                      );
                      const isHeld = heldPitchMidi === testMidi;
                      return (
                        <button
                          key={offset}
                          type="button"
                          onPointerDown={() => void handleQuickPitchDown(testMidi)}
                          onPointerUp={() => handleQuickPitchUp(testMidi)}
                          onPointerLeave={() => handleQuickPitchUp(testMidi)}
                          onPointerCancel={() => handleQuickPitchUp(testMidi)}
                          className={`h-7 px-2 text-[11px] font-mono tabular-nums rounded border transition-colors whitespace-nowrap select-none ${
                            isHeld
                              ? 'bg-cyan-600 dark:bg-cyan-500 border-cyan-500 text-white dark:text-slate-950'
                              : 'bg-slate-50 dark:bg-[#0B0F17] border-slate-300 dark:border-slate-700 hover:border-cyan-500 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {midiToNoteLabel(testMidi)}
                          {offset === 0 ? ' (Root)' : ''}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Spectrum & Envelope Comparison Plots */}
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
                  <div className="xl:col-span-8 bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        FFT Magnitude Spectrum (45 Hz – 14 kHz)
                      </span>
                      <div className="flex items-center gap-3 font-mono text-[11px] shrink-0">
                        <span className="text-amber-700 dark:text-amber-400">
                          — Original
                        </span>
                        <span className="text-cyan-700 dark:text-cyan-400">
                          — Synth
                        </span>
                      </div>
                    </div>
                    <div className="h-44 relative">
                      <canvas
                        ref={specCanvasRef}
                        onPointerMove={(e) => {
                          const r = e.currentTarget.getBoundingClientRect();
                          specPointerRef.current = {
                            x: e.clientX - r.left,
                            y: e.clientY - r.top,
                          };
                          setSpecHoverTick((t) => (t + 1) % 10000);
                        }}
                        onPointerLeave={() => {
                          specPointerRef.current = null;
                          setSpecHoverTick((t) => (t + 1) % 10000);
                        }}
                        className="w-full h-full block cursor-crosshair"
                      />
                    </div>
                  </div>

                  <div className="xl:col-span-4 bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden flex flex-col">
                    <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        ADSR Contour
                      </span>
                      <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                        RMS vs Synth
                      </span>
                    </div>
                    <div className="h-44 relative">
                      <canvas ref={envCanvasRef} className="w-full h-full block" />
                    </div>
                  </div>
                </div>

                {/* Tabular Acoustic Telemetry Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Detected Pitch
                    </div>
                    <div className="text-sm font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                      {result.profile.fundamentalHz.toFixed(1)} Hz · {result.profile.noteName}
                    </div>
                  </div>

                  <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Attack / Decay
                    </div>
                    <div className="text-sm font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                      {formatDurationMs(result.profile.attackSec)} / {formatDurationMs(result.profile.decaySec)}
                    </div>
                  </div>

                  <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Sustain / Release
                    </div>
                    <div className="text-sm font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                      {Math.round(result.profile.sustainLevel * 100)}% / {formatDurationMs(result.profile.releaseSec)}
                    </div>
                  </div>

                  <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Spectral Centroid
                    </div>
                    <div className="text-sm font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                      {formatHz(result.profile.spectralCentroidHz)}
                    </div>
                  </div>

                  <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Body Formants
                    </div>
                    <div className="text-sm font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5 truncate">
                      {formatHz(result.profile.formants[0].freqHz)} · {formatHz(result.profile.formants[1].freqHz)}
                    </div>
                  </div>

                  <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Synthesis Model
                    </div>
                    <div className="text-sm font-semibold text-cyan-700 dark:text-cyan-400 mt-0.5 truncate">
                      {archetypeLabel(result.archetypeUsed)}
                    </div>
                  </div>
                </div>

                {/* Patch Architecture Explanation */}
                <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      Reconstructed Modular Signal Chain
                    </span>
                    <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                      {result.patch.nodes.length} modules · {result.patch.connections.length} cables
                    </span>
                  </div>
                  <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                    {result.summaryNotes.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 bg-white dark:bg-[#111622] border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap shrink-0">
          <div className="text-xs text-slate-600 dark:text-slate-400">
            {analyzing
              ? 'Calibrating EQ and filter parameters offline...'
              : result
                ? `Ready · ${result.patch.nodes.length} modules synthesized for ${result.profile.noteName}`
                : 'Pure browser DSP · audio stays on your device'}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                stopAllAudition();
                stopMicCapture();
                onClose();
              }}
              className="h-9 px-3.5 text-xs font-medium bg-slate-100 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 hover:border-slate-400 text-slate-700 dark:text-slate-300 rounded-md transition-colors whitespace-nowrap"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={!result || analyzing}
              onClick={handleSaveAndLoad}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 rounded-md transition-colors disabled:opacity-40 whitespace-nowrap"
            >
              <BookmarkPlus className="w-3.5 h-3.5" />
              <span>Save & Load</span>
            </button>

            <button
              type="button"
              disabled={!result || analyzing}
              onClick={handleLoadIntoPatchbay}
              className="inline-flex items-center gap-1.5 h-9 px-4 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md transition-colors disabled:opacity-40 whitespace-nowrap"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Load into Patchbay</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
