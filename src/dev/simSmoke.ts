/**
 * Headless simulation smoke test.
 *
 * Runs entirely in Node — no canvas, no DOM — which is only possible because
 * the simulation has no presentation dependencies. That property is also what
 * makes an authoritative server possible later, so this test guards it.
 *
 *   npm run test:sim
 */
import { Rng, seedFromString } from '../core/rng';
import { HEROES, heroDef } from '../content/heroes';
import { levelDef, LEVELS, skirmishLevel } from '../content/levels';
import { VILLAINS } from '../content/villains';
import { Director, directorDeck } from '../ai/director';
import { createContext, step } from '../sim/sim';
import { createBattle, spawnHero, spawnVillain } from '../sim/state';
import { triggerUltimate } from '../sim/ultimates';
import type { BattleState, Command, HeroId, VillainId } from '../sim/types';

let failures = 0;

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title: string): void {
  console.log(`\n${title}`);
}

/** Run `seconds` of simulation, feeding commands from a callback each tick. */
function run(
  state: BattleState,
  ctx: ReturnType<typeof createContext>,
  seconds: number,
  produce?: (state: BattleState, tick: number) => Command[],
): void {
  const ticks = Math.round(seconds * 60);
  for (let i = 0; i < ticks; i++) {
    const cmds = produce?.(state, i) ?? [];
    step(state, ctx, cmds);
    ctx.events.length = 0;
    if (state.phase !== 'playing') break;
  }
}

/* ------------------------------------------------------------------ *
 * Content integrity
 * ------------------------------------------------------------------ */

section('Content');
{
  const ids = new Set(HEROES.map((h) => h.id));
  check('hero ids are unique', ids.size === HEROES.length);
  check('villain ids are unique', new Set(VILLAINS.map((v) => v.id)).size === VILLAINS.length);
  check(
    'every non-instant hero has a Leaf Mode ultimate',
    HEROES.filter((h) => !h.instant && !h.hidden).every((h) => !!h.ultimate),
    HEROES.filter((h) => !h.instant && !h.hidden && !h.ultimate)
      .map((h) => h.id)
      .join(', '),
  );
  check('campaign has levels in every world', LEVELS.length === 40, `got ${LEVELS.length}`);
  check(
    'every level has at least one wave',
    LEVELS.every((l) => l.waves.length > 0),
  );
  check(
    'every wave references a real villain',
    LEVELS.every((l) =>
      l.waves.every((w) => w.entries.every((e) => VILLAINS.some((v) => v.id === e.villain))),
    ),
  );
}

/* ------------------------------------------------------------------ *
 * A full level, played by a very simple bot
 * ------------------------------------------------------------------ */

section('Campaign levels (bot-played)');
{
  const bot = (s: BattleState): Command[] => {
    const out: Command[] = [];
    // Grab everything on the floor.
    for (const p of s.pickups) {
      if (!p.claimed) out.push({ t: 'collect', player: 0, pickupId: p.id });
    }
    // Spend Leaves the moment they land.
    if (s.leaves > 0) {
      const target = s.heroes.find((h) => h.ultTime <= 0 && heroDef(h.defId).ultimate);
      if (target) out.push({ t: 'leaf', player: 0, heroId: target.id });
    }
    const free = (col: number, row: number) =>
      !s.heroes.some((h) => h.col === col && h.row === row);

    // Emergency: a villain about to reach the house gets a Fuse dropped on it.
    // Only when the card is actually ready, or the bot starves itself waiting.
    const fuseReady = s.cards.some((c) => c.heroId === 'fuse' && c.cooldown <= 0);
    const breach = s.villains.find((v) => v.hp > 0 && v.x < 1.6);
    if (fuseReady && breach && s.solar >= 150) {
      out.push({ t: 'plant', player: 0, heroId: 'fuse', col: 1, row: breach.row });
      return out;
    }

    const firstFreeCell = (colLo: number, colHi: number): { col: number; row: number } | null => {
      for (let col = colLo; col <= colHi; col++) {
        for (let row = 0; row < s.rows; row++) {
          if (free(col, row)) return { col, row };
        }
      }
      return null;
    };
    const count = (id: HeroId) => s.heroes.filter((h) => h.defId === id).length;

    // A human-plausible build order: a first rank of producers, a column of
    // guns, then alternate between thickening the economy and the firing line,
    // with walls once there is something worth protecting. The behaviour that
    // matters is that it *saves* for the current target instead of dribbling
    // solar away on whatever happens to be cheap.
    const goals: [HeroId, number, number, number][] = [
      ['solaris', 0, 1, 5],
      ['bluebolt', 2, 2, 5],
      ['solaris', 0, 1, 10],
      ['bluebolt', 3, 3, 10],
      ['bulwark', 7, 7, 5],
      ['bluebolt', 4, 4, 15],
      ['frostbane', 5, 5, 20],
      ['bluebolt', 2, 6, 25],
    ];

    for (const [heroId, colLo, colHi, want] of goals) {
      if (count(heroId) >= want) continue;
      const cell = firstFreeCell(colLo, colHi);
      if (!cell) continue;
      const card = s.cards.find((cc) => cc.heroId === heroId);
      if (!card) continue;
      if (card.cooldown <= 0 && s.solar >= heroDef(heroId).cost) {
        out.push({ t: 'plant', player: 0, heroId, col: cell.col, row: cell.row });
      }
      // Whether or not it could afford it, this is the target — bank for it.
      return out;
    }
    return out;
  };

  const deck: HeroId[] = ['solaris', 'bluebolt', 'bulwark', 'frostbane', 'fuse'];
  const results: Record<string, string> = {};

  for (const levelId of ['gotham-1', 'gotham-3', 'gotham-6', 'metropolis-2', 'emerald_reach-3']) {
    const level = levelDef(levelId);
    const state = createBattle({ level, deck, seed: 12345 });
    const ctx = createContext(12345);
    run(state, ctx, 900, bot);
    results[levelId] = state.phase;
    console.log(
      `       ${levelId}: ${state.phase} at ${state.time.toFixed(0)}s, ` +
        `${state.defeated} defeated, wave ${state.waveIndex}/${level.waves.length}`,
    );
    check(`${levelId} reached a terminal phase`, state.phase !== 'playing', `phase=${state.phase}`);
  }

  // The opening levels have to be winnable by a straightforward build, or the
  // difficulty curve starts in the wrong place. Later stages are expected to
  // beat this bot — it never uses instants, Leaf Mode timing, or air defence.
  check('a basic build clears the first level', results['gotham-1'] === 'won');
  check('a basic build clears an early level', results['gotham-3'] === 'won');
}

/* ------------------------------------------------------------------ *
 * Every ultimate fires without throwing
 * ------------------------------------------------------------------ */

section('Leaf Mode — every ultimate');
{
  const level = levelDef('gotham-5');
  let broken = 0;
  for (const def of HEROES) {
    if (!def.ultimate || def.instant) continue;
    const state = createBattle({ level, deck: [def.id], seed: 99 });
    const ctx = createContext(99);
    // Give it something to shoot at, in several lanes and on both layers.
    for (let row = 0; row < state.rows; row++) {
      const kinds: VillainId[] = ['goon', 'enforcer', 'aerial', 'shieldbearer'];
      kinds.forEach((id, i) => spawnVillain(state, id, row, 3 + i * 1.4));
    }
    const hero = spawnHero(state, def.id, 1, 2);

    try {
      triggerUltimate(state, ctx, hero);
      run(state, ctx, 12);
    } catch (err) {
      broken++;
      console.log(`  FAIL ${def.id} ultimate threw — ${(err as Error).message}`);
    }
  }
  check('all ultimates ran without throwing', broken === 0, `${broken} broken`);
}

/* ------------------------------------------------------------------ *
 * Determinism — the property the netcode depends on
 * ------------------------------------------------------------------ */

section('Determinism');
{
  const fingerprint = (seed: number): string => {
    const level = levelDef('emerald_reach-4');
    const state = createBattle({ level, deck: ['solaris', 'bluebolt', 'bulwark'], seed });
    const ctx = createContext(seed);
    const rng = new Rng(seed ^ 0x5f3759df);
    run(state, ctx, 240, (s, tick) => {
      const out: Command[] = [];
      for (const p of s.pickups) if (!p.claimed) out.push({ t: 'collect', player: 0, pickupId: p.id });
      if (tick % 90 === 0 && s.solar >= 100) {
        out.push({
          t: 'plant',
          player: 0,
          heroId: rng.chance(0.5) ? 'solaris' : 'bluebolt',
          col: rng.int(0, 4),
          row: rng.int(0, s.rows - 1),
        });
      }
      if (s.leaves > 0 && s.heroes.length > 0) {
        out.push({ t: 'leaf', player: 0, heroId: s.heroes[0].id });
      }
      return out;
    });
    return [
      state.tick,
      state.phase,
      state.defeated,
      Math.round(state.solar),
      state.rngState,
      state.villains.map((v) => `${v.defId}@${v.x.toFixed(4)}:${Math.round(v.hp)}`).join('|'),
    ].join('/');
  };

  const a = fingerprint(2024);
  const b = fingerprint(2024);
  const c = fingerprint(2025);
  check('same seed + same commands produce identical state', a === b);
  check('different seeds diverge', a !== c);
}

/* ------------------------------------------------------------------ *
 * Versus: the AI Director drives the villain seat through commands only
 * ------------------------------------------------------------------ */

section('Versus (AI villain commander)');
{
  const level = skirmishLevel('gotham');
  const villainDeck = directorDeck(3) as VillainId[];
  const state = createBattle({
    level,
    deck: ['solaris', 'bluebolt', 'bulwark'],
    villainDeck,
    commanderMode: true,
    seed: seedFromString('versus'),
  });
  const ctx = createContext(7);
  const director = new Director({ aggression: 0.6, seed: 4242 });

  let deployed = 0;
  run(state, ctx, 240, (s) => {
    const out: Command[] = [];
    for (const p of s.pickups) if (!p.claimed) out.push({ t: 'collect', player: 0, pickupId: p.id });
    if (s.solar >= 50 && s.heroes.length < 12) {
      const row = s.heroes.length % s.rows;
      const col = Math.floor(s.heroes.length / s.rows);
      out.push({ t: 'plant', player: 0, heroId: 'solaris', col, row });
    }
    const villainCmds = director.update(s, 1 / 60);
    deployed += villainCmds.filter((c) => c.t === 'deploy').length;
    out.push(...villainCmds);
    return out;
  });

  check('director deployed villains', deployed > 3, `deploys=${deployed}`);
  check('no scripted waves ran in commander mode', state.waveIndex === 0);
  check('villains actually entered the board', state.defeated + state.villains.length > 0);
  console.log(
    `       ${deployed} deploys, ${state.defeated} defeated, phase=${state.phase} at ${state.time.toFixed(0)}s`,
  );
}

/* ------------------------------------------------------------------ * */

console.log(`\n${failures === 0 ? 'PASS' : `FAIL (${failures})`}`);
if (failures > 0) process.exit(1);
