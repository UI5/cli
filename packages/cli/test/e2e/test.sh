#!/bin/bash
set -e

VERSION=$(node -e 'process.stdout.write(require("/home/node/e2e/ui5-cli/package.json").version)')
CLI_PACKAGE="/home/node/e2e/ui5-cli/ui5-cli-$VERSION.tgz"

# Install CLI globally
echo "Installing @ui5/cli v$VERSION globally..."
npm i -g "$CLI_PACKAGE"

echo "Creating test application project..."
mkdir application && cd application
npm init --yes

echo "ui5 --version"
ui5 --version

echo "ui5 versions"
ui5 versions

echo "Creating webapp folder..."
mkdir -p webapp

echo ""
echo "Creating dummy webapp/manifest.json file..."
echo "{ \"sap.app\": { \"id\": \"ui5.cli.e2e.test.application\" } }" > webapp/manifest.json

echo ""
echo "Initializing ui5 project..."
ui5 init

echo "Adding @ui5/cli v$VERSION as project devDependency..."
npm i -D "$CLI_PACKAGE"

echo ""
echo "Invoking local installation via global command..."
LOCAL_UI5_VERSION=$(ui5 --version)
echo "$LOCAL_UI5_VERSION"

EXPECTED_BIN_PATH=$(node -e 'process.stdout.write(require.resolve("@ui5/cli/bin/ui5.js"))')
EXPECTED_LOCAL_UI5_VERSION="INFO: Using local @ui5/cli installation

$VERSION (from $EXPECTED_BIN_PATH)"

if [ "$LOCAL_UI5_VERSION" != "$EXPECTED_LOCAL_UI5_VERSION" ]; then
	echo ""
	echo "ERROR: Failed to invoke local installation"
	echo "Expected output:"
	echo "$EXPECTED_LOCAL_UI5_VERSION"
	exit 1
fi
