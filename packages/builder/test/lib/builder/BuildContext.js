const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");

test.afterEach.always((t) => {
	sinon.restore();
	mock.stopAll();
});

const BuildContext = require("../../../lib/builder/BuildContext");

test("Missing parameters", (t) => {
	const error = t.throws(() => {
		new BuildContext({});
	});

	t.is(error.message, `Missing parameter 'rootProject'`, "Threw with expected error message");
});

test("getRootProject", (t) => {
	const buildContext = new BuildContext({
		rootProject: "pony"
	});

	t.is(buildContext.getRootProject(), "pony", "Returned correct value");
});

test.serial("createProjectContext", (t) => {
	class DummyProjectContext {
		constructor({buildContext, project, resources, globalTags}) {
			t.is(buildContext, testBuildContext, "Correct buildContext parameter");
			t.is(project, "project", "Correct project parameter");
			t.is(resources, "resources", "Correct resources parameter");
			t.deepEqual(globalTags, {
				IsDebugVariant: "ui5:IsDebugVariant",
				HasDebugVariant: "ui5:HasDebugVariant",
			}, "Correct globalTags parameter");
		}
	}
	mock("../../../lib/builder/ProjectBuildContext", DummyProjectContext);

	const BuildContext = mock.reRequire("../../../lib/builder/BuildContext");
	const testBuildContext = new BuildContext({
		rootProject: "pony"
	});

	const projectContext = testBuildContext.createProjectContext({
		project: "project",
		resources: "resources"
	});

	t.true(projectContext instanceof DummyProjectContext,
		"Project context is an instance of DummyProjectContext");
	t.is(testBuildContext.projectBuildContexts[0], projectContext,
		"BuildContext stored correct ProjectBuildContext");
});

test("executeCleanupTasks", async (t) => {
	const buildContext = new BuildContext({
		rootProject: "pony"
	});

	const executeCleanupTasks = sinon.stub().resolves();

	buildContext.projectBuildContexts.push({
		executeCleanupTasks
	});
	buildContext.projectBuildContexts.push({
		executeCleanupTasks
	});

	await buildContext.executeCleanupTasks();

	t.is(executeCleanupTasks.callCount, 2,
		"Project context executeCleanupTasks got called twice");
});

test.serial("getResourceTagCollection", (t) => {
	class DummyResourceTagCollection {
		constructor({allowedTags, superCollection}) {
			t.deepEqual(allowedTags, [
				"ui5:IsDebugVariant",
				"ui5:HasDebugVariant",
			],
			"Correct allowedTags parameter supplied");
		}
	}
	mock("@ui5/fs", {
		ResourceTagCollection: DummyResourceTagCollection
	});

	const BuildContext = mock.reRequire("../../../lib/builder/BuildContext");
	const buildContext = new BuildContext({
		rootProject: "pony"
	});

	const collection = buildContext.getResourceTagCollection();

	t.true(collection instanceof DummyResourceTagCollection,
		"Returned an instance of mocked DummyResourceTagCollection");
});
