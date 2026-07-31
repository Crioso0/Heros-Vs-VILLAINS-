import type { LevelDef, VillainId, WaveDef, WorldId } from '../sim/types';
import { Rng, seedFromString } from '../core/rng';
import { REWARD_ORDER } from './heroes';
import { VILLAIN_BY_ID } from './villains';
import { WORLDS } from './worlds';

/**
 * Levels are generated from a per-world threat curve rather than hand-authored
 * wave-by-wave, so the campaign scales without thousands of lines of data.
 * Generation is seeded by level id, so every player sees the same level 4-3.
 */

const LEVELS_PER_WORLD = 10;

/** Villain pools per world, in rough order of introduction. */
const WORLD_POOL: Record<WorldId, VillainId[]> = {
  gotham: [
    'goon',
    'riot_goon',
    'grapnel',
    'jester',
    'enforcer',
    'marionette',
    'coldsnap',
    'shieldbearer',
    'juggernought',
  ],
  metropolis: [
    'goon',
    'riot_goon',
    'redshift',
    'enforcer',
    'gunner',
    'aerial',
    'shieldbearer',
    'coldsnap',
    'juggernought',
  ],
  emerald_reach: [
    'goon',
    'riot_goon',
    'aerial',
    'gunner',
    'enforcer',
    'shieldbearer',
    'marionette',
    'colossus_prime',
    'juggernought',
  ],
  gamma_flats: [
    'riot_goon',
    'tunneler',
    'enforcer',
    'redshift',
    'juggernought',
    'aerial',
    'gunner',
    'colossus_prime',
    'marionette',
  ],
};

const WORLD_BOSS: Record<WorldId, VillainId> = {
  gotham: 'the_grin',
  metropolis: 'magnate',
  emerald_reach: 'dread_tyrant',
  gamma_flats: 'colossus_omega',
};

const WORLD_INTRO: Record<WorldId, string> = {
  gotham:
    'No sun after dark. Bring your own power source — and something that can see in the rain.',
  metropolis:
    'Daylight, open plaza, and a very rich man who wants the block cleared by five.',
  emerald_reach:
    'Deep space. The Corps is stretched thin and something yellow is walking the lanes.',
  gamma_flats:
    'The ground hums. Whatever is under it is coming up behind your line.',
};

function buildWaves(worldId: WorldId, order: number, rows: number): WaveDef[] {
  const rng = new Rng(seedFromString(`${worldId}:${order}:waves`));
  const pool = WORLD_POOL[worldId];
  const boss = order === LEVELS_PER_WORLD;
  const worldIndex = WORLDS.findIndex((w) => w.id === worldId);

  // How many villain types this level is allowed to draw from. The opening
  // level of the campaign gets exactly one, so the tutorial is plain bodies.
  const variety = Math.min(pool.length, 1 + Math.floor((order - 1) * 0.7) + worldIndex);
  const available = pool.slice(0, Math.max(1, variety));

  const waveCount = boss ? 12 : 6 + Math.floor(order / 2);
  // Threat budget grows with world and level index. Tuned against the bot in
  // src/dev/simSmoke.ts: a straightforward producer/shooter/wall build should
  // clear the early stages and start struggling around the third world.
  const baseBudget = 1.0 + worldIndex * 1.2 + (order - 1) * 0.85;

  const waves: WaveDef[] = [];
  for (let i = 0; i < waveCount; i++) {
    const isFlag = (i + 1) % 5 === 0 || i === waveCount - 1;
    // A gentle ramp plus a flag-wave spike. Kept modest because levels here are
    // shorter than the genre norm, so the player has less time to build up.
    const ramp = 1 + (0.7 * i) / Math.max(1, waveCount - 1);
    let budget = baseBudget * ramp * (isFlag ? 1.5 : 1);

    const entries: WaveDef['entries'] = [];
    // Boss arrives alone at the front of the final wave.
    if (boss && i === waveCount - 1) {
      entries.push({ villain: WORLD_BOSS[worldId], count: 1, rows: [Math.floor(rows / 2)] });
      budget *= 0.5;
    }

    let guard = 0;
    while (budget > 0 && guard++ < 40) {
      const affordable = available.filter((v) => threatOf(v) <= budget + 0.5);
      if (affordable.length === 0) break;
      // Later waves lean toward the scarier half of the pool.
      const bias = i / Math.max(1, waveCount - 1);
      const choice = rng.weighted(affordable, (v) => {
        const t = threatOf(v);
        return Math.pow(t, bias * 2.2) + 0.35;
      });
      const t = threatOf(choice);
      const count = Math.max(1, Math.min(4, Math.floor(budget / Math.max(1, t))));
      const take = Math.min(count, rng.int(1, 3));
      entries.push({ villain: choice, count: take });
      budget -= t * take;
    }

    if (entries.length === 0) entries.push({ villain: 'goon', count: 1 });

    waves.push({
      delay: i === 0 ? (boss ? 18 : 30) : isFlag ? 12 : rng.range(15, 22),
      entries,
      huge: isFlag && i > 0,
      // Leaves start dropping once the player has heroes worth feeding.
      leafChance: order >= 2 || worldIndex > 0 ? (isFlag ? 0.5 : 0.28) : 0,
    });
  }
  return waves;
}

function threatOf(id: VillainId): number {
  return VILLAIN_BY_ID[id]?.threat ?? 1;
}

/** How many hero cards the deck holds at a given campaign depth. */
function deckSize(worldIndex: number, order: number): number {
  return Math.min(10, 3 + worldIndex + Math.floor(order / 2));
}

function makeLevel(worldId: WorldId, order: number): LevelDef {
  const worldIndex = WORLDS.findIndex((w) => w.id === worldId);
  const globalIndex = worldIndex * LEVELS_PER_WORLD + order;
  const rows = 5;
  const cols = 9;
  const boss = order === LEVELS_PER_WORLD;

  // Reward a new hero on most levels. REWARD_ORDER excludes the starters, so
  // every slot grants something the player does not already own; levels past
  // the end of the sequence simply award nothing.
  const reward = REWARD_ORDER[globalIndex - 1];

  const level: LevelDef = {
    id: `${worldId}-${order}`,
    world: worldId,
    order,
    name: boss ? `${order}. Showdown` : `${worldId === 'gotham' ? 'Night' : 'Stage'} ${order}`,
    rows,
    cols,
    maxDeck: deckSize(worldIndex, order),
    waves: buildWaves(worldId, order, rows),
    intro: order === 1 ? WORLD_INTRO[worldId] : undefined,
    reward,
  };

  // The very first level of the campaign forces the tutorial pair.
  if (worldIndex === 0 && order === 1) {
    level.forced = ['solaris', 'bluebolt'];
    level.maxDeck = 3;
  }
  return level;
}

export const LEVELS: LevelDef[] = WORLDS.flatMap((w) =>
  Array.from({ length: LEVELS_PER_WORLD }, (_, i) => makeLevel(w.id, i + 1)),
);

export const LEVEL_BY_ID: Record<string, LevelDef> = Object.fromEntries(
  LEVELS.map((l) => [l.id, l]),
);

export function levelDef(id: string): LevelDef {
  const def = LEVEL_BY_ID[id];
  if (!def) throw new Error(`Unknown level: ${id}`);
  return def;
}

export function levelsOfWorld(worldId: WorldId): LevelDef[] {
  return LEVELS.filter((l) => l.world === worldId);
}

/**
 * A wave-less arena used by Versus: villains arrive only from a commander.
 *
 * Registered in LEVEL_BY_ID on creation — the simulation resolves its level by
 * id every tick, so any level handed to createBattle must be findable.
 */
export function skirmishLevel(worldId: WorldId): LevelDef {
  const id = `skirmish-${worldId}`;
  const existing = LEVEL_BY_ID[id];
  if (existing) return existing;

  const level: LevelDef = {
    id,
    world: worldId,
    order: 0,
    name: 'Skirmish',
    rows: 5,
    cols: 9,
    maxDeck: 10,
    startingSolar: 150,
    waves: [],
  };
  LEVEL_BY_ID[id] = level;
  return level;
}
