import { createBattle, type BattleSetup } from '../sim/state';
import { createContext, step } from '../sim/sim';
import type { SimContext, SimEvent } from '../sim/events';
import { TICK_DT, type BattleState, type Command } from '../sim/types';
import { LocalTransport, type NetMessage, type Transport } from './transport';

/**
 * Owns the battle simulation and drives it at a fixed 60 Hz, independent of
 * the render frame rate.
 *
 * Commands are never applied directly. They are stamped with
 * `currentTick + inputDelay`, sent over the transport, and only executed when
 * that tick comes around — the standard deterministic-lockstep arrangement.
 * With LocalTransport the round trip is instant, so single player behaves like
 * a normal game with a couple of frames of input lag baked in.
 */
export class Match {
  readonly state: BattleState;
  readonly ctx: SimContext;
  readonly transport: Transport;
  readonly localPlayer: number;
  readonly playerCount: number;

  /** Ticks between issuing a command and executing it. */
  inputDelay: number;

  /** Commands waiting for their tick, keyed by tick. */
  private queue = new Map<number, Command[]>();
  /** Which players have confirmed input for a given tick (lockstep gate). */
  private confirmed = new Map<number, Set<number>>();
  private accumulator = 0;
  private paused = false;
  private speed = 1;

  constructor(setup: BattleSetup, transport: Transport = new LocalTransport(), playerCount = 1) {
    this.state = createBattle(setup);
    this.ctx = createContext(setup.seed);
    this.transport = transport;
    this.localPlayer = transport.localPlayer;
    this.playerCount = playerCount;
    this.inputDelay = playerCount > 1 ? 4 : 1;

    this.transport.onMessage((msg) => this.receive(msg));
  }

  get events(): SimEvent[] {
    return this.ctx.events;
  }

  setPaused(v: boolean): void {
    this.paused = v;
  }

  isPaused(): boolean {
    return this.paused;
  }

  setSpeed(v: number): void {
    this.speed = v;
  }

  getSpeed(): number {
    return this.speed;
  }

  /** Queue a local command for execution `inputDelay` ticks from now. */
  issue(cmd: Command): void {
    const tick = this.state.tick + this.inputDelay;
    this.transport.send({ t: 'turn', tick, player: this.localPlayer, commands: [cmd] });
  }

  private receive(msg: NetMessage): void {
    if (msg.t !== 'turn') return;
    const tick = Math.max(msg.tick, this.state.tick + 1);
    const list = this.queue.get(tick) ?? [];
    list.push(...msg.commands);
    this.queue.set(tick, list);
    let set = this.confirmed.get(tick);
    if (!set) {
      set = new Set();
      this.confirmed.set(tick, set);
    }
    set.add(msg.player);
  }

  /**
   * Advance by real elapsed time. Returns the number of simulation ticks run,
   * so callers can tell when the sim is starved (waiting on a remote player).
   */
  advance(realDt: number): number {
    if (this.paused) return 0;
    this.accumulator += Math.min(realDt, 0.25) * this.speed;
    let ran = 0;
    while (this.accumulator >= TICK_DT) {
      if (!this.canStep()) break;
      this.accumulator -= TICK_DT;
      this.stepOnce();
      ran++;
      // Guard against death spirals on slow devices.
      if (ran > 12) {
        this.accumulator = 0;
        break;
      }
    }
    return ran;
  }

  /**
   * In a multiplayer match we may only advance once every player's input for
   * the upcoming tick has arrived. Single player never blocks.
   */
  private canStep(): boolean {
    if (this.playerCount <= 1) return true;
    const target = this.state.tick + 1;
    if (target > this.inputDelay) {
      const set = this.confirmed.get(target);
      // A player with nothing to do still sends an empty turn each tick.
      if (!set || set.size < this.playerCount) return false;
    }
    return true;
  }

  private stepOnce(): void {
    const tick = this.state.tick + 1;
    const cmds = this.queue.get(tick) ?? [];
    this.queue.delete(tick);
    this.confirmed.delete(tick);
    step(this.state, this.ctx, cmds);
  }

  /**
   * Cheap state fingerprint. Peers exchange this every 60 ticks; a mismatch
   * means a desync, which is always a bug in simulation determinism.
   */
  checksum(): number {
    const s = this.state;
    let h = 0x811c9dc5;
    const mix = (n: number) => {
      h ^= Math.round(n * 1000) | 0;
      h = Math.imul(h, 0x01000193);
    };
    mix(s.tick);
    mix(s.solar);
    mix(s.rngState);
    for (const v of s.villains) {
      mix(v.id);
      mix(v.x);
      mix(v.hp);
      mix(v.row);
    }
    for (const hero of s.heroes) {
      mix(hero.id);
      mix(hero.hp);
      mix(hero.timer);
    }
    return h >>> 0;
  }

  /** Drain presentation events. Safe to skip entirely on a headless host. */
  drainEvents(): SimEvent[] {
    const out = this.ctx.events.slice();
    this.ctx.events.length = 0;
    return out;
  }
}
