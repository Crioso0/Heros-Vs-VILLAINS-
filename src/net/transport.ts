import type { Command } from '../sim/types';

/**
 * Netcode seam.
 *
 * The game only ever talks to a Transport. Single player uses LocalTransport,
 * which loops commands straight back. Networked play swaps in a WebSocket or
 * WebRTC transport that speaks the same three message types — nothing in the
 * simulation or the UI changes. See docs/MULTIPLAYER.md.
 */

export interface TurnMessage {
  t: 'turn';
  /** The tick these commands execute on. */
  tick: number;
  player: number;
  commands: Command[];
}

export interface HelloMessage {
  t: 'hello';
  player: number;
  seed: number;
  /** Ticks of input delay agreed for the match. */
  inputDelay: number;
  players: number;
}

export interface ChecksumMessage {
  t: 'checksum';
  tick: number;
  player: number;
  hash: number;
}

export type NetMessage = TurnMessage | HelloMessage | ChecksumMessage;

export interface Transport {
  readonly localPlayer: number;
  send(msg: NetMessage): void;
  onMessage(handler: (msg: NetMessage) => void): void;
  close(): void;
}

/** Single-player / hotseat: everything the client sends comes right back. */
export class LocalTransport implements Transport {
  readonly localPlayer = 0;
  private handlers: ((msg: NetMessage) => void)[] = [];

  send(msg: NetMessage): void {
    for (const h of this.handlers) h(msg);
  }

  onMessage(handler: (msg: NetMessage) => void): void {
    this.handlers.push(handler);
  }

  close(): void {
    this.handlers = [];
  }
}

/**
 * Two transports wired to each other in one process. Used by the hotseat
 * Versus mode and by the deterministic desync test in dev builds; it is also
 * the reference for what a real socket transport must do.
 */
export function createLoopbackPair(): [Transport, Transport] {
  const handlersA: ((m: NetMessage) => void)[] = [];
  const handlersB: ((m: NetMessage) => void)[] = [];

  const a: Transport = {
    localPlayer: 0,
    send: (m) => {
      for (const h of handlersA) h(m);
      for (const h of handlersB) h(m);
    },
    onMessage: (h) => handlersA.push(h),
    close: () => (handlersA.length = 0),
  };
  const b: Transport = {
    localPlayer: 1,
    send: (m) => {
      for (const h of handlersA) h(m);
      for (const h of handlersB) h(m);
    },
    onMessage: (h) => handlersB.push(h),
    close: () => (handlersB.length = 0),
  };
  return [a, b];
}
