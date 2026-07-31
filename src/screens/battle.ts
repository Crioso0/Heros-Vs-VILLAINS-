import type { App, Screen } from '../app/app';
import { Director, directorDeck } from '../ai/director';
import { sfx } from '../audio/sfx';
import { clamp, dist2, pointInRect, type Rect } from '../core/math';
import { seedFromString } from '../core/rng';
import { heroDef } from '../content/heroes';
import { worldDef } from '../content/worlds';
import { Match } from '../net/match';
import { BattleRenderer } from '../render/renderer';
import { bx, by, LAYOUT, screenToCell, VIEW } from '../render/layout';
import { UI } from '../render/palette';
import type { HeroId, LevelDef, VillainId } from '../sim/types';
import { Hud, type HudAction } from '../ui/hud';
import { button, panel, paragraph, text } from '../ui/widgets';
import { MapScreen } from './map';
import { MenuScreen } from './menu';

export interface VersusOptions {
  villainDeck: VillainId[];
  /** When true the villain seat is played by the AI Director. */
  ai: boolean;
  aggression: number;
}

export interface BattleOptions {
  level: LevelDef;
  deck: HeroId[];
  versus?: VersusOptions;
}

export class BattleScreen implements Screen {
  private match: Match;
  private renderer = new BattleRenderer();
  private hud = new Hud();
  private director: Director | null = null;

  private selectedCard: number | null = null;
  private dragging = false;
  private shovel = false;
  private carryingLeaf = false;
  /** Set on the press that arms a Leaf, so its own release is not a drop. */
  private leafArmedThisPress = false;
  private selectedVillainCard: number | null = null;
  private selectedScheme: string | null = null;
  private paused = false;
  private speed = 1;
  private t = 0;
  /** Real seconds since the last frame, cached in update() for draw(). */
  private lastDt = 1 / 60;
  private resolved = false;
  private rewarded: HeroId | null = null;
  /** Versus has no wave list, so the hero side wins by surviving the clock. */
  private readonly survivalTarget = 480;
  private survived = false;

  constructor(
    private app: App,
    private opts: BattleOptions,
  ) {
    const versus = opts.versus;
    this.match = new Match({
      level: opts.level,
      deck: opts.deck,
      villainDeck: versus?.villainDeck ?? [],
      commanderMode: !!versus,
      seed: seedFromString(`${opts.level.id}:${Date.now()}`),
    });
    if (versus?.ai) {
      this.director = new Director({ aggression: versus.aggression, seed: 1337 });
    }
    // The hot-seat villain seat needs its own strip in portrait, which changes
    // how much vertical room the board gets.
    app.versusStrip = !!versus && !versus.ai;
    app.requestLayout();

    // A rotation is a blackout of about a second with a live simulation behind
    // it: drop any half-made gesture and hand control back to the player.
    app.onLayoutChange = () => {
      this.selectedCard = null;
      this.dragging = false;
      this.shovel = false;
      this.carryingLeaf = false;
      this.leafArmedThisPress = false;
      this.selectedVillainCard = null;
      this.selectedScheme = null;
      if (!this.resolved) this.paused = true;
    };
  }

  dispose(): void {
    this.app.onLayoutChange = null;
    this.app.versusStrip = false;
  }

  /* ---------------------------------------------------------------- *
   * Frame
   * ---------------------------------------------------------------- */

  update(dt: number): void {
    this.t += dt;
    this.lastDt = dt;
    const p = this.app.pointer;
    const state = this.match.state;

    this.match.setPaused(this.paused || this.resolved);
    this.match.setSpeed(this.speed);

    if (this.director && !this.paused && !this.resolved) {
      for (const cmd of this.director.update(state, dt)) this.match.issue(cmd);
    }

    this.match.advance(dt);

    const events = this.match.drainEvents();
    this.renderer.consume(events, state);
    for (const ev of events) {
      if (ev.t === 'sound') sfx.play(ev.id);
    }

    // Hover state for the renderer.
    this.renderer.hover = screenToCell(p.x, p.y, state.cols, state.rows);
    this.renderer.carrying =
      this.selectedCard !== null && this.dragging
        ? { heroId: state.cards[this.selectedCard].heroId, x: p.x, y: p.y }
        : null;
    if (this.selectedCard !== null && !this.dragging) {
      this.renderer.carrying = { heroId: state.cards[this.selectedCard].heroId, x: -999, y: -999 };
    }
    this.renderer.carryingLeaf = this.carryingLeaf ? { x: p.x, y: p.y } : null;
    this.renderer.hoverHero = this.carryingLeaf ? (this.heroUnder(p.x, p.y)?.id ?? null) : null;

    if (
      this.opts.versus &&
      !this.resolved &&
      state.phase === 'playing' &&
      state.time >= this.survivalTarget
    ) {
      this.resolved = true;
      this.survived = true;
      sfx.play('win');
    }

    if (!this.resolved && (state.phase === 'won' || state.phase === 'lost')) {
      this.resolved = true;
      if (state.phase === 'won') {
        this.app.progress.clearLevel(this.opts.level.id);
        const reward = this.opts.level.reward;
        if (reward && this.app.progress.unlock(reward)) this.rewarded = reward;
      }
    }
  }

  draw(c: CanvasRenderingContext2D): void {
    const state = this.match.state;
    // Effects follow the fast-forward button so they stay in step with the sim.
    this.renderer.draw(c, state, this.paused ? 0 : this.lastDt * this.speed);

    const action = this.hud.draw(c, state, this.app.pointer, {
      selectedCard: this.selectedCard,
      shovelActive: this.shovel,
      paused: this.paused,
      speed: this.speed,
      villainSide: !!this.opts.versus && !this.opts.versus.ai,
      selectedVillainCard: this.selectedVillainCard,
      selectedScheme: this.selectedScheme,
      time: this.t,
      progressOverride: this.opts.versus
        ? {
            ratio: clamp(state.time / this.survivalTarget, 0, 1),
            label: formatClock(Math.max(0, this.survivalTarget - state.time)),
            caption: 'TIME REMAINING',
          }
        : undefined,
    });

    this.handlePointer(action);

    if (this.opts.versus) this.drawVersusStatus(c);
    if (this.paused && !this.resolved) this.drawPause(c);
    if (this.resolved) this.drawResults(c);
  }

  /* ---------------------------------------------------------------- *
   * Input
   * ---------------------------------------------------------------- */

  private handlePointer(action: HudAction | null): void {
    const p = this.app.pointer;
    const state = this.match.state;

    if (this.resolved || this.paused) {
      // Only the overlay buttons are live.
      if (action?.kind === 'pause') this.paused = !this.paused;
      return;
    }

    // Collecting solar and leaves takes priority over every other press, and
    // works with a card armed: on touch a tap on an orb over the lawn would
    // otherwise plant a hero there and lose the orb.
    if (p.pressed && !this.carryingLeaf) {
      const pick = this.pickupUnder(p.x, p.y);
      if (pick) {
        this.match.issue({ t: 'collect', player: 0, pickupId: pick });
        return;
      }
    }

    switch (action?.kind) {
      case 'pickCard':
        // Tapping the armed card again disarms it. Without this there is no way
        // to cancel a selection on a touch screen.
        this.selectedCard = action.index === this.selectedCard ? null : (action.index ?? null);
        this.dragging = this.selectedCard !== null;
        this.shovel = false;
        this.carryingLeaf = false;
        return;
      case 'shovel':
        this.shovel = !this.shovel;
        this.selectedCard = null;
        return;
      case 'pause':
        this.paused = !this.paused;
        return;
      case 'speed':
        this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1;
        return;
      case 'overdrive':
        this.match.issue({ t: 'overdrive', player: 0 });
        return;
      case 'pickLeaf':
        // Emitted on press (hud.ts), so the matching release arrives next and
        // would otherwise be read as a drop on empty ground.
        this.carryingLeaf = true;
        this.leafArmedThisPress = true;
        this.selectedCard = null;
        this.shovel = false;
        return;
      case 'villainCard':
        this.selectedVillainCard = action.index ?? null;
        this.selectedScheme = null;
        return;
      case 'scheme':
        this.selectedScheme = action.id ?? null;
        this.selectedVillainCard = null;
        return;
      default:
        break;
    }

    // Villain commander: with a card selected, a click anywhere in a lane
    // deploys into that lane.
    if (this.selectedVillainCard !== null && p.released) {
      const target = screenToCell(p.x, p.y, state.cols, state.rows);
      if (target) {
        const card = state.villainCards[this.selectedVillainCard];
        if (card) {
          this.match.issue({
            t: 'deploy',
            player: 1,
            villainId: card.villainId,
            row: target.row,
          });
        }
        this.selectedVillainCard = null;
        return;
      }
    }

    const cell = screenToCell(p.x, p.y, state.cols, state.rows);

    // Villain commander targeting a scheme on the board.
    if (this.selectedScheme && p.released && cell) {
      this.match.issue({
        t: 'scheme',
        player: 1,
        schemeId: this.selectedScheme,
        row: cell.row,
        col: cell.col,
      });
      this.selectedScheme = null;
      return;
    }

    if (this.carryingLeaf) {
      if (p.released) {
        if (this.leafArmedThisPress) {
          // This is the release of the arming click — stay armed for the drop.
          this.leafArmedThisPress = false;
        } else {
          const hero = this.heroUnder(p.x, p.y);
          if (hero) this.match.issue({ t: 'leaf', player: 0, heroId: hero.id });
          this.carryingLeaf = false;
        }
      }
      return;
    }

    if (this.shovel && p.released && cell) {
      this.match.issue({ t: 'shovel', player: 0, col: cell.col, row: cell.row });
      this.shovel = false;
      return;
    }

    if (this.selectedCard !== null) {
      if (p.released) {
        if (cell) {
          const card = state.cards[this.selectedCard];
          this.match.issue({
            t: 'plant',
            player: 0,
            heroId: card.heroId,
            col: cell.col,
            row: cell.row,
          });
          this.selectedCard = null;
          this.dragging = false;
        } else if (this.dragging && !pointInRect(p.x, p.y, this.cardHitBox(this.selectedCard))) {
          // Dragged off the tray and released on nothing: cancel.
          this.selectedCard = null;
          this.dragging = false;
        } else {
          // Tap on the card: stay armed so the next tap places (touch-friendly).
          this.dragging = false;
        }
      }
    }
  }

  onKey(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();
    const state = this.match.state;

    if (key >= '1' && key <= '9') {
      const idx = Number(key) - 1;
      if (idx < state.cards.length) {
        this.selectedCard = this.selectedCard === idx ? null : idx;
        this.dragging = false;
        this.shovel = false;
      }
      return;
    }
    switch (key) {
      case ' ':
        this.match.issue({ t: 'overdrive', player: 0 });
        break;
      case 'f':
        if (state.leaves > 0) this.carryingLeaf = !this.carryingLeaf;
        this.leafArmedThisPress = false;
        break;
      case 's':
        this.shovel = !this.shovel;
        this.selectedCard = null;
        break;
      case 'p':
        this.paused = !this.paused;
        break;
      case 'escape':
        if (this.resolved) this.app.setScreen(new MapScreen(this.app));
        else this.paused = !this.paused;
        break;
      default:
        break;
    }
  }

  /* ---------------------------------------------------------------- *
   * Hit testing
   * ---------------------------------------------------------------- */

  private cardHitBox(index: number): Rect {
    return this.hud.cardRects[index] ?? { x: -1, y: -1, w: 0, h: 0 };
  }

  private pickupUnder(x: number, y: number): number | null {
    let best: number | null = null;
    const reach = LAYOUT.mode === 'portrait' ? 72 : 52;
    let bestD = reach * reach;
    for (const p of this.match.state.pickups) {
      if (p.claimed) continue;
      const d = dist2(x, y, bx(p.x), by(p.y));
      if (d < bestD) {
        bestD = d;
        best = p.id;
      }
    }
    return best;
  }

  private heroUnder(x: number, y: number): { id: number } | null {
    const state = this.match.state;
    const cell = screenToCell(x, y, state.cols, state.rows);
    if (!cell) return null;
    const hero = state.heroes.find(
      (h) => h.col === cell.col && h.row === cell.row && !heroDef(h.defId).walkable,
    );
    return hero ? { id: hero.id } : null;
  }

  /* ---------------------------------------------------------------- *
   * Overlays
   * ---------------------------------------------------------------- */

  private drawVersusStatus(c: CanvasRenderingContext2D): void {
    // Sits directly above the villain deploy column, clear of the scheme row
    // and inside the right edge of the view.
    const portrait = LAYOUT.mode === 'portrait';
    const label = this.opts.versus?.ai ? 'VILLAIN AI' : 'PLAYER 2';
    if (portrait) {
      if (!this.opts.versus?.ai) return; // the strip header already says it
      text(c, label, VIEW.w - 12, TOP_BAR_LABEL_Y, {
        size: 10,
        align: 'right',
        color: UI.danger,
        weight: 800,
      });
      return;
    }
    text(c, label, VIEW.w - 8, 143, {
      size: 10,
      align: 'right',
      color: UI.danger,
      weight: 800,
    });
  }

  private drawPause(c: CanvasRenderingContext2D): void {
    c.fillStyle = 'rgba(4,7,16,0.72)';
    c.fillRect(0, 0, VIEW.w, VIEW.h);
    const portrait = LAYOUT.mode === 'portrait';
    const w = portrait ? VIEW.w - 48 : 380;
    const h = portrait ? 380 : 250;
    const r: Rect = { x: VIEW.w / 2 - w / 2, y: VIEW.h / 2 - h / 2, w, h };
    panel(c, r, { title: 'PAUSED' });
    const p = this.app.pointer;
    const bh = portrait ? 84 : 48;
    const gap = portrait ? 96 : 58;
    if (button(c, p, { x: r.x + 40, y: r.y + 70, w: r.w - 80, h: bh }, 'RESUME')) {
      this.paused = false;
    }
    if (
      button(c, p, { x: r.x + 40, y: r.y + 70 + gap, w: r.w - 80, h: bh }, 'RESTART', {
        small: true,
      })
    ) {
      this.app.setScreen(new BattleScreen(this.app, this.opts));
    }
    if (
      button(c, p, { x: r.x + 40, y: r.y + 70 + gap * 2, w: r.w - 80, h: bh }, 'QUIT TO MAP', {
        small: true,
      })
    ) {
      this.app.setScreen(new MapScreen(this.app));
    }
  }

  private drawResults(c: CanvasRenderingContext2D): void {
    const state = this.match.state;
    const won = state.phase === 'won' || this.survived;
    c.fillStyle = won ? 'rgba(8,26,16,0.78)' : 'rgba(28,6,10,0.8)';
    c.fillRect(0, 0, VIEW.w, VIEW.h);

    const portrait = LAYOUT.mode === 'portrait';
    const w = portrait ? VIEW.w - 40 : 520;
    const h = portrait ? 640 : 420;
    const r: Rect = { x: VIEW.w / 2 - w / 2, y: VIEW.h / 2 - h / 2, w, h };
    panel(c, r, { accent: won ? UI.leaf : UI.danger });

    text(c, won ? 'CITY SECURED' : 'THE VILLAINS GOT THROUGH', VIEW.w / 2, r.y + 62, {
      size: portrait ? 20 : 34,
      align: 'center',
      weight: 800,
      color: won ? UI.leaf : UI.danger,
      maxWidth: r.w - 40,
    });
    text(
      c,
      `${worldDef(state.worldId).name} · ${this.opts.level.name}`,
      VIEW.w / 2,
      r.y + 90,
      { size: 14, align: 'center', color: UI.inkDim },
    );

    const stats = [
      ['Villains defeated', String(state.defeated)],
      ['Solar collected', String(Math.floor(state.solarCollected))],
      ['Time', `${Math.floor(state.time / 60)}m ${Math.floor(state.time % 60)}s`],
      ['Heroes standing', String(state.heroes.length)],
    ];
    const rowPitch = portrait ? 44 : 26;
    stats.forEach(([label, value], i) => {
      const y = r.y + 132 + i * rowPitch;
      text(c, label, r.x + 44, y, { size: 15, color: UI.inkDim });
      text(c, value, r.x + r.w - 44, y, { size: 15, align: 'right', weight: 800 });
    });

    const statsBottom = r.y + 132 + stats.length * rowPitch;
    if (this.rewarded) {
      const def = heroDef(this.rewarded);
      text(c, 'NEW HERO RECRUITED', VIEW.w / 2, statsBottom + 26, {
        size: 13,
        align: 'center',
        color: UI.gold,
        weight: 800,
      });
      text(c, def.name, VIEW.w / 2, statsBottom + 56, { size: 26, align: 'center', weight: 800 });
      // paragraph() passes x straight to fillText, so a centred paragraph must
      // be given the centre, not the left edge.
      paragraph(c, def.tagline, r.x + r.w / 2, statsBottom + 82, r.w - 120, {
        size: 13,
        align: 'center',
      });
    }

    const p = this.app.pointer;
    // Stacked full-width in portrait; a 3-across row is 26 CSS px tall on a phone.
    const mk = (i: number): Rect =>
      portrait
        ? { x: r.x + 40, y: r.y + r.h - 280 + i * 90, w: r.w - 80, h: 84 }
        : { x: r.x + 40 + i * 150, y: r.y + r.h - 66, w: 140, h: 48 };
    if (button(c, p, mk(0), won ? 'CONTINUE' : 'MAP')) {
      this.app.setScreen(new MapScreen(this.app));
    }
    if (button(c, p, mk(1), 'RETRY')) {
      this.app.setScreen(new BattleScreen(this.app, this.opts));
    }
    if (button(c, p, mk(2), 'MENU', { small: true })) {
      this.app.setScreen(new MenuScreen(this.app));
    }
  }
}

/** Sits under the portrait top bar, clear of the tools row. */
const TOP_BAR_LABEL_Y = 104;

function formatClock(seconds: number): string {
  const mm = Math.floor(seconds / 60);
  const ss = Math.floor(seconds % 60);
  return `${mm}:${ss.toString().padStart(2, '0')}`;
}

/** Convenience used by the Versus setup screen. */
export function defaultVillainDeck(difficulty: number): VillainId[] {
  return directorDeck(difficulty) as VillainId[];
}
