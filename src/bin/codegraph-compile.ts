/**
 * Compile entry point for `bun build --compile`.
 *
 * This file is only used when building the standalone binary. It:
 * 1. Sets CODEGRAPH_COMPILED so wasm-paths.ts uses embedded file paths
 * 2. Imports wasm-embed.ts to trigger static embedding of all .wasm files
 * 3. Statically imports packages that are dynamically loaded at runtime
 *    (bun build --compile only bundles statically-reachable modules)
 * 4. Delegates to the real CLI entry point
 *
 * Dev/Node mode uses src/bin/codegraph.ts directly — this file is never imported.
 */

// Must be set before any module that reads it gets imported.
process.env.CODEGRAPH_COMPILED = '1';

// Import the embed module to trigger `with { type: 'file' }` static analysis.
// The bundler will embed all referenced .wasm files into the binary.
import '../extraction/wasm-embed';

// Force-bundle packages that are only reachable via dynamic import()
// (the codebase uses new Function('specifier', 'return import(specifier)') to
// dodge CJS rewrite, which hides them from bun's static analysis).
import '@clack/prompts';

// Delegate to the real CLI.
import './codegraph';
