import path from "node:path";
import {readFile, mkdir, writeFile, unlink, symlink} from "node:fs/promises";
import extractFromWorkspaceLockfile from "../../lib/extractFromWorkspaceLockfile.js";
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

test("Convert package-lock.json to lockfile", async (t) => {
	const __dirname = import.meta.dirname;

	const cwd = path.join(__dirname, "..", "fixture", "project.a");
	const symlinkPath = await setupFixtureSymlink(cwd);
	t.after(async () => await unlink(symlinkPath).catch(() => {}));

	const targetPackageName = "@ui5/cli";
	const lockfileJson = await extractFromWorkspaceLockfile(cwd, targetPackageName);

	// Basic structure validation
	assert.equal(lockfileJson.name, "@ui5/cli");
	assert.equal(lockfileJson.version, "4.0.34");
	assert.equal(lockfileJson.lockfileVersion, 3);
	assert.equal(lockfileJson.requires, true);
	assert.ok(lockfileJson.packages);

	// Verify root package entry
	const rootPackage = lockfileJson.packages[""];
	assert.ok(rootPackage);
	assert.equal(rootPackage.name, "@ui5/cli");
	assert.equal(rootPackage.version, "4.0.34");
	assert.ok(rootPackage.dependencies);

	// Verify workspace packages are resolved to registry-like URLs
	const builderDep = lockfileJson.packages["node_modules/@ui5/builder"];
	assert.ok(builderDep?.resolved, "Builder dependency should have a resolved URL");
	assert.equal(builderDep.version, "4.1.1");
	assert.ok(builderDep.resolved.startsWith("https://registry.npmjs.org/"));
	// Check that it contains the scoped package name (registry URLs use unencoded form)
	assert.ok(builderDep.resolved.includes("@ui5/builder"));
	// Verify integrity is present from registry metadata
	assert.ok(builderDep.integrity, "Builder dependency should have integrity from registry");

	// Verify regular dependencies have proper structure
	const chalkDep = lockfileJson.packages["node_modules/chalk"];
	assert.ok(chalkDep);
	assert.equal(chalkDep.version, "5.6.2");
	const yargsDep = lockfileJson.packages["node_modules/yargs"];
	assert.ok(yargsDep);
	assert.equal(yargsDep.version, "17.7.2");

	// Verify only production dependencies are included (no devDependencies)
	const packagePaths = Object.keys(lockfileJson.packages);
	assert.ok(packagePaths.includes("node_modules/@ui5/builder"));
	assert.ok(packagePaths.includes("node_modules/chalk"));
	assert.ok(packagePaths.includes("node_modules/semver"));
	assert.ok(!packagePaths.includes("node_modules/@eslint/js"));

	console.log(`Generated lockfile with ${packagePaths.length - 1} dependencies`);
});

test("Workspace paths should be normalized to node_modules format", async (t) => {
	const __dirname = import.meta.dirname;

	const cwd = path.join(__dirname, "..", "fixture", "project.a");
	const symlinkPath = await setupFixtureSymlink(cwd);
	t.after(async () => await unlink(symlinkPath).catch(() => {}));

	const targetPackageName = "@ui5/cli";
	const lockfileJson = await extractFromWorkspaceLockfile(cwd, targetPackageName);

	// Verify that no package paths contain workspace prefixes like "packages/cli/node_modules/..."
	const packagePaths = Object.keys(lockfileJson.packages);

	for (const packagePath of packagePaths) {
		// Skip root package (empty string)
		if (packagePath === "") continue;

		// Assert that no path starts with "packages/"
		assert.ok(!packagePath.startsWith("packages/"),
			`Package path "${packagePath}" should not start with "packages/" prefix`);

		// Assert that non-root paths start with "node_modules/"
		assert.ok(packagePath.startsWith("node_modules/"),
			`Package path "${packagePath}" should start with "node_modules/" prefix`);
	}

	// Specifically check a package that would have been under packages/cli/node_modules in the monorepo
	// The "@npmcli/config" package is a direct dependency that exists in the CLI's node_modules
	const npmCliConfigPackage = lockfileJson.packages["node_modules/@npmcli/config"];
	assert.ok(npmCliConfigPackage, "The '@npmcli/config' package should be present at normalized path");
	assert.equal(npmCliConfigPackage.version, "9.0.0", "@npmcli/config package should have correct version");

	console.log(`✓ All ${packagePaths.length - 1} package paths correctly normalized`);
});

test("Compare generated lockfile with expected result", async (t) => {
	// Setup mock to prevent actual npm registry requests
	const mockRestore = setupPacoteMock();
	t.after(() => mockRestore());

	const __dirname = import.meta.dirname;
	const generatedLockfilePath = path.join(__dirname, "..", "tmp", "package.a", "package-lock.generated.json");
	// Clean any existing generated file
	await mkdir(path.dirname(generatedLockfilePath), {recursive: true});
	await unlink(generatedLockfilePath).catch(() => {});

	// Generate lockfile from fixture
	const cwd = path.join(__dirname, "..", "fixture", "project.a");
	const symlinkPath = await setupFixtureSymlink(cwd);
	t.after(async () => await unlink(symlinkPath).catch(() => {}));

	const targetPackageName = "@ui5/cli";
	const generatedLockfile = await extractFromWorkspaceLockfile(cwd, targetPackageName);

	// Load expected lockfile
	const expectedLockfilePath = path.join(__dirname, "..", "expected", "package.a", "package-lock.json");
	const expectedLockfile = await readJson(expectedLockfilePath);

	// Write generated lockfile to tmp dir for debugging purposes
	await writeFile(generatedLockfilePath, JSON.stringify(generatedLockfile, null, "\t"), "utf-8");

	// Compare top-level properties
	console.log("=== TOP-LEVEL COMPARISON ===");
	console.log(`Generated name: ${generatedLockfile.name}, Expected name: ${expectedLockfile.name}`);
	console.log(`Generated version: ${generatedLockfile.version}, Expected version: ${expectedLockfile.version}`);
	console.log(`Generated lockfileVersion: ${generatedLockfile.lockfileVersion},` +
		` Expected lockfileVersion: ${expectedLockfile.lockfileVersion}`);
	console.log(`Generated requires: ${generatedLockfile.requires}, ` +
		`Expected requires: ${expectedLockfile.requires}`);

	// Compare root package entries
	console.log("\n=== ROOT PACKAGE COMPARISON ===");
	const generatedRoot = generatedLockfile.packages[""];
	const expectedRoot = expectedLockfile.packages[""];
	console.log(`Generated root keys: ${Object.keys(generatedRoot).sort().join(", ")}`);
	console.log(`Expected root keys: ${Object.keys(expectedRoot).sort().join(", ")}`);

	// Compare package counts
	console.log("\n=== PACKAGE COUNT COMPARISON ===");
	const generatedPackageKeys = Object.keys(generatedLockfile.packages);
	const expectedPackageKeys = Object.keys(expectedLockfile.packages);
	console.log(`Generated packages: ${generatedPackageKeys.length}`);
	console.log(`Expected packages: ${expectedPackageKeys.length}`);

	assert.deepEqual(generatedLockfile.packages, expectedLockfile.packages,
		"Generated lockfile packages should match expected");
});


test("Compare generated lockfile with expected result", async (t) => {
	// Setup mock to prevent actual npm registry requests
	const mockRestore = setupPacoteMock();
	t.after(() => mockRestore());

	const __dirname = import.meta.dirname;
	const generatedLockfilePath = path.join(__dirname, "..", "tmp", "package.b", "package-lock.generated.json");
	// Clean any existing generated file
	await mkdir(path.dirname(generatedLockfilePath), {recursive: true});
	await unlink(generatedLockfilePath).catch(() => {});

	// Generate lockfile from fixture
	const cwd = path.join(__dirname, "..", "fixture", "project.b");
	const symlinkPath = await setupFixtureSymlink(cwd);
	t.after(async () => await unlink(symlinkPath).catch(() => {}));

	const targetPackageName = "@ui5/cli";

	const generatedLockfile = await extractFromWorkspaceLockfile(cwd, targetPackageName);

	// Load expected lockfile
	const expectedLockfilePath = path.join(__dirname, "..", "expected", "package.b", "package-lock.json");
	const expectedLockfile = await readJson(expectedLockfilePath);

	// Write generated lockfile to tmp dir for debugging purposes
	await writeFile(generatedLockfilePath, JSON.stringify(generatedLockfile, null, "\t"), "utf-8");

	assert.deepEqual(generatedLockfile.packages, expectedLockfile.packages,
		"Generated lockfile packages should match expected");
});

test("Optional peer dependencies with null edges should be excluded", async (t) => {
	// Guards against: ws declares bufferutil and utf-8-validate as peerOptional, but they are not
	// installed. Arborist represents these as edges with edge.to === null. The generator must skip
	// them instead of throwing "Cannot read properties of null (reading 'location')".
	const __dirname = import.meta.dirname;

	const cwd = path.join(__dirname, "..", "fixture", "project.a");
	const symlinkPath = await setupFixtureSymlink(cwd);
	t.after(async () => await unlink(symlinkPath).catch(() => {}));

	const lockfileJson = await extractFromWorkspaceLockfile(cwd, "@ui5/cli");

	// ws itself must be present (it is a real production dep of @ui5/server)
	assert.ok(lockfileJson.packages["node_modules/ws"],
		"ws should be included in the lockfile");

	// Its optional peer deps are not installed and must NOT appear
	assert.equal(lockfileJson.packages["node_modules/bufferutil"], undefined,
		"bufferutil (optional peerDep of ws) must not be included");
	assert.equal(lockfileJson.packages["node_modules/utf-8-validate"], undefined,
		"utf-8-validate (optional peerDep of ws) must not be included");
});

// Error handling tests
test("Error handling - invalid target package name", async (t) => {
	const __dirname = import.meta.dirname;
	const validCwd = path.join(__dirname, "..", "fixture", "project.a");
	const symlinkPath = await setupFixtureSymlink(validCwd);
	t.after(async () => await unlink(symlinkPath).catch(() => {}));

	await assert.rejects(
		extractFromWorkspaceLockfile(validCwd, null),
		/Invalid target package name: must be a non-empty string/
	);

	await assert.rejects(
		extractFromWorkspaceLockfile(validCwd, ""),
		/Invalid target package name: must be a non-empty string/
	);

	await assert.rejects(
		extractFromWorkspaceLockfile(validCwd, "   "),
		/Invalid target package name: must be a non-empty string/
	);
});

test("Error handling - target package not found", async (t) => {
	const __dirname = import.meta.dirname;
	const validCwd = path.join(__dirname, "..", "fixture", "project.a");
	const symlinkPath = await setupFixtureSymlink(validCwd);
	t.after(async () => await unlink(symlinkPath).catch(() => {}));

	await assert.rejects(
		extractFromWorkspaceLockfile(validCwd, "non-existent-package"),
		/Target package "non-existent-package" not found in workspace/
	);
});

test("Error handling - invalid workspace directory", async (t) => {
	await assert.rejects(
		extractFromWorkspaceLockfile("/non/existent/path", "@ui5/cli"),
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
		extractFromWorkspaceLockfile(malformedDir, "@ui5/cli"),
		/Unexpected token/
	);

	// Test missing packages field
	await assert.rejects(
		extractFromWorkspaceLockfile(noPackagesDir, "@ui5/cli"),
		/Invalid package-lock\.json: missing packages field/
	);

	// Test invalid packages field
	await assert.rejects(
		extractFromWorkspaceLockfile(invalidPackagesDir, "@ui5/cli"),
		/Invalid package-lock\.json: packages field must be an object/
	);

	// Test unsupported lockfile version
	await assert.rejects(
		extractFromWorkspaceLockfile(v2Dir, "@ui5/cli"),
		/Unsupported lockfile version: 2\. Only lockfile version 3 is supported/
	);
});

async function readJson(filePath) {
	const jsonString = await readFile(filePath, {encoding: "utf-8"});
	return JSON.parse(jsonString);
}
