import test from "ava";
import sinonGlobal from "sinon";
import {fileURLToPath} from "node:url";
import fs from "node:fs/promises";
import ProjectBuilder from "../../../lib/build/ProjectBuilder.js";
import * as taskRepository from "@ui5/builder/internal/taskRepository";
import {graphFromPackageDependencies} from "../../../lib/graph/graph.js";

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

test.afterEach.always((t) => {
	t.context.sinon.restore();
	delete process.env.UI5_DATA_DIR;

	process.off("ui5.log", t.context.logEventStub);
	process.off("ui5.build-metadata", t.context.buildMetadataEventStub);
	process.off("ui5.project-build-metadata", t.context.projectBuildMetadataEventStub);
	process.off("ui5.build-status", t.context.buildStatusEventStub);
	process.off("ui5.project-build-status", t.context.projectBuildStatusEventStub);
});

test.serial("Build application.a project multiple times", async (t) => {
	const fixtureTester = new FixtureTester(t, "application.a");

	let projectBuilder; let buildStatusEventArgs;
	const destPath = fixtureTester.destPath;

	// #1 build (with empty cache)
	projectBuilder = await fixtureTester.createProjectBuilder();
	await projectBuilder.build({destPath, cleanDest: false /* No clean dest needed for build #1 */});

	t.is(projectBuilder._buildProject.callCount, 1);
	t.is(
		projectBuilder._buildProject.getCall(0).args[0].getProject().getName(),
		"application.a",
		"application.a built in build #1"
	);

	buildStatusEventArgs = t.context.projectBuildStatusEventStub.args.map((args) => args[0]);
	t.deepEqual(
		buildStatusEventArgs.filter(({status}) => status === "task-skip"), [],
		"No 'task-skip' status in build #1"
	);

	// #2 build (with cache, no changes)
	projectBuilder = await fixtureTester.createProjectBuilder();
	await projectBuilder.build({destPath, cleanDest: true});

	t.is(projectBuilder._buildProject.callCount, 0, "No projects built in build #2");

	// Change a source file in application.a
	const changedFilePath = `${fixtureTester.fixturePath}/webapp/test.js`;
	await fs.appendFile(changedFilePath, `\ntest("line added");\n`);

	// #3 build (with cache, with changes)
	projectBuilder = await fixtureTester.createProjectBuilder();
	await projectBuilder.build({destPath, cleanDest: true});

	t.is(projectBuilder._buildProject.callCount, 1);
	t.is(
		projectBuilder._buildProject.getCall(0).args[0].getProject().getName(),
		"application.a",
		"application.a rebuilt in build #3"
	);

	buildStatusEventArgs = t.context.projectBuildStatusEventStub.args.map((args) => args[0]);
	t.deepEqual(
		buildStatusEventArgs.filter(({status}) => status === "task-skip"), [
			{
				level: "info",
				projectName: "application.a",
				projectType: "application",
				status: "task-skip",
				taskName: "escapeNonAsciiCharacters",
			},
			// Note: replaceCopyright task is expected to be skipped as the project
			// does not define a copyright in its ui5.yaml.
			{
				level: "info",
				projectName: "application.a",
				projectType: "application",
				status: "task-skip",
				taskName: "replaceCopyright",
			},
			{
				level: "info",
				projectName: "application.a",
				projectType: "application",
				status: "task-skip",
				taskName: "enhanceManifest",
			},
			{
				level: "info",
				projectName: "application.a",
				projectType: "application",
				status: "task-skip",
				taskName: "generateFlexChangesBundle",
			},
		],
		"'task-skip' status in build #3 for tasks that did not need to be re-executed based on changed test.js file"
	);

	// Check whether the changed file is in the destPath
	const builtFileContent = await fs.readFile(`${destPath}/test.js`, {encoding: "utf8"});
	t.true(builtFileContent.includes(`test("line added");`), "Build dest contains changed file content");

	// #4 build (with cache, no changes)
	projectBuilder = await fixtureTester.createProjectBuilder();
	await projectBuilder.build({destPath, cleanDest: true});

	t.is(projectBuilder._buildProject.callCount, 0, "No projects built in build #4");

	// #5 build (with cache, no changes, with dependencies)
	projectBuilder = await fixtureTester.createProjectBuilder();
	await projectBuilder.build({destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}});

	t.is(projectBuilder._buildProject.callCount, 4, "Only dependency projects built in build #5");
	t.is(
		projectBuilder._buildProject.getCall(0).args[0].getProject().getName(),
		"library.d",
	);
	t.is(
		projectBuilder._buildProject.getCall(1).args[0].getProject().getName(),
		"library.a",
	);
	t.is(
		projectBuilder._buildProject.getCall(2).args[0].getProject().getName(),
		"library.b",
	);
	t.is(
		projectBuilder._buildProject.getCall(3).args[0].getProject().getName(),
		"library.c",
	);

	// #6 build (with cache, no changes)
	projectBuilder = await fixtureTester.createProjectBuilder();
	await projectBuilder.build({destPath, cleanDest: true});

	t.is(projectBuilder._buildProject.callCount, 0, "No projects built in build #6");
});

test.serial("Build library.d project multiple times", async (t) => {
	const fixtureTester = new FixtureTester(t, "library.d");

	let projectBuilder; let buildStatusEventArgs;
	const destPath = fixtureTester.destPath;

	// #1 build (with empty cache)
	projectBuilder = await fixtureTester.createProjectBuilder();
	await projectBuilder.build({destPath, cleanDest: false /* No clean dest needed for build #1 */});

	t.is(projectBuilder._buildProject.callCount, 1);
	t.is(
		projectBuilder._buildProject.getCall(0).args[0].getProject().getName(),
		"library.d",
		"library.d built in build #1"
	);

	buildStatusEventArgs = t.context.projectBuildStatusEventStub.args.map((args) => args[0]);
	t.deepEqual(
		buildStatusEventArgs.filter(({status}) => status === "task-skip"), [],
		"No 'task-skip' status in build #1"
	);

	// #2 build (with cache, no changes)
	projectBuilder = await fixtureTester.createProjectBuilder();
	await projectBuilder.build({destPath, cleanDest: true});

	t.is(projectBuilder._buildProject.callCount, 0, "No projects built in build #2");

	// Change a source file in library.d
	const changedFilePath = `${fixtureTester.fixturePath}/main/src/library/d/.library`;
	await fs.writeFile(
		changedFilePath,
		(await fs.readFile(changedFilePath, {encoding: "utf8"})).replace(
			`<copyright>Some fancy copyright</copyright>`,
			`<copyright>Some new fancy copyright</copyright>`
		)
	);

	// #3 build (with cache, with changes)
	projectBuilder = await fixtureTester.createProjectBuilder();
	await projectBuilder.build({destPath, cleanDest: true});

	t.is(projectBuilder._buildProject.callCount, 1);
	t.is(
		projectBuilder._buildProject.getCall(0).args[0].getProject().getName(),
		"library.d",
		"library.d rebuilt in build #3"
	);

	buildStatusEventArgs = t.context.projectBuildStatusEventStub.args.map((args) => args[0]);
	t.deepEqual(
		buildStatusEventArgs.filter(({status}) => status === "task-skip"), [],
		"No 'task-skip' status in build #3" // TODO: Is this correct?
	);

	// Check whether the changed file is in the destPath
	const builtFileContent = await fs.readFile(`${destPath}/resources/library/d/.library`, {encoding: "utf8"});
	t.true(
		builtFileContent.includes(`<copyright>Some new fancy copyright</copyright>`),
		"Build dest contains changed file content"
	);
	// Check whether the updated copyright replacement took place
	const builtSomeJsContent = await fs.readFile(`${destPath}/resources/library/d/some.js`, {encoding: "utf8"});
	t.true(
		builtSomeJsContent.includes(`Some new fancy copyright`),
		"Build dest contains updated copyright in some.js"
	);

	// #4 build (with cache, no changes)
	projectBuilder = await fixtureTester.createProjectBuilder();
	await projectBuilder.build({destPath, cleanDest: true});

	t.is(projectBuilder._buildProject.callCount, 0, "No projects built in build #4");
});

function getFixturePath(fixtureName) {
	return fileURLToPath(new URL(`../../fixtures/${fixtureName}`, import.meta.url));
}

function getTmpPath(folderName) {
	return fileURLToPath(new URL(`../../tmp/${folderName}`, import.meta.url));
}

class FixtureTester {
	constructor(t, fixtureName) {
		this._sinon = t.context.sinon;
		this._fixtureName = fixtureName;
		this._initialized = false;

		// Public
		this.fixturePath = getTmpPath(fixtureName);
		this.destPath = getTmpPath(`${fixtureName}/dist`);
	}

	async _initialize() {
		if (this._initialized) {
			return;
		}
		process.env.UI5_DATA_DIR = getTmpPath(`${this._fixtureName}/.ui5`);
		await fs.cp(getFixturePath(this._fixtureName), this.fixturePath, {recursive: true});
		this._initialized = true;
	}

	async createProjectBuilder() {
		await this._initialize();
		this._sinon.resetHistory(); // Reset history of spies/stubs from previous builds (e.g. process event handlers)
		const graph = await graphFromPackageDependencies({
			cwd: this.fixturePath
		});
		graph.seal();
		const projectBuilder = new ProjectBuilder({
			graph,
			taskRepository,
			buildConfig: {}
		});
		this._sinon.spy(projectBuilder, "_buildProject");
		return projectBuilder;
	}
}
