import test from "ava";
import sinonGlobal from "sinon";
import {fileURLToPath} from "node:url";
import {setTimeout} from "node:timers/promises";
import fs from "node:fs/promises";
import {graphFromPackageDependencies} from "../../../lib/graph/graph.js";
import {setLogLevel} from "@ui5/logger";
import Cache from "../../../lib/build/cache/Cache.js";

// Ensures that all logging code paths are tested
setLogLevel("silly");

test.beforeEach((t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();

	t.context.logEventStub = sinon.stub();
	t.context.buildMetadataEventStub = sinon.stub();
	t.context.projectBuildMetadataEventStub = sinon.stub();
	t.context.buildStatusEventStub = sinon.stub();
	t.context.projectBuildStatusEventStub = sinon.stub();

	process.on("ui5.log", t.context.logEventStub);
	process.on("ui5.build-metadata", t.context.buildMetadataEventStub);
	process.on("ui5.project-build-metadata", t.context.projectBuildMetadataEventStub);
	process.on("ui5.build-status", t.context.buildStatusEventStub);
	process.on("ui5.project-build-status", t.context.projectBuildStatusEventStub);
});

test.afterEach.always(async (t) => {
	await t.context.fixtureTester.teardown();
	t.context.sinon.restore();
	delete process.env.UI5_DATA_DIR;

	process.off("ui5.log", t.context.logEventStub);
	process.off("ui5.build-metadata", t.context.buildMetadataEventStub);
	process.off("ui5.project-build-metadata", t.context.projectBuildMetadataEventStub);
	process.off("ui5.build-status", t.context.buildStatusEventStub);
	process.off("ui5.project-build-status", t.context.projectBuildStatusEventStub);
});

// Note: This test should be the first test to run, as it covers initial build scenarios, which are not reproducible
// once the BuildServer has been started and built a project at least once.
// This is independent of caching on file-system level, which is isolated per test via tmp folders.
test.serial("Serve application.a, initial file changes", async (t) => {
	const fixtureTester = t.context.fixtureTester = new FixtureTester(t, "application.a");

	await fixtureTester.serveProject();

	// Directly change a source file in application.a before requesting it
	const changedFilePath = `${fixtureTester.fixturePath}/webapp/test.js`;
	await fs.appendFile(changedFilePath, `\ntest("initial change");\n`);

	// Request the changed resource immediately
	const resourceRequestPromise = fixtureTester.requestResource({
		resource: "/test.js"
	});

	await setTimeout(500);

	// Directly change the source file again, which should abort the current build and trigger a new one
	await fs.appendFile(changedFilePath, `\ntest("second change");\n`);
	await fs.appendFile(changedFilePath, `\ntest("third change");\n`);

	// Wait for the resource to be served
	await resourceRequestPromise;
	await setTimeout(500);

	const resource2 = await fixtureTester.requestResource({
		resource: "/test.js"
	});

	// Check whether the change is reflected
	const servedFileContent = await resource2.getString();
	t.true(servedFileContent.includes(`test("initial change");`), "Resource contains initial changed file content");
	t.true(servedFileContent.includes(`test("second change");`), "Resource contains second changed file content");
	t.true(servedFileContent.includes(`test("third change");`), "Resource contains third changed file content");
});

test.serial("Serve application.a, request application resource", async (t) => {
	const fixtureTester = t.context.fixtureTester = new FixtureTester(t, "application.a");

	// #1 request with empty cache
	await fixtureTester.serveProject();
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {
				"application.a": {}
			}
		}
	});

	// #2 request with cache
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {}
		}
	});

	// Change a source file in application.a
	const changedFilePath = `${fixtureTester.fixturePath}/webapp/test.js`;
	await fs.appendFile(changedFilePath, `\ntest("line added");\n`);

	await setTimeout(500); // Wait for the file watcher to detect and propagate the change

	// #3 request with cache and changes
	const res = await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {
				"application.a": {
					skippedTasks: [
						"escapeNonAsciiCharacters",
						// Note: replaceCopyright is skipped because no copyright is configured in the project
						"replaceCopyright",
						"enhanceManifest",
						"generateFlexChangesBundle",
					]
				}
			}
		}
	});

	// Check whether the changed file is in the destPath
	const servedFileContent = await res.getString();
	t.true(servedFileContent.includes(`test("line added");`), "Resource contains changed file content");
});

test.serial("Serve application.a, request library resource", async (t) => {
	const fixtureTester = t.context.fixtureTester = new FixtureTester(t, "application.a");

	// #1 request with empty cache
	await fixtureTester.serveProject();
	await fixtureTester.requestResource({
		resource: "/resources/library/a/.library",
		assertions: {
			projects: {
				"library.a": {}
			}
		}
	});

	// #2 request with cache
	await fixtureTester.requestResource({
		resource: "/resources/library/a/.library",
		assertions: {
			projects: {}
		}
	});

	// Change a source file in library.a
	const changedFilePath = `${fixtureTester.fixturePath}/node_modules/collection/library.a/src/library/a/.library`;
	await fs.writeFile(
		changedFilePath,
		(await fs.readFile(changedFilePath, {encoding: "utf8"})).replace(
			`<documentation>Library A</documentation>`,
			`<documentation>Library A (updated #1)</documentation>`
		)
	);

	await setTimeout(500); // Wait for the file watcher to detect and propagate the change

	// #3 request with cache and changes
	const dotLibraryResource = await fixtureTester.requestResource({
		resource: "/resources/library/a/.library",
		assertions: {
			projects: {
				"library.a": {
					skippedTasks: [
						"escapeNonAsciiCharacters",
						"minify",
						"replaceBuildtime",
					]
				}
			}
		}
	});

	// Check whether the changed file is served
	const servedFileContent = await dotLibraryResource.getString();
	t.true(
		servedFileContent.includes(`<documentation>Library A (updated #1)</documentation>`),
		"Resource contains changed file content"
	);

	// #4 request with cache (no changes)
	const manifestResource = await fixtureTester.requestResource({
		resource: "/resources/library/a/manifest.json",
		assertions: {
			projects: {}
		}
	});

	// Check whether the manifest is served correctly with changed .library content reflected
	const manifestContent = JSON.parse(await manifestResource.getString());
	t.is(
		manifestContent["sap.app"]["description"], "Library A (updated #1)",
		"Manifest reflects changed .library content"
	);
});

test.serial("Serve library", async (t) => {
	const fixtureTester = t.context.fixtureTester = new FixtureTester(t, "library.d");

	// #1 request with empty cache
	await fixtureTester.serveProject({
		config: {
			excludedTasks: ["minify"],
		}
	});
	await fixtureTester.requestResource({
		resource: "/resources/library/d/some.js",
		assertions: {
			projects: {
				"library.d": {}
			}
		}
	});

	// #2 request with cache
	await fixtureTester.requestResource({
		resource: "/resources/library/d/some.js",
		assertions: {
			projects: {}
		}
	});

	// Change a source file in library.d
	const changedFilePath = `${fixtureTester.fixturePath}/main/src/library/d/some.js`;
	const originalContent = await fs.readFile(changedFilePath, {encoding: "utf8"});
	await fs.writeFile(
		changedFilePath,
		originalContent.replace(
			` */`,
			` */\n// Test 1`
		)
	);

	await setTimeout(500); // Wait for the file watcher to detect and propagate the change

	// #3 request with cache and changes
	const resourceContent1 = await fixtureTester.requestResource({
		resource: "/resources/library/d/some.js",
		assertions: {
			projects: {
				"library.d": {
					skippedTasks: [
						"buildThemes",
						"enhanceManifest",
						"escapeNonAsciiCharacters",
						"replaceBuildtime",
					]
				}
			}
		}
	});

	// Check whether the changed file is served
	const servedFileContent1 = await resourceContent1.getString();
	t.true(
		servedFileContent1.includes(`Test 1`),
		"Resource contains changed file content"
	);

	// Restore original file content

	await fs.writeFile(changedFilePath, originalContent);

	await setTimeout(500); // Wait for the file watcher to detect and propagate the change

	// #4 request with cache (no changes)
	const resourceContent2 = await fixtureTester.requestResource({
		resource: "/resources/library/d/some.js",
		assertions: {
			projects: {}
		}
	});

	const servedFileContent2 = await resourceContent2.getString();
	t.false(
		servedFileContent2.includes(`Test 1`),
		"Resource does not contain changed file content"
	);
});

test.serial("Serve application.a, request application resource AND library resource", async (t) => {
	const fixtureTester = t.context.fixtureTester = new FixtureTester(t, "application.a");

	// #1 request with empty cache
	await fixtureTester.serveProject();
	await fixtureTester.requestResources({
		resources: ["/test.js", "/resources/library/a/.library"],
		assertions: {
			projects: {
				"library.a": {},
				"application.a": {}
			}
		}
	});

	// #2 request with cache
	await fixtureTester.requestResources({
		resources: ["/test.js", "/resources/library/a/.library"],
		assertions: {
			projects: {}
		}
	});

	// Change a source file in application.a and library.a
	const changedFilePath = `${fixtureTester.fixturePath}/webapp/test.js`;
	await fs.appendFile(changedFilePath, `\ntest("line added");\n`);
	const changedFilePath2 = `${fixtureTester.fixturePath}/node_modules/collection/library.a/src/library/a/.library`;
	await fs.writeFile(
		changedFilePath2,
		(await fs.readFile(changedFilePath2, {encoding: "utf8"})).replace(
			`<documentation>Library A</documentation>`,
			`<documentation>Library A (updated #1)</documentation>`
		)
	);

	await setTimeout(500); // Wait for the file watcher to detect and propagate the changes

	// #3 request with cache and changes
	const [resource1, resource2] = await fixtureTester.requestResources({
		resources: ["/test.js", "/resources/library/a/.library"],
		assertions: {
			projects: {
				"library.a": {
					skippedTasks: [
						"escapeNonAsciiCharacters",
						"minify",
						"replaceBuildtime",
					]
				},
				"application.a": {
					skippedTasks: [
						"escapeNonAsciiCharacters",
						// Note: replaceCopyright is skipped because no copyright is configured in the project
						"replaceCopyright",
						"enhanceManifest",
						"generateFlexChangesBundle",
					]
				}
			}
		}
	});

	// Check whether the changed files contain the correct contents
	const resource1FileContent = await resource1.getString();
	const resource2FileContent = await resource2.getString();
	t.true(resource1FileContent.includes(`test("line added");`), "Resource contains changed file content");
	t.true(
		resource2FileContent.includes(`<documentation>Library A (updated #1)</documentation>`),
		"Resource contains changed file content"
	);
});

test.serial("Serve application.a with --cache=Default", async (t) => {
	const fixtureTester = t.context.fixtureTester = new FixtureTester(t, "application.a");

	// #1: Serve and request with empty cache --> all tasks execute
	await fixtureTester.serveProject({config: {cache: Cache.Default}});
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {
				"application.a": {}
			}
		}
	});

	// #2: Request with valid cache, no changes --> nothing rebuilds (all cached)
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {}
		}
	});

	// Change a source file in application.a
	const changedFilePath = `${fixtureTester.fixturePath}/webapp/test.js`;
	await fs.appendFile(changedFilePath, `\ntest("line added for cache test");\n`);

	await setTimeout(500); // Wait for the file watcher to detect and propagate the changes

	// #3: Request with valid cache, source changes --> only affected tasks rebuild
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {
				"application.a": {
					skippedTasks: [
						"escapeNonAsciiCharacters",
						"replaceCopyright",
						"enhanceManifest",
						"generateFlexChangesBundle",
					]
				}
			}
		}
	});

	// Verify the changed file is served
	const resource = await fixtureTester.requestResource({resource: "/test.js"});
	const servedFileContent = await resource.getString();
	t.true(servedFileContent.includes(`test("line added for cache test");`),
		"Served resource contains changed file content");
});

test.serial("Serve application.a with --cache=Off", async (t) => {
	const fixtureTester = t.context.fixtureTester = new FixtureTester(t, "application.a");

	// #1: Serve and request with cache=Off --> all tasks execute, cache not written
	await fixtureTester.serveProject({config: {cache: Cache.Off}});
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {
				"application.a": {}
			}
		}
	});

	// #2: Request with cache=Off (again) --> all tasks execute again (no cache reuse)
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {
				"application.a": {}
			}
		}
	});

	// Restart server with cache=Default
	await fixtureTester.teardown();
	await fixtureTester.serveProject({config: {cache: Cache.Default}});

	// #3: Request with cache=Default --> all tasks execute (no cache from previous Off mode)
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {
				"application.a": {}
			}
		}
	});

	// #4: Request with cache=Default (again) --> nothing rebuilds (cache now exists)
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {}
		}
	});

	// Restart server with cache=Off
	await fixtureTester.teardown();
	await fixtureTester.serveProject({config: {cache: Cache.Off}});

	// #5: Request with cache=Off --> all tasks execute (ignores existing cache)
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {
				"application.a": {}
			}
		}
	});
});

test.serial("Serve application.a with --cache=ReadOnly", async (t) => {
	const fixtureTester = t.context.fixtureTester = new FixtureTester(t, "application.a");

	// #1: Serve and request with cache=Default --> all tasks execute, cache written
	await fixtureTester.serveProject({config: {cache: Cache.Default}});
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {
				"application.a": {}
			}
		}
	});

	// Restart server with ReadOnly mode
	await fixtureTester.teardown();
	await fixtureTester.serveProject({config: {cache: Cache.ReadOnly}});

	// #2: Request with cache=ReadOnly, no changes --> nothing rebuilds (cache used)
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {}
		}
	});

	// Change a source file in application.a
	const changedFilePath = `${fixtureTester.fixturePath}/webapp/test.js`;
	await fs.appendFile(changedFilePath, `\ntest("line added for ReadOnly test");\n`);

	await setTimeout(500); // Wait for the file watcher to detect and propagate the changes

	// #3: Request with cache=ReadOnly --> affected tasks rebuild, BUT cache not updated
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {
				"application.a": {
					skippedTasks: [
						"escapeNonAsciiCharacters",
						"replaceCopyright",
						"enhanceManifest",
						"generateFlexChangesBundle",
					]
				}
			}
		}
	});

	// Verify the changed file is served
	const resource = await fixtureTester.requestResource({resource: "/test.js"});
	const servedFileContent = await resource.getString();
	t.true(servedFileContent.includes(`test("line added for ReadOnly test");`),
		"Served resource contains changed file content");

	// Restart server with Default mode
	await fixtureTester.teardown();
	await fixtureTester.serveProject({config: {cache: Cache.Default}});

	// #4: Request with cache=Default, no new changes --> rebuilds again (cache from #3 missing)
	// This validates that ReadOnly didn't write the cache in step #3
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {
				"application.a": {
					skippedTasks: [
						"escapeNonAsciiCharacters",
						"replaceCopyright",
						"enhanceManifest",
						"generateFlexChangesBundle",
					]
				}
			}
		}
	});
});

test.serial("Serve application.a with --cache=Force (1)", async (t) => {
	const fixtureTester = t.context.fixtureTester = new FixtureTester(t, "application.a");

	// #1: Serve and request with cache=Default --> all tasks execute, cache written
	await fixtureTester.serveProject({config: {cache: Cache.Default}});
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {
				"application.a": {}
			}
		}
	});

	// Restart server with Force mode
	await fixtureTester.teardown();
	await fixtureTester.serveProject({config: {cache: Cache.Force}, expectBuildErrors: true});

	// #2: Request with cache=Force, no changes --> nothing rebuilds (cache used)
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {}
		}
	});

	// Change a source file in application.a
	const changedFilePath = `${fixtureTester.fixturePath}/webapp/test.js`;
	await fs.appendFile(changedFilePath, `\ntest("line added for Force test");\n`);

	await setTimeout(500); // Wait for the file watcher to detect and propagate the changes

	// #3: Request with cache=Force --> ERROR (cache invalid due to source changes)
	const error = await t.throwsAsync(async () => {
		await fixtureTester.requestResource({
			resource: "/test.js",
		});
	});

	t.truthy(error, "Request with Force mode should throw error when cache is stale");
	t.true(error.message.includes(`Cache is in "Force" mode but cache is stale for project application.a`));

	// Wait for async error handling to complete
	await setTimeout(50);
});

test.serial("Serve application.a with --cache=Force (2)", async (t) => {
	const fixtureTester = t.context.fixtureTester = new FixtureTester(t, "application.a");

	// #1: Serve with cache=Force on empty cache --> ERROR when requesting resource
	await fixtureTester.serveProject({config: {cache: Cache.Force}, expectBuildErrors: true});

	const error = await t.throwsAsync(async () => {
		await fixtureTester.requestResource({
			resource: "/test.js",
		});
	});

	t.truthy(error, "Request with Force mode should throw error when cache is empty");
	t.true(error.message.includes(`Cache is in "Force" mode but no cache found for project application.a`));

	// Wait for async error handling to complete
	await setTimeout(50);
});

function getFixturePath(fixtureName) {
	return fileURLToPath(new URL(`../../fixtures/${fixtureName}`, import.meta.url));
}

function getTmpPath(folderName) {
	return fileURLToPath(new URL(`../../tmp/BuildServer/${folderName}`, import.meta.url));
}

async function rmrf(dirPath) {
	return fs.rm(dirPath, {recursive: true, force: true});
}

class FixtureTester {
	constructor(t, fixtureName) {
		this._t = t;
		this._sinon = t.context.sinon;
		this._fixtureName = fixtureName;
		this._initialized = false;

		// Public
		this.fixturePath = getTmpPath(fixtureName);
		this.buildServer = null;
		this.graph = null;
	}

	async _initialize() {
		if (this._initialized) {
			return;
		}
		process.env.UI5_DATA_DIR = getTmpPath(`${this._fixtureName}/.ui5`);
		await rmrf(this.fixturePath); // Clean up any previous test runs
		await fs.cp(getFixturePath(this._fixtureName), this.fixturePath, {recursive: true});
		this._initialized = true;
	}

	async teardown() {
		if (this.buildServer) {
			try {
				await this.buildServer.destroy();
			} catch {
				// Ignore errors during teardown (e.g., failed Force mode builds)
			}
		}
	}

	async serveProject({graphConfig = {}, config = {}, expectBuildErrors = false} = {}) {
		await this._initialize();

		const graph = this.graph = await graphFromPackageDependencies({
			...graphConfig,
			cwd: this.fixturePath,
		});

		// Execute the build
		this.buildServer = await graph.serve(config);
		if (!expectBuildErrors) {
			this.buildServer.on("error", (err) => {
				this._t.fail(`Build server error: ${err.message}`);
			});
		} else {
			// For tests expecting errors, just log them but don't fail
			this.buildServer.on("error", () => {
				// Expected error -> no op
			});
		}
		this._reader = this.buildServer.getReader();
	}

	async requestResource({resource, assertions}) {
		this._sinon.resetHistory();
		const res = await this._reader.byPath(resource);
		// Apply assertions if provided
		if (assertions) {
			this._assertBuild(assertions);
		}
		return res;
	}

	async requestResources({resources, assertions}) {
		this._sinon.resetHistory();
		const returnedResources = await Promise.all(resources.map((resource) => this._reader.byPath(resource)));
		// Apply assertions if provided
		if (assertions) {
			this._assertBuild(assertions);
		}
		return returnedResources;
	}

	_assertBuild(assertions) {
		const {projects = {}} = assertions;
		const eventArgs = this._t.context.projectBuildStatusEventStub.args.map((args) => args[0]);

		const projectsInOrder = [];
		const seenProjects = new Set();
		const tasksByProject = {};

		for (const event of eventArgs) {
			if (!seenProjects.has(event.projectName)) {
				projectsInOrder.push(event.projectName);
				seenProjects.add(event.projectName);
			}
			if (!tasksByProject[event.projectName]) {
				tasksByProject[event.projectName] = {executed: [], skipped: []};
			}
			if (event.status === "task-skip") {
				tasksByProject[event.projectName].skipped.push(event.taskName);
			} else if (event.status === "task-start") {
				tasksByProject[event.projectName].executed.push(event.taskName);
			}
		}

		// Assert projects built in order
		const expectedProjects = Object.keys(projects);
		this._t.deepEqual(projectsInOrder, expectedProjects);

		// Assert skipped tasks per project
		for (const [projectName, expectedSkipped] of Object.entries(projects)) {
			const skippedTasks = expectedSkipped.skippedTasks || [];
			const actualSkipped = (tasksByProject[projectName]?.skipped || []).sort();
			const expectedArray = skippedTasks.sort();
			this._t.deepEqual(actualSkipped, expectedArray);
		}
	}
}
