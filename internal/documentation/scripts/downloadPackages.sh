#!/bin/bash
set -euo pipefail

# Constants
readonly UI5_CLI_PACKAGES_VERSION="next"
UI5_CLI_PACKAGES=()
while IFS= read -r pkg; do
	UI5_CLI_PACKAGES+=("$pkg")
done < <(find ../../packages/*/package.json -exec jq -r '.name' {} \;)

# Directories
SCRIPT_DIR="$(dirname -- "$0")"
readonly SCRIPT_DIR
readonly DOC_ROOT="${SCRIPT_DIR}/.."
readonly TMP_PACKAGES_DIR="./tmp/packages"

# Functions
extract_package_file_name() {
	local package="$1"

	# Remove "@" from scoped package names
	local package_file_name="${package#@}"

	# Replace "/" with "-" for file name
	package_file_name="${package_file_name//\//-}"

	echo "$package_file_name"
}

download_packages() {
	echo "Downloading UI5 CLI packages for JSDoc / JSON Schema generation..."

	mkdir -p "$TMP_PACKAGES_DIR"

	for package in "${UI5_CLI_PACKAGES[@]}"; do
		echo "Downloading and extracting $package..."
		npm pack "$package@$UI5_CLI_PACKAGES_VERSION" --workspaces false --quiet --pack-destination "$TMP_PACKAGES_DIR"
		local package_file_name
		package_file_name="$(extract_package_file_name "$package")"
		rm -rf "$TMP_PACKAGES_DIR/${package:?}"
		mkdir -p "$TMP_PACKAGES_DIR/${package}"
		tar -xzf "$TMP_PACKAGES_DIR/${package_file_name}"-*.tgz --strip-components=1 -C "$TMP_PACKAGES_DIR/${package}"
		rm "$TMP_PACKAGES_DIR/${package_file_name}"-*.tgz
	done
}

# Remove $id from downloaded JSON schema files.
# Since v15, @apidevtools/json-schema-ref-parser honors $id as the base URI for $ref resolution.
# Published @ui5/project versions may still carry legacy non-resolvable $id URLs (http://ui5.sap/...),
# which would make buildSchema.js' bundle() attempt to fetch them over the network (ENOTFOUND) instead
# of resolving $ref against the file system layout. Stripping $id here keeps the downloaded documents
# bundleable regardless of the published version, without touching the (already fixed) local sources.
strip_schema_ids() {
	local schema_dir="$TMP_PACKAGES_DIR/@ui5/project/lib/validation/schema"

	[ -d "$schema_dir" ] || return 0

	echo "Stripping \$id from downloaded schema files in $schema_dir..."
	find "$schema_dir" -name '*.json' -print0 | while IFS= read -r -d '' schema_file; do
		local tmp_file
		tmp_file="$(mktemp)"
		jq 'del(.. | .["$id"]?)' "$schema_file" > "$tmp_file" && mv "$tmp_file" "$schema_file"
	done
}

main() {
	cd "$DOC_ROOT"
	echo "Changed directory to $(pwd)"

	download_packages
	strip_schema_ids
}

main "$@"
