/**
 * Bundles the headless simulation test with esbuild (already present as a Vite
 * dependency) and runs it in Node. Keeps the test written in normal project
 * TypeScript without adding a test-runner dependency.
 */
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'hvv-simtest-'));
const outfile = join(dir, 'simSmoke.mjs');

try {
  await build({
    entryPoints: ['src/dev/simSmoke.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    outfile,
    logLevel: 'warning',
  });
  await import(pathToFileURL(outfile).href);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
