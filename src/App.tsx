import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SlidersHorizontal,
  Piano,
  PanelLeft,
  PanelRight,
  PanelLeftOpen,
  PanelRightOpen,
  Square,
  Play,
  Sun,
  Moon,
  RotateCcw,
  VolumeX,
} from 'lucide-react';
import { ETHNIC_PRESETS } from './data/ethnicPresets';
import { AMBIENT_PRESETS } from './data/ambientPresets';
import { GM_PRESETS } from './data/gmPresets';
import { TEST_TUNES } from './data/testTunes';
import { MidiController, MidiControllerState } from './engine/MidiController';
import { AutoLayoutMode, computeAutoLayout } from './engine/autoLayout';
import { createDefaultNode, MODULE_REGISTRY } from './engine/moduleRegistry';
import { arePatchesEquivalent } from './engine/modulationSummary';
import { SynthEngine } from './engine/SynthEngine';
import { TunePlaybackState, TunePlayer } from './engine/TunePlayer';
import {
  MidiActivityEvent,
  ModMatrixSlot,
  ModuleType,
  PresetCategory,
  SynthConnection,
  SynthPatch,
  TuneSequence,
} from './engine/types';
import { AboutPage } from './components/AboutPage';
import { EmbedApiModal } from './components/EmbedApiModal';
import { GuidePage } from './components/GuidePage';
import { HeaderBar, StudioView } from './components/HeaderBar';
import { MacroXYPad } from './components/MacroXYPad';
import { MidiAndTransportBar } from './components/MidiAndTransportBar';
import { MidiSetupModal } from './components/MidiSetupModal';
import { ModMatrixPanel } from './components/ModMatrixPanel';
import { NodeInspector } from './components/NodeInspector';
import { PatchbayCanvas } from './components/PatchbayCanvas';
import { PlayableKeyboard } from './components/PlayableKeyboard';
import { PresetLibraryDrawer } from './components/PresetLibraryDrawer';
import { SampleAnalyzerModal } from './components/SampleAnalyzerModal';
import { WaveformScopes } from './components/WaveformScopes';

const SAVED_STORAGE_KEY = 'timbre_lab_custom_presets_v1';
const THEME_STORAGE_KEY = 'timbre_lab_theme';
const DOCK_TAB_STORAGE_KEY = 'timbre_lab_dock_tab_v1';
const FAVORITES_STORAGE_KEY = 'timbre_lab_favorites_v1';
const SHOW_ALL_PARAMS_STORAGE_KEY = 'timbre_lab_show_all_params_v1';
const ONBOARDING_DISMISSED_KEY = 'timbre_lab_onboarding_dismissed_v1';

type DockTab = 'keysXy' | 'scopesTransport' | 'split' | 'collapsed';

function clonePatch(p: SynthPatch): SynthPatch {
  return JSON.parse(JSON.stringify(p)) as SynthPatch;
}

function sanitizePatch(raw: unknown, strictTypes = false): { patch: SynthPatch | null; error?: string } {
  if (!raw || typeof raw !== 'object') {
    return { patch: null, error: 'Patch JSON must be an object.' };
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.nodes) || !Array.isArray(obj.connections)) {
    return { patch: null, error: 'JSON must include valid "nodes" and "connections" arrays.' };
  }

  const validNodes: SynthPatch['nodes'] = [];
  const nodeIds = new Set<string>();

  for (let i = 0; i < obj.nodes.length; i++) {
    const rawNode = obj.nodes[i];
    if (!rawNode || typeof rawNode !== 'object') {
      if (strictTypes) return { patch: null, error: `Invalid node object at index ${i}.` };
      continue;
    }
    const n = rawNode as Record<string, unknown>;
    const id = typeof n.id === 'string' && n.id.trim().length > 0 ? n.id.trim() : '';
    const type = typeof n.type === 'string' ? n.type : '';
    if (!id || !(type in MODULE_REGISTRY)) {
      if (strictTypes) {
        return { patch: null, error: `Unsupported or invalid module "${type || 'unknown'}" at node index ${i}.` };
      }
      continue;
    }
    const modType = type as ModuleType;
    const def = MODULE_REGISTRY[modType];
    const rawPos = (n.position && typeof n.position === 'object' ? n.position : {}) as Record<string, unknown>;
    const x = typeof rawPos.x === 'number' && Number.isFinite(rawPos.x) ? rawPos.x : 60 + i * 48;
    const y = typeof rawPos.y === 'number' && Number.isFinite(rawPos.y) ? rawPos.y : 64 + (i % 3) * 180;
    const baseNode = createDefaultNode(modType, id, { x, y });
    const rawParams = (n.params && typeof n.params === 'object' ? n.params : {}) as Record<
      string,
      number | string | boolean
    >;
    nodeIds.add(id);
    validNodes.push({
      ...baseNode,
      label: typeof n.label === 'string' && n.label.trim() ? n.label : def.label,
      params: { ...baseNode.params, ...rawParams },
      bypassed: Boolean(n.bypassed),
    });
  }

  if (validNodes.length === 0) {
    return { patch: null, error: 'Patch must contain at least one valid module node.' };
  }

  const validConnections: SynthConnection[] = obj.connections
    .filter((rawConn): rawConn is Record<string, unknown> => Boolean(rawConn && typeof rawConn === 'object'))
    .filter(
      (c) =>
        typeof c.fromNode === 'string' &&
        nodeIds.has(c.fromNode) &&
        typeof c.toNode === 'string' &&
        nodeIds.has(c.toNode) &&
        typeof c.fromPort === 'string' &&
        typeof c.toPort === 'string'
    )
    .map((c, idx) => ({
      id: typeof c.id === 'string' && c.id ? c.id : `conn_${idx}_${Date.now().toString(36)}`,
      fromNode: String(c.fromNode),
      fromPort: String(c.fromPort),
      toNode: String(c.toNode),
      toPort: String(c.toPort),
      amount: typeof c.amount === 'number' && Number.isFinite(c.amount) ? c.amount : 1,
    }));

  const validModMatrix: ModMatrixSlot[] | undefined = Array.isArray(obj.modMatrix)
    ? obj.modMatrix
        .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === 'object'))
        .filter(
          (s) =>
            typeof s.targetNodeId === 'string' &&
            nodeIds.has(s.targetNodeId) &&
            typeof s.targetParam === 'string' &&
            typeof s.source === 'string'
        )
        .map((s, idx) => ({
          id: typeof s.id === 'string' && s.id ? s.id : `mod_${idx}_${Date.now().toString(36)}`,
          enabled: s.enabled !== false,
          source: String(s.source),
          via: typeof s.via === 'string' ? s.via : 'none',
          targetNodeId: String(s.targetNodeId),
          targetParam: String(s.targetParam),
          amount: typeof s.amount === 'number' && Number.isFinite(s.amount) ? s.amount : 0.25,
          curve: s.curve === 'exp' || s.curve === 'scurve' ? s.curve : 'linear',
          label: typeof s.label === 'string' ? s.label : undefined,
        }))
    : undefined;

  const polyphonyRaw = Number(obj.polyphony);
  const glideRaw = Number(obj.glideMs);
  const rawCategory = typeof obj.category === 'string' ? obj.category : 'custom';
  const safeCategory: PresetCategory =
    rawCategory === 'ethnic' ||
    rawCategory === 'ambient' ||
    rawCategory.startsWith('gm-')
      ? (rawCategory as PresetCategory)
      : 'custom';
  const rawMacroLabels =
    obj.macroLabels && typeof obj.macroLabels === 'object'
      ? (obj.macroLabels as Record<string, unknown>)
      : null;
  const rawMacroDefaults =
    obj.macroDefaults && typeof obj.macroDefaults === 'object'
      ? (obj.macroDefaults as Record<string, unknown>)
      : null;
  const patch: SynthPatch = {
    schemaVersion: '1.0',
    id: typeof obj.id === 'string' && obj.id ? obj.id : `imported-${Date.now().toString(36)}`,
    name: typeof obj.name === 'string' && obj.name ? obj.name : 'Imported Patch',
    category: safeCategory,
    regionOrFamily: typeof obj.regionOrFamily === 'string' ? obj.regionOrFamily : 'Imported JSON Patch',
    description: typeof obj.description === 'string' ? obj.description : '',
    tags: Array.isArray(obj.tags) ? obj.tags.filter((t): t is string => typeof t === 'string') : ['imported'],
    gmProgram: typeof obj.gmProgram === 'number' ? obj.gmProgram : undefined,
    polyphony: Number.isFinite(polyphonyRaw) ? Math.max(1, Math.min(16, Math.round(polyphonyRaw))) : 8,
    glideMs: Number.isFinite(glideRaw) ? Math.max(0, glideRaw) : 0,
    macroLabels:
      rawMacroLabels &&
      typeof rawMacroLabels.x === 'string' &&
      typeof rawMacroLabels.y === 'string'
        ? { x: rawMacroLabels.x, y: rawMacroLabels.y }
        : undefined,
    macroDefaults:
      rawMacroDefaults &&
      typeof rawMacroDefaults.x === 'number' &&
      typeof rawMacroDefaults.y === 'number'
        ? {
            x: Math.max(0, Math.min(1, rawMacroDefaults.x)),
            y: Math.max(0, Math.min(1, rawMacroDefaults.y)),
          }
        : undefined,
    nodes: validNodes,
    connections: validConnections,
    modMatrix: validModMatrix,
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : undefined,
  };

  return { patch };
}

type MobileTab = 'patchbay' | 'modMatrix' | 'presets' | 'inspector' | 'scopes' | 'guide' | 'about';

export default function App() {
  const engineRef = useRef<SynthEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new SynthEngine();
  }
  const engine = engineRef.current;

  const tunePlayerRef = useRef<TunePlayer | null>(null);
  if (!tunePlayerRef.current) {
    tunePlayerRef.current = new TunePlayer(engine);
  }
  const tunePlayer = tunePlayerRef.current;

  const midiControllerRef = useRef<MidiController | null>(null);
  if (!midiControllerRef.current) {
    midiControllerRef.current = new MidiController(engine);
  }
  const midiController = midiControllerRef.current;

  const [patch, setPatch] = useState<SynthPatch>(() => clonePatch(ETHNIC_PRESETS[0]));
  const [baselinePatch, setBaselinePatch] = useState<SynthPatch>(() =>
    clonePatch(ETHNIC_PRESETS[0])
  );
  const [history, setHistory] = useState<{ past: SynthPatch[]; future: SynthPatch[] }>({
    past: [],
    future: [],
  });
  const patchRef = useRef<SynthPatch>(patch);
  patchRef.current = patch;
  const historyRef = useRef(history);
  historyRef.current = history;
  const gestureSnapshotRef = useRef<SynthPatch | null>(null);

  const [savedPresets, setSavedPresets] = useState<SynthPatch[]>(() => {
    try {
      const raw = localStorage.getItem(SAVED_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((item) => sanitizePatch(item, false).patch)
        .filter((p): p is SynthPatch => p !== null);
    } catch {
      return [];
    }
  });

  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === 'string')
        : [];
    } catch {
      return [];
    }
  });

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    () => ETHNIC_PRESETS[0].nodes[0]?.id || null
  );
  const [selectedConnId, setSelectedConnId] = useState<string | null>(null);
  const [focusedModNodeId, setFocusedModNodeId] = useState<string | null>(null);
  const [activeNotes, setActiveNotes] = useState<number[]>([]);
  const [activeView, setActiveView] = useState<StudioView>('patchbay');
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(true);
  const [rightInspectorOpen, setRightInspectorOpen] = useState(true);
  const [mobileTab, setMobileTab] = useState<MobileTab>('patchbay');
  const [mobileKeysOpen, setMobileKeysOpen] = useState(true);
  const [dockTab, setDockTab] = useState<DockTab>(() => {
    try {
      const saved = localStorage.getItem(DOCK_TAB_STORAGE_KEY);
      if (
        saved === 'keysXy' ||
        saved === 'scopesTransport' ||
        saved === 'split' ||
        saved === 'collapsed'
      ) {
        return saved;
      }
      return 'keysXy';
    } catch {
      return 'keysXy';
    }
  });
  const [showAllParams, setShowAllParams] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SHOW_ALL_PARAMS_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    try {
      return localStorage.getItem(ONBOARDING_DISMISSED_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [fitTrigger, setFitTrigger] = useState(0);
  const [auditioningPresetId, setAuditioningPresetId] = useState<string | null>(null);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  const [tuneState, setTuneState] = useState<TunePlaybackState>(() => tunePlayer.getState());
  const [midiState, setMidiState] = useState<MidiControllerState>(() => midiController.getState());
  const [midiLog, setMidiLog] = useState<MidiActivityEvent[]>([]);
  const [macroXY, setMacroXY] = useState<{ x: number; y: number }>(
    () => ETHNIC_PRESETS[0].macroDefaults ?? { x: 0.5, y: 0.5 }
  );
  const [sampleAnalyzerOpen, setSampleAnalyzerOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState<AutoLayoutMode>('2d-flow');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [audioOutputDevices, setAudioOutputDevices] = useState<{ deviceId: string; label: string }[]>([]);
  const [selectedOutputDeviceId, setSelectedOutputDeviceId] = useState<string>('default');
  const audioOutputSupported = useMemo(() => engine.isAudioOutputSelectionSupported(), [engine]);

  const allBuiltInPresets = useMemo(
    () => [...ETHNIC_PRESETS, ...AMBIENT_PRESETS, ...GM_PRESETS],
    []
  );
  const isDirty = useMemo(
    () => !arePatchesEquivalent(patch, baselinePatch),
    [patch, baselinePatch]
  );

  const noticeTimerRef = useRef<number | null>(null);
  const auditionTimersRef = useRef<number[]>([]);

  const clearAuditionTimers = useCallback(() => {
    for (const tid of auditionTimersRef.current) {
      window.clearTimeout(tid);
    }
    auditionTimersRef.current = [];
  }, []);

  const showNotice = useCallback((msg: string) => {
    setStatusNotice(msg);
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => {
      noticeTimerRef.current = null;
      setStatusNotice(null);
    }, 2600);
  }, []);

  // Keep engine synced with current patch
  useEffect(() => {
    engine.loadPatch(patch);
  }, [engine, patch]);

  // Persist dock, favorites, and disclosure preferences
  useEffect(() => {
    try {
      localStorage.setItem(DOCK_TAB_STORAGE_KEY, dockTab);
    } catch {
      // ignore storage errors
    }
  }, [dockTab]);

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteIds));
    } catch {
      // ignore storage errors
    }
  }, [favoriteIds]);

  useEffect(() => {
    try {
      localStorage.setItem(SHOW_ALL_PARAMS_STORAGE_KEY, showAllParams ? '1' : '0');
    } catch {
      // ignore storage errors
    }
  }, [showAllParams]);

  // Sync light/dark class on <html> and persist preference
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  // Pre-warm AudioContext (latencyHint: 'interactive') + AudioWorklets on first gesture
  useEffect(() => {
    const warm = () => {
      void engine.warmUp();
    };
    window.addEventListener('pointerdown', warm, { capture: true, once: true, passive: true });
    window.addEventListener('keydown', warm, { capture: true, once: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', warm, { capture: true });
      window.removeEventListener('keydown', warm, { capture: true });
    };
  }, [engine]);

  const refreshAudioOutputs = useCallback(
    async (requestPermissionIfUnnamed = false) => {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      try {
        let devices = await navigator.mediaDevices.enumerateDevices();
        let outputs = devices.filter((d) => d.kind === 'audiooutput');
        const hasUnlabeled = outputs.length === 0 || outputs.every((d) => !d.label);

        if (requestPermissionIfUnnamed && hasUnlabeled && navigator.mediaDevices.getUserMedia) {
          try {
            const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            for (const track of tempStream.getTracks()) {
              track.stop();
            }
            devices = await navigator.mediaDevices.enumerateDevices();
            outputs = devices.filter((d) => d.kind === 'audiooutput');
          } catch {
            showNotice('Audio device permission is needed to reveal device names.');
          }
        }

        const mapped = outputs
          .filter((d) => d.deviceId !== '' && d.deviceId !== 'default')
          .map((d, idx) => ({
            deviceId: d.deviceId,
            label: d.label || `Audio Output ${idx + 1}`,
          }));

        setAudioOutputDevices(mapped);
        setSelectedOutputDeviceId((prev) => {
          if (prev === 'default') return 'default';
          if (mapped.some((m) => m.deviceId === prev)) return prev;
          void engine.setOutputDevice('default');
          return 'default';
        });
      } catch {
        // ignore device enumeration errors
      }
    },
    [engine, showNotice]
  );

  const handleSelectOutputDevice = useCallback(
    async (deviceId: string) => {
      const targetId = deviceId || 'default';
      const res = await engine.setOutputDevice(targetId);
      if (res.ok) {
        setSelectedOutputDeviceId(targetId);
        const label =
          targetId === 'default'
            ? 'System Default Output'
            : audioOutputDevices.find((d) => d.deviceId === targetId)?.label || 'Selected Output';
        showNotice(`Audio output: ${label}`);
      } else {
        setSelectedOutputDeviceId(engine.getOutputDeviceId());
        showNotice(res.error || 'Unable to switch audio output device.');
      }
    },
    [audioOutputDevices, engine, showNotice]
  );

  // Initial tune, MIDI, + Audio device subscriptions
  useEffect(() => {
    tunePlayer.setTune(TEST_TUNES[0]);
    void refreshAudioOutputs(false);
    const md = navigator.mediaDevices;
    const onDeviceChange = () => {
      void refreshAudioOutputs(false);
    };
    md?.addEventListener?.('devicechange', onDeviceChange);

    const unsubNotes = engine.onActiveNotesChange(setActiveNotes);
    const unsubTune = tunePlayer.onStateChange(setTuneState);
    const unsubMidi = midiController.onStateChange(setMidiState);
    const unsubMidiLog = engine.onMidiActivity((ev) => {
      setMidiLog((prev) => [ev, ...prev.slice(0, 29)]);
    });
    const unsubPc = engine.onProgramChange((program) => {
      const target = GM_PRESETS[program];
      if (target) {
        const next = clonePatch(target);
        patchRef.current = next;
        setPatch(next);
        setBaselinePatch(clonePatch(next));
        const emptyH = { past: [], future: [] };
        historyRef.current = emptyH;
        setHistory(emptyH);
        setSelectedNodeId(next.nodes[0]?.id || null);
        setSelectedConnId(null);
        showNotice(`MIDI Program Change: ${target.name}`);
      }
    });

    return () => {
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current);
      }
      clearAuditionTimers();
      md?.removeEventListener?.('devicechange', onDeviceChange);
      tunePlayer.stop();
      unsubNotes();
      unsubTune();
      unsubMidi();
      unsubMidiLog();
      unsubPc();
    };
  }, [engine, tunePlayer, midiController, showNotice, clearAuditionTimers, refreshAudioOutputs]);

  // Persist custom presets
  useEffect(() => {
    try {
      localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(savedPresets));
    } catch {
      // ignore storage quota errors
    }
  }, [savedPresets]);

  const pushHistorySnapshot = useCallback((snapshot: SynthPatch) => {
    const cloned = clonePatch(snapshot);
    const nextHistory = {
      past: [...historyRef.current.past.slice(-49), cloned],
      future: [],
    };
    historyRef.current = nextHistory;
    setHistory(nextHistory);
  }, []);

  const applyTrackedMutation = useCallback(
    (mutator: (prev: SynthPatch) => SynthPatch | null, recordHistory = true) => {
      const current = patchRef.current;
      const next = mutator(current);
      if (!next) return;
      if (recordHistory && !arePatchesEquivalent(current, next)) {
        pushHistorySnapshot(current);
      }
      patchRef.current = next;
      setPatch(next);
    },
    [pushHistorySnapshot]
  );

  const handleStartGestureHistory = useCallback(() => {
    if (!gestureSnapshotRef.current) {
      gestureSnapshotRef.current = clonePatch(patchRef.current);
    }
  }, []);

  const handleCommitGestureHistory = useCallback(() => {
    const start = gestureSnapshotRef.current;
    gestureSnapshotRef.current = null;
    if (!start) return;
    if (!arePatchesEquivalent(start, patchRef.current)) {
      pushHistorySnapshot(start);
    }
  }, [pushHistorySnapshot]);

  const handleUndo = useCallback(() => {
    gestureSnapshotRef.current = null;
    const h = historyRef.current;
    if (h.past.length === 0) return;
    const previous = clonePatch(h.past[h.past.length - 1]);
    const currentClone = clonePatch(patchRef.current);
    const nextHistory = {
      past: h.past.slice(0, -1),
      future: [currentClone, ...h.future.slice(0, 49)],
    };
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    patchRef.current = previous;
    setPatch(previous);
    engine.loadPatch(previous);
    setSelectedNodeId((cur) =>
      cur && previous.nodes.some((n) => n.id === cur) ? cur : previous.nodes[0]?.id || null
    );
    setSelectedConnId((cur) =>
      cur && previous.connections.some((c) => c.id === cur) ? cur : null
    );
    showNotice('Undid edit');
  }, [engine, showNotice]);

  const handleRedo = useCallback(() => {
    gestureSnapshotRef.current = null;
    const h = historyRef.current;
    if (h.future.length === 0) return;
    const nextPatch = clonePatch(h.future[0]);
    const currentClone = clonePatch(patchRef.current);
    const nextHistory = {
      past: [...h.past.slice(-49), currentClone],
      future: h.future.slice(1),
    };
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    patchRef.current = nextPatch;
    setPatch(nextPatch);
    engine.loadPatch(nextPatch);
    setSelectedNodeId((cur) =>
      cur && nextPatch.nodes.some((n) => n.id === cur) ? cur : nextPatch.nodes[0]?.id || null
    );
    setSelectedConnId((cur) =>
      cur && nextPatch.connections.some((c) => c.id === cur) ? cur : null
    );
    showNotice('Redid edit');
  }, [engine, showNotice]);

  const applyPatchSelection = useCallback(
    (cloned: SynthPatch, resetBaseline = true) => {
      gestureSnapshotRef.current = null;
      const nextXY = cloned.macroDefaults ?? { x: 0.5, y: 0.5 };
      engine.setMacroXY(nextXY.x, nextXY.y);
      setMacroXY(nextXY);
      engine.loadPatch(cloned);
      patchRef.current = cloned;
      setPatch(cloned);
      if (resetBaseline) {
        setBaselinePatch(clonePatch(cloned));
        const emptyH = { past: [], future: [] };
        historyRef.current = emptyH;
        setHistory(emptyH);
      }
      setSelectedNodeId(cloned.nodes[0]?.id || null);
      setSelectedConnId(null);
      setFocusedModNodeId(null);
      setFitTrigger((v) => v + 1);
    },
    [engine]
  );

  const handleMacroXYChange = useCallback(
    (x: number, y: number) => {
      setMacroXY({ x, y });
      engine.setMacroXY(x, y);
    },
    [engine]
  );

  const handleSelectPatch = useCallback(
    (nextPatch: SynthPatch) => {
      clearAuditionTimers();
      setAuditioningPresetId(null);
      const cloned = clonePatch(nextPatch);
      applyPatchSelection(cloned, true);
      if (window.innerWidth < 1024) {
        setMobileTab('patchbay');
      }
    },
    [applyPatchSelection, clearAuditionTimers]
  );

  const handleRevertPatch = useCallback(() => {
    const reverted = clonePatch(baselinePatch);
    if (arePatchesEquivalent(patchRef.current, reverted)) return;
    pushHistorySnapshot(patchRef.current);
    const nextXY = reverted.macroDefaults ?? { x: 0.5, y: 0.5 };
    engine.setMacroXY(nextXY.x, nextXY.y);
    setMacroXY(nextXY);
    engine.loadPatch(reverted);
    patchRef.current = reverted;
    setPatch(reverted);
    setSelectedNodeId(reverted.nodes[0]?.id || null);
    setSelectedConnId(null);
    setFitTrigger((v) => v + 1);
    showNotice(`Reverted "${reverted.name}"`);
  }, [baselinePatch, engine, pushHistorySnapshot, showNotice]);

  const handleToggleFavorite = useCallback((id: string) => {
    setFavoriteIds((prev) =>
      prev.includes(id) ? prev.filter((fid) => fid !== id) : [id, ...prev]
    );
  }, []);

  const handleMoveNode = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      applyTrackedMutation(
        (prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, position } : n)),
        }),
        false
      );
    },
    [applyTrackedMutation]
  );

  const handleUpdateNodeParam = useCallback(
    (
      nodeId: string,
      key: string,
      value: number | string | boolean,
      recordHistory = true
    ) => {
      engine.updateNodeParams(nodeId, { [key]: value });
      applyTrackedMutation(
        (prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) =>
            n.id === nodeId ? { ...n, params: { ...n.params, [key]: value } } : n
          ),
        }),
        recordHistory
      );
    },
    [applyTrackedMutation, engine]
  );

  const handleAddNode = useCallback(
    (type: ModuleType, position: { x: number; y: number }) => {
      const newId = `${type}_${Date.now().toString(36)}`;
      const newNode = createDefaultNode(type, newId, position);
      applyTrackedMutation((prev) => ({
        ...prev,
        nodes: [...prev.nodes, newNode],
      }));
      setSelectedNodeId(newId);
      setSelectedConnId(null);
    },
    [applyTrackedMutation]
  );

  const handleToggleBypass = useCallback(
    (nodeId: string) => {
      applyTrackedMutation((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) =>
          n.id === nodeId ? { ...n, bypassed: !n.bypassed } : n
        ),
      }));
    },
    [applyTrackedMutation]
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      if (nodeId === 'output') return;
      applyTrackedMutation((prev) => ({
        ...prev,
        nodes: prev.nodes.filter((n) => n.id !== nodeId),
        connections: prev.connections.filter(
          (c) => c.fromNode !== nodeId && c.toNode !== nodeId
        ),
        modMatrix: prev.modMatrix
          ? prev.modMatrix
              .filter((s) => s.targetNodeId !== nodeId && s.source !== nodeId)
              .map((s) => (s.via === nodeId ? { ...s, via: 'none' } : s))
          : prev.modMatrix,
      }));
      setSelectedNodeId((cur) => (cur === nodeId ? null : cur));
      setSelectedConnId(null);
    },
    [applyTrackedMutation]
  );

  const handleDuplicateNode = useCallback(
    (nodeId: string) => {
      const orig = patchRef.current.nodes.find((n) => n.id === nodeId);
      if (!orig || orig.type === 'output') return;
      const copyId = `${orig.type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
      const cloned = clonePatch({ ...patchRef.current, nodes: [orig], connections: [] }).nodes[0];
      cloned.id = copyId;
      cloned.position = { x: orig.position.x + 36, y: orig.position.y + 36 };
      cloned.label = `${orig.label || MODULE_REGISTRY[orig.type].label} Copy`;
      applyTrackedMutation((prev) => ({
        ...prev,
        nodes: [...prev.nodes, cloned],
      }));
      setSelectedNodeId(copyId);
      setSelectedConnId(null);
    },
    [applyTrackedMutation]
  );

  const handleAddConnection = useCallback(
    (fromNode: string, fromPort: string, toNode: string, toPort: string) => {
      let blockedCycle = false;
      applyTrackedMutation((prev) => {
        const exists = prev.connections.some(
          (c) =>
            c.fromNode === fromNode &&
            c.fromPort === fromPort &&
            c.toNode === toNode &&
            c.toPort === toPort
        );
        if (exists) return null;

        const srcNodeDef = prev.nodes.find((n) => n.id === fromNode);
        const dstNodeDef = prev.nodes.find((n) => n.id === toNode);
        const srcPortSig =
          srcNodeDef && MODULE_REGISTRY[srcNodeDef.type]?.ports.find((p) => p.id === fromPort)?.signal;
        const dstPortSig =
          dstNodeDef && MODULE_REGISTRY[dstNodeDef.type]?.ports.find((p) => p.id === toPort)?.signal;
        const isAudioLink = srcPortSig === 'audio' && dstPortSig === 'audio';

        if (isAudioLink) {
          if (fromNode === toNode) {
            blockedCycle = true;
            return null;
          }
          // BFS from toNode along existing audio connections to ensure no path returns to fromNode
          const adj = new Map<string, string[]>();
          for (const c of prev.connections) {
            const cSrcNode = prev.nodes.find((n) => n.id === c.fromNode);
            const cDstNode = prev.nodes.find((n) => n.id === c.toNode);
            const cSrcSig =
              cSrcNode && MODULE_REGISTRY[cSrcNode.type]?.ports.find((p) => p.id === c.fromPort)?.signal;
            const cDstSig =
              cDstNode && MODULE_REGISTRY[cDstNode.type]?.ports.find((p) => p.id === c.toPort)?.signal;
            if (cSrcSig === 'audio' && cDstSig === 'audio') {
              const list = adj.get(c.fromNode) || [];
              list.push(c.toNode);
              adj.set(c.fromNode, list);
            }
          }
          const visited = new Set<string>([toNode]);
          const queue = [toNode];
          while (queue.length > 0) {
            const cur = queue.shift()!;
            if (cur === fromNode) {
              blockedCycle = true;
              return null;
            }
            for (const nxt of adj.get(cur) || []) {
              if (!visited.has(nxt)) {
                visited.add(nxt);
                queue.push(nxt);
              }
            }
          }
        }

        const isCv = fromPort === 'cv';
        const newConn: SynthConnection = {
          id: `conn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          fromNode,
          fromPort,
          toNode,
          toPort,
          amount: isCv ? 0.25 : 1.0,
        };
        return {
          ...prev,
          connections: [...prev.connections, newConn],
        };
      });
      if (blockedCycle) {
        showNotice('Audio feedback loop blocked to keep the synth stable.');
      }
    },
    [applyTrackedMutation, showNotice]
  );

  const handleUpdateConnectionAmount = useCallback(
    (connId: string, amount: number, recordHistory = true) => {
      applyTrackedMutation(
        (prev) => ({
          ...prev,
          connections: prev.connections.map((c) => (c.id === connId ? { ...c, amount } : c)),
        }),
        recordHistory
      );
    },
    [applyTrackedMutation]
  );

  const handleDeleteConnection = useCallback(
    (connId: string) => {
      applyTrackedMutation((prev) => ({
        ...prev,
        connections: prev.connections.filter((c) => c.id !== connId),
      }));
      setSelectedConnId((cur) => (cur === connId ? null : cur));
    },
    [applyTrackedMutation]
  );

  const handleUpdateModMatrix = useCallback(
    (slots: ModMatrixSlot[]) => {
      engine.updateModMatrixSlots(slots);
      applyTrackedMutation((prev) => ({
        ...prev,
        modMatrix: slots,
      }));
    },
    [applyTrackedMutation, engine]
  );

  const handleQuickMapMacro = useCallback(
    (nodeId: string, paramKey: string, axis: 'macroX' | 'macroY') => {
      const currentSlots = patchRef.current.modMatrix ?? [];
      const existing = currentSlots.find(
        (s) => s.source === axis && s.targetNodeId === nodeId && s.targetParam === paramKey
      );
      let nextSlots: ModMatrixSlot[];
      if (existing) {
        nextSlots = currentSlots.filter((s) => s.id !== existing.id);
        showNotice(`Removed ${axis === 'macroX' ? 'Macro X' : 'Macro Y'} link`);
      } else {
        const defaultAmt =
          paramKey === 'cutoff' || paramKey === 'tone'
            ? 0.35
            : paramKey === 'pitch'
              ? 0.08
              : 0.3;
        const newSlot: ModMatrixSlot = {
          id: `mod_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
          enabled: true,
          source: axis,
          via: 'none',
          targetNodeId: nodeId,
          targetParam: paramKey,
          amount: defaultAmt,
          curve: 'linear',
        };
        nextSlots = [...currentSlots, newSlot];
        showNotice(`Mapped ${paramKey} to ${axis === 'macroX' ? 'Macro X' : 'Macro Y'}`);
      }
      engine.updateModMatrixSlots(nextSlots);
      applyTrackedMutation((prev) => ({
        ...prev,
        modMatrix: nextSlots,
      }));
    },
    [applyTrackedMutation, engine, showNotice]
  );

  const handleInspectModulation = useCallback((nodeId: string) => {
    setFocusedModNodeId(nodeId);
    setActiveView('modMatrix');
    setMobileTab('modMatrix');
  }, []);

  const handleAutoLayout = useCallback(
    (modeOverride?: AutoLayoutMode) => {
      const targetMode = modeOverride ?? layoutMode;
      applyTrackedMutation((prev) => ({
        ...prev,
        nodes: computeAutoLayout(prev, targetMode),
      }));
    },
    [applyTrackedMutation, layoutMode]
  );

  const handleSaveCurrentPatch = useCallback(
    (name: string) => {
      const customPatch: SynthPatch = {
        ...clonePatch(patchRef.current),
        id: `custom-${Date.now().toString(36)}`,
        name,
        category: 'custom',
        regionOrFamily: 'Custom User Patch',
        updatedAt: new Date().toISOString(),
      };
      setSavedPresets((prev) => [customPatch, ...prev]);
      patchRef.current = customPatch;
      setPatch(customPatch);
      setBaselinePatch(clonePatch(customPatch));
      const emptyH = { past: [], future: [] };
      historyRef.current = emptyH;
      setHistory(emptyH);
      showNotice(`Saved "${name}" to browser library`);
    },
    [showNotice]
  );

  const handleDeleteSavedPatch = useCallback((id: string) => {
    setSavedPresets((prev) => prev.filter((p) => p.id !== id));
    setFavoriteIds((prev) => prev.filter((fid) => fid !== id));
  }, []);

  const handleImportPatchJson = useCallback(
    (jsonText: string): { ok: boolean; error?: string } => {
      try {
        const parsed = JSON.parse(jsonText) as unknown;
        const { patch: imported, error } = sanitizePatch(parsed, true);
        if (!imported) {
          return { ok: false, error: error || 'Invalid patch JSON structure.' };
        }
        imported.category = 'custom';
        applyPatchSelection(imported, true);
        setSavedPresets((prev) => [imported, ...prev.filter((p) => p.id !== imported.id)]);
        showNotice(`Loaded patch "${imported.name}"`);
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Unable to parse JSON',
        };
      }
    },
    [applyPatchSelection, showNotice]
  );

  const handleExportJson = useCallback(() => {
    const json = JSON.stringify(patchRef.current, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${patchRef.current.id || 'timbre-lab-patch'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotice(`Exported ${patchRef.current.name}.json`);
  }, [showNotice]);

  const handlePlayTune = useCallback(
    (tune: TuneSequence, loadSuggestedPreset = false) => {
      clearAuditionTimers();
      setAuditioningPresetId(null);
      if (loadSuggestedPreset && tune.suggestedPresetId) {
        const found = allBuiltInPresets.find((p) => p.id === tune.suggestedPresetId);
        if (found) {
          handleSelectPatch(found);
        }
      }
      tunePlayer.setTune(tune);
      void tunePlayer.play();
    },
    [allBuiltInPresets, clearAuditionTimers, handleSelectPatch, tunePlayer]
  );

  const handleLoadPresetById = useCallback(
    (presetId: string, openPatchbay: boolean) => {
      clearAuditionTimers();
      setAuditioningPresetId(null);
      const found = allBuiltInPresets.find((p) => p.id === presetId);
      if (!found) return;
      const cloned = clonePatch(found);
      applyPatchSelection(cloned, true);
      if (openPatchbay) {
        setActiveView('patchbay');
        setMobileTab('patchbay');
      }
      showNotice(`Loaded preset "${found.name}"`);
    },
    [allBuiltInPresets, applyPatchSelection, clearAuditionTimers, showNotice]
  );

  const handleStopAudition = useCallback(() => {
    clearAuditionTimers();
    engine.allNotesOff();
    setAuditioningPresetId(null);
  }, [clearAuditionTimers, engine]);

  const startPresetAudition = useCallback(
    (target: SynthPatch) => {
      clearAuditionTimers();
      tunePlayer.stop();
      const cloned = clonePatch(target);
      applyPatchSelection(cloned, true);
      setAuditioningPresetId(target.id);
      showNotice(`Auditioning "${target.name}" — play the keyboard below too!`);

      void (async () => {
        await engine.init();
        const phrase: { delayMs: number; midi: number; vel: number; durMs: number }[] = [
          { delayMs: 20, midi: 62, vel: 92, durMs: 420 },
          { delayMs: 460, midi: 64, vel: 98, durMs: 420 },
          { delayMs: 900, midi: 69, vel: 108, durMs: 820 },
        ];
        for (const step of phrase) {
          const onTid = window.setTimeout(() => {
            void engine.noteOn(step.midi, step.vel);
            const offTid = window.setTimeout(() => engine.noteOff(step.midi), step.durMs);
            auditionTimersRef.current.push(offTid);
          }, step.delayMs);
          auditionTimersRef.current.push(onTid);
        }
        const doneTid = window.setTimeout(() => {
          setAuditioningPresetId((cur) => (cur === target.id ? null : cur));
        }, 1780);
        auditionTimersRef.current.push(doneTid);
      })();
    },
    [applyPatchSelection, clearAuditionTimers, engine, showNotice, tunePlayer]
  );

  const handleAuditionPresetById = useCallback(
    (presetId: string) => {
      const found = allBuiltInPresets.find((p) => p.id === presetId);
      if (found) startPresetAudition(found);
    },
    [allBuiltInPresets, startPresetAudition]
  );

  // Global keyboard shortcuts (Undo/Redo, Delete, Bypass, Duplicate, Fit View, Shortcuts overlay)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && !e.altKey) {
        const lower = e.key.toLowerCase();
        if (lower === 'z') {
          e.preventDefault();
          if (e.shiftKey) handleRedo();
          else handleUndo();
          return;
        }
        if (lower === 'y') {
          e.preventDefault();
          handleRedo();
          return;
        }
      }

      if (activeView === 'embed' || activeView === 'midi' || sampleAnalyzerOpen) {
        return;
      }

      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }

      if (e.key === 'Escape') {
        if (shortcutsOpen) {
          setShortcutsOpen(false);
          return;
        }
        if (selectedConnId) {
          setSelectedConnId(null);
        }
        return;
      }

      if (activeView !== 'patchbay') return;

      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.metaKey && !e.ctrlKey) {
        if (selectedConnId) {
          e.preventDefault();
          handleDeleteConnection(selectedConnId);
          return;
        }
        if (selectedNodeId && selectedNodeId !== 'output') {
          e.preventDefault();
          handleDeleteNode(selectedNodeId);
          return;
        }
      }

      if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const upper = e.key.toUpperCase();
        if (upper === 'B' && selectedNodeId && selectedNodeId !== 'output') {
          e.preventDefault();
          handleToggleBypass(selectedNodeId);
        } else if (upper === 'D' && selectedNodeId && selectedNodeId !== 'output') {
          e.preventDefault();
          handleDuplicateNode(selectedNodeId);
        } else if (upper === 'F') {
          e.preventDefault();
          setFitTrigger((v) => v + 1);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeView,
    sampleAnalyzerOpen,
    shortcutsOpen,
    selectedConnId,
    selectedNodeId,
    handleUndo,
    handleRedo,
    handleDeleteConnection,
    handleDeleteNode,
    handleToggleBypass,
    handleDuplicateNode,
  ]);

  const handleSelectNavView = (view: StudioView) => {
    setActiveView(view);
    if (view === 'presets') {
      setLeftDrawerOpen(true);
      setMobileTab('presets');
    } else if (view === 'modMatrix') {
      setMobileTab('modMatrix');
    } else if (view === 'guide') {
      setMobileTab('guide');
    } else if (view === 'about') {
      setMobileTab('about');
    } else if (view === 'patchbay') {
      setMobileTab('patchbay');
    }
  };

  return (
    <div className="h-dvh w-full bg-[#F4F6FA] dark:bg-[#07090E] text-slate-900 dark:text-slate-100 flex flex-col overflow-hidden">
      {/* Strict 3-Zone Top Bar */}
      <HeaderBar
        activeView={activeView}
        onSelectView={handleSelectNavView}
        onExportJson={handleExportJson}
        patchName={patch.name}
      />

      {/* Mobile & Tablet View Switcher (Compact single row, non-sticky flex block) */}
      <div className="lg:hidden px-2 py-1.5 bg-white dark:bg-[#0B0F17] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-1 shrink-0 overflow-x-auto">
        {(
          [
            { id: 'patchbay', label: 'Patchbay' },
            { id: 'modMatrix', label: 'Mod Matrix' },
            { id: 'guide', label: 'Guide' },
            { id: 'presets', label: 'Presets' },
            { id: 'inspector', label: 'Inspector' },
            { id: 'scopes', label: 'Scopes' },
            { id: 'about', label: 'About' },
          ] as { id: MobileTab; label: string }[]
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setMobileTab(t.id);
              setActiveView(
                t.id === 'modMatrix'
                  ? 'modMatrix'
                  : t.id === 'guide'
                    ? 'guide'
                    : t.id === 'about'
                      ? 'about'
                      : 'patchbay'
              );
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap shrink-0 min-h-[36px] ${
              mobileTab === t.id && activeView !== 'embed'
                ? 'bg-slate-200 dark:bg-slate-800 text-amber-800 dark:text-amber-400'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setActiveView('embed')}
          className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap shrink-0 min-h-[36px] ${
            activeView === 'embed' ? 'bg-slate-200 dark:bg-slate-800 text-cyan-700 dark:text-cyan-400' : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          API
        </button>
        <button
          type="button"
          onClick={() => setMobileKeysOpen((v) => !v)}
          className={`px-2.5 py-1.5 text-xs font-medium rounded inline-flex items-center gap-1 whitespace-nowrap shrink-0 min-h-[36px] ${
            mobileKeysOpen ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300' : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <Piano className="w-3.5 h-3.5" />
          <span>Keys</span>
        </button>
        <button
          type="button"
          onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
          title={theme === 'light' ? 'Switch to Dark Studio theme' : 'Switch to Light Daylight theme'}
          aria-label={theme === 'light' ? 'Switch to Dark theme' : 'Switch to Light theme'}
          className="px-2.5 py-1.5 text-xs font-medium rounded inline-flex items-center gap-1 whitespace-nowrap shrink-0 min-h-[36px] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
        >
          {theme === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5 text-amber-400" />}
        </button>
      </div>

      {/* Main Studio Stage */}
      {activeView === 'guide' || mobileTab === 'guide' ? (
        <div className="flex-1 min-h-0 flex overflow-hidden">
          <GuidePage
            onBackToPatchbay={() => {
              setActiveView('patchbay');
              setMobileTab('patchbay');
            }}
            onOpenModMatrix={() => {
              setActiveView('modMatrix');
              setMobileTab('modMatrix');
            }}
            onLoadPresetById={handleLoadPresetById}
            onAuditionPreset={handleAuditionPresetById}
          />
        </div>
      ) : activeView === 'about' || mobileTab === 'about' ? (
        <div className="flex-1 min-h-0 flex overflow-hidden">
          <AboutPage
            totalPresetsCount={allBuiltInPresets.length}
            ethnicPresetsCount={ETHNIC_PRESETS.length}
            gmPresetsCount={GM_PRESETS.length}
            onBackToPatchbay={() => {
              setActiveView('patchbay');
              setMobileTab('patchbay');
            }}
            onOpenModMatrix={() => {
              setActiveView('modMatrix');
              setMobileTab('modMatrix');
            }}
            onOpenPresets={() => {
              setActiveView('patchbay');
              setLeftDrawerOpen(true);
              setMobileTab('presets');
            }}
            onOpenGuide={() => {
              setActiveView('guide');
              setMobileTab('guide');
            }}
          />
        </div>
      ) : (
      <div className="flex-1 min-h-0 flex overflow-hidden relative">
        {/* Left Preset & Tune Drawer (Desktop collapsible, Mobile tab) */}
        <div
          className={`${
            mobileTab === 'presets' ? 'flex w-full' : 'hidden'
          } lg:flex ${
            leftDrawerOpen ? 'lg:w-[276px]' : 'lg:w-0 lg:overflow-hidden lg:border-r-0'
          } shrink-0 h-full transition-all duration-150`}
        >
          <div className="w-full lg:w-[276px] h-full">
            <PresetLibraryDrawer
              ethnicPresets={ETHNIC_PRESETS}
              ambientPresets={AMBIENT_PRESETS}
              gmPresets={GM_PRESETS}
              savedPresets={savedPresets}
              tunes={TEST_TUNES}
              activePatchId={patch.id}
              tuneState={tuneState}
              favoriteIds={favoriteIds}
              auditioningPresetId={auditioningPresetId}
              isDirty={isDirty}
              onSelectPatch={handleSelectPatch}
              onToggleFavorite={handleToggleFavorite}
              onAuditionPreset={startPresetAudition}
              onStopAudition={handleStopAudition}
              onRevertPatch={handleRevertPatch}
              onSaveCurrentPatch={handleSaveCurrentPatch}
              onDeleteSavedPatch={handleDeleteSavedPatch}
              onImportPatchJson={handleImportPatchJson}
              onPlayTune={handlePlayTune}
              onStopTune={() => tunePlayer.stop()}
              onOpenSampleAnalyzer={() => setSampleAnalyzerOpen(true)}
              onCollapse={() => setLeftDrawerOpen(false)}
            />
          </div>
        </div>

        {/* Slim Desktop Edge Rail to Expand Collapsed Left Sidebar */}
        {!leftDrawerOpen && (
          <button
            type="button"
            onClick={() => setLeftDrawerOpen(true)}
            title="Expand Library & Tunes sidebar"
            className="hidden lg:flex w-7 shrink-0 h-full bg-white dark:bg-[#0B0F17] hover:bg-slate-50 dark:hover:bg-[#111622] border-r border-slate-200 dark:border-slate-800 flex-col items-center py-3 gap-2 text-slate-500 dark:text-slate-400 hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
          >
            <PanelLeftOpen className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[10px] font-semibold uppercase tracking-widest [writing-mode:vertical-rl] rotate-180 select-none">
              Presets
            </span>
          </button>
        )}

        {/* Center Patchbay Canvas or Mod Matrix Workspace */}
        <div
          className={`${
            mobileTab === 'patchbay' || mobileTab === 'modMatrix' ? 'flex' : 'hidden'
          } lg:flex flex-1 min-w-0 h-full relative`}
        >
          {activeView === 'modMatrix' || mobileTab === 'modMatrix' ? (
            <ModMatrixPanel
              patch={patch}
              focusedNodeId={focusedModNodeId}
              onClearFocus={() => setFocusedModNodeId(null)}
              onUpdateModMatrix={handleUpdateModMatrix}
              onBackToPatchbay={() => {
                setFocusedModNodeId(null);
                setActiveView('patchbay');
                setMobileTab('patchbay');
              }}
            />
          ) : (
            <>
              {/* Desktop Drawer Toggles + Active Patch Name */}
              <div className="hidden lg:flex items-center gap-2 absolute bottom-3 left-3 z-20 bg-white/95 dark:bg-[#111622]/90 border border-slate-200 dark:border-slate-800 rounded-md px-2.5 py-1.5 text-xs shadow-xs dark:shadow-none">
                <button
                  type="button"
                  onClick={() => setLeftDrawerOpen((v) => !v)}
                  title={leftDrawerOpen ? 'Collapse Left Sidebar' : 'Expand Left Sidebar'}
                  className={`p-1 rounded transition-colors ${
                    leftDrawerOpen ? 'text-amber-700 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <PanelLeft className="w-3.5 h-3.5" />
                </button>
                <span className="font-semibold text-slate-900 dark:text-slate-100 max-w-[260px] truncate">
                  {patch.name}
                </span>
                {isDirty && (
                  <span className="text-[10px] font-mono font-semibold text-amber-700 dark:text-amber-400">
                    • Edited
                  </span>
                )}
                <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
                <span className="text-slate-600 dark:text-slate-400 truncate max-w-[190px]">
                  {patch.regionOrFamily || 'Custom Patch'}
                </span>
                <button
                  type="button"
                  onClick={() => setRightInspectorOpen((v) => !v)}
                  title={rightInspectorOpen ? 'Collapse Right Inspector' : 'Expand Right Inspector'}
                  className={`p-1 rounded ml-1 transition-colors ${
                    rightInspectorOpen ? 'text-amber-700 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <PanelRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <PatchbayCanvas
                patch={patch}
                selectedNodeId={selectedNodeId}
                selectedConnId={selectedConnId}
                activeNotesCount={activeNotes.length}
                layoutMode={layoutMode}
                canUndo={history.past.length > 0}
                canRedo={history.future.length > 0}
                undoCount={history.past.length}
                redoCount={history.future.length}
                fitTrigger={fitTrigger}
                showOnboarding={showOnboarding}
                shortcutsOpen={shortcutsOpen}
                onToggleShortcuts={() => setShortcutsOpen((v) => !v)}
                onDismissOnboarding={() => {
                  setShowOnboarding(false);
                  try {
                    localStorage.setItem(ONBOARDING_DISMISSED_KEY, '1');
                  } catch {
                    // ignore storage error
                  }
                }}
                onUndo={handleUndo}
                onRedo={handleRedo}
                onChangeLayoutMode={setLayoutMode}
                theme={theme}
                onSelectNode={(id) => {
                  setSelectedNodeId(id);
                }}
                onSelectConn={setSelectedConnId}
                onMoveNode={handleMoveNode}
                onAddNode={handleAddNode}
                onToggleBypass={handleToggleBypass}
                onDuplicateNode={handleDuplicateNode}
                onDeleteNode={handleDeleteNode}
                onInspectModulation={handleInspectModulation}
                onAddConnection={handleAddConnection}
                onUpdateConnectionAmount={handleUpdateConnectionAmount}
                onDeleteConnection={handleDeleteConnection}
                onAutoLayout={handleAutoLayout}
                onOpenSampleAnalyzer={() => setSampleAnalyzerOpen(true)}
                onDragStartHistory={handleStartGestureHistory}
                onCommitHistory={handleCommitGestureHistory}
              />
            </>
          )}
        </div>

        {/* Mobile Scopes, Macro XY & Transport Tab */}
        {mobileTab === 'scopes' && (
          <div className="flex lg:hidden flex-1 flex-col p-3 gap-3 overflow-y-auto bg-[#F4F6FA] dark:bg-[#07090E]">
            <WaveformScopes engine={engine} theme={theme} />
            <MacroXYPad
              x={macroXY.x}
              y={macroXY.y}
              defaultX={patch.macroDefaults?.x ?? 0.5}
              defaultY={patch.macroDefaults?.y ?? 0.5}
              xLabel={patch.macroLabels?.x}
              yLabel={patch.macroLabels?.y}
              onChange={handleMacroXYChange}
            />
            <MidiAndTransportBar
              tunes={TEST_TUNES}
              tuneState={tuneState}
              midiState={midiState}
              lastMidiEvent={midiLog[0] || null}
              audioOutputDevices={audioOutputDevices}
              selectedOutputDeviceId={selectedOutputDeviceId}
              outputSelectionSupported={audioOutputSupported}
              onSelectOutputDevice={(id) => void handleSelectOutputDevice(id)}
              onRefreshAudioOutputs={() => void refreshAudioOutputs(true)}
              onSelectTune={(t) => handlePlayTune(t, true)}
              onTogglePlay={() =>
                tuneState.isPlaying ? tunePlayer.pause() : void tunePlayer.play()
              }
              onStop={() => tunePlayer.stop()}
              onChangeBpm={(bpm) => tunePlayer.setBpm(bpm)}
              onToggleLoop={() => tunePlayer.setLoop(!tuneState.loop)}
              onConnectMidi={() => void midiController.connect()}
              onSelectMidiDevice={(id) => midiController.selectDevice(id)}
            />
          </div>
        )}

        {/* Slim Desktop Edge Rail to Expand Collapsed Right Sidebar */}
        {!rightInspectorOpen && (
          <button
            type="button"
            onClick={() => setRightInspectorOpen(true)}
            title="Expand Node Inspector sidebar"
            className="hidden lg:flex w-7 shrink-0 h-full bg-white dark:bg-[#0B0F17] hover:bg-slate-50 dark:hover:bg-[#111622] border-l border-slate-200 dark:border-slate-800 flex-col items-center py-3 gap-2 text-slate-500 dark:text-slate-400 hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
          >
            <PanelRightOpen className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[10px] font-semibold uppercase tracking-widest [writing-mode:vertical-rl] select-none">
              Inspector
            </span>
          </button>
        )}

        {/* Right Node Inspector */}
        <div
          className={`${
            mobileTab === 'inspector' ? 'flex w-full' : 'hidden'
          } lg:flex ${
            rightInspectorOpen ? 'lg:w-[348px]' : 'lg:w-0 lg:overflow-hidden lg:border-l-0'
          } shrink-0 h-full transition-all duration-150`}
        >
          <div className="w-full lg:w-[348px] h-full">
            <NodeInspector
              patch={patch}
              selectedNodeId={selectedNodeId}
              showAllParams={showAllParams}
              onToggleShowAllParams={() => setShowAllParams((v) => !v)}
              onUpdateNodeParam={handleUpdateNodeParam}
              onToggleBypass={handleToggleBypass}
              onDeleteNode={handleDeleteNode}
              onDuplicateNode={handleDuplicateNode}
              onUpdateConnectionAmount={handleUpdateConnectionAmount}
              onDeleteConnection={handleDeleteConnection}
              onUpdatePatchMeta={(updates) =>
                applyTrackedMutation((prev) => ({ ...prev, ...updates }))
              }
              onOpenModMatrixForNode={handleInspectModulation}
              onQuickMapMacro={handleQuickMapMacro}
              onDragStartHistory={handleStartGestureHistory}
              onCommitHistory={handleCommitGestureHistory}
              onCollapse={() => setRightInspectorOpen(false)}
            />
          </div>
        </div>
      </div>
      )}

      {/* Bottom Docked Scopes, Macro XY, Transport & Playable Keyboard */}
      <div className="shrink-0 bg-[#F4F6FA] dark:bg-[#07090E] border-t border-slate-200 dark:border-slate-800">
        {/* Slim Dock Control & Micro-Transport Bar */}
        <div className="hidden lg:flex items-center justify-between h-9 px-3 bg-white dark:bg-[#0B0F17] border-b border-slate-200 dark:border-slate-800/80 text-[11px]">
          <div className="flex items-center gap-1.5">
            <div className="inline-flex items-center rounded border border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-[#090C12] p-0.5 gap-0.5">
              {(
                [
                  { id: 'keysXy', label: 'Keys & XY' },
                  { id: 'scopesTransport', label: 'Scopes & Transport' },
                  { id: 'split', label: 'Split All' },
                  { id: 'collapsed', label: 'Hide Dock' },
                ] as { id: DockTab; label: string }[]
              ).map((tabItem) => (
                <button
                  key={tabItem.id}
                  type="button"
                  onClick={() => setDockTab(tabItem.id)}
                  className={`px-2 py-0.5 rounded font-medium transition-colors ${
                    dockTab === tabItem.id
                      ? 'bg-white dark:bg-[#171E2E] text-amber-800 dark:text-amber-300 border border-slate-200 dark:border-slate-700'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {tabItem.label}
                </button>
              ))}
            </div>

            <div className="h-3.5 w-px bg-slate-200 dark:bg-slate-800" />

            <button
              type="button"
              onClick={() => setLeftDrawerOpen((v) => !v)}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border transition-colors ${
                leftDrawerOpen
                  ? 'bg-slate-200/80 dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-200'
                  : 'bg-transparent border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
              title="Toggle Left Library Sidebar"
            >
              <PanelLeft className="w-3 h-3" />
              <span>Library</span>
            </button>

            <button
              type="button"
              onClick={() => setRightInspectorOpen((v) => !v)}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border transition-colors ${
                rightInspectorOpen
                  ? 'bg-slate-200/80 dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-200'
                  : 'bg-transparent border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
              title="Toggle Right Inspector Sidebar"
            >
              <PanelRight className="w-3 h-3" />
              <span>Inspector</span>
            </button>

          </div>

          <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
            {isDirty && (
              <button
                type="button"
                onClick={handleRevertPatch}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/12 border border-amber-500/40 text-amber-800 dark:text-amber-300 hover:bg-amber-500/20 font-sans font-medium transition-colors"
                title={`Revert unsaved edits back to "${baselinePatch.name}"`}
              >
                <RotateCcw className="w-3 h-3" />
                <span>Modified · Revert</span>
              </button>
            )}

            <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded px-1.5 py-0.5">
              <button
                type="button"
                onClick={() =>
                  tuneState.isPlaying ? tunePlayer.stop() : void tunePlayer.play()
                }
                className={`inline-flex items-center gap-1 font-sans font-medium transition-colors ${
                  tuneState.isPlaying
                    ? 'text-rose-700 dark:text-rose-300 hover:text-rose-600'
                    : 'text-emerald-700 dark:text-emerald-400 hover:text-emerald-600'
                }`}
                title={tuneState.isPlaying ? 'Stop Tune Playback' : 'Play Selected Test Tune'}
              >
                {tuneState.isPlaying ? (
                  <Square className="w-2.5 h-2.5 fill-current" />
                ) : (
                  <Play className="w-2.5 h-2.5 fill-current" />
                )}
                <span className="max-w-[140px] truncate">
                  {TEST_TUNES.find((t) => t.id === tuneState.tuneId)?.title ?? 'Demo Tune'}
                </span>
              </button>
            </div>

            <span>
              Voices: <span className="text-slate-900 dark:text-slate-200">{activeNotes.length}</span>
            </span>

            {activeNotes.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  tunePlayer.stop();
                  handleStopAudition();
                }}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/12 border border-rose-500/40 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20 font-sans font-medium"
                title="Silence all active voices"
              >
                <VolumeX className="w-3 h-3" />
                <span>All Off</span>
              </button>
            )}

            <div className="h-3.5 w-px bg-slate-200 dark:bg-slate-800" />
            <button
              type="button"
              onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
              title={theme === 'light' ? 'Switch to Dark Studio theme' : 'Switch to Light Daylight theme'}
              aria-label={theme === 'light' ? 'Switch to Dark Studio theme' : 'Switch to Light Daylight theme'}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#111622] hover:border-slate-400 dark:hover:border-slate-600 text-slate-700 dark:text-slate-200 font-sans font-medium transition-colors"
            >
              {theme === 'light' ? (
                <>
                  <Moon className="w-3 h-3 text-slate-600" />
                  <span>Dark</span>
                </>
              ) : (
                <>
                  <Sun className="w-3 h-3 text-amber-400" />
                  <span>Light</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Desktop Compact Tabbed Dock Views */}
        {dockTab === 'keysXy' && (
          <div className="hidden lg:grid grid-cols-12 gap-2.5 p-2 bg-[#EBEEF5] dark:bg-[#090C12] items-stretch">
            <div className="col-span-9 min-w-0">
              <PlayableKeyboard engine={engine} activeNotes={activeNotes} compactDock />
            </div>
            <div className="col-span-3 min-w-0">
              <MacroXYPad
                compact
                x={macroXY.x}
                y={macroXY.y}
                defaultX={patch.macroDefaults?.x ?? 0.5}
                defaultY={patch.macroDefaults?.y ?? 0.5}
                xLabel={patch.macroLabels?.x}
                yLabel={patch.macroLabels?.y}
                onChange={handleMacroXYChange}
              />
            </div>
          </div>
        )}

        {dockTab === 'scopesTransport' && (
          <div className="hidden lg:grid grid-cols-12 gap-2.5 p-2 bg-[#EBEEF5] dark:bg-[#090C12]">
            <div className="col-span-7 min-w-0">
              <WaveformScopes engine={engine} compact theme={theme} />
            </div>
            <div className="col-span-5 min-w-0">
              <MidiAndTransportBar
                tunes={TEST_TUNES}
                tuneState={tuneState}
                midiState={midiState}
                lastMidiEvent={midiLog[0] || null}
                audioOutputDevices={audioOutputDevices}
                selectedOutputDeviceId={selectedOutputDeviceId}
                outputSelectionSupported={audioOutputSupported}
                onSelectOutputDevice={(id) => void handleSelectOutputDevice(id)}
                onRefreshAudioOutputs={() => void refreshAudioOutputs(true)}
                onSelectTune={(t) => handlePlayTune(t, true)}
                onTogglePlay={() =>
                  tuneState.isPlaying ? tunePlayer.pause() : void tunePlayer.play()
                }
                onStop={() => tunePlayer.stop()}
                onChangeBpm={(bpm) => tunePlayer.setBpm(bpm)}
                onToggleLoop={() => tunePlayer.setLoop(!tuneState.loop)}
                onConnectMidi={() => void midiController.connect()}
                onSelectMidiDevice={(id) => midiController.selectDevice(id)}
              />
            </div>
          </div>
        )}

        {dockTab === 'split' && (
          <>
            <div className="hidden lg:grid grid-cols-12 gap-2.5 p-2.5 bg-[#EBEEF5] dark:bg-[#090C12]">
              <div className="col-span-5 min-w-0">
                <WaveformScopes engine={engine} compact theme={theme} />
              </div>
              <div className="col-span-3 min-w-0">
                <MacroXYPad
                  compact
                  x={macroXY.x}
                  y={macroXY.y}
                  defaultX={patch.macroDefaults?.x ?? 0.5}
                  defaultY={patch.macroDefaults?.y ?? 0.5}
                  xLabel={patch.macroLabels?.x}
                  yLabel={patch.macroLabels?.y}
                  onChange={handleMacroXYChange}
                />
              </div>
              <div className="col-span-4 min-w-0">
                <MidiAndTransportBar
                  tunes={TEST_TUNES}
                  tuneState={tuneState}
                  midiState={midiState}
                  lastMidiEvent={midiLog[0] || null}
                  audioOutputDevices={audioOutputDevices}
                  selectedOutputDeviceId={selectedOutputDeviceId}
                  outputSelectionSupported={audioOutputSupported}
                  onSelectOutputDevice={(id) => void handleSelectOutputDevice(id)}
                  onRefreshAudioOutputs={() => void refreshAudioOutputs(true)}
                  onSelectTune={(t) => handlePlayTune(t, true)}
                  onTogglePlay={() =>
                    tuneState.isPlaying ? tunePlayer.pause() : void tunePlayer.play()
                  }
                  onStop={() => tunePlayer.stop()}
                  onChangeBpm={(bpm) => tunePlayer.setBpm(bpm)}
                  onToggleLoop={() => tunePlayer.setLoop(!tuneState.loop)}
                  onConnectMidi={() => void midiController.connect()}
                  onSelectMidiDevice={(id) => midiController.selectDevice(id)}
                />
              </div>
            </div>
            <div className="hidden lg:block">
              <PlayableKeyboard engine={engine} activeNotes={activeNotes} />
            </div>
          </>
        )}

        {/* Mobile Playable Keyboard */}
        <div className={`${mobileKeysOpen ? 'block' : 'hidden'} lg:hidden`}>
          <PlayableKeyboard engine={engine} activeNotes={activeNotes} />
        </div>
      </div>

      {/* Transient Toast Notice */}
      {statusNotice && (
        <div className="fixed bottom-44 right-4 z-50 px-3.5 py-2 rounded-md bg-white dark:bg-[#111622] border border-amber-500/50 text-xs font-medium text-amber-800 dark:text-amber-300 shadow-xl flex items-center gap-2">
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>{statusNotice}</span>
        </div>
      )}

      {/* Embeddable JS Library & Live MIDI Tester Modal */}
      {activeView === 'embed' && (
        <EmbedApiModal
          patch={patch}
          engine={engine}
          midiLog={midiLog}
          onImportPatchJson={handleImportPatchJson}
          onClose={() => {
            setActiveView('patchbay');
            if (mobileTab === 'about' || mobileTab === 'guide') setMobileTab('patchbay');
          }}
        />
      )}

      {/* Hardware MIDI & Audio Setup Modal */}
      {activeView === 'midi' && (
        <MidiSetupModal
          midiState={midiState}
          midiLog={midiLog}
          audioOutputDevices={audioOutputDevices}
          selectedOutputDeviceId={selectedOutputDeviceId}
          outputSelectionSupported={audioOutputSupported}
          onSelectOutputDevice={(id) => void handleSelectOutputDevice(id)}
          onRefreshAudioOutputs={() => void refreshAudioOutputs(true)}
          onConnectMidi={() => void midiController.connect()}
          onSelectDevice={(id) => midiController.selectDevice(id)}
          onClose={() => {
            setActiveView('patchbay');
            if (mobileTab === 'about' || mobileTab === 'guide') setMobileTab('patchbay');
          }}
        />
      )}

      {/* Offline Browser DSP Sample Analyzer & Reconstructor Modal */}
      {sampleAnalyzerOpen && (
        <SampleAnalyzerModal
          theme={theme}
          audioOutputDevices={audioOutputDevices}
          selectedOutputId={selectedOutputDeviceId}
          outputSelectionSupported={audioOutputSupported}
          onSelectOutputId={handleSelectOutputDevice}
          onRefreshAudioDevices={refreshAudioOutputs}
          onApplyPatch={(reconstructed) => {
            const cloned = clonePatch(reconstructed);
            applyPatchSelection(cloned);
            setActiveView('patchbay');
            setMobileTab('patchbay');
            showNotice(`Loaded reconstructed patch "${cloned.name}"`);
          }}
          onSaveAndApplyPatch={(reconstructed, name) => {
            const saved: SynthPatch = {
              ...clonePatch(reconstructed),
              id: `custom-${Date.now().toString(36)}`,
              name,
              category: 'custom',
              updatedAt: new Date().toISOString(),
            };
            setSavedPresets((prev) => [saved, ...prev]);
            applyPatchSelection(saved);
            setActiveView('patchbay');
            setMobileTab('patchbay');
            showNotice(`Saved & loaded "${name}"`);
          }}
          onClose={() => setSampleAnalyzerOpen(false)}
        />
      )}
    </div>
  );
}
