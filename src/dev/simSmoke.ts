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
import {
  BOARD,
  BOTTOM,
  bx,
  by,
  cardRect,
  configureLayout,
  hqRect,
  MIN_TAP,
  schemeButtonRect,
  SOLAR_BOX,
  toolRect,
  TRAY,
  VIEW,
  villainCardRect,
} from '../render/layout';
import { HEROES, heroDef, STARTER_HEROES } from '../content/heroes';
import { levelDef, LEVELS, skirmishLevel } from '../content/levels';
import { VILLAINS } from '../content/villains';
import { Director, directorDeck } from '../ai/director';
import { applyCommand } from '../sim/commands';
import { applyEffect, effectiveSpeed } from '../sim/combat';
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

/* ------------------------------------------------------------------ *
 * Regressions — each of these is a bug that shipped once already
 * ------------------------------------------------------------------ */

section('Regressions');
{
  const level = levelDef('gotham-5');

  // One body per cell. `walkable` is optional on HeroDef, so an un-normalised
  // comparison against `false` silently let heroes stack without limit.
  {
    const state = createBattle({ level, deck: ['bulwark', 'tripwire'], seed: 5 });
    const ctx = createContext(5);
    state.solar = 10000;
    const plant = (heroId: HeroId) => {
      for (const card of state.cards) card.cooldown = 0;
      return applyCommand(state, ctx, { t: 'plant', player: 0, heroId, col: 3, row: 2 });
    };
    const first = plant('bulwark');
    const second = plant('bulwark');
    const hazard = plant('tripwire');
    const hazardTwice = plant('tripwire');
    check('a second body cannot be planted on an occupied cell', first && !second);
    check('a walkable hazard still stacks under a body', hazard === true);
    check('two hazards cannot share a cell', hazardTwice === false);
  }

  // A villain must collide with the body in a cell, not the hazard under it.
  {
    const state = createBattle({ level, deck: ['tripwire', 'bulwark'], seed: 6 });
    const ctx = createContext(6);
    state.solar = 10000;
    spawnHero(state, 'tripwire', 3, 2); // hazard planted FIRST, so it is heroAt's match
    const wall = spawnHero(state, 'bulwark', 3, 2);
    const goon = spawnVillain(state, 'goon', 2, 4.2);
    run(state, ctx, 25);
    check(
      'a villain attacks the body, not the hazard lying under it',
      wall.hp < wall.maxHp,
      `wall hp ${wall.hp}/${wall.maxHp}, goon x=${goon.x.toFixed(2)}`,
    );
  }

  // The Guardian Drone must save a lane even when a vaulter's hop lands the
  // villain past the detection line on the same tick the drone triggers.
  {
    const state = createBattle({ level, deck: ['bulwark'], seed: 7 });
    const ctx = createContext(7);
    spawnHero(state, 'bulwark', 0, 2);
    const vaulter = spawnVillain(state, 'grapnel', 2, 0.9);
    run(state, ctx, 12);
    check(
      'a vaulting villain does not skip past the Guardian Drone',
      state.phase === 'playing' && vaulter.hp <= 0,
      `phase=${state.phase} vaulterHp=${vaulter.hp} x=${vaulter.x.toFixed(2)}`,
    );
  }

  // A lapsed strong slow must not be resurrected by a later weak one.
  {
    const state = createBattle({ level, deck: ['bluebolt'], seed: 8 });
    const ctx = createContext(8);
    const v = spawnVillain(state, 'goon', 2, 8);
    applyEffect(state, ctx, v, { type: 'slow', duration: 1, power: 0.9 });
    run(state, ctx, 3); // strong slow lapses
    applyEffect(state, ctx, v, { type: 'slow', duration: 5, power: 0.2 });
    const speed = effectiveSpeed(state, v);
    const base = 0.23;
    check(
      'an expired strong slow does not carry into a later weak slow',
      Math.abs(speed - base * 0.8) < 1e-6,
      `speed=${speed.toFixed(4)} expected=${(base * 0.8).toFixed(4)}`,
    );
  }

  // Every campaign reward must grant a hero the player does not already own.
  {
    const rewards = LEVELS.map((l) => l.reward).filter(Boolean) as HeroId[];
    check(
      'no level rewards a starter hero',
      rewards.every((id) => !STARTER_HEROES.includes(id)),
      rewards.filter((id) => STARTER_HEROES.includes(id)).join(', '),
    );
    check('no hero is rewarded twice', new Set(rewards).size === rewards.length);
    check(
      'every non-starter hero is obtainable from the campaign',
      HEROES.filter((h) => !h.hidden && !STARTER_HEROES.includes(h.id)).every((h) =>
        rewards.includes(h.id),
      ),
      HEROES.filter((h) => !h.hidden && !STARTER_HEROES.includes(h.id) && !rewards.includes(h.id))
        .map((h) => h.id)
        .join(', '),
    );
  }

  // Each world's finale must field a boss-flagged villain.
  {
    for (const world of ['gotham', 'metropolis', 'emerald_reach', 'gamma_flats']) {
      const finale = levelDef(`${world}-10`);
      const ids = finale.waves.flatMap((w) => w.entries.map((e) => e.villain));
      const hasBoss = ids.some((id) => VILLAINS.find((v) => v.id === id)?.boss);
      check(`${world} finale fields a boss`, hasBoss, ids.join(','));
    }
  }
}

/* ------------------------------------------------------------------ *
 * Layout — portrait must be reachable, landscape must be untouched
 * ------------------------------------------------------------------ */

section('Layout');
{
  // src/render/layout.ts imports only core/math, so it bundles into this Node
  // harness. That is deliberate and worth keeping: it is why these run here.

  // Golden: the landscape profile must reproduce the original constants
  // exactly, or the desktop build silently shifts.
  configureLayout('landscape', 1280, 720);
  const golden =
    VIEW.w === 1280 &&
    VIEW.h === 720 &&
    BOARD.x === 190 &&
    BOARD.y === 150 &&
    BOARD.cellW === 108 &&
    BOARD.cellH === 96 &&
    Math.abs(BOARD.heroH - 96 * 0.92) < 1e-9 &&
    Math.abs(BOARD.villainH - 96 * 0.94) < 1e-9 &&
    TRAY.x === 120 &&
    TRAY.y === 8 &&
    TRAY.cardW === 78 &&
    TRAY.cardH === 106 &&
    SOLAR_BOX.x === 8 &&
    SOLAR_BOX.w === 104 &&
    SOLAR_BOX.h === 106;
  check('landscape layout reproduces the original constants', golden);

  const shovel = toolRect('shovel');
  check(
    'landscape tool rects are unchanged',
    shovel.x === 1218 && shovel.y === 8 && shovel.w === 54 && shovel.h === 54,
    JSON.stringify(shovel),
  );
  const c0 = cardRect(0);
  const c9 = cardRect(9);
  check(
    'landscape card tray is still one row of ten',
    c0.x === 120 && c0.y === 8 && c9.y === 8 && c9.x === 120 + 9 * 84,
    JSON.stringify([c0, c9]),
  );

  // Portrait must fit on real devices.
  const devices: [string, number, number][] = [
    ['iPhone 14', 390, 751],
    ['iPhone SE', 375, 667],
    ['Pixel', 393, 830],
    ['iPad', 768, 1004],
  ];
  const cols = 9;
  const rows = 5;

  for (const [name, w, h] of devices) {
    for (const versusStrip of [false, true]) {
      configureLayout('portrait', w, h, versusStrip);
      const tag = `${name}${versusStrip ? ' (versus)' : ''}`;

      // The villain spawn point and the loss line must both be on screen, or
      // enemies pop into existence mid-lane / never trigger the loss.
      check(`${tag}: villain spawn is on screen`, bx(cols + 0.6) <= VIEW.w, `${bx(cols + 0.6)}`);
      check(`${tag}: the loss line is on screen`, bx(-0.35) >= 0, `${bx(-0.35)}`);
      check(`${tag}: board clears the top bar`, by(0) >= 0);
      check(`${tag}: board clears the bottom bar`, by(rows) <= BOTTOM.top + 1, `${by(rows)} vs ${BOTTOM.top}`);
      check(`${tag}: HQ plate is on screen`, hqRect(rows).x >= 0);

      // Every control must be reachable and finger-sized.
      const controls: [string, { x: number; y: number; w: number; h: number }][] = [
        ['shovel', toolRect('shovel')],
        ['pause', toolRect('pause')],
        ['speed', toolRect('speed')],
        ['leaf', BOTTOM.leaf],
        ['overdrive', BOTTOM.od],
      ];
      for (let i = 0; i < 10; i++) controls.push([`card${i}`, cardRect(i)]);
      // The villain commander's controls only exist when its strip does.
      if (versusStrip) {
        for (let i = 0; i < 4; i++) controls.push([`scheme${i}`, schemeButtonRect(i)]);
        for (let i = 0; i < 8; i++) controls.push([`villain${i}`, villainCardRect(i, 8)]);
      }

      const offscreen = controls.filter(
        ([, r]) => r.x < 0 || r.y < 0 || r.x + r.w > VIEW.w || r.y + r.h > VIEW.h,
      );
      check(`${tag}: every control is inside the view`, offscreen.length === 0, offscreen.map(([n]) => n).join(', '));

      // No two controls may overlap: one tap firing two actions is the exact
      // failure this whole layout pass exists to remove.
      const overlaps: string[] = [];
      for (let i = 0; i < controls.length; i++) {
        for (let j = i + 1; j < controls.length; j++) {
          const a = controls[i][1];
          const b = controls[j][1];
          if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
            overlaps.push(`${controls[i][0]}/${controls[j][0]}`);
          }
        }
      }
      check(`${tag}: no two controls overlap`, overlaps.length === 0, overlaps.join(' '));

      // The tray and the villain strip are the two that must be thumb-sized.
      const small = controls.filter(
        ([n, r]) => (n.startsWith('card') || n.startsWith('scheme') || n === 'leaf') && Math.min(r.w, r.h) < MIN_TAP * 0.85,
      );
      check(`${tag}: primary controls meet the touch minimum`, small.length === 0, small.map(([n]) => n).join(', '));
    }
  }

  // Leave the module in the landscape profile for anything that follows.
  configureLayout('landscape', 1280, 720);
}

/* ------------------------------------------------------------------ * */

console.log(`\n${failures === 0 ? 'PASS' : `FAIL (${failures})`}`);
if (failures > 0) process.exit(1);
