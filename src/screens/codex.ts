import type { App, Screen } from '../app/app';
import { pointInRect, type Rect } from '../core/math';
import { sfx } from '../audio/sfx';
import { HEROES } from '../content/heroes';
import { VILLAINS } from '../content/villains';
import { backdropLayer } from '../render/backdrops';
import { drawHero, drawVillain } from '../render/characters';
import { drawLeafGlyph } from '../render/renderer';
import { LAYOUT, VIEW } from '../render/layout';
import { alpha, roundRect, UI } from '../render/palette';
import { worldDef } from '../content/worlds';
import { button, panel, paragraph, text } from '../ui/widgets';
import { MenuScreen } from './menu';

/** Roster browser: every hero, every villain, every Leaf Mode power. */
export class CodexScreen implements Screen {
  private t = 0;
  private tab: 'heroes' | 'villains' = 'heroes';
  private selected = 0;

  constructor(private app: App) {}

  update(dt: number): void {
    this.t += dt;
  }

  draw(c: CanvasRenderingContext2D): void {
    c.drawImage(backdropLayer(worldDef('emerald_reach'), VIEW.w, VIEW.h), 0, 0);
    c.fillStyle = 'rgba(4,7,16,0.78)';
    c.fillRect(0, 0, VIEW.w, VIEW.h);

    const p = this.app.pointer;
    const portrait = LAYOUT.mode === 'portrait';
    text(c, 'CODEX', portrait ? 20 : 40, portrait ? 50 : 58, {
      size: portrait ? 20 : 34,
      weight: 800,
    });

    const tabs: ['heroes' | 'villains', string][] = [
      ['heroes', `HEROES (${HEROES.filter((h) => !h.hidden).length})`],
      ['villains', `VILLAINS (${VILLAINS.length})`],
    ];
    tabs.forEach(([id, label], i) => {
      const r: Rect = portrait
        ? { x: 16 + i * 236, y: 100, w: 228, h: 60 }
        : { x: 220 + i * 190, y: 30, w: 180, h: 40 };
      const active = this.tab === id;
      c.save();
      roundRect(c, r.x, r.y, r.w, r.h, 8);
      c.fillStyle = active ? 'rgba(60,90,150,0.4)' : 'rgba(255,255,255,0.05)';
      c.fill();
      c.strokeStyle = active ? UI.gold : 'rgba(255,255,255,0.15)';
      c.lineWidth = active ? 2.5 : 1.5;
      c.stroke();
      text(c, label, r.x + r.w / 2, r.y + r.h / 2 + 6, {
        size: 14,
        align: 'center',
        weight: 800,
        color: active ? UI.ink : UI.inkDim,
      });
      c.restore();
      if (pointInRect(p.x, p.y, r) && p.released && this.tab !== id) {
        this.tab = id;
        this.selected = 0;
        sfx.play('click');
      }
    });

    const heroList = HEROES.filter((h) => !h.hidden);
    const count = this.tab === 'heroes' ? heroList.length : VILLAINS.length;
    this.selected = Math.min(this.selected, count - 1);

    // Grid — column count is derived so the rows always end above the detail
    // panel at y=460; a fixed 8 columns spilled a 4th row underneath it, where
    // cards were hidden but still clickable.
    const cw = portrait ? 108 : 84;
    const ch = portrait ? 118 : 96;
    const gridTop = portrait ? 180 : 96;
    const detailTop = portrait ? VIEW.h - 360 : VIEW.h - 260;
    // Derive columns from the width available, then rows from what is left
    // above the detail panel — a fixed column count cannot fit both views.
    const cols = Math.max(1, Math.floor((VIEW.w - 80 + 10) / (cw + 10)));
    const maxRows = Math.max(1, Math.floor((detailTop - gridTop - 10) / (ch + 10)));
    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      if (row >= maxRows) continue;
      const r: Rect = { x: 40 + col * (cw + 10), y: gridTop + row * (ch + 10), w: cw, h: ch };
      const active = this.selected === i;
      const hot = pointInRect(p.x, p.y, r);
      const locked =
        this.tab === 'heroes' && !this.app.progress.isUnlocked(heroList[i].id);

      c.save();
      roundRect(c, r.x, r.y, r.w, r.h, 9);
      c.fillStyle = active ? 'rgba(50,74,120,0.65)' : 'rgba(16,22,38,0.9)';
      c.fill();
      c.save();
      roundRect(c, r.x, r.y, r.w, r.h, 9);
      c.clip();
      if (locked) c.globalAlpha = 0.25;
      if (this.tab === 'heroes') {
        drawHero(c, heroList[i].art, r.x + r.w / 2, r.y + r.h - 14, {
          time: this.t + i * 0.3,
          act: 0,
          hurt: 0,
          ult: 0,
          height: 74,
          facing: 1,
        });
      } else {
        drawVillain(c, VILLAINS[i].art, r.x + r.w / 2, r.y + r.h - 14, {
          time: this.t + i * 0.3,
          act: 0,
          hurt: 0,
          ult: 0,
          height: 70,
          facing: -1,
          walk: (this.t * 0.4 + i * 0.2) % 1,
          armor: 1,
          shield: 0,
          attacking: false,
        });
      }
      c.restore();
      if (locked) {
        text(c, '?', r.x + r.w / 2, r.y + r.h / 2 + 10, {
          size: 30,
          align: 'center',
          weight: 800,
          color: UI.inkDim,
        });
      }
      c.restore();
      c.lineWidth = active ? 3 : 1.5;
      c.strokeStyle = active ? UI.gold : hot ? alpha(UI.gold, 0.6) : 'rgba(120,150,210,0.25)';
      roundRect(c, r.x, r.y, r.w, r.h, 9);
      c.stroke();

      if (hot && p.released) {
        this.selected = i;
        sfx.play('click');
      }
    }

    // Detail
    const dr: Rect = portrait
      ? { x: 16, y: detailTop, w: VIEW.w - 32, h: 330 }
      : { x: 40, y: detailTop, w: VIEW.w - 80, h: 190 };
    // In portrait the right-hand column of the panel restacks underneath.
    const colX = portrait ? dr.x + 24 : dr.x + 800;
    const colY = portrait ? dr.y + 190 : dr.y;
    const colW = portrait ? dr.w - 48 : 340;
    const bodyW = portrait ? dr.w - 200 : 560;
    if (this.tab === 'heroes') {
      const def = heroList[this.selected];
      const locked = !this.app.progress.isUnlocked(def.id);
      panel(c, dr, { accent: alpha(def.art.glow ?? UI.gold, 0.7) });
      drawHero(c, def.art, dr.x + 90, dr.y + dr.h - 24, {
        time: this.t,
        act: 0,
        hurt: 0,
        ult: 1,
        height: 148,
        facing: 1,
      });
      text(c, locked ? '???' : def.name, dr.x + 190, dr.y + 44, { size: 30, weight: 800 });
      text(
        c,
        `${def.role.toUpperCase()} · ${def.cost} SOLAR · ${def.hp} HP · ${def.recharge}s RECHARGE`,
        dr.x + 190,
        dr.y + 68,
        { size: 12, color: UI.inkDim, weight: 800 },
      );
      paragraph(c, locked ? 'Not yet recruited.' : def.tagline, dr.x + 190, dr.y + 96, bodyW, {
        size: 14,
      });
      if (def.ultimate && !locked) {
        drawLeafGlyph(c, colX, colY + 44, 12);
        text(c, `LEAF MODE · ${def.ultimate.name}`, colX + 22, colY + 50, {
          size: 15,
          weight: 800,
          color: UI.leaf,
          maxWidth: colW - 22,
        });
        paragraph(c, def.ultimate.description, colX, colY + 78, colW, { size: 13 });
      }
    } else {
      const def = VILLAINS[this.selected];
      panel(c, dr, { accent: alpha(def.art.glow ?? UI.danger, 0.7) });
      drawVillain(c, def.art, dr.x + 90, dr.y + dr.h - 24, {
        time: this.t,
        act: 0,
        hurt: 0,
        ult: 0,
        height: 140,
        facing: -1,
        walk: (this.t * 0.5) % 1,
        armor: 1,
        shield: def.shield ?? 0,
        attacking: false,
      });
      text(c, def.name, dr.x + 190, dr.y + 44, { size: 30, weight: 800 });
      text(
        c,
        `${def.hp} HP${def.armor ? ` · ${def.armor} ARMOUR` : ''}${
          def.shield ? ` · ${def.shield} SHIELD` : ''
        } · ${def.menace} MENACE`,
        dr.x + 190,
        dr.y + 68,
        { size: 12, color: UI.inkDim, weight: 800 },
      );
      paragraph(c, def.tagline, dr.x + 190, dr.y + 96, bodyW, { size: 14 });
      text(c, `ABILITY · ${abilityLabel(def.ability)}`, colX, colY + 50, {
        size: 15,
        weight: 800,
        color: UI.danger,
        maxWidth: colW,
      });
      paragraph(c, abilityText(def.ability), colX, colY + 78, colW, { size: 13 });
    }

    const backRect: Rect = portrait
      ? { x: VIEW.w - 156, y: 24, w: 140, h: 60 }
      : { x: VIEW.w - 180, y: 30, w: 140, h: 40 };
    if (button(c, p, backRect, 'BACK', { small: true })) {
      this.app.setScreen(new MenuScreen(this.app));
    }
  }
}

function abilityLabel(a: string): string {
  return a === 'none' ? 'STRAIGHT AHEAD' : a.toUpperCase();
}

function abilityText(a: string): string {
  switch (a) {
    case 'vault':
      return 'Leaps the first defender it meets. A tall defender stops it cold.';
    case 'bulwark':
      return 'A frontal shield soaks projectiles. Splash, melee and hazards go straight through.';
    case 'flight':
      return 'Flies over the whole defence line. Only air-capable heroes can touch it.';
    case 'burrow':
      return 'Tunnels under the lawn and surfaces behind your line.';
    case 'chill':
      return 'Freezes a hero in its lane every few seconds.';
    case 'summon':
      return 'Calls in reinforcements on a timer.';
    case 'detonate':
      return 'Explodes when destroyed, damaging everything nearby.';
    case 'crush':
      return 'Destroys the defender it reaches outright, however much HP it had.';
    case 'hurl':
      return 'Throws a sidekick over your line once it is badly hurt.';
    case 'gunner':
      return 'Shoots down its lane from outside melee range.';
    default:
      return 'Walks forward and eats whatever is in the way.';
  }
}
