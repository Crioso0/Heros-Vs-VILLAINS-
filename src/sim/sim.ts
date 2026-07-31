import { clamp } from '../core/math';
import { Rng } from '../core/rng';
import { heroDef } from '../content/heroes';
import { levelDef } from '../content/levels';
import { villainDef } from '../content/villains';
import { worldDef } from '../content/worlds';
import { heroFire, heroFireSpread, PROJECTILE_COLOR } from './attacks';
import {
  applyEffect,
  canHit,
  damageHero,
  damageVillain,
  effectiveSpeed,
  hurlSidekick,
  killVillain,
  nearestVillain,
  villainsInCircle,
  villainsInRows,
} from './combat';
import { applyCommand } from './commands';
import { emit, type SimContext } from './events';
import { heroAt, spawnHazard, spawnPickup, spawnProjectile, spawnVillain } from './state';
import { endUltimate, updateUltimate } from './ultimates';
import { TICK_DT, type BattleState, type Command, type HeroEntity, type VillainEntity } from './types';

/**
 * The simulation step.
 *
 * Called at a fixed 60 Hz. Every branch reads only from `state` and `ctx.rng`,
 * so the same inputs always produce the same outputs — see docs/MULTIPLAYER.md
 * for how that turns into netcode.
 */
export function step(state: BattleState, ctx: SimContext, commands: Command[]): void {
  // The RNG lives on the state so snapshots round-trip exactly.
  ctx.rng.state = state.rngState;

  for (const cmd of commands) applyCommand(state, ctx, cmd);

  if (state.phase === 'playing') {
    const dt = TICK_DT;
    state.time += dt;
    state.tick++;

    updateCooldowns(state, dt);
    updateAmbientSolar(state, ctx, dt);
    updateWaveDirector(state, ctx, dt);
    updateHeroes(state, ctx, dt);
    updateVillains(state, ctx, dt);
    updateProjectiles(state, ctx, dt);
    updateHazards(state, ctx, dt);
    updatePickups(state, dt);
    updateDrones(state, ctx, dt);
    cullDead(state);
    updateProgress(state);
    checkEnd(state, ctx);
  }

  state.rngState = ctx.rng.state;
}

/* ------------------------------------------------------------------ *
 * Timers & economy
 * ------------------------------------------------------------------ */

function updateCooldowns(state: BattleState, dt: number): void {
  for (const c of state.cards) if (c.cooldown > 0) c.cooldown = Math.max(0, c.cooldown - dt);
  for (const c of state.villainCards) if (c.cooldown > 0) c.cooldown = Math.max(0, c.cooldown - dt);
  for (const k of Object.keys(state.schemeCooldowns)) {
    if (state.schemeCooldowns[k] > 0) {
      state.schemeCooldowns[k] = Math.max(0, state.schemeCooldowns[k] - dt);
    }
  }
  state.menace = Math.min(1200, state.menace + state.menaceRate * dt);
  state.hugeWaveBanner = Math.max(0, state.hugeWaveBanner - dt);
}

function updateAmbientSolar(state: BattleState, ctx: SimContext, dt: number): void {
  const world = worldDef(state.worldId);
  if (world.ambientSolar <= 0) return;
  state.ambientTimer -= dt;
  if (state.ambientTimer > 0) return;
  state.ambientTimer = world.ambientSolar * ctx.rng.range(0.75, 1.25);
  const x = ctx.rng.range(0.6, state.cols - 0.2);
  const restY = ctx.rng.range(0.4, state.rows - 0.4);
  spawnPickup(state, 'solar', x, -0.6, restY, 25, ctx.rng);
}

/* ------------------------------------------------------------------ *
 * Wave director (single player)
 * ------------------------------------------------------------------ */

function updateWaveDirector(state: BattleState, ctx: SimContext, dt: number): void {
  // Drain anything already queued from the current wave.
  for (let i = state.spawnQueue.length - 1; i >= 0; i--) {
    const q = state.spawnQueue[i];
    if (state.time >= q.at) {
      const v = spawnVillain(state, q.villain, q.row);
      const wave = levelDef(state.levelId).waves[state.waveIndex - 1];
      if (wave?.leafChance && ctx.rng.chance(wave.leafChance) && !villainDef(q.villain).boss) {
        v.carriesLeaf = true;
      }
      state.spawnQueue.splice(i, 1);
    }
  }

  if (!Number.isFinite(state.waveTimer)) return; // commander mode

  const level = levelDef(state.levelId);
  if (state.waveIndex >= level.waves.length) return;

  state.waveTimer -= dt;
  const aliveCount = state.villains.filter((v) => v.hp > 0).length;
  const nextWave = level.waves[state.waveIndex];
  // Classic pacing: the next wave lands on the timer, or early once the board
  // is nearly clear, so a strong defence is rewarded with faster levels.
  const early = aliveCount <= 1 && state.waveTimer < nextWave.delay * 0.55;

  if (state.waveTimer <= 0 || early) {
    startWave(state, ctx, state.waveIndex);
    state.waveIndex++;
    state.waveTimer = level.waves[state.waveIndex]?.delay ?? Number.POSITIVE_INFINITY;
  }
}

function startWave(state: BattleState, ctx: SimContext, index: number): void {
  const level = levelDef(state.levelId);
  const wave = level.waves[index];
  if (!wave) return;

  const rows: number[] = [];
  for (let r = 0; r < state.rows; r++) rows.push(r);

  let slot = 0;
  for (const entry of wave.entries) {
    for (let i = 0; i < entry.count; i++) {
      const allowed = entry.rows ?? rows;
      const row = ctx.rng.pick(allowed);
      // Trickle arrivals so a wave walks on rather than teleporting in.
      const at = state.time + slot * ctx.rng.range(0.35, 0.9);
      state.spawnQueue.push({ villain: entry.villain, row, at });
      slot++;
    }
  }

  if (wave.huge) {
    state.hugeWaveBanner = 3.2;
    emit(ctx, { t: 'wave', huge: true });
    emit(ctx, { t: 'sound', id: 'hugeWave' });
  } else {
    emit(ctx, { t: 'wave', huge: false });
  }
}

/* ------------------------------------------------------------------ *
 * Heroes
 * ------------------------------------------------------------------ */

function updateHeroes(state: BattleState, ctx: SimContext, dt: number): void {
  for (const hero of state.heroes) {
    if (hero.hp <= 0) continue;
    hero.age += dt;
    hero.hurt = Math.max(0, hero.hurt - dt);
    if (hero.busy > 0) hero.busy = Math.max(0, hero.busy - dt);

    if (Number.isFinite(hero.expires) && state.time >= hero.expires) {
      hero.hp = 0;
      emit(ctx, { t: 'heroDown', x: hero.col + 0.5, y: hero.row + 0.5 });
      continue;
    }

    if (hero.ultTime > 0) {
      updateUltimate(state, ctx, hero, dt);
      hero.ultTime -= dt;
      if (hero.ultTime <= 0) {
        hero.ultTime = 0;
        endUltimate(state, ctx, hero);
      }
      // Leaf Mode overrides the ordinary attack loop.
      continue;
    }

    if (state.time < hero.frozenUntil) continue;

    const def = heroDef(hero.defId);
    const atk = def.attack;
    if (!atk) continue;

    hero.timer -= dt;
    if (hero.timer > 0 || hero.busy > 0) continue;

    if (atk.produces) {
      hero.timer = atk.interval;
      hero.lastAct = state.time;
      const value = atk.produces.amount;
      spawnPickup(
        state,
        'solar',
        hero.col + 0.5 + ctx.rng.range(-0.15, 0.15),
        hero.row + 0.35,
        hero.row + 0.65,
        value,
        ctx.rng,
      );
      continue;
    }

    const spread = atk.laneSpread ?? 0;
    const rowLo = Math.max(0, hero.row - spread);
    const rowHi = Math.min(state.rows - 1, hero.row + spread);
    const reach = atk.range ?? state.cols + 2;
    const maxX = atk.range ? hero.col + 0.5 + reach : state.cols + 2;
    const target = nearestVillain(state, rowLo, rowHi, hero.col - 0.4, maxX, atk.hits);

    if (atk.requiresTarget && !target) continue;

    hero.timer = atk.interval;
    hero.lastAct = state.time;

    if (atk.projectile) {
      if (spread > 0 && !atk.projectile.homing) {
        heroFireSpread(state, ctx, hero, atk.projectile, spread);
      } else if (atk.projectile.homing && target) {
        heroFire(state, ctx, hero, atk.projectile, { aimRow: target.row });
      } else {
        heroFire(state, ctx, hero, atk.projectile);
      }
      continue;
    }

    // Melee / aura / support: apply directly to everything in reach.
    const hits = villainsInRows(state, rowLo, rowHi, hero.col - 0.4, atk.hits).filter(
      (v) => v.x <= hero.col + 0.5 + reach,
    );
    if (hits.length === 0) continue;

    const color = def.art.glow ?? def.art.accent;
    if (atk.splash) {
      for (const v of hits) {
        if (atk.damage) damageVillain(state, ctx, v, atk.damage, { color });
        for (const e of atk.effects ?? []) applyEffect(state, ctx, v, e);
      }
    } else {
      // Single-target melee bites the closest thing in front of it.
      const v = hits.reduce((a, b) => (a.x <= b.x ? a : b));
      if (atk.damage) damageVillain(state, ctx, v, atk.damage, { color });
      for (const e of atk.effects ?? []) applyEffect(state, ctx, v, e);
      if (atk.effects?.some((e) => e.type === 'strip')) {
        // Support pulses reach across their whole band.
        for (const other of hits) if (other !== v) applyEffect(state, ctx, other, { type: 'strip' });
      }
      if (atk.windup) hero.busy = atk.windup;
    }
  }
}

/* ------------------------------------------------------------------ *
 * Villains
 * ------------------------------------------------------------------ */

function updateVillains(state: BattleState, ctx: SimContext, dt: number): void {
  for (const v of state.villains) {
    if (v.hp <= 0) continue;
    const def = villainDef(v.defId);
    v.age += dt;
    v.hurt = Math.max(0, v.hurt - dt);

    // Burn ticks regardless of movement state.
    if (state.time < v.status.burnUntil) {
      damageVillain(state, ctx, v, v.status.burnDps * dt, { color: '#ff8a3c', ignoreArmor: true });
      if (v.hp <= 0) continue;
    }

    const frozen = state.time < v.status.freezeUntil || state.time < v.status.stunUntil;
    if (!frozen) updateVillainAbility(state, ctx, v, dt);

    const speed = effectiveSpeed(state, v);

    // Airborne, burrowing and mid-vault units ignore the defence line.
    if (v.airborne || v.intangible) {
      if (def.ability === 'vault' && v.phase === 1) {
        // Hop arc: fast, brief, and it lands on the far side of the blocker.
        v.cd -= dt;
        v.x -= 2.6 * dt;
        if (v.cd <= 0) {
          v.intangible = false;
          v.phase = 2;
        }
      } else {
        v.x -= speed * dt;
        if (def.ability === 'burrow' && v.intangible && v.x <= 1.4) {
          v.intangible = false;
          emit(ctx, { t: 'explode', x: v.x, y: v.row + 0.5, radius: 0.7, color: '#ffcc80' });
          emit(ctx, { t: 'shake', power: 0.4 });
        }
      }
      continue;
    }

    // Find whatever is directly in front of this villain.
    const frontCol = Math.floor(v.x - 0.3);
    const blocker =
      frontCol >= 0 && frontCol < state.cols ? heroAt(state, frontCol, v.row) : undefined;
    const blocking = blocker && !heroDef(blocker.defId).walkable;

    if (blocking && blocker) {
      v.targetId = blocker.id;
      if (frozen) continue;

      if (def.ability === 'vault' && v.phase === 0) {
        const tall = heroDef(blocker.defId).tall;
        if (!tall) {
          v.phase = 1;
          v.intangible = true;
          v.cd = 0.55;
          emit(ctx, { t: 'sound', id: 'vault' });
          continue;
        }
      }

      if (def.ability === 'crush' && v.cd <= 0) {
        v.cd = 1.4;
        damageHero(state, ctx, blocker, blocker.maxHp * 10);
        emit(ctx, { t: 'shake', power: 0.7 });
        emit(ctx, { t: 'explode', x: blocker.col + 0.5, y: blocker.row + 0.5, radius: 0.9, color: '#ffab91' });
        continue;
      }

      damageHero(state, ctx, blocker, def.dps * dt);
      continue;
    }

    v.targetId = -1;
    v.x -= speed * dt;
  }
}

function updateVillainAbility(
  state: BattleState,
  ctx: SimContext,
  v: VillainEntity,
  dt: number,
): void {
  const def = villainDef(v.defId);
  // Vaulters drive `cd` from their hop animation instead.
  if (v.cd > 0 && def.ability !== 'vault') v.cd -= dt;

  switch (def.ability) {
    case 'chill': {
      if (v.cd > 0) break;
      v.cd = def.abilityPower ?? 7;
      const candidates = state.heroes.filter(
        (h) => h.hp > 0 && h.row === v.row && h.col + 0.5 < v.x && state.time >= h.frozenUntil,
      );
      if (candidates.length === 0) break;
      const target = candidates.reduce((a, b) => (a.col > b.col ? a : b));
      target.frozenUntil = state.time + 5;
      emit(ctx, { t: 'explode', x: target.col + 0.5, y: target.row + 0.5, radius: 0.8, color: '#4fc3f7' });
      break;
    }
    case 'summon': {
      if (v.cd > 0) break;
      v.cd = def.abilityPower ?? 9;
      if (state.villains.filter((o) => o.hp > 0).length > 40) break;
      const spawned = spawnVillain(state, def.boss ? 'jester' : 'goon', v.row, Math.min(state.cols + 0.5, v.x + 0.3));
      emit(ctx, { t: 'explode', x: spawned.x, y: spawned.row + 0.5, radius: 0.6, color: '#b388ff' });
      break;
    }
    case 'gunner': {
      if (v.cd > 0) break;
      v.cd = def.abilityPower ?? 3;
      const hasTarget = state.heroes.some((h) => h.hp > 0 && h.row === v.row && h.col + 0.5 < v.x);
      if (!hasTarget) break;
      spawnProjectile(state, {
        kind: 'blast',
        team: 'villain',
        x: v.x - 0.3,
        y: v.row + 0.5,
        vx: -7,
        vy: 0,
        damage: def.boss ? 220 : 90,
        pierce: 1,
        splash: 0,
        hits: 'ground',
        effects: [],
        ricochet: 0,
        homing: false,
        ownerId: v.id,
      });
      emit(ctx, { t: 'shoot', x: v.x - 0.3, y: v.row + 0.5, kind: 'blast', color: '#64ffda' });
      break;
    }
    case 'hurl': {
      if (v.phase === 0 && v.hp < v.maxHp * (def.abilityPower ?? 0.5)) {
        v.phase = 1;
        hurlSidekick(state, ctx, v);
      }
      break;
    }
    default:
      break;
  }
}

/* ------------------------------------------------------------------ *
 * Projectiles
 * ------------------------------------------------------------------ */

function updateProjectiles(state: BattleState, ctx: SimContext, dt: number): void {
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i];
    p.age += dt;

    if (p.homing && p.team === 'hero') {
      const target = nearestVillain(state, 0, state.rows - 1, p.x, state.cols + 2, p.hits);
      if (target) {
        const dy = target.row + 0.5 - p.y;
        p.vy = clamp(dy * 4, -6, 6);
      }
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    if (p.x < -1.5 || p.x > state.cols + 2.5 || p.y < -1 || p.y > state.rows + 1 || p.age > 8) {
      state.projectiles.splice(i, 1);
      continue;
    }

    if (p.team === 'hero') {
      const hit = findProjectileTarget(state, p.x, p.y, p.hits, p.hitIds);
      if (!hit) continue;

      p.hitIds.push(hit.id);
      const color = PROJECTILE_COLOR[p.kind] ?? '#ffffff';
      damageVillain(state, ctx, hit, p.damage, { frontal: true, color });
      for (const e of p.effects) applyEffect(state, ctx, hit, e);

      if (p.splash > 0) {
        for (const v of villainsInCircle(state, hit.x, hit.row + 0.5, p.splash, p.hits)) {
          if (v.id === hit.id) continue;
          damageVillain(state, ctx, v, p.damage * 0.5, { color });
        }
        emit(ctx, { t: 'explode', x: hit.x, y: hit.row + 0.5, radius: p.splash, color });
      }

      p.pierce--;
      if (p.pierce <= 0) {
        if (p.ricochet > 0) {
          const next = findRicochetTarget(state, p, hit.row);
          if (next) {
            p.ricochet--;
            p.pierce = 1;
            p.hitIds = [hit.id];
            p.x = hit.x;
            p.y = hit.row + 0.5;
            const dy = next.row + 0.5 - p.y;
            const dx = next.x - p.x;
            const len = Math.max(0.4, Math.hypot(dx, dy));
            const speed = Math.hypot(p.vx, p.vy) || 9;
            p.vx = (dx / len) * speed;
            p.vy = (dy / len) * speed;
            continue;
          }
        }
        state.projectiles.splice(i, 1);
      }
    } else {
      // Villain fire: damages the first hero it overlaps.
      const col = Math.floor(p.x);
      const row = Math.round(p.y - 0.5);
      const hero = col >= 0 && col < state.cols ? heroAt(state, col, row) : undefined;
      if (hero && !heroDef(hero.defId).walkable) {
        damageHero(state, ctx, hero, p.damage);
        emit(ctx, { t: 'hit', x: p.x, y: p.y, color: '#64ffda', power: 0.8 });
        state.projectiles.splice(i, 1);
      }
    }
  }
}

function findProjectileTarget(
  state: BattleState,
  x: number,
  y: number,
  hits: ProjHits,
  exclude: number[],
): VillainEntity | undefined {
  let best: VillainEntity | undefined;
  for (const v of state.villains) {
    if (v.hp <= 0 || v.intangible) continue;
    if (!canHit(hits, v)) continue;
    if (exclude.includes(v.id)) continue;
    if (Math.abs(v.row + 0.5 - y) > 0.42) continue;
    const def = villainDef(v.defId);
    const half = 0.3 * (def.art.scale ?? 1);
    if (x < v.x - half || x > v.x + half + 0.15) continue;
    if (!best || v.x < best.x) best = v;
  }
  return best;
}

type ProjHits = 'ground' | 'air' | 'both';

function findRicochetTarget(
  state: BattleState,
  p: { x: number; hits: ProjHits },
  fromRow: number,
): VillainEntity | undefined {
  let best: VillainEntity | undefined;
  let bestScore = Infinity;
  for (const v of state.villains) {
    if (v.hp <= 0 || v.intangible || v.row === fromRow) continue;
    if (!canHit(p.hits, v)) continue;
    const score = Math.abs(v.row - fromRow) * 2 + Math.abs(v.x - p.x);
    if (score < bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * Hazards, pickups, drones
 * ------------------------------------------------------------------ */

function updateHazards(state: BattleState, ctx: SimContext, dt: number): void {
  for (let i = state.hazards.length - 1; i >= 0; i--) {
    const h = state.hazards[i];
    h.life -= dt;
    if (h.life <= 0) {
      state.hazards.splice(i, 1);
      continue;
    }
    h.tickTimer -= dt;
    const doTick = h.tickTimer <= 0;
    if (doTick) h.tickTimer = h.tickEvery;

    if (h.team !== 'hero') continue;
    for (const v of state.villains) {
      if (v.hp <= 0) continue;
      if (Math.abs(v.x - h.x) > h.w / 2) continue;
      if (Math.abs(v.row + 0.5 - h.y) > h.h / 2) continue;
      if (h.dps > 0) damageVillain(state, ctx, v, h.dps * dt, { ignoreArmor: true, color: '#ffffff' });
      if (doTick) for (const e of h.effects) applyEffect(state, ctx, v, e);
    }
  }
}

function updatePickups(state: BattleState, dt: number): void {
  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const p = state.pickups[i];
    p.age += dt;
    if (p.claimed) {
      p.claimT += dt;
      if (p.claimT > 0.45) state.pickups.splice(i, 1);
      continue;
    }
    if (p.kind === 'solar') {
      if (p.y < p.restY) {
        p.y = Math.min(p.restY, p.y + p.vy * dt * 2.4);
      }
    } else {
      // Leaves pop up and settle.
      p.vy += 4.5 * dt;
      p.y += p.vy * dt;
      if (p.y > p.restY) {
        p.y = p.restY;
        p.vy = 0;
      }
    }
    p.life -= dt;
    if (p.life <= 0) state.pickups.splice(i, 1);
  }
}

function updateDrones(state: BattleState, ctx: SimContext, dt: number): void {
  for (const d of state.drones) {
    if (d.used && d.active === 0) continue;

    if (d.active === 0) {
      const breach = state.villains.some(
        (v) => v.hp > 0 && v.row === d.row && !v.intangible && v.x <= 0.15,
      );
      if (breach) {
        d.active = 1;
        d.used = true;
        emit(ctx, { t: 'drone', row: d.row });
        emit(ctx, { t: 'sound', id: 'drone' });
      }
      continue;
    }

    d.x += 5.5 * dt;
    for (const v of state.villains) {
      if (v.hp <= 0 || v.row !== d.row) continue;
      if (Math.abs(v.x - d.x) < 0.55) killVillain(state, ctx, v);
    }
    if (d.x > state.cols + 1.5) d.active = 0;
  }
}

/* ------------------------------------------------------------------ *
 * Housekeeping
 * ------------------------------------------------------------------ */

function cullDead(state: BattleState): void {
  for (let i = state.heroes.length - 1; i >= 0; i--) {
    if (state.heroes[i].hp <= 0) state.heroes.splice(i, 1);
  }
  for (let i = state.villains.length - 1; i >= 0; i--) {
    if (state.villains[i].hp <= 0) state.villains.splice(i, 1);
  }
}

function updateProgress(state: BattleState): void {
  const level = levelDef(state.levelId);
  if (level.waves.length === 0) {
    state.progress = 0;
    return;
  }
  const wavePart = state.waveIndex / level.waves.length;
  state.progress = clamp(wavePart, 0, 1);
}

function checkEnd(state: BattleState, ctx: SimContext): void {
  // Loss: anything reaches the house with no drone left in that lane.
  for (const v of state.villains) {
    if (v.hp <= 0 || v.intangible) continue;
    if (v.x > -0.35) continue;
    const drone = state.drones.find((d) => d.row === v.row);
    if (!drone || drone.used) {
      state.phase = 'lost';
      emit(ctx, { t: 'phase', phase: 'lost' });
      emit(ctx, { t: 'sound', id: 'lose' });
      return;
    }
  }

  const level = levelDef(state.levelId);
  if (level.waves.length === 0) return; // skirmish / commander mode never auto-wins
  if (state.waveIndex < level.waves.length) return;
  if (state.spawnQueue.length > 0) return;
  if (state.villains.some((v) => v.hp > 0)) return;

  state.phase = 'won';
  emit(ctx, { t: 'phase', phase: 'won' });
  emit(ctx, { t: 'sound', id: 'win' });
}

/* ------------------------------------------------------------------ *
 * Utilities used by presentation code
 * ------------------------------------------------------------------ */

/** Fresh context bound to a battle's RNG state. */
export function createContext(seed: number): SimContext {
  return { rng: new Rng(seed), events: [] };
}

/** Cheap board-state summary used by the AI Director and the HUD. */
export function laneThreat(state: BattleState, row: number): number {
  let threat = 0;
  for (const v of state.villains) {
    if (v.hp <= 0 || v.row !== row) continue;
    const def = villainDef(v.defId);
    // Closer to the house is scarier.
    threat += def.threat * (1 + (state.cols - v.x) / state.cols);
  }
  return threat;
}

export function laneDefence(state: BattleState, row: number): number {
  let value = 0;
  for (const h of state.heroes) {
    if (h.hp <= 0 || h.row !== row) continue;
    const def = heroDef(h.defId);
    value += def.cost / 100;
  }
  return value;
}

/** Used by the renderer to draw the hero the villain is currently biting. */
export function biteTarget(state: BattleState, v: VillainEntity): HeroEntity | undefined {
  if (v.targetId < 0) return undefined;
  return state.heroes.find((h) => h.id === v.targetId);
}

export { spawnHazard };
