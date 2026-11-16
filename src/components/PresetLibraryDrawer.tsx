import React, { useMemo, useRef, useState } from 'react';
import { Search, Play, Square, Save, Upload, Trash2, PanelLeftClose, AudioLines } from 'lucide-react';
import { GM_FAMILY_TABS } from '../data/gmPresets';
import { PresetCategory, SynthPatch, TuneSequence } from '../engine/types';
import { TunePlaybackState } from '../engine/TunePlayer';

type LibraryTab = 'ethnic' | 'ambient' | 'gm' | 'saved' | 'tunes';

interface PresetLibraryDrawerProps {
  ethnicPresets: SynthPatch[];
  ambientPresets: SynthPatch[];
  gmPresets: SynthPatch[];
  savedPresets: SynthPatch[];
  tunes: TuneSequence[];
  activePatchId: string;
  tuneState: TunePlaybackState;
  onSelectPatch: (patch: SynthPatch) => void;
  onSaveCurrentPatch: (name: string) => void;
  onDeleteSavedPatch: (id: string) => void;
  onImportPatchJson: (jsonText: string) => { ok: boolean; error?: string };
  onPlayTune: (tune: TuneSequence, loadSuggestedPreset?: boolean) => void;
  onStopTune: () => void;
  onOpenSampleAnalyzer?: () => void;
  onCollapse?: () => void;
}

export const PresetLibraryDrawer: React.FC<PresetLibraryDrawerProps> = ({
  ethnicPresets,
  ambientPresets,
  gmPresets,
  savedPresets,
  tunes,
  activePatchId,
  tuneState,
  onSelectPatch,
  onSaveCurrentPatch,
  onDeleteSavedPatch,
  onImportPatchJson,
  onPlayTune,
  onStopTune,
  onOpenSampleAnalyzer,
  onCollapse,
}) => {
  const [tab, setTab] = useState<LibraryTab>('ethnic');
  const [search, setSearch] = useState('');
  const [gmFamily, setGmFamily] = useState<PresetCategory | 'gm-all'>('gm-all');
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const filteredPresets = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list: SynthPatch[] = [];
    if (tab === 'ethnic') list = ethnicPresets;
    else if (tab === 'ambient') list = ambientPresets;
    else if (tab === 'gm') {
      list =
        gmFamily === 'gm-all'
          ? gmPresets
          : gmPresets.filter((p) => p.category === gmFamily);
    } else if (tab === 'saved') {
      list = savedPresets;
    }

    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.regionOrFamily || '').toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q)) ||
        (p.gmProgram !== undefined && String(p.gmProgram + 1) === q)
    );
  }, [tab, search, gmFamily, ethnicPresets, ambientPresets, gmPresets, savedPresets]);

  const filteredTunes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tunes;
    return tunes.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.origin.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
    );
  }, [tunes, search]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = onImportPatchJson(String(reader.result || ''));
      if (!res.ok) setImportError(res.error || 'Invalid patch JSON');
      else setImportError(null);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <aside className="h-full bg-white dark:bg-[#111622] border-r border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
      {onCollapse && (
        <div className="hidden lg:flex items-center justify-between px-3 py-1.5 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-[#0E131D] shrink-0">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Library & Tunes
          </span>
          <button
            type="button"
            onClick={onCollapse}
            title="Collapse left sidebar"
            className="p-1 rounded text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
          >
            <PanelLeftClose className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {/* Segmented Tabs */}
      <div className="p-2.5 border-b border-slate-200 dark:border-slate-800 space-y-2.5 shrink-0">
        <div className="grid grid-cols-5 gap-0.5 p-1 bg-slate-100 dark:bg-[#07090E] rounded-md border border-slate-200 dark:border-slate-800">
          {(
            [
              { id: 'ethnic', label: 'Ethnic' },
              { id: 'ambient', label: 'Ambient' },
              { id: 'gm', label: 'GM 128' },
              { id: 'saved', label: 'Saved' },
              { id: 'tunes', label: 'Tunes' },
            ] as { id: LibraryTab; label: string }[]
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`py-2 px-0.5 text-[10px] font-semibold rounded transition-colors whitespace-nowrap min-h-[36px] ${
                tab === item.id
                  ? 'bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-400 shadow-xs dark:shadow-none'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === 'tunes' ? 'Search tunes...' : 'Search instrument or GM #...'}
            className="w-full h-10 pl-8 pr-3 text-xs bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        {tab === 'gm' && (
          <select
            value={gmFamily}
            onChange={(e) => setGmFamily(e.target.value as PresetCategory | 'gm-all')}
            className="w-full h-9 px-2.5 text-xs bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-800 rounded-md text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500"
          >
            {GM_FAMILY_TABS.map((fam) => (
              <option key={fam.id} value={fam.id}>
                {fam.label}
              </option>
            ))}
          </select>
        )}

        {/* Save / Import Toolbar */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSaveOpen((v) => !v)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-2.5 text-xs font-medium bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 hover:border-amber-500/70 text-slate-800 dark:text-slate-200 rounded-md transition-colors whitespace-nowrap"
          >
            <Save className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>Save Patch</span>
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-2.5 text-xs font-medium bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 hover:border-cyan-600/60 dark:hover:border-cyan-400/60 text-slate-800 dark:text-slate-200 rounded-md transition-colors whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5 text-cyan-700 dark:text-cyan-400" />
            <span>Import JSON</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>

        {onOpenSampleAnalyzer && (
          <button
            type="button"
            onClick={onOpenSampleAnalyzer}
            className="w-full inline-flex items-center justify-center gap-1.5 h-9 px-3 text-xs font-semibold bg-amber-500/12 dark:bg-amber-500/15 border border-amber-500/45 hover:border-amber-500 text-amber-800 dark:text-amber-300 rounded-md transition-colors whitespace-nowrap"
          >
            <AudioLines className="w-3.5 h-3.5" />
            <span>Analyze Audio Sample</span>
          </button>
        )}

        {saveOpen && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!saveName.trim()) return;
              onSaveCurrentPatch(saveName.trim());
              setSaveName('');
              setSaveOpen(false);
              setTab('saved');
            }}
            className="flex items-center gap-1.5 pt-1"
          >
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Custom patch name..."
              className="flex-1 h-9 px-2.5 text-xs bg-white dark:bg-[#07090E] border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500"
            />
            <button
              type="submit"
              className="h-9 px-3 text-xs font-semibold bg-amber-500 text-slate-950 rounded hover:bg-amber-400 whitespace-nowrap"
            >
              Save
            </button>
          </form>
        )}

        {importError && (
          <p className="text-[11px] text-rose-600 dark:text-rose-400">{importError}</p>
        )}
      </div>

      {/* List Body */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-200/80 dark:divide-slate-800/70">
        {tab === 'tunes' ? (
          filteredTunes.map((tune) => {
            const isPlayingThis = tuneState.isPlaying && tuneState.tuneId === tune.id;
            return (
              <div
                key={tune.id}
                className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/35 transition-colors space-y-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {tune.title}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
                      <span>{tune.origin}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-cyan-700 dark:text-cyan-400">{tune.bpm} BPM</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => (isPlayingThis ? onStopTune() : onPlayTune(tune, true))}
                    className={`min-w-[40px] min-h-[40px] px-2.5 rounded-md flex items-center justify-center gap-1 text-xs font-semibold transition-colors shrink-0 ${
                      isPlayingThis
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-100 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-amber-500'
                    }`}
                    title={isPlayingThis ? 'Stop tune' : 'Load suggested instrument & play tune'}
                  >
                    {isPlayingThis ? (
                      <Square className="w-3.5 h-3.5 fill-current" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current" />
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">{tune.description}</p>
              </div>
            );
          })
        ) : filteredPresets.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            {tab === 'saved'
              ? 'No custom presets saved yet. Design a sound and click Save Patch.'
              : 'No matching instruments found.'}
          </div>
        ) : (
          filteredPresets.map((preset) => {
            const isActive = preset.id === activePatchId;
            return (
              <div
                key={preset.id}
                className={`flex items-center justify-between gap-2 px-3 py-2.5 transition-colors min-h-[52px] ${
                  isActive ? 'bg-amber-500/12 dark:bg-amber-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/35'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectPatch(preset)}
                  className="flex-1 text-left min-w-0"
                >
                  <div
                    className={`text-xs font-semibold truncate ${
                      isActive ? 'text-amber-800 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {preset.name}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {preset.regionOrFamily || `${preset.nodes.length} modules`}
                  </div>
                </button>

                {tab === 'saved' && (
                  <button
                    type="button"
                    onClick={() => onDeleteSavedPatch(preset.id)}
                    title="Delete saved preset"
                    className="p-2 text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400 min-w-[36px] min-h-[36px] flex items-center justify-center"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
