import { sfx } from '../audio/sfx';
import { resetWeather } from '../render/backdrops';
import { Progress } from '../game/progress';
import { configureLayout, LAYOUT, VIEW, type LayoutMode } from '../render/layout';
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
  /** The one pointer that owns input. A second finger must not hijack a drag. */
  private activePointerId: number | null = null;
  private last = 0;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private running = false;
  private resizeQueued = false;
  /** Park the pointer off-screen once the release frame has been consumed. */
  private parkPointerAfterFrame = false;
  /** Set by the battle screen when the villain seat needs its own strip. */
  versusStrip = false;
  /** Fired after the orientation profile changes, so screens can reset state. */
  onLayoutChange: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not available in this environment.');
    this.c = ctx;

    sfx.enabled = this.progress.data.settings.sfx;

    this.bindViewport();
    this.bindPointer();
    this.bindKeys();
    this.bindLifecycle();
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
    c.fillStyle = '#06070f';
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
    this.pointer.cancelled = false;
    if (this.parkPointerAfterFrame) {
      this.parkPointerAfterFrame = false;
      this.pointer.x = -999;
      this.pointer.y = -999;
    }

    requestAnimationFrame((t) => this.frame(t));
  }

  /** Recompute the layout now — e.g. a screen changed whether it needs the
   *  Versus strip, which changes how much room the board gets. */
  requestLayout(): void {
    this.resize();
  }

  /** Coalesce the burst of resize events iOS fires while its URL bar animates. */
  private requestResize(): void {
    if (this.resizeQueued) return;
    this.resizeQueued = true;
    requestAnimationFrame(() => {
      this.resizeQueued = false;
      this.resize();
    });
  }

  private bindViewport(): void {
    window.addEventListener('resize', () => this.requestResize());
    window.visualViewport?.addEventListener('resize', () => this.requestResize());
    window.addEventListener('orientationchange', () => {
      this.requestResize();
      // iOS reports pre-rotation dimensions on the first tick after the event.
      setTimeout(() => this.requestResize(), 250);
    });
  }

  private resize(): void {
    // #stage carries the safe-area padding, so its content box is the space the
    // game may actually use — under the notch and home indicator is not ours.
    const stage = this.canvas.parentElement;
    const w = Math.max(1, stage?.clientWidth ?? window.innerWidth);
    const h = Math.max(1, stage?.clientHeight ?? window.innerHeight);

    // Hysteresis: a near-square window, or an animating URL bar, must not be
    // able to flip the profile back and forth every frame.
    const ratio = h / w;
    const wasPortrait = LAYOUT.mode === 'portrait';
    const mode: LayoutMode = wasPortrait ? (ratio < 0.95 ? 'landscape' : 'portrait')
                                         : (ratio > 1.05 ? 'portrait' : 'landscape');
    const changed = mode !== LAYOUT.mode;
    configureLayout(mode, w, h, this.versusStrip);

    // 2x is enough for vector art; 2.5x on a 3x phone costs 36% more pixels for
    // nothing visible.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.floor(w * dpr);
    const ch = Math.floor(h * dpr);
    if (cw !== this.canvas.width || ch !== this.canvas.height) {
      // Assigning width/height reallocates and clears the backing store.
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    const scale = Math.min(cw / VIEW.w, ch / VIEW.h);
    this.scale = scale;
    this.offsetX = (cw - VIEW.w * scale) / 2;
    this.offsetY = (ch - VIEW.h * scale) / 2;

    if (changed) {
      resetWeather();
      // A rotation is a blackout of a second or so with a live simulation
      // behind it; drop any half-finished gesture.
      this.activePointerId = null;
      this.pointer.down = false;
      this.pointer.pressed = false;
      this.pointer.released = false;
      this.pointer.x = -999;
      this.pointer.y = -999;
      this.onLayoutChange?.();
    }
  }

  private bindLifecycle(): void {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.progress.save();
      } else {
        sfx.resume();
        this.requestResize();
      }
    });
    window.addEventListener('pagehide', () => this.progress.save());
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
    // Coordinates outside the letterboxed view are rejected rather than
    // clamped: a tap on a black bar must not land on the nearest control.
    const inView = (p: { x: number; y: number }) =>
      p.x >= 0 && p.x <= VIEW.w && p.y >= 0 && p.y <= VIEW.h;

    const move = (clientX: number, clientY: number) => {
      const p = this.toView(clientX, clientY);
      this.pointer.x = p.x;
      this.pointer.y = p.y;
    };

    this.canvas.addEventListener('pointermove', (e) => {
      if (this.activePointerId !== null && e.pointerId !== this.activePointerId) return;
      move(e.clientX, e.clientY);
    });

    this.canvas.addEventListener('pointerdown', (e) => {
      // First finger down owns the gesture until it lifts.
      if (this.activePointerId !== null) return;
      if (!inView(this.toView(e.clientX, e.clientY))) return;
      this.activePointerId = e.pointerId;
      this.canvas.setPointerCapture?.(e.pointerId);
      move(e.clientX, e.clientY);
      this.pointer.down = true;
      this.pointer.pressed = true;
      this.pointer.downX = this.pointer.x;
      this.pointer.downY = this.pointer.y;
      sfx.resume();
      e.preventDefault();
    });

    this.canvas.addEventListener('pointerup', (e) => {
      if (e.pointerId !== this.activePointerId) return;
      this.activePointerId = null;
      move(e.clientX, e.clientY);
      this.pointer.down = false;
      this.pointer.released = true;
      // Touch produces no hover moves, so the pointer would otherwise park at
      // the release point forever and leave tooltips, hot states and the
      // placement ghost stuck under a finger that is long gone. It has to
      // survive the frame that consumes the release, though — on a quick tap
      // press and release land in the same frame, and clearing the position
      // here would mean no widget ever sees the tap.
      if (e.pointerType !== 'mouse') this.parkPointerAfterFrame = true;
    });

    // A cancel is NOT a completed tap. iOS fires it on edge swipes, Control
    // Centre pulls, a second finger and the standalone home swipe; treating it
    // as a release plants heroes and presses buttons the player never touched.
    const cancel = (e: PointerEvent) => {
      if (e.pointerId !== this.activePointerId) return;
      this.activePointerId = null;
      this.pointer.down = false;
      this.pointer.released = false;
      this.pointer.cancelled = true;
      this.pointer.x = -999;
      this.pointer.y = -999;
    };
    this.canvas.addEventListener('pointercancel', cancel);
    this.canvas.addEventListener('lostpointercapture', cancel);
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
