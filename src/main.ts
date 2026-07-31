import { App } from './app/app';
import { MenuScreen } from './screens/menu';
import { BOARD, BOTTOM, cardRect, LAYOUT, toolRect, TRAY, VIEW } from './render/layout';

const canvas = document.getElementById('canvas') as HTMLCanvasElement | null;
if (!canvas) throw new Error('Missing #canvas element');

const app = new App(canvas);
app.setScreen(new MenuScreen(app));
app.start();

document.getElementById('boot')?.classList.add('hidden');

// Exposed deliberately: handy from devtools, and it is how the automated
// browser smoke test inspects live simulation state.
(window as unknown as { game: App }).game = app;
// Layout state, for the automated device-matrix screenshots.
(window as unknown as { hvvLayout: unknown }).hvvLayout = { VIEW, LAYOUT, BOARD, TRAY, BOTTOM, cardRect, toolRect };

// Offline play, and what makes this installable as a real app.
// `new URL('sw.js', document.baseURI)` is deliberate: a bare '/sw.js' 404s when
// the site is served from a project subpath, and `import.meta.url` would put
// the worker under /assets/ and collapse its scope to that directory.
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    const url = new URL('sw.js', document.baseURI);
    void navigator.serviceWorker.register(url, { scope: './' }).catch(() => {
      // Offline support is a bonus; the game runs fine without it.
    });
  });
}
