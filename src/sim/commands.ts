import { clamp } from '../core/math';
import { heroDef } from '../content/heroes';
import { SCHEME_BY_ID } from '../content/schemes';
import { villainDef } from '../content/villains';
import {
  applyEffect,
  damageHero,
  damageVillain,
  villainsInCircle,
  villainsInRows,
} from './combat';
import { emit, type SimContext } from './events';
import { cellBlocked, heroAt, heroById, pickupById, spawnHero, spawnVillain } from './state';
import { canUltimate, triggerUltimate } from './ultimates';
import type { BattleState, Command, HeroDef } from './types';

/**
 * Commands are the only way anything outside the simulation mutates it.
 * Local input, the AI Director, and (later) remote players all funnel through
 * here, which is what makes the whole thing replayable and net-syncable.
 *
 * Every command is fully re-validated inside the simulation. A client that
 * sends an illegal command simply has it ignored — the same on every peer.
 */
export function applyCommand(state: BattleState, ctx: SimContext, cmd: Command): boolean {
  if (state.phase !== 'playing') return false;

  switch (cmd.t) {
    case 'plant':
      return doPlant(state, ctx, cmd.heroId, cmd.col, cmd.row);
    case 'shovel':
      return doShovel(state, ctx, cmd.col, cmd.row);
    case 'collect':
      return doCollect(state, ctx, cmd.pickupId);
    case 'leaf':
      return doLeaf(state, ctx, cmd.heroId);
    case 'overdrive':
      return doOverdrive(state, ctx);
    case 'deploy':
      return doDeploy(state, ctx, cmd.villainId, cmd.row, cmd.player);
    case 'scheme':
      return doScheme(state, ctx, cmd.schemeId, cmd.row, cmd.col);
  }
}

/* ------------------------------------------------------------------ *
 * Hero side
 * ------------------------------------------------------------------ */

function doPlant(
  state: BattleState,
  ctx: SimContext,
  heroId: string,
  col: number,
  row: number,
): boolean {
  const card = state.cards.find((c) => c.heroId === heroId);
  if (!card || card.cooldown > 0) return false;
  if (col < 0 || col >= state.cols || row < 0 || row >= state.rows) return false;

  const def = heroDef(heroId);
  if (state.solar < def.cost) return false;

  if (def.instant) {
    resolveInstant(state, ctx, def, col, row);
  } else {
    // Hazards (walkable) stack under bodies; everything else needs a clear tile.
    const walkable = !!def.walkable;
    if (cellBlocked(state, col, row, walkable)) return false;
    if (def.uniquePerLane && state.heroes.some((h) => h.row === row && h.defId === heroId)) {
      return false;
    }
    spawnHero(state, heroId, col, row);
    emit(ctx, { t: 'plant', x: col + 0.5, y: row + 0.5 });
  }

  state.solar -= def.cost;
  card.cooldown = card.recharge;
  emit(ctx, { t: 'sound', id: 'plant' });
  return true;
}

function resolveInstant(
  state: BattleState,
  ctx: SimContext,
  def: HeroDef,
  col: number,
  row: number,
): void {
  const inst = def.instant!;
  const color = def.art.glow ?? def.art.accent;
  const cx = col + 0.5;
  const cy = row + 0.5;

  const targets =
    inst.shape === 'lane'
      ? villainsInRows(state, row, row, 0, inst.hits ?? 'both')
      : inst.shape === 'column'
        ? state.villains.filter((v) => v.hp > 0 && Math.abs(v.x - cx) < 0.7)
        : inst.shape === 'square3'
          ? villainsInCircle(state, cx, cy, 1.45, inst.hits ?? 'both')
          : villainsInCircle(state, cx, cy, 0.65, inst.hits ?? 'both');

  for (const v of targets) {
    damageVillain(state, ctx, v, inst.damage, { color, ignoreArmor: true });
    for (const e of inst.effects ?? []) applyEffect(state, ctx, v, e);
  }

  emit(ctx, {
    t: 'explode',
    x: inst.shape === 'lane' ? state.cols / 2 + 0.5 : cx,
    y: cy,
    radius: inst.shape === 'lane' ? state.cols / 2 + 1 : 1.5,
    color,
  });
  emit(ctx, { t: 'shake', power: inst.shape === 'lane' ? 1.1 : 0.8 });
  emit(ctx, { t: 'flash', color, power: 0.35 });
}

function doShovel(state: BattleState, ctx: SimContext, col: number, row: number): boolean {
  const hero = heroAt(state, col, row);
  if (!hero) return false;
  hero.hp = 0;
  hero.expires = -1;
  emit(ctx, { t: 'heroDown', x: col + 0.5, y: row + 0.5 });
  emit(ctx, { t: 'sound', id: 'shovel' });
  return true;
}

function doCollect(state: BattleState, ctx: SimContext, pickupId: number): boolean {
  const p = pickupById(state, pickupId);
  if (!p || p.claimed) return false;
  p.claimed = true;
  p.claimT = 0;
  if (p.kind === 'solar') {
    state.solar += p.value;
    state.solarCollected += p.value;
  } else {
    state.leaves = Math.min(9, state.leaves + 1);
    state.overdrive = clamp(state.overdrive + 0.2, 0, 1);
  }
  emit(ctx, { t: 'collect', kind: p.kind, x: p.x, y: p.y });
  emit(ctx, { t: 'sound', id: p.kind === 'solar' ? 'solar' : 'leaf' });
  return true;
}

function doLeaf(state: BattleState, ctx: SimContext, heroEntityId: number): boolean {
  if (state.leaves <= 0) return false;
  const hero = heroById(state, heroEntityId);
  if (!hero || !canUltimate(hero)) return false;
  if (!triggerUltimate(state, ctx, hero)) return false;
  state.leaves--;
  return true;
}

function doOverdrive(state: BattleState, ctx: SimContext): boolean {
  if (state.overdrive < 1) return false;
  const targets = state.heroes.filter(canUltimate);
  if (targets.length === 0) return false;
  state.overdrive = 0;
  emit(ctx, { t: 'overdrive' });
  emit(ctx, { t: 'flash', color: '#ffffff', power: 0.85 });
  emit(ctx, { t: 'shake', power: 1.5 });
  for (const hero of targets) triggerUltimate(state, ctx, hero);
  return true;
}

/* ------------------------------------------------------------------ *
 * Villain side
 * ------------------------------------------------------------------ */

function doDeploy(
  state: BattleState,
  ctx: SimContext,
  villainId: string,
  row: number,
  player: number,
): boolean {
  if (row < 0 || row >= state.rows) return false;
  const card = state.villainCards.find((c) => c.villainId === villainId);
  if (!card || card.cooldown > 0) return false;
  const def = villainDef(villainId);
  if (state.menace < def.menace) return false;

  state.menace -= def.menace;
  card.cooldown = card.recharge;
  const v = spawnVillain(state, villainId, row, undefined, player);
  if (ctx.rng.chance(0.15)) v.carriesLeaf = true;
  emit(ctx, { t: 'sound', id: 'deploy' });
  return true;
}

function doScheme(
  state: BattleState,
  ctx: SimContext,
  schemeId: string,
  row: number,
  col: number,
): boolean {
  const def = SCHEME_BY_ID[schemeId];
  if (!def) return false;
  if ((state.schemeCooldowns[schemeId] ?? 0) > 0) return false;
  if (state.menace < def.cost) return false;

  state.menace -= def.cost;
  state.schemeCooldowns[schemeId] = def.cooldown;

  switch (schemeId) {
    case 'surge': {
      for (const v of villainsInRows(state, row, row, 0, 'both')) {
        v.status.slowUntil = 0;
        v.status.slowPower = 0;
        // Negative slow power reads as a speed bonus in effectiveSpeed().
        v.status.slowUntil = state.time + 6;
        v.status.slowPower = -0.6;
      }
      emit(ctx, { t: 'flash', color: def.color, power: 0.25 });
      break;
    }
    case 'blackout': {
      for (const h of state.heroes) {
        if (h.hp <= 0) continue;
        if (Math.abs(h.col - col) > 1 || Math.abs(h.row - row) > 1) continue;
        h.frozenUntil = Math.max(h.frozenUntil, state.time + 5);
      }
      emit(ctx, { t: 'explode', x: col + 0.5, y: row + 0.5, radius: 1.6, color: def.color });
      break;
    }
    case 'reinforce': {
      for (const v of villainsInRows(state, row, row, 0, 'both')) {
        v.armor += 500;
        v.hp = Math.min(v.maxHp, v.hp + v.maxHp * 0.25);
      }
      emit(ctx, { t: 'flash', color: def.color, power: 0.2 });
      break;
    }
    case 'sabotage': {
      const hero = heroAt(state, col, row);
      if (!hero) {
        // Refund a miss so the villain player is not punished for lag.
        state.menace += def.cost;
        state.schemeCooldowns[schemeId] = 2;
        return false;
      }
      damageHero(state, ctx, hero, hero.maxHp * 10);
      emit(ctx, { t: 'explode', x: col + 0.5, y: row + 0.5, radius: 1, color: def.color });
      break;
    }
  }
  emit(ctx, { t: 'sound', id: 'scheme' });
  return true;
}
