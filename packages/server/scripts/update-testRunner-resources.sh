#!/bin/bash

set -e

# Go to project root
cd "$(dirname -- "$0")/.."

# Download latest files
cd lib/middleware/testRunner
curl -L -O https://github.com/SAP/openui5/raw/master/src/sap.ui.core/test/sap/ui/qunit/TestRunner.js
curl -L -O https://github.com/SAP/openui5/raw/master/src/sap.ui.core/test/sap/ui/qunit/testrunner.css
curl -L -O https://github.com/SAP/openui5/raw/master/src/sap.ui.core/test/sap/ui/qunit/testrunner.html

# Check if there are updates
git diff --quiet && echo "No updates. Exiting..." && exit 0

# Get latest commit url for src/sap.ui.core/test/sap/ui/qunit path
COMMIT_URL=$(curl "https://api.github.com/repos/SAP/openui5/commits?sha=master&path=src/sap.ui.core/test/sap/ui/qunit" | \
node -r fs -e "process.stdout.write(JSON.parse(fs.readFileSync(\"/dev/stdin\", \"utf8\"))[0].html_url)")

echo "Creating new commit..."

# Add changes and create commit
git add .
git commit \
-m "[FIX] middleware/testRunner: Update resources from OpenUI5" \
-m "Based on:
$COMMIT_URL"
