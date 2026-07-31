# Heroes vs Villains

A lane-defence game in the *Plants vs. Zombies* mould, with collectible
superheroes holding the line against waves of supervillains.

Fan project. Every character is an original creation — original names, original
emblems, original art — built as an archetype homage rather than a copy. Nothing
trademarked appears in the code or the build.

```bash
npm install
npm run dev      # http://localhost:5173
```

**On a phone:** it is a PWA. Open the deployed URL in Safari or Chrome and use
Share → Add to Home Screen, and it installs as a real app — its own icon, no
browser chrome, and playable offline. Portrait and landscape are both first-class
layouts, so it works whichever way you hold it. See
[docs/NATIVE.md](docs/NATIVE.md) for publishing and the one-time GitHub Pages
setup.

## What's in it

- **The full loop.** Collect solar, pick cards, place heroes on a 9×5 lawn, hold
  the line, Guardian Drones save you once per lane, huge waves announce
  themselves.
- **Leaf Mode.** Villains sometimes carry a glowing Leaf. Kill one, pick the Leaf
  up, drop it on a hero, and they cut loose — Paragon burns the lane clean with
  heat vision and freezes what's left, the Emerald Warden punches a giant
  hard-light fist down the row and leaves a wall behind, Tempest calls twelve
  lightning strikes. Every non-instant hero has one.
- **Overdrive.** Banking Leaves fills a meter. When it's full, hit it (or press
  space) and **every hero on the board fires their ultimate at once.**
- **25 heroes, 18 villains, 4 worlds, 40 stages**, each world ending in a boss.
- **Versus.** One player defends with heroes, the other spends Menace to deploy
  villains and run Schemes. Playable now against the AI Director or a second
  player at the same device; networked play is a transport swap, see below.
- **Four procedural worlds** — midnight rooftops under a searchlight, a noon
  civic plaza, a deep-space Corps citadel, an irradiated desert.

## Controls

| Input | Action |
| --- | --- |
| Click / tap a card, then a tile | Place a hero (drag also works; tap the card again to cancel) |
| Click a falling orb | Collect solar — works even with a card armed |
| Click the Leaf button, then a hero | Leaf Mode |
| `Space` | Overdrive — every ultimate at once |
| `1`–`9` | Select a card |
| `F` | Pick up a Leaf |
| `S` | Shovel |
| `P` / `Esc` | Pause |

In Versus the villain player picks a villain then taps the lane to send it in —
from a column on the right in landscape, or a strip under the board in portrait.

On a phone everything is tap-driven: tap a card then a tile, tap the card again
to cancel, tap orbs to collect them.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Typecheck and build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run test:sim` | Headless simulation test — runs in Node, no browser |
| `npm test` | Typecheck + simulation test |

`npm run test:sim` plays several campaign levels with a scripted bot, fires every
ultimate, exercises the AI villain commander, and asserts that the same seed plus
the same commands produce a byte-identical state fingerprint.

## How it's built

TypeScript and one `<canvas>`. No engine, no runtime dependencies, no art assets
— every character, backdrop, sound effect and app icon is generated
procedurally. The production build is ~131 KB of JavaScript (~42 KB gzipped)
plus 13 KB of generated PNG icons, which is small enough that the service worker
precaches the entire game for offline play.

The interface has two layout profiles — 1280×720 landscape and 720×H portrait —
selected on resize and rotation. Both are asserted in the test suite: the
landscape profile must stay byte-identical to its original constants, and the
portrait profile must put every control on screen, above the 44pt touch minimum,
and non-overlapping, on four device sizes.

The important structural decision is that the **simulation is pure**: fixed
60 Hz timestep, seeded PRNG, no DOM, no wall-clock reads, no `Math.random`. The
outside world only ever sends it commands and only ever reads back events. Local
input, the AI Director, and a future network peer all speak that same command
stream — which is why the villain seat can be a human at the same device, an AI,
or eventually a player across the internet without game logic changing.

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the pieces fit
- [docs/MULTIPLAYER.md](docs/MULTIPLAYER.md) — what exists, what's left, and why lockstep
- [docs/NATIVE.md](docs/NATIVE.md) — desktop (Tauri) and mobile (Capacitor) packaging
- [docs/CONTENT.md](docs/CONTENT.md) — full roster, worlds, and how to add a character

## Status

Playable and tested end to end in a browser, on desktop and on a phone-sized
viewport in both orientations: campaign, deck building, Leaf Mode, Overdrive,
Versus against the AI and hotseat, codex, save/progress, and PWA install.

Not done yet, in rough priority order:

1. **Networked Versus.** The seams are in place (`Transport`, tick-stamped
   commands, determinism test, checksums); it needs a socket transport, empty
   turn messages, and a lobby. See [docs/MULTIPLAYER.md](docs/MULTIPLAYER.md).
2. **Native app-store builds.** Installing from the browser works today; the
   Tauri and Capacitor shells are written up in [docs/NATIVE.md](docs/NATIVE.md)
   but not built here — that needs a Rust toolchain and Xcode/Android Studio.
3. **Balance.** Tuned against the bot in `src/dev/simSmoke.ts`, not against
   humans. The late campaign in particular wants real playtesting.
4. **Music.** Sound effects are synthesised; there is no soundtrack.
