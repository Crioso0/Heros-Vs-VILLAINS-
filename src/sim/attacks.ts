import { heroDef } from '../content/heroes';
import { emit, type SimContext } from './events';
import { nearestVillain } from './combat';
import { spawnProjectile } from './state';
import type { BattleState, HeroEntity, ProjectileKind, ProjectileSpec } from './types';

export const PROJECTILE_COLOR: Record<ProjectileKind, string> = {
  bolt: '#5ec8ff',
  frost: '#bff0ff',
  beam: '#ff5a3c',
  construct: '#4dff87',
  arrow: '#c8f7a0',
  shield: '#dfe9ff',
  web: '#ffffff',
  spark: '#fff07a',
  shard: '#7fe3c8',
  batarang: '#9fa8da',
  blast: '#ffd75e',
};

export interface FireOpts {
  /** Override the lane the shot travels along. */
  row?: number;
  /** Override the muzzle position. */
  x?: number;
  y?: number;
  damageScale?: number;
  /** Aim vertically at this row (used by spread and ricochet shots). */
  aimRow?: number;
}

export function heroFire(
  state: BattleState,
  ctx: SimContext,
  hero: HeroEntity,
  spec: ProjectileSpec,
  opts: FireOpts = {},
): void {
  const x = opts.x ?? hero.col + 0.78;
  const y = opts.y ?? (opts.row ?? hero.row) + 0.5;
  let vy = spec.arc ?? 0;

  if (opts.aimRow !== undefined) {
    const dy = opts.aimRow + 0.5 - y;
    // Reach the aim row after roughly two cells of travel.
    vy = (dy / 2) * spec.speed;
  }

  spawnProjectile(state, {
    kind: spec.kind,
    team: 'hero',
    x,
    y,
    vx: spec.speed,
    vy,
    damage: spec.damage * (opts.damageScale ?? 1),
    pierce: spec.pierce ?? 1,
    splash: spec.splash ?? 0,
    hits: spec.hits ?? 'ground',
    effects: spec.effects ?? [],
    ricochet: spec.ricochet ?? 0,
    homing: !!spec.homing,
    ownerId: hero.id,
  });

  emit(ctx, {
    t: 'shoot',
    x,
    y,
    kind: spec.kind,
    color: PROJECTILE_COLOR[spec.kind] ?? '#ffffff',
  });
}

/** Fire straight down the hero's own lane. */
export function heroFireForward(
  state: BattleState,
  ctx: SimContext,
  hero: HeroEntity,
  spec: ProjectileSpec,
  damageScale = 1,
): void {
  heroFire(state, ctx, hero, spec, { damageScale });
}

/**
 * Spread shooters fire one shot per lane in their band that actually contains
 * a target, so they do not waste ammunition on empty rows.
 */
export function heroFireSpread(
  state: BattleState,
  ctx: SimContext,
  hero: HeroEntity,
  spec: ProjectileSpec,
  spread: number,
): void {
  const lo = Math.max(0, hero.row - spread);
  const hi = Math.min(state.rows - 1, hero.row + spread);
  let fired = 0;
  for (let r = lo; r <= hi; r++) {
    const target = nearestVillain(state, r, r, hero.col, state.cols + 2, spec.hits);
    if (!target) continue;
    heroFire(state, ctx, hero, spec, { aimRow: r });
    fired++;
  }
  // Always put something in the air so the hero reads as active.
  if (fired === 0) heroFire(state, ctx, hero, spec);
}

export function heroGlow(heroId: string): string {
  return heroDef(heroId).art.glow ?? heroDef(heroId).art.accent;
}
