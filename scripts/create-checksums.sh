#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-}"
if [[ -z "$TARGET" || ! -f "$TARGET" ]]; then
  echo "Usage: scripts/create-checksums.sh /path/to/relay-extension-stable-vX.Y.Z.zip" >&2
  exit 1
fi

DIR="$(cd "$(dirname "$TARGET")" && pwd)"
FILE="$(basename "$TARGET")"

(
  cd "$DIR"
  shasum -a 256 "$FILE" > SHA256SUMS.txt
)

echo "Created $DIR/SHA256SUMS.txt"
