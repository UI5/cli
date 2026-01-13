import test from "ava";
import sinonGlobal from "sinon";
import {fileURLToPath} from "node:url";
import ProjectGraph from "../../../lib/graph/ProjectGraph.js";
import ProjectBuilder from "../../../lib/build/ProjectBuilder.js";
import Application from "../../../lib/specifications/types/Application.js";
import * as taskRepository from "@ui5/builder/internal/taskRepository";

test.beforeEach((t) => {
	t.context.sinon = sinonGlobal.createSandbox();
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
	delete process.env.UI5_DATA_DIR;
});

test.serial("Build application project twice without changes", async (t) => {
	const {sinon} = t.context;

	process.env.UI5_DATA_DIR = getTmpPath("application.a/.ui5");

	async function createProjectBuilder() {
		const customApplicationProject = new Application();
		await customApplicationProject.init({
			"id": "application.a",
			"version": "1.0.0",
			"modulePath": getFixturePath("application.a"),
			"configuration": {
				"specVersion": "5.0",
				"type": "application",
				"metadata": {
					"name": "application.a"
				},
				"kind": "project"
			}
		});

		const graph = new ProjectGraph({
			rootProjectName: customApplicationProject.getName(),
		});
		graph.addProject(customApplicationProject);
		graph.seal(); // Graph needs to be sealed before building

		const buildConfig = {};

		const projectBuilder = new ProjectBuilder({
			graph,
			taskRepository,
			buildConfig
		});
		sinon.spy(projectBuilder, "_buildProject");
		return projectBuilder;
	}

	const destPath = getTmpPath("application.a/dist");

	let projectBuilder = await createProjectBuilder();

	// First build (with empty cache)
	await projectBuilder.build({destPath});

	t.is(projectBuilder._buildProject.callCount, 1);
	t.is(
		projectBuilder._buildProject.getCall(0).args[0].getProject().getName(),
		"application.a",
		"application.a built in first build"
	);

	// Second build (with cache, no changes)
	projectBuilder = await createProjectBuilder();

	await projectBuilder.build({destPath});

	t.is(projectBuilder._buildProject.callCount, 0, "No projects built in second build");
});

function getFixturePath(fixtureName) {
	return fileURLToPath(new URL(`../../fixtures/${fixtureName}`, import.meta.url));
}

function getTmpPath(folderName) {
	return fileURLToPath(new URL(`../../tmp/${folderName}`, import.meta.url));
}
