#!/usr/bin/env bash
# Builds the Chrome Web Store upload package.
# Ships only runtime files — no .DS_Store, no __MACOSX resource forks, no docs.
set -euo pipefail

cd "$(dirname "$0")"
VERSION=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
OUT="dist/anti-blur-${VERSION}.zip"

rm -rf dist build
mkdir -p dist build

cp manifest.json inject.js popup.html privacy-policy.html terms.html LICENSE build/
mkdir -p build/icons
cp icons/icon16.png icons/icon32.png icons/icon48.png icons/icon128.png build/icons/

# COPYFILE_DISABLE stops macOS writing ._ AppleDouble files into the archive.
( cd build && COPYFILE_DISABLE=1 zip -rq -X "../$OUT" . -x '.*' -x '__MACOSX/*' )
rm -rf build

echo "→ $OUT"
unzip -l "$OUT"
