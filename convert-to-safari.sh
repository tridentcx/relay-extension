#!/bin/bash
# Converts Relay into a Safari Web Extension.
# Requires: macOS, Xcode 13+
# Run from inside the relay/ folder.

set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
BUNDLE="com.yourname.relay"   # ← change this

command -v xcrun &>/dev/null || { echo "❌ Install Xcode first."; exit 1; }

xcrun safari-web-extension-converter "$DIR" \
  --project-location "$DIR/../relay-safari" \
  --app-name "Relay" \
  --bundle-identifier "$BUNDLE" \
  --swift --no-prompt

echo "✅ Done. Open relay-safari/*.xcodeproj in Xcode → ⌘R → enable in Safari Settings → Extensions"
