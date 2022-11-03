#!/bin/bash
set -e

# In npm 8 "npm prune" doesn't work as expected
echo "Creating backup of package.json"
mv package.json package.json.bak

echo "Removing devDependencies from package.json"
node <<- EOM
	const fs = require("fs");
	const pkg = JSON.parse(fs.readFileSync("package.json.bak", {encoding: "utf8"}));
	pkg.devDependencies = {};
	fs.writeFileSync("package.json", JSON.stringify(pkg, null, "\t"), {encoding: "utf8"});
EOM

echo "Pruning devDependencies..."
npm prune --omit=dev

echo "Updating npm-shrinkwrap.json..."
npm shrinkwrap

echo "Restoring original package.json"
rm package.json
mv package.json.bak package.json

echo "Creating npm package for local installation..."
npm pack
