import { mkdirSync, copyFileSync, readdirSync } from 'fs';

mkdirSync('dist/extraction/wasm', { recursive: true });
readdirSync('src/extraction/wasm')
  .filter(f => f.endsWith('.wasm'))
  .forEach(f => copyFileSync(`src/extraction/wasm/${f}`, `dist/extraction/wasm/${f}`));
