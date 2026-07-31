import type { SchemeId } from '../sim/types';

/**
 * Villain-side abilities. Only the villain commander (human in Versus, the AI
 * Director in single player) can spend Menace on these. They are the villain
 * player's answer to Leaf Mode.
 */
export interface SchemeDef {
  id: SchemeId;
  name: string;
  description: string;
  cost: number;
  cooldown: number;
  /** 'lane' targets a row, 'cell' targets a single tile, 'board' is global. */
  shape: 'lane' | 'cell' | 'board';
  color: string;
}

export const SCHEMES: SchemeDef[] = [
  {
    id: 'surge',
    name: 'Surge',
    description: 'Every villain in the lane sprints for 6 seconds.',
    cost: 100,
    cooldown: 18,
    shape: 'lane',
    color: '#ff5252',
  },
  {
    id: 'blackout',
    name: 'Blackout',
    description: 'Cuts the power: heroes in a 3×3 are frozen for 5 seconds.',
    cost: 150,
    cooldown: 26,
    shape: 'cell',
    color: '#7c4dff',
  },
  {
    id: 'reinforce',
    name: 'Reinforce',
    description: 'Bolts fresh plating onto every villain in the lane.',
    cost: 125,
    cooldown: 22,
    shape: 'lane',
    color: '#ffab40',
  },
  {
    id: 'sabotage',
    name: 'Sabotage',
    description: 'Wrecks one hero outright, wherever it stands.',
    cost: 225,
    cooldown: 40,
    shape: 'cell',
    color: '#ff1744',
  },
];

export const SCHEME_BY_ID: Record<SchemeId, SchemeDef> = Object.fromEntries(
  SCHEMES.map((s) => [s.id, s]),
);
