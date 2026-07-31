import type { Rng } from '../core/rng';

/**
 * Presentation events emitted by the simulation.
 *
 * The simulation never draws or plays anything itself; it appends events that
 * the renderer and audio layer drain once per frame. Events are derived purely
 * from simulated state, so two clients running the same command stream emit the
 * same events — they are safe to ignore entirely on a headless server.
 */
export type SimEvent =
  | { t: 'shoot'; x: number; y: number; kind: string; color: string; heroId?: string }
  | { t: 'hit'; x: number; y: number; color: string; power: number; armor?: boolean }
  | { t: 'villainDown'; x: number; y: number; big: boolean }
  | { t: 'heroDown'; x: number; y: number }
  | { t: 'plant'; x: number; y: number }
  | { t: 'explode'; x: number; y: number; radius: number; color: string }
  | { t: 'ultimate'; x: number; y: number; heroId: string; color: string; ultId?: string }
  | { t: 'overdrive' }
  | { t: 'collect'; kind: 'solar' | 'leaf'; x: number; y: number; value: number }
  | { t: 'wave'; huge: boolean }
  | { t: 'drone'; row: number }
  | { t: 'shake'; power: number }
  | { t: 'flash'; color: string; power: number }
  | { t: 'sound'; id: string }
  | { t: 'phase'; phase: 'won' | 'lost' };

export interface SimContext {
  rng: Rng;
  events: SimEvent[];
}

export function emit(ctx: SimContext, ev: SimEvent): void {
  // Keep the buffer bounded: a stalled presentation layer must not leak.
  if (ctx.events.length < 512) ctx.events.push(ev);
}
