#!/usr/bin/env bash
#
# Prepares docdash for jsdoc generation by applying patches for VitePress-compatible Markdown output.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
PATCHES_DIR="$ROOT_DIR/jsdoc/patches"
TARGET_DIR="$ROOT_DIR/jsdoc/docdash"

log() { echo "[prepareDocdash] $1"; }
error() { echo "[prepareDocdash] ERROR: $1" >&2; exit 1; }

# Find docdash in node_modules (handles monorepo hoisting)
find_docdash() {
	local dir="$ROOT_DIR"
	while [[ "$dir" != "/" ]]; do
		[[ -d "$dir/node_modules/docdash" ]] && echo "$dir/node_modules/docdash" && return
		dir="$(dirname "$dir")"
	done
	return 1
}

DOCDASH_SOURCE=$(find_docdash) || error "docdash not found in node_modules. Run 'npm install' first."

log "Source: $DOCDASH_SOURCE"
log "Target: $TARGET_DIR"

# Clean and copy docdash
rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"
cp "$DOCDASH_SOURCE/publish.js" "$TARGET_DIR/"
cp -r "$DOCDASH_SOURCE/tmpl" "$TARGET_DIR/"
echo '{"type": "commonjs"}' > "$TARGET_DIR/package.json"
log "docdash copied successfully"

# Apply patch (git apply preferred, pre-patched file as fallback)
if git apply --directory=jsdoc/docdash "$PATCHES_DIR/publish.js.patch" 2>/dev/null; then
	log "Patch applied successfully using 'git apply'"
else
	error "Could not apply patch: git apply failed and no pre-patched file exists"
fi

# Replace templates with custom VitePress-compatible versions
rm -rf "$TARGET_DIR/tmpl"
cp -r "$PATCHES_DIR/tmpl" "$TARGET_DIR/"
log "Templates replaced successfully"

# Verify
[[ -f "$TARGET_DIR/publish.js" ]] || error "Verification failed: publish.js not found"
grep -q "githubSourceBaseUrl" "$TARGET_DIR/publish.js" || error "Verification failed: publish.js missing modifications"
grep -q "## " "$TARGET_DIR/tmpl/container.tmpl" || error "Verification failed: templates not VitePress-compatible"
log "Verification passed - docdash is ready for use"

log "docdash preparation completed successfully!"
