import test from "ava";
import sinonGlobal from "sinon";
import {fileURLToPath} from "node:url";
import {setTimeout} from "node:timers/promises";
import fs from "node:fs/promises";
import {graphFromPackageDependencies} from "../../../lib/graph/graph.js";
import {setLogLevel} from "@ui5/logger";

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

test.serial("Serve application.a, request application resource", async (t) => {
	const fixtureTester = new FixtureTester(t, "application.a");
	t.context.fixtureTester = fixtureTester;

	// #1 request with empty cache
	await fixtureTester.serveProject();
	await fixtureTester.requestResource("/test.js", {
		projects: {
			"application.a": {}
		}
	});

	// #2 request with cache
	await fixtureTester.requestResource("/test.js", {
		projects: {}
	});

	// Change a source file in application.a
	const changedFilePath = `${fixtureTester.fixturePath}/webapp/test.js`;
	await fs.appendFile(changedFilePath, `\ntest("line added");\n`);

	// #3 request with cache and changes
	const res = await fixtureTester.requestResource("/test.js", {
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
	});

	// Check whether the changed file is in the destPath
	const servedFileContent = await res.toString();
	t.true(servedFileContent.includes(`test("line added");`), "Resource contains changed file content");
});

test.serial("Serve application.a, request library resource", async (t) => {
	const fixtureTester = new FixtureTester(t, "application.a");
	t.context.fixtureTester = fixtureTester;

	// #1 request with empty cache
	await fixtureTester.serveProject();
	await fixtureTester.requestResource("/resources/library/a/.library", {
		projects: {
			"library.a": {}
		}
	});

	// #2 request with cache
	await fixtureTester.requestResource("/resources/library/a/.library", {
		projects: {}
	});

	// Change a source file in library.a
	const changedFilePath = `${fixtureTester.fixturePath}/node_modules/collection/library.a/src/library/a/.library`;
	await fs.appendFile(changedFilePath, `\n<!-- Test -->\n`);

	await setTimeout(500); // Wait for the file watcher to detect and propagate the change

	// #3 request with cache and changes
	const res = await fixtureTester.requestResource("/resources/library/a/.library", {
		projects: {
			"library.a": {
				skippedTasks: [
					"enhanceManifest",
					"escapeNonAsciiCharacters",
					"minify",
					// Note: replaceCopyright is skipped because no copyright is configured in the project
					"replaceBuildtime",
					"replaceCopyright",
					"replaceVersion",
				]
			}
		}
	});

	// Check whether the changed file is in the destPath
	const servedFileContent = await res.getString();
	t.true(servedFileContent.includes(`<!-- Test -->`), "Resource contains changed file content");
});

function getFixturePath(fixtureName) {
	return fileURLToPath(new URL(`../../fixtures/${fixtureName}`, import.meta.url));
}

function getTmpPath(folderName) {
	return fileURLToPath(new URL(`../../tmp/ProjectServer/${folderName}`, import.meta.url));
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
		if (this._buildServer) {
			await this._buildServer.destroy();
		}
	}

	async serveProject({graphConfig = {}, config = {}} = {}) {
		await this._initialize();

		const graph = await graphFromPackageDependencies({
			...graphConfig,
			cwd: this.fixturePath,
		});

		// Execute the build
		this._buildServer = await graph.serve(config);
		this._buildServer.on("error", (err) => {
			this._t.fail(`Build server error: ${err.message}`);
		});
		this._reader = this._buildServer.getReader();
	}

	async requestResource(resource, assertions = {}) {
		this._sinon.resetHistory();
		const res = await this._reader.byPath(resource);
		// Apply assertions if provided
		if (assertions) {
			this._assertBuild(assertions);
		}
		return res;
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
