import { SynthEngine } from './SynthEngine';
import { TuneSequence } from './types';

export interface TunePlaybackState {
  isPlaying: boolean;
  tuneId: string | null;
  currentBeat: number;
  totalBeats: number;
  bpm: number;
  loop: boolean;
}

export class TunePlayer {
  private engine: SynthEngine;
  private tune: TuneSequence | null = null;
  private isPlaying = false;
  private loop = true;
  private bpm = 100;
  private currentBeat = 0;

  private timerId: number | null = null;
  private lastTickMs = 0;
  private playSessionId = 0;
  private triggeredNotes = new Set<number>();
  private activeNoteOffs: { endBeat: number; midi: number }[] = [];

  private listeners = new Set<(state: TunePlaybackState) => void>();

  constructor(engine: SynthEngine) {
    this.engine = engine;
  }

  public setTune(tune: TuneSequence, overrideBpm?: number): void {
    const wasPlaying = this.isPlaying;
    this.stop();
    this.tune = tune;
    this.bpm = overrideBpm ?? tune.bpm;
    this.currentBeat = 0;
    this.emit();
    if (wasPlaying) {
      void this.play();
    }
  }

  public setBpm(bpm: number): void {
    if (!Number.isFinite(bpm)) return;
    this.bpm = Math.max(40, Math.min(240, bpm));
    this.emit();
  }

  public setLoop(loop: boolean): void {
    this.loop = loop;
    this.emit();
  }

  public async play(): Promise<void> {
    if (!this.tune || this.isPlaying) return;
    const session = ++this.playSessionId;
    await this.engine.init();
    if (session !== this.playSessionId || !this.tune || this.isPlaying) return;
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.isPlaying = true;
    this.lastTickMs = performance.now();
    this.emit();

    this.timerId = window.setInterval(() => this.tick(), 4);
  }

  public pause(): void {
    this.playSessionId++;
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.flushActiveNotes();
    this.emit();
  }

  public stop(): void {
    this.playSessionId++;
    this.isPlaying = false;
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.flushActiveNotes();
    this.triggeredNotes.clear();
    this.currentBeat = 0;
    this.emit();
  }

  public getState(): TunePlaybackState {
    return {
      isPlaying: this.isPlaying,
      tuneId: this.tune?.id ?? null,
      currentBeat: this.currentBeat,
      totalBeats: this.tune?.totalBeats ?? 0,
      bpm: this.bpm,
      loop: this.loop,
    };
  }

  public onStateChange(cb: (state: TunePlaybackState) => void): () => void {
    this.listeners.add(cb);
    cb(this.getState());
    return () => this.listeners.delete(cb);
  }

  private tick(): void {
    if (!this.isPlaying || !this.tune) return;

    const nowMs = performance.now();
    const dtSec = Math.min(0.08, Math.max(0, (nowMs - this.lastTickMs) / 1000));
    this.lastTickMs = nowMs;

    const prevBeat = this.currentBeat;
    const beatsElapsed = dtSec * (this.bpm / 60);
    this.currentBeat += beatsElapsed;

    // Trigger note offs
    for (let i = this.activeNoteOffs.length - 1; i >= 0; i--) {
      const item = this.activeNoteOffs[i];
      if (this.currentBeat >= item.endBeat) {
        this.engine.noteOff(item.midi);
        this.activeNoteOffs.splice(i, 1);
      }
    }

    // Trigger new notes
    this.tune.notes.forEach((n, idx) => {
      if (!this.triggeredNotes.has(idx) && n.beat >= prevBeat && n.beat <= this.currentBeat) {
        this.triggeredNotes.add(idx);
        void this.engine.noteOn(n.midi, n.velocity, undefined, 'tune');
        this.activeNoteOffs.push({
          endBeat: n.beat + n.duration,
          midi: n.midi,
        });
      }
    });

    if (this.currentBeat >= this.tune.totalBeats) {
      this.triggeredNotes.clear();
      if (this.loop) {
        for (const item of this.activeNoteOffs) {
          this.engine.noteOff(item.midi);
        }
        this.activeNoteOffs = [];
        const total = Math.max(0.25, this.tune.totalBeats);
        const wrappedBeat = (this.currentBeat - total) % total;
        this.currentBeat = wrappedBeat;

        // Immediately trigger notes within [0, wrappedBeat] so beat-0 notes never get skipped or drift
        this.tune.notes.forEach((n, idx) => {
          if (n.beat >= 0 && n.beat <= wrappedBeat) {
            this.triggeredNotes.add(idx);
            void this.engine.noteOn(n.midi, n.velocity, undefined, 'tune');
            this.activeNoteOffs.push({
              endBeat: n.beat + n.duration,
              midi: n.midi,
            });
          }
        });
      } else {
        this.flushActiveNotes();
        this.stop();
        return;
      }
    }

    this.emit();
  }

  private flushActiveNotes(): void {
    for (const item of this.activeNoteOffs) {
      this.engine.noteOff(item.midi);
    }
    this.activeNoteOffs = [];
    this.engine.allNotesOff();
  }

  private emit(): void {
    const state = this.getState();
    for (const cb of this.listeners) {
      cb(state);
    }
  }
}
