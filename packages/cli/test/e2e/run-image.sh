#!/bin/bash
set -e

cd "$(dirname -- "$0")/../../"
echo "Changed directory to $(pwd)"

docker run --rm sap/ui5-cli/e2e-test
