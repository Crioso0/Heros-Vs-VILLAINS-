import type { WorldDef, WorldId } from '../sim/types';

/**
 * Worlds are the visual + rules identity of a run of levels: skyline,
 * palette, weather, and whether solar falls from the sky.
 *
 * Backdrops are drawn procedurally in src/render/backdrops.ts, so adding a
 * world is a matter of adding an entry here and a paint function there.
 */
export const WORLDS: WorldDef[] = [
  {
    id: 'gotham',
    name: 'The Grim City',
    subtitle: 'Rooftops · Midnight · No sun to speak of',
    backdrop: 'gotham',
    // No sun after dark: every point of solar has to come from a producer,
    // so the opening bank is larger to compensate.
    ambientSolar: 0,
    startingSolar: 175,
    weather: 'rain',
    palette: {
      sky: ['#080b1a', '#1b2140'],
      ground: ['#1d2233', '#12151f'],
      lane: ['#232a3d', '#1a2030'],
      fog: 'rgba(90,110,170,0.16)',
      light: '#7d8fd6',
    },
  },
  {
    id: 'metropolis',
    name: 'The Bright City',
    subtitle: 'Civic Plaza · Noon · Solar everywhere',
    backdrop: 'metropolis',
    ambientSolar: 9,
    startingSolar: 50,
    weather: 'none',
    palette: {
      sky: ['#3fa9f5', '#bfe6ff'],
      ground: ['#4c8f4a', '#356b36'],
      lane: ['#5aa356', '#48853f'],
      fog: 'rgba(255,255,255,0.10)',
      light: '#ffe9a8',
    },
  },
  {
    id: 'emerald_reach',
    name: 'Emerald Reach',
    subtitle: 'Corps Citadel · Deep space · Willpower ambient',
    backdrop: 'lanternCoast',
    ambientSolar: 11,
    startingSolar: 75,
    weather: 'motes',
    palette: {
      sky: ['#04140d', '#0d3a24'],
      ground: ['#0f3d2a', '#08251a'],
      lane: ['#16513a', '#0e3a29'],
      fog: 'rgba(70,255,150,0.12)',
      light: '#4dff87',
    },
  },
  {
    id: 'gamma_flats',
    name: 'Gamma Flats',
    subtitle: 'Irradiated desert · Dusk · Something is humming',
    backdrop: 'gamma',
    ambientSolar: 13,
    startingSolar: 75,
    weather: 'embers',
    palette: {
      sky: ['#2a1030', '#7a3b2e'],
      ground: ['#54452e', '#33291d'],
      lane: ['#63523a', '#3d3225'],
      fog: 'rgba(160,255,120,0.10)',
      light: '#a8ff7a',
    },
  },
];

export const WORLD_BY_ID: Record<WorldId, WorldDef> = Object.fromEntries(
  WORLDS.map((w) => [w.id, w]),
);

export function worldDef(id: WorldId): WorldDef {
  const def = WORLD_BY_ID[id];
  if (!def) throw new Error(`Unknown world: ${id}`);
  return def;
}
