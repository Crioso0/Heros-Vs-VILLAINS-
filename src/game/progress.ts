import { STARTER_HEROES, UNLOCK_ORDER } from '../content/heroes';
import type { HeroId } from '../sim/types';

/**
 * Persistent player progress.
 *
 * Stored in localStorage today. The shape is deliberately a plain serialisable
 * object so the same save can be written to a file by the desktop shell or to
 * device storage on mobile without changing any call sites — see docs/NATIVE.md.
 */
export interface SaveData {
  version: number;
  unlocked: HeroId[];
  cleared: string[];
  /** Last deck used, remembered per level. */
  decks: Record<string, HeroId[]>;
  settings: {
    sfx: boolean;
    music: boolean;
    reducedFx: boolean;
  };
}

const KEY = 'hvv.save.v1';

const DEFAULT_SAVE: SaveData = {
  version: 1,
  unlocked: [...STARTER_HEROES],
  cleared: [],
  decks: {},
  settings: { sfx: true, music: true, reducedFx: false },
};

export class Progress {
  data: SaveData;

  constructor() {
    this.data = load();
  }

  isUnlocked(id: HeroId): boolean {
    return this.data.unlocked.includes(id);
  }

  unlock(id: HeroId): boolean {
    if (this.isUnlocked(id)) return false;
    this.data.unlocked.push(id);
    this.save();
    return true;
  }

  isCleared(levelId: string): boolean {
    return this.data.cleared.includes(levelId);
  }

  clearLevel(levelId: string): void {
    if (!this.data.cleared.includes(levelId)) {
      this.data.cleared.push(levelId);
      this.save();
    }
  }

  /** Levels are unlocked in order; the first of each world needs the previous world cleared. */
  isLevelAvailable(levelId: string, allLevelIds: string[]): boolean {
    const index = allLevelIds.indexOf(levelId);
    if (index <= 0) return true;
    return this.isCleared(allLevelIds[index - 1]);
  }

  rememberDeck(levelId: string, deck: HeroId[]): void {
    this.data.decks[levelId] = deck.slice();
    this.save();
  }

  recallDeck(levelId: string): HeroId[] {
    return (this.data.decks[levelId] ?? []).filter((id) => this.isUnlocked(id));
  }

  /** Everything unlocked, in the campaign's introduction order. */
  roster(): HeroId[] {
    return UNLOCK_ORDER.filter((id) => this.isUnlocked(id));
  }

  unlockAll(): void {
    this.data.unlocked = UNLOCK_ORDER.slice();
    this.save();
  }

  reset(): void {
    this.data = structuredClone(DEFAULT_SAVE);
    this.save();
  }

  save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // Private browsing or a locked-down shell: progress simply stays in memory.
    }
  }
}

function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_SAVE);
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return {
      ...structuredClone(DEFAULT_SAVE),
      ...parsed,
      settings: { ...DEFAULT_SAVE.settings, ...(parsed.settings ?? {}) },
    };
  } catch {
    return structuredClone(DEFAULT_SAVE);
  }
}
