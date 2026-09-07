import path from "node:path";
import {
	writeFile,
	unlink,
	symlink,
	rm,
	mkdir,
	stat,
	readdir,
	readFile,
} from "node:fs/promises";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import convertPackageLockToShrinkwrap from "../../lib/convertPackageLockToShrinkwrap.js";
import {test} from "node:test";
import assert from "node:assert";

const execFileAsync = promisify(execFile);

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

async function setupTestEnvironment(testDirName) {
	const __dirname = import.meta.dirname;
	const fixtureDir = path.join(__dirname, "..", "fixture", "project.a");
	const symlinkPath = await setupFixtureSymlink(fixtureDir);

	// Generate shrinkwrap with real npm registry data
	const shrinkwrapJson = await convertPackageLockToShrinkwrap(fixtureDir, "@ui5/cli");

	// Create test directory
	const testDir = path.join(__dirname, "..", "tmp", testDirName);
	await rm(testDir, {recursive: true, force: true});
	await mkdir(testDir, {recursive: true});

	// Create package.json from shrinkwrap root package data
	const rootPackage = shrinkwrapJson.packages[""];
	const packageJson = {
		name: shrinkwrapJson.name,
		version: shrinkwrapJson.version,
		dependencies: rootPackage.dependencies || {},
		engines: rootPackage.engines,
		bin: rootPackage.bin,
	};

	// Write package.json and npm-shrinkwrap.json
	await writeFile(
		path.join(testDir, "package.json"),
		JSON.stringify(packageJson, null, 2)
	);
	await writeFile(
		path.join(testDir, "npm-shrinkwrap.json"),
		JSON.stringify(shrinkwrapJson, null, 2)
	);

	// Cleanup function
	const cleanup = async () => {
		await rm(testDir, {recursive: true, force: true}).catch(() => {});
		await unlink(symlinkPath).catch(() => {});
	};

	return {shrinkwrapJson, testDir, cleanup};
}

// Recursively get all installed packages from node_modules
async function getInstalledPackages(dir, prefix = "") {
	const packages = [];
	const entries = await readdir(dir, {withFileTypes: true});

	for (const entry of entries) {
		if (!entry.isDirectory() || entry.name === ".bin") continue;

		// Check if it's a scoped package directory
		if (entry.name.startsWith("@")) {
			const scopedPackages = await getInstalledPackages(
				path.join(dir, entry.name),
				prefix ? `${prefix}/${entry.name}` : entry.name
			);
			packages.push(...scopedPackages);
		} else {
			// Regular package
			const pkgName = prefix ? `${prefix}/${entry.name}` : entry.name;
			packages.push(pkgName);

			// Check for nested node_modules
			const nestedNodeModules = path.join(dir, entry.name, "node_modules");
			try {
				const nestedStat = await stat(nestedNodeModules);
				if (nestedStat.isDirectory()) {
					const nestedPackages = await getInstalledPackages(
						nestedNodeModules,
						`${pkgName}/node_modules`
					);
					packages.push(...nestedPackages);
				}
			} catch {
				// No nested node_modules, that's fine
			}
		}
	}
	return packages;
}

test("Integration: Generated shrinkwrap can be used with npm ci", async (t) => {
	const {testDir, cleanup} = await setupTestEnvironment("npm-ci-test");
	t.after(cleanup);

	// Run npm ci
	const {stderr} = await execFileAsync("npm", ["ci"], {
		cwd: testDir,
		env: {...process.env, NO_UPDATE_NOTIFIER: "1"},
	});

	if (stderr) {
		console.warn("npm ci warnings:", stderr);
	}

	// Verify node_modules was created
	const nodeModulesPath = path.join(testDir, "node_modules");
	const nodeModulesStat = await stat(nodeModulesPath);
	assert.ok(nodeModulesStat.isDirectory(), "node_modules should be created");

	// Verify key packages are installed
	const keyPackages = ["@ui5/builder", "chalk", "yargs"];
	for (const pkg of keyPackages) {
		const pkgStat = await stat(path.join(nodeModulesPath, pkg)).catch(() => null);
		assert.ok(pkgStat?.isDirectory(), `Package ${pkg} should be installed`);
	}
});

test("Integration: Verify dependency tree with npm ls", async (t) => {
	const {shrinkwrapJson, testDir, cleanup} = await setupTestEnvironment("npm-ls-test");
	t.after(cleanup);

	// Run npm ci first
	await execFileAsync("npm", ["ci"], {
		cwd: testDir,
		env: {...process.env, NO_UPDATE_NOTIFIER: "1"},
	});

	// Run npm ls to verify the dependency tree
	const {stdout} = await execFileAsync("npm", ["ls", "--all", "--json"], {
		cwd: testDir,
		env: {...process.env, NO_UPDATE_NOTIFIER: "1"},
	});

	const dependencyTree = JSON.parse(stdout);

	// Verify the root package
	assert.equal(dependencyTree.name, "@ui5/cli");
	assert.equal(dependencyTree.version, shrinkwrapJson.version);

	// Verify key dependencies are present
	assert.ok(dependencyTree.dependencies, "Should have dependencies");
	const deps = dependencyTree.dependencies;

	// Check for key packages
	assert.ok(deps["@ui5/builder"], "Should have @ui5/builder");
	assert.ok(deps.chalk, "Should have chalk");
	assert.ok(deps.yargs, "Should have yargs");

	// Verify no devDependencies leaked in
	assert.ok(!deps.eslint, "Should not have eslint (devDependency)");
	assert.ok(!deps.ava, "Should not have ava (devDependency)");
});

test("Integration: Verify installed packages match shrinkwrap exactly", async (t) => {
	const {shrinkwrapJson, testDir, cleanup} = await setupTestEnvironment("npm-match-test");
	t.after(cleanup);

	// Run npm ci
	await execFileAsync("npm", ["ci"], {
		cwd: testDir,
		env: {...process.env, NO_UPDATE_NOTIFIER: "1"},
	});

	const nodeModulesPath = path.join(testDir, "node_modules");

	// Get all packages from shrinkwrap (excluding root "")
	const shrinkwrapPackages = Object.keys(shrinkwrapJson.packages)
		.filter((key) => key && key.startsWith("node_modules/"))
		.map((key) => key.replace("node_modules/", ""));

	const installedPackages = await getInstalledPackages(nodeModulesPath);

	// Check no extra packages are installed
	const shrinkwrapSet = new Set(shrinkwrapPackages);
	const installedSet = new Set(installedPackages);

	const extraPackages = installedPackages.filter((pkg) => !shrinkwrapSet.has(pkg));
	assert.equal(extraPackages.length, 0,
		`Found ${extraPackages.length} extra packages not in shrinkwrap: ` +
		`${extraPackages.slice(0, 5).join(", ")}${extraPackages.length > 5 ? "..." : ""}`);

	const missingPackages = shrinkwrapPackages.filter((pkg) => !installedSet.has(pkg));
	assert.equal(missingPackages.length, 0,
		`Missing ${missingPackages.length} packages from shrinkwrap: ` +
		`${missingPackages.slice(0, 5).join(", ")}${missingPackages.length > 5 ? "..." : ""}`);

	// Verify versions match for all packages
	for (const pkg of shrinkwrapPackages) {
		const shrinkwrapVersion = shrinkwrapJson.packages[`node_modules/${pkg}`].version;
		const pkgJsonPath = path.join(nodeModulesPath, pkg, "package.json");

		const pkgJson = JSON.parse(await readFile(pkgJsonPath, "utf8"));
		assert.equal(pkgJson.version, shrinkwrapVersion,
			`Version mismatch for ${pkg}: shrinkwrap=${shrinkwrapVersion}, installed=${pkgJson.version}`);
	}
});
