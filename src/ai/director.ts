import { Rng } from '../core/rng';
import { SCHEMES } from '../content/schemes';
import { villainDef } from '../content/villains';
import { laneDefence, laneThreat } from '../sim/sim';
import type { BattleState, Command } from '../sim/types';

/**
 * The AI villain commander.
 *
 * It is deliberately built as a *command producer*, exactly like a human
 * villain player: it can only do things a person sitting at the villain HUD
 * could do. That means the same code path serves single-player skirmishes and
 * "player vs AI" versus matches, and a human can drop into the seat at any
 * time without touching the simulation.
 */
export interface DirectorOptions {
  /** 0..1. Scales decision speed and how well it reads the board. */
  aggression: number;
  seed: number;
}

export class Director {
  private rng: Rng;
  private think = 0;
  private aggression: number;

  constructor(opts: DirectorOptions) {
    this.rng = new Rng(opts.seed);
    this.aggression = opts.aggression;
  }

  /** Called once per rendered frame; returns commands to issue this frame. */
  update(state: BattleState, dt: number, player = 1): Command[] {
    if (state.phase !== 'playing') return [];
    this.think -= dt;
    if (this.think > 0) return [];
    this.think = this.rng.range(1.6, 3.4) * (1.4 - this.aggression * 0.7);

    const out: Command[] = [];

    // Bank Menace early, spend hard once the board fills out.
    const pressure = state.villains.length;
    const wantsToSpend = state.menace > 220 || pressure < 3;

    if (wantsToSpend) {
      const card = this.chooseDeployment(state);
      if (card) {
        out.push({ t: 'deploy', player, villainId: card.villainId, row: card.row });
      }
    }

    const scheme = this.chooseScheme(state);
    if (scheme) out.push(scheme);

    return out;
  }

  /**
   * Pick the lane with the best threat-to-defence ratio and the biggest
   * villain we can afford for it.
   */
  private chooseDeployment(
    state: BattleState,
  ): { villainId: string; row: number } | undefined {
    const ready = state.villainCards.filter(
      (c) => c.cooldown <= 0 && villainDef(c.villainId).menace <= state.menace,
    );
    if (ready.length === 0) return undefined;

    // Score lanes: weakly defended lanes are worth pushing.
    let bestRow = 0;
    let bestScore = -Infinity;
    for (let r = 0; r < state.rows; r++) {
      const defence = laneDefence(state, r);
      const threat = laneThreat(state, r);
      // Reinforce a lane that is already breaking, otherwise hit soft spots.
      const score = threat > 4 ? 6 - defence + threat * 0.4 : 6 - defence + this.rng.range(0, 2);
      if (score > bestScore) {
        bestScore = score;
        bestRow = r;
      }
    }

    // Prefer the most expensive affordable unit, with some noise so it does
    // not become predictable.
    const sorted = ready
      .slice()
      .sort((a, b) => villainDef(b.villainId).menace - villainDef(a.villainId).menace);
    const pickIndex = this.rng.chance(0.65 + this.aggression * 0.2)
      ? 0
      : this.rng.int(0, sorted.length - 1);
    return { villainId: sorted[pickIndex].villainId, row: bestRow };
  }

  private chooseScheme(state: BattleState): Command | undefined {
    if (!this.rng.chance(0.35 + this.aggression * 0.35)) return undefined;
    const affordable = SCHEMES.filter(
      (s) => (state.schemeCooldowns[s.id] ?? 0) <= 0 && state.menace >= s.cost,
    );
    if (affordable.length === 0) return undefined;
    const scheme = this.rng.pick(affordable);

    if (scheme.shape === 'lane') {
      // Surge/Reinforce want the lane with the most bodies in it.
      let bestRow = 0;
      let best = -1;
      for (let r = 0; r < state.rows; r++) {
        const n = state.villains.filter((v) => v.hp > 0 && v.row === r).length;
        if (n > best) {
          best = n;
          bestRow = r;
        }
      }
      if (best <= 0) return undefined;
      return { t: 'scheme', player: 1, schemeId: scheme.id, row: bestRow, col: 0 };
    }

    // Cell schemes want the most valuable hero on the board.
    const heroes = state.heroes.filter((h) => h.hp > 0);
    if (heroes.length === 0) return undefined;
    const target = this.rng.pick(heroes);
    return { t: 'scheme', player: 1, schemeId: scheme.id, row: target.row, col: target.col };
  }
}

/** A sensible villain deck for AI-run skirmishes at a given difficulty. */
export function directorDeck(difficulty: number): string[] {
  const tiers = [
    ['goon', 'riot_goon', 'grapnel'],
    ['enforcer', 'jester', 'redshift'],
    ['shieldbearer', 'aerial', 'coldsnap'],
    ['gunner', 'marionette', 'tunneler'],
    ['juggernought', 'colossus_prime'],
  ];
  const out: string[] = [];
  for (let i = 0; i <= Math.min(tiers.length - 1, difficulty); i++) out.push(...tiers[i]);
  return out;
}
