#!/usr/bin/env bash
set -euo pipefail

APP_PATH="${1:-}"
if [[ -z "$APP_PATH" ]]; then
  APP_PATH="$(find dist -maxdepth 2 -type d -name 'Cat Gatekeeper.app' -print -quit)"
fi

if [[ -z "$APP_PATH" || ! -d "$APP_PATH" ]]; then
  echo "Packaged Cat Gatekeeper app not found." >&2
  exit 1
fi

RESOURCES="$APP_PATH/Contents/Resources"
HELPER="$RESOURCES/bin/nowplaying-cli/nowplaying-cli"
DYLIB="$RESOURCES/bin/nowplaying-cli/build/mediaremote-mini/MediaRemoteMini.dylib"
LICENSE="$RESOURCES/licenses/nowplaying-cli/LICENSE"
SOURCE="$RESOURCES/licenses/nowplaying-cli/source/nowplaying-cli-8c8c1fa.tar.gz"

test -x "$HELPER"
test -f "$DYLIB"
test -f "$LICENSE"
test -s "$SOURCE"

# Verify the app's sealed resources and our additional native binaries
# separately. Electron Builder signs its nested Electron frameworks.
codesign --verify --strict --verbose=2 "$APP_PATH"
codesign --verify --strict --verbose=2 "$HELPER"
codesign --verify --strict --verbose=2 "$DYLIB"

echo "Verified packaged macOS app and bundled media helper."
