import type { App, Screen } from '../app/app';
import { pointInRect, type Rect } from '../core/math';
import { sfx } from '../audio/sfx';
import { heroDef } from '../content/heroes';
import { worldDef } from '../content/worlds';
import { backdropLayer } from '../render/backdrops';
import { drawHero } from '../render/characters';
import { drawLeafGlyph } from '../render/renderer';
import { VIEW } from '../render/layout';
import { alpha, roundRect, UI } from '../render/palette';
import type { HeroId, LevelDef } from '../sim/types';
import { button, panel, paragraph, text } from '../ui/widgets';
import { BattleScreen, type VersusOptions } from './battle';
import { MapScreen } from './map';
import { MenuScreen } from './menu';

/** Card picker. Choose the deck you take into a level. */
export class DeckScreen implements Screen {
  private t = 0;
  private deck: HeroId[] = [];
  private roster: HeroId[];
  private detail: HeroId | null = null;

  constructor(
    private app: App,
    private level: LevelDef,
    private versus?: VersusOptions,
  ) {
    this.roster = level.roster
      ? level.roster.filter((id) => app.progress.isUnlocked(id))
      : app.progress.roster();

    const remembered = app.progress.recallDeck(level.id);
    this.deck = [...(level.forced ?? [])];
    for (const id of remembered) {
      if (this.deck.length >= level.maxDeck) break;
      if (!this.deck.includes(id) && this.roster.includes(id)) this.deck.push(id);
    }
    this.detail = this.roster[0] ?? null;
  }

  update(dt: number): void {
    this.t += dt;
  }

  draw(c: CanvasRenderingContext2D): void {
    const world = worldDef(this.level.world);
    c.drawImage(backdropLayer(world, VIEW.w, VIEW.h), 0, 0);
    c.fillStyle = 'rgba(4,7,16,0.72)';
    c.fillRect(0, 0, VIEW.w, VIEW.h);

    const p = this.app.pointer;

    text(c, 'CHOOSE YOUR ROSTER', 40, 56, { size: 30, weight: 800 });
    text(
      c,
      `${world.name} · ${this.level.name} · ${this.deck.length}/${this.level.maxDeck} slots`,
      40,
      80,
      { size: 14, color: UI.inkDim },
    );

    // Selected deck strip
    panel(c, { x: 40, y: 98, w: VIEW.w - 80, h: 128 }, { radius: 12 });
    for (let i = 0; i < this.level.maxDeck; i++) {
      const r: Rect = { x: 58 + i * 96, y: 116, w: 86, h: 92 };
      const id = this.deck[i];
      const forced = !!id && (this.level.forced ?? []).includes(id);
      c.save();
      roundRect(c, r.x, r.y, r.w, r.h, 10);
      c.fillStyle = id ? '#1b2440' : 'rgba(255,255,255,0.04)';
      c.fill();
      c.strokeStyle = id ? alpha(UI.gold, 0.6) : 'rgba(255,255,255,0.12)';
      c.lineWidth = 2;
      c.setLineDash(id ? [] : [6, 5]);
      c.stroke();
      c.setLineDash([]);
      if (id) {
        const def = heroDef(id);
        c.save();
        roundRect(c, r.x, r.y, r.w, r.h, 10);
        c.clip();
        drawHero(c, def.art, r.x + r.w / 2, r.y + r.h - 18, {
          time: this.t + i,
          act: 0,
          hurt: 0,
          ult: 0,
          height: 74,
          facing: 1,
        });
        c.restore();
        c.fillStyle = 'rgba(0,0,0,0.72)';
        c.fillRect(r.x, r.y + r.h - 18, r.w, 18);
        text(c, def.name.toUpperCase(), r.x + r.w / 2, r.y + r.h - 5, {
          size: 9,
          align: 'center',
          weight: 800,
          color: forced ? UI.gold : UI.ink,
        });
      }
      c.restore();
      if (id && !forced && pointInRect(p.x, p.y, r) && p.released) {
        this.deck.splice(i, 1);
        sfx.play('click');
      }
    }

    // Roster grid
    const cols = 9;
    const cardW = 86;
    const cardH = 104;
    const gridX = 40;
    const gridY = 248;
    for (let i = 0; i < this.roster.length; i++) {
      const id = this.roster[i];
      const def = heroDef(id);
      const col = i % cols;
      const row = Math.floor(i / cols);
      const r: Rect = {
        x: gridX + col * (cardW + 10),
        y: gridY + row * (cardH + 10),
        w: cardW,
        h: cardH,
      };
      const inDeck = this.deck.includes(id);
      const hot = pointInRect(p.x, p.y, r);

      c.save();
      roundRect(c, r.x, r.y, r.w, r.h, 9);
      c.fillStyle = inDeck ? 'rgba(40,60,40,0.9)' : '#161d31';
      c.fill();
      c.save();
      roundRect(c, r.x, r.y, r.w, r.h, 9);
      c.clip();
      c.globalAlpha = inDeck ? 0.4 : 1;
      drawHero(c, def.art, r.x + r.w / 2, r.y + r.h - 22, {
        time: this.t + i * 0.4,
        act: 0,
        hurt: 0,
        ult: 0,
        height: 78,
        facing: 1,
      });
      c.restore();
      c.fillStyle = 'rgba(0,0,0,0.78)';
      c.fillRect(r.x, r.y + r.h - 30, r.w, 30);
      text(c, def.name.toUpperCase(), r.x + r.w / 2, r.y + r.h - 18, {
        size: 9,
        align: 'center',
        weight: 800,
      });
      text(c, `${def.cost}`, r.x + r.w / 2, r.y + r.h - 6, {
        size: 11,
        align: 'center',
        weight: 800,
        color: UI.solar,
      });
      if (def.ultimate) drawLeafGlyph(c, r.x + r.w - 12, r.y + 12, 8);
      c.restore();

      c.lineWidth = hot ? 3 : 1.5;
      c.strokeStyle = inDeck ? UI.leaf : hot ? UI.gold : 'rgba(120,150,210,0.3)';
      roundRect(c, r.x, r.y, r.w, r.h, 9);
      c.stroke();

      if (hot) this.detail = id;
      if (hot && p.released && !inDeck && this.deck.length < this.level.maxDeck) {
        this.deck.push(id);
        sfx.play('plant');
      }
    }

    // Detail panel
    if (this.detail) {
      const def = heroDef(this.detail);
      const r: Rect = { x: VIEW.w - 360, y: VIEW.h - 236, w: 320, h: 196 };
      panel(c, r, { accent: alpha(def.art.glow ?? UI.gold, 0.7), radius: 12 });
      text(c, def.name, r.x + 18, r.y + 30, { size: 22, weight: 800 });
      text(c, `${def.cost} solar · ${def.hp} HP · ${def.recharge}s`, r.x + 18, r.y + 50, {
        size: 12,
        color: UI.inkDim,
      });
      paragraph(c, def.tagline, r.x + 18, r.y + 72, r.w - 36, { size: 13 });
      if (def.ultimate) {
        drawLeafGlyph(c, r.x + 26, r.y + 110, 11);
        text(c, def.ultimate.name, r.x + 44, r.y + 115, {
          size: 14,
          weight: 800,
          color: UI.leaf,
        });
        paragraph(c, def.ultimate.description, r.x + 18, r.y + 138, r.w - 36, { size: 12 });
      } else {
        paragraph(c, 'Single-use. No Leaf Mode.', r.x + 18, r.y + 116, r.w - 36, { size: 12 });
      }
    }

    // Actions
    const canStart = this.deck.length > 0;
    if (button(c, p, { x: 40, y: VIEW.h - 76, w: 130, h: 48 }, 'BACK')) {
      this.app.setScreen(
        this.versus ? new MenuScreen(this.app) : new MapScreen(this.app),
      );
    }
    if (
      button(c, p, { x: 184, y: VIEW.h - 76, w: 150, h: 48 }, 'AUTO-FILL', { small: true })
    ) {
      for (const id of this.roster) {
        if (this.deck.length >= this.level.maxDeck) break;
        if (!this.deck.includes(id)) this.deck.push(id);
      }
    }
    if (
      button(
        c,
        p,
        { x: 348, y: VIEW.h - 76, w: 200, h: 48 },
        canStart ? 'START' : 'PICK A HERO',
        { disabled: !canStart, accent: UI.leaf },
      )
    ) {
      this.app.progress.rememberDeck(this.level.id, this.deck);
      sfx.play('click');
      this.app.setScreen(
        new BattleScreen(this.app, {
          level: this.level,
          deck: this.deck,
          versus: this.versus,
        }),
      );
    }
  }
}
