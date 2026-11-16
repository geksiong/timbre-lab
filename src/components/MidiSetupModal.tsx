import React from 'react';
import { Usb, X, RefreshCw, Volume2 } from 'lucide-react';
import { MidiControllerState } from '../engine/MidiController';
import { MidiActivityEvent } from '../engine/types';

interface MidiSetupModalProps {
  midiState: MidiControllerState;
  midiLog: MidiActivityEvent[];
  audioOutputDevices: { deviceId: string; label: string }[];
  selectedOutputDeviceId: string;
  outputSelectionSupported: boolean;
  onSelectOutputDevice: (id: string) => void;
  onRefreshAudioOutputs: () => void;
  onConnectMidi: () => void;
  onSelectDevice: (id: string | 'all') => void;
  onClose: () => void;
}

export const MidiSetupModal: React.FC<MidiSetupModalProps> = ({
  midiState,
  midiLog,
  audioOutputDevices,
  selectedOutputDeviceId,
  outputSelectionSupported,
  onSelectOutputDevice,
  onRefreshAudioOutputs,
  onConnectMidi,
  onSelectDevice,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 dark:bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white dark:bg-[#111622] border border-slate-300 dark:border-slate-700 rounded-xl overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Hardware MIDI Controller & Keyboard Setup
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Connect USB or virtual MIDI controllers via Web MIDI API, or test with your computer keyboard.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
          <div className="flex items-center justify-between gap-3 flex-wrap p-3.5 rounded-lg bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800">
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Web MIDI Interface
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                {midiState.supported
                  ? midiState.connected
                    ? `${midiState.devices.length} input device(s) detected`
                    : 'Click Enable to grant browser MIDI access'
                  : 'Web MIDI API is unavailable in this browser'}
              </div>
            </div>
            <button
              type="button"
              onClick={onConnectMidi}
              disabled={!midiState.supported}
              className="inline-flex items-center gap-1.5 h-10 px-4 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 disabled:opacity-40 rounded-md whitespace-nowrap"
            >
              {midiState.connected ? (
                <RefreshCw className="w-3.5 h-3.5" />
              ) : (
                <Usb className="w-3.5 h-3.5" />
              )}
              <span>{midiState.connected ? 'Refresh Devices' : 'Enable Web MIDI'}</span>
            </button>
          </div>

          {midiState.error && (
            <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/40 text-xs text-amber-800 dark:text-amber-300">
              {midiState.error}
            </div>
          )}

          {midiState.devices.length > 0 && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                Active MIDI Input Port
              </label>
              <select
                value={midiState.selectedDeviceId}
                onChange={(e) => onSelectDevice(e.target.value)}
                className="w-full h-10 px-3 text-xs bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
              >
                <option value="all">Listen to All Connected MIDI Devices</option>
                {midiState.devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.manufacturer})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Audio Output Target */}
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Audio Output Target</span>
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  {outputSelectionSupported
                    ? 'Route synthesizer output to speakers, headphones, or an external audio interface.'
                    : 'Audio output target selection requires AudioContext.setSinkId (Chrome / Edge desktop).'}
                </div>
              </div>
              {outputSelectionSupported && (
                <button
                  type="button"
                  onClick={onRefreshAudioOutputs}
                  className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium bg-white dark:bg-[#111622] border border-slate-300 dark:border-slate-700 hover:border-amber-500 text-slate-800 dark:text-slate-100 rounded-md whitespace-nowrap transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Detect Outputs</span>
                </button>
              )}
            </div>
            <select
              value={outputSelectionSupported ? selectedOutputDeviceId : 'default'}
              onChange={(e) => onSelectOutputDevice(e.target.value)}
              disabled={!outputSelectionSupported}
              aria-label="Audio output target"
              className="w-full h-10 px-3 text-xs bg-white dark:bg-[#111622] border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500 disabled:opacity-50"
            >
              <option value="default">
                {outputSelectionSupported
                  ? 'System Default Audio Output'
                  : 'System Default Audio Output (Routing unsupported)'}
              </option>
              {outputSelectionSupported &&
                audioOutputDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))}
            </select>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Supported MIDI Messages
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800">
                <span className="font-mono text-amber-700 dark:text-amber-400">0x90 / 0x80</span>
                <span className="text-slate-600 dark:text-slate-400 ml-2">Polyphonic Note On/Off + Velocity</span>
              </div>
              <div className="p-2.5 rounded bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800">
                <span className="font-mono text-cyan-700 dark:text-cyan-400">0xE0</span>
                <span className="text-slate-600 dark:text-slate-400 ml-2">14-bit Pitch Bend (±2 semitones)</span>
              </div>
              <div className="p-2.5 rounded bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800">
                <span className="font-mono text-cyan-700 dark:text-cyan-400">CC1 / CC64 / CC74</span>
                <span className="text-slate-600 dark:text-slate-400 ml-2">Mod Wheel, Sustain, Filter Cutoff</span>
              </div>
              <div className="p-2.5 rounded bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800">
                <span className="font-mono text-amber-700 dark:text-amber-400">0xC0 (0–127)</span>
                <span className="text-slate-600 dark:text-slate-400 ml-2">General MIDI Program Change</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Recent MIDI Activity
            </h3>
            <div className="h-28 overflow-y-auto p-2.5 rounded bg-slate-50 dark:bg-[#07090E] border border-slate-200 dark:border-slate-800 font-mono text-[11px] space-y-1">
              {midiLog.length === 0 ? (
                <div className="text-slate-500">Waiting for MIDI input events...</div>
              ) : (
                midiLog.slice(0, 12).map((ev, i) => (
                  <div key={`${ev.timestamp}-${i}`} className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                    <span className="text-cyan-700 dark:text-cyan-400">
                      [{ev.bytes.map((b) => `0x${b.toString(16).toUpperCase().padStart(2, '0')}`).join(', ')}]
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">{ev.summary}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
