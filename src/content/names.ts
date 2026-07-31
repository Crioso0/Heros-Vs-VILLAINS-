import type { HeroDef, VillainDef } from '../sim/types';

/**
 * Character naming.
 *
 * This is a personal fan project, so the roster can show the characters it is
 * homaging by name. Every entry keeps two names:
 *
 *   name   the original creation for this project ("Paragon")
 *   alias  the character it is a homage to ("Superman")
 *
 * `NAME_MODE.real` picks which one the UI shows. It defaults to the aliases,
 * because that is what the game is for. Flipping it to false switches the whole
 * game back to the original names in one place — useful if the project ever
 * goes anywhere more public, since the original set is the one that is entirely
 * ours. Nothing else in the codebase branches on it: ids, art, stats and
 * balance are identical either way.
 */
export const NAME_MODE = { real: true };

/** The name to show for a hero or villain, honouring the current mode. */
export function displayName(def: { name: string; alias?: string }): string {
  return NAME_MODE.real && def.alias ? def.alias : def.name;
}

/** The other name, for the Codex subtitle. */
export function subName(def: { name: string; alias?: string }): string | null {
  if (!def.alias) return null;
  return NAME_MODE.real ? def.name : def.alias;
}

export function heroDisplayName(def: HeroDef): string {
  return displayName(def);
}

export function villainDisplayName(def: VillainDef): string {
  return displayName(def);
}
