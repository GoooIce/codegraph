/**
 * WASM file embedding for `bun build --compile`.
 *
 * Each `import … with { type: 'file' }` tells Bun's bundler to embed the
 * file into the compiled binary. At runtime the import resolves to a
 * `$bunfs/` path readable by `Bun.file()` / `fs.readFileSync` / tree-sitter's
 * `Language.load()`.
 *
 * This module is only imported by the compile entry point
 * (`src/bin/codegraph-compile.ts`); dev/Node mode never touches it.
 */

// Vendored grammars (shipped in src/extraction/wasm/ — custom builds that
// fix ABI incompatibilities in the tree-sitter-wasms package).
// @ts-ignore — Bun file import attribute
import wasmLua from './wasm/tree-sitter-lua.wasm' with { type: 'file' };
// @ts-ignore
import wasmLuau from './wasm/tree-sitter-luau.wasm' with { type: 'file' };
// @ts-ignore
import wasmPascal from './wasm/tree-sitter-pascal.wasm' with { type: 'file' };
// @ts-ignore
import wasmScala from './wasm/tree-sitter-scala.wasm' with { type: 'file' };

// tree-sitter-wasms grammars (from node_modules).
// @ts-ignore
import wasmC from 'tree-sitter-wasms/out/tree-sitter-c.wasm' with { type: 'file' };
// @ts-ignore
import wasmCpp from 'tree-sitter-wasms/out/tree-sitter-cpp.wasm' with { type: 'file' };
// @ts-ignore
import wasmCSharp from 'tree-sitter-wasms/out/tree-sitter-c_sharp.wasm' with { type: 'file' };
// @ts-ignore
import wasmDart from 'tree-sitter-wasms/out/tree-sitter-dart.wasm' with { type: 'file' };
// @ts-ignore
import wasmGo from 'tree-sitter-wasms/out/tree-sitter-go.wasm' with { type: 'file' };
// @ts-ignore
import wasmJava from 'tree-sitter-wasms/out/tree-sitter-java.wasm' with { type: 'file' };
// @ts-ignore
import wasmJavaScript from 'tree-sitter-wasms/out/tree-sitter-javascript.wasm' with { type: 'file' };
// @ts-ignore
import wasmKotlin from 'tree-sitter-wasms/out/tree-sitter-kotlin.wasm' with { type: 'file' };
// @ts-ignore
import wasmObjc from 'tree-sitter-wasms/out/tree-sitter-objc.wasm' with { type: 'file' };
// @ts-ignore
import wasmPhp from 'tree-sitter-wasms/out/tree-sitter-php.wasm' with { type: 'file' };
// @ts-ignore
import wasmPython from 'tree-sitter-wasms/out/tree-sitter-python.wasm' with { type: 'file' };
// @ts-ignore
import wasmRuby from 'tree-sitter-wasms/out/tree-sitter-ruby.wasm' with { type: 'file' };
// @ts-ignore
import wasmRust from 'tree-sitter-wasms/out/tree-sitter-rust.wasm' with { type: 'file' };
// @ts-ignore
import wasmSwift from 'tree-sitter-wasms/out/tree-sitter-swift.wasm' with { type: 'file' };
// @ts-ignore
import wasmTsx from 'tree-sitter-wasms/out/tree-sitter-tsx.wasm' with { type: 'file' };
// @ts-ignore
import wasmTypeScript from 'tree-sitter-wasms/out/tree-sitter-typescript.wasm' with { type: 'file' };

/**
 * Maps WASM filename → embedded `$bunfs/` path.
 * Used by `wasm-paths.ts` when `CODEGRAPH_COMPILED=1`.
 */
export const wasmPaths: ReadonlyMap<string, string> = new Map([
  ['tree-sitter-c.wasm', wasmC],
  ['tree-sitter-cpp.wasm', wasmCpp],
  ['tree-sitter-c_sharp.wasm', wasmCSharp],
  ['tree-sitter-dart.wasm', wasmDart],
  ['tree-sitter-go.wasm', wasmGo],
  ['tree-sitter-java.wasm', wasmJava],
  ['tree-sitter-javascript.wasm', wasmJavaScript],
  ['tree-sitter-kotlin.wasm', wasmKotlin],
  ['tree-sitter-lua.wasm', wasmLua],
  ['tree-sitter-luau.wasm', wasmLuau],
  ['tree-sitter-objc.wasm', wasmObjc],
  ['tree-sitter-pascal.wasm', wasmPascal],
  ['tree-sitter-php.wasm', wasmPhp],
  ['tree-sitter-python.wasm', wasmPython],
  ['tree-sitter-ruby.wasm', wasmRuby],
  ['tree-sitter-rust.wasm', wasmRust],
  ['tree-sitter-scala.wasm', wasmScala],
  ['tree-sitter-swift.wasm', wasmSwift],
  ['tree-sitter-tsx.wasm', wasmTsx],
  ['tree-sitter-typescript.wasm', wasmTypeScript],
]);
