#!/bin/sh
#
# CodeGraph standalone installer.
#
# Downloads a self-contained Bun-compiled binary from GitHub Releases.
# No runtime dependencies — the binary includes the Bun/JavaScriptCore runtime,
# all WASM grammars, and the full application.
#
#   curl -fsSL https://raw.githubusercontent.com/GoooIce/codegraph/main/install.sh | sh
#
# Upgrade:   re-run the same command.
# Uninstall: curl -fsSL .../install.sh | sh -s -- --uninstall
#
# Environment:
#   CODEGRAPH_VERSION      release tag to install (default: latest)
#   CODEGRAPH_INSTALL_DIR  bundle location   (default: ~/.codegraph)
#   CODEGRAPH_BIN_DIR      symlink location  (default: ~/.local/bin)
set -eu

REPO="GoooIce/codegraph"
INSTALL_DIR="${CODEGRAPH_INSTALL_DIR:-$HOME/.codegraph}"
BIN_DIR="${CODEGRAPH_BIN_DIR:-$HOME/.local/bin}"

if [ "${1:-}" = "--uninstall" ]; then
  rm -f "$BIN_DIR/codegraph"
  rm -rf "$INSTALL_DIR"
  echo "CodeGraph uninstalled (removed $INSTALL_DIR and $BIN_DIR/codegraph)."
  exit 0
fi

# 1. Detect platform → target triple matching the release binaries.
os="$(uname -s)"
arch="$(uname -m)"
case "$os" in
  Darwin) os="darwin" ;;
  Linux)  os="linux" ;;
  *) echo "codegraph: unsupported OS '$os'." >&2; exit 1 ;;
esac
case "$arch" in
  arm64|aarch64) arch="arm64" ;;
  x86_64|amd64)  arch="x64" ;;
  *) echo "codegraph: unsupported architecture '$arch'." >&2; exit 1 ;;
esac
target="${os}-${arch}"

# 2. Resolve the version (latest release unless pinned).
version="${CODEGRAPH_VERSION:-}"
if [ -z "$version" ]; then
  version="$(curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest" \
    | sed -n 's#.*/releases/tag/##p')"
fi
if [ -z "$version" ]; then
  version="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
    | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n1)"
fi
[ -n "$version" ] || { echo "codegraph: could not resolve latest version; set CODEGRAPH_VERSION (e.g. CODEGRAPH_VERSION=v0.9.4)." >&2; exit 1; }
case "$version" in v*) ;; *) version="v$version" ;; esac

# 3. Download the binary.
url="https://github.com/$REPO/releases/download/$version/codegraph-${target}"
echo "Installing CodeGraph $version ($target)..."
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL "$url" -o "$tmp/codegraph" || { echo "codegraph: download failed: $url" >&2; exit 1; }
chmod +x "$tmp/codegraph"

# 4. Install binary and create symlink.
dest="$INSTALL_DIR/versions/$version"
rm -rf "$dest"
mkdir -p "$dest"
mv "$tmp/codegraph" "$dest/codegraph"

mkdir -p "$BIN_DIR"
ln -sf "$dest/codegraph" "$BIN_DIR/codegraph"
ln -sfn "$dest" "$INSTALL_DIR/current"

echo "Installed to $dest/codegraph"
echo "Linked     $BIN_DIR/codegraph"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    echo ""
    echo "$BIN_DIR is not on your PATH. Add it:"
    echo "  export PATH=\"$BIN_DIR:\$PATH\""
    ;;
esac
echo ""
echo "Done. Run: codegraph --help"
