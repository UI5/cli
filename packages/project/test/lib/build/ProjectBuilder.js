const test = require("ava");
const sinon = require("sinon");
const path = require("path");

const ProjectBuilder = require("../../../lib/build/ProjectBuilder");

function noop() {}

function getMockProject(type, id = "b") {
	return {
		getName: () => "project." + id,
		getNamespace: () => "project/" + id,
		getType: () => type,
		getCopyright: noop,
		getVersion: noop,
		getSpecVersion: () => "0.1",
	};
}

test.beforeEach((t) => {
	t.context.getRootNameStub = sinon.stub().returns("root.node");
	t.context.getRootTypeStub = sinon.stub().returns("application");
	t.context.graph = {
		getRoot: () => {
			return {
				getName: t.context.getRootNameStub,
				getType: t.context.getRootTypeStub,
			};
		},
		isSealed: sinon.stub().returns(true),
		getAllProjects: sinon.stub().returns([getMockProject("library")]),
		traverseBreadthFirst: sinon.stub(),
		traverseDepthFirst: sinon.stub().callsArgWith(0, {project: getMockProject("library")}),
		getProject: sinon.stub().returns(getMockProject("library"))
	};
});

test.afterEach.always(() => {
	sinon.restore();
});

test("Missing graph parameter", async (t) => {
	const err = t.throws(() => {
		new ProjectBuilder();
	});
	t.is(err.message, "Missing parameter 'graph'",
		"Threw with expected error message");
});

test("build", async (t) => {
	const {graph} = t.context;

	const builder = new ProjectBuilder(graph);

	const filterProjectStub = sinon.stub().returns(true);
	const getProjectFilterStub = sinon.stub(builder, "_getProjectFilter").resolves(filterProjectStub);

	const requiresBuildStub = sinon.stub().returns(true);
	const projectBuildContextMock = {
		getTaskRunner: () => {
			return {
				requiresBuild: requiresBuildStub
			};
		},
		getProject: sinon.stub().returns(getMockProject("library"))
	};
	const createRequiredBuildContextsStub = sinon.stub(builder, "_createRequiredBuildContexts")
		.returns(new Map().set("project.b", projectBuildContextMock));

	const registerCleanupSigHooksStub = sinon.stub(builder, "_registerCleanupSigHooks").returns("cleanup sig hooks");
	const buildProjectStub = sinon.stub(builder, "_buildProject").resolves();
	const writeResultsStub = sinon.stub(builder, "_writeResults").resolves();
	const deregisterCleanupSigHooksStub = sinon.stub(builder, "_deregisterCleanupSigHooks");
	const executeCleanupTasksStub = sinon.stub(builder, "_executeCleanupTasks").resolves();

	await builder.build({
		destPath: "dest/path",
		includedDependencies: ["dep a"],
		excludedDependencies: ["dep b"]
	});

	t.is(getProjectFilterStub.callCount, 1, "_getProjectFilter got called once");
	t.deepEqual(getProjectFilterStub.getCall(0).args[0], {
		explicitIncludes: ["dep a"],
		explicitExcludes: ["dep b"],
		complexDependencyIncludes: undefined
	}, "_getProjectFilter got called with correct arguments");

	t.is(createRequiredBuildContextsStub.callCount, 1, "_createRequiredBuildContexts got called once");
	t.deepEqual(createRequiredBuildContextsStub.getCall(0).args[0], ["project.b"],
		"_createRequiredBuildContexts got called with correct arguments");

	t.is(requiresBuildStub.callCount, 1, "TaskRunner#requiresBuild got called once");
	t.is(registerCleanupSigHooksStub.callCount, 1, "_registerCleanupSigHooksStub got called once");

	t.is(buildProjectStub.callCount, 1, "_buildProject got called once");
	t.is(buildProjectStub.getCall(0).args[0], projectBuildContextMock,
		"_buildProject got called with correct arguments");

	t.is(writeResultsStub.callCount, 1, "_writeResults got called once");
	t.is(writeResultsStub.getCall(0).args[0], projectBuildContextMock,
		"_writeResults got called with correct first argument");
	t.is(writeResultsStub.getCall(0).args[1]._fsBasePath, path.resolve("dest/path"),
		"_writeResults got called with correct second argument");

	t.is(deregisterCleanupSigHooksStub.callCount, 1, "_deregisterCleanupSigHooks got called once");
	t.is(deregisterCleanupSigHooksStub.getCall(0).args[0], "cleanup sig hooks",
		"_deregisterCleanupSigHooks got called with correct arguments");
	t.is(executeCleanupTasksStub.callCount, 1, "_executeCleanupTasksStub got called once");
});
