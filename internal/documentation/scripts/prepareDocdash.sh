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
cat > jsdoc/docdash/README.md << 'EOF'
This folder includes files from [docdash 2.0.2](https://github.com/clenemt/docdash/tree/bee5d0789068be6a1e01ce02968b23dd021b4fb6), which is a documentation template for JSDoc.

These files have been modified to change the output from HTML to Markdown, and to remove unnecessary features for our use case.

## Modifications by SAP
* Output Markdown instead of HTML (Modified all templates)
* Removed navbar functionality from publish.js
* Removed static files functionality from publish.js
* Modified js links to link to GitHub
* Modified internal linking

## Contributors

Thanks to [lodash](https://lodash.com) and [minami](https://github.com/nijikokun/minami).

## License
Licensed under the Apache License, version 2.0. (see [Apache-2.0](LICENSE.md)).
EOF
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