#!/usr/bin/env bash
#
# Prepares docdash for jsdoc generation by applying patches for VitePress-compatible Markdown output.
#
set -o pipefail

DOCDASH_PATH="$(npm list docdash --parseable)"
DOCDASH_DESTINATION="jsdoc/docdash"

echo "Preparing docdash for jsdoc generation"
echo ""
echo "Docdash Path: $DOCDASH_PATH"
echo "Docdash Destination: $DOCDASH_DESTINATION"
echo "Current Directory: $(pwd)"
echo ""

echo ""
echo "Clearing docdash destination folder"
rm -R "$DOCDASH_DESTINATION" -v

echo ""
echo "Copying docdash to destination"
cp -Rv "$DOCDASH_PATH" "$DOCDASH_DESTINATION"

echo ""
echo "Clearing stock docdash templates"
rm -Rv "$DOCDASH_DESTINATION/tmpl"

echo ""
echo "Copying modified templates to docdash"
cp -Rv "jsdoc/patches/tmpl" "$DOCDASH_DESTINATION/tmpl"
cp -v "$DOCDASH_PATH/publish.js" "$DOCDASH_DESTINATION/"
cat > jsdoc/docdash/package.json << 'EOF'
{
	"type": "commonjs"
}
EOF

echo ""
echo "Removing unneeded files from docdash"
rm -Rv $DOCDASH_DESTINATION/static

echo ""
echo "Applying patches to docdash"
git apply jsdoc/patches/publish.js.patch