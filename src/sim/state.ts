import { Rng } from '../core/rng';
import { heroDef } from '../content/heroes';
import { SCHEMES } from '../content/schemes';
import { villainDef } from '../content/villains';
import { worldDef } from '../content/worlds';
import type {
  BattleState,
  DroneEntity,
  HazardEntity,
  HeroEntity,
  HeroId,
  LevelDef,
  PickupEntity,
  ProjectileEntity,
  StatusState,
  VillainEntity,
  VillainId,
} from './types';

export interface BattleSetup {
  level: LevelDef;
  /** Hero cards the plant-side player took into the level. */
  deck: HeroId[];
  /** Villain cards the villain-side player may deploy (versus mode). */
  villainDeck?: VillainId[];
  /** No scripted waves; villains arrive only from a commander (human or AI). */
  commanderMode?: boolean;
  seed: number;
}

export function newStatus(): StatusState {
  return {
    slowUntil: 0,
    slowPower: 0,
    freezeUntil: 0,
    stunUntil: 0,
    rootUntil: 0,
    burnUntil: 0,
    burnDps: 0,
  };
}

export function createBattle(setup: BattleSetup): BattleState {
  const { level } = setup;
  const world = worldDef(level.world);

  const drones: DroneEntity[] = [];
  for (let r = 0; r < level.rows; r++) {
    if (level.noDroneRows?.includes(r)) continue;
    drones.push({ id: -(r + 1), row: r, x: -0.32, active: 0, used: false });
  }

  return {
    levelId: level.id,
    worldId: level.world,
    rows: level.rows,
    cols: level.cols,
    time: 0,
    tick: 0,
    phase: 'playing',
    rngState: setup.seed >>> 0,

    solar: level.startingSolar ?? world.startingSolar,
    menace: 75,
    menaceRate: 12,

    leaves: 0,
    overdrive: 0,

    heroes: [],
    villains: [],
    projectiles: [],
    hazards: [],
    pickups: [],
    drones,

    cards: setup.deck.map((id) => {
      const def = heroDef(id);
      // Cards start on a short warm-up so the opening seconds have shape.
      return { heroId: id, cooldown: Math.min(def.recharge, 2), recharge: def.recharge };
    }),
    villainCards: (setup.villainDeck ?? []).map((id) => {
      const def = villainDef(id);
      const recharge = 1.5 + def.threat * 0.55;
      return { villainId: id, cooldown: recharge, recharge };
    }),
    schemeCooldowns: Object.fromEntries(SCHEMES.map((s) => [s.id, 10])),

    waveIndex: 0,
    waveTimer: setup.commanderMode ? Number.POSITIVE_INFINITY : (level.waves[0]?.delay ?? 15),
    spawnQueue: [],
    hugeWaveBanner: 0,
    ambientTimer: world.ambientSolar > 0 ? world.ambientSolar * 0.6 : Number.POSITIVE_INFINITY,

    nextId: 1,
    defeated: 0,
    solarCollected: 0,
    progress: 0,
  };
}

/* ------------------------------------------------------------------ *
 * Entity factories
 * ------------------------------------------------------------------ */

export function spawnHero(
  state: BattleState,
  defId: HeroId,
  col: number,
  row: number,
  expires = Number.POSITIVE_INFINITY,
): HeroEntity {
  const def = heroDef(defId);
  const hero: HeroEntity = {
    id: state.nextId++,
    defId,
    col,
    row,
    hp: def.hp,
    maxHp: def.hp,
    timer: def.attack ? def.attack.interval * 0.5 : 0,
    ultTime: 0,
    ultPhase: 0,
    frozenUntil: 0,
    expires,
    lastAct: -99,
    busy: 0,
    hurt: 0,
    age: 0,
  };
  state.heroes.push(hero);
  return hero;
}

export function spawnVillain(
  state: BattleState,
  defId: VillainId,
  row: number,
  x?: number,
  owner = -1,
): VillainEntity {
  const def = villainDef(defId);
  const v: VillainEntity = {
    id: state.nextId++,
    defId,
    x: x ?? state.cols + 0.6,
    row,
    hp: def.hp,
    maxHp: def.hp,
    armor: def.armor ?? 0,
    shield: def.shield ?? 0,
    status: newStatus(),
    targetId: -1,
    cd: def.abilityPower ?? 0,
    phase: 0,
    carriesLeaf: false,
    airborne: def.ability === 'flight',
    intangible: def.ability === 'burrow',
    hurt: 0,
    age: 0,
    owner,
  };
  state.villains.push(v);
  return v;
}

export function spawnProjectile(
  state: BattleState,
  p: Omit<ProjectileEntity, 'id' | 'hitIds' | 'age'>,
): ProjectileEntity {
  const proj: ProjectileEntity = { ...p, id: state.nextId++, hitIds: [], age: 0 };
  state.projectiles.push(proj);
  return proj;
}

export function spawnHazard(
  state: BattleState,
  h: Omit<HazardEntity, 'id' | 'maxLife' | 'tickTimer'> & { tickTimer?: number },
): HazardEntity {
  const hazard: HazardEntity = {
    ...h,
    id: state.nextId++,
    maxLife: h.life,
    tickTimer: h.tickTimer ?? 0,
  };
  state.hazards.push(hazard);
  return hazard;
}

export function spawnPickup(
  state: BattleState,
  kind: 'solar' | 'leaf',
  x: number,
  y: number,
  restY: number,
  value: number,
  rng: Rng,
): PickupEntity {
  const pickup: PickupEntity = {
    id: state.nextId++,
    kind,
    x,
    y,
    restY,
    vy: kind === 'solar' ? rng.range(0.25, 0.5) : rng.range(-1.4, -1.0),
    value,
    life: 22,
    claimed: false,
    claimT: 0,
    age: 0,
  };
  state.pickups.push(pickup);
  return pickup;
}

/* ------------------------------------------------------------------ *
 * Queries
 * ------------------------------------------------------------------ */

/** Topmost occupant of a cell, hazard or body. Used by the shovel and Sabotage. */
export function heroAt(state: BattleState, col: number, row: number): HeroEntity | undefined {
  return state.heroes.find((h) => h.col === col && h.row === row && h.hp > 0);
}

/**
 * The occupant a villain collides with: a body, never a walkable hazard lying
 * under it. `heroAt` returns whichever was planted first, so a hazard placed
 * before a wall would otherwise hide the wall from the collision check.
 */
export function blockerAt(state: BattleState, col: number, row: number): HeroEntity | undefined {
  return state.heroes.find(
    (h) => h.col === col && h.row === row && h.hp > 0 && !heroDef(h.defId).walkable,
  );
}

/**
 * Occupancy check that lets walkable hazards stack under a body.
 *
 * `walkable` is optional on HeroDef, so it is `undefined` rather than `false`
 * on every ordinary hero — both sides must be normalised or this never fires.
 */
export function cellBlocked(state: BattleState, col: number, row: number, walkable: boolean): boolean {
  return state.heroes.some(
    (h) => h.col === col && h.row === row && h.hp > 0 && !!heroDef(h.defId).walkable === walkable,
  );
}

export function heroById(state: BattleState, id: number): HeroEntity | undefined {
  return state.heroes.find((h) => h.id === id);
}

export function pickupById(state: BattleState, id: number): PickupEntity | undefined {
  return state.pickups.find((p) => p.id === id);
}
