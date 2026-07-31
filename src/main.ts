import { App } from './app/app';
import { MenuScreen } from './screens/menu';

const canvas = document.getElementById('canvas') as HTMLCanvasElement | null;
if (!canvas) throw new Error('Missing #canvas element');

const app = new App(canvas);
app.setScreen(new MenuScreen(app));
app.start();

document.getElementById('boot')?.classList.add('hidden');

// Exposed deliberately: handy from devtools, and it is how the automated
// browser smoke test inspects live simulation state.
(window as unknown as { game: App }).game = app;
