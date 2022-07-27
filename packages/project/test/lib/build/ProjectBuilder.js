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
		getReader: () => "reader",
		getWorkspace: () => "workspace",
	};
}

test.beforeEach((t) => {
	t.context.getRootNameStub = sinon.stub().returns("project.a");
	t.context.getRootTypeStub = sinon.stub().returns("application");
	t.context.taskRepository = "taskRepository";
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
		traverseBreadthFirst: async (start, callback) => {
			if (callback) {
				await callback({
					project: getMockProject("library", "c")
				});
				return;
			}
			await start({
				project: getMockProject("library", "a")
			});
			await start({
				project: getMockProject("library", "c")
			});
			await start({
				project: getMockProject("library", "b")
			});
		},
		traverseDepthFirst: async (callback) => {
			await callback({
				project: getMockProject("library", "a")
			});
			await callback({
				project: getMockProject("library", "b")
			});
			await callback({
				project: getMockProject("library", "c")
			});
		},
		getProject: sinon.stub().returns(getMockProject("project", "b"))
	};
});

test.afterEach.always(() => {
	sinon.restore();
	mock.stopAll();
});

test("Missing graph parameters", async (t) => {
	const err1 = t.throws(() => {
		new ProjectBuilder();
	});
	t.is(err1.message, "Missing parameter 'graph'",
		"Threw with expected error message");

	const err2 = t.throws(() => {
		new ProjectBuilder("graph");
	});
	t.is(err2.message, "Missing parameter 'taskRepository'",
		"Threw with expected error message");
});

test("build", async (t) => {
	const {graph, taskRepository} = t.context;

	const builder = new ProjectBuilder(graph, taskRepository);

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

	t.is(requiresBuildStub.callCount, 2, "TaskRunner#requiresBuild got called twice");
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

test("build: Missing dest parameter", async (t) => {
	const {graph, taskRepository} = t.context;

	const builder = new ProjectBuilder(graph, taskRepository);

	const err = await t.throwsAsync(builder.build({
		destPath: "dest/path",
		complexDependencyIncludes: "complexDependencyIncludes",
		includedDependencies: ["dep a"],
		excludedDependencies: ["dep b"]
	}));

	t.is(err.message,
		"Parameter 'complexDependencyIncludes' can't be used in conjunction " +
		"with parameters 'includedDependencies' or 'excludedDependencies",
		"Threw with expected error message");
});

test("build: Too many dependency parameters", async (t) => {
	const {graph, taskRepository} = t.context;

	const builder = new ProjectBuilder(graph, taskRepository);

	const err = await t.throwsAsync(builder.build({
		includedDependencies: ["dep a"],
		excludedDependencies: ["dep b"]
	}));

	t.is(err.message, "Missing parameter 'destPath'", "Threw with expected error message");
});

test("build: Failure", async (t) => {
	const {graph, taskRepository} = t.context;

	const builder = new ProjectBuilder(graph, taskRepository);

	const filterProjectStub = sinon.stub().returns(true);
	sinon.stub(builder, "_getProjectFilter").resolves(filterProjectStub);

	const requiresBuildStub = sinon.stub().returns(true);
	const projectBuildContextMock = {
		getTaskRunner: () => {
			return {
				requiresBuild: requiresBuildStub
			};
		},
		getProject: sinon.stub().returns(getMockProject("library"))
	};
	sinon.stub(builder, "_createRequiredBuildContexts")
		.returns(new Map().set("project.a", projectBuildContextMock));

	sinon.stub(builder, "_registerCleanupSigHooks").returns("cleanup sig hooks");
	sinon.stub(builder, "_buildProject").rejects(new Error("Some Error"));
	const writeResultsStub = sinon.stub(builder, "_writeResults").resolves();
	const deregisterCleanupSigHooksStub = sinon.stub(builder, "_deregisterCleanupSigHooks");
	const executeCleanupTasksStub = sinon.stub(builder, "_executeCleanupTasks").resolves();

	const err = await t.throwsAsync(builder.build({
		destPath: "dest/path",
		includedDependencies: ["dep a"],
		excludedDependencies: ["dep b"]
	}));

	t.is(err.message, "Some Error", "Threw with expected error message");

	t.is(writeResultsStub.callCount, 0, "_writeResults did not get called");

	t.is(deregisterCleanupSigHooksStub.callCount, 1, "_deregisterCleanupSigHooks got called once");
	t.is(deregisterCleanupSigHooksStub.getCall(0).args[0], "cleanup sig hooks",
		"_deregisterCleanupSigHooks got called with correct arguments");
	t.is(executeCleanupTasksStub.callCount, 1, "_executeCleanupTasksStub got called once");
});

test.serial("build: Multiple projects", async (t) => {
	const {graph, taskRepository} = t.context;
	const builder = new ProjectBuilder(graph, taskRepository);

	const filterProjectStub = sinon.stub().returns(true).onFirstCall().returns(false);
	const getProjectFilterStub = sinon.stub(builder, "_getProjectFilter").resolves(filterProjectStub);

	const requiresBuildAStub = sinon.stub().returns(true);
	const requiresBuildBStub = sinon.stub().returns(false);
	const requiresBuildCStub = sinon.stub().returns(true);
	const getFormattedBuildMetadataStub = sinon.stub().returns({
		age: "xx days"
	});
	const projectBuildContextMockA = {
		getTaskRunner: () => {
			return {
				requiresBuild: requiresBuildAStub
			};
		},
		getProject: sinon.stub().returns(getMockProject("library", "a"))
	};
	const projectBuildContextMockB = {
		getTaskRunner: () => {
			return {
				requiresBuild: requiresBuildBStub,
				getFormattedBuildMetadata: getFormattedBuildMetadataStub
			};
		},
		getProject: sinon.stub().returns(getMockProject("library", "b"))
	};
	const projectBuildContextMockC = {
		getTaskRunner: () => {
			return {
				requiresBuild: requiresBuildCStub
			};
		},
		getProject: sinon.stub().returns(getMockProject("library", "c"))
	};
	const createRequiredBuildContextsStub = sinon.stub(builder, "_createRequiredBuildContexts")
		.returns(new Map()
			.set("project.a", projectBuildContextMockA)
			.set("project.b", projectBuildContextMockB)
			.set("project.c", projectBuildContextMockC)
		);

	const registerCleanupSigHooksStub = sinon.stub(builder, "_registerCleanupSigHooks").returns("cleanup sig hooks");
	const buildProjectStub = sinon.stub(builder, "_buildProject").resolves();
	const writeResultsStub = sinon.stub(builder, "_writeResults").resolves();
	const deregisterCleanupSigHooksStub = sinon.stub(builder, "_deregisterCleanupSigHooks");
	const executeCleanupTasksStub = sinon.stub(builder, "_executeCleanupTasks").resolves();

	await builder.build({
		destPath: "dest/path",
		complexDependencyIncludes: "complexDependencyIncludes"
	});

	t.is(getProjectFilterStub.callCount, 1, "_getProjectFilter got called once");
	t.deepEqual(getProjectFilterStub.getCall(0).args[0], {
		explicitIncludes: [],
		explicitExcludes: [],
		complexDependencyIncludes: "complexDependencyIncludes"
	}, "_getProjectFilter got called with correct arguments");

	t.is(createRequiredBuildContextsStub.callCount, 1, "_createRequiredBuildContexts got called once");
	t.deepEqual(createRequiredBuildContextsStub.getCall(0).args[0], [
		"project.b", "project.c"
	], "_createRequiredBuildContexts got called with correct arguments");

	t.is(requiresBuildAStub.callCount, 2, "TaskRunner#requiresBuild got called twice times for library.a");
	t.is(requiresBuildBStub.callCount, 2, "TaskRunner#requiresBuild got called twice times for library.b");
	t.is(requiresBuildCStub.callCount, 2, "TaskRunner#requiresBuild got called twice times for library.c");
	t.is(registerCleanupSigHooksStub.callCount, 1, "_registerCleanupSigHooksStub got called once");

	t.is(buildProjectStub.callCount, 2, "_buildProject got called three times"); // library.b does not require a build
	t.is(buildProjectStub.getCall(0).args[0], projectBuildContextMockA,
		"_buildProject got called with correct arguments");
	t.is(buildProjectStub.getCall(1).args[0], projectBuildContextMockC,
		"_buildProject got called with correct arguments");

	t.is(writeResultsStub.callCount, 2, "_writeResults got called twice"); // library.a has not been requested
	t.is(writeResultsStub.getCall(0).args[0], projectBuildContextMockB,
		"_writeResults got called with correct first argument");
	t.is(writeResultsStub.getCall(0).args[1]._fsBasePath, path.resolve("dest/path"),
		"_writeResults got called with correct second argument");
	t.is(writeResultsStub.getCall(1).args[0], projectBuildContextMockC,
		"_writeResults got called with correct first argument");
	t.is(writeResultsStub.getCall(1).args[1]._fsBasePath, path.resolve("dest/path"),
		"_writeResults got called with correct second argument");

	t.is(deregisterCleanupSigHooksStub.callCount, 1, "_deregisterCleanupSigHooks got called once");
	t.is(deregisterCleanupSigHooksStub.getCall(0).args[0], "cleanup sig hooks",
		"_deregisterCleanupSigHooks got called with correct arguments");
	t.is(executeCleanupTasksStub.callCount, 1, "_executeCleanupTasksStub got called once");
});

test("_createRequiredBuildContexts", async (t) => {
	const {graph, taskRepository} = t.context;

	const builder = new ProjectBuilder(graph, taskRepository);

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
	const {graph, taskRepository} = t.context;

	const composeProjectListStub = sinon.stub().returns({
		includedDependencies: ["project.b", "project.c"],
		excludedDependencies: ["project.d", "project.e", "project.a"],
	});
	mock("../../../lib/build/helpers/composeProjectList", composeProjectListStub);
	const ProjectBuilder = mock.reRequire("../../../lib/build/ProjectBuilder");
	const builder = new ProjectBuilder(graph, taskRepository);

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
	const {graph, taskRepository} = t.context;

	const composeProjectListStub = sinon.stub().returns({
		includedDependencies: ["project.b", "project.c"],
		excludedDependencies: ["project.d", "project.e", "project.a"],
	});
	mock("../../../lib/build/helpers/composeProjectList", composeProjectListStub);
	const ProjectBuilder = mock.reRequire("../../../lib/build/ProjectBuilder");
	const builder = new ProjectBuilder(graph, taskRepository);

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

test.serial("_buildProject", async (t) => {
	const {graph, taskRepository} = t.context;
	const builder = new ProjectBuilder(graph, taskRepository);

	const readerCollectionStub = sinon.stub(require("@ui5/fs").resourceFactory, "createReaderCollection")
		.returns("dependencies");

	const runTasksStub = sinon.stub().resolves();
	await builder._buildProject({
		getProject: () => getMockProject("library", "a"),
		getTaskRunner: () => {
			return {
				runTasks: runTasksStub
			};
		}
	});

	t.is(readerCollectionStub.callCount, 1, "One reader collection created");
	t.deepEqual(readerCollectionStub.getCall(0).args[0], {
		name: "Dependency reader collection for project project.a",
		readers: ["reader"]
	}, "Reader collection got created with expected arguments");

	t.is(runTasksStub.callCount, 1, "TaskRunner#runTasks got called once");
	t.deepEqual(runTasksStub.getCall(0).args[0], {
		workspace: "workspace",
		dependencies: "dependencies",
	}, "TaskRunner#runTasks got called with expected arguments");
});

test.serial("_buildProject: Requested project is not added to readers", async (t) => {
	const {graph, taskRepository} = t.context;
	const builder = new ProjectBuilder(graph, taskRepository);

	const readerCollectionStub = sinon.stub(require("@ui5/fs").resourceFactory, "createReaderCollection")
		.returns("dependencies");

	const runTasksStub = sinon.stub().resolves();
	await builder._buildProject({
		getProject: () => getMockProject("library", "c"),
		getTaskRunner: () => {
			return {
				runTasks: runTasksStub
			};
		}
	});

	t.is(readerCollectionStub.callCount, 1, "One reader collection created");
	t.deepEqual(readerCollectionStub.getCall(0).args[0], {
		name: "Dependency reader collection for project project.c",
		readers: []
	}, "Reader collection got created with expected arguments");

	t.is(runTasksStub.callCount, 1, "TaskRunner#runTasks got called once");
	t.deepEqual(runTasksStub.getCall(0).args[0], {
		workspace: "workspace",
		dependencies: "dependencies",
	}, "TaskRunner#runTasks got called with expected arguments");
});

test("_writeResults", async (t) => {
	t.context.getRootTypeStub = sinon.stub().returns("library");
	const {graph, taskRepository} = t.context;
	const builder = new ProjectBuilder(graph, taskRepository, {
		createBuildManifest: false,
		otherBuildConfig: "yes"
	});

	const dummyResources = [{
		_resourceName: "resource.a",
		getPath: () => "resource.a"
	}, {
		_resourceName: "resource.b",
		getPath: () => "resource.b"
	}, {
		_resourceName: "resource.c",
		getPath: () => "resource.c"
	}];
	const byGlobStub = sinon.stub().resolves(dummyResources);
	const getReaderStub = sinon.stub().returns({
		byGlob: byGlobStub
	});
	const mockProject = getMockProject("library", "c");
	mockProject.getReader = getReaderStub;

	const getTagStub = sinon.stub().returns(false).onFirstCall().returns(true);
	const projectBuildContextMock = {
		getProject: () => mockProject,
		getTaskUtil: () => {
			return {
				isRootProject: () => false,
				getTag: getTagStub,
				STANDARD_TAGS: {
					OmitFromBuildResult: "OmitFromBuildResultTag"
				}
			};
		}
	};
	const writerMock = {
		write: sinon.stub().resolves()
	};

	await builder._writeResults(projectBuildContextMock, writerMock);

	t.is(getReaderStub.callCount, 1, "One reader requested");
	t.deepEqual(getReaderStub.getCall(0).args[0], {
		style: "runtime"
	}, "Reader requested expected style");

	t.is(byGlobStub.callCount, 1, "One byGlob call");
	t.is(byGlobStub.getCall(0).args[0], "/**/*", "byGlob called with expected pattern");

	t.is(getTagStub.callCount, 3, "TaskUtil#getTag got called three times");
	t.is(getTagStub.getCall(0).args[0], dummyResources[0], "TaskUtil#getTag called with first resource");
	t.is(getTagStub.getCall(0).args[1], "OmitFromBuildResultTag", "TaskUtil#getTag called with correct tag value");
	t.is(getTagStub.getCall(1).args[0], dummyResources[1], "TaskUtil#getTag called with second resource");
	t.is(getTagStub.getCall(1).args[1], "OmitFromBuildResultTag", "TaskUtil#getTag called with correct tag value");
	t.is(getTagStub.getCall(2).args[0], dummyResources[2], "TaskUtil#getTag called with third resource");
	t.is(getTagStub.getCall(2).args[1], "OmitFromBuildResultTag", "TaskUtil#getTag called with correct tag value");

	t.is(writerMock.write.callCount, 2, "Write got called twice");
	t.is(writerMock.write.getCall(0).args[0], dummyResources[1], "Write got called with second resource");
	t.is(writerMock.write.getCall(1).args[0], dummyResources[2], "Write got called with third resource");
});

test.serial("_writeResults: Create build manifest", async (t) => {
	t.context.getRootTypeStub = sinon.stub().returns("library");
	const {graph, taskRepository} = t.context;

	const createBuildManifestStub = sinon.stub().returns({"build": "manifest"});
	mock("../../../lib/build/helpers/createBuildManifest", createBuildManifestStub);
	const ProjectBuilder = mock.reRequire("../../../lib/build/ProjectBuilder");
	const builder = new ProjectBuilder(graph, taskRepository, {
		createBuildManifest: true,
		otherBuildConfig: "yes"
	});

	const createResourceStub = sinon.stub(require("@ui5/fs").resourceFactory, "createResource")
		.returns("build manifest resource");

	const dummyResources = [{
		_resourceName: "resource.a",
		getPath: () => "resource.a"
	}, {
		_resourceName: "resource.b",
		getPath: () => "resource.b"
	}, {
		_resourceName: "resource.c",
		getPath: () => "resource.c"
	}];
	const byGlobStub = sinon.stub().resolves(dummyResources);
	const getReaderStub = sinon.stub().returns({
		byGlob: byGlobStub
	});
	const mockProject = getMockProject("library", "c");
	mockProject.getReader = getReaderStub;

	const getTagStub = sinon.stub().returns(false).onFirstCall().returns(true);
	const projectBuildContextMock = {
		getProject: () => mockProject,
		getTaskUtil: () => {
			return {
				isRootProject: () => true,
				getTag: getTagStub,
				STANDARD_TAGS: {
					OmitFromBuildResult: "OmitFromBuildResultTag"
				}
			};
		}
	};
	const writerMock = {
		write: sinon.stub().resolves()
	};

	await builder._writeResults(projectBuildContextMock, writerMock);

	t.is(getReaderStub.callCount, 1, "One reader requested");
	t.deepEqual(getReaderStub.getCall(0).args[0], {
		style: "buildtime"
	}, "Reader requested expected style");

	t.is(byGlobStub.callCount, 1, "One byGlob call");
	t.is(byGlobStub.getCall(0).args[0], "/**/*", "byGlob called with expected pattern");

	t.is(createBuildManifestStub.callCount, 1, "createBuildManifest got called once");
	t.is(createBuildManifestStub.getCall(0).args[0], mockProject,
		"createBuildManifest got called with correct project");
	t.deepEqual(createBuildManifestStub.getCall(0).args[1], {
		createBuildManifest: true,
		cssVariables: false,
		excludedTasks: [],
		includedTasks: [],
		jsdoc: false,
		selfContained: false,
	}, "createBuildManifest got called with correct build configuration");

	t.is(createResourceStub.callCount, 1, "One resource has been created");
	t.deepEqual(createResourceStub.getCall(0).args[0], {
		path: "/.ui5/build-manifest.json",
		string: `{
	"build": "manifest"
}`
	}, "Build manifest resource has been created with correct arguments");

	t.is(getTagStub.callCount, 3, "TaskUtil#getTag got called three times");
	t.is(getTagStub.getCall(0).args[0], dummyResources[0], "TaskUtil#getTag called with first resource");
	t.is(getTagStub.getCall(0).args[1], "OmitFromBuildResultTag", "TaskUtil#getTag called with correct tag value");
	t.is(getTagStub.getCall(1).args[0], dummyResources[1], "TaskUtil#getTag called with second resource");
	t.is(getTagStub.getCall(1).args[1], "OmitFromBuildResultTag", "TaskUtil#getTag called with correct tag value");
	t.is(getTagStub.getCall(2).args[0], dummyResources[2], "TaskUtil#getTag called with third resource");
	t.is(getTagStub.getCall(2).args[1], "OmitFromBuildResultTag", "TaskUtil#getTag called with correct tag value");

	t.is(writerMock.write.callCount, 3, "Write got called three times");
	t.is(writerMock.write.getCall(0).args[0], "build manifest resource", "Write got called with build manifest");
	t.is(writerMock.write.getCall(1).args[0], dummyResources[1], "Write got called with second resource");
	t.is(writerMock.write.getCall(2).args[0], dummyResources[2], "Write got called with third resource");
});

test("_writeResults: Do not create build manifest for non-root project", async (t) => {
	t.context.getRootTypeStub = sinon.stub().returns("library");
	const {graph, taskRepository} = t.context;

	const builder = new ProjectBuilder(graph, taskRepository, {
		createBuildManifest: true
	});

	const dummyResources = [{
		_resourceName: "resource.a",
		getPath: () => "resource.a"
	}];
	const byGlobStub = sinon.stub().resolves(dummyResources);
	const getReaderStub = sinon.stub().returns({
		byGlob: byGlobStub
	});
	const mockProject = getMockProject("library", "c");
	mockProject.getReader = getReaderStub;

	const getTagStub = sinon.stub().returns(false);
	const projectBuildContextMock = {
		getProject: () => mockProject,
		getTaskUtil: () => {
			return {
				isRootProject: () => false,
				getTag: getTagStub,
				STANDARD_TAGS: {
					OmitFromBuildResult: "OmitFromBuildResultTag"
				}
			};
		}
	};
	const writerMock = {
		write: sinon.stub().resolves()
	};

	await builder._writeResults(projectBuildContextMock, writerMock);

	t.is(getReaderStub.callCount, 1, "One reader requested");
	t.deepEqual(getReaderStub.getCall(0).args[0], {
		style: "runtime"
	}, "Reader requested expected style");

	t.is(getTagStub.callCount, 1, "TaskUtil#getTag got called once");

	t.is(writerMock.write.callCount, 1, "Write got called once");
	t.is(writerMock.write.getCall(0).args[0], dummyResources[0], "Write got called with only resource");
});

test("_executeCleanupTasks", async (t) => {
	const {graph, taskRepository} = t.context;
	const builder = new ProjectBuilder(graph, taskRepository);

	const executeCleanupTasksStub = sinon.stub(builder._buildContext, "executeCleanupTasks");
	builder._executeCleanupTasks();
	t.is(executeCleanupTasksStub.callCount, 1, "BuildContext#executeCleanupTasks got called once");
	t.deepEqual(executeCleanupTasksStub.getCall(0).args, [],
		"BuildContext#executeCleanupTasks got called with no arguments");
});


function getProcessListenerCount() {
	return ["SIGHUP", "SIGINT", "SIGTERM", "SIGBREAK"].map((eventName) => {
		return process.listenerCount(eventName);
	});
}
test.serial("_registerCleanupSigHooks/_deregisterCleanupSigHooks", async (t) => {
	const listenersBefore = getProcessListenerCount();

	const {graph, taskRepository} = t.context;
	const builder = new ProjectBuilder(graph, taskRepository);

	const signals = builder._registerCleanupSigHooks();

	t.deepEqual(Object.keys(signals), ["SIGHUP", "SIGINT", "SIGTERM", "SIGBREAK"],
		"Returned four signal listeners");

	t.deepEqual(getProcessListenerCount(), listenersBefore.map((x) => x+1),
		"For every signal one new listener got registered");

	builder._deregisterCleanupSigHooks(signals);

	t.deepEqual(getProcessListenerCount(), listenersBefore,
		"All signal listeners got de-registered");
});

test("_getElapsedTime", async (t) => {
	const {graph, taskRepository} = t.context;
	const builder = new ProjectBuilder(graph, taskRepository);

	const res = builder._getElapsedTime(process.hrtime());
	t.truthy(res, "Returned a value");
});
