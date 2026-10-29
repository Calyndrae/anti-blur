#!/usr/bin/env bash
# Builds the shipping package — the one the Pioneering Hub delivers, not a Web Store
# upload. See PUBLISHING.md's header for why that route is not taken.
# Ships only runtime files — no .DS_Store, no __MACOSX resource forks, no docs.
# terms.html and privacy-policy.html are runtime files: the popup footer links to them.
set -euo pipefail

cd "$(dirname "$0")"
VERSION=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
OUT="dist/anti-blur-${VERSION}.zip"

rm -rf dist build
mkdir -p dist build

cp manifest.json inject.js background.js popup.html popup.js privacy-policy.html terms.html LICENSE build/
mkdir -p build/icons build/fonts
cp icons/icon16.png icons/icon32.png icons/icon48.png icons/icon128.png build/icons/
# The popup's faces. They were referenced by popup.html and never copied, so
# every shipped popup fell back to the system font without a word.
cp fonts/*.woff2 build/fonts/

# COPYFILE_DISABLE stops macOS writing ._ AppleDouble files into the archive.
( cd build && COPYFILE_DISABLE=1 zip -rq -X "../$OUT" . -x '.*' -x '__MACOSX/*' )
rm -rf build

echo "→ $OUT"
unzip -l "$OUT"
