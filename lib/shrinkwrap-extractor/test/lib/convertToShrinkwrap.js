import path from "node:path";
import {readFile, mkdir, writeFile, unlink} from "node:fs/promises";
import convertPackageLockToShrinkwrap from "../../lib/convertPackageLockToShrinkwrap.js";
import {test} from "node:test";
import assert from "node:assert";
import {mock} from "node:test";
import pacote from "pacote";

// Mock data for package manifests to prevent actual npm registry requests
function setupPacoteMock() {
	return mock.method(pacote, "manifest", async (spec) => {
		return {
			dist: {
				tarball: "https://registry.npmjs.org/package/version.tgz",
				integrity: "sha512-mock-integrity-hash"
			}
		};
	});
}

test("Convert package-lock.json to shrinkwrap", async (t) => {
	const __dirname = import.meta.dirname;

	const cwd = path.join(__dirname, "..", "fixture", "project.a");
	const targetPackageName = "@ui5/cli";
	const shrinkwrapJson = await convertPackageLockToShrinkwrap(cwd, targetPackageName);

	// Basic structure validation
	assert.equal(shrinkwrapJson.name, "@ui5/cli");
	assert.equal(shrinkwrapJson.version, "4.0.34");
	assert.equal(shrinkwrapJson.lockfileVersion, 3);
	assert.equal(shrinkwrapJson.requires, true);
	assert.ok(shrinkwrapJson.packages);

	// Verify root package entry
	const rootPackage = shrinkwrapJson.packages[""];
	assert.ok(rootPackage);
	assert.equal(rootPackage.name, "@ui5/cli");
	assert.equal(rootPackage.version, "4.0.34");
	assert.ok(rootPackage.dependencies);

	// Verify workspace packages are resolved to registry-like URLs
	const builderDep = shrinkwrapJson.packages["node_modules/@ui5/builder"];
	assert.ok(builderDep?.resolved, "Builder dependency should have a resolved URL");
	assert.equal(builderDep.version, "4.1.1");
	assert.ok(builderDep.resolved.startsWith("https://registry.npmjs.org/"));
	// Check that it contains the scoped package name (registry URLs use unencoded form)
	assert.ok(builderDep.resolved.includes("@ui5/builder"));
	// Verify integrity is present from registry metadata
	assert.ok(builderDep.integrity, "Builder dependency should have integrity from registry");

	// Verify regular dependencies have proper structure
	const chalkDep = shrinkwrapJson.packages["node_modules/chalk"];
	assert.ok(chalkDep);
	assert.equal(chalkDep.version, "5.6.2");
	const yargsDep = shrinkwrapJson.packages["node_modules/yargs"];
	assert.ok(yargsDep);
	assert.equal(yargsDep.version, "17.7.2");

	// Verify only production dependencies are included (no devDependencies)
	const packagePaths = Object.keys(shrinkwrapJson.packages);
	assert.ok(packagePaths.includes("node_modules/@ui5/builder"));
	assert.ok(packagePaths.includes("node_modules/chalk"));
	assert.ok(packagePaths.includes("node_modules/semver"));
	assert.ok(!packagePaths.includes("node_modules/@eslint/js"));

	console.log(`Generated shrinkwrap with ${packagePaths.length - 1} dependencies`);
});

test("Compare generated shrinkwrap with expected result", async (t) => {
	// Setup mock to prevent actual npm registry requests
	const mockRestore = setupPacoteMock();
	t.after(() => mockRestore());

	const __dirname = import.meta.dirname;
	const generatedShrinkwrapPath = path.join(__dirname, "..", "tmp", "package.a", "npm-shrinkwrap.generated.json");
	// Clean any existing generated file
	await mkdir(path.dirname(generatedShrinkwrapPath), {recursive: true});
	await unlink(generatedShrinkwrapPath).catch(() => {});

	// Generate shrinkwrap from fixture
	const cwd = path.join(__dirname, "..", "fixture", "project.a");
	const targetPackageName = "@ui5/cli";
	const generatedShrinkwrap = await convertPackageLockToShrinkwrap(cwd, targetPackageName);

	// Load expected shrinkwrap
	const expectedShrinkwrapPath = path.join(__dirname, "..", "expected", "package.a", "npm-shrinkwrap.json");
	const expectedShrinkwrap = await readJson(expectedShrinkwrapPath);

	// Write generated shrinkwrap to tmp dir for debugging purposes
	await writeFile(generatedShrinkwrapPath, JSON.stringify(generatedShrinkwrap, null, "\t"), "utf-8");

	// Compare top-level properties
	console.log("=== TOP-LEVEL COMPARISON ===");
	console.log(`Generated name: ${generatedShrinkwrap.name}, Expected name: ${expectedShrinkwrap.name}`);
	console.log(`Generated version: ${generatedShrinkwrap.version}, Expected version: ${expectedShrinkwrap.version}`);
	console.log(`Generated lockfileVersion: ${generatedShrinkwrap.lockfileVersion}, Expected lockfileVersion: ${expectedShrinkwrap.lockfileVersion}`);
	console.log(`Generated requires: ${generatedShrinkwrap.requires}, Expected requires: ${expectedShrinkwrap.requires}`);

	// Compare root package entries
	console.log("\n=== ROOT PACKAGE COMPARISON ===");
	const generatedRoot = generatedShrinkwrap.packages[""];
	const expectedRoot = expectedShrinkwrap.packages[""];
	console.log(`Generated root keys: ${Object.keys(generatedRoot).sort().join(", ")}`);
	console.log(`Expected root keys: ${Object.keys(expectedRoot).sort().join(", ")}`);

	// Compare package counts
	console.log("\n=== PACKAGE COUNT COMPARISON ===");
	const generatedPackageKeys = Object.keys(generatedShrinkwrap.packages);
	const expectedPackageKeys = Object.keys(expectedShrinkwrap.packages);
	console.log(`Generated packages: ${generatedPackageKeys.length}`);
	console.log(`Expected packages: ${expectedPackageKeys.length}`);

	assert.deepEqual(generatedShrinkwrap.packages, expectedShrinkwrap.packages,
		"Generated shrinkwrap packages should match expected");
});


test("Compare generated shrinkwrap with expected result", async (t) => {
	// Setup mock to prevent actual npm registry requests
	const mockRestore = setupPacoteMock();
	t.after(() => mockRestore());

	const __dirname = import.meta.dirname;
	const generatedShrinkwrapPath = path.join(__dirname, "..", "tmp", "package.b", "npm-shrinkwrap.generated.json");
	// Clean any existing generated file
	await mkdir(path.dirname(generatedShrinkwrapPath), {recursive: true});
	await unlink(generatedShrinkwrapPath).catch(() => {});

	// Generate shrinkwrap from fixture
	const cwd = path.join(__dirname, "..", "fixture", "project.b");
	const targetPackageName = "@ui5/cli";

	const generatedShrinkwrap = await convertPackageLockToShrinkwrap(cwd, targetPackageName);

	// Load expected shrinkwrap
	const expectedShrinkwrapPath = path.join(__dirname, "..", "expected", "package.b", "npm-shrinkwrap.json");
	const expectedShrinkwrap = await readJson(expectedShrinkwrapPath);

	// Write generated shrinkwrap to tmp dir for debugging purposes
	await writeFile(generatedShrinkwrapPath, JSON.stringify(generatedShrinkwrap, null, "\t"), "utf-8");

	assert.deepEqual(generatedShrinkwrap.packages, expectedShrinkwrap.packages,
		"Generated shrinkwrap packages should match expected");
});

// // Error handling tests
// test("Error handling - invalid package-lock.json", async (t) => {
// 	await assert.rejects(
// 		convertPackageLockToShrinkwrap(null, "@ui5/cli"),
// 		/Invalid package-lock.json: must be a valid JSON object/
// 	);

// 	await assert.rejects(
// 		convertPackageLockToShrinkwrap({}, "@ui5/cli"),
// 		/Invalid package-lock.json: missing packages field/
// 	);

// 	await assert.rejects(
// 		convertPackageLockToShrinkwrap({packages: "not-an-object"}, "@ui5/cli"),
// 		/Invalid package-lock.json: packages field must be an object/
// 	);
// });

// test("Error handling - invalid target package name", async (t) => {
// 	const validPackageLock = {packages: {}};

// 	await assert.rejects(
// 		convertPackageLockToShrinkwrap(validPackageLock, null),
// 		/Invalid target package name: must be a non-empty string/
// 	);

// 	await assert.rejects(
// 		convertPackageLockToShrinkwrap(validPackageLock, ""),
// 		/Invalid target package name: must be a non-empty string/
// 	);

// 	await assert.rejects(
// 		convertPackageLockToShrinkwrap(validPackageLock, "   "),
// 		/Invalid target package name: must be a non-empty string/
// 	);
// });

// test("Error handling - target package not found", async (t) => {
// 	const packageLock = {
// 		packages: {
// 			"": {name: "root-package", version: "1.0.0"}
// 		}
// 	};

// 	await assert.rejects(
// 		convertPackageLockToShrinkwrap(packageLock, "non-existent-package"),
// 		/Target package "non-existent-package" not found in package-lock.json/
// 	);
// });

// test("Error handling - unsupported lockfile version", async (t) => {
// 	const packageLock = {
// 		lockfileVersion: 2,
// 		packages: {
// 			"": {name: "@ui5/cli", version: "1.0.0"}
// 		}
// 	};

// 	await assert.rejects(
// 		convertPackageLockToShrinkwrap(packageLock, "@ui5/cli"),
// 		/Unsupported lockfile version: 2. Only lockfile version 3 is supported/
// 	);
// });

async function readJson(filePath) {
	const jsonString = await readFile(filePath, {encoding: "utf-8"});
	return JSON.parse(jsonString);
}
