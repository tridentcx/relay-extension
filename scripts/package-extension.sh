#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION="$(node -e "console.log(require('./manifest.json').version)")"
CHANNEL="${RELAY_CHANNEL:-stable}"
case "$CHANNEL" in
  stable) ;;
  *) echo "Unsupported release channel: $CHANNEL. Relay uses stable only." >&2; exit 1 ;;
esac
OUT_DIR="${RELAY_OUTPUT_DIR:-${TMPDIR:-/tmp}/relay-extension-builds}"
mkdir -p "$OUT_DIR"
OUT_FILE="$OUT_DIR/relay-extension-$CHANNEL-v$VERSION.zip"
rm -f "$OUT_FILE"

FILES=(
  manifest.json \
  background.js \
  config.js \
  crypto.js \
  sync.js \
  popup.html \
  popup-loader.js \
  popup.js \
  config.json \
  icons/icon16.png \
  icons/icon48.png \
  icons/icon128.png
)

zip -r "$OUT_FILE" "${FILES[@]}" -x '*.DS_Store'

echo "Created $OUT_FILE"
