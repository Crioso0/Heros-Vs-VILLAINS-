import type { App, Screen } from '../app/app';
import { sfx } from '../audio/sfx';
import { HERO_BY_ID } from '../content/heroes';
import { LEVELS, levelsOfWorld } from '../content/levels';
import { WORLDS } from '../content/worlds';
import { backdropLayer, drawWeather } from '../render/backdrops';
import { drawHero } from '../render/characters';
import { LAYOUT, VIEW } from '../render/layout';
import { alpha, roundRect, shade, UI } from '../render/palette';
import { pointInRect, type Rect } from '../core/math';
import { button, panel, paragraph, text } from '../ui/widgets';
import { DeckScreen } from './deck';
import { MenuScreen } from './menu';

/** World and level selection. */
export class MapScreen implements Screen {
  private t = 0;
  private worldIndex = 0;
  private lastDt = 1 / 60;
  private allIds = LEVELS.map((l) => l.id);

  constructor(private app: App) {
    // Open on the furthest world the player has reached.
    for (let i = WORLDS.length - 1; i >= 0; i--) {
      const first = levelsOfWorld(WORLDS[i].id)[0];
      if (first && this.app.progress.isLevelAvailable(first.id, this.allIds)) {
        this.worldIndex = i;
        break;
      }
    }
  }

  update(dt: number): void {
    this.t += dt;
    this.lastDt = dt;
  }

  draw(c: CanvasRenderingContext2D): void {
    const world = WORLDS[this.worldIndex];
    c.drawImage(backdropLayer(world, VIEW.w, VIEW.h), 0, 0);
    drawWeather(c, world, VIEW.w, VIEW.h, this.t, this.lastDt);
    c.fillStyle = 'rgba(4,7,16,0.55)';
    c.fillRect(0, 0, VIEW.w, VIEW.h);

    const p = this.app.pointer;
    const portrait = LAYOUT.mode === 'portrait';

    text(c, world.name.toUpperCase(), VIEW.w / 2, 74, {
      size: portrait ? 24 : 42,
      align: 'center',
      weight: 800,
      maxWidth: VIEW.w - 40,
    });
    text(c, world.subtitle, VIEW.w / 2, 100, {
      size: portrait ? 10 : 14,
      align: 'center',
      color: UI.inkDim,
      maxWidth: VIEW.w - 40,
    });

    // World tabs — a 4-across row is 870px wide, so portrait uses a 2x2 grid.
    const tabW = 210;
    const totalW = WORLDS.length * (tabW + 10) - 10;
    for (let i = 0; i < WORLDS.length; i++) {
      const w = WORLDS[i];
      const r: Rect = portrait
        ? { x: 16 + (i % 2) * 348, y: 140 + Math.floor(i / 2) * 68, w: 340, h: 60 }
        : { x: VIEW.w / 2 - totalW / 2 + i * (tabW + 10), y: 124, w: tabW, h: 38 };
      const firstLevel = levelsOfWorld(w.id)[0];
      const open = this.app.progress.isLevelAvailable(firstLevel.id, this.allIds);
      const active = i === this.worldIndex;
      c.save();
      roundRect(c, r.x, r.y, r.w, r.h, 8);
      c.fillStyle = active ? shade(w.palette.light, -0.55) : 'rgba(12,17,30,0.8)';
      c.fill();
      c.strokeStyle = active ? w.palette.light : 'rgba(140,170,235,0.25)';
      c.lineWidth = active ? 2.5 : 1.5;
      c.stroke();
      c.globalAlpha = open ? 1 : 0.4;
      text(c, open ? w.name : 'LOCKED', r.x + r.w / 2, r.y + r.h / 2 + 6, {
        size: 15,
        align: 'center',
        weight: 800,
        color: active ? UI.ink : UI.inkDim,
      });
      c.restore();
      if (open && pointInRect(p.x, p.y, r) && p.released) {
        sfx.play('click');
        this.worldIndex = i;
      }
    }

    // Level nodes
    const levels = levelsOfWorld(world.id);
    const nodeW = portrait ? 156 : 96;
    const nodeH = portrait ? 120 : 96;
    const cols = portrait ? 4 : 5;
    const gapX = portrait ? 12 : 18;
    const gapY = portrait ? 18 : 22;
    const gridW = cols * (nodeW + gapX) - gapX;
    const startX = VIEW.w / 2 - gridW / 2;
    const startY = portrait ? 290 : 200;

    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const r: Rect = {
        x: startX + col * (nodeW + gapX),
        y: startY + row * (nodeH + gapY),
        w: nodeW,
        h: nodeH,
      };
      const available = this.app.progress.isLevelAvailable(level.id, this.allIds);
      const cleared = this.app.progress.isCleared(level.id);
      const boss = level.order === 10;
      const hot = pointInRect(p.x, p.y, r);

      c.save();
      roundRect(c, r.x, r.y, r.w, r.h, 12);
      c.fillStyle = cleared
        ? 'rgba(30,70,45,0.85)'
        : available
          ? 'rgba(18,26,44,0.9)'
          : 'rgba(10,12,20,0.85)';
      c.fill();
      c.lineWidth = hot && available ? 3 : 2;
      c.strokeStyle = boss
        ? UI.danger
        : cleared
          ? UI.leaf
          : available
            ? alpha(world.palette.light, 0.8)
            : 'rgba(255,255,255,0.12)';
      c.stroke();
      c.globalAlpha = available ? 1 : 0.4;
      text(c, boss ? 'BOSS' : String(level.order), r.x + r.w / 2, r.y + r.h * 0.46, {
        size: boss ? 20 : 34,
        align: 'center',
        weight: 800,
        color: boss ? UI.danger : UI.ink,
      });
      text(c, `${level.waves.length} waves`, r.x + r.w / 2, r.y + r.h * 0.69, {
        size: 10,
        align: 'center',
        color: UI.inkDim,
      });
      if (cleared) {
        text(c, '✓', r.x + r.w - 14, r.y + 20, { size: 16, align: 'center', color: UI.leaf });
      }
      // Reward portrait
      if (
        level.reward &&
        HERO_BY_ID[level.reward] &&
        !cleared &&
        !this.app.progress.isUnlocked(level.reward)
      ) {
        c.globalAlpha = available ? 0.9 : 0.3;
        drawHero(c, HERO_BY_ID[level.reward].art, r.x + 20, r.y + r.h - 6, {
          time: this.t,
          act: 0,
          hurt: 0,
          ult: 0,
          height: portrait ? 44 : 34,
          facing: 1,
        });
      }
      c.restore();

      if (available && hot && p.released) {
        sfx.play('click');
        this.app.setScreen(new DeckScreen(this.app, level));
      }
    }

    // Footer
    const footTop = portrait ? VIEW.h - 200 : VIEW.h - 96;
    panel(c, { x: 20, y: footTop, w: VIEW.w - 40, h: portrait ? 116 : 78 }, { radius: 12 });
    paragraph(
      c,
      levels[0]?.intro ??
        'Pick a stage. Clear it to recruit the hero shown on the node.',
      portrait ? 36 : 40,
      footTop + 34,
      portrait ? VIEW.w - 72 : VIEW.w - 320,
      { size: portrait ? 11 : 14 },
    );

    // Well separated in portrait: UNLOCK ALL is a destructive progression
    // change and must not sit a thumb-width from BACK.
    const backRect: Rect = portrait
      ? { x: 16, y: VIEW.h - 100, w: 200, h: 84 }
      : { x: VIEW.w - 260, y: VIEW.h - 78, w: 110, h: 42 };
    const unlockRect: Rect = portrait
      ? { x: VIEW.w - 216, y: VIEW.h - 100, w: 200, h: 84 }
      : { x: VIEW.w - 140, y: VIEW.h - 78, w: 110, h: 42 };

    if (button(c, p, backRect, 'BACK', { small: true })) {
      this.app.setScreen(new MenuScreen(this.app));
    }
    if (
      button(c, p, unlockRect, 'UNLOCK ALL', {
        small: true,
        accent: UI.leaf,
      })
    ) {
      // Sandbox convenience: try the whole roster without grinding the campaign.
      this.app.progress.unlockAll();
      sfx.play('leaf');
    }
  }
}
