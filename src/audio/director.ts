import { clamp } from '../core/math';
import type { SimEvent } from '../sim/events';
import type { BattleState } from '../sim/types';
import { sfx } from './sfx';

/**
 * Turns simulation events into a soundscape.
 *
 * Kept out of both the simulation (which must stay pure) and the renderer
 * (which has enough to do). It reads the same event stream the renderer does
 * and decides what to play, how loud, and where in the stereo field.
 *
 * It also does the two jobs a flat event->sound mapping cannot:
 *  - rate-limits the noisy events, because forty simultaneous hits is a wall
 *    of mush rather than forty hits;
 *  - tracks a collection streak so consecutive solar pickups climb a scale,
 *    which is most of what makes collecting feel good.
 */

const WORLD_AMBIENCE: Record<string, 'rain' | 'wind' | 'hum' | 'heat' | 'none'> = {
  gotham: 'rain',
  metropolis: 'wind',
  emerald_reach: 'hum',
  gamma_flats: 'heat',
};

/** A pentatonic run, so a fast pickup streak sounds like a phrase. */
const STREAK_STEPS = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

export class AudioDirector {
  private worldId = '';
  /** Seconds since the last sound of each rate-limited kind. */
  private cooldowns: Record<string, number> = {};
  private streak = 0;
  private sinceCollect = 0;
  private intensityShown = 0;

  start(state: BattleState): void {
    this.worldId = state.worldId;
    sfx.startAmbience(WORLD_AMBIENCE[state.worldId] ?? 'none');
    sfx.startMusic(state.worldId);
  }

  stop(): void {
    sfx.stopAmbience();
    sfx.stopMusic();
    this.worldId = '';
  }

  /** Board x (0..cols) to a stereo position. */
  private pan(state: BattleState, x: number): number {
    return clamp((x / Math.max(1, state.cols)) * 1.6 - 0.8, -0.9, 0.9);
  }

  private gate(key: string, minGap: number, dt: number): boolean {
    const left = (this.cooldowns[key] ?? 0) - dt;
    if (left > 0) {
      this.cooldowns[key] = left;
      return false;
    }
    this.cooldowns[key] = minGap;
    return true;
  }

  private tickCooldowns(dt: number): void {
    for (const k of Object.keys(this.cooldowns)) {
      this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    }
  }

  update(state: BattleState, events: SimEvent[], dt: number): void {
    if (state.worldId !== this.worldId) this.start(state);
    this.tickCooldowns(dt);

    // The streak decays: pick up two orbs a second apart and it is not a run.
    this.sinceCollect += dt;
    if (this.sinceCollect > 1.6 && this.streak > 0) this.streak = 0;

    for (const ev of events) this.handle(state, ev, dt);

    // Music intensity tracks how much trouble the board is in: how many
    // villains, and how far left they have got.
    let threat = 0;
    for (const v of state.villains) {
      if (v.hp <= 0) continue;
      threat += 0.06 + (1 - v.x / Math.max(1, state.cols)) * 0.12;
    }
    const target = clamp(threat, 0, 1);
    // Ease so the bed swells and settles rather than flickering.
    this.intensityShown += (target - this.intensityShown) * Math.min(1, dt * 0.8);
    sfx.setIntensity(this.intensityShown);
  }

  private handle(state: BattleState, ev: SimEvent, dt: number): void {
    switch (ev.t) {
      case 'shoot': {
        // Many shooters fire on the same frame; thin them out or the mix mud.
        if (!this.gate(`shoot:${ev.kind}`, 0.045, dt)) return;
        sfx.playShot(ev.kind, ev.heroId ?? ev.kind, this.pan(state, ev.x));
        return;
      }

      case 'hit': {
        if (ev.armor) {
          if (this.gate('armor', 0.06, dt)) {
            sfx.play('armor', { pan: this.pan(state, ev.x), gain: 0.8 });
          }
          return;
        }
        if (!this.gate('hit', 0.05, dt)) return;
        sfx.play('hit', {
          pan: this.pan(state, ev.x),
          gain: clamp(0.5 + ev.power * 0.4, 0.4, 1.3),
          pitch: 0.85 + Math.random() * 0.3,
        });
        return;
      }

      case 'villainDown': {
        if (!this.gate(ev.big ? 'bigDown' : 'villainDown', ev.big ? 0.1 : 0.07, dt)) return;
        sfx.play(ev.big ? 'bigDown' : 'villainDown', {
          pan: this.pan(state, ev.x),
          pitch: 0.9 + Math.random() * 0.25,
        });
        return;
      }

      case 'heroDown':
        sfx.play('heroDown', { pan: this.pan(state, ev.x) });
        return;

      case 'explode':
        if (!this.gate('explode', 0.08, dt)) return;
        sfx.play('explode', {
          pan: this.pan(state, ev.x),
          gain: clamp(0.6 + ev.radius * 0.3, 0.6, 1.4),
        });
        return;

      case 'plant':
        sfx.play('plant', { pan: this.pan(state, ev.x) });
        return;

      case 'ultimate':
        sfx.playUltimate(ev.ultId ?? '', this.pan(state, ev.x));
        return;

      case 'overdrive':
        sfx.play('overdrive');
        return;

      case 'collect': {
        if (ev.kind === 'leaf') {
          sfx.play('leaf', { pan: this.pan(state, ev.x) });
          return;
        }
        // A rising run rewards a fast sweep of the board.
        const step = STREAK_STEPS[Math.min(this.streak, STREAK_STEPS.length - 1)];
        sfx.play('solar', {
          pitch: Math.pow(2, step / 12),
          pan: this.pan(state, ev.x),
          gain: 1 - Math.min(0.35, this.streak * 0.03),
        });
        this.streak++;
        this.sinceCollect = 0;
        return;
      }

      case 'drone':
        sfx.play('drone', { pan: -0.7 });
        return;

      case 'wave':
        sfx.play(ev.huge ? 'hugeWave' : 'wave');
        return;

      case 'phase':
        sfx.play(ev.phase === 'won' ? 'win' : 'lose');
        // Let the result breathe.
        sfx.stopMusic();
        return;

      case 'sound':
        sfx.play(ev.id);
        return;

      default:
        return;
    }
  }

  /** Melee heroes have no projectile, so their bite is driven from state. */
  noteMelee(state: BattleState, x: number, dt: number): void {
    if (!this.gate('chomp', 0.09, dt)) return;
    sfx.play('chomp', { pan: this.pan(state, x), pitch: 0.9 + Math.random() * 0.25 });
  }

  /** The world's ambience bed, used by the menu and map screens too. */
  static ambienceFor(worldId: string): 'rain' | 'wind' | 'hum' | 'heat' | 'none' {
    return WORLD_AMBIENCE[worldId] ?? 'none';
  }
}
