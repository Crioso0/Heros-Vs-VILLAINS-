import type { Rect } from '../core/math';

/**
 * Fixed logical resolution. The canvas is scaled and letterboxed to fit any
 * window or device, so every layout constant below is resolution-independent —
 * which is what lets the same build run on a phone and a desktop window.
 */
export const VIEW = { w: 1280, h: 720 };

export const BOARD = {
  x: 190,
  y: 150,
  cellW: 108,
  cellH: 96,
};

export const TRAY = {
  x: 120,
  y: 8,
  cardW: 78,
  cardH: 106,
  gap: 6,
};

export const SOLAR_BOX: Rect = { x: 8, y: 8, w: 104, h: 106 };

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

export function cardRect(index: number): Rect {
  return {
    x: TRAY.x + index * (TRAY.cardW + TRAY.gap),
    y: TRAY.y,
    w: TRAY.cardW,
    h: TRAY.cardH,
  };
}

/** Where the villain commander's deploy cards sit in Versus mode. */
export function villainCardRect(index: number): Rect {
  const w = 74;
  const h = 84;
  return { x: 1272 - w, y: 150 + index * (h + 6), w, h };
}

/** Scheme buttons sit in the gap between the card tray and the board. */
export function schemeButtonRect(index: number): Rect {
  const w = 82;
  return { x: 790 + index * (w + 6), y: 120, w, h: 26 };
}

/** The strip of a lane the villain commander clicks to deploy into it. */
export function laneStripRect(row: number, cols: number): Rect {
  return {
    x: BOARD.x + (cols - 2) * BOARD.cellW,
    y: BOARD.y + row * BOARD.cellH,
    w: BOARD.cellW * 2,
    h: BOARD.cellH,
  };
}
