import { clamp } from '../core/math';
import { heroDef } from '../content/heroes';
import { heroFire } from './attacks';
import {
  applyEffect,
  damageVillain,
  knockback,
  villainsInCircle,
  villainsInRows,
} from './combat';
import { emit, type SimContext } from './events';
import { cellBlocked, spawnHazard, spawnHero } from './state';
import type { BattleState, HeroEntity, ProjectileSpec } from './types';

/**
 * Leaf Mode.
 *
 * Dropping a Leaf on a hero unleashes their signature power for a few seconds.
 * Immediate, one-shot effects run in `triggerUltimate`; sustained effects
 * (beams, barrages, dashes) run every tick in `updateUltimate`; anything that
 * has to happen on the way out runs in `endUltimate`.
 *
 * Overdrive — the meter that fills as you bank Leaves — calls `triggerUltimate`
 * on every hero on the board at once. That is the "unleash everything" button.
 */

const BOLT: ProjectileSpec = { kind: 'bolt', damage: 28, speed: 13, pierce: 2 };
const ARROW: ProjectileSpec = { kind: 'arrow', damage: 26, speed: 14, pierce: 3 };
const BATARANG: ProjectileSpec = { kind: 'batarang', damage: 30, speed: 13, pierce: 3, hits: 'both' };
const RICO_SHIELD: ProjectileSpec = {
  kind: 'shield',
  damage: 55,
  speed: 11,
  pierce: 6,
  ricochet: 4,
  hits: 'both',
};

export function canUltimate(hero: HeroEntity): boolean {
  const def = heroDef(hero.defId);
  return hero.hp > 0 && !!def.ultimate && !def.instant;
}

export function triggerUltimate(state: BattleState, ctx: SimContext, hero: HeroEntity): boolean {
  const def = heroDef(hero.defId);
  const ult = def.ultimate;
  if (!ult || hero.hp <= 0) return false;

  hero.ultTime = ult.duration;
  hero.ultPhase = 0;
  hero.frozenUntil = 0;
  const glow = def.art.glow ?? def.art.accent;
  emit(ctx, { t: 'ultimate', x: hero.col + 0.5, y: hero.row + 0.5, heroId: hero.defId, color: glow });
  emit(ctx, { t: 'sound', id: 'ultimate' });

  const lane = () => villainsInRows(state, hero.row, hero.row, 0, 'both');

  switch (ult.id) {
    /* ---- instant payloads ---------------------------------------- */
    case 'solar_flare': {
      const amount = hero.defId === 'sunforge' ? 300 : 150;
      state.solar += amount;
      state.solarCollected += amount;
      emit(ctx, { t: 'flash', color: '#ffd75e', power: 0.45 });
      break;
    }
    case 'quake_slam': {
      emit(ctx, { t: 'shake', power: 1.1 });
      for (const v of lane()) {
        damageVillain(state, ctx, v, 900, { color: '#ff9d4d' });
        knockback(state, v, 1.6);
      }
      break;
    }
    case 'deep_freeze': {
      emit(ctx, { t: 'flash', color: '#bff0ff', power: 0.5 });
      for (const v of state.villains) {
        if (v.hp <= 0) continue;
        damageVillain(state, ctx, v, 60, { color: '#bff0ff' });
        applyEffect(state, ctx, v, { type: 'freeze', duration: 6 });
      }
      break;
    }
    case 'web_lane': {
      spawnHazard(state, {
        kind: 'web',
        x: state.cols / 2 + 0.5,
        y: hero.row + 0.5,
        w: state.cols + 2,
        h: 0.9,
        life: 7,
        dps: 12,
        effects: [{ type: 'root', duration: 0.8 }],
        tickEvery: 0.25,
        team: 'hero',
      });
      break;
    }
    case 'construct_fist': {
      emit(ctx, { t: 'shake', power: 1.2 });
      for (const v of lane()) {
        damageVillain(state, ctx, v, 1400, { color: '#4dff87', ignoreArmor: true });
        knockback(state, v, 2.2);
      }
      break;
    }
    case 'thunderclap': {
      emit(ctx, { t: 'shake', power: 1.6 });
      emit(ctx, { t: 'flash', color: '#a5d6a7', power: 0.5 });
      for (const v of state.villains) {
        if (v.hp <= 0) continue;
        const d = Math.hypot(v.x - (hero.col + 0.5), v.row - hero.row);
        const falloff = clamp(1 - d / 7, 0.25, 1);
        damageVillain(state, ctx, v, 1500 * falloff, { color: '#7bed9f' });
        knockback(state, v, 2.6 * falloff);
        applyEffect(state, ctx, v, { type: 'stun', duration: 1.5 * falloff });
      }
      break;
    }
    case 'lasso_sweep': {
      for (const v of lane()) {
        damageVillain(state, ctx, v, 700, { color: '#ffd75e' });
        v.x = clamp(state.cols + 0.4, 0, state.cols + 1.4);
        applyEffect(state, ctx, v, { type: 'stun', duration: 1.2 });
      }
      break;
    }
    case 'magnetic_purge': {
      emit(ctx, { t: 'flash', color: '#d16bff', power: 0.4 });
      for (const v of state.villains) {
        if (v.hp <= 0) continue;
        const stripped = v.armor + v.shield;
        applyEffect(state, ctx, v, { type: 'strip' });
        if (stripped > 0) damageVillain(state, ctx, v, stripped * 0.6, { color: '#d16bff' });
      }
      break;
    }
    case 'tidal_wave': {
      emit(ctx, { t: 'shake', power: 0.9 });
      spawnHazard(state, {
        kind: 'tide',
        x: state.cols / 2 + 0.5,
        y: hero.row + 0.5,
        w: state.cols + 2,
        h: 1,
        life: 1.6,
        dps: 0,
        effects: [],
        tickEvery: 1,
        team: 'hero',
      });
      for (const v of lane()) {
        damageVillain(state, ctx, v, 400, { color: '#5fe0b0' });
        v.x = clamp(state.cols + 0.5, 0, state.cols + 1.4);
        applyEffect(state, ctx, v, { type: 'slow', duration: 4, power: 0.5 });
      }
      break;
    }
    case 'banishment': {
      emit(ctx, { t: 'flash', color: '#9b6bff', power: 0.55 });
      for (const v of state.villains) {
        if (v.hp <= 0) continue;
        spawnHazard(state, {
          kind: 'portal',
          x: v.x,
          y: v.row + 0.5,
          w: 0.9,
          h: 0.9,
          life: 0.7,
          dps: 0,
          effects: [],
          tickEvery: 1,
          team: 'hero',
        });
        damageVillain(state, ctx, v, 250, { color: '#9b6bff' });
        v.x = clamp(state.cols + 0.5, 0, state.cols + 1.4);
        applyEffect(state, ctx, v, { type: 'stun', duration: 1.5 });
      }
      break;
    }
    case 'smoke_and_steel': {
      spawnHazard(state, {
        kind: 'smoke',
        x: state.cols / 2 + 0.5,
        y: hero.row + 0.5,
        w: state.cols + 2,
        h: 2.6,
        life: 4,
        dps: 18,
        effects: [{ type: 'slow', duration: 1.2, power: 0.7 }],
        tickEvery: 0.4,
        team: 'hero',
      });
      break;
    }
    case 'unbreakable': {
      hero.hp = hero.maxHp;
      break;
    }
  }

  return true;
}

/** Sustained ultimates. Called once per tick while `hero.ultTime > 0`. */
export function updateUltimate(
  state: BattleState,
  ctx: SimContext,
  hero: HeroEntity,
  dt: number,
): void {
  const def = heroDef(hero.defId);
  const ult = def.ultimate;
  if (!ult) return;
  const glow = def.art.glow ?? def.art.accent;
  hero.ultPhase += dt;

  switch (ult.id) {
    case 'barrage': {
      // ~12 shots per second for the duration.
      pulse(hero, dt, 0.08, () => heroFire(state, ctx, hero, BOLT));
      break;
    }
    case 'arrow_storm': {
      pulse(hero, dt, 0.055, () => {
        const row = ctx.rng.int(0, state.rows - 1);
        heroFire(state, ctx, hero, ARROW, {
          x: hero.col + 0.6,
          y: hero.row + 0.5,
          aimRow: row,
        });
      });
      break;
    }
    case 'shield_storm': {
      pulse(hero, dt, 0.18, () => {
        const row = ctx.rng.int(0, state.rows - 1);
        heroFire(state, ctx, hero, RICO_SHIELD, { aimRow: row });
      });
      break;
    }
    case 'smoke_and_steel': {
      pulse(hero, dt, 0.1, () => {
        const row = clamp(hero.row + ctx.rng.int(-1, 1), 0, state.rows - 1);
        heroFire(state, ctx, hero, BATARANG, { aimRow: row });
      });
      break;
    }
    case 'heat_vision': {
      // A continuous lane-wide beam. Damage is applied directly, not by a
      // projectile, so it cannot be blocked by shields.
      beamLane(state, ctx, hero, hero.row, hero.row, 900 * dt, '#ff5a3c');
      pulse(hero, dt, 0.12, () =>
        emit(ctx, { t: 'shoot', x: hero.col + 0.9, y: hero.row + 0.5, kind: 'beam', color: '#ff5a3c' }),
      );
      break;
    }
    case 'unibeam': {
      const lo = Math.max(0, hero.row - 1);
      const hi = Math.min(state.rows - 1, hero.row + 1);
      beamLane(state, ctx, hero, lo, hi, 520 * dt, '#ffd75e');
      break;
    }
    case 'overload': {
      beamLane(state, ctx, hero, hero.row, hero.row, 420 * dt, '#6be3ff');
      pulse(hero, dt, 0.3, () => {
        for (const v of villainsInRows(state, hero.row, hero.row, hero.col, 'both')) {
          applyEffect(state, ctx, v, { type: 'stun', duration: 0.4 });
        }
      });
      break;
    }
    case 'thunderstorm': {
      pulse(hero, dt, 0.28, () => {
        const alive = state.villains.filter((v) => v.hp > 0);
        if (alive.length === 0) return;
        const target = ctx.rng.pick(alive);
        emit(ctx, { t: 'explode', x: target.x, y: target.row + 0.5, radius: 0.9, color: '#bfe9ff' });
        emit(ctx, { t: 'flash', color: '#dff3ff', power: 0.22 });
        for (const v of villainsInCircle(state, target.x, target.row + 0.5, 1.1)) {
          damageVillain(state, ctx, v, 600, { color: '#bfe9ff', ignoreArmor: true });
          applyEffect(state, ctx, v, { type: 'stun', duration: 0.8 });
        }
      });
      break;
    }
    case 'frenzy': {
      pulse(hero, dt, 0.15, () => {
        for (const v of villainsInCircle(state, hero.col + 0.5, hero.row + 0.5, 2.1)) {
          damageVillain(state, ctx, v, 90, { color: '#ffe14d' });
        }
      });
      break;
    }
    case 'spike_surge': {
      pulse(hero, dt, 0.2, () => {
        for (const v of villainsInRows(state, hero.row, hero.row, 0, 'ground')) {
          damageVillain(state, ctx, v, 45, { color: '#90a4ae', ignoreArmor: true });
        }
      });
      break;
    }
    case 'speed_force': {
      // Six dashes down the lane; each pass sweeps everything in it.
      pulse(hero, dt, 0.5, () => {
        emit(ctx, { t: 'shake', power: 0.35 });
        for (const v of villainsInRows(state, hero.row, hero.row, 0, 'ground')) {
          damageVillain(state, ctx, v, 260, { color: '#ffe14d' });
          knockback(state, v, 0.25);
        }
      });
      break;
    }
    case 'unbreakable': {
      hero.hp = hero.maxHp;
      pulse(hero, dt, 0.35, () => {
        for (const v of villainsInCircle(state, hero.col + 0.5, hero.row + 0.5, 1.3, 'ground')) {
          damageVillain(state, ctx, v, 70, { color: glow });
          knockback(state, v, 0.35);
        }
      });
      break;
    }
  }
}

/** Called once when a Leaf Mode window closes. */
export function endUltimate(state: BattleState, ctx: SimContext, hero: HeroEntity): void {
  const def = heroDef(hero.defId);
  const ult = def.ultimate;
  if (!ult) return;

  switch (ult.id) {
    case 'heat_vision': {
      // Super-breath chaser: whatever survived the beam gets frozen solid.
      for (const v of villainsInRows(state, hero.row, hero.row, 0, 'both')) {
        applyEffect(state, ctx, v, { type: 'freeze', duration: 5 });
      }
      emit(ctx, { t: 'flash', color: '#bff0ff', power: 0.3 });
      break;
    }
    case 'construct_fist': {
      // Leaves a hard-light wall in the cell in front of the Warden.
      const col = Math.min(state.cols - 1, hero.col + 1);
      if (!cellBlocked(state, col, hero.row, false)) {
        spawnHero(state, 'emerald_wall', col, hero.row, state.time + 25);
        emit(ctx, { t: 'plant', x: col + 0.5, y: hero.row + 0.5 });
      }
      break;
    }
  }
  hero.ultPhase = 0;
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/**
 * Fires `fn` on a fixed cadence during an ultimate. Uses ultPhase as the
 * accumulator so the rhythm is tick-exact and therefore deterministic.
 */
function pulse(hero: HeroEntity, dt: number, every: number, fn: () => void): void {
  // ultPhase already advanced by dt in updateUltimate; count whole steps.
  const before = hero.ultPhase - dt;
  const stepsBefore = Math.floor(before / every);
  const stepsNow = Math.floor(hero.ultPhase / every);
  for (let i = stepsBefore; i < stepsNow; i++) fn();
}

function beamLane(
  state: BattleState,
  ctx: SimContext,
  hero: HeroEntity,
  rowLo: number,
  rowHi: number,
  damage: number,
  color: string,
): void {
  for (const v of villainsInRows(state, rowLo, rowHi, hero.col, 'both')) {
    damageVillain(state, ctx, v, damage, { color, ignoreArmor: true });
  }
}
