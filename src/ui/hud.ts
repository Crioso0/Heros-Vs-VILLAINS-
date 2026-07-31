import { clamp, pointInRect, type Rect } from '../core/math';
import { heroDef } from '../content/heroes';
import { villainDef } from '../content/villains';
import { displayName } from '../content/names';
import { SCHEMES } from '../content/schemes';
import { drawHero, drawVillain } from '../render/characters';
import { drawLeafGlyph } from '../render/renderer';
import {
  BOARD,
  BOTTOM,
  cardRect,
  LAYOUT,
  laneStripRect,
  schemeButtonRect,
  SOLAR_BOX,
  toolRect,
  TRAY,
  VERSUS,
  VIEW,
  villainCardRect,
} from '../render/layout';
import { alpha, ellipse, roundRect, shade, UI } from '../render/palette';
import type { BattleState } from '../sim/types';
import { meter, panel, text, type PointerState } from './widgets';

export interface HudAction {
  kind:
    | 'pickCard'
    | 'shovel'
    | 'pause'
    | 'speed'
    | 'overdrive'
    | 'pickLeaf'
    | 'villainCard'
    | 'scheme';
  index?: number;
  id?: string;
}

export interface HudInput {
  selectedCard: number | null;
  shovelActive: boolean;
  paused: boolean;
  speed: number;
  /** Villain commander UI is only drawn in versus mode. */
  villainSide: boolean;
  selectedVillainCard: number | null;
  selectedScheme: string | null;
  time: number;
  /** Replaces the wave meter when a mode has no wave list (Versus). */
  progressOverride?: { ratio: number; label: string; caption: string };
  /** 0..1 kick on the counters when a pickup lands in them. */
  solarPunch?: number;
  leafPunch?: number;
}

export class Hud {
  /** Populated during draw so the battle screen can hit-test cheaply. */
  cardRects: Rect[] = [];
  villainRects: Rect[] = [];
  schemeRects: Rect[] = [];

  draw(
    c: CanvasRenderingContext2D,
    state: BattleState,
    p: PointerState,
    input: HudInput,
  ): HudAction | null {
    let action: HudAction | null = null;

    action = this.drawSolar(c, state, p, input) ?? action;
    action = this.drawTray(c, state, p, input) ?? action;
    action = this.drawTools(c, p, input) ?? action;
    action = this.drawBottomBar(c, state, p, input) ?? action;
    if (input.villainSide) action = this.drawVillainPanel(c, state, p, input) ?? action;
    this.drawWaveBanner(c, state);

    return action;
  }

  /* ---------------------------------------------------------------- */

  private drawSolar(
    c: CanvasRenderingContext2D,
    state: BattleState,
    p: PointerState,
    input: HudInput,
  ): HudAction | null {
    const r = SOLAR_BOX;
    // The counter kicks when solar lands in it, so the arc that flew across the
    // screen visibly ends somewhere.
    const punch = input.solarPunch ?? 0;
    panel(c, r, { accent: alpha(UI.solar, 0.5 + punch * 0.5), radius: 12 });

    const orbY = r.y + r.h * 0.34;
    const scale = 1 + punch * 0.22;
    c.save();
    c.translate(r.x + r.w / 2, orbY);
    c.scale(scale, scale);
    const g = c.createRadialGradient(0, 0, 3, 0, 0, 26);
    g.addColorStop(0, '#fffbe0');
    g.addColorStop(0.45, UI.solar);
    g.addColorStop(1, alpha(UI.solar, 0));
    c.fillStyle = g;
    ellipse(c, 0, 0, 26, 26);
    c.fill();
    c.restore();

    text(c, String(Math.floor(state.solar)), r.x + r.w / 2, r.y + r.h * 0.79, {
      size: 26 + punch * 5,
      align: 'center',
      weight: 800,
      color: punch > 0.05 ? '#fff8d0' : UI.ink,
    });
    text(c, 'SOLAR', r.x + r.w / 2, r.y + r.h - 4, {
      size: 10,
      align: 'center',
      color: UI.inkDim,
    });
    void p;
    return null;
  }

  private drawTray(
    c: CanvasRenderingContext2D,
    state: BattleState,
    p: PointerState,
    input: HudInput,
  ): HudAction | null {
    this.cardRects = [];
    let action: HudAction | null = null;

    for (let i = 0; i < state.cards.length; i++) {
      const card = state.cards[i];
      const def = heroDef(card.heroId);
      const r = cardRect(i);
      this.cardRects.push(r);

      const affordable = state.solar >= def.cost;
      const ready = card.cooldown <= 0;
      const usable = affordable && ready;
      const hot = pointInRect(p.x, p.y, r);
      const selected = input.selectedCard === i;

      c.save();
      roundRect(c, r.x, r.y, r.w, r.h, 9);
      const bg = c.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
      bg.addColorStop(0, '#20293f');
      bg.addColorStop(1, '#141a2b');
      c.fillStyle = bg;
      c.fill();
      c.clip();

      // Portrait figure, name plate and cost pill all derive from the card, so
      // the 128x132 phone card and the 78x106 desktop card share one recipe.
      const plateH = Math.round(TRAY.cardH * 0.17);
      const costH = Math.round(TRAY.cardH * 0.13);
      c.save();
      c.globalAlpha = usable ? 1 : 0.55;
      drawHero(c, def.art, r.x + r.w / 2, r.y + r.h - plateH - costH + 4, {
        time: input.time + i,
        act: 0,
        hurt: 0,
        ult: 0,
        height: TRAY.cardH * 0.7,
        facing: 1,
      });
      c.restore();

      // Name plate
      c.fillStyle = 'rgba(6,9,18,0.82)';
      c.fillRect(r.x, r.y + r.h - plateH - costH - 2, r.w, plateH);
      text(c, displayName(def).toUpperCase(), r.x + r.w / 2, r.y + r.h - costH - plateH * 0.35, {
        size: 9,
        align: 'center',
        color: usable ? UI.ink : UI.inkDim,
        weight: 800,
        maxWidth: r.w - 6,
      });

      // Cost
      c.fillStyle = affordable ? UI.solar : '#7c6a3a';
      roundRect(c, r.x + 4, r.y + r.h - costH - 2, r.w - 8, costH, costH / 2);
      c.fill();
      text(c, String(def.cost), r.x + r.w / 2, r.y + r.h - costH * 0.28 - 3, {
        size: 11,
        align: 'center',
        color: '#20180a',
        weight: 800,
      });

      // Recharge sweep
      if (!ready) {
        const ratio = clamp(card.cooldown / Math.max(0.001, card.recharge), 0, 1);
        c.fillStyle = 'rgba(4,7,16,0.72)';
        c.fillRect(r.x, r.y, r.w, r.h * ratio);
        text(c, card.cooldown.toFixed(1), r.x + r.w / 2, r.y + r.h * 0.5, {
          size: 15,
          align: 'center',
          weight: 800,
          color: '#cfe0ff',
        });
      } else if (!affordable) {
        c.fillStyle = 'rgba(4,7,16,0.45)';
        c.fillRect(r.x, r.y, r.w, r.h);
      }
      c.restore();

      c.lineWidth = selected ? 3 : 2;
      c.strokeStyle = selected ? UI.leaf : hot && usable ? UI.gold : 'rgba(120,150,210,0.35)';
      roundRect(c, r.x, r.y, r.w, r.h, 9);
      c.stroke();

      if (hot && p.pressed && usable) action = { kind: 'pickCard', index: i };
    }

    // Tooltip. On touch there is no hover, so an armed card shows its own card
    // back instead — otherwise the Leaf Mode text is unreachable on a phone.
    const hovered = this.cardRects.findIndex((r) => pointInRect(p.x, p.y, r));
    if (hovered >= 0 && input.selectedCard === null) {
      this.drawCardTooltip(c, state, hovered);
    } else if (input.selectedCard !== null && LAYOUT.mode === 'portrait') {
      this.drawCardTooltip(c, state, input.selectedCard);
    }
    return action;
  }

  private drawCardTooltip(c: CanvasRenderingContext2D, state: BattleState, index: number): void {
    const def = heroDef(state.cards[index].heroId);
    const r = cardRect(index);
    const portrait = LAYOUT.mode === 'portrait';
    const w = portrait ? Math.min(VIEW.w - 16, 400) : 250;
    const h = (def.ultimate ? 116 : 84) * (portrait ? 1.5 : 1);
    const x = clamp(r.x + r.w / 2 - w / 2, 4, VIEW.w - w - 4);
    // The tray is at the bottom in portrait, so the tooltip goes above it.
    const y = portrait ? Math.max(8, r.y - h - 10) : r.y + r.h + 8;
    panel(c, { x, y, w, h }, { accent: alpha(def.art.glow ?? UI.gold, 0.6), radius: 10 });
    const k = portrait ? 1.5 : 1;
    text(c, displayName(def), x + 12, y + 22 * k, { size: 16, weight: 800, maxWidth: w - 90 });
    text(c, def.tagline, x + 12, y + 40 * k, { size: 11, color: UI.inkDim, maxWidth: w - 24 });
    text(c, roleLabel(def.role), x + w - 12, y + 22 * k, {
      size: 11,
      align: 'right',
      color: def.art.glow ?? UI.gold,
      weight: 800,
    });
    text(c, `${def.hp} HP · ${def.recharge}s recharge`, x + 12, y + 60 * k, {
      size: 11,
      color: UI.inkDim,
    });
    if (def.ultimate) {
      c.save();
      drawLeafGlyph(c, x + 20, y + 84 * k - 4, 10 * k);
      c.restore();
      text(c, def.ultimate.name, x + 36 * k, y + 82 * k, { size: 12, weight: 800, color: UI.leaf });
      text(c, def.ultimate.description, x + 12, y + 102 * k, {
        size: 10,
        color: UI.inkDim,
        maxWidth: w - 24,
      });
    }
  }

  private drawTools(
    c: CanvasRenderingContext2D,
    p: PointerState,
    input: HudInput,
  ): HudAction | null {
    let action: HudAction | null = null;
    const shovel = toolRect('shovel');
    const pause = toolRect('pause');
    const speed = toolRect('speed');

    // Shovel
    c.save();
    roundRect(c, shovel.x, shovel.y, shovel.w, shovel.h, 10);
    c.fillStyle = input.shovelActive ? '#3a2a12' : '#1b2440';
    c.fill();
    c.strokeStyle = input.shovelActive ? UI.gold : 'rgba(120,150,210,0.4)';
    c.lineWidth = 2;
    c.stroke();
    c.translate(shovel.x + shovel.w / 2, shovel.y + shovel.h / 2);
    c.rotate(-0.5);
    const sk = shovel.h / 54;
    c.fillStyle = '#8d6e63';
    roundRect(c, -2.5 * sk, -16 * sk, 5 * sk, 20 * sk, 2 * sk);
    c.fill();
    c.fillStyle = '#b0bec5';
    c.beginPath();
    c.moveTo(-8 * sk, 4 * sk);
    c.lineTo(8 * sk, 4 * sk);
    c.lineTo(6 * sk, 16 * sk);
    c.lineTo(-6 * sk, 16 * sk);
    c.closePath();
    c.fill();
    c.restore();
    if (pointInRect(p.x, p.y, shovel) && p.released) action = { kind: 'shovel' };

    c.save();
    for (const [rect, label, kind] of [
      [pause, input.paused ? '▶' : '❚❚', 'pause'],
      [speed, `${input.speed}×`, 'speed'],
    ] as [Rect, string, HudAction['kind']][]) {
      roundRect(c, rect.x, rect.y, rect.w, rect.h, 6);
      c.fillStyle = '#151d33';
      c.fill();
      c.strokeStyle = 'rgba(120,150,210,0.35)';
      c.lineWidth = 1.5;
      c.stroke();
      text(c, label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 5, {
        size: 12,
        align: 'center',
        weight: 800,
      });
      if (pointInRect(p.x, p.y, rect) && p.released) action = { kind };
    }
    c.restore();
    return action;
  }

  private drawBottomBar(
    c: CanvasRenderingContext2D,
    state: BattleState,
    p: PointerState,
    input: HudInput,
  ): HudAction | null {
    let action: HudAction | null = null;
    const portrait = LAYOUT.mode === 'portrait';
    const top = BOTTOM.top;

    c.fillStyle = 'rgba(6,9,18,0.72)';
    c.fillRect(0, top, VIEW.w, VIEW.h - top);
    c.strokeStyle = 'rgba(120,150,210,0.22)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, top);
    c.lineTo(VIEW.w, top);
    c.stroke();

    // Leaf bank. One button with a count, in both orientations: a row of nine
    // individually tappable slots cannot reach a usable size at any logical
    // resolution, and a mis-tap here spends a Leaf.
    const leaf = BOTTOM.leaf;
    const lp = input.leafPunch ?? 0;
    // The hit rect is padded past the drawn one — this is the control players
    // reported fighting with, and slop costs nothing next to an empty bar.
    const leafHit: Rect = { x: leaf.x - 12, y: leaf.y - 12, w: leaf.w + 24, h: leaf.h + 24 };
    const hasLeaves = state.leaves > 0;
    const hot = pointInRect(p.x, p.y, leafHit);

    c.save();
    c.translate(leaf.x + leaf.w / 2, leaf.y + leaf.h / 2);
    c.scale(1 + lp * 0.16, 1 + lp * 0.16);
    c.translate(-(leaf.x + leaf.w / 2), -(leaf.y + leaf.h / 2));
    // A ready Leaf advertises itself.
    if (hasLeaves) {
      const glow = 0.4 + Math.sin(input.time * 4) * 0.25;
      const g = c.createRadialGradient(
        leaf.x + leaf.w / 2,
        leaf.y + leaf.h / 2,
        4,
        leaf.x + leaf.w / 2,
        leaf.y + leaf.h / 2,
        leaf.w * 0.9,
      );
      g.addColorStop(0, alpha(UI.leaf, 0.35 * glow));
      g.addColorStop(1, alpha(UI.leaf, 0));
      c.fillStyle = g;
      c.fillRect(leafHit.x, leafHit.y, leafHit.w, leafHit.h);
    }
    roundRect(c, leaf.x, leaf.y, leaf.w, leaf.h, 14);
    c.fillStyle = hasLeaves ? 'rgba(60,120,70,0.45)' : 'rgba(255,255,255,0.05)';
    c.fill();
    c.strokeStyle = hasLeaves ? UI.leaf : 'rgba(255,255,255,0.18)';
    c.lineWidth = hot && hasLeaves ? 3.5 : 2;
    c.stroke();
    c.globalAlpha = hasLeaves ? 1 : 0.3;
    drawLeafGlyph(c, leaf.x + leaf.w / 2, leaf.y + leaf.h * 0.42, leaf.w * 0.27);
    c.restore();

    text(c, `x${state.leaves}`, leaf.x + leaf.w / 2, leaf.y + leaf.h - 7, {
      size: 12,
      align: 'center',
      weight: 800,
      color: hasLeaves ? UI.ink : UI.inkDim,
    });
    if (hasLeaves && p.pressed && hot) action = { kind: 'pickLeaf' };

    // Overdrive. The hit rect is finger-sized in portrait; the bar is drawn
    // smaller inside it.
    const od = BOTTOM.od;
    const bar: Rect = portrait
      ? { x: od.x + 8, y: od.y + 26, w: od.w - 16, h: 36 }
      : od;
    const full = state.overdrive >= 1;
    text(c, 'OVERDRIVE', od.x, portrait ? od.y + 18 : top + 24, {
      size: 11,
      color: UI.inkDim,
      weight: 800,
    });
    meter(
      c,
      bar,
      state.overdrive,
      full ? UI.gold : '#6be3ff',
      full
        ? portrait
          ? 'UNLEASH EVERYTHING'
          : 'UNLEASH EVERYTHING  ·  SPACE'
        : `${Math.floor(state.overdrive * 100)}%`,
    );
    if (full) {
      const pulse = 0.4 + Math.sin(input.time * 7) * 0.3;
      c.strokeStyle = alpha(UI.gold, pulse);
      c.lineWidth = 3;
      roundRect(c, bar.x - 2, bar.y - 2, bar.w + 4, bar.h + 4, bar.h / 2 + 2);
      c.stroke();
    }
    if (full && pointInRect(p.x, p.y, od) && p.released) action = { kind: 'overdrive' };

    // Wave / survival meter. In portrait it lives in the top bar, clear of the
    // overdrive hit rect — they overlap if both sit in the bottom bar.
    const wave = BOTTOM.wave;
    const override = input.progressOverride;
    text(c, override?.caption ?? 'WAVE PROGRESS', wave.x, wave.y - 10, {
      size: 11,
      color: UI.inkDim,
      weight: 800,
    });
    meter(
      c,
      wave,
      override ? override.ratio : state.progress,
      override ? UI.gold : UI.danger,
      override?.label,
    );
    if (!override) {
      c.save();
      c.fillStyle = alpha('#ffffff', 0.8);
      for (let i = 0; i < 4; i++) {
        const fx = wave.x + ((i + 1) / 4) * wave.w - 3;
        c.fillRect(fx, wave.y - 4, 2, wave.h + 8);
      }
      c.restore();
    }

    // Menace (Versus). Sits above the villain strip in portrait, where the
    // bottom bar has no spare width.
    if (input.villainSide) {
      const mx = portrait ? VIEW.w / 2 : VIEW.w / 2;
      const my = portrait ? VERSUS.stripTop - 12 : top + 24;
      text(c, `MENACE ${Math.floor(state.menace)}`, mx, my, {
        size: 13,
        align: 'center',
        color: UI.danger,
        weight: 800,
      });
      if (!portrait) {
        meter(c, { x: VIEW.w / 2 - 90, y: top + 34, w: 180, h: 18 }, state.menace / 600, UI.danger);
      }
    }

    return action;
  }

  private drawVillainPanel(
    c: CanvasRenderingContext2D,
    state: BattleState,
    p: PointerState,
    input: HudInput,
  ): HudAction | null {
    let action: HudAction | null = null;
    this.villainRects = [];
    this.schemeRects = [];

    for (let i = 0; i < state.villainCards.length; i++) {
      const card = state.villainCards[i];
      const def = villainDef(card.villainId);
      const r = villainCardRect(i, state.villainCards.length);
      this.villainRects.push(r);
      const usable = card.cooldown <= 0 && state.menace >= def.menace;
      const selected = input.selectedVillainCard === i;

      c.save();
      roundRect(c, r.x, r.y, r.w, r.h, 8);
      c.fillStyle = '#2a1420';
      c.fill();
      c.clip();
      // The column sizes itself to the deck, so the figure and the cost strip
      // are both derived from the card rather than fixed.
      const costH = Math.max(12, Math.min(16, r.h * 0.26));
      c.globalAlpha = usable ? 1 : 0.5;
      drawVillain(c, def.art, r.x + r.w / 2, r.y + r.h - costH - 2, {
        time: input.time + i,
        act: 0,
        hurt: 0,
        ult: 0,
        height: Math.max(28, r.h - costH - 6),
        facing: -1,
        walk: 0,
        armor: 1,
        shield: 0,
        attacking: false,
      });
      c.globalAlpha = 1;
      c.fillStyle = 'rgba(0,0,0,0.75)';
      c.fillRect(r.x, r.y + r.h - costH, r.w, costH);
      text(c, String(def.menace), r.x + r.w / 2, r.y + r.h - costH * 0.28, {
        size: Math.min(11, costH * 0.72),
        align: 'center',
        weight: 800,
        color: UI.danger,
      });
      if (card.cooldown > 0) {
        c.fillStyle = 'rgba(4,7,16,0.7)';
        c.fillRect(r.x, r.y, r.w, r.h * clamp(card.cooldown / card.recharge, 0, 1));
      }
      c.restore();
      c.lineWidth = selected ? 3 : 1.5;
      c.strokeStyle = selected ? UI.danger : 'rgba(255,120,120,0.3)';
      roundRect(c, r.x, r.y, r.w, r.h, 8);
      c.stroke();

      if (pointInRect(p.x, p.y, r) && p.released && usable) {
        action = { kind: 'villainCard', index: i };
      }
    }

    // Schemes sit in the strip between the card tray and the board.
    for (let i = 0; i < SCHEMES.length; i++) {
      const s = SCHEMES[i];
      const r = schemeButtonRect(i);
      this.schemeRects.push(r);
      const cd = state.schemeCooldowns[s.id] ?? 0;
      const usable = cd <= 0 && state.menace >= s.cost;
      c.save();
      roundRect(c, r.x, r.y, r.w, r.h, 6);
      c.fillStyle = input.selectedScheme === s.id ? shade(s.color, -0.5) : '#1a1020';
      c.fill();
      c.strokeStyle = usable ? s.color : 'rgba(255,255,255,0.15)';
      c.lineWidth = 1.5;
      c.stroke();
      c.globalAlpha = usable ? 1 : 0.45;
      text(c, `${s.name}  ${s.cost}`, r.x + r.w / 2, r.y + 17, {
        size: 11,
        align: 'center',
        weight: 800,
        color: usable ? UI.ink : UI.inkDim,
        maxWidth: r.w - 8,
      });
      c.restore();
      if (pointInRect(p.x, p.y, r) && p.released && usable) {
        action = { kind: 'scheme', id: s.id };
      }
    }

    // With a villain selected, the right end of each lane becomes a drop zone.
    // The click itself is handled by the battle screen against the board grid,
    // so a tap anywhere in the row works — this just shows where to aim.
    if (input.selectedVillainCard !== null) {
      for (let row = 0; row < state.rows; row++) {
        const r = laneStripRect(row, state.cols);
        const hot = p.y >= r.y && p.y <= r.y + r.h;
        c.save();
        const g = c.createLinearGradient(r.x, 0, r.x + r.w, 0);
        g.addColorStop(0, alpha(UI.danger, 0));
        g.addColorStop(1, alpha(UI.danger, hot ? 0.5 : 0.22));
        c.fillStyle = g;
        c.fillRect(r.x, r.y + 2, r.w, r.h - 4);
        text(c, '◀ DEPLOY', r.x + r.w - 12, r.y + r.h / 2 + 5, {
          size: 13,
          align: 'right',
          weight: 800,
          color: hot ? UI.ink : alpha(UI.ink, 0.6),
        });
        c.restore();
      }
    }

    return action;
  }

  private drawWaveBanner(c: CanvasRenderingContext2D, state: BattleState): void {
    if (state.hugeWaveBanner <= 0) return;
    const t = clamp(state.hugeWaveBanner / 3.2, 0, 1);
    const alphaV = t > 0.8 ? (1 - t) * 5 : Math.min(1, t * 2.2);
    c.save();
    c.globalAlpha = alphaV;
    const midY = BOARD.y + (state.rows * BOARD.cellH) / 2;
    c.fillStyle = 'rgba(120,0,20,0.35)';
    c.fillRect(0, midY - 56, VIEW.w, 112);
    text(c, 'A HUGE WAVE OF VILLAINS IS APPROACHING', VIEW.w / 2, midY + 12, {
      size: LAYOUT.mode === 'portrait' ? 17 : 34,
      align: 'center',
      weight: 800,
      color: '#ffdede',
      maxWidth: VIEW.w - 40,
    });
    c.restore();
  }
}

function roleLabel(role: string): string {
  switch (role) {
    case 'producer':
      return 'SOLAR';
    case 'defender':
      return 'WALL';
    case 'shooter':
      return 'RANGED';
    case 'melee':
      return 'MELEE';
    case 'instant':
      return 'INSTANT';
    case 'support':
      return 'SUPPORT';
    case 'hazard':
      return 'HAZARD';
    default:
      return role.toUpperCase();
  }
}
