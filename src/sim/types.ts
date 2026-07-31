/**
 * Simulation types.
 *
 * Everything in this file is plain data. The simulation never touches the DOM,
 * canvas, Date.now(), or Math.random(). Given the same seed and the same
 * ordered command stream it produces identical state on every machine — see
 * docs/MULTIPLAYER.md.
 *
 * Board space: x runs 0 (hero home / left edge) .. cols (villain spawn edge),
 * y runs 0 .. rows top-to-bottom. One unit == one lane cell. The renderer is
 * the only thing that knows about pixels.
 */

export type HeroId = string;
export type VillainId = string;
export type SchemeId = string;
export type WorldId = string;

export const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;

/* ------------------------------------------------------------------ *
 * Hero definitions
 * ------------------------------------------------------------------ */

export type HeroRole =
  | 'producer'
  | 'shooter'
  | 'defender'
  | 'melee'
  | 'instant'
  | 'support'
  | 'hazard';

export type TargetLayer = 'ground' | 'air' | 'both';

export interface ProjectileSpec {
  kind: ProjectileKind;
  damage: number;
  /** Cells per second, horizontal. */
  speed: number;
  /** How many villains it passes through before expiring. 1 == stops on first. */
  pierce?: number;
  /** Splash radius in cells; 0 == single target. */
  splash?: number;
  /** Vertical launch velocity for arcing shots (cells/sec, negative == up). */
  arc?: number;
  hits?: TargetLayer;
  effects?: StatusEffectSpec[];
  /** Fires at the nearest target in any lane rather than straight ahead. */
  homing?: boolean;
  /** Bounces to another lane after each hit. */
  ricochet?: number;
}

export type ProjectileKind =
  | 'bolt'
  | 'frost'
  | 'beam'
  | 'construct'
  | 'arrow'
  | 'shield'
  | 'web'
  | 'spark'
  | 'shard'
  | 'batarang'
  | 'blast';

export interface StatusEffectSpec {
  type: 'slow' | 'freeze' | 'burn' | 'stun' | 'root' | 'knockback' | 'strip';
  /** Seconds. */
  duration?: number;
  /** Magnitude: slow factor (0..1), burn dps, knockback cells. */
  power?: number;
}

export interface HeroAttack {
  /** Seconds between activations. */
  interval: number;
  /** Only act when a valid villain is in range. */
  requiresTarget?: boolean;
  /** Forward reach in cells for melee/aura. Projectiles use the whole lane. */
  range?: number;
  /** How many lanes either side this hero can see/hit (0 == own lane only). */
  laneSpread?: number;
  projectile?: ProjectileSpec;
  /** Melee/aura direct damage. */
  damage?: number;
  splash?: number;
  effects?: StatusEffectSpec[];
  hits?: TargetLayer;
  /** Producer output. */
  produces?: { resource: 'solar'; amount: number };
  /** Seconds of "digesting" downtime after a melee bite. */
  windup?: number;
}

export interface HeroDef {
  id: HeroId;
  /** Legally-distinct fan name. */
  name: string;
  /** One-line flavour shown on the card back. */
  tagline: string;
  universe: 'metro' | 'nocturne' | 'cosmic' | 'gamma' | 'street';
  role: HeroRole;
  cost: number;
  /** Card recharge in seconds. */
  recharge: number;
  hp: number;
  attack?: HeroAttack;
  /** Instants resolve immediately on placement and never occupy a cell. */
  instant?: {
    shape: 'cell' | 'lane' | 'square3' | 'column';
    damage: number;
    effects?: StatusEffectSpec[];
    hits?: TargetLayer;
  };
  /** Blocks vaulters/jumpers (tall defenders). */
  tall?: boolean;
  /** Villains walk over it instead of eating it (hazards). */
  walkable?: boolean;
  /** Cannot be placed twice in the same lane. */
  uniquePerLane?: boolean;
  /** Summoned bodies (constructs). Never offered in the card picker or codex. */
  hidden?: boolean;
  /** Leaf Mode ultimate. Instants have none. */
  ultimate?: UltimateDef;
  art: HeroArtSpec;
}

export interface UltimateDef {
  id: string;
  name: string;
  /** Shown in the codex and on the Leaf tooltip. */
  description: string;
  /** Seconds the hero stays in its powered-up pose. */
  duration: number;
}

export interface HeroArtSpec {
  /** Primary suit colour. */
  primary: string;
  secondary: string;
  accent: string;
  /** Skin / core tone. */
  skin: string;
  /** Chest emblem glyph drawn procedurally. */
  emblem: EmblemKind;
  /** Head silhouette. */
  head: 'mask' | 'cowl' | 'helm' | 'hair' | 'hood' | 'visor' | 'bare' | 'aura';
  /** Hair colour for the 'hair' head. Defaults to `secondary`. */
  hair?: string;
  cape?: boolean;
  /** Ambient glow colour, used for Leaf Mode and lighting. */
  glow?: string;
  /** Base scale multiplier. */
  scale?: number;
}

export type EmblemKind =
  | 'diamond'
  | 'bat'
  | 'ring'
  | 'star'
  | 'bolt'
  | 'atom'
  | 'web'
  | 'flame'
  | 'shield'
  | 'sun'
  | 'wave'
  | 'eye'
  | 'arrow'
  | 'fist'
  | 'none';

/* ------------------------------------------------------------------ *
 * Villain definitions
 * ------------------------------------------------------------------ */

export type VillainAbility =
  | 'none'
  /** Vaults the first defender it meets (unless the defender is tall). */
  | 'vault'
  /** Front shield soaks projectile damage until broken. */
  | 'bulwark'
  /** Flies over ground defenders; only air-capable heroes can hit it. */
  | 'flight'
  /** Burrows past defenders, surfacing near the home edge. */
  | 'burrow'
  /** Freezes a random hero in its lane on a timer. */
  | 'chill'
  /** Periodically summons a lesser villain in its lane. */
  | 'summon'
  /** Explodes on death, damaging nearby heroes. */
  | 'detonate'
  /** Smashes the defender it reaches instantly, ignoring HP. */
  | 'crush'
  /** Throws a sidekick over the defence line when damaged enough. */
  | 'hurl'
  /** Fires ranged shots down its lane. */
  | 'gunner';

export interface VillainDef {
  id: VillainId;
  name: string;
  tagline: string;
  faction: 'nocturne' | 'metro' | 'cosmic' | 'gamma' | 'street';
  hp: number;
  /** Extra armour layer (helmet / plating) stripped before HP. */
  armor?: number;
  /** Frontal shield HP: absorbs projectiles from directly ahead only. */
  shield?: number;
  /** Cells per second. */
  speed: number;
  /** Damage per second while attacking a hero. */
  dps: number;
  ability: VillainAbility;
  /** Tuning knob for the ability (summon interval, chill radius, ...). */
  abilityPower?: number;
  /** Menace cost when deployed by a human villain commander. */
  menace: number;
  /** Difficulty weight, used for wave budgets. */
  threat: number;
  /** Boss flag: healthbar at the top, no drone save. */
  boss?: boolean;
  art: VillainArtSpec;
}

export interface VillainArtSpec {
  primary: string;
  secondary: string;
  accent: string;
  skin: string;
  head: 'goon' | 'helm' | 'hood' | 'mask' | 'grin' | 'brute' | 'wings' | 'crown';
  /** Body size multiplier. */
  scale?: number;
  glow?: string;
}

/* ------------------------------------------------------------------ *
 * Worlds & levels
 * ------------------------------------------------------------------ */

export interface WorldDef {
  id: WorldId;
  name: string;
  subtitle: string;
  backdrop: 'gotham' | 'metropolis' | 'lanternCoast' | 'gamma';
  /** Ambient solar drop interval in seconds; 0 == none (night worlds). */
  ambientSolar: number;
  /** Solar the player starts each level with. */
  startingSolar: number;
  palette: {
    sky: [string, string];
    ground: [string, string];
    lane: [string, string];
    fog: string;
    light: string;
  };
  /** Cosmetic weather layer. */
  weather?: 'rain' | 'snow' | 'embers' | 'motes' | 'none';
}

export interface WaveEntry {
  villain: VillainId;
  count: number;
  /** Restrict to these rows; omitted == any row. */
  rows?: number[];
}

export interface WaveDef {
  /** Seconds after the previous wave finished spawning. */
  delay: number;
  entries: WaveEntry[];
  /** "A huge wave of villains is approaching!" */
  huge?: boolean;
  /** Villains in this wave can carry Leaves. */
  leafChance?: number;
}

export interface LevelDef {
  id: string;
  world: WorldId;
  name: string;
  /** Index within the world, for the level select map. */
  order: number;
  rows: number;
  cols: number;
  /** Heroes offered in the card picker; empty == the full unlocked roster. */
  roster?: HeroId[];
  /** Cards forced into the deck (tutorial levels). */
  forced?: HeroId[];
  maxDeck: number;
  startingSolar?: number;
  waves: WaveDef[];
  /** Rows that begin without a Guardian Drone. */
  noDroneRows?: number[];
  intro?: string;
  reward?: HeroId;
}

/* ------------------------------------------------------------------ *
 * Runtime entities
 * ------------------------------------------------------------------ */

export interface StatusState {
  slowUntil: number;
  slowPower: number;
  freezeUntil: number;
  stunUntil: number;
  rootUntil: number;
  burnUntil: number;
  burnDps: number;
}

export interface HeroEntity {
  id: number;
  defId: HeroId;
  col: number;
  row: number;
  hp: number;
  maxHp: number;
  /** Countdown to next attack activation. */
  timer: number;
  /** Seconds remaining of Leaf Mode. */
  ultTime: number;
  /** Ultimate scratch state (beam sweeps, dash counts, ...). */
  ultPhase: number;
  frozenUntil: number;
  /** Expiry time for temporary bodies (constructs). Infinity == permanent. */
  expires: number;
  /** Cosmetic: last time it fired, drives the recoil pose. */
  lastAct: number;
  /** Melee digest timer. */
  busy: number;
  /** Damage-taken flash. */
  hurt: number;
  /** Ticks alive, drives idle animation phase. Deterministic. */
  age: number;
}

export interface VillainEntity {
  id: number;
  defId: VillainId;
  x: number;
  row: number;
  hp: number;
  maxHp: number;
  armor: number;
  shield: number;
  status: StatusState;
  /** Hero currently being attacked, or -1. */
  targetId: number;
  /** Ability cooldown. */
  cd: number;
  /** Ability bookkeeping (vault progress, burrow phase, hurl fired). */
  phase: number;
  /** Set when this villain will drop a Leaf on death. */
  carriesLeaf: boolean;
  /** Air units render and collide differently. */
  airborne: boolean;
  /** Suppresses collision with defenders while burrowing/vaulting. */
  intangible: boolean;
  hurt: number;
  age: number;
  /** Which player deployed it (for versus scoring). -1 == wave director. */
  owner: number;
}

export interface ProjectileEntity {
  id: number;
  kind: ProjectileKind;
  team: 'hero' | 'villain';
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  pierce: number;
  splash: number;
  hits: TargetLayer;
  effects: StatusEffectSpec[];
  ricochet: number;
  homing: boolean;
  /** IDs already hit, so piercing shots don't double-dip. */
  hitIds: number[];
  age: number;
  ownerId: number;
}

export type HazardKind = 'fire' | 'ice' | 'web' | 'smoke' | 'shock' | 'tide' | 'portal';

export interface HazardEntity {
  id: number;
  kind: HazardKind;
  /** Board-space centre. */
  x: number;
  y: number;
  w: number;
  h: number;
  life: number;
  maxLife: number;
  dps: number;
  effects: StatusEffectSpec[];
  /** Re-apply effects at most this often per villain. */
  tickEvery: number;
  tickTimer: number;
  team: 'hero' | 'villain';
}

export interface PickupEntity {
  id: number;
  kind: 'solar' | 'leaf';
  x: number;
  y: number;
  /** Falls toward this y then rests. */
  restY: number;
  vy: number;
  value: number;
  life: number;
  /** Set when the player taps it; animates to the counter then is removed. */
  claimed: boolean;
  claimT: number;
  age: number;
}

export interface DroneEntity {
  id: number;
  row: number;
  x: number;
  /** 0 == parked, 1 == triggered and sweeping. */
  active: number;
  used: boolean;
}

/* ------------------------------------------------------------------ *
 * Battle state
 * ------------------------------------------------------------------ */

export type Phase = 'intro' | 'playing' | 'won' | 'lost';

export interface CardState {
  heroId: HeroId;
  /** Seconds remaining before the card is usable. */
  cooldown: number;
  recharge: number;
}

export interface BattleState {
  levelId: string;
  worldId: WorldId;
  rows: number;
  cols: number;
  /** Elapsed simulated seconds. */
  time: number;
  tick: number;
  phase: Phase;
  rngState: number;

  solar: number;
  /** Villain commander resource (versus mode). */
  menace: number;
  menaceRate: number;

  leaves: number;
  /** 0..1 Overdrive charge; at 1 the player can unleash every ultimate. */
  overdrive: number;

  heroes: HeroEntity[];
  villains: VillainEntity[];
  projectiles: ProjectileEntity[];
  hazards: HazardEntity[];
  pickups: PickupEntity[];
  drones: DroneEntity[];

  cards: CardState[];
  /** Villain commander's deployable roster (versus mode). */
  villainCards: { villainId: VillainId; cooldown: number; recharge: number }[];
  /** Remaining cooldown per villain scheme, keyed by scheme id. */
  schemeCooldowns: Record<string, number>;

  /** Wave director bookkeeping. */
  waveIndex: number;
  waveTimer: number;
  /** Queue of villains waiting to trickle in from the current wave. */
  spawnQueue: { villain: VillainId; row: number; at: number }[];
  /** Wave banner display timer. */
  hugeWaveBanner: number;
  ambientTimer: number;

  nextId: number;
  /** Villains defeated, for the results screen. */
  defeated: number;
  /** Total solar collected, for scoring. */
  solarCollected: number;
  /** Rising 0..1 progress used by the HUD wave meter. */
  progress: number;
}

/* ------------------------------------------------------------------ *
 * Commands — the only way the outside world mutates the simulation
 * ------------------------------------------------------------------ */

export type Command =
  | { t: 'plant'; player: number; heroId: HeroId; col: number; row: number }
  | { t: 'shovel'; player: number; col: number; row: number }
  | { t: 'collect'; player: number; pickupId: number }
  | { t: 'leaf'; player: number; heroId: number }
  | { t: 'overdrive'; player: number }
  | { t: 'deploy'; player: number; villainId: VillainId; row: number }
  | { t: 'scheme'; player: number; schemeId: SchemeId; row: number; col: number };

/** A command stamped with the tick it must execute on. */
export interface ScheduledCommand {
  tick: number;
  cmd: Command;
}
