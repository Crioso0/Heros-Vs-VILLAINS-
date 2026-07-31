import type { App, Screen } from '../app/app';
import { sfx } from '../audio/sfx';
import { worldDef } from '../content/worlds';
import { backdropLayer, drawWeather } from '../render/backdrops';
import { drawHero, drawVillain } from '../render/characters';
import { LAYOUT, VIEW } from '../render/layout';
import { alpha, UI } from '../render/palette';
import { HERO_BY_ID } from '../content/heroes';
import { VILLAIN_BY_ID } from '../content/villains';
import { button, paragraph, text } from '../ui/widgets';
import { MapScreen } from './map';
import { CodexScreen } from './codex';
import { VersusSetupScreen } from './versusSetup';

export class MenuScreen implements Screen {
  private t = 0;
  private lastDt = 1 / 60;

  constructor(private app: App) {}

  update(dt: number): void {
    this.t += dt;
    this.lastDt = dt;
  }

  draw(c: CanvasRenderingContext2D): void {
    const world = worldDef('gotham');
    c.drawImage(backdropLayer(world, VIEW.w, VIEW.h), 0, 0);
    drawWeather(c, world, VIEW.w, VIEW.h, this.t, this.lastDt);

    const portrait = LAYOUT.mode === 'portrait';
    const castY = portrait ? VIEW.h - 90 : VIEW.h - 80;
    const castH = portrait ? 112 : 150;

    // A hero line-up along the bottom, facing off against villains.
    const heroes = ['paragon', 'emerald_warden', 'nightfall', 'vanguard'];
    heroes.forEach((id, i) => {
      const def = HERO_BY_ID[id];
      if (!def) return;
      drawHero(c, def.art, (portrait ? 80 : 210) + i * (portrait ? 100 : 118), castY, {
        time: this.t + i * 0.7,
        act: 0,
        hurt: 0,
        ult: Math.sin(this.t * 0.6 + i) > 0.92 ? 1 : 0,
        height: castH,
        facing: 1,
      });
    });
    const villains = ['the_grin', 'juggernought', 'coldsnap'];
    villains.forEach((id, i) => {
      const def = VILLAIN_BY_ID[id];
      if (!def) return;
      drawVillain(c, def.art, (portrait ? VIEW.w - 60 : VIEW.w - 210) - i * (portrait ? 100 : 132), castY, {
        time: this.t + i,
        act: 0,
        hurt: 0,
        ult: 0,
        height: castH,
        facing: -1,
        walk: (this.t * 0.5 + i * 0.3) % 1,
        armor: 1,
        shield: 0,
        attacking: false,
      });
    });

    // Title
    c.save();
    c.textAlign = 'center';
    const bob = Math.sin(this.t * 1.4) * 4;
    const titleSize = portrait ? 52 : 76;
    const t1 = portrait ? VIEW.h * 0.16 : 152;
    const t2 = t1 + (portrait ? 64 : 76);
    c.font = `800 ${titleSize}px 'Trebuchet MS', sans-serif`;
    c.fillStyle = alpha('#000000', 0.55);
    c.fillText('HEROES', VIEW.w / 2 + 4, t1 + 4 + bob);
    const g = c.createLinearGradient(0, t1 - 52, 0, t1 + 23);
    g.addColorStop(0, '#eaf3ff');
    g.addColorStop(1, '#6fa8ff');
    c.fillStyle = g;
    c.fillText('HEROES', VIEW.w / 2, t1 + bob);

    c.fillStyle = alpha('#000000', 0.55);
    c.fillText('VS VILLAINS', VIEW.w / 2 + 4, t2 + 4 + bob);
    const g2 = c.createLinearGradient(0, t2 - 52, 0, t2 + 18);
    g2.addColorStop(0, '#ffe9a8');
    g2.addColorStop(1, '#e0553c');
    c.fillStyle = g2;
    c.fillText('VS VILLAINS', VIEW.w / 2, t2 + bob);
    c.restore();

    text(c, 'A LANE-DEFENCE FAN PROJECT · ORIGINAL CHARACTERS', VIEW.w / 2, t2 + 34, {
      size: portrait ? 8 : 12,
      align: 'center',
      color: UI.inkDim,
      weight: 800,
    });

    const p = this.app.pointer;
    const bw = portrait ? 480 : 260;
    const bx = VIEW.w / 2 - bw / 2;
    const bh = portrait ? 88 : 52;
    const b0 = portrait ? VIEW.h - 520 : 300;
    const bgap = portrait ? 100 : 62;

    if (button(c, p, { x: bx, y: b0, w: bw, h: bh }, 'CAMPAIGN')) {
      sfx.play('click');
      this.app.setScreen(new MapScreen(this.app));
    }
    if (button(c, p, { x: bx, y: b0 + bgap, w: bw, h: bh }, 'VERSUS')) {
      sfx.play('click');
      this.app.setScreen(new VersusSetupScreen(this.app));
    }
    if (button(c, p, { x: bx, y: b0 + bgap * 2, w: bw, h: portrait ? 80 : 44 }, 'CODEX', { small: true })) {
      sfx.play('click');
      this.app.setScreen(new CodexScreen(this.app));
    }

    const cleared = this.app.progress.data.cleared.length;
    const unlocked = this.app.progress.data.unlocked.length;
    paragraph(
      c,
      `${cleared} levels cleared · ${unlocked} heroes recruited`,
      VIEW.w / 2,
      b0 + bgap * 3 + (portrait ? 4 : 24),
      Math.min(600, VIEW.w - 40),
      { size: portrait ? 9 : 13, align: 'center' },
    );
  }
}
