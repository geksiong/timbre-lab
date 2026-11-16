import { SynthEngine } from './SynthEngine';
import { MidiDeviceInfo } from './types';

export interface MidiControllerState {
  supported: boolean;
  connected: boolean;
  devices: MidiDeviceInfo[];
  selectedDeviceId: string | 'all';
  error: string | null;
}

export class MidiController {
  private engine: SynthEngine;
  private access: MIDIAccess | null = null;
  private selectedDeviceId: string | 'all' = 'all';
  private error: string | null = null;
  private listeners = new Set<(state: MidiControllerState) => void>();

  constructor(engine: SynthEngine) {
    this.engine = engine;
  }

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
  }

  public async connect(): Promise<void> {
    if (!this.isSupported()) {
      this.error = 'Web MIDI API is not supported in this browser.';
      this.emit();
      return;
    }

    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      this.error = null;
      this.bindInputs();
      this.access.onstatechange = () => {
        this.bindInputs();
        this.emit();
      };
      this.emit();
    } catch {
      this.error = 'MIDI permission denied or no MIDI hardware available.';
      this.emit();
    }
  }

  public selectDevice(id: string | 'all'): void {
    this.selectedDeviceId = id;
    this.bindInputs();
    this.emit();
  }

  public getState(): MidiControllerState {
    const devices: MidiDeviceInfo[] = [];
    if (this.access) {
      this.access.inputs.forEach((input) => {
        devices.push({
          id: input.id,
          name: input.name || 'MIDI Input Device',
          manufacturer: input.manufacturer || 'Generic',
          state: input.state,
        });
      });
    }

    return {
      supported: this.isSupported(),
      connected: Boolean(this.access),
      devices,
      selectedDeviceId: this.selectedDeviceId,
      error: this.error,
    };
  }

  public onStateChange(cb: (state: MidiControllerState) => void): () => void {
    this.listeners.add(cb);
    cb(this.getState());
    return () => this.listeners.delete(cb);
  }

  private bindInputs(): void {
    if (!this.access) return;
    this.access.inputs.forEach((input) => {
      input.onmidimessage = (event: MIDIMessageEvent) => {
        if (this.selectedDeviceId !== 'all' && input.id !== this.selectedDeviceId) {
          return;
        }
        if (event.data) {
          this.engine.handleMidiMessage(event.data, event.timeStamp);
        }
      };
    });
  }

  private emit(): void {
    const state = this.getState();
    for (const cb of this.listeners) {
      cb(state);
    }
  }
}
