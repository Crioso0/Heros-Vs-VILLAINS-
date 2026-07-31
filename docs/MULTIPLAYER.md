# Multiplayer

The goal: **one player defends with heroes, the other attacks with villains.**

This document describes what already exists and exactly what is left to do. The
short version: the asymmetric game is playable today against an AI or a second
player at the same device, and the remaining work is transport plumbing, not
game design.

## What already works

- **The villain seat is a real seat.** It has its own resource (Menace, which
  regenerates over time), its own deploy cards with cooldowns, and its own
  abilities (Schemes). It is playable now from the Versus screen.
- **Both seats speak the same language.** Hero actions and villain actions are
  both `Command` values. There is no separate "AI path" — the Director in
  `src/ai/director.ts` produces the same commands a human villain player's taps
  produce, which is why a human can take the seat with no code changes.
- **The simulation is deterministic.** Fixed 60 Hz timestep, seeded PRNG whose
  state lives on the battle state, no wall-clock reads, no `Math.random`. The
  headless test asserts that the same seed plus the same command stream produces
  an identical state fingerprint.
- **The clock is already lockstep-shaped.** `Match` stamps every command with
  `currentTick + inputDelay`, ships it through a `Transport`, and only executes
  it when that tick arrives. Single player uses `LocalTransport`, which loops
  commands straight back.
- **Desync detection exists.** `Match.checksum()` fingerprints the live state.

## What is left

### 1. A network transport

Implement the existing three-message interface over a socket:

```ts
interface Transport {
  readonly localPlayer: number;
  send(msg: NetMessage): void;
  onMessage(handler: (msg: NetMessage) => void): void;
  close(): void;
}

type NetMessage =
  | { t: 'hello';    player; seed; inputDelay; players }
  | { t: 'turn';     tick; player; commands }
  | { t: 'checksum'; tick; player; hash }
```

Nothing in `src/sim/`, `src/render/`, `src/ui/` or `src/screens/` changes.
`createLoopbackPair()` in `src/net/transport.ts` is the reference: it is what a
correct transport has to behave like.

### 2. Empty turns

Lockstep requires a message every tick from every player, even an empty one, or
peers block forever waiting for input that was never coming. `Match.canStep()`
already refuses to advance until every player has confirmed the upcoming tick —
the client just needs to send `{ t: 'turn', tick, player, commands: [] }` on
every tick where it has nothing to say.

### 3. Matchmaking and the lobby

The Versus setup screen already collects everything a match needs: arena, threat
level, and which seat the villain is. It needs a third seat option ("online
opponent") that establishes a transport and exchanges a `hello` before handing
the agreed seed to `BattleScreen`.

### 4. Desync handling

Exchange `checksum` messages every 60 ticks. A mismatch is always a determinism
bug, never a recoverable state — log the tick, both fingerprints, and the recent
command stream, and end the match cleanly rather than letting the two players
diverge silently.

## Why lockstep rather than an authoritative server

- **Bandwidth is tiny.** Only commands cross the wire — a few bytes per action,
  nothing per entity. A board with sixty villains costs the same as an empty one.
- **The simulation is already exact.** No interpolation, no reconciliation, no
  rollback machinery to write.
- **It runs peer-to-peer or through a relay.** The transport does not care.

The trade-offs are real and worth stating: every player runs the full simulation,
so a cheater sees the whole board state (acceptable — both players already see
the whole board in this genre), and input latency is `inputDelay` ticks
(currently 4, about 66 ms) for everyone.

If a headless authoritative server is wanted later, `step()` already runs in Node
with no DOM — `npm run test:sim` proves it every run. Hosting a match server is a
matter of running the same `Match` with a socket transport and no renderer.

## Balance notes for the villain seat

Menace regenerates at 12/sec up to a cap of 1200. Deploy costs run from 25 for a
Street Goon to 400 for Colossus Prime, so the villain player chooses between
constant pressure and banking for something that will not die to a single lane.

Schemes are the villain answer to Leaf Mode:

| Scheme | Cost | Effect |
| --- | --- | --- |
| Surge | 100 | Every villain in a lane sprints for 6 seconds |
| Reinforce | 125 | Fresh plating on every villain in a lane |
| Blackout | 150 | Heroes in a 3×3 are frozen for 5 seconds |
| Sabotage | 225 | Destroys one hero outright, wherever it stands |

In Versus the hero side wins by surviving eight minutes; the villain side wins by
getting one villain to the HQ after that lane's Guardian Drone is spent.
