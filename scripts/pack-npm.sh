#!/usr/bin/env bash
#
# Assemble the npm thin-installer packages from built Bun-compiled binaries.
#
# Produces, under release/npm/:
#   codegraph-<target>/   one per built binary — the standalone executable,
#                         tagged with os/cpu so npm installs only the matching one.
#   main/                 the @colbymchenry/codegraph shim package: a tiny bin
#                         that execs the matching platform binary, with every
#                         platform package in optionalDependencies.
#
# The release pipeline then `npm publish`es each dir.
#
# Prereq: run build-bun-compile.sh for each target first (release/codegraph-<target>[.exe]).
# Usage:  scripts/pack-npm.sh [version]    (default: version from package.json)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${1:-$(node -p "require('$ROOT/package.json').version")}"
SCOPE="@colbymchenry"
REL="$ROOT/release"
NPM="$REL/npm"

rm -rf "$NPM"
mkdir -p "$NPM/main"

shopt -s nullglob
binaries=("$REL"/codegraph-darwin-* "$REL"/codegraph-linux-* "$REL"/codegraph-windows-*)
[ ${#binaries[@]} -gt 0 ] || { echo "[pack-npm] no binaries in $REL — run build-bun-compile.sh first" >&2; exit 1; }

targets=()
for binary in "${binaries[@]}"; do
  fname="$(basename "$binary")"
  # codegraph-darwin-arm64 or codegraph-windows-x64.exe
  base="${fname%.exe}"
  target="${base#codegraph-}"             # darwin-arm64 / win32-x64
  os="${target%-*}"                       # darwin | linux | windows
  arch="${target##*-}"                    # arm64 | x64
  pkgdir="$NPM/codegraph-${target}"
  mkdir -p "$pkgdir/bin"
  cp "$binary" "$pkgdir/bin/codegraph${fname##$base}"
  chmod +x "$pkgdir/bin/codegraph${fname##$base}"

  node -e '
    const fs=require("fs");
    const osMap = { darwin: "darwin", linux: "linux", windows: "win32" };
    fs.writeFileSync(process.argv[1], JSON.stringify({
      name: `${process.env.SCOPE}/codegraph-${process.env.TARGET}`,
      version: process.env.VERSION,
      description: `CodeGraph standalone binary for ${process.env.TARGET}`,
      os: [osMap[process.env.OSV]], cpu: [process.env.ARCHV],
      files: ["bin"],
      license: "MIT"
    }, null, 2) + "\n");
  ' "$pkgdir/package.json"
  targets+=("$target")
  echo "[pack-npm] ${SCOPE}/codegraph-${target}@${VERSION}"
done

# Main shim package.
cp "$ROOT/scripts/npm-shim.js" "$NPM/main/npm-shim.js"
[ -f "$ROOT/README.md" ] && cp "$ROOT/README.md" "$NPM/main/README.md"
node -e '
  const fs=require("fs");
  const opt={};
  for (const t of process.env.TARGETS.split(/\s+/).filter(Boolean))
    opt[`${process.env.SCOPE}/codegraph-${t}`]=process.env.VERSION;
  fs.writeFileSync(process.argv[1], JSON.stringify({
    name: `${process.env.SCOPE}/codegraph`,
    version: process.env.VERSION,
    description: "Local-first code intelligence for AI agents (MCP). Self-contained Bun-compiled binary — no runtime dependencies.",
    bin: { codegraph: "npm-shim.js" },
    optionalDependencies: opt,
    files: ["npm-shim.js","README.md"],
    license: "MIT"
  }, null, 2) + "\n");
' "$NPM/main/package.json"

echo "[pack-npm] ${SCOPE}/codegraph@${VERSION} (${#targets[@]} platform packages in optionalDependencies)"
echo "[pack-npm] output: $NPM"
