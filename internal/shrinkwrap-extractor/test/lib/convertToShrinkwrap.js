import path from "node:path";
import {readFile, mkdir, writeFile, unlink, symlink} from "node:fs/promises";
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

/**
 * Create a temporary symlink from package-lock.fixture.json to package-lock.json
 * This is needed because @npmcli/arborist.loadVirtual() expects package-lock.json
 *
 * @param {string} fixtureDir - Directory containing the fixture file
 * @returns {Promise<string>} Path to the created symlink
 */
async function setupFixtureSymlink(fixtureDir) {
	const symlinkPath = path.join(fixtureDir, "package-lock.json");
	const targetPath = "package-lock.fixture.json";
	await symlink(targetPath, symlinkPath);
	return symlinkPath;
}

test("Convert package-lock.json to shrinkwrap", async (t) => {
	const __dirname = import.meta.dirname;

	const cwd = path.join(__dirname, "..", "fixture", "project.a");
	const symlinkPath = await setupFixtureSymlink(cwd);
	t.after(async () => await unlink(symlinkPath).catch(() => {}));

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

test("Workspace paths should be normalized to node_modules format", async (t) => {
	const __dirname = import.meta.dirname;
	const cwd = path.join(__dirname, "..", "fixture", "project.a");
	const symlinkPath = await setupFixtureSymlink(cwd);
	t.after(async () => await unlink(symlinkPath).catch(() => {}));

	const shrinkwrapJson = await convertPackageLockToShrinkwrap(cwd, "@ui5/cli");
	const packagePaths = Object.keys(shrinkwrapJson.packages).filter((p) => p !== "");

	// All paths must start with node_modules/, never with packages/
	for (const packagePath of packagePaths) {
		assert.ok(!packagePath.startsWith("packages/"),
			`Path "${packagePath}" should not contain workspace prefix`);
		assert.ok(packagePath.startsWith("node_modules/"),
			`Path "${packagePath}" should start with node_modules/`);
	}

	// Verify a CLI dependency was normalized correctly
	const npmCliConfig = shrinkwrapJson.packages["node_modules/@npmcli/config"];
	assert.ok(npmCliConfig, "@npmcli/config should be at normalized path");
	assert.equal(npmCliConfig.version, "9.0.0");

	console.log(`✓ All ${packagePaths.length} package paths correctly normalized`);
});

test("Version collisions: root packages get priority at top level", async (t) => {
	const __dirname = import.meta.dirname;
	const cwd = path.join(__dirname, "..", "fixture", "project.b");
	const symlinkPath = await setupFixtureSymlink(cwd);
	t.after(async () => await unlink(symlinkPath).catch(() => {}));

	const shrinkwrapJson = await convertPackageLockToShrinkwrap(cwd, "@ui5/cli");

	// ansi-regex: root has v6.2.2, CLI workspace has v5.0.1, but not direct dependency to @ui5/cli
	const rootAnsiRegex = shrinkwrapJson.packages["node_modules/ansi-regex"];
	assert.equal(rootAnsiRegex?.version, "6.2.2", "Root ansi-regex at top level");

	Object.keys(shrinkwrapJson.packages)
		.filter((pkg) => pkg.endsWith("node_modules/ansi-regex") && pkg !== "node_modules/ansi-regex")
		.forEach((pkgName) => {
			assert.equal(shrinkwrapJson.packages[pkgName]?.version,
				"5.0.1", `Workspace ansi-regex nested under @ui5/cli -> ${pkgName}`);
		});

	// Verify root version satisfies dependents
	const stripAnsi = shrinkwrapJson.packages["node_modules/strip-ansi"];
	assert.equal(stripAnsi.dependencies["ansi-regex"], "^6.0.1");
	assert.ok(rootAnsiRegex.version.startsWith("6."), "Root v6.2.2 satisfies ^6.0.1");

	console.log("✓ Root package prioritized at top level, workspace version nested");
});

test("Compare generated shrinkwrap with expected result: package.a", async (t) => {
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
	const symlinkPath = await setupFixtureSymlink(cwd);
	t.after(async () => await unlink(symlinkPath).catch(() => {}));

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
	console.log(`Generated lockfileVersion: ${generatedShrinkwrap.lockfileVersion},` +
		` Expected lockfileVersion: ${expectedShrinkwrap.lockfileVersion}`);
	console.log(`Generated requires: ${generatedShrinkwrap.requires}, ` +
		`Expected requires: ${expectedShrinkwrap.requires}`);

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

test("Compare generated shrinkwrap with expected result: package.b", async (t) => {
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
	const symlinkPath = await setupFixtureSymlink(cwd);
	t.after(async () => await unlink(symlinkPath).catch(() => {}));

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

test("Compare generated shrinkwrap with expected result: package.c", async (t) => {
	// Setup mock to prevent actual npm registry requests
	const mockRestore = setupPacoteMock();
	t.after(() => mockRestore());

	const __dirname = import.meta.dirname;
	const generatedShrinkwrapPath = path.join(__dirname, "..", "tmp", "package.c", "npm-shrinkwrap.generated.json");
	// Clean any existing generated file
	await mkdir(path.dirname(generatedShrinkwrapPath), {recursive: true});
	await unlink(generatedShrinkwrapPath).catch(() => {});

	// Generate shrinkwrap from fixture
	const cwd = path.join(__dirname, "..", "fixture", "project.c");
	const symlinkPath = await setupFixtureSymlink(cwd);
	t.after(async () => await unlink(symlinkPath).catch(() => {}));

	const targetPackageName = "@ui5/target";

	const generatedShrinkwrap = await convertPackageLockToShrinkwrap(cwd, targetPackageName);

	// Load expected shrinkwrap
	const expectedShrinkwrapPath = path.join(__dirname, "..", "expected", "package.c", "npm-shrinkwrap.json");
	const expectedShrinkwrap = await readJson(expectedShrinkwrapPath);

	// Write generated shrinkwrap to tmp dir for debugging purposes
	await writeFile(generatedShrinkwrapPath, JSON.stringify(generatedShrinkwrap, null, "\t"), "utf-8");

	assert.deepEqual(generatedShrinkwrap.packages, expectedShrinkwrap.packages,
		"Generated shrinkwrap packages should match expected");
});

// Error handling tests
test("Error handling - invalid target package name", async (t) => {
	const __dirname = import.meta.dirname;
	const validCwd = path.join(__dirname, "..", "fixture", "project.a");
	const symlinkPath = await setupFixtureSymlink(validCwd);
	t.after(async () => await unlink(symlinkPath).catch(() => {}));

	await assert.rejects(
		convertPackageLockToShrinkwrap(validCwd, null),
		/Invalid target package name: must be a non-empty string/
	);

	await assert.rejects(
		convertPackageLockToShrinkwrap(validCwd, ""),
		/Invalid target package name: must be a non-empty string/
	);

	await assert.rejects(
		convertPackageLockToShrinkwrap(validCwd, "   "),
		/Invalid target package name: must be a non-empty string/
	);
});

test("Error handling - target package not found", async (t) => {
	const __dirname = import.meta.dirname;
	const validCwd = path.join(__dirname, "..", "fixture", "project.a");
	const symlinkPath = await setupFixtureSymlink(validCwd);
	t.after(async () => await unlink(symlinkPath).catch(() => {}));

	await assert.rejects(
		convertPackageLockToShrinkwrap(validCwd, "non-existent-package"),
		/Target package "non-existent-package" not found in workspace/
	);
});

test("Error handling - invalid workspace directory", async (t) => {
	await assert.rejects(
		convertPackageLockToShrinkwrap("/non/existent/path", "@ui5/cli"),
		/ENOENT.*package-lock\.json/
	);
});

test("Error handling - invalid package-lock.json files", async (t) => {
	const __dirname = import.meta.dirname;

	// Setup symlinks for all invalid fixtures
	const malformedDir = path.join(__dirname, "..", "fixture", "invalid", "malformed");
	const noPackagesDir = path.join(__dirname, "..", "fixture", "invalid", "no-packages");
	const invalidPackagesDir = path.join(__dirname, "..", "fixture", "invalid", "invalid-packages");
	const v2Dir = path.join(__dirname, "..", "fixture", "invalid", "v2");

	const symlinks = [
		await setupFixtureSymlink(malformedDir),
		await setupFixtureSymlink(noPackagesDir),
		await setupFixtureSymlink(invalidPackagesDir),
		await setupFixtureSymlink(v2Dir)
	];

	// Cleanup all symlinks after test
	t.after(async () => {
		await Promise.all(symlinks.map((link) => unlink(link).catch(() => {})));
	});

	// Test malformed JSON
	await assert.rejects(
		convertPackageLockToShrinkwrap(malformedDir, "@ui5/cli"),
		/Unexpected token/
	);

	// Test missing packages field
	await assert.rejects(
		convertPackageLockToShrinkwrap(noPackagesDir, "@ui5/cli"),
		/Invalid package-lock\.json: missing packages field/
	);

	// Test invalid packages field
	await assert.rejects(
		convertPackageLockToShrinkwrap(invalidPackagesDir, "@ui5/cli"),
		/Invalid package-lock\.json: packages field must be an object/
	);

	// Test unsupported lockfile version
	await assert.rejects(
		convertPackageLockToShrinkwrap(v2Dir, "@ui5/cli"),
		/Unsupported lockfile version: 2\. Only lockfile version 3 is supported/
	);
});

async function readJson(filePath) {
	const jsonString = await readFile(filePath, {encoding: "utf-8"});
	return JSON.parse(jsonString);
}
