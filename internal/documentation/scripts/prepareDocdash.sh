#!/usr/bin/env bash
#
# Prepares docdash for jsdoc generation by applying patches for VitePress-compatible Markdown output.
#
set -euo pipefail

DOCDASH_PATH="$(npm list docdash --parseable)"
DOCDASH_DESTINATION="jsdoc/docdash"

cp -R "jsdoc/patches/tmpl" "$DOCDASH_DESTINATION/tmpl"
cp "$DOCDASH_PATH/publish.js" "$DOCDASH_DESTINATION/"

git apply jsdoc/patches/publish.js.patch