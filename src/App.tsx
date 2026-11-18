import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SlidersHorizontal, Piano, PanelLeft, PanelRight, PanelLeftOpen, PanelRightOpen, ChevronDown, ChevronUp, Square, Sun, Moon } from 'lucide-react';
import { ETHNIC_PRESETS } from './data/ethnicPresets';
import { AMBIENT_PRESETS } from './data/ambientPresets';
import { GM_PRESETS } from './data/gmPresets';
import { TEST_TUNES } from './data/testTunes';
import { MidiController, MidiControllerState } from './engine/MidiController';
import { createDefaultNode, MODULE_REGISTRY } from './engine/moduleRegistry';
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

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    () => ETHNIC_PRESETS[0].nodes[0]?.id || null
  );
  const [activeNotes, setActiveNotes] = useState<number[]>([]);
  const [activeView, setActiveView] = useState<StudioView>('patchbay');
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(true);
  const [rightInspectorOpen, setRightInspectorOpen] = useState(true);
  const [mobileTab, setMobileTab] = useState<MobileTab>('patchbay');
  const [mobileKeysOpen, setMobileKeysOpen] = useState(true);
  const [telemetryRowOpen, setTelemetryRowOpen] = useState(true);
  const [keyboardRowOpen, setKeyboardRowOpen] = useState(true);
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
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [audioOutputDevices, setAudioOutputDevices] = useState<{ deviceId: string; label: string }[]>([]);
  const [selectedOutputDeviceId, setSelectedOutputDeviceId] = useState<string>('default');
  const audioOutputSupported = useMemo(() => engine.isAudioOutputSelectionSupported(), [engine]);

  const allBuiltInPresets = useMemo(
    () => [...ETHNIC_PRESETS, ...AMBIENT_PRESETS, ...GM_PRESETS],
    []
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
        setPatch(next);
        setSelectedNodeId(next.nodes[0]?.id || null);
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

  const applyPatchSelection = useCallback(
    (cloned: SynthPatch) => {
      const nextXY = cloned.macroDefaults ?? { x: 0.5, y: 0.5 };
      engine.setMacroXY(nextXY.x, nextXY.y);
      setMacroXY(nextXY);
      engine.loadPatch(cloned);
      setPatch(cloned);
      setSelectedNodeId(cloned.nodes[0]?.id || null);
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
      const cloned = clonePatch(nextPatch);
      applyPatchSelection(cloned);
      if (window.innerWidth < 1024) {
        setMobileTab('patchbay');
      }
    },
    [applyPatchSelection]
  );

  const handleMoveNode = useCallback((nodeId: string, position: { x: number; y: number }) => {
    setPatch((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, position } : n)),
    }));
  }, []);

  const handleUpdateNodeParam = useCallback(
    (nodeId: string, key: string, value: number | string | boolean) => {
      engine.updateNodeParams(nodeId, { [key]: value });
      setPatch((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) =>
          n.id === nodeId ? { ...n, params: { ...n.params, [key]: value } } : n
        ),
      }));
    },
    [engine]
  );

  const handleAddNode = useCallback((type: ModuleType, position: { x: number; y: number }) => {
    const newId = `${type}_${Date.now().toString(36)}`;
    const newNode = createDefaultNode(type, newId, position);
    setPatch((prev) => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
    }));
    setSelectedNodeId(newId);
  }, []);

  const handleToggleBypass = useCallback((nodeId: string) => {
    setPatch((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === nodeId ? { ...n, bypassed: !n.bypassed } : n
      ),
    }));
  }, []);

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setPatch((prev) => ({
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
      if (selectedNodeId === nodeId) setSelectedNodeId(null);
    },
    [selectedNodeId]
  );

  const handleDuplicateNode = useCallback(
    (nodeId: string) => {
      const orig = patch.nodes.find((n) => n.id === nodeId);
      if (!orig) return;
      const copyId = `${orig.type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
      const cloned = clonePatch({ ...patch, nodes: [orig], connections: [] }).nodes[0];
      cloned.id = copyId;
      cloned.position = { x: orig.position.x + 36, y: orig.position.y + 36 };
      cloned.label = `${orig.label || MODULE_REGISTRY[orig.type].label} Copy`;
      setPatch((prev) => ({
        ...prev,
        nodes: [...prev.nodes, cloned],
      }));
      setSelectedNodeId(copyId);
    },
    [patch]
  );

  const handleAddConnection = useCallback(
    (fromNode: string, fromPort: string, toNode: string, toPort: string) => {
      let blockedCycle = false;
      setPatch((prev) => {
        const exists = prev.connections.some(
          (c) =>
            c.fromNode === fromNode &&
            c.fromPort === fromPort &&
            c.toNode === toNode &&
            c.toPort === toPort
        );
        if (exists) return prev;

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
            return prev;
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
              return prev;
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
    [showNotice]
  );

  const handleUpdateConnectionAmount = useCallback((connId: string, amount: number) => {
    setPatch((prev) => ({
      ...prev,
      connections: prev.connections.map((c) => (c.id === connId ? { ...c, amount } : c)),
    }));
  }, []);

  const handleDeleteConnection = useCallback((connId: string) => {
    setPatch((prev) => ({
      ...prev,
      connections: prev.connections.filter((c) => c.id !== connId),
    }));
  }, []);

  const handleUpdateModMatrix = useCallback(
    (slots: ModMatrixSlot[]) => {
      engine.updateModMatrixSlots(slots);
      setPatch((prev) => ({
        ...prev,
        modMatrix: slots,
      }));
    },
    [engine]
  );

  const handleAutoLayout = useCallback(() => {
    const colOrder: Record<ModuleType, number> = {
      oscillator: 0,
      fmOperator: 0,
      physicalString: 0,
      modalResonator: 0,
      blownPipe: 0,
      subHarmonic: 0,
      noise: 0,
      lfo: 0,
      sampleHold: 0,
      slopeEnv: 0,
      stepSequencer: 0,
      quantizer: 0,
      cvUtility: 0,
      crossfader: 1,
      combFilter: 1,
      shaper: 1,
      wavefolder: 1,
      ringMod: 1,
      envFollower: 1,
      bitcrusher: 2,
      filter: 2,
      formantFilter: 2,
      parametricEq: 2,
      chorus: 3,
      phaser: 3,
      granularCloud: 3,
      envelope: 4,
      delay: 5,
      reverb: 6,
      busCompressor: 6,
      output: 7,
    };
    setPatch((prev) => {
      const buckets: Record<number, typeof prev.nodes> = {};
      prev.nodes.forEach((n) => {
        const col = colOrder[n.type] ?? 1;
        buckets[col] = buckets[col] || [];
        buckets[col].push(n);
      });
      const updated = prev.nodes.map((n) => {
        const col = colOrder[n.type] ?? 1;
        const row = buckets[col].indexOf(n);
        return {
          ...n,
          position: {
            x: 56 + col * 308,
            y: 64 + row * 212,
          },
        };
      });
      return { ...prev, nodes: updated };
    });
  }, []);

  const handleSaveCurrentPatch = useCallback(
    (name: string) => {
      const customPatch: SynthPatch = {
        ...clonePatch(patch),
        id: `custom-${Date.now().toString(36)}`,
        name,
        category: 'custom',
        regionOrFamily: 'Custom User Patch',
        updatedAt: new Date().toISOString(),
      };
      setSavedPresets((prev) => [customPatch, ...prev]);
      setPatch(customPatch);
      showNotice(`Saved "${name}" to browser library`);
    },
    [patch, showNotice]
  );

  const handleDeleteSavedPatch = useCallback((id: string) => {
    setSavedPresets((prev) => prev.filter((p) => p.id !== id));
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
        applyPatchSelection(imported);
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
    const json = JSON.stringify(patch, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${patch.id || 'timbre-lab-patch'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotice(`Exported ${patch.name}.json`);
  }, [patch, showNotice]);

  const handlePlayTune = useCallback(
    (tune: TuneSequence, loadSuggestedPreset = false) => {
      clearAuditionTimers();
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
      const found = allBuiltInPresets.find((p) => p.id === presetId);
      if (!found) return;
      const cloned = clonePatch(found);
      applyPatchSelection(cloned);
      if (openPatchbay) {
        setActiveView('patchbay');
        setMobileTab('patchbay');
      }
      showNotice(`Loaded preset "${found.name}"`);
    },
    [allBuiltInPresets, applyPatchSelection, showNotice]
  );

  const handleAuditionPreset = useCallback(
    (presetId: string) => {
      const found = allBuiltInPresets.find((p) => p.id === presetId);
      if (!found) return;
      clearAuditionTimers();
      tunePlayer.stop();
      const cloned = clonePatch(found);
      applyPatchSelection(cloned);
      showNotice(`Auditioning "${found.name}" — play the keyboard below too!`);

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
      })();
    },
    [allBuiltInPresets, clearAuditionTimers, engine, showNotice, tunePlayer]
  );

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
            onAuditionPreset={handleAuditionPreset}
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
              onSelectPatch={handleSelectPatch}
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
              onUpdateModMatrix={handleUpdateModMatrix}
              onBackToPatchbay={() => {
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
                <span className="font-semibold text-slate-900 dark:text-slate-100 max-w-[280px] truncate">
                  {patch.name}
                </span>
                <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
                <span className="text-slate-600 dark:text-slate-400 truncate max-w-[210px]">
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
                activeNotesCount={activeNotes.length}
                theme={theme}
                onSelectNode={(id) => {
                  setSelectedNodeId(id);
                }}
                onMoveNode={handleMoveNode}
                onAddNode={handleAddNode}
                onToggleBypass={handleToggleBypass}
                onAddConnection={handleAddConnection}
                onUpdateConnectionAmount={handleUpdateConnectionAmount}
                onDeleteConnection={handleDeleteConnection}
                onAutoLayout={handleAutoLayout}
                onOpenSampleAnalyzer={() => setSampleAnalyzerOpen(true)}
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
              onUpdateNodeParam={handleUpdateNodeParam}
              onToggleBypass={handleToggleBypass}
              onDeleteNode={handleDeleteNode}
              onDuplicateNode={handleDuplicateNode}
              onUpdateConnectionAmount={handleUpdateConnectionAmount}
              onDeleteConnection={handleDeleteConnection}
              onUpdatePatchMeta={(updates) =>
                setPatch((prev) => ({ ...prev, ...updates }))
              }
              onCollapse={() => setRightInspectorOpen(false)}
            />
          </div>
        </div>
      </div>
      )}

      {/* Bottom Docked Scopes, Macro XY, Transport & Playable Keyboard */}
      <div className="shrink-0 bg-[#F4F6FA] dark:bg-[#07090E] border-t border-slate-200 dark:border-slate-800">
        {/* Desktop Collapse/Expand Bar for Sidebars & Bottom 2 Rows */}
        <div className="hidden lg:flex items-center justify-between h-8 px-3 bg-white dark:bg-[#0B0F17] border-b border-slate-200 dark:border-slate-800/80 text-[11px]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const anyOpen = telemetryRowOpen || keyboardRowOpen;
                setTelemetryRowOpen(!anyOpen);
                setKeyboardRowOpen(!anyOpen);
              }}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-slate-50 dark:bg-[#111622] border border-slate-300 dark:border-slate-800 hover:border-amber-500/50 text-slate-800 dark:text-slate-200 font-medium transition-colors"
              title={
                telemetryRowOpen || keyboardRowOpen
                  ? 'Collapse both bottom rows to focus on sound modelling'
                  : 'Expand Scopes, Macro XY, Transport & Keyboard'
              }
            >
              {telemetryRowOpen || keyboardRowOpen ? (
                <ChevronDown className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5 text-cyan-700 dark:text-cyan-400" />
              )}
              <span>
                {telemetryRowOpen || keyboardRowOpen ? 'Focus Modelling' : 'Show Performance Dock'}
              </span>
            </button>

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

            <div className="h-3.5 w-px bg-slate-200 dark:bg-slate-800" />

            <button
              type="button"
              onClick={() => setTelemetryRowOpen((v) => !v)}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border transition-colors ${
                telemetryRowOpen
                  ? 'bg-slate-200/80 dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-200'
                  : 'bg-transparent border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <span>Scopes · XY · Transport</span>
              {telemetryRowOpen ? (
                <ChevronDown className="w-3 h-3 text-slate-500 dark:text-slate-400" />
              ) : (
                <ChevronUp className="w-3 h-3 text-slate-500" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setKeyboardRowOpen((v) => !v)}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border transition-colors ${
                keyboardRowOpen
                  ? 'bg-slate-200/80 dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-200'
                  : 'bg-transparent border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <span>Keyboard</span>
              {keyboardRowOpen ? (
                <ChevronDown className="w-3 h-3 text-slate-500 dark:text-slate-400" />
              ) : (
                <ChevronUp className="w-3 h-3 text-slate-500" />
              )}
            </button>
          </div>

          <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
            {tuneState.isPlaying && (
              <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                <span className="truncate max-w-[180px]">
                  {TEST_TUNES.find((t) => t.id === tuneState.tuneId)?.title ?? 'Playing'}
                </span>
                <button
                  type="button"
                  onClick={() => tunePlayer.stop()}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/15 border border-rose-500/40 text-rose-700 dark:text-rose-300 hover:bg-rose-500/25"
                  title="Stop Tune"
                >
                  <Square className="w-2.5 h-2.5 fill-current" />
                  <span>Stop</span>
                </button>
              </div>
            )}
            <span>
              Voices: <span className="text-slate-900 dark:text-slate-200">{activeNotes.length}</span>
            </span>
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

        {/* Desktop Telemetry, Macro XY & Tune Transport Strip */}
        {telemetryRowOpen && (
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
        )}

        {/* Playable Keyboard */}
        <div
          className={`${mobileKeysOpen ? 'block' : 'hidden'} ${
            keyboardRowOpen ? 'lg:block' : 'lg:hidden'
          }`}
        >
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
