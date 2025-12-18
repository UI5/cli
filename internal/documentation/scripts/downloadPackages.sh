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

main() {
	cd "$DOC_ROOT"
	echo "Changed directory to $(pwd)"

	download_packages
}

main "$@"
