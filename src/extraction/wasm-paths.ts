/**
 * WASM path resolution — routes to the correct strategy based on runtime context.
 *
 * - Compiled binary (`CODEGRAPH_COMPILED=1`): uses embedded `$bunfs/` paths
 *   from wasm-embed.ts
 * - Dev / Node mode: uses existing `__dirname` + `require.resolve` logic
 */

import * as path from 'path';

/**
 * Resolve the filesystem path to a WASM grammar file.
 *
 * Must be called lazily (inside a function, not at module scope) so the
 * CODEGRAPH_COMPILED env var is set before this code runs.
 */
export function getWasmPath(lang: string, wasmFile: string): string {
  if (process.env.CODEGRAPH_COMPILED === '1') {
    // Dynamic import to avoid loading the embed module in dev mode
    // (it uses `with { type: 'file' }` which is Bun-compile-specific).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { wasmPaths } = require('./wasm-embed') as { wasmPaths: Map<string, string> };
    const embedded = wasmPaths.get(wasmFile);
    if (embedded) return embedded;
    throw new Error(`[CodeGraph] No embedded WASM for ${wasmFile} (language: ${lang})`);
  }

  // Dev / Node mode: original path resolution
  const isVendored = lang === 'pascal' || lang === 'scala' || lang === 'lua' || lang === 'luau';
  if (isVendored) {
    return path.join(__dirname, 'wasm', wasmFile);
  }
  return require.resolve(`tree-sitter-wasms/out/${wasmFile}`);
}
