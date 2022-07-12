const test = require("ava");
const sinon = require("sinon");
const path = require("path");
const mock = require("mock-require");

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
	t.context.getRootNameStub = sinon.stub().returns("project.a");
	t.context.getRootTypeStub = sinon.stub().returns("application");
	t.context.graph = {
		getRoot: () => {
			return {
				getName: t.context.getRootNameStub,
				getType: t.context.getRootTypeStub,
			};
		},
		isSealed: sinon.stub().returns(true),
		getAllProjects: sinon.stub().returns([
			getMockProject("library", "a"),
			getMockProject("library", "b"),
			getMockProject("library", "c"),
		]),
		getDependencies: sinon.stub().returns([]).withArgs("project.a").returns(["project.b"]),
		traverseBreadthFirst: sinon.stub(),
		traverseDepthFirst: sinon.stub().callsArgWith(0, {project: getMockProject("library", "a")}),
		getProject: sinon.stub().returns(getMockProject("project", "b"))
	};
});

test.afterEach.always(() => {
	sinon.restore();
	mock.stopAll();
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
		.returns(new Map().set("project.a", projectBuildContextMock));

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
	t.deepEqual(createRequiredBuildContextsStub.getCall(0).args[0], [
		"project.a", "project.b", "project.c"
	], "_createRequiredBuildContexts got called with correct arguments");

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

test("_createRequiredBuildContexts", async (t) => {
	const {graph} = t.context;

	const builder = new ProjectBuilder(graph);

	const requiresBuildStub = sinon.stub().returns(true);
	const requiresDependenciesStub = sinon.stub().returns(false).onFirstCall().returns(true);
	const projectBuildContextMock = {
		getTaskRunner: () => {
			return {
				requiresBuild: requiresBuildStub,
				requiresDependencies: requiresDependenciesStub
			};
		}
	};
	const createProjectContextStub = sinon.stub(builder._buildContext, "createProjectContext")
		.returns(projectBuildContextMock);
	const projectBuildContexts = builder._createRequiredBuildContexts(["project.a", "project.c"]);

	t.deepEqual(Object.fromEntries(projectBuildContexts), {
		"project.a": projectBuildContextMock,
		"project.b": projectBuildContextMock, // is a required dependency of project.a
		"project.c": projectBuildContextMock,
	}, "Returned expected project build contexts");

	t.is(requiresBuildStub.callCount, 3, "TaskRunner#requiresBuild got called three times");
	t.is(requiresDependenciesStub.callCount, 3, "TaskRunner#requiresDependencies got called three times");

	t.is(createProjectContextStub.callCount, 3, "BuildContext#createProjectContextStub got called three times");
	t.is(createProjectContextStub.getCall(0).args[0].project.getName(), "project.a",
		"First call to BuildContext#createProjectContextStub with expected project");
	t.truthy(createProjectContextStub.getCall(0).args[0].log,
		"First call to BuildContext#createProjectContextStub with a log instance");
	t.is(createProjectContextStub.getCall(1).args[0].project.getName(), "project.c",
		"Second call to BuildContext#createProjectContextStub with expected project");
	t.truthy(createProjectContextStub.getCall(1).args[0].log,
		"Second call to BuildContext#createProjectContextStub with a log instance");
	t.is(createProjectContextStub.getCall(2).args[0].project.getName(), "project.b",
		"Third call to BuildContext#createProjectContextStub with expected project");
	t.truthy(createProjectContextStub.getCall(2).args[0].log,
		"Third call to BuildContext#createProjectContextStub with a log instance");
});

test.serial("_getProjectFilter with complexDependencyIncludes", async (t) => {
	const {graph} = t.context;

	const composeProjectListStub = sinon.stub().returns({
		includedDependencies: ["project.b", "project.c"],
		excludedDependencies: ["project.d", "project.e", "project.a"],
	});
	mock("../../../lib/build/helpers/composeProjectList", composeProjectListStub);
	const ProjectBuilder = mock.reRequire("../../../lib/build/ProjectBuilder");
	const builder = new ProjectBuilder(graph);

	const filterProject = await builder._getProjectFilter({
		complexDependencyIncludes: "complexDependencyIncludes",
		explicitIncludes: "explicitIncludes",
		explicitExcludes: "explicitExcludes",
	});

	t.is(composeProjectListStub.callCount, 1, "composeProjectList got called once");
	t.is(composeProjectListStub.getCall(0).args[0], graph,
		"composeProjectList got called with correct graph argument");
	t.is(composeProjectListStub.getCall(0).args[1], "complexDependencyIncludes",
		"composeProjectList got called with correct include/exclude argument");

	t.true(filterProject("project.a"), "project.a (root project) is always allowed");
	t.true(filterProject("project.b"), "project.b is allowed");
	t.true(filterProject("project.c"), "project.c is allowed");
	t.false(filterProject("project.d"), "project.d is not allowed");
	t.false(filterProject("project.e"), "project.e is not allowed");
});

test.serial("_getProjectFilter with explicit include/exclude", async (t) => {
	const {graph} = t.context;

	const composeProjectListStub = sinon.stub().returns({
		includedDependencies: ["project.b", "project.c"],
		excludedDependencies: ["project.d", "project.e", "project.a"],
	});
	mock("../../../lib/build/helpers/composeProjectList", composeProjectListStub);
	const ProjectBuilder = mock.reRequire("../../../lib/build/ProjectBuilder");
	const builder = new ProjectBuilder(graph);

	const filterProject = await builder._getProjectFilter({
		explicitIncludes: "explicitIncludes",
		explicitExcludes: "explicitExcludes",
	});

	t.is(composeProjectListStub.callCount, 1, "composeProjectList got called once");
	t.is(composeProjectListStub.getCall(0).args[0], graph,
		"composeProjectList got called with correct graph argument");
	t.deepEqual(composeProjectListStub.getCall(0).args[1], {
		includeDependencyTree: "explicitIncludes",
		excludeDependencyTree: "explicitExcludes",
	}, "composeProjectList got called with correct include/exclude argument");

	t.true(filterProject("project.a"), "project.a (root project) is always allowed");
	t.true(filterProject("project.b"), "project.b is allowed");
	t.true(filterProject("project.c"), "project.c is allowed");
	t.false(filterProject("project.d"), "project.d is not allowed");
	t.false(filterProject("project.e"), "project.e is not allowed");
});

// TODO
// test("_buildProject", async (t) => {
// 	const {graph} = t.context;

// 	const builder = new ProjectBuilder(graph);

// 	const runTasksStub = sinon.stub().resolves();
// 	await builder._buildProject({
// 		getProject: () => getMockProject("library", "a"),
// 		getTaskRunner: () => {
// 			return {
// 				runTasks: runTasksStub
// 			};
// 		}
// 	});
// });

// test("_executeCleanupTasks", async (t) => {
// 	// TODO
// });

// test("_registerCleanupSigHooks", async (t) => {
// 	// TODO
// });

// test("_deregisterCleanupSigHooks", async (t) => {
// 	// TODO
// });

// test("_getElapsedTime", async (t) => {
// 	// TODO
// });
