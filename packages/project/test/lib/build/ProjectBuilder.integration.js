import test from "ava";
import sinonGlobal from "sinon";
import {fileURLToPath} from "node:url";
import fs from "node:fs/promises";
import ProjectBuilder from "../../../lib/build/ProjectBuilder.js";
import * as taskRepository from "@ui5/builder/internal/taskRepository";
import {graphFromPackageDependencies} from "../../../lib/graph/graph.js";

test.beforeEach((t) => {
	t.context.sinon = sinonGlobal.createSandbox();
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
	delete process.env.UI5_DATA_DIR;
});

test.serial("Build application project multiple times", async (t) => {
	const fixtureTester = new FixtureTester(t, "application.a");

	let projectBuilder;
	const destPath = fixtureTester.destPath;

	// #1 build (with empty cache)
	projectBuilder = await fixtureTester.createProjectBuilder();
	await projectBuilder.build({destPath});

	t.is(projectBuilder._buildProject.callCount, 1);
	t.is(
		projectBuilder._buildProject.getCall(0).args[0].getProject().getName(),
		"application.a",
		"application.a built in build #1"
	);

	// #2 build (with cache, no changes)
	projectBuilder = await fixtureTester.createProjectBuilder();
	await projectBuilder.build({destPath});

	t.is(projectBuilder._buildProject.callCount, 0, "No projects built in build #2");

	// Change a source file in application.a
	const changedFilePath = `${fixtureTester.fixturePath}/webapp/test.js`;
	await fs.appendFile(changedFilePath, `\ntest("line added");\n`);

	// #3 build (with cache, with changes)
	projectBuilder = await fixtureTester.createProjectBuilder();
	await projectBuilder.build({destPath});

	t.is(projectBuilder._buildProject.callCount, 1);
	t.is(
		projectBuilder._buildProject.getCall(0).args[0].getProject().getName(),
		"application.a",
		"application.a rebuilt in build #3"
	);

	// #4 build (with cache, no changes)
	projectBuilder = await fixtureTester.createProjectBuilder();
	await projectBuilder.build({destPath});

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
