import React from 'react';
import { Play, Pause, Square, Repeat, Usb, Volume2, RefreshCw } from 'lucide-react';
import { MidiControllerState } from '../engine/MidiController';
import { TunePlaybackState } from '../engine/TunePlayer';
import { MidiActivityEvent, TuneSequence } from '../engine/types';
import { PrecisionSlider } from './PrecisionSlider';

interface MidiAndTransportBarProps {
  tunes: TuneSequence[];
  tuneState: TunePlaybackState;
  midiState: MidiControllerState;
  lastMidiEvent: MidiActivityEvent | null;
  audioOutputDevices?: { deviceId: string; label: string }[];
  selectedOutputDeviceId?: string;
  outputSelectionSupported?: boolean;
  onSelectOutputDevice?: (id: string) => void;
  onRefreshAudioOutputs?: () => void;
  onSelectTune: (tune: TuneSequence) => void;
  onTogglePlay: () => void;
  onStop: () => void;
  onChangeBpm: (bpm: number) => void;
  onToggleLoop: () => void;
  onConnectMidi: () => void;
  onSelectMidiDevice: (id: string | 'all') => void;
}

export const MidiAndTransportBar: React.FC<MidiAndTransportBarProps> = ({
  tunes,
  tuneState,
  midiState,
  lastMidiEvent,
  audioOutputDevices = [],
  selectedOutputDeviceId = 'default',
  outputSelectionSupported = false,
  onSelectOutputDevice,
  onRefreshAudioOutputs,
  onSelectTune,
  onTogglePlay,
  onStop,
  onChangeBpm,
  onToggleLoop,
  onConnectMidi,
  onSelectMidiDevice,
}) => {
  const progressPct =
    tuneState.totalBeats > 0
      ? Math.min(100, (tuneState.currentBeat / tuneState.totalBeats) * 100)
      : 0;

  return (
    <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-lg p-3 flex flex-col justify-between gap-2.5 h-full min-w-0 overflow-hidden">
      {/* Row 1: Tune Selector & Transport */}
      <div className="flex items-center justify-between gap-2 flex-wrap min-w-0">
        <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
          <select
            value={tuneState.tuneId || tunes[0]?.id || ''}
            onChange={(e) => {
              const found = tunes.find((t) => t.id === e.target.value);
              if (found) onSelectTune(found);
            }}
            className="h-9 px-2 text-xs bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100 min-w-[110px] max-w-full flex-1 focus:outline-none focus:border-amber-500 truncate"
          >
            {tunes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} ({t.origin})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onTogglePlay}
            className={`h-9 px-3 rounded text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              tuneState.isPlaying
                ? 'bg-amber-500 text-slate-950'
                : 'bg-amber-500/15 border border-amber-500/60 dark:border-amber-500/50 text-amber-800 dark:text-amber-300 hover:bg-amber-500/25'
            }`}
          >
            {tuneState.isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Play Tune</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onStop}
            title="Stop tune"
            className="h-9 w-9 rounded bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 flex items-center justify-center shrink-0"
          >
            <Square className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onToggleLoop}
            title="Loop tune"
            className={`h-9 w-9 rounded border flex items-center justify-center shrink-0 transition-colors ${
              tuneState.loop
                ? 'bg-cyan-500/15 border-cyan-600/50 dark:border-cyan-500/50 text-cyan-800 dark:text-cyan-300'
                : 'bg-slate-50 dark:bg-[#0B0F17] border-slate-300 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
          </button>
        </div>

        <PrecisionSlider
          compact
          label="Tempo"
          value={tuneState.bpm}
          min={40}
          max={240}
          step={1}
          integer
          unit="BPM"
          accent="cyan"
          onChange={onChangeBpm}
          className="w-48 sm:w-52 shrink-0 max-w-full"
        />
      </div>

      {/* Progress Strip */}
      <div className="h-1.5 w-full bg-slate-200 dark:bg-[#07090E] rounded-full overflow-hidden border border-slate-300/70 dark:border-slate-800/70">
        <div
          className="h-full bg-amber-500 transition-[width] duration-75"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Row 2: Hardware Web MIDI Input & Audio Output Target */}
      <div className="flex items-center justify-between gap-2 flex-wrap pt-0.5 text-xs">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <button
            type="button"
            onClick={onConnectMidi}
            className={`h-8 px-2.5 rounded border inline-flex items-center gap-1.5 text-[11px] font-medium transition-colors whitespace-nowrap ${
              midiState.connected
                ? 'bg-cyan-500/12 border-cyan-600/50 dark:border-cyan-500/40 text-cyan-800 dark:text-cyan-300'
                : 'bg-slate-50 dark:bg-[#0B0F17] border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-cyan-600/50 dark:hover:border-cyan-500/50'
            }`}
          >
            <Usb className="w-3.5 h-3.5" />
            <span>
              {midiState.connected
                ? `MIDI (${midiState.devices.length})`
                : 'MIDI Input'}
            </span>
          </button>

          {midiState.connected && midiState.devices.length > 0 && (
            <select
              value={midiState.selectedDeviceId}
              onChange={(e) => onSelectMidiDevice(e.target.value)}
              aria-label="MIDI input device"
              className="h-8 px-2 text-[11px] bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 rounded text-slate-800 dark:text-slate-200 max-w-[140px]"
            >
              <option value="all">All MIDI Devices</option>
              {midiState.devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}

          <div className="inline-flex items-center gap-1 min-w-0">
            <Volume2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <select
              value={outputSelectionSupported ? selectedOutputDeviceId : 'default'}
              onChange={(e) => onSelectOutputDevice?.(e.target.value)}
              disabled={!outputSelectionSupported}
              aria-label="Audio output target"
              title={
                outputSelectionSupported
                  ? 'Select speaker, headphone, or audio interface output target'
                  : 'Audio output target selection requires AudioContext.setSinkId support'
              }
              className="h-8 px-2 text-[11px] bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 rounded text-slate-800 dark:text-slate-200 max-w-[165px] focus:outline-none focus:border-amber-500 disabled:opacity-55 truncate"
            >
              <option value="default">
                {outputSelectionSupported ? 'Default Output' : 'Default Output (Fixed)'}
              </option>
              {outputSelectionSupported &&
                audioOutputDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))}
            </select>
            {outputSelectionSupported && onRefreshAudioOutputs && (
              <button
                type="button"
                onClick={onRefreshAudioOutputs}
                title="Detect or refresh audio output devices"
                aria-label="Refresh audio output devices"
                className="h-8 w-8 rounded bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-amber-500 flex items-center justify-center shrink-0 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
          {midiState.error ? (
            <span className="text-amber-700 dark:text-amber-400">{midiState.error}</span>
          ) : lastMidiEvent ? (
            <span className="text-cyan-700 dark:text-cyan-300">{lastMidiEvent.summary}</span>
          ) : (
            <span>Ready · Play keys or tune</span>
          )}
        </div>
      </div>
    </div>
  );
};
