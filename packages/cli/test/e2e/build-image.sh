#!/bin/bash
set -e

cd "$(dirname -- "$0")/../../"
echo "Changed directory to $(pwd)"

echo "Building image..."
docker build -t sap/ui5-cli/e2e-test -f test/e2e/Dockerfile .
echo "Done building image."

exit 0
