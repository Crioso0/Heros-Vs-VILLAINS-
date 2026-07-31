# Shipping native — desktop and mobile

The game is deliberately built so that "make it a native app" is a packaging
step, not a port. This document explains why, and what the actual steps are.

**Status: the web build is done and tested. The native shells below are
documented and configured but have not been built here** — building them needs a
Rust toolchain (desktop) and Xcode/Android Studio (mobile), which this
environment does not have. Nothing in the game code needs to change for either.

## Why it ports cleanly

- **One canvas, one loop.** No DOM UI, no CSS layout, no framework. The entire
  interface is drawn into a single `<canvas>`.
- **Fixed logical resolution.** Everything is authored at 1280×720 and scaled
  and letterboxed to the real window in `src/app/app.ts`. A phone, a tablet and
  a 4K monitor all get the same layout.
- **Pointer events only.** Mouse and touch are normalised into one pointer, so
  touch input already works — no separate mobile input path.
- **No external assets.** Every character, backdrop and sound is generated at
  runtime. The whole build is ~120 KB of JavaScript (~39 KB gzipped) and one
  HTML file. Nothing to bundle, nothing to license, no download on first launch.
- **Relative base path.** `vite.config.ts` sets `base: './'` so the built
  `dist/` works from a `file://` origin, which is how both native shells load it.
- **Storage is behind one module.** All persistence goes through
  `src/game/progress.ts`. Swapping `localStorage` for a native file or
  preferences store is a change in that one file.

## Desktop — Tauri

Tauri wraps the built `dist/` in the platform's own webview. The result is a
~5 MB binary rather than the ~100 MB an Electron build would produce, which
matters for a game whose payload is 120 KB.

```bash
npm install -D @tauri-apps/cli
npx tauri init          # answer: dist dir = ../dist, dev url = http://localhost:5173
npm run build
npx tauri build         # produces .exe / .app / .AppImage
```

`src-tauri/tauri.conf.json` wants roughly:

```json
{
  "build": {
    "beforeBuildCommand": "npm run build",
    "beforeDevCommand": "npm run dev",
    "devPath": "http://localhost:5173",
    "distDir": "../dist"
  },
  "tauri": {
    "windows": [{
      "title": "Heroes vs Villains",
      "width": 1280, "height": 720,
      "minWidth": 960, "minHeight": 540,
      "resizable": true, "fullscreen": false
    }],
    "allowlist": { "all": false }
  }
}
```

Keep the allowlist empty — the game needs no filesystem, shell or network
permissions. Add only `fs` scoped to the app data directory if you move saves
off `localStorage`.

**Electron is the fallback** if a Rust toolchain is a problem: same `dist/`,
`loadFile('dist/index.html')`, much larger binary.

## Mobile — Capacitor

```bash
npm install @capacitor/core @capacitor/cli
npx cap init "Heroes vs Villains" com.example.heroesvsvillains --web-dir=dist
npm run build
npx cap add ios && npx cap add android
npx cap sync
npx cap open android   # or ios
```

`capacitor.config.json`:

```json
{
  "appId": "com.example.heroesvsvillains",
  "appName": "Heroes vs Villains",
  "webDir": "dist",
  "android": { "backgroundColor": "#06070f" },
  "ios": { "contentInset": "always", "backgroundColor": "#06070f" }
}
```

Things already handled in `index.html` that mobile needs: `viewport-fit=cover`
for notches, `user-scalable=no` and `touch-action: none` so the board does not
pan or zoom under a drag, `overscroll-behavior: none` to kill rubber-banding,
and a dark `theme-color`.

Remaining mobile-specific work, in rough priority order:

1. **Lock to landscape** in the platform manifests. The 1280×720 layout is
   landscape-only; portrait letterboxes to something unusably small.
2. **Audio unlock.** `sfx.resume()` is already called on the first pointer down,
   which satisfies iOS. Verify on a real device.
3. **Safe-area insets.** The HUD sits close to the screen edges. Read
   `env(safe-area-inset-*)` and pad the letterbox offset in `App.resize()`.
4. **Touch targets.** Cards are 78×106 logical pixels — fine on a phone at
   landscape scale, but worth a pass on a small device.
5. **Battery.** Consider capping the render loop at 30 fps on mobile; the
   simulation is already decoupled at a fixed 60 Hz and will not change speed.

## Performance notes

The heavy costs in a canvas game of this kind are per-frame allocation and
per-frame repaint of static art. Both are already addressed: backdrops are
painted once per world into an offscreen canvas and blitted, the particle layer
is hard-capped, and the simulation runs a fixed number of steps per frame with a
death-spiral guard for slow devices. `FxLayer` and the `reducedFx` setting in
the save data are the levers to pull if a low-end device struggles.
