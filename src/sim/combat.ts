import { clamp } from '../core/math';
import { heroDef } from '../content/heroes';
import { villainDef } from '../content/villains';
import { emit, type SimContext } from './events';
import { spawnPickup, spawnVillain } from './state';
import type {
  BattleState,
  HeroEntity,
  StatusEffectSpec,
  TargetLayer,
  VillainEntity,
} from './types';

export interface DamageOpts {
  /** Frontal damage is soaked by riot shields; splash and melee are not. */
  frontal?: boolean;
  /** Bypasses the armour layer entirely (armour-piercing, hazards). */
  ignoreArmor?: boolean;
  color?: string;
}

export function effectiveSpeed(state: BattleState, v: VillainEntity): number {
  const s = v.status;
  const t = state.time;
  if (t < s.freezeUntil || t < s.stunUntil || t < s.rootUntil) return 0;
  const base = villainDef(v.defId).speed;
  // A negative slowPower is a speed bonus (the villain-side "Surge" scheme).
  const slow = t < s.slowUntil ? 1 - clamp(s.slowPower, -1.5, 0.9) : 1;
  return base * slow;
}

export function canHit(layer: TargetLayer | undefined, v: VillainEntity): boolean {
  const l = layer ?? 'ground';
  if (l === 'both') return true;
  return v.airborne ? l === 'air' : l === 'ground';
}

export function applyEffect(
  state: BattleState,
  ctx: SimContext,
  v: VillainEntity,
  spec: StatusEffectSpec,
): void {
  const t = state.time;
  const s = v.status;
  switch (spec.type) {
    case 'slow':
      s.slowUntil = Math.max(s.slowUntil, t + (spec.duration ?? 3));
      s.slowPower = Math.max(s.slowPower, spec.power ?? 0.5);
      break;
    case 'freeze':
      s.freezeUntil = Math.max(s.freezeUntil, t + (spec.duration ?? 3));
      s.slowUntil = Math.max(s.slowUntil, t + (spec.duration ?? 3) + 2);
      s.slowPower = Math.max(s.slowPower, 0.5);
      break;
    case 'stun':
      s.stunUntil = Math.max(s.stunUntil, t + (spec.duration ?? 0.5));
      break;
    case 'root':
      s.rootUntil = Math.max(s.rootUntil, t + (spec.duration ?? 3));
      break;
    case 'burn':
      s.burnUntil = Math.max(s.burnUntil, t + (spec.duration ?? 3));
      s.burnDps = Math.max(s.burnDps, spec.power ?? 10);
      break;
    case 'knockback':
      v.x = clamp(v.x + (spec.power ?? 0.5), 0, state.cols + 1.2);
      break;
    case 'strip':
      if (v.armor > 0 || v.shield > 0) {
        emit(ctx, { t: 'hit', x: v.x, y: v.row + 0.5, color: '#d16bff', power: 1 });
        v.armor = 0;
        v.shield = 0;
      }
      break;
  }
}

export function damageVillain(
  state: BattleState,
  ctx: SimContext,
  v: VillainEntity,
  amount: number,
  opts: DamageOpts = {},
): number {
  if (v.hp <= 0 || amount <= 0) return 0;
  let remaining = amount;

  if (opts.frontal && v.shield > 0) {
    const soaked = Math.min(v.shield, remaining);
    v.shield -= soaked;
    remaining -= soaked;
    if (v.shield <= 0) emit(ctx, { t: 'hit', x: v.x, y: v.row + 0.5, color: '#c9a227', power: 1.4 });
  }
  if (!opts.ignoreArmor && v.armor > 0 && remaining > 0) {
    const soaked = Math.min(v.armor, remaining);
    v.armor -= soaked;
    remaining -= soaked;
  }
  if (remaining > 0) v.hp -= remaining;

  v.hurt = 0.16;
  emit(ctx, {
    t: 'hit',
    x: v.x,
    y: v.row + 0.5,
    color: opts.color ?? '#ffe9a8',
    power: clamp(amount / 60, 0.25, 2),
  });

  if (v.hp <= 0) killVillain(state, ctx, v);
  return amount;
}

export function killVillain(state: BattleState, ctx: SimContext, v: VillainEntity): void {
  if (v.hp > 0) v.hp = 0;
  const def = villainDef(v.defId);
  state.defeated++;

  if (def.ability === 'detonate') {
    const power = def.abilityPower ?? 350;
    emit(ctx, { t: 'explode', x: v.x, y: v.row + 0.5, radius: 1.2, color: '#ba68c8' });
    for (const h of state.heroes) {
      if (h.hp <= 0) continue;
      if (Math.abs(h.row - v.row) > 1) continue;
      if (Math.abs(h.col + 0.5 - v.x) > 1.4) continue;
      damageHero(state, ctx, h, power);
    }
  }

  if (v.carriesLeaf) {
    spawnPickup(state, 'leaf', v.x, v.row + 0.5, v.row + 0.35, 1, ctx.rng);
    v.carriesLeaf = false;
  }

  emit(ctx, { t: 'villainDown', x: v.x, y: v.row + 0.5, big: !!def.boss || (def.art.scale ?? 1) > 1.3 });
  if (def.boss) {
    emit(ctx, { t: 'shake', power: 1.4 });
    emit(ctx, { t: 'flash', color: '#ffffff', power: 0.7 });
  }
}

export function damageHero(
  // Unused today, but kept so hero damage matches damageVillain's shape when
  // armour or lane-wide mitigation lands.
  _state: BattleState,
  ctx: SimContext,
  h: HeroEntity,
  amount: number,
): void {
  if (h.hp <= 0) return;
  // Bulwark's ultimate makes it untouchable for the duration.
  if (h.ultTime > 0 && heroDef(h.defId).ultimate?.id === 'unbreakable') return;
  h.hp -= amount;
  h.hurt = 0.2;
  if (h.hp <= 0) {
    h.hp = 0;
    emit(ctx, { t: 'heroDown', x: h.col + 0.5, y: h.row + 0.5 });
  }
}

/* ------------------------------------------------------------------ *
 * Targeting
 * ------------------------------------------------------------------ */

export function villainsInRows(
  state: BattleState,
  rowLo: number,
  rowHi: number,
  minX: number,
  layer: TargetLayer | undefined,
): VillainEntity[] {
  const out: VillainEntity[] = [];
  for (const v of state.villains) {
    if (v.hp <= 0 || v.intangible) continue;
    if (v.row < rowLo || v.row > rowHi) continue;
    if (v.x < minX) continue;
    if (!canHit(layer, v)) continue;
    out.push(v);
  }
  return out;
}

/** Closest villain to the hero line within the given lane band. */
export function nearestVillain(
  state: BattleState,
  rowLo: number,
  rowHi: number,
  minX: number,
  maxX: number,
  layer: TargetLayer | undefined,
): VillainEntity | undefined {
  let best: VillainEntity | undefined;
  for (const v of state.villains) {
    if (v.hp <= 0 || v.intangible) continue;
    if (v.row < rowLo || v.row > rowHi) continue;
    if (v.x < minX || v.x > maxX) continue;
    if (!canHit(layer, v)) continue;
    if (!best || v.x < best.x) best = v;
  }
  return best;
}

export function villainsInCircle(
  state: BattleState,
  x: number,
  y: number,
  radius: number,
  layer?: TargetLayer,
): VillainEntity[] {
  const r2 = radius * radius;
  const out: VillainEntity[] = [];
  for (const v of state.villains) {
    if (v.hp <= 0) continue;
    if (!canHit(layer ?? 'both', v)) continue;
    const dx = v.x - x;
    const dy = v.row + 0.5 - y;
    if (dx * dx + dy * dy <= r2) out.push(v);
  }
  return out;
}

/** Push a villain back toward the spawn edge, clamped to the board. */
export function knockback(state: BattleState, v: VillainEntity, cells: number): void {
  v.x = clamp(v.x + cells, 0.2, state.cols + 1.4);
}

/** Drop a sidekick behind the defence line (Colossus Prime's hurl). */
export function hurlSidekick(state: BattleState, ctx: SimContext, v: VillainEntity): void {
  const target = spawnVillain(state, 'sidekick', v.row, Math.max(1.2, v.x - 4.5));
  emit(ctx, { t: 'explode', x: target.x, y: target.row + 0.5, radius: 0.6, color: '#ffab91' });
}
