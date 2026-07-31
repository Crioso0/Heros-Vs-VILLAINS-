# Architecture

The whole game is one TypeScript codebase split along a single hard line:

```
        input                         presentation
          │                                ▲
          ▼                                │
   ┌─────────────┐   commands    ┌──────────────────┐
   │  Transport  │ ────────────► │   Simulation     │ ── events ──►  Renderer
   │ (local/net) │               │  (pure, 60 Hz)   │                Audio
   └─────────────┘               └──────────────────┘                HUD
```

**Nothing crosses that line except commands going in and events coming out.**
Everything else in this document follows from that one rule.

## Directory map

| Path | Role |
| --- | --- |
| `src/core/` | Deterministic PRNG, maths. No game knowledge. |
| `src/sim/` | The simulation. No DOM, no canvas, no `Date`, no `Math.random`. |
| `src/content/` | Pure data: heroes, villains, worlds, levels, schemes. |
| `src/net/` | Transport interface, loopback implementations, the `Match` driver. |
| `src/ai/` | The villain Director — a command producer, nothing more. |
| `src/render/` | Canvas painters plus `layout.ts`, which owns both orientation profiles. |
| `src/ui/` | Immediate-mode widgets and the battle HUD. |
| `src/screens/` | Menu, world map, deck picker, battle, versus setup, codex. |
| `src/app/` | Canvas shell: scaling, pointer normalisation, screen stack. |
| `src/dev/` | Headless smoke test (`npm run test:sim`). |

## The simulation

`src/sim/sim.ts` exports one function:

```ts
step(state: BattleState, ctx: SimContext, commands: Command[]): void
```

It runs at a fixed 60 Hz regardless of frame rate. Rules it obeys without
exception:

- **No wall-clock time.** Only `TICK_DT`. `state.time` accumulates from ticks.
- **No `Math.random`.** All randomness comes from `ctx.rng`, whose 32-bit state
  lives on `state.rngState` and is saved back at the end of every step, so a
  state snapshot round-trips exactly.
- **No floating input.** Commands are re-validated inside the simulation. A
  client that sends an illegal command has it dropped identically everywhere.
- **No output.** Instead of drawing or playing sounds, it appends `SimEvent`s
  that the presentation layer drains once per frame and a headless server
  ignores entirely.

Board space is measured in lane cells: `x` runs `0` (the HQ edge) to `cols`
(the spawn edge), `y` runs `0..rows` top to bottom. The renderer is the only
code that knows what a pixel is.

## Commands

```ts
type Command =
  | { t: 'plant';     player; heroId; col; row }
  | { t: 'shovel';    player; col; row }
  | { t: 'collect';   player; pickupId }
  | { t: 'leaf';      player; heroId }      // Leaf Mode on one hero
  | { t: 'overdrive'; player }              // every ultimate at once
  | { t: 'deploy';    player; villainId; row }   // villain commander
  | { t: 'scheme';    player; schemeId; row; col }
```

Local input, the AI Director, and a future remote player all emit exactly this
type. That is what makes the villain seat swappable between a human at the same
device, an AI, and a network peer without touching game logic.

## Match driver

`src/net/match.ts` owns the simulation and the clock. Commands are never applied
directly — they are stamped `currentTick + inputDelay`, sent through the
`Transport`, and executed when that tick arrives. With `LocalTransport` the
round trip is instant, so single player behaves like a normal game with a couple
of frames of input delay baked in. Swap the transport and the same code is a
lockstep network client. See [MULTIPLAYER.md](MULTIPLAYER.md).

## Content is data

A new hero is an entry in `src/content/heroes.ts`: stats, an attack descriptor,
a Leaf Mode ultimate, and an art spec (palette + head shape + emblem). No new
art files, no new render code unless the ultimate needs a genuinely new effect —
in which case it is one `case` in `src/sim/ultimates.ts`.

Levels are generated from a per-world threat curve (`src/content/levels.ts`)
seeded by level id, so the campaign scales to 40 stages without thousands of
lines of hand-authored wave data, and every player sees the same stage 3-4.

## Layout: two profiles

`src/render/layout.ts` holds two layout profiles and switches between them on
resize:

| Profile | Logical view | Used for |
| --- | --- | --- |
| `landscape` | 1280×720 | desktop, and a phone held sideways |
| `portrait` | 720×H | a phone held upright; H tracks the device aspect, quantised to 32px and clamped to 1152–1600 |

In portrait the board keeps its horizontal lanes but takes the full width
(9 columns of 70px), the card tray moves to the bottom as two rows of five, the
wave meter moves into the top bar, and controls grow to a ~84px logical touch
target (44pt at the 0.54 phone scale).

Every layout value is a mutable object reassigned by `configureLayout()`, so
consumers just read it at draw time. **The rule that keeps this working: nothing
in `src/ui`, `src/render` or `src/screens` may capture a layout-derived value at
module scope** — a module-level `const` is evaluated once at import and can
never be corrected. `src/dev/simSmoke.ts` asserts the landscape profile is
byte-identical to the original hand-tuned constants, and that in portrait, on
four device sizes, every control is on screen, finger-sized, and non-overlapping.

## Rendering

Everything is drawn procedurally into a 2D canvas, letterboxed to any window or
device:

- **Backdrops** paint sky, skyline and ground once into an offscreen canvas per
  world and blit it; only weather and lighting are per-frame.
- **Characters** all come off one jointed chibi rig, varied by palette, head
  shape and chest emblem. Zero image assets ship with the game.
- **Effects** are a plain particle layer that reads simulation events. It is
  presentation-only and free to use `Math.random`.

## Testing

`npm run test:sim` bundles `src/dev/simSmoke.ts` with esbuild and runs it in
Node — no browser, no test-runner dependency. It checks content integrity, plays
several campaign levels with a scripted bot, fires every ultimate, exercises the
AI Director, and asserts that the same seed plus the same commands produce a
byte-identical fingerprint. That last check is the one that protects the netcode.
