import test from "ava";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sinonGlobal from "sinon";

import {graphFromStaticFile} from "../../../lib/graph/graph.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const applicationHPath = path.join(__dirname, "..", "..", "fixtures", "application.h");
const applicationAPath = path.join(__dirname, "..", "..", "fixtures", "application.a");
const notExistingPath = path.join(__dirname, "..", "..", "fixtures", "does_not_exist");

test.beforeEach((t) => {
	t.context.sinon = sinonGlobal.createSandbox();
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});

test("Application H: Traverse project graph breadth first", async (t) => {
	const projectGraph = await graphFromStaticFile({
		cwd: applicationHPath
	});
	const callbackStub = t.context.sinon.stub().resolves();
	await projectGraph.traverseBreadthFirst(callbackStub);

	t.is(callbackStub.callCount, 2, "Two projects have been visited");

	const callbackCalls = callbackStub.getCalls().map((call) => call.args[0].project.getName());

	t.deepEqual(callbackCalls, [
		"application.a",
		"library.e",
	], "Traversed graph in correct order");
});

test("Throws error if file not found", async (t) => {
	const err = await t.throwsAsync(graphFromStaticFile({
		cwd: notExistingPath
	}));
	t.is(err.message,
		`Failed to load dependency tree configuration from path ` +
		`${path.join(notExistingPath, "projectDependencies.yaml")}: ` +
		`ENOENT: no such file or directory, open '${path.join(notExistingPath, "projectDependencies.yaml")}'`,
		"Correct error message");
});

test("Throws for missing id", async (t) => {
	const err = await t.throwsAsync(graphFromStaticFile({
		cwd: applicationHPath,
		filePath: "projectDependencies-missing-id.yaml"
	}));
	t.is(err.message,
		`Failed to load dependency tree configuration from path ` +
		`${path.join(applicationHPath, "projectDependencies-missing-id.yaml")}: ` +
		`Missing or empty attribute 'id' for project with path ${applicationAPath}`,
		"Correct error message");
});

test("Throws for missing version", async (t) => {
	const err = await t.throwsAsync(graphFromStaticFile({
		cwd: applicationHPath,
		filePath: "projectDependencies-missing-version.yaml"
	}));
	t.is(err.message,
		`Failed to load dependency tree configuration from path ` +
		`${path.join(applicationHPath, "projectDependencies-missing-version.yaml")}: ` +
		`Missing or empty attribute 'version' for project static-application.a`,
		"Correct error message");
});

test("Throws for missing path", async (t) => {
	const err = await t.throwsAsync(graphFromStaticFile({
		cwd: applicationHPath,
		filePath: "projectDependencies-missing-path.yaml"
	}));
	t.is(err.message,
		`Failed to load dependency tree configuration from path ` +
		`${path.join(applicationHPath, "projectDependencies-missing-path.yaml")}: ` +
		`Missing or empty attribute 'path' for project static-library.e`,
		"Correct error message");
});

test("rootConfiguration", async (t) => {
	const projectGraph = await graphFromStaticFile({
		cwd: applicationHPath,
		rootConfiguration: {
			specVersion: "2.6",
			type: "application",
			metadata: {
				name: "application.a"
			},
			customConfiguration: {
				rootConfigurationTest: true
			}
		}
	});
	t.deepEqual(projectGraph.getRoot().getCustomConfiguration(), {
		rootConfigurationTest: true
	});
});

test("rootConfig", async (t) => {
	const projectGraph = await graphFromStaticFile({
		cwd: applicationHPath,
		rootConfigPath: "ui5-test-configPath.yaml"
	});
	t.deepEqual(projectGraph.getRoot().getCustomConfiguration(), {
		configPathTest: true
	});
});
