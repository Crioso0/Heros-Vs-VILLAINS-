import type { App, Screen } from '../app/app';
import { pointInRect, type Rect } from '../core/math';
import { sfx } from '../audio/sfx';
import { directorDeck } from '../ai/director';
import { skirmishLevel } from '../content/levels';
import { villainDef } from '../content/villains';
import { WORLDS } from '../content/worlds';
import { backdropLayer } from '../render/backdrops';
import { drawVillain } from '../render/characters';
import { LAYOUT, VIEW } from '../render/layout';
import { alpha, roundRect, shade, UI } from '../render/palette';
import type { VillainId } from '../sim/types';
import { button, panel, paragraph, text } from '../ui/widgets';
import { DeckScreen } from './deck';
import { MenuScreen } from './menu';

const DIFFICULTY_LABELS = ['Petty crime', 'Organised', 'Costumed', 'Crisis', 'Apocalypse'];

/**
 * Versus setup.
 *
 * One player defends with heroes, the other spends Menace to deploy villains.
 * Today the villain seat is either the AI Director or a second player at the
 * same device; the networked seat lands here too once the transport is wired,
 * because both already speak the same command stream.
 */
export class VersusSetupScreen implements Screen {
  private t = 0;
  private worldIndex = 0;
  private difficulty = 2;
  private ai = true;

  constructor(private app: App) {}

  update(dt: number): void {
    this.t += dt;
  }

  draw(c: CanvasRenderingContext2D): void {
    const world = WORLDS[this.worldIndex];
    c.drawImage(backdropLayer(world, VIEW.w, VIEW.h), 0, 0);
    c.fillStyle = 'rgba(4,7,16,0.7)';
    c.fillRect(0, 0, VIEW.w, VIEW.h);

    const p = this.app.pointer;
    const portrait = LAYOUT.mode === 'portrait';
    // Portrait stacks the three panels into one 688-wide column.
    const colX = portrait ? 16 : 60;
    const colW = portrait ? VIEW.w - 32 : 520;

    text(c, 'VERSUS', VIEW.w / 2, portrait ? 56 : 74, {
      size: portrait ? 24 : 40,
      align: 'center',
      weight: 800,
    });
    paragraph(
      c,
      'Heroes hold the lawn for eight minutes. The villain commander spends Menace to deploy and to run Schemes. Survive the clock or break the line.',
      VIEW.w / 2,
      portrait ? 84 : 104,
      Math.min(760, VIEW.w - 48),
      { size: portrait ? 10 : 14, align: 'center' },
    );

    // Villain seat
    const seatY = portrait ? 130 : 150;
    panel(c, { x: colX, y: seatY, w: colW, h: portrait ? 230 : 200 }, { title: 'VILLAIN SEAT' });
    const seats: [string, boolean][] = [
      ['AI COMMANDER', true],
      ['PLAYER 2 (SAME DEVICE)', false],
    ];
    seats.forEach(([label, isAi], i) => {
      const r: Rect = portrait
        ? { x: colX + 20, y: seatY + 66 + i * 96, w: colW - 40, h: 84 }
        : { x: 82, y: 210 + i * 56, w: 476, h: 46 };
      const active = this.ai === isAi;
      c.save();
      roundRect(c, r.x, r.y, r.w, r.h, 8);
      c.fillStyle = active ? shade(UI.danger, -0.6) : 'rgba(255,255,255,0.05)';
      c.fill();
      c.strokeStyle = active ? UI.danger : 'rgba(255,255,255,0.15)';
      c.lineWidth = active ? 2.5 : 1.5;
      c.stroke();
      text(c, label, r.x + 20, r.y + r.h / 2 + 6, { size: 16, weight: 800, maxWidth: r.w - 40 });
      c.restore();
      if (pointInRect(p.x, p.y, r) && p.released) {
        this.ai = isAi;
        sfx.play('click');
      }
    });
    paragraph(
      c,
      portrait
        ? 'Player 2 uses the villain strip below the board: pick a villain, then tap a lane.'
        : 'Player 2 uses the villain panel on the right edge: pick a villain, then pick a lane.',
      colX + 20,
      portrait ? seatY + 262 : 330,
      colW - 40,
      { size: 12 },
    );

    // Difficulty
    const threatY = portrait ? seatY + 300 : 150;
    panel(c, { x: portrait ? colX : 600, y: threatY, w: portrait ? colW : 620, h: portrait ? 180 : 200 }, { title: 'THREAT LEVEL' });
    for (let i = 0; i < DIFFICULTY_LABELS.length; i++) {
      const r: Rect = portrait
        ? { x: colX + 16 + i * 133, y: threatY + 60, w: 125, h: 84 }
        : { x: 620 + i * 118, y: 206, w: 108, h: 56 };
      const active = this.difficulty === i;
      c.save();
      roundRect(c, r.x, r.y, r.w, r.h, 8);
      c.fillStyle = active ? shade(UI.gold, -0.65) : 'rgba(255,255,255,0.05)';
      c.fill();
      c.strokeStyle = active ? UI.gold : 'rgba(255,255,255,0.15)';
      c.lineWidth = active ? 2.5 : 1.5;
      c.stroke();
      text(c, String(i + 1), r.x + r.w / 2, r.y + r.h * 0.42, {
        size: 20,
        align: 'center',
        weight: 800,
      });
      text(c, DIFFICULTY_LABELS[i], r.x + r.w / 2, r.y + r.h * 0.76, {
        size: 9,
        align: 'center',
        color: UI.inkDim,
        weight: 800,
        maxWidth: r.w - 8,
      });
      c.restore();
      if (pointInRect(p.x, p.y, r) && p.released) {
        this.difficulty = i;
        sfx.play('click');
      }
    }

    // Preview of the villain roster this unlocks.
    const deck = directorDeck(this.difficulty) as VillainId[];
    const previewY = portrait ? threatY + 168 : 336;
    deck.slice(0, portrait ? 8 : 9).forEach((id, i) => {
      const def = villainDef(id);
      drawVillain(c, def.art, (portrait ? colX + 44 : 646) + i * (portrait ? 78 : 62), previewY, {
        time: this.t + i,
        act: 0,
        hurt: 0,
        ult: 0,
        height: 58,
        facing: -1,
        walk: (this.t * 0.4 + i * 0.2) % 1,
        armor: 1,
        shield: 0,
        attacking: false,
      });
    });

    // World
    const arenaY = portrait ? threatY + 200 : 372;
    panel(c, { x: portrait ? colX : 60, y: arenaY, w: portrait ? colW : 1160, h: portrait ? 300 : 130 }, { title: 'ARENA' });
    for (let i = 0; i < WORLDS.length; i++) {
      const w = WORLDS[i];
      const r: Rect = portrait
        ? { x: colX + 20, y: arenaY + 54 + i * 60, w: colW - 40, h: 54 }
        : { x: 82 + i * 288, y: 424, w: 274, h: 60 };
      const active = this.worldIndex === i;
      c.save();
      roundRect(c, r.x, r.y, r.w, r.h, 8);
      c.fillStyle = active ? alpha(w.palette.light, 0.18) : 'rgba(255,255,255,0.05)';
      c.fill();
      c.strokeStyle = active ? w.palette.light : 'rgba(255,255,255,0.15)';
      c.lineWidth = active ? 2.5 : 1.5;
      c.stroke();
      text(c, w.name, r.x + 16, r.y + 24, { size: 16, weight: 800, maxWidth: r.w - 32 });
      text(c, w.subtitle, r.x + 16, r.y + 42, { size: 10, color: UI.inkDim, maxWidth: r.w - 32 });
      c.restore();
      if (pointInRect(p.x, p.y, r) && p.released) {
        this.worldIndex = i;
        sfx.play('click');
      }
    }

    if (button(c, p, portrait ? { x: 16, y: VIEW.h - 104, w: 200, h: 84 } : { x: 60, y: VIEW.h - 92, w: 160, h: 52 }, 'BACK')) {
      this.app.setScreen(new MenuScreen(this.app));
    }
    if (
      button(
        c,
        p,
        portrait
          ? { x: VIEW.w - 316, y: VIEW.h - 104, w: 300, h: 84 }
          : { x: VIEW.w - 300, y: VIEW.h - 92, w: 240, h: 52 },
        'PICK HEROES',
        { accent: UI.leaf },
      )
    ) {
      const level = skirmishLevel(WORLDS[this.worldIndex].id);
      this.app.setScreen(
        new DeckScreen(this.app, level, {
          villainDeck: deck,
          ai: this.ai,
          aggression: 0.25 + this.difficulty * 0.18,
        }),
      );
    }
  }
}
