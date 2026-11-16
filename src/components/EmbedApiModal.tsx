import React, { useEffect, useRef, useState } from 'react';
import { Copy, Check, Download, Play, Send, X } from 'lucide-react';
import { generateStandaloneEngineSource } from '../engine/standaloneExporter';
import { SynthEngine } from '../engine/SynthEngine';
import { MidiActivityEvent, SynthPatch } from '../engine/types';

interface EmbedApiModalProps {
  patch: SynthPatch;
  engine: SynthEngine;
  midiLog: MidiActivityEvent[];
  onImportPatchJson: (jsonText: string) => { ok: boolean; error?: string };
  onClose?: () => void;
  embeddedPage?: boolean;
}

export const EmbedApiModal: React.FC<EmbedApiModalProps> = ({
  patch,
  engine,
  midiLog,
  onImportPatchJson,
  onClose,
  embeddedPage = false,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [rawMidiInput, setRawMidiInput] = useState('0x90, 60, 110');
  const [jsonEditorText, setJsonEditorText] = useState(() => JSON.stringify(patch, null, 2));
  const [jsonStatus, setJsonStatus] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setJsonEditorText(JSON.stringify(patch, null, 2));
  }, [patch]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const copyTextSafe = async (text: string, onSuccess: () => void) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        onSuccess();
        return;
      }
    } catch {
      // Fallback below
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      onSuccess();
    } catch {
      // Ignore if clipboard access is completely blocked
    }
  };

  const snippet = `import { TimbreLabSynth } from './timbre-lab-engine.mjs';
import patch from './${patch.id}.json' with { type: 'json' };

const synth = new TimbreLabSynth({
  onProgramChange: (program) => console.log('GM Program:', program),
});

await synth.init();
synth.loadPatch(patch);

// Drive directly from a MIDI player or Web MIDI device:
synth.handleMidiMessage([0x90, 60, 110]); // Note On (C4, vel 110)
setTimeout(() => synth.handleMidiMessage([0x80, 60, 0]), 600);`;

  const handleDownloadEngine = () => {
    const code = generateStandaloneEngineSource();
    const blob = new Blob([code], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'timbre-lab-engine.mjs';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPatch = () => {
    const json = JSON.stringify(patch, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${patch.id || 'timbre-lab-patch'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sendMidiCommand = async (bytes: number[]) => {
    await engine.init();
    engine.handleMidiMessage(bytes);
  };

  const handleSendCustomBytes = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = rawMidiInput
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((tok) => (tok.startsWith('0x') || tok.startsWith('0X') ? parseInt(tok, 16) : parseInt(tok, 10)))
      .filter((n) => !Number.isNaN(n) && n >= 0 && n <= 255);
    if (parsed.length >= 2) {
      await sendMidiCommand(parsed);
    }
  };

  const handleApplyJson = () => {
    const res = onImportPatchJson(jsonEditorText);
    if (res.ok) {
      setJsonStatus('Patch JSON compiled and loaded into engine.');
    } else {
      setJsonStatus(res.error || 'Failed to parse JSON.');
    }
  };

  const body = (
    <div className="flex flex-col h-full bg-[#F4F6FA] dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100">
      <div className="px-5 py-4 bg-white dark:bg-[#111622] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Embeddable JS Synth Library & Live MIDI API Tester
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            Export the standalone zero-dependency ESM engine and JSON patch to run Timbre Lab instruments inside any web app or MIDI player.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDownloadEngine}
            className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-semibold bg-cyan-500/15 border border-cyan-500/50 text-cyan-800 dark:text-cyan-300 hover:bg-cyan-500/25 rounded-md whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download .mjs Engine</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadPatch}
            className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-semibold bg-amber-500 text-slate-950 hover:bg-amber-400 rounded-md whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Patch JSON</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-md"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Column 1: ES Module Integration & Live MIDI Command Tester */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                1. Embed in Web App or MIDI Player
              </span>
              <button
                type="button"
                onClick={() => {
                  void copyTextSafe(snippet, () => {
                    setCopiedCode(true);
                    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
                    copyTimerRef.current = window.setTimeout(() => setCopiedCode(false), 1800);
                  });
                }}
                className="inline-flex items-center gap-1 text-xs text-cyan-700 dark:text-cyan-400 hover:text-cyan-600 dark:hover:text-cyan-300"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
              </button>
            </div>
            <pre className="p-4 text-[11px] font-mono text-slate-800 dark:text-slate-300 overflow-x-auto leading-relaxed bg-slate-50 dark:bg-[#07090E]">
              {snippet}
            </pre>
          </div>

          <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                2. Live MIDI Command Tester
              </h3>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                synth.handleMidiMessage(bytes)
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void sendMidiCommand([0x90, 60, 112])}
                className="h-9 px-3 text-xs font-mono bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 hover:border-amber-500 text-amber-800 dark:text-amber-300 rounded"
              >
                Note On C4 [0x90, 60, 112]
              </button>
              <button
                type="button"
                onClick={() => void sendMidiCommand([0x80, 60, 0])}
                className="h-9 px-3 text-xs font-mono bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500 text-slate-700 dark:text-slate-300 rounded"
              >
                Note Off C4 [0x80, 60, 0]
              </button>
              <button
                type="button"
                onClick={() => {
                  void sendMidiCommand([0x90, 64, 100]);
                  void sendMidiCommand([0x90, 67, 100]);
                  void sendMidiCommand([0x90, 72, 108]);
                  setTimeout(() => {
                    void sendMidiCommand([0x80, 64, 0]);
                    void sendMidiCommand([0x80, 67, 0]);
                    void sendMidiCommand([0x80, 72, 0]);
                  }, 750);
                }}
                className="h-9 px-3 text-xs font-medium bg-amber-500/15 border border-amber-500/50 text-amber-800 dark:text-amber-300 rounded inline-flex items-center gap-1.5"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>Trigger Triad</span>
              </button>
              <button
                type="button"
                onClick={() => void sendMidiCommand([0xb0, 1, 96])}
                className="h-9 px-3 text-xs font-mono bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 hover:border-cyan-500 text-cyan-800 dark:text-cyan-300 rounded"
              >
                CC1 Mod [0xB0, 1, 96]
              </button>
              <button
                type="button"
                onClick={() => void sendMidiCommand([0xc0, 40])}
                className="h-9 px-3 text-xs font-mono bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 hover:border-cyan-500 text-cyan-800 dark:text-cyan-300 rounded"
              >
                GM Violin [0xC0, 40]
              </button>
            </div>

            <form onSubmit={handleSendCustomBytes} className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={rawMidiInput}
                onChange={(e) => setRawMidiInput(e.target.value)}
                placeholder="e.g. 0x90, 64, 100"
                className="flex-1 h-10 px-3 text-xs font-mono bg-slate-50 dark:bg-[#07090E] border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500 dark:focus:border-cyan-400"
              />
              <button
                type="submit"
                className="h-10 px-4 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 rounded inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send MIDI</span>
              </button>
            </form>

            <div className="bg-slate-50 dark:bg-[#07090E] border border-slate-200 dark:border-slate-800 rounded p-2.5 h-32 overflow-y-auto space-y-1 font-mono text-[11px]">
              {midiLog.length === 0 ? (
                <div className="text-slate-500">No MIDI events dispatched yet.</div>
              ) : (
                midiLog.slice(0, 15).map((entry, idx) => (
                  <div key={`${entry.timestamp}-${idx}`} className="flex items-center justify-between gap-2 text-slate-700 dark:text-slate-300">
                    <span className="text-cyan-700 dark:text-cyan-400">
                      [{entry.bytes.map((b) => `0x${b.toString(16).toUpperCase().padStart(2, '0')}`).join(', ')}]
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 truncate">{entry.summary}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Column 2: Portable JSON Patch Inspector & Live Loader */}
        <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-lg flex flex-col overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              3. Portable JSON Patch Blueprint ({patch.name})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const text = JSON.stringify(patch, null, 2);
                  setJsonEditorText(text);
                  void copyTextSafe(text, () => {
                    setCopiedJson(true);
                    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
                    copyTimerRef.current = window.setTimeout(() => setCopiedJson(false), 1800);
                  });
                }}
                className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300"
              >
                {copiedJson ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedJson ? 'Copied' : 'Copy JSON'}</span>
              </button>
              <button
                type="button"
                onClick={handleApplyJson}
                className="px-2.5 py-1 text-xs font-semibold bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 rounded"
              >
                Load JSON
              </button>
            </div>
          </div>
          <textarea
            value={jsonEditorText}
            onChange={(e) => setJsonEditorText(e.target.value)}
            spellCheck={false}
            className="flex-1 min-h-[320px] p-4 text-[11px] font-mono text-slate-800 dark:text-slate-300 bg-slate-50 dark:bg-[#07090E] focus:outline-none resize-none"
          />
          {jsonStatus && (
            <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-800 text-xs text-cyan-800 dark:text-cyan-300 bg-slate-100 dark:bg-[#0B0F17]">
              {jsonStatus}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (embeddedPage) {
    return body;
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 dark:bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-6xl h-[90vh] rounded-xl border border-slate-300 dark:border-slate-700 overflow-hidden shadow-2xl">
        {body}
      </div>
    </div>
  );
};
