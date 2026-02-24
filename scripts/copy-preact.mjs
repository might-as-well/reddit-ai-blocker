import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const src = resolve(process.cwd(), 'node_modules/preact/dist/preact.umd.js');
const outDir = resolve(process.cwd(), 'dist');
const out = resolve(outDir, 'preact.js');

mkdirSync(outDir, { recursive: true });

if (existsSync(src)) {
  copyFileSync(src, out);
  process.stdout.write('Copied preact runtime to dist/preact.js\n');
} else {
  process.stderr.write('preact runtime not found at node_modules/preact/dist/preact.umd.js. Run npm install.\n');
  process.exit(1);
}
