/**
 * Procedural sound. Every effect is synthesised at runtime, so the game ships
 * with no audio files and starts instantly on any platform.
 */
type Voice = {
  type: OscillatorType;
  freq: number;
  freqTo?: number;
  dur: number;
  gain: number;
  noise?: boolean;
};

const RECIPES: Record<string, Voice[]> = {
  plant: [{ type: 'triangle', freq: 420, freqTo: 620, dur: 0.12, gain: 0.18 }],
  shovel: [{ type: 'sawtooth', freq: 260, freqTo: 120, dur: 0.14, gain: 0.14 }],
  solar: [
    { type: 'sine', freq: 880, freqTo: 1320, dur: 0.13, gain: 0.16 },
    { type: 'sine', freq: 1320, dur: 0.09, gain: 0.08 },
  ],
  leaf: [
    { type: 'triangle', freq: 660, freqTo: 1180, dur: 0.16, gain: 0.18 },
    { type: 'sine', freq: 1760, dur: 0.12, gain: 0.07 },
  ],
  ultimate: [
    { type: 'sawtooth', freq: 180, freqTo: 900, dur: 0.45, gain: 0.2 },
    { type: 'square', freq: 90, freqTo: 420, dur: 0.4, gain: 0.1 },
  ],
  drone: [{ type: 'square', freq: 140, freqTo: 520, dur: 0.5, gain: 0.14 }],
  hugeWave: [
    { type: 'sawtooth', freq: 120, freqTo: 60, dur: 0.9, gain: 0.18 },
    { type: 'square', freq: 61, dur: 0.9, gain: 0.06 },
  ],
  deploy: [{ type: 'square', freq: 220, freqTo: 110, dur: 0.16, gain: 0.14 }],
  scheme: [{ type: 'sawtooth', freq: 320, freqTo: 90, dur: 0.3, gain: 0.16 }],
  win: [
    { type: 'triangle', freq: 523, dur: 0.16, gain: 0.18 },
    { type: 'triangle', freq: 659, dur: 0.16, gain: 0.18 },
    { type: 'triangle', freq: 784, dur: 0.3, gain: 0.2 },
  ],
  lose: [
    { type: 'sawtooth', freq: 320, freqTo: 70, dur: 0.9, gain: 0.2 },
  ],
  click: [{ type: 'square', freq: 700, dur: 0.05, gain: 0.08 }],
};

export class Sfx {
  private audio: AudioContext | null = null;
  enabled = true;

  /** Must be called from a user gesture on mobile browsers. */
  resume(): void {
    if (!this.audio) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.audio = new Ctor();
    }
    if (this.audio.state === 'suspended') void this.audio.resume();
  }

  play(id: string): void {
    if (!this.enabled) return;
    const recipe = RECIPES[id];
    if (!recipe) return;
    this.resume();
    const ac = this.audio;
    if (!ac) return;

    let delay = 0;
    for (const v of recipe) {
      const t0 = ac.currentTime + delay;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = v.type;
      osc.frequency.setValueAtTime(v.freq, t0);
      if (v.freqTo !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, v.freqTo), t0 + v.dur);
      }
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(v.gain, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + v.dur);
      osc.connect(gain).connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + v.dur + 0.02);
      // Chords play together; melodies (win) step forward.
      if (id === 'win') delay += v.dur * 0.75;
    }
  }
}

export const sfx = new Sfx();
