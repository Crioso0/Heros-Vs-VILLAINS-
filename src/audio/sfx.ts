/**
 * Procedural audio.
 *
 * Every sound is synthesised at runtime — the game ships no audio files, so it
 * starts instantly and works offline. This is a small synth rather than a
 * sample player: oscillator voices, filtered noise, FM, an envelope per voice,
 * and a stereo pan derived from where the thing happened on the board.
 *
 * Three buses so the mix stays under control when forty things happen at once:
 *   sfx     one-shots, hard-limited to MAX_VOICES concurrent
 *   music   the adaptive bed
 *   amb     the per-world ambience loop
 */

import { clamp } from '../core/math';

const MAX_VOICES = 22;

export interface PlayOpts {
  /** Multiplies every frequency in the recipe. 1 == as written. */
  pitch?: number;
  /** Multiplies the recipe's gain. */
  gain?: number;
  /** -1 hard left .. 1 hard right. */
  pan?: number;
}

type Ctx = AudioContext;

/* ------------------------------------------------------------------ *
 * Primitives
 * ------------------------------------------------------------------ */

interface ToneSpec {
  type?: OscillatorType;
  /** Start frequency. */
  f: number;
  /** Optional glide target. */
  to?: number;
  dur: number;
  gain: number;
  /** Seconds. A short attack is a click; a long one is a swell. */
  attack?: number;
  /** Exponential vs linear decay. */
  hold?: number;
  delay?: number;
  detune?: number;
  /** Low-pass cutoff; omitted means no filter. */
  lp?: number;
  lpTo?: number;
  /** Ring/tremolo depth via a gain LFO. */
  wobble?: { rate: number; depth: number };
}

interface NoiseSpec {
  dur: number;
  gain: number;
  attack?: number;
  delay?: number;
  /** Band-pass centre, swept from -> to. */
  bp?: number;
  bpTo?: number;
  q?: number;
  hp?: number;
}

interface FmSpec {
  carrier: number;
  carrierTo?: number;
  ratio: number;
  index: number;
  indexTo?: number;
  dur: number;
  gain: number;
  attack?: number;
  delay?: number;
}

type Part =
  | ({ kind: 'tone' } & ToneSpec)
  | ({ kind: 'noise' } & NoiseSpec)
  | ({ kind: 'fm' } & FmSpec);

const tone = (s: ToneSpec): Part => ({ kind: 'tone', ...s });
const noise = (s: NoiseSpec): Part => ({ kind: 'noise', ...s });
const fm = (s: FmSpec): Part => ({ kind: 'fm', ...s });

/** One shared noise buffer; allocating one per shot is what kills mobile. */
let noiseBuffer: AudioBuffer | null = null;
function getNoise(ac: Ctx): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ac.sampleRate) return noiseBuffer;
  const len = Math.floor(ac.sampleRate * 1.2);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    // Slightly brown-ish noise reads warmer than pure white.
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    d[i] = w * 0.7 + last * 3;
  }
  noiseBuffer = buf;
  return buf;
}

/* ------------------------------------------------------------------ *
 * The recipes
 * ------------------------------------------------------------------ */

/**
 * Per-projectile shot voices. Each hero archetype has its own sound, which is
 * what makes a board of ten heroes read as ten characters rather than one.
 */
const SHOT: Record<string, () => Part[]> = {
  bolt: () => [
    tone({ type: 'square', f: 880, to: 1500, dur: 0.09, gain: 0.1, lp: 3200 }),
    tone({ type: 'sine', f: 440, to: 760, dur: 0.07, gain: 0.06 }),
  ],
  frost: () => [
    noise({ dur: 0.16, gain: 0.07, bp: 5200, bpTo: 2400, q: 8 }),
    tone({ type: 'triangle', f: 1500, to: 2400, dur: 0.12, gain: 0.05 }),
  ],
  beam: () => [
    tone({ type: 'sawtooth', f: 180, to: 90, dur: 0.34, gain: 0.11, lp: 2600, lpTo: 700 }),
    tone({ type: 'square', f: 1200, to: 420, dur: 0.28, gain: 0.05 }),
    noise({ dur: 0.3, gain: 0.045, bp: 1800, bpTo: 500, q: 3 }),
  ],
  construct: () => [
    fm({ carrier: 320, carrierTo: 500, ratio: 1.5, index: 220, indexTo: 20, dur: 0.22, gain: 0.09 }),
    tone({ type: 'sine', f: 660, to: 990, dur: 0.18, gain: 0.05, attack: 0.02 }),
  ],
  arrow: () => [
    noise({ dur: 0.11, gain: 0.08, bp: 2600, bpTo: 6500, q: 6 }),
    tone({ type: 'triangle', f: 240, to: 150, dur: 0.07, gain: 0.04 }),
  ],
  shield: () => [
    tone({ type: 'triangle', f: 520, to: 300, dur: 0.3, gain: 0.09, wobble: { rate: 26, depth: 0.5 } }),
    tone({ type: 'sine', f: 1040, dur: 0.16, gain: 0.04 }),
  ],
  web: () => [
    noise({ dur: 0.18, gain: 0.075, bp: 900, bpTo: 3400, q: 2.5 }),
    tone({ type: 'sine', f: 300, to: 520, dur: 0.1, gain: 0.03 }),
  ],
  spark: () => [
    tone({ type: 'sawtooth', f: 1400, to: 2600, dur: 0.07, gain: 0.075, lp: 6000 }),
    noise({ dur: 0.1, gain: 0.06, bp: 4200, bpTo: 9000, q: 4 }),
  ],
  shard: () => [
    tone({ type: 'sine', f: 380, to: 190, dur: 0.24, gain: 0.09, lp: 1600 }),
    noise({ dur: 0.22, gain: 0.05, bp: 700, bpTo: 300, q: 2 }),
  ],
  batarang: () => [
    noise({ dur: 0.2, gain: 0.06, bp: 3000, bpTo: 1400, q: 9 }),
    tone({ type: 'triangle', f: 700, to: 480, dur: 0.16, gain: 0.05, wobble: { rate: 34, depth: 0.7 } }),
  ],
  blast: () => [
    tone({ type: 'sawtooth', f: 260, to: 120, dur: 0.16, gain: 0.1, lp: 2200, lpTo: 600 }),
    noise({ dur: 0.14, gain: 0.06, bp: 1200, bpTo: 400, q: 2 }),
  ],
};

/** Signature stings for the Leaf Mode ultimates, keyed by ultimate id. */
const ULTIMATE: Record<string, () => Part[]> = {
  heat_vision: () => [
    tone({ type: 'sawtooth', f: 140, to: 1200, dur: 0.5, gain: 0.13, lp: 900, lpTo: 6000 }),
    tone({ type: 'square', f: 70, to: 600, dur: 0.55, gain: 0.07 }),
    noise({ dur: 0.6, gain: 0.06, bp: 900, bpTo: 5200, q: 1.5, delay: 0.05 }),
  ],
  construct_fist: () => [
    fm({ carrier: 120, carrierTo: 70, ratio: 2, index: 500, indexTo: 40, dur: 0.5, gain: 0.14 }),
    tone({ type: 'sine', f: 320, to: 120, dur: 0.45, gain: 0.08, delay: 0.04 }),
  ],
  thunderstorm: () => [
    noise({ dur: 0.7, gain: 0.13, bp: 4000, bpTo: 200, q: 0.9 }),
    tone({ type: 'sawtooth', f: 90, to: 40, dur: 0.7, gain: 0.09, lp: 800 }),
  ],
  deep_freeze: () => [
    noise({ dur: 0.5, gain: 0.09, bp: 7000, bpTo: 1200, q: 5 }),
    tone({ type: 'triangle', f: 2000, to: 500, dur: 0.5, gain: 0.07 }),
  ],
  thunderclap: () => [
    noise({ dur: 0.45, gain: 0.15, bp: 1600, bpTo: 120, q: 1 }),
    tone({ type: 'sine', f: 110, to: 40, dur: 0.5, gain: 0.11 }),
  ],
  barrage: () => [
    tone({ type: 'square', f: 600, to: 1400, dur: 0.3, gain: 0.09, wobble: { rate: 24, depth: 0.8 } }),
  ],
  speed_force: () => [
    noise({ dur: 0.5, gain: 0.09, bp: 800, bpTo: 6000, q: 2 }),
    tone({ type: 'sawtooth', f: 300, to: 1800, dur: 0.4, gain: 0.06 }),
  ],
  tidal_wave: () => [
    noise({ dur: 0.8, gain: 0.11, bp: 400, bpTo: 1800, q: 1.2 }),
    tone({ type: 'sine', f: 90, to: 200, dur: 0.7, gain: 0.06 }),
  ],
  banishment: () => [
    fm({ carrier: 400, carrierTo: 80, ratio: 3.3, index: 600, indexTo: 30, dur: 0.6, gain: 0.11 }),
  ],
  magnetic_purge: () => [
    tone({ type: 'sawtooth', f: 200, to: 1600, dur: 0.4, gain: 0.1, lp: 1500, lpTo: 7000 }),
    noise({ dur: 0.35, gain: 0.07, bp: 2500, bpTo: 6000, q: 3, delay: 0.06 }),
  ],
};

/** Everything else. */
const RECIPES: Record<string, () => Part[]> = {
  /* --- UI ------------------------------------------------------- */
  click: () => [tone({ type: 'square', f: 760, dur: 0.045, gain: 0.05, lp: 4000 })],
  hover: () => [tone({ type: 'sine', f: 1100, dur: 0.03, gain: 0.02 })],
  invalid: () => [
    tone({ type: 'square', f: 200, to: 140, dur: 0.12, gain: 0.06 }),
    tone({ type: 'square', f: 150, dur: 0.1, gain: 0.04, delay: 0.06 }),
  ],
  select: () => [tone({ type: 'triangle', f: 640, to: 900, dur: 0.07, gain: 0.06 })],

  /* --- placing -------------------------------------------------- */
  plant: () => [
    tone({ type: 'triangle', f: 380, to: 620, dur: 0.13, gain: 0.1, attack: 0.004 }),
    noise({ dur: 0.09, gain: 0.05, bp: 900, bpTo: 300, q: 2 }),
  ],
  shovel: () => [
    noise({ dur: 0.16, gain: 0.08, bp: 1800, bpTo: 500, q: 1.6 }),
    tone({ type: 'sawtooth', f: 240, to: 110, dur: 0.14, gain: 0.05 }),
  ],

  /* --- economy -------------------------------------------------- */
  // Pitch is varied by the caller to build a rising run on a fast streak.
  solar: () => [
    tone({ type: 'sine', f: 880, to: 1320, dur: 0.14, gain: 0.09, attack: 0.005 }),
    tone({ type: 'sine', f: 1760, dur: 0.1, gain: 0.035, delay: 0.03 }),
  ],
  solarLand: () => [tone({ type: 'sine', f: 500, to: 620, dur: 0.07, gain: 0.025 })],
  leaf: () => [
    tone({ type: 'triangle', f: 660, to: 1180, dur: 0.2, gain: 0.1 }),
    tone({ type: 'sine', f: 1760, to: 2200, dur: 0.16, gain: 0.05, delay: 0.04 }),
    noise({ dur: 0.2, gain: 0.03, bp: 3000, bpTo: 7000, q: 3 }),
  ],
  leafReady: () => [
    tone({ type: 'sine', f: 1320, dur: 0.09, gain: 0.045 }),
    tone({ type: 'sine', f: 1980, dur: 0.12, gain: 0.03, delay: 0.07 }),
  ],

  /* --- combat --------------------------------------------------- */
  hit: () => [noise({ dur: 0.05, gain: 0.035, bp: 1600, bpTo: 700, q: 2 })],
  armor: () => [
    noise({ dur: 0.07, gain: 0.05, bp: 3800, bpTo: 2000, q: 9 }),
    tone({ type: 'square', f: 1500, dur: 0.04, gain: 0.02 }),
  ],
  shieldBreak: () => [
    noise({ dur: 0.26, gain: 0.09, bp: 2600, bpTo: 600, q: 3 }),
    tone({ type: 'triangle', f: 700, to: 220, dur: 0.22, gain: 0.05 }),
  ],
  villainDown: () => [
    tone({ type: 'sawtooth', f: 260, to: 90, dur: 0.26, gain: 0.07, lp: 1400 }),
    noise({ dur: 0.2, gain: 0.05, bp: 800, bpTo: 250, q: 1.4 }),
  ],
  bigDown: () => [
    tone({ type: 'sawtooth', f: 160, to: 45, dur: 0.5, gain: 0.11, lp: 1100 }),
    noise({ dur: 0.45, gain: 0.08, bp: 600, bpTo: 120, q: 1 }),
  ],
  heroDown: () => [
    tone({ type: 'triangle', f: 420, to: 150, dur: 0.3, gain: 0.07 }),
    noise({ dur: 0.22, gain: 0.045, bp: 1200, bpTo: 400, q: 2 }),
  ],
  explode: () => [
    noise({ dur: 0.4, gain: 0.13, bp: 1800, bpTo: 120, q: 0.8 }),
    tone({ type: 'sine', f: 140, to: 45, dur: 0.4, gain: 0.09 }),
  ],
  chomp: () => [
    noise({ dur: 0.09, gain: 0.07, bp: 700, bpTo: 240, q: 3 }),
    tone({ type: 'sawtooth', f: 180, to: 90, dur: 0.08, gain: 0.05 }),
  ],
  freeze: () => [
    noise({ dur: 0.3, gain: 0.07, bp: 6000, bpTo: 1400, q: 6 }),
    tone({ type: 'triangle', f: 1600, to: 700, dur: 0.28, gain: 0.045 }),
  ],

  /* --- events --------------------------------------------------- */
  ultimate: () => [
    tone({ type: 'sawtooth', f: 180, to: 900, dur: 0.45, gain: 0.11, lp: 1200, lpTo: 6000 }),
    tone({ type: 'square', f: 90, to: 420, dur: 0.4, gain: 0.06 }),
  ],
  overdrive: () => [
    tone({ type: 'sawtooth', f: 110, to: 880, dur: 0.9, gain: 0.13, lp: 700, lpTo: 8000 }),
    tone({ type: 'square', f: 55, to: 440, dur: 0.9, gain: 0.07 }),
    noise({ dur: 0.9, gain: 0.06, bp: 500, bpTo: 6000, q: 1.2 }),
  ],
  drone: () => [
    tone({ type: 'square', f: 120, to: 620, dur: 0.5, gain: 0.1, wobble: { rate: 18, depth: 0.6 } }),
    noise({ dur: 0.5, gain: 0.06, bp: 900, bpTo: 3000, q: 2 }),
  ],
  hugeWave: () => [
    tone({ type: 'sawtooth', f: 130, to: 55, dur: 1.1, gain: 0.13, lp: 900 }),
    tone({ type: 'square', f: 65, dur: 1.1, gain: 0.05, delay: 0.05 }),
    noise({ dur: 1.0, gain: 0.05, bp: 300, bpTo: 90, q: 1 }),
  ],
  wave: () => [tone({ type: 'triangle', f: 300, to: 220, dur: 0.2, gain: 0.05 })],
  vault: () => [
    noise({ dur: 0.22, gain: 0.06, bp: 1200, bpTo: 4000, q: 3 }),
    tone({ type: 'sine', f: 300, to: 800, dur: 0.2, gain: 0.05 }),
  ],
  deploy: () => [
    tone({ type: 'square', f: 200, to: 100, dur: 0.18, gain: 0.08 }),
    noise({ dur: 0.14, gain: 0.05, bp: 700, bpTo: 250, q: 2 }),
  ],
  scheme: () => [
    fm({ carrier: 260, carrierTo: 90, ratio: 2.7, index: 340, indexTo: 20, dur: 0.35, gain: 0.1 }),
  ],

  /* --- results -------------------------------------------------- */
  win: () => [
    tone({ type: 'triangle', f: 523, dur: 0.18, gain: 0.1 }),
    tone({ type: 'triangle', f: 659, dur: 0.18, gain: 0.1, delay: 0.13 }),
    tone({ type: 'triangle', f: 784, dur: 0.18, gain: 0.1, delay: 0.26 }),
    tone({ type: 'triangle', f: 1047, dur: 0.5, gain: 0.12, delay: 0.39 }),
    tone({ type: 'sine', f: 1568, dur: 0.5, gain: 0.05, delay: 0.42 }),
  ],
  lose: () => [
    tone({ type: 'sawtooth', f: 320, to: 60, dur: 1.2, gain: 0.12, lp: 1400, lpTo: 300 }),
    tone({ type: 'square', f: 160, to: 40, dur: 1.2, gain: 0.05 }),
  ],
  unlock: () => [
    tone({ type: 'sine', f: 784, dur: 0.14, gain: 0.08 }),
    tone({ type: 'sine', f: 1047, dur: 0.14, gain: 0.08, delay: 0.1 }),
    tone({ type: 'sine', f: 1568, dur: 0.4, gain: 0.09, delay: 0.2 }),
  ],
};

/* ------------------------------------------------------------------ *
 * Engine
 * ------------------------------------------------------------------ */

export class Sfx {
  private ac: Ctx | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private ambBus: GainNode | null = null;
  private active = 0;
  private ambNodes: AudioScheduledSourceNode[] = [];
  private musicTimer: number | null = null;
  private musicStep = 0;
  private intensity = 0;
  private musicWorld = '';

  enabled = true;
  musicEnabled = true;

  /** Must be called from a user gesture before anything will be heard. */
  resume(): void {
    if (!this.ac) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ac = new Ctor();
      this.ac = ac;

      // A compressor keeps a wave of forty simultaneous hits from clipping.
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 24;
      comp.ratio.value = 8;
      comp.attack.value = 0.004;
      comp.release.value = 0.18;
      comp.connect(ac.destination);

      this.sfxBus = ac.createGain();
      this.sfxBus.gain.value = 0.9;
      this.sfxBus.connect(comp);

      this.musicBus = ac.createGain();
      this.musicBus.gain.value = 0.0;
      this.musicBus.connect(comp);

      this.ambBus = ac.createGain();
      this.ambBus.gain.value = 0.0;
      this.ambBus.connect(comp);
    }
    // iOS parks the context in a non-standard 'interrupted' state after a call
    // or backgrounding; only checking for 'suspended' never recovers from it.
    if (this.ac.state !== 'running') void this.ac.resume();
  }

  /* -------------------------------------------------------------- */

  play(id: string, opts: PlayOpts = {}): void {
    if (!this.enabled) return;
    const make = RECIPES[id];
    if (!make) return;
    this.emit(make(), opts);
  }

  /** A hero's shot, keyed by projectile kind with a per-hero pitch offset. */
  playShot(kind: string, heroId: string, pan = 0): void {
    if (!this.enabled) return;
    const make = SHOT[kind];
    if (!make) return;
    // Stable per-hero detune so two heroes firing the same projectile type
    // still sound like different characters.
    let h = 0;
    for (let i = 0; i < heroId.length; i++) h = (h * 31 + heroId.charCodeAt(i)) | 0;
    const pitch = 1 + ((h >>> 0) % 100) / 500 - 0.1; // ±10%
    this.emit(make(), { pitch, pan, gain: 0.85 });
  }

  playUltimate(ultId: string, pan = 0): void {
    if (!this.enabled) return;
    const make = ULTIMATE[ultId] ?? RECIPES.ultimate;
    this.emit(make(), { pan, gain: 1 });
  }

  private emit(parts: Part[], opts: PlayOpts): void {
    this.resume();
    const ac = this.ac;
    const bus = this.sfxBus;
    if (!ac || !bus) return;
    if (this.active > MAX_VOICES) return;

    const pitch = opts.pitch ?? 1;
    const gainMul = opts.gain ?? 1;
    const now = ac.currentTime;

    let dest: AudioNode = bus;
    if (opts.pan !== undefined && opts.pan !== 0 && ac.createStereoPanner) {
      const panner = ac.createStereoPanner();
      panner.pan.value = clamp(opts.pan, -1, 1);
      panner.connect(bus);
      dest = panner;
    }

    for (const part of parts) {
      const t0 = now + (part.delay ?? 0);
      this.active++;
      const done = () => {
        this.active = Math.max(0, this.active - 1);
      };
      if (part.kind === 'tone') this.tone(ac, dest, part, t0, pitch, gainMul, done);
      else if (part.kind === 'noise') this.noise(ac, dest, part, t0, pitch, gainMul, done);
      else this.fm(ac, dest, part, t0, pitch, gainMul, done);
    }
  }

  private env(
    ac: Ctx,
    t0: number,
    dur: number,
    gain: number,
    attack: number,
    hold: number,
  ): GainNode {
    const g = ac.createGain();
    const a = Math.max(0.001, attack);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + a);
    if (hold > 0) g.gain.setValueAtTime(Math.max(0.0002, gain), t0 + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    return g;
  }

  private tone(
    ac: Ctx,
    dest: AudioNode,
    s: ToneSpec,
    t0: number,
    pitch: number,
    gainMul: number,
    done: () => void,
  ): void {
    const osc = ac.createOscillator();
    osc.type = s.type ?? 'sine';
    if (s.detune) osc.detune.value = s.detune;
    osc.frequency.setValueAtTime(Math.max(20, s.f * pitch), t0);
    if (s.to !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, s.to * pitch), t0 + s.dur);
    }

    const g = this.env(ac, t0, s.dur, s.gain * gainMul, s.attack ?? 0.006, s.hold ?? 0);
    let node: AudioNode = osc;

    if (s.lp !== undefined) {
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(s.lp, t0);
      if (s.lpTo !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(60, s.lpTo), t0 + s.dur);
      node.connect(f);
      node = f;
    }

    if (s.wobble) {
      const lfo = ac.createOscillator();
      const lfoGain = ac.createGain();
      lfo.frequency.value = s.wobble.rate;
      lfoGain.gain.value = s.wobble.depth * s.gain * gainMul;
      lfo.connect(lfoGain).connect(g.gain);
      lfo.start(t0);
      lfo.stop(t0 + s.dur + 0.02);
    }

    node.connect(g).connect(dest);
    osc.start(t0);
    osc.stop(t0 + s.dur + 0.02);
    osc.onended = done;
  }

  private noise(
    ac: Ctx,
    dest: AudioNode,
    s: NoiseSpec,
    t0: number,
    pitch: number,
    gainMul: number,
    done: () => void,
  ): void {
    const src = ac.createBufferSource();
    src.buffer = getNoise(ac);
    src.loop = true;
    // Offset into the buffer so repeated hits do not phase-lock into a tone.
    const offset = Math.random() * 0.8;

    let node: AudioNode = src;
    if (s.bp !== undefined) {
      const f = ac.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = s.q ?? 3;
      f.frequency.setValueAtTime(Math.max(60, s.bp * pitch), t0);
      if (s.bpTo !== undefined) {
        f.frequency.exponentialRampToValueAtTime(Math.max(60, s.bpTo * pitch), t0 + s.dur);
      }
      node.connect(f);
      node = f;
    }
    if (s.hp !== undefined) {
      const f = ac.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = s.hp;
      node.connect(f);
      node = f;
    }

    const g = this.env(ac, t0, s.dur, s.gain * gainMul, s.attack ?? 0.003, 0);
    node.connect(g).connect(dest);
    src.start(t0, offset);
    src.stop(t0 + s.dur + 0.02);
    src.onended = done;
  }

  private fm(
    ac: Ctx,
    dest: AudioNode,
    s: FmSpec,
    t0: number,
    pitch: number,
    gainMul: number,
    done: () => void,
  ): void {
    const carrier = ac.createOscillator();
    const mod = ac.createOscillator();
    const modGain = ac.createGain();

    carrier.frequency.setValueAtTime(Math.max(20, s.carrier * pitch), t0);
    if (s.carrierTo !== undefined) {
      carrier.frequency.exponentialRampToValueAtTime(Math.max(20, s.carrierTo * pitch), t0 + s.dur);
    }
    mod.frequency.value = Math.max(20, s.carrier * pitch * s.ratio);
    modGain.gain.setValueAtTime(s.index, t0);
    modGain.gain.exponentialRampToValueAtTime(Math.max(1, s.indexTo ?? s.index), t0 + s.dur);
    mod.connect(modGain).connect(carrier.frequency);

    const g = this.env(ac, t0, s.dur, s.gain * gainMul, s.attack ?? 0.005, 0);
    carrier.connect(g).connect(dest);
    carrier.start(t0);
    mod.start(t0);
    carrier.stop(t0 + s.dur + 0.02);
    mod.stop(t0 + s.dur + 0.02);
    carrier.onended = done;
  }

  /* -------------------------------------------------------------- *
   * Ambience — a per-world bed, so the worlds sound different too
   * -------------------------------------------------------------- */

  startAmbience(world: 'rain' | 'wind' | 'hum' | 'heat' | 'none'): void {
    this.resume();
    const ac = this.ac;
    const bus = this.ambBus;
    if (!ac || !bus) return;
    this.stopAmbience();
    if (world === 'none' || !this.enabled) return;

    const src = ac.createBufferSource();
    src.buffer = getNoise(ac);
    src.loop = true;

    const f = ac.createBiquadFilter();
    const g = ac.createGain();

    switch (world) {
      case 'rain':
        f.type = 'bandpass';
        f.frequency.value = 3200;
        f.Q.value = 0.6;
        g.gain.value = 0.16;
        break;
      case 'wind':
        f.type = 'lowpass';
        f.frequency.value = 500;
        g.gain.value = 0.14;
        break;
      case 'hum':
        f.type = 'bandpass';
        f.frequency.value = 220;
        f.Q.value = 2.5;
        g.gain.value = 0.2;
        break;
      case 'heat':
        f.type = 'lowpass';
        f.frequency.value = 900;
        g.gain.value = 0.1;
        break;
    }

    // Slow drift so the loop never sounds like a loop.
    const lfo = ac.createOscillator();
    const lfoGain = ac.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = f.frequency.value * 0.25;
    lfo.connect(lfoGain).connect(f.frequency);
    lfo.start();

    src.connect(f).connect(g).connect(bus);
    src.start();

    bus.gain.cancelScheduledValues(ac.currentTime);
    bus.gain.setValueAtTime(bus.gain.value, ac.currentTime);
    bus.gain.linearRampToValueAtTime(1, ac.currentTime + 1.5);

    this.ambNodes = [src, lfo];
  }

  stopAmbience(): void {
    const ac = this.ac;
    if (ac && this.ambBus) {
      this.ambBus.gain.cancelScheduledValues(ac.currentTime);
      this.ambBus.gain.setValueAtTime(this.ambBus.gain.value, ac.currentTime);
      this.ambBus.gain.linearRampToValueAtTime(0, ac.currentTime + 0.4);
    }
    for (const n of this.ambNodes) {
      try {
        n.stop(ac ? ac.currentTime + 0.5 : 0);
      } catch {
        // already stopped
      }
    }
    this.ambNodes = [];
  }

  /* -------------------------------------------------------------- *
   * Adaptive music — a bed that thickens as the board gets scarier
   * -------------------------------------------------------------- */

  /** Chord roots per world, as semitone offsets from A1. */
  private static PROGRESSIONS: Record<string, number[]> = {
    gotham: [0, -2, -4, -5],
    metropolis: [0, 4, 5, 2],
    emerald_reach: [0, 3, -2, 5],
    gamma_flats: [0, 1, -3, -1],
    default: [0, -2, -4, -5],
  };

  startMusic(worldId: string): void {
    this.resume();
    if (!this.ac || !this.musicBus) return;
    if (this.musicWorld === worldId && this.musicTimer !== null) return;
    this.stopMusic();
    this.musicWorld = worldId;
    if (!this.musicEnabled || !this.enabled) return;

    const ac = this.ac;
    this.musicBus.gain.cancelScheduledValues(ac.currentTime);
    this.musicBus.gain.setValueAtTime(0.0001, ac.currentTime);
    this.musicBus.gain.linearRampToValueAtTime(0.5, ac.currentTime + 3);

    const stepMs = 480;
    this.musicStep = 0;
    this.musicTimer = window.setInterval(() => this.musicTick(), stepMs);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    const ac = this.ac;
    if (ac && this.musicBus) {
      this.musicBus.gain.cancelScheduledValues(ac.currentTime);
      this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, ac.currentTime);
      this.musicBus.gain.linearRampToValueAtTime(0.0001, ac.currentTime + 1);
    }
    this.musicWorld = '';
  }

  /** 0 calm .. 1 the board is on fire. Drives which layers play. */
  setIntensity(v: number): void {
    this.intensity = clamp(v, 0, 1);
  }

  private musicTick(): void {
    const ac = this.ac;
    const bus = this.musicBus;
    if (!ac || !bus || !this.musicEnabled) return;

    const prog = Sfx.PROGRESSIONS[this.musicWorld] ?? Sfx.PROGRESSIONS.default;
    const bar = Math.floor(this.musicStep / 4) % prog.length;
    const beat = this.musicStep % 4;
    const root = 55 * Math.pow(2, prog[bar] / 12); // A1-ish
    const t0 = ac.currentTime + 0.02;
    const I = this.intensity;

    const voice = (f: number, dur: number, gain: number, type: OscillatorType, lp = 1800) => {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      const filt = ac.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = lp;
      osc.type = type;
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(filt).connect(g).connect(bus);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    };

    // Bass on every beat — the constant.
    voice(root, 0.42, 0.16, 'triangle', 700);

    // Pad enters gently and swells with intensity.
    if (beat === 0) {
      voice(root * 2, 1.7, 0.05 + I * 0.05, 'sawtooth', 900 + I * 900);
      voice(root * 3, 1.7, 0.035 + I * 0.04, 'sawtooth', 900 + I * 900);
    }

    // Arpeggio only once things heat up.
    if (I > 0.28) {
      const steps = [0, 3, 7, 10, 12];
      const n = steps[(this.musicStep * 2) % steps.length];
      voice(root * 4 * Math.pow(2, n / 12), 0.16, 0.03 + I * 0.03, 'square', 2600);
    }

    // A driving off-beat pulse at high intensity.
    if (I > 0.6 && beat % 2 === 1) {
      voice(root * 1.5, 0.12, 0.05, 'square', 1200);
    }

    this.musicStep++;
  }

  setSfxEnabled(v: boolean): void {
    this.enabled = v;
    if (!v) this.stopAmbience();
  }

  setMusicEnabled(v: boolean): void {
    this.musicEnabled = v;
    if (!v) this.stopMusic();
  }
}

export const sfx = new Sfx();
