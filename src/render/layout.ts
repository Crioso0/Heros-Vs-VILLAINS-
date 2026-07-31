import { clamp, type Rect } from '../core/math';

/**
 * Layout.
 *
 * The game draws into one canvas at a fixed logical resolution which is scaled
 * and letterboxed onto the real window. There are two profiles:
 *
 *   landscape  1280x720  — desktop and a phone held sideways
 *   portrait    720xH    — a phone held upright, H derived from the device
 *
 * Everything below is a mutable object rather than a frozen constant, and
 * `configureLayout` reassigns the fields in place. Consumers read them at draw
 * time, so a rotation costs one call and no re-wiring.
 *
 * The one rule that keeps this honest: NOTHING in src/ui, src/render or
 * src/screens may capture a value derived from these objects at module scope.
 * A module-level `const X = VIEW.w / 2` is evaluated once at import and can
 * never be corrected. Read inside the draw call instead.
 *
 * This module imports only `clamp` and a type, deliberately: it is bundled into
 * the Node test harness, so it must never pull in anything that touches the DOM.
 */

export type LayoutMode = 'landscape' | 'portrait';

export const LAYOUT = { mode: 'landscape' as LayoutMode, epoch: 0 };

export const VIEW = { w: 1280, h: 720 };

export const BOARD = {
  x: 190,
  y: 150,
  cellW: 108,
  cellH: 96,
  /** Figure heights are decoupled from cellH: portrait cells are tall and narrow. */
  heroH: 96 * 0.92,
  villainH: 96 * 0.94,
};

export const TRAY = {
  x: 120,
  y: 8,
  cardW: 78,
  cardH: 106,
  gap: 6,
  gapY: 6,
  /** Cards per row. 10 in landscape (one row), 5 in portrait (two rows). */
  cols: 10,
};

export const SOLAR_BOX: Rect = { x: 8, y: 8, w: 104, h: 106 };

/** The HQ plate to the left of the lawn: width, and its gap to the board. */
export const HQ = { w: 114, gap: 66 };

/** Height of the portrait top bar. 0 in landscape, where the tray lives there. */
export const TOP_BAR = { h: 0 };

/** The bottom bar and the controls docked in it. */
export const BOTTOM = {
  top: 650,
  leaf: { x: 20, y: 680, w: 30, h: 30 } as Rect,
  od: { x: 336, y: 684, w: 210, h: 22 } as Rect,
  wave: { x: 840, y: 684, w: 420, h: 22 } as Rect,
};

/** The Versus villain-commander strip (portrait) or column (landscape). */
export const VERSUS = { stripTop: 0, stripH: 0 };

/** Leaf bank cap, mirroring the rule in src/sim/commands.ts. */
export const MAX_LEAVES = 9;

/**
 * Minimum comfortable touch target in logical pixels.
 *
 * Apple asks for 44pt. A 720-wide view on a 390pt-wide phone scales by 0.54,
 * so 44pt is ~82 logical px. Used as an audit constant and asserted in the
 * layout tests — deliberately not enforced inside `button()`, which would
 * silently resize controls that callers space by hand.
 */
export const MIN_TAP = 84;

/** Multiplier applied to widget text and chrome. 1 landscape, 1.6 portrait. */
export const UI_SCALE = { v: 1 };

/**
 * Recompute every layout field for an orientation and a device size.
 *
 * The landscape branch reproduces the original hand-tuned constants exactly, so
 * the desktop build is a pixel-for-pixel no-op. `src/dev/simSmoke.ts` asserts
 * that with a golden check.
 */
export function configureLayout(
  mode: LayoutMode,
  cssW: number,
  cssH: number,
  versusStrip = false,
): void {
  LAYOUT.mode = mode;
  LAYOUT.epoch++;

  if (mode === 'landscape') {
    VIEW.w = 1280;
    VIEW.h = 720;
    UI_SCALE.v = 1;
    TOP_BAR.h = 0;

    BOARD.x = 190;
    BOARD.y = 150;
    BOARD.cellW = 108;
    BOARD.cellH = 96;
    BOARD.heroH = 96 * 0.92;
    BOARD.villainH = 96 * 0.94;

    HQ.w = 114;
    HQ.gap = 66;

    TRAY.x = 120;
    TRAY.y = 8;
    TRAY.cardW = 78;
    TRAY.cardH = 106;
    TRAY.gap = 6;
    TRAY.gapY = 6;
    TRAY.cols = 10;

    SOLAR_BOX.x = 8;
    SOLAR_BOX.y = 8;
    SOLAR_BOX.w = 104;
    SOLAR_BOX.h = 106;

    BOTTOM.top = VIEW.h - 70;
    // One generous button rather than a row of 30px slots: the slots were
    // technically clickable and practically not, and a mis-click spends a Leaf.
    BOTTOM.leaf = { x: 16, y: VIEW.h - 64, w: 60, h: 60 };
    BOTTOM.od = { x: 336, y: VIEW.h - 36, w: 210, h: 22 };
    BOTTOM.wave = { x: VIEW.w - 440, y: VIEW.h - 36, w: 420, h: 22 };

    VERSUS.stripTop = 0;
    VERSUS.stripH = 0;
    return;
  }

  /* ---------------- portrait ---------------- */

  VIEW.w = 720;
  // Match the device aspect so the letterbox stays thin, quantised to 32px so a
  // given phone only ever visits one or two sizes (the backdrop cache is keyed
  // on view size, and a full repaint of a skyline is not free).
  const wanted = Math.ceil((720 * cssH) / Math.max(1, cssW) / 32) * 32;
  VIEW.h = clamp(wanted, 1152, 1600);
  UI_SCALE.v = 1.6;
  TOP_BAR.h = 112;

  SOLAR_BOX.x = 12;
  SOLAR_BOX.y = 6;
  SOLAR_BOX.w = 120;
  SOLAR_BOX.h = 100;

  // Two rows of five: maxDeck is capped at 10, so the tray never needs to scroll.
  TRAY.cardW = 128;
  TRAY.cardH = 132;
  TRAY.gap = 12;
  TRAY.gapY = 10;
  TRAY.cols = 5;
  TRAY.x = 16;
  TRAY.y = VIEW.h - 288;

  // Bottom bar budget, bottom-up:
  //   14 margin + 2 tray rows (132*2 + 10 = 274) + 12 gap + 88 control row
  //   + 12 margin = 400.
  BOTTOM.top = VIEW.h - 400;
  BOTTOM.leaf = { x: 16, y: VIEW.h - 388, w: 88, h: 88 };
  BOTTOM.od = { x: 112, y: VIEW.h - 388, w: VIEW.w - 128, h: 88 };
  // The wave meter moves into the top bar: in the bottom bar it would sit on
  // the overdrive hit rect, and one tap would fire both.
  BOTTOM.wave = { x: 144, y: 54, w: 280, h: 30 };

  VERSUS.stripH = versusStrip ? 190 : 0;
  VERSUS.stripTop = versusStrip ? BOTTOM.top - VERSUS.stripH - 8 : 0;

  HQ.w = 34;
  HQ.gap = 6;
  BOARD.x = HQ.w + HQ.gap + 4; // 44

  // 9 columns must leave room for the spawn point at x = cols + 0.6.
  //   bx(9.6) = 44 + 9.6 * 70 = 716 <= 720
  BOARD.cellW = 70;

  const regionTop = TOP_BAR.h;
  const regionBottom = versusStrip ? VERSUS.stripTop : BOTTOM.top;
  const region = regionBottom - regionTop;
  BOARD.cellH = clamp(Math.floor((region - 48) / 5), 84, 118);
  BOARD.y = regionTop + Math.round((region - 5 * BOARD.cellH) / 2);

  // Figures are sized against the narrow axis, or neighbours in adjacent
  // columns would overlap in a 70px-wide cell.
  BOARD.heroH = 76;
  BOARD.villainH = 78;
}

/* ------------------------------------------------------------------ *
 * Derived geometry
 * ------------------------------------------------------------------ */

export function boardWidth(cols: number): number {
  return cols * BOARD.cellW;
}

export function boardHeight(rows: number): number {
  return rows * BOARD.cellH;
}

/** Board-space (cells) to screen pixels. */
export function bx(x: number): number {
  return BOARD.x + x * BOARD.cellW;
}

export function by(y: number): number {
  return BOARD.y + y * BOARD.cellH;
}

export function cellRect(col: number, row: number): Rect {
  return { x: bx(col), y: by(row), w: BOARD.cellW, h: BOARD.cellH };
}

/** Screen pixels to a board cell, or null if outside the lawn. */
export function screenToCell(
  px: number,
  py: number,
  cols: number,
  rows: number,
): { col: number; row: number } | null {
  const col = Math.floor((px - BOARD.x) / BOARD.cellW);
  const row = Math.floor((py - BOARD.y) / BOARD.cellH);
  if (col < 0 || col >= cols || row < 0 || row >= rows) return null;
  return { col, row };
}

/** The HQ plate the villains are walking toward. */
export function hqRect(rows: number): Rect {
  return {
    x: Math.max(4, BOARD.x - HQ.gap - HQ.w),
    y: BOARD.y - 10,
    w: HQ.w,
    h: rows * BOARD.cellH + 22,
  };
}

export function cardRect(index: number): Rect {
  const col = index % TRAY.cols;
  const row = Math.floor(index / TRAY.cols);
  return {
    x: TRAY.x + col * (TRAY.cardW + TRAY.gap),
    y: TRAY.y + row * (TRAY.cardH + TRAY.gapY),
    w: TRAY.cardW,
    h: TRAY.cardH,
  };
}

export type ToolKind = 'shovel' | 'pause' | 'speed';

/** Shovel / pause / speed. Stacked at the top-right in landscape, a row in portrait. */
export function toolRect(kind: ToolKind): Rect {
  if (LAYOUT.mode === 'landscape') {
    if (kind === 'shovel') return { x: VIEW.w - 62, y: 8, w: 54, h: 54 };
    if (kind === 'pause') return { x: VIEW.w - 62, y: 68, w: 54, h: 22 };
    return { x: VIEW.w - 62, y: 94, w: 54, h: 22 };
  }
  const w = 88;
  const x = kind === 'shovel' ? 432 : kind === 'pause' ? 528 : 624;
  return { x, y: 8, w, h: 88 };
}

/** Where a collected pickup flies to. */
export function pickupTarget(kind: 'solar' | 'leaf'): { x: number; y: number } {
  if (kind === 'solar') {
    return { x: SOLAR_BOX.x + SOLAR_BOX.w / 2, y: SOLAR_BOX.y + SOLAR_BOX.h / 2 };
  }
  return { x: BOTTOM.leaf.x + BOTTOM.leaf.w / 2, y: BOTTOM.leaf.y + BOTTOM.leaf.h / 2 };
}

/**
 * Where the villain commander's deploy cards sit in Versus mode: a column down
 * the right edge in landscape, a horizontal strip under the board in portrait
 * (where there is no spare width for a column).
 */
export function villainCardRect(index: number, count: number): Rect {
  if (LAYOUT.mode === 'landscape') {
    const w = 74;
    const top = 150;
    const bottom = 640;
    const pitch = Math.min(90, Math.floor((bottom - top) / Math.max(1, count)));
    const h = Math.max(38, pitch - 6);
    return { x: VIEW.w - 8 - w, y: top + index * pitch, w, h };
  }
  const pitch = Math.min(88, Math.floor(700 / Math.max(1, count)));
  return { x: 10 + index * pitch, y: VERSUS.stripTop + 8, w: pitch - 8, h: 88 };
}

/** Scheme buttons. */
export function schemeButtonRect(index: number): Rect {
  if (LAYOUT.mode === 'landscape') {
    const w = 82;
    return { x: 790 + index * (w + 6), y: 120, w, h: 26 };
  }
  return { x: 16 + index * 176, y: VERSUS.stripTop + 104, w: 168, h: 76 };
}

/** The strip of a lane the villain commander taps to deploy into it. */
export function laneStripRect(row: number, cols: number): Rect {
  return {
    x: BOARD.x + (cols - 2) * BOARD.cellW,
    y: BOARD.y + row * BOARD.cellH,
    w: BOARD.cellW * 2,
    h: BOARD.cellH,
  };
}

/** Health bars sit just above the figure, which is not the cell top in portrait. */
export function healthBarY(row: number): number {
  if (LAYOUT.mode === 'landscape') return by(row) + 6;
  return by(row + 0.88) - BOARD.heroH - 10;
}
