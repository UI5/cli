#!/usr/bin/env bash
set -e

# Generate JSDoc documentation
npm run jsdoc-generate

cd ./dist/api

# Files to exclude from conversion
EXCLUDE_FILES=("globals.html" "index.html")

# Convert all HTML files to Markdown recursively
find . -type f -name "*.html" | while read -r htmlfile; do
    basename=$(basename "$htmlfile")
    
    # Skip excluded files
    if printf '%s\n' "${EXCLUDE_FILES[@]}" | grep -qx "$basename"; then
        echo "Skipping: $htmlfile"
        continue
    fi
    
    echo "Converting: $htmlfile"
    npx @wcj/html-to-markdown-cli ./dist/api/"$htmlfile" --output ./docs/api
done
