#!/usr/bin/env bash
set -euo pipefail

UPSTREAM_URL="https://github.com/kirtan-shah/nowplaying-cli.git"
UPSTREAM_REV="8c8c1fa4820681fd4bbd6a17ce0a5655e1f4ebe7"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCH="$(uname -m)"

case "$ARCH" in
  arm64) OUTPUT_ARCH="arm64" ;;
  x86_64) OUTPUT_ARCH="x64" ;;
  *)
    echo "Unsupported macOS architecture: $ARCH" >&2
    exit 1
    ;;
esac

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

git clone --filter=blob:none --no-checkout "$UPSTREAM_URL" "$WORK_DIR/nowplaying-cli"
git -C "$WORK_DIR/nowplaying-cli" fetch --depth 1 origin "$UPSTREAM_REV"
git -C "$WORK_DIR/nowplaying-cli" checkout --detach FETCH_HEAD
make -C "$WORK_DIR/nowplaying-cli"

OUTPUT_DIR="$ROOT_DIR/vendor/nowplaying-cli/darwin-$OUTPUT_ARCH"
SOURCE_DIR="$ROOT_DIR/vendor/nowplaying-cli/source"
mkdir -p "$OUTPUT_DIR/build/mediaremote-mini" "$OUTPUT_DIR/scripts" "$SOURCE_DIR"

cp "$WORK_DIR/nowplaying-cli/nowplaying-cli" "$OUTPUT_DIR/nowplaying-cli"
cp "$WORK_DIR/nowplaying-cli/build/mediaremote-mini/MediaRemoteMini.dylib" "$OUTPUT_DIR/build/mediaremote-mini/MediaRemoteMini.dylib"
cp "$WORK_DIR/nowplaying-cli/scripts/mediaremote-mini.pl" "$OUTPUT_DIR/scripts/mediaremote-mini.pl"
cp "$WORK_DIR/nowplaying-cli/LICENSE" "$ROOT_DIR/vendor/nowplaying-cli/LICENSE"
chmod 755 "$OUTPUT_DIR/nowplaying-cli" "$OUTPUT_DIR/scripts/mediaremote-mini.pl"

git -C "$WORK_DIR/nowplaying-cli" archive \
  --format=tar.gz \
  --output="$SOURCE_DIR/nowplaying-cli-${UPSTREAM_REV:0:7}.tar.gz" \
  "$UPSTREAM_REV"

echo "Built nowplaying-cli $UPSTREAM_REV for $OUTPUT_ARCH"
