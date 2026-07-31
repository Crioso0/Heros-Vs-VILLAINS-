import { sfx } from '../audio/sfx';
import { Progress } from '../game/progress';
import { VIEW } from '../render/layout';
import { createPointer, type PointerState } from '../ui/widgets';

export interface Screen {
  update(dt: number): void;
  draw(c: CanvasRenderingContext2D): void;
  onKey?(e: KeyboardEvent): void;
  dispose?(): void;
}

/**
 * Shell: owns the canvas, scales the fixed 1280×720 logical view to whatever
 * window or device it is running on, normalises mouse and touch into one
 * pointer, and drives the active screen.
 */
export class App {
  readonly canvas: HTMLCanvasElement;
  readonly c: CanvasRenderingContext2D;
  readonly pointer: PointerState = createPointer();
  readonly progress = new Progress();
  readonly keys = new Set<string>();

  private screen: Screen | null = null;
  private pending: Screen | null = null;
  private last = 0;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private running = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not available in this environment.');
    this.c = ctx;

    sfx.enabled = this.progress.data.settings.sfx;

    window.addEventListener('resize', () => this.resize());
    this.bindPointer();
    this.bindKeys();
    this.resize();
  }

  setScreen(screen: Screen): void {
    // Defer the swap so a screen can replace itself from inside its own update.
    this.pending = screen;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  private frame(now: number): void {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    if (this.pending) {
      this.screen?.dispose?.();
      this.screen = this.pending;
      this.pending = null;
    }

    const c = this.c;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#05060d';
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.save();
    c.translate(this.offsetX, this.offsetY);
    c.scale(this.scale, this.scale);
    // Clip so nothing bleeds into the letterbox bars.
    c.beginPath();
    c.rect(0, 0, VIEW.w, VIEW.h);
    c.clip();

    if (this.screen) {
      this.screen.update(dt);
      this.screen.draw(c);
    }
    c.restore();

    // Edge-triggered pointer flags last exactly one frame.
    this.pointer.pressed = false;
    this.pointer.released = false;

    requestAnimationFrame((t) => this.frame(t));
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    const scale = Math.min(this.canvas.width / VIEW.w, this.canvas.height / VIEW.h);
    this.scale = scale;
    this.offsetX = (this.canvas.width - VIEW.w * scale) / 2;
    this.offsetY = (this.canvas.height - VIEW.h * scale) / 2;
  }

  /** Window pixels to logical view coordinates. */
  private toView(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = this.canvas.width / Math.max(1, rect.width);
    const px = (clientX - rect.left) * dpr;
    const py = (clientY - rect.top) * dpr;
    return { x: (px - this.offsetX) / this.scale, y: (py - this.offsetY) / this.scale };
  }

  private bindPointer(): void {
    const move = (clientX: number, clientY: number) => {
      const p = this.toView(clientX, clientY);
      this.pointer.x = p.x;
      this.pointer.y = p.y;
    };

    this.canvas.addEventListener('pointermove', (e) => {
      move(e.clientX, e.clientY);
    });

    this.canvas.addEventListener('pointerdown', (e) => {
      this.canvas.setPointerCapture?.(e.pointerId);
      move(e.clientX, e.clientY);
      this.pointer.down = true;
      this.pointer.pressed = true;
      this.pointer.downX = this.pointer.x;
      this.pointer.downY = this.pointer.y;
      sfx.resume();
      e.preventDefault();
    });

    const up = (e: PointerEvent) => {
      move(e.clientX, e.clientY);
      this.pointer.down = false;
      this.pointer.released = true;
    };
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', up);
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private bindKeys(): void {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase());
      this.screen?.onKey?.(e);
      if ([' ', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
  }
}
