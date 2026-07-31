import { clamp } from '../core/math';
import { heroDef } from '../content/heroes';
import { villainDef } from '../content/villains';
import { worldDef } from '../content/worlds';
import { PROJECTILE_COLOR } from '../sim/attacks';
import type { SimEvent } from '../sim/events';
import type { BattleState, HeroEntity, VillainEntity } from '../sim/types';
import { backdropLayer, drawWeather } from './backdrops';
import { drawHealthBar, drawHero, drawShadow, drawVillain } from './characters';
import { FxLayer } from './fx';
import { BOARD, bx, by, healthBarY, hqRect, LAYOUT, pickupTarget, VIEW } from './layout';
import { alpha, ellipse, mix, roundRect, shade, UI } from './palette';

/**
 * Battle renderer. Reads the simulation state; never writes to it.
 */
export class BattleRenderer {
  readonly fx = new FxLayer();
  private time = 0;
  /** Cell the pointer is hovering, for the placement ghost. */
  hover: { col: number; row: number } | null = null;
  /** Hero id the pointer is over, for the Leaf drop target. */
  hoverHero: number | null = null;
  /** Card being dragged, drawn under the cursor. */
  carrying: { heroId: string; x: number; y: number } | null = null;
  carryingLeaf: { x: number; y: number } | null = null;
  /** Hero ids that can take a Leaf right now, highlighted while carrying one. */
  leafTargets: number[] | null = null;
  /** 0..1 squash-and-stretch on the counters when something lands in them. */
  solarPunch = 0;
  leafPunch = 0;

  consume(events: SimEvent[], state: BattleState): void {
    // Overdrive fires every hero's ultimate at once; ten "LEAF MODE" labels on
    // top of each other is unreadable, so the banner speaks for all of them.
    const overdrive = events.some((e) => e.t === 'overdrive');
    for (const ev of events) {
      switch (ev.t) {
        case 'hit':
          this.fx.burst(bx(ev.x), by(ev.y), Math.round(3 + ev.power * 5), ev.color, ev.power);
          break;
        case 'shoot':
          this.fx.burst(bx(ev.x), by(ev.y), 2, ev.color, 0.35);
          break;
        case 'villainDown':
          this.fx.debris(bx(ev.x), by(ev.y), ev.big ? 26 : 12, '#6b7a5a');
          this.fx.ring(bx(ev.x), by(ev.y), ev.big ? 46 : 26, '#ffffff');
          break;
        case 'heroDown':
          this.fx.debris(bx(ev.x), by(ev.y), 14, '#8fa7d6');
          break;
        case 'plant':
          this.fx.ring(bx(ev.x), by(ev.y), 34, UI.leaf);
          break;
        case 'explode':
          this.fx.ring(bx(ev.x), by(ev.y), ev.radius * BOARD.cellW * 0.6, ev.color);
          this.fx.burst(bx(ev.x), by(ev.y), 28, ev.color, 1.5);
          break;
        case 'ultimate':
          this.fx.ring(bx(ev.x), by(ev.y), 70, ev.color);
          this.fx.burst(bx(ev.x), by(ev.y), 34, ev.color, 1.3);
          if (!overdrive) this.fx.popText(bx(ev.x), by(ev.y) - 60, 'LEAF MODE', ev.color);
          break;
        case 'overdrive':
          this.fx.popText(VIEW.w / 2, by(state.rows * 0.5), 'OVERDRIVE', UI.gold);
          break;
        case 'collect': {
          const col = ev.kind === 'solar' ? UI.solar : UI.leaf;
          this.fx.burst(bx(ev.x), by(ev.y), 14, col, 0.9);
          this.fx.ring(bx(ev.x), by(ev.y), 34, col);
          this.fx.popText(
            bx(ev.x),
            by(ev.y) - 26,
            ev.kind === 'solar' ? `+${ev.value}` : 'LEAF',
            col,
          );
          // Punch the counter the value is flying toward.
          if (ev.kind === 'solar') this.solarPunch = 1;
          else this.leafPunch = 1;
          break;
        }
        case 'drone':
          this.fx.burst(BOARD.x - Math.min(30, BOARD.cellW * 0.28), by(ev.row + 0.5), 16, '#cfd8dc', 1);
          break;
        case 'shake':
          this.fx.addShake(ev.power);
          break;
        case 'flash':
          this.fx.addFlash(ev.color, ev.power);
          break;
        default:
          break;
      }
    }
  }

  draw(c: CanvasRenderingContext2D, state: BattleState, dt: number): void {
    this.time += dt;
    this.fx.update(dt);
    this.solarPunch = Math.max(0, this.solarPunch - dt * 3.2);
    this.leafPunch = Math.max(0, this.leafPunch - dt * 3.2);
    const world = worldDef(state.worldId);

    const shake = this.fx.shakeOffset();
    c.save();
    c.translate(shake.x, shake.y);

    c.drawImage(backdropLayer(world, VIEW.w, VIEW.h), 0, 0);
    this.drawLawn(c, state);
    this.drawHouse(c, state);
    this.drawHazards(c, state);
    this.drawDrones(c, state);
    this.drawEntities(c, state);
    this.drawProjectiles(c, state);
    this.drawPickups(c, state);
    this.fx.draw(c);
    drawWeather(c, world, VIEW.w, VIEW.h, this.time, dt);
    this.drawPlacementGhost(c, state);

    c.restore();
    this.fx.drawFlash(c, VIEW.w, VIEW.h);
    this.drawCarried(c);
  }

  /* ---------------------------------------------------------------- *
   * Board
   * ---------------------------------------------------------------- */

  private drawLawn(c: CanvasRenderingContext2D, state: BattleState): void {
    const world = worldDef(state.worldId);
    const w = state.cols * BOARD.cellW;
    const h = state.rows * BOARD.cellH;

    // Perspective-ish plinth under the lanes.
    c.fillStyle = alpha('#000000', 0.28);
    roundRect(c, BOARD.x - 14, BOARD.y - 12, w + 28, h + 26, 18);
    c.fill();

    for (let r = 0; r < state.rows; r++) {
      for (let col = 0; col < state.cols; col++) {
        const even = (r + col) % 2 === 0;
        const base = even ? world.palette.lane[0] : world.palette.lane[1];
        c.fillStyle = base;
        c.fillRect(bx(col), by(r), BOARD.cellW, BOARD.cellH);
        // Subtle top-light on each tile.
        const g = c.createLinearGradient(0, by(r), 0, by(r + 1));
        g.addColorStop(0, alpha('#ffffff', 0.07));
        g.addColorStop(1, alpha('#000000', 0.12));
        c.fillStyle = g;
        c.fillRect(bx(col), by(r), BOARD.cellW, BOARD.cellH);
      }
    }

    c.strokeStyle = alpha('#000000', 0.22);
    c.lineWidth = 1;
    for (let r = 0; r <= state.rows; r++) {
      c.beginPath();
      c.moveTo(BOARD.x, by(r));
      c.lineTo(BOARD.x + w, by(r));
      c.stroke();
    }
  }

  private drawHouse(c: CanvasRenderingContext2D, state: BattleState): void {
    const h = state.rows * BOARD.cellH;
    const g = c.createLinearGradient(0, BOARD.y, 0, BOARD.y + h);
    g.addColorStop(0, 'rgba(20,26,44,0.55)');
    g.addColorStop(1, 'rgba(8,10,20,0.85)');
    c.fillStyle = g;
    const plate = hqRect(state.rows);
    roundRect(c, plate.x, plate.y, plate.w, plate.h, 14);
    c.fill();
    c.strokeStyle = alpha('#9fb4ff', 0.3);
    c.lineWidth = 2;
    c.stroke();

    // Crest: the thing the villains are walking toward. Scaled to the plate,
    // which is 114 wide on a desktop and 34 on a phone.
    const cx = plate.x + plate.w / 2;
    const cy = BOARD.y + h / 2;
    const k = Math.min(1, plate.w / 76);
    c.save();
    c.fillStyle = alpha('#9fb4ff', 0.16);
    c.beginPath();
    c.moveTo(cx, cy - 46 * k);
    c.lineTo(cx + 30 * k, cy - 28 * k);
    c.quadraticCurveTo(cx + 30 * k, cy + 30 * k, cx, cy + 48 * k);
    c.quadraticCurveTo(cx - 30 * k, cy + 30 * k, cx - 30 * k, cy - 28 * k);
    c.closePath();
    c.fill();
    c.strokeStyle = alpha('#9fb4ff', 0.5);
    c.lineWidth = 2;
    c.stroke();
    c.fillStyle = alpha('#cfe0ff', 0.85);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    if (LAYOUT.mode === 'portrait') {
      // 17px of 'HQ' does not fit a 34px strip; run it down the plate instead.
      c.translate(cx, cy);
      c.rotate(-Math.PI / 2);
      c.font = "800 16px 'Trebuchet MS', sans-serif";
      c.fillText('H Q', 0, 1);
    } else {
      c.font = "800 17px 'Trebuchet MS', sans-serif";
      c.fillText('HQ', cx, cy + 2);
    }
    c.restore();
  }

  private drawDrones(c: CanvasRenderingContext2D, state: BattleState): void {
    for (const d of state.drones) {
      if (d.used && d.active === 0) continue;
      const x = bx(d.x);
      const y = by(d.row + 0.72);
      drawShadow(c, x, y + 6, 40, 0.3);
      c.save();
      c.translate(x, y);
      const spin = this.time * (d.active ? 34 : 6);
      c.fillStyle = '#37474f';
      roundRect(c, -18, -22, 36, 22, 6);
      c.fill();
      c.fillStyle = d.active ? '#ff5252' : '#8fd8ff';
      ellipse(c, 0, -12, 6, 6);
      c.fill();
      c.strokeStyle = alpha('#cfd8dc', 0.85);
      c.lineWidth = 2;
      for (let i = 0; i < 2; i++) {
        const a = spin + i * Math.PI;
        c.beginPath();
        c.ellipse(0, -26, 20, 5, a, 0, Math.PI * 2);
        c.stroke();
      }
      c.restore();
    }
  }

  private drawHazards(c: CanvasRenderingContext2D, state: BattleState): void {
    for (const hz of state.hazards) {
      const x = bx(hz.x);
      const y = by(hz.y);
      const w = hz.w * BOARD.cellW;
      const h = hz.h * BOARD.cellH;
      const fade = clamp(hz.life / Math.max(0.2, hz.maxLife), 0, 1);
      c.save();
      switch (hz.kind) {
        case 'web':
          c.strokeStyle = alpha('#ffffff', 0.5 * fade);
          c.lineWidth = 2;
          for (let i = 0; i < 14; i++) {
            const px = x - w / 2 + (i / 13) * w;
            c.beginPath();
            c.moveTo(px, y - h / 2);
            c.lineTo(px + 14, y + h / 2);
            c.stroke();
          }
          c.beginPath();
          c.moveTo(x - w / 2, y);
          c.lineTo(x + w / 2, y);
          c.stroke();
          break;
        case 'smoke':
          c.fillStyle = alpha('#5c6bc0', 0.32 * fade);
          for (let i = 0; i < 12; i++) {
            const px = x - w / 2 + ((i * 97) % w);
            const py = y + Math.sin(this.time * 1.4 + i) * h * 0.22;
            ellipse(c, px, py, 46, 32);
            c.fill();
          }
          break;
        case 'tide':
          c.fillStyle = alpha('#5fe0b0', 0.45 * fade);
          roundRect(c, x - w / 2, y - h / 2, w, h, 20);
          c.fill();
          c.strokeStyle = alpha('#ffffff', 0.55 * fade);
          c.lineWidth = 3;
          c.stroke();
          break;
        case 'portal':
          c.strokeStyle = alpha('#9b6bff', 0.9 * fade);
          c.lineWidth = 4;
          for (let i = 0; i < 3; i++) {
            c.beginPath();
            c.arc(x, y, 12 + i * 12 + (1 - fade) * 22, 0, Math.PI * 2);
            c.stroke();
          }
          break;
        default:
          c.fillStyle = alpha('#ff8a3c', 0.3 * fade);
          roundRect(c, x - w / 2, y - h / 2, w, h, 12);
          c.fill();
          break;
      }
      c.restore();
    }
  }

  /* ---------------------------------------------------------------- *
   * Entities
   * ---------------------------------------------------------------- */

  private drawEntities(c: CanvasRenderingContext2D, state: BattleState): void {
    type Drawable = { y: number; draw: () => void };
    const list: Drawable[] = [];

    for (const h of state.heroes) {
      list.push({ y: by(h.row + 1), draw: () => this.drawHeroEntity(c, state, h) });
    }
    for (const v of state.villains) {
      list.push({ y: by(v.row + 1) + (v.airborne ? -40 : 0), draw: () => this.drawVillainEntity(c, state, v) });
    }
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw();
  }

  private drawHeroEntity(c: CanvasRenderingContext2D, state: BattleState, h: HeroEntity): void {
    const def = heroDef(h.defId);
    const x = bx(h.col + 0.5);
    const yBase = by(h.row + 0.88);
    const act = clamp(1 - (state.time - h.lastAct) * 4, 0, 1);
    const frozen = clamp((h.frozenUntil - state.time) / 1.5, 0, 1);

    if (def.walkable) {
      // Hazards lie flat on the tile instead of standing up.
      this.drawHazardHero(c, h, x, by(h.row + 0.62));
      return;
    }

    drawShadow(c, x, yBase + 4, BOARD.cellW * 0.5, 0.32);
    drawHero(c, def.art, x, yBase, {
      time: h.age,
      act,
      hurt: h.hurt * 4,
      ult: h.ultTime > 0 ? 1 : 0,
      height: BOARD.heroH,
      facing: 1,
      frozen,
    });

    if (h.hp < h.maxHp) {
      drawHealthBar(c, x, healthBarY(h.row), BOARD.cellW * 0.6, h.hp / h.maxHp, UI.leaf);
    }
    // While a Leaf is in hand, every hero that can take it pulses, and the one
    // under the finger is picked out. Without this the player has to guess.
    if (this.carryingLeaf && this.leafTargets?.includes(h.id)) {
      const hot = this.hoverHero === h.id;
      const pulse = 0.55 + Math.sin(this.time * 7) * 0.45;
      c.save();
      c.strokeStyle = alpha(UI.leaf, hot ? 1 : 0.35 + pulse * 0.35);
      c.lineWidth = hot ? 4 : 2.5;
      roundRect(c, bx(h.col) + 4, by(h.row) + 4, BOARD.cellW - 8, BOARD.cellH - 8, 10);
      c.stroke();
      if (hot) {
        c.fillStyle = alpha(UI.leaf, 0.18);
        c.fill();
      }
      c.restore();
    }
  }

  private drawHazardHero(
    c: CanvasRenderingContext2D,
    h: HeroEntity,
    x: number,
    y: number,
  ): void {
    const def = heroDef(h.defId);
    c.save();
    c.translate(x, y);
    c.fillStyle = def.art.primary;
    for (let i = 0; i < 5; i++) {
      const px = -BOARD.cellW * 0.36 + i * BOARD.cellW * 0.18;
      const lift = h.ultTime > 0 ? 12 + Math.sin(this.time * 22 + i) * 6 : 0;
      c.beginPath();
      c.moveTo(px - 7, 10);
      c.lineTo(px, -14 - lift);
      c.lineTo(px + 7, 10);
      c.closePath();
      c.fill();
    }
    c.fillStyle = def.art.secondary;
    roundRect(c, -BOARD.cellW * 0.42, 8, BOARD.cellW * 0.84, 8, 4);
    c.fill();
    c.restore();
  }

  private drawVillainEntity(
    c: CanvasRenderingContext2D,
    state: BattleState,
    v: VillainEntity,
  ): void {
    const def = villainDef(v.defId);
    const x = bx(v.x);
    const lift = v.airborne ? 44 + Math.sin(this.time * 3 + v.id) * 6 : 0;
    const yBase = by(v.row + 0.88) - lift;
    const frozen = clamp((v.status.freezeUntil - state.time) / 1.5, 0, 1);
    const walk = (v.age * (def.speed * 3.2)) % 1;

    if (v.intangible) c.globalAlpha = 0.45;
    drawShadow(c, x, by(v.row + 0.92), BOARD.cellW * 0.5 * (def.art.scale ?? 1), v.airborne ? 0.18 : 0.34);

    drawVillain(c, def.art, x, yBase, {
      time: v.age,
      act: 0,
      hurt: v.hurt * 5,
      ult: 0,
      height: BOARD.villainH,
      facing: -1,
      frozen,
      walk,
      armor: def.armor ? v.armor / def.armor : 0,
      shield: v.shield,
      attacking: v.targetId >= 0,
    });
    c.globalAlpha = 1;

    // Leaf carriers glow so the player knows what to kill next.
    if (v.carriesLeaf) {
      const pulse = 0.5 + Math.sin(this.time * 6) * 0.3;
      c.fillStyle = alpha(UI.leaf, 0.35 * pulse);
      ellipse(c, x, yBase - BOARD.villainH * 0.5, 34, 44);
      c.fill();
    }

    const totalMax = v.maxHp + (def.armor ?? 0) + (def.shield ?? 0);
    const total = v.hp + v.armor + v.shield;
    if (total < totalMax) {
      const barY = healthBarY(v.row) + (def.boss ? -10 : 0);
      drawHealthBar(
        c,
        x,
        barY,
        BOARD.cellW * (def.boss ? 1.4 : 0.6),
        total / totalMax,
        v.armor > 0 ? '#b0bec5' : UI.danger,
      );
    }
  }

  private drawProjectiles(c: CanvasRenderingContext2D, state: BattleState): void {
    for (const p of state.projectiles) {
      const x = bx(p.x);
      const y = by(p.y);
      const color = PROJECTILE_COLOR[p.kind] ?? '#ffffff';
      c.save();
      switch (p.kind) {
        case 'beam': {
          const g = c.createLinearGradient(x - 60, y, x + 16, y);
          g.addColorStop(0, alpha(color, 0));
          g.addColorStop(1, alpha(color, 0.95));
          c.fillStyle = g;
          c.fillRect(x - 60, y - 4, 76, 8);
          break;
        }
        case 'shield': {
          c.translate(x, y);
          c.rotate(p.age * 16);
          c.fillStyle = color;
          ellipse(c, 0, 0, 15, 15);
          c.fill();
          c.fillStyle = '#b3202c';
          ellipse(c, 0, 0, 10, 10);
          c.fill();
          c.fillStyle = color;
          ellipse(c, 0, 0, 5, 5);
          c.fill();
          break;
        }
        case 'batarang': {
          c.translate(x, y);
          c.rotate(p.age * 26);
          c.fillStyle = color;
          c.beginPath();
          c.moveTo(-11, 0);
          c.lineTo(0, -7);
          c.lineTo(11, 0);
          c.lineTo(0, 5);
          c.closePath();
          c.fill();
          break;
        }
        case 'arrow': {
          c.strokeStyle = color;
          c.lineWidth = 3;
          c.beginPath();
          c.moveTo(x - 16, y - p.vy * 0.6);
          c.lineTo(x + 8, y);
          c.stroke();
          break;
        }
        case 'construct': {
          c.fillStyle = alpha(color, 0.85);
          roundRect(c, x - 14, y - 12, 28, 24, 6);
          c.fill();
          c.strokeStyle = '#eaffef';
          c.lineWidth = 2;
          c.stroke();
          break;
        }
        case 'web': {
          c.strokeStyle = alpha(color, 0.85);
          c.lineWidth = 2;
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI;
            c.beginPath();
            c.moveTo(x - Math.cos(a) * 9, y - Math.sin(a) * 9);
            c.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9);
            c.stroke();
          }
          break;
        }
        default: {
          const g = c.createRadialGradient(x, y, 1, x, y, 14);
          g.addColorStop(0, '#ffffff');
          g.addColorStop(0.35, color);
          g.addColorStop(1, alpha(color, 0));
          c.fillStyle = g;
          ellipse(c, x, y, 14, 14);
          c.fill();
          // Motion streak.
          c.strokeStyle = alpha(color, 0.4);
          c.lineWidth = 4;
          c.beginPath();
          c.moveTo(x - p.vx * 0.03, y - p.vy * 0.03);
          c.lineTo(x, y);
          c.stroke();
          break;
        }
      }
      c.restore();
    }
  }

  private drawPickups(c: CanvasRenderingContext2D, state: BattleState): void {
    for (const p of state.pickups) {
      // A stable per-orb phase so they do not all bob in lockstep.
      const phase = (p.id % 17) * 0.37;
      const bob = Math.sin(this.time * 2.1 + phase) * 5;
      const sway = Math.cos(this.time * 1.3 + phase) * 3;

      let x = bx(p.x) + sway;
      let y = by(p.y) + bob;
      let scale = 1;
      let fade = 1;

      if (p.claimed) {
        // Arc into the counter rather than sliding flat: the curve is most of
        // what makes the collection read as "it went somewhere".
        const t = clamp(p.claimT / 0.45, 0, 1);
        const e = t * t * (3 - 2 * t);
        const target = pickupTarget(p.kind);
        const sx = bx(p.x);
        const sy = by(p.y);
        const lift = Math.sin(t * Math.PI) * 90;
        x = sx + (target.x - sx) * e;
        y = sy + (target.y - sy) * e - lift;
        scale = 1 - t * 0.45;
        fade = 1 - t * 0.25;
        // Comet trail.
        if (t < 0.9 && Math.random() < 0.7) {
          this.fx.burst(x, y, 1, p.kind === 'solar' ? UI.solar : UI.leaf, 0.25);
        }
      }

      // Fade-out warning before it expires, so a missed orb is legible.
      const blink = !p.claimed && p.life < 4 ? 0.55 + Math.sin(p.life * 14) * 0.45 : 1;

      c.save();
      c.globalAlpha = blink * fade;
      c.translate(x, y);
      c.scale(scale, scale);

      if (p.kind === 'solar') {
        const pulse = 1 + Math.sin(this.time * 3.4 + phase) * 0.09;
        // Wide soft halo so it separates from a bright or busy backdrop.
        const halo = c.createRadialGradient(0, 0, 4, 0, 0, 46 * pulse);
        halo.addColorStop(0, alpha('#fff8d0', 0.55));
        halo.addColorStop(0.35, alpha(UI.solar, 0.35));
        halo.addColorStop(1, alpha(UI.solar, 0));
        c.fillStyle = halo;
        ellipse(c, 0, 0, 46 * pulse, 46 * pulse);
        c.fill();

        // Slowly turning rays.
        c.save();
        c.rotate(this.time * 0.6 + phase);
        c.strokeStyle = alpha('#fff3b0', 0.8);
        c.lineWidth = 3;
        c.lineCap = 'round';
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const r0 = 16;
          const r1 = 24 + Math.sin(this.time * 4 + i + phase) * 4;
          c.beginPath();
          c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
          c.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
          c.stroke();
        }
        c.restore();

        // Core.
        const core = c.createRadialGradient(-3, -3, 1, 0, 0, 15);
        core.addColorStop(0, '#ffffff');
        core.addColorStop(0.4, '#fff3b0');
        core.addColorStop(1, shade(UI.solar, -0.15));
        c.fillStyle = core;
        ellipse(c, 0, 0, 15, 15);
        c.fill();
        c.strokeStyle = alpha('#fffbe0', 0.9);
        c.lineWidth = 1.5;
        c.stroke();

        // Specular glint.
        c.fillStyle = alpha('#ffffff', 0.85);
        ellipse(c, -5, -5, 4, 3);
        c.fill();

        // A tap-me ring, so it reads as interactive rather than decorative.
        if (!p.claimed) {
          const rt = (this.time * 0.9 + phase) % 1;
          c.strokeStyle = alpha(UI.solar, (1 - rt) * 0.5);
          c.lineWidth = 2;
          c.beginPath();
          c.arc(0, 0, 18 + rt * 26, 0, Math.PI * 2);
          c.stroke();
        }
      } else {
        // Leaves spin and glow harder — they are rarer and worth more.
        const pulse = 1 + Math.sin(this.time * 6 + phase) * 0.12;
        const halo = c.createRadialGradient(0, 0, 3, 0, 0, 44 * pulse);
        halo.addColorStop(0, alpha('#eaffe4', 0.7));
        halo.addColorStop(0.4, alpha(UI.leaf, 0.4));
        halo.addColorStop(1, alpha(UI.leaf, 0));
        c.fillStyle = halo;
        ellipse(c, 0, 0, 44 * pulse, 44 * pulse);
        c.fill();

        if (!p.claimed) {
          const rt = (this.time * 1.1 + phase) % 1;
          c.strokeStyle = alpha(UI.leaf, (1 - rt) * 0.6);
          c.lineWidth = 2.5;
          c.beginPath();
          c.arc(0, 0, 16 + rt * 30, 0, Math.PI * 2);
          c.stroke();
        }

        c.save();
        c.rotate(Math.sin(this.time * 2 + phase) * 0.4);
        drawLeafGlyph(c, 0, 0, 20 * pulse);
        c.restore();
      }
      c.restore();
    }
  }

  private drawPlacementGhost(c: CanvasRenderingContext2D, state: BattleState): void {
    if (!this.hover || !this.carrying) return;
    const def = heroDef(this.carrying.heroId);
    const { col, row } = this.hover;
    // Same normalisation as cellBlocked: `walkable` is undefined, not false,
    // on ordinary heroes, so an un-normalised compare paints every occupied
    // tile as a valid drop.
    const occupied = state.heroes.some(
      (h) =>
        h.col === col &&
        h.row === row &&
        h.hp > 0 &&
        !!heroDef(h.defId).walkable === !!def.walkable,
    );
    const ok = !occupied || !!def.instant;
    c.save();
    c.globalAlpha = 0.55;
    c.fillStyle = ok ? alpha(UI.leaf, 0.25) : alpha(UI.danger, 0.3);
    roundRect(c, bx(col) + 3, by(row) + 3, BOARD.cellW - 6, BOARD.cellH - 6, 10);
    c.fill();
    c.strokeStyle = ok ? UI.leaf : UI.danger;
    c.lineWidth = 3;
    c.stroke();
    if (ok && !def.instant) {
      c.globalAlpha = 0.45;
      drawHero(c, def.art, bx(col + 0.5), by(row + 0.88), {
        time: this.time,
        act: 0,
        hurt: 0,
        ult: 0,
        height: BOARD.heroH,
        facing: 1,
      });
    }
    c.restore();
  }

  private drawCarried(c: CanvasRenderingContext2D): void {
    if (this.carrying) {
      const def = heroDef(this.carrying.heroId);
      c.save();
      c.globalAlpha = 0.9;
      drawHero(c, def.art, this.carrying.x, this.carrying.y + 34, {
        time: this.time,
        act: 0,
        hurt: 0,
        ult: 0,
        height: 76,
        facing: 1,
      });
      c.restore();
    }
    if (this.carryingLeaf) {
      const armed = this.carryingLeaf;
      // A hint, because a leaf floating under the cursor does not explain
      // itself the first time you see it.
      const anyTarget = (this.leafTargets?.length ?? 0) > 0;
      c.save();
      c.globalAlpha = 0.92;
      const msg = anyTarget ? 'DROP ON A HERO TO UNLEASH' : 'NO HERO CAN USE THIS YET';
      const w = 300;
      const hintY = LAYOUT.mode === 'portrait' ? BOARD.y - 44 : BOARD.y - 34;
      roundRect(c, VIEW.w / 2 - w / 2, hintY, w, 30, 15);
      c.fillStyle = 'rgba(6,20,10,0.85)';
      c.fill();
      c.strokeStyle = alpha(UI.leaf, 0.7);
      c.lineWidth = 2;
      c.stroke();
      c.fillStyle = anyTarget ? UI.leaf : UI.danger;
      c.font = "800 13px 'Trebuchet MS', sans-serif";
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(msg, VIEW.w / 2, hintY + 16, w - 20);
      c.restore();

      if (armed.x > -500) {
        c.save();
        c.translate(armed.x, armed.y);
        const pulse = 1 + Math.sin(this.time * 9) * 0.1;
        c.scale(pulse, pulse);
        const g = c.createRadialGradient(0, 0, 2, 0, 0, 42);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.25, '#eaffe4');
        g.addColorStop(0.5, UI.leaf);
        g.addColorStop(1, alpha(UI.leaf, 0));
        c.fillStyle = g;
        ellipse(c, 0, 0, 42, 42);
        c.fill();
        c.rotate(Math.sin(this.time * 3) * 0.25);
        drawLeafGlyph(c, 0, 0, 24);
        c.restore();
      }
    }
  }
}

export function drawLeafGlyph(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
): void {
  c.save();
  c.translate(x, y);
  c.rotate(-0.5);
  // Bright, with a light rim: against a dark lawn a mid-green leaf on a green
  // glow disappears into its own halo.
  const g = c.createLinearGradient(-s, -s, s, s);
  g.addColorStop(0, '#f2ffe8');
  g.addColorStop(0.45, mix(UI.leaf, '#ffffff', 0.45));
  g.addColorStop(1, shade(UI.leaf, 0.1));
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(0, -s);
  c.quadraticCurveTo(s * 0.95, -s * 0.35, 0, s);
  c.quadraticCurveTo(-s * 0.95, -s * 0.35, 0, -s);
  c.closePath();
  c.fill();
  c.strokeStyle = alpha('#ffffff', 0.85);
  c.lineWidth = Math.max(1, s * 0.09);
  c.stroke();
  // Midrib.
  c.strokeStyle = alpha('#1b6b32', 0.8);
  c.lineWidth = Math.max(1, s * 0.1);
  c.beginPath();
  c.moveTo(0, -s * 0.8);
  c.lineTo(0, s * 0.8);
  c.stroke();
  c.restore();
}
