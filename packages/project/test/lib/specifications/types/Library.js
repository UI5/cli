import test from "ava";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sinonGlobal from "sinon";
import Library from "../../../../lib/specifications/types/Library.js";

function clone(obj) {
	return JSON.parse(JSON.stringify(obj));
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const libraryDPath = path.join(__dirname, "..", "..", "..", "fixtures", "library.d");
const basicProjectInput = {
	id: "library.d.id",
	version: "1.0.0",
	modulePath: libraryDPath,
	configuration: {
		specVersion: "2.3",
		kind: "project",
		type: "library",
		metadata: {
			name: "library.d",
		},
		resources: {
			configuration: {
				paths: {
					src: "main/src",
					test: "main/test"
				}
			}
		},
	}
};

const libraryHPath = path.join(__dirname, "..", "..", "..", "fixtures", "library.h");
const flatProjectInput = {
	id: "library.d.id",
	version: "1.0.0",
	modulePath: libraryHPath,
	configuration: {
		specVersion: "2.6",
		kind: "project",
		type: "library",
		metadata: {
			name: "library.h",
		}
	}
};

test.beforeEach((t) => {
	t.context.sinon = sinonGlobal.createSandbox();
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});

test("getNamespace", async (t) => {
	const project = await (new Library().init(basicProjectInput));
	t.is(project.getNamespace(), "library/d",
		"Returned correct namespace");
});

test("getSourcePath", async (t) => {
	const project = await (new Library().init(basicProjectInput));
	t.is(project.getSourcePath(), path.join(libraryDPath, "main", "src"),
		"Returned correct source path");
});

test("getPropertiesFileSourceEncoding: Default", async (t) => {
	const project = await (new Library().init(basicProjectInput));
	t.is(project.getPropertiesFileSourceEncoding(), "UTF-8",
		"Returned correct default propertiesFileSourceEncoding configuration");
});

test("getPropertiesFileSourceEncoding: Configuration", async (t) => {
	const customProjectInput = clone(basicProjectInput);
	customProjectInput.configuration.resources.configuration.propertiesFileSourceEncoding = "ISO-8859-1";
	const project = await (new Library().init(customProjectInput));
	t.is(project.getPropertiesFileSourceEncoding(), "ISO-8859-1",
		"Returned correct default propertiesFileSourceEncoding configuration");
});

test("getJsdocExcludes", async (t) => {
	const customProjectInput = clone(basicProjectInput);
	customProjectInput.configuration.builder = {
		jsdoc: {
			excludes: ["excludes"]
		}
	};
	const project = await (new Library().init(customProjectInput));
	t.deepEqual(project.getJsdocExcludes(), ["excludes"],
		"Returned correct jsdocExcludes configuration");
});

test("getJsdocExcludes: default", async (t) => {
	const project = await (new Library().init(basicProjectInput));
	t.deepEqual(project.getJsdocExcludes(), [],
		"Returned correct jsdocExcludes configuration");
});

test("Access project resources via reader: buildtime style", async (t) => {
	const project = await (new Library().init(basicProjectInput));
	const reader = project.getReader();
	const resource = await reader.byPath("/resources/library/d/.library");
	t.truthy(resource, "Found the requested resource");
	t.is(resource.getPath(), "/resources/library/d/.library", "Resource has correct path");
});

test("Access project resources via reader: flat style", async (t) => {
	const project = await (new Library().init(basicProjectInput));
	const reader = project.getReader({style: "flat"});
	const resource = await reader.byPath("/.library");
	t.truthy(resource, "Found the requested resource");
	t.is(resource.getPath(), "/.library", "Resource has correct path");
});

test("Access project test-resources via reader: buildtime style", async (t) => {
	const project = await (new Library().init(basicProjectInput));
	const reader = project.getReader({style: "buildtime"});
	const resource = await reader.byPath("/test-resources/library/d/Test.html");
	t.truthy(resource, "Found the requested resource");
	t.is(resource.getPath(), "/test-resources/library/d/Test.html", "Resource has correct path");
});

test("Access project test-resources via reader: runtime style", async (t) => {
	const project = await (new Library().init(basicProjectInput));
	const reader = project.getReader({style: "runtime"});
	const resource = await reader.byPath("/test-resources/library/d/Test.html");
	t.truthy(resource, "Found the requested resource");
	t.is(resource.getPath(), "/test-resources/library/d/Test.html", "Resource has correct path");
});

test("Modify project resources via workspace and access via flat and runtime reader", async (t) => {
	const project = await (new Library().init(basicProjectInput));
	const workspace = project.getWorkspace();
	const workspaceResource = await workspace.byPath("/resources/library/d/.library");
	t.truthy(workspaceResource, "Found resource in workspace");

	const newContent = (await workspaceResource.getString()).replace("fancy", "fancy dancy");
	workspaceResource.setString(newContent);
	await workspace.write(workspaceResource);

	const flatReader = project.getReader({style: "flat"});
	const flatReaderResource = await flatReader.byPath("/.library");
	t.truthy(flatReaderResource, "Found the requested resource byPath (flat)");
	t.is(flatReaderResource.getPath(), "/.library", "Resource (byPath) has correct path (flat)");
	t.is(await flatReaderResource.getString(), newContent,
		"Found resource (byPath) has expected (changed) content (flat)");

	const flatGlobResult = await flatReader.byGlob("**/.library");
	t.is(flatGlobResult.length, 1, "Found the requested resource byGlob (flat)");
	t.is(flatGlobResult[0].getPath(), "/.library", "Resource (byGlob) has correct path (flat)");
	t.is(await flatGlobResult[0].getString(), newContent,
		"Found resource (byGlob) has expected (changed) content (flat)");

	const runtimeReader = project.getReader({style: "runtime"});
	const runtimeReaderResource = await runtimeReader.byPath("/resources/library/d/.library");
	t.truthy(runtimeReaderResource, "Found the requested resource byPath (runtime)");
	t.is(runtimeReaderResource.getPath(), "/resources/library/d/.library",
		"Resource (byPath) has correct path (runtime)");
	t.is(await runtimeReaderResource.getString(), newContent,
		"Found resource (byPath) has expected (changed) content (runtime)");

	const runtimeGlobResult = await runtimeReader.byGlob("**/.library");
	t.is(runtimeGlobResult.length, 1, "Found the requested resource byGlob (runtime)");
	t.is(runtimeGlobResult[0].getPath(), "/resources/library/d/.library",
		"Resource (byGlob) has correct path (runtime)");
	t.is(await runtimeGlobResult[0].getString(), newContent,
		"Found resource (byGlob) has expected (changed) content (runtime)");
});

test("Access flat project resources via reader: buildtime style", async (t) => {
	const project = await (new Library().init(flatProjectInput));
	const reader = project.getReader({style: "buildtime"});
	const resource = await reader.byPath("/resources/library/h/some.js");
	t.truthy(resource, "Found the requested resource");
	t.is(resource.getPath(), "/resources/library/h/some.js", "Resource has correct path");
});

test("_configureAndValidatePaths: Default paths", async (t) => {
	const libraryEPath = path.join(__dirname, "..", "..", "..", "fixtures", "library.e");
	const projectInput = {
		id: "library.e.id",
		version: "1.0.0",
		modulePath: libraryEPath,
		configuration: {
			specVersion: "2.6",
			kind: "project",
			type: "library",
			metadata: {
				name: "library.e",
			}
		}
	};

	const project = await (new Library().init(projectInput));

	t.is(project._srcPath, "src", "Correct default path for src");
	t.is(project._testPath, "test", "Correct default path for test");
	t.true(project._testPathExists, "Test path detected as existing");
});

test("_configureAndValidatePaths: Test directory does not exist", async (t) => {
	const projectInput = clone(basicProjectInput);
	projectInput.configuration.resources.configuration.paths.test = "does/not/exist";
	const project = await (new Library().init(projectInput));

	t.is(project._srcPath, "main/src", "Correct path for src");
	t.is(project._testPath, "does/not/exist", "Correct path for test");
	t.false(project._testPathExists, "Test path detected as non-existent");
});

test("_configureAndValidatePaths: Source directory does not exist", async (t) => {
	const projectInput = clone(basicProjectInput);
	projectInput.configuration.resources.configuration.paths.src = "does/not/exist";
	const err = await t.throwsAsync(new Library().init(projectInput));

	t.is(err.message, "Unable to find source directory 'does/not/exist' in library project library.d");
});

test("_parseConfiguration: Get copyright", async (t) => {
	const project = await (new Library().init(basicProjectInput));

	t.is(project.getCopyright(), "Some fancy copyright", "Copyright was read correctly");
});

test("_parseConfiguration: Copyright already configured", async (t) => {
	const projectInput = clone(basicProjectInput);
	projectInput.configuration.metadata.copyright = "My copyright";
	const project = await (new Library().init(projectInput));

	t.is(project.getCopyright(), "My copyright", "Copyright was not altered");
});

test.serial("_parseConfiguration: Copyright retrieval fails", async (t) => {
	const {sinon} = t.context;

	sinon.stub(Library.prototype, "_getCopyrightFromDotLibrary").resolves(null);
	const project = await (new Library().init(basicProjectInput));

	t.is(project.getCopyright(), undefined, "Copyright was not altered");
});

test.serial("_parseConfiguration: Preload excludes from .library", async (t) => {
	const {sinon} = t.context;

	sinon.stub(Library.prototype, "isFrameworkProject").returns(true);
	sinon.stub(Library.prototype, "_getPreloadExcludesFromDotLibrary").resolves(["test/exclude/**"]);

	const project = new Library();

	const loggerVerboseSpy = sinon.spy(project._log, "verbose");

	await project.init(basicProjectInput);

	t.deepEqual(project.getLibraryPreloadExcludes(), ["test/exclude/**"],
		"Correct library preload excludes have been set");

	t.deepEqual(loggerVerboseSpy.getCall(10).args, [
		"No preload excludes defined in project configuration of framework library library.d. " +
		"Falling back to .library..."
	]);
});

test("_parseConfiguration: Preload excludes from project configuration (non-framework library)", async (t) => {
	const projectInput = clone(basicProjectInput);
	projectInput.configuration.builder = {
		libraryPreload: {
			excludes: ["test/exclude/**"]
		}
	};
	const project = await (new Library().init(projectInput));

	t.deepEqual(project.getLibraryPreloadExcludes(), ["test/exclude/**"],
		"Correct library preload excludes have been set");
});

test.serial("_parseConfiguration: Preload exclude fallback to .library (framework libraries only)", async (t) => {
	const {sinon} = t.context;

	sinon.stub(Library.prototype, "isFrameworkProject").returns(true);
	sinon.stub(Library.prototype, "_getPreloadExcludesFromDotLibrary").resolves(["test/exclude/**"]);

	const project = new Library();

	const loggerVerboseSpy = sinon.spy(project._log, "verbose");

	await project.init(basicProjectInput);

	t.deepEqual(project.getLibraryPreloadExcludes(), ["test/exclude/**"],
		"Correct library preload excludes have been set");

	t.deepEqual(loggerVerboseSpy.getCall(10).args, [
		"No preload excludes defined in project configuration of framework library library.d. " +
		"Falling back to .library..."
	]);
});

test.serial("_parseConfiguration: No preload excludes from .library", async (t) => {
	const {sinon} = t.context;

	sinon.stub(Library.prototype, "isFrameworkProject").returns(true);
	sinon.stub(Library.prototype, "_getPreloadExcludesFromDotLibrary").resolves(null);

	const project = new Library();

	const loggerVerboseSpy = sinon.spy(project._log, "verbose");

	await project.init(basicProjectInput);

	t.deepEqual(project.getLibraryPreloadExcludes(), [],
		"No library preload excludes have been set");

	t.deepEqual(loggerVerboseSpy.getCall(10).args, [
		"No preload excludes defined in project configuration of framework library library.d. " +
		"Falling back to .library..."
	]);
});

test.serial("_parseConfiguration: Preload excludes from project configuration (framework library)", async (t) => {
	const {sinon} = t.context;

	sinon.stub(Library.prototype, "isFrameworkProject").returns(true);
	const getPreloadExcludesFromDotLibraryStub =
		sinon.stub(Library.prototype, "_getPreloadExcludesFromDotLibrary").resolves([]);

	const projectInput = clone(basicProjectInput);
	projectInput.configuration.builder = {
		libraryPreload: {
			excludes: ["test/exclude/**"]
		}
	};
	const project = new Library();

	const loggerVerboseSpy = sinon.spy(project._log, "verbose");

	await project.init(projectInput);

	t.deepEqual(project.getLibraryPreloadExcludes(), ["test/exclude/**"],
		"Correct library preload excludes have been set");

	t.deepEqual(loggerVerboseSpy.getCall(10).args, [
		"Using preload excludes for framework library library.d from project configuration"
	]);

	t.is(getPreloadExcludesFromDotLibraryStub.callCount, 0, "_getPreloadExcludesFromDotLibrary has not been called");
});

test.serial("_parseConfiguration: No preload exclude fallback for non-framework libraries", async (t) => {
	const {sinon} = t.context;

	sinon.stub(Library.prototype, "isFrameworkProject").returns(false);
	const getPreloadExcludesFromDotLibraryStub = sinon.stub(Library.prototype, "_getPreloadExcludesFromDotLibrary")
		.resolves(["test/exclude/**"]);
	const project = await (new Library().init(basicProjectInput));

	t.deepEqual(project.getLibraryPreloadExcludes(), [],
		"No library preload excludes have been set");
	t.is(getPreloadExcludesFromDotLibraryStub.callCount, 0, "_getPreloadExcludesFromDotLibrary has not been called");
});

test("_getManifest: Reads correctly", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	const byGlobStub = sinon.stub().resolves([{
		getString: async () => `{"pony": "no unicorn"}`,
		getPath: () => "some path"
	}]);

	project._getRawSourceReader = () => {
		return {
			byGlob: byGlobStub
		};
	};
	project._pManifest = null; // Clear cache from instantiation
	const {content, filePath} = await project._getManifest();
	t.is(content.pony, "no unicorn", "manifest.json content has been read");
	t.is(filePath, "some path", "Correct path");
	t.is(byGlobStub.callCount, 1, "byGlob got called once");
	t.is(byGlobStub.getCall(0).args[0], "**/manifest.json", "byGlob got called with the expected arguments");
});

test("_getManifest: No manifest.json", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	const byGlobStub = sinon.stub().resolves([]);

	project._getRawSourceReader = () => {
		return {
			byGlob: byGlobStub
		};
	};
	project._pManifest = null; // Clear cache from instantiation
	const error = await t.throwsAsync(project._getManifest());
	t.is(error.message,
		"Could not find manifest.json file for project library.d",
		"Rejected with correct error message");
});

test("_getManifest: Invalid JSON", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	const byGlobStub = sinon.stub().resolves([{
		getString: async () => `no pony`,
		getPath: () => "some path"
	}]);

	project._getRawSourceReader = () => {
		return {
			byGlob: byGlobStub
		};
	};
	project._pManifest = null; // Clear cache from instantiation
	const error = await t.throwsAsync(project._getManifest());
	t.regex(error.message, /^Failed to read some path for project library\.d: /,
		"Rejected with correct error message");
	t.is(byGlobStub.callCount, 1, "byGlob got called once");
	t.is(byGlobStub.getCall(0).args[0], "**/manifest.json", "byGlob got called with the expected arguments");
});

test("_getManifest: Propagates exception", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	const byGlobStub = sinon.stub().rejects(new Error("because shark"));

	project._getRawSourceReader = () => {
		return {
			byGlob: byGlobStub
		};
	};
	project._pManifest = null; // Clear cache from instantiation
	const error = await t.throwsAsync(project._getManifest());
	t.is(error.message,
		"because shark",
		"Rejected with correct error message");
});

test("_getManifest: Multiple manifest.json files", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	const byGlobStub = sinon.stub().resolves([{
		getString: async () => `{"pony": "no unicorn"}`,
		getPath: () => "some path"
	}, {
		getString: async () => `{"pony": "no shark"}`,
		getPath: () => "some other path"
	}]);

	project._getRawSourceReader = () => {
		return {
			byGlob: byGlobStub
		};
	};
	project._pManifest = null; // Clear cache from instantiation
	const error = await t.throwsAsync(project._getManifest());
	t.is(error.message, "Found multiple (2) manifest.json files for project library.d",
		"Rejected with correct error message");
});

test("_getManifest: Result is cached", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	const byGlobStub = sinon.stub().resolves([{
		getString: async () => `{"pony": "no unicorn"}`,
		getPath: () => "some path"
	}]);

	project._getRawSourceReader = () => {
		return {
			byGlob: byGlobStub
		};
	};
	project._pManifest = null; // Clear cache from instantiation
	const {content: content1, filePath: filePath1} = await project._getManifest();
	t.is(content1.pony, "no unicorn", "manifest.json content has been read");
	t.is(filePath1, "some path", "Correct path");
	t.is(byGlobStub.callCount, 1, "byGlob got called once");
	t.is(byGlobStub.getCall(0).args[0], "**/manifest.json", "byGlob got called with the expected arguments");
	const {content: content2, filePath: filePath2} = await project._getManifest();

	t.is(content2.pony, "no unicorn", "manifest.json content has been read");
	t.is(filePath2, "some path", "Correct path");
	t.is(byGlobStub.callCount, 1, "byGlob got called once");
	t.is(byGlobStub.getCall(0).args[0], "**/manifest.json", "byGlob got called with the expected arguments");
});

test("_getDotLibrary: Reads correctly", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	const byGlobStub = sinon.stub().resolves([{
		getString: async () => `<chicken>Fancy</chicken>`,
		getPath: () => "some path"
	}]);

	project._getRawSourceReader = () => {
		return {
			byGlob: byGlobStub
		};
	};
	project._pDotLibrary = null; // Clear cache from instantiation
	const {content, filePath} = await project._getDotLibrary();
	t.deepEqual(content, {chicken: {_: "Fancy"}}, ".library content has been read");
	t.is(filePath, "some path", "Correct path");
	t.is(byGlobStub.callCount, 1, "byGlob got called once");
	t.is(byGlobStub.getCall(0).args[0], "**/.library", "byGlob got called with the expected arguments");
});

test("_getDotLibrary: No .library file", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	const byGlobStub = sinon.stub().resolves([]);

	project._getRawSourceReader = () => {
		return {
			byGlob: byGlobStub
		};
	};
	project._pDotLibrary = null; // Clear cache from instantiation
	const error = await t.throwsAsync(project._getDotLibrary());
	t.is(error.message,
		"Could not find .library file for project library.d",
		"Rejected with correct error message");
});

test("_getDotLibrary: Invalid XML", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	const byGlobStub = sinon.stub().resolves([{
		getString: async () => `no pony`,
		getPath: () => "some path"
	}]);

	project._getRawSourceReader = () => {
		return {
			byGlob: byGlobStub
		};
	};
	project._pDotLibrary = null; // Clear cache from instantiation
	const error = await t.throwsAsync(project._getDotLibrary());
	t.is(error.message,
		"Failed to read some path for project library.d: " +
		"Non-whitespace before first tag.\nLine: 0\nColumn: 1\nChar: n",
		"Rejected with correct error message");
	t.is(byGlobStub.callCount, 1, "byGlob got called once");
	t.is(byGlobStub.getCall(0).args[0], "**/.library", "byGlob got called with the expected arguments");
});

test("_getDotLibrary: Propagates exception", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	const byGlobStub = sinon.stub().rejects(new Error("because shark"));

	project._getRawSourceReader = () => {
		return {
			byGlob: byGlobStub
		};
	};
	project._pDotLibrary = null; // Clear cache from instantiation
	const error = await t.throwsAsync(project._getDotLibrary());
	t.is(error.message,
		"because shark",
		"Rejected with correct error message");
});

test("_getDotLibrary: Multiple .library files", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	const byGlobStub = sinon.stub().resolves([{
		getString: async () => `<chicken>Fancy</chicken>`,
		getPath: () => "some path"
	}, {
		getString: async () => `<shark>Hungry</shark>`,
		getPath: () => "some other path"
	}]);

	project._getRawSourceReader = () => {
		return {
			byGlob: byGlobStub
		};
	};
	project._pDotLibrary = null; // Clear cache from instantiation
	const error = await t.throwsAsync(project._getDotLibrary());
	t.is(error.message, "Found multiple (2) .library files for project library.d",
		"Rejected with correct error message");
});

test("_getDotLibrary: Result is cached", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	const byGlobStub = sinon.stub().resolves([{
		getString: async () => `<chicken>Fancy</chicken>`,
		getPath: () => "some path"
	}]);

	project._getRawSourceReader = () => {
		return {
			byGlob: byGlobStub
		};
	};
	project._pDotLibrary = null; // Clear cache from instantiation
	const {content: content1, filePath: filePath1} = await project._getDotLibrary();
	t.deepEqual(content1, {chicken: {_: "Fancy"}}, ".library content has been read");
	t.is(filePath1, "some path", "Correct path");
	t.is(byGlobStub.callCount, 1, "byGlob got called once");
	t.is(byGlobStub.getCall(0).args[0], "**/.library", "byGlob got called with the expected arguments");
	const {content: content2, filePath: filePath2} = await project._getDotLibrary();

	t.deepEqual(content2, {chicken: {_: "Fancy"}}, ".library content has been read");
	t.is(filePath2, "some path", "Correct path");
	t.is(byGlobStub.callCount, 1, "byGlob got called once");
	t.is(byGlobStub.getCall(0).args[0], "**/.library", "byGlob got called with the expected arguments");
});

test("_getLibraryJsPath: Reads correctly", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	const byGlobStub = sinon.stub().resolves([{
		getPath: () => "some path"
	}]);

	project._getRawSourceReader = () => {
		return {
			byGlob: byGlobStub
		};
	};
	project._pLibraryJs = null; // Clear cache from instantiation
	const filePath = await project._getLibraryJsPath();
	t.is(filePath, "some path", "Expected library.js path");
	t.is(byGlobStub.callCount, 1, "byGlob got called once");
	t.is(byGlobStub.getCall(0).args[0], "**/library.js", "byGlob got called with the expected arguments");
});

test("_getLibraryJsPath: No library.js file", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	const byGlobStub = sinon.stub().resolves([]);

	project._getRawSourceReader = () => {
		return {
			byGlob: byGlobStub
		};
	};
	project._pLibraryJs = null; // Clear cache from instantiation
	const error = await t.throwsAsync(project._getLibraryJsPath());
	t.is(error.message,
		"Could not find library.js file for project library.d",
		"Rejected with correct error message");
});

test("_getLibraryJsPath: Propagates exception", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	const byGlobStub = sinon.stub().rejects(new Error("because shark"));

	project._getRawSourceReader = () => {
		return {
			byGlob: byGlobStub
		};
	};
	project._pLibraryJs = null; // Clear cache from instantiation
	const error = await t.throwsAsync(project._getLibraryJsPath());
	t.is(error.message,
		"because shark",
		"Rejected with correct error message");
});

test("_getLibraryJsPath: Multiple library.js files", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	const byGlobStub = sinon.stub().resolves([{
		getPath: () => "some path"
	}, {
		getPath: () => "some other path"
	}]);

	project._getRawSourceReader = () => {
		return {
			byGlob: byGlobStub
		};
	};
	project._pLibraryJs = null; // Clear cache from instantiation
	const error = await t.throwsAsync(project._getLibraryJsPath());
	t.is(error.message, "Found multiple (2) library.js files for project library.d",
		"Rejected with correct error message");
});

test("_getLibraryJsPath: Result is cached", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	const byGlobStub = sinon.stub().resolves([{
		getPath: () => "some path"
	}]);

	project._getRawSourceReader = () => {
		return {
			byGlob: byGlobStub
		};
	};
	project._pLibraryJs = null; // Clear cache from instantiation
	const filePath1 = await project._getLibraryJsPath();
	t.is(filePath1, "some path", "Expected library.js path");
	t.is(byGlobStub.callCount, 1, "byGlob got called once");
	t.is(byGlobStub.getCall(0).args[0], "**/library.js", "byGlob got called with the expected arguments");

	const filePath2 = await project._getLibraryJsPath();
	t.is(filePath2, "some path", "Expected library.js path");
	t.is(filePath2, "some path", "Correct path");
	t.is(byGlobStub.callCount, 1, "byGlob got called once");
	t.is(byGlobStub.getCall(0).args[0], "**/library.js", "byGlob got called with the expected arguments");
});

test.serial("_getNamespace: namespace resolution fails", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));

	const loggerVerboseSpy = sinon.stub(project._log, "verbose");

	sinon.stub(project, "_getNamespaceFromManifest").resolves({});
	sinon.stub(project, "_getNamespaceFromDotLibrary").resolves({});
	sinon.stub(project, "_getLibraryJsPath").rejects(new Error("pony error"));

	const error = await t.throwsAsync(project._getNamespace());
	t.deepEqual(error.message, "Failed to detect namespace or namespace is empty for project library.d." +
		" Check verbose log for details.");

	t.is(loggerVerboseSpy.callCount, 2, "2 calls to log.verbose should be done");
	const logVerboseCalls = loggerVerboseSpy.getCalls().map((call) => call.args[0]);

	t.true(logVerboseCalls.includes(
		"Failed to resolve namespace of project library.d from manifest.json or .library file. " +
		"Falling back to library.js file path..."),
	"should contain message for missing manifest.json");

	t.true(logVerboseCalls.includes(
		"Namespace resolution from library.js file path failed for project library.d: pony error"),
	"should contain message for missing library.js");
});

test("_getNamespace: from manifest.json with .library on same level", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	sinon.stub(project, "_getManifest").resolves({
		content: {
			"sap.app": {
				id: "mani-pony"
			}
		},
		filePath: "/mani-pony/manifest.json"
	});
	sinon.stub(project, "_getDotLibrary").resolves({
		content: {
			library: {name: {_: "dot-pony"}}
		},
		filePath: "/mani-pony/.library"
	});
	const res = await project._getNamespace();
	t.is(res, "mani-pony", "Returned correct namespace");
	t.true(project._isSourceNamespaced, "Project still flagged as namespaced source structure");
});

test("_getNamespace: from manifest.json for flat project", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	sinon.stub(project, "_getManifest").resolves({
		content: {
			"sap.app": {
				id: "mani-pony"
			}
		},
		filePath: "/manifest.json"
	});
	sinon.stub(project, "_getDotLibrary").resolves({
		content: {
			library: {name: {_: "dot-pony"}}
		},
		filePath: "/.library"
	});
	const res = await project._getNamespace();
	t.is(res, "mani-pony", "Returned correct namespace");
	t.false(project._isSourceNamespaced, "Project flagged as flat source structure");
});

test("_getNamespace: from .library for flat project", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	sinon.stub(project, "_getManifest").rejects("No manifest aint' here");
	sinon.stub(project, "_getDotLibrary").resolves({
		content: {
			library: {name: {_: "dot-pony"}}
		},
		filePath: "/.library"
	});
	const res = await project._getNamespace();
	t.is(res, "dot-pony", "Returned correct namespace");
	t.false(project._isSourceNamespaced, "Project flagged as flat source structure");
});

test("_getNamespace: from manifest.json with .library on same level but different directory", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	sinon.stub(project, "_getManifest").resolves({
		content: {
			"sap.app": {
				id: "mani-pony"
			}
		},
		filePath: "/mani-pony/manifest.json"
	});
	sinon.stub(project, "_getDotLibrary").resolves({
		content: {
			library: {name: {_: "dot-pony"}}
		},
		filePath: "/different-pony/.library"
	});

	const err = await t.throwsAsync(project._getNamespace());

	t.deepEqual(err.message,
		`Failed to detect namespace for project library.d: Found a manifest.json on the same directory level ` +
		`but in a different directory than the .library file. They should be in the same directory.\n` +
		`  manifest.json path: /mani-pony/manifest.json\n` +
		`  is different to\n` +
		`  .library path: /different-pony/.library`,
		"Rejected with correct error message");
});

test("_getNamespace: from manifest.json with not matching file path", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	sinon.stub(project, "_getManifest").resolves({
		content: {
			"sap.app": {
				id: "mani-pony"
			}
		},
		filePath: "/different/namespace/manifest.json"
	});
	sinon.stub(project, "_getDotLibrary").resolves({
		content: {
			library: {name: {_: "dot-pony"}}
		},
		filePath: "/different/namespace/.library"
	});
	const err = await t.throwsAsync(project._getNamespace());

	t.deepEqual(err.message, `Detected namespace "mani-pony" does not match detected directory structure ` +
		`"different/namespace" for project library.d`, "Rejected with correct error message");
});

test.serial("_getNamespace: from manifest.json without sap.app id", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));

	const manifestPath = "/different/namespace/manifest.json";
	sinon.stub(project, "_getManifest").resolves({
		content: {
			"sap.app": {
			}
		},
		filePath: manifestPath
	});
	sinon.stub(project, "_getDotLibrary").resolves({});

	const loggerStub = sinon.stub(project._log, "verbose");

	const err = await t.throwsAsync(project._getNamespace());

	t.is(err.message,
		`Failed to detect namespace or namespace is empty for project library.d. Check verbose log for details.`,
		"Rejected with correct error message");
	t.is(loggerStub.callCount, 4, "calls to verbose");


	t.is(loggerStub.getCall(0).args[0],
		`Namespace resolution from manifest.json failed for project library.d: ` +
		`No sap.app/id configuration found in manifest.json of project library.d at ${manifestPath}`,
		"correct verbose message");
	t.true(project._isSourceNamespaced, "Project still flagged as namespaced source structure");
});

test("_getNamespace: from .library", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	sinon.stub(project, "_getManifest").rejects("No manifest aint' here");
	sinon.stub(project, "_getDotLibrary").resolves({
		content: {
			library: {name: {_: "dot-pony"}}
		},
		filePath: "/dot-pony/.library"
	});
	const res = await project._getNamespace();
	t.is(res, "dot-pony", "Returned correct namespace");
	t.true(project._isSourceNamespaced, "Project still flagged as namespaced source structure");
});

test("_getNamespace: from .library with ignored manifest.json on lower level", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	sinon.stub(project, "_getManifest").resolves({
		content: {
			"sap.app": {
				id: "mani-pony"
			}
		},
		filePath: "/namespace/somedir/manifest.json"
	});
	sinon.stub(project, "_getDotLibrary").resolves({
		content: {
			library: {name: {_: "dot-pony"}}
		},
		filePath: "/dot-pony/.library"
	});
	const res = await project._getNamespace();
	t.is(res, "dot-pony", "Returned correct namespace");
	t.true(project._isSourceNamespaced, "Project still flagged as namespaced source structure");
});

test("_getNamespace: manifest.json on higher level than .library", async (t) => {
	const {sinon} = t.context;

	const manifestFsPath = "/namespace/manifest.json";
	const dotLibraryFsPath = "/namespace/morenamespace/.library";

	const project = await (new Library().init(basicProjectInput));
	sinon.stub(project, "_getManifest").resolves({
		content: {
			"sap.app": {
				id: "mani-pony"
			}
		},
		filePath: manifestFsPath
	});
	sinon.stub(project, "_getDotLibrary").resolves({
		content: {
			library: {name: {_: "dot-pony"}}
		},
		filePath: dotLibraryFsPath
	});
	const err = await t.throwsAsync(project._getNamespace());

	t.deepEqual(err.message,
		`Failed to detect namespace for project library.d: ` +
		`Found a manifest.json on a higher directory level than the .library file. ` +
		`It should be on the same or a lower level. ` +
		`Note that a manifest.json on a lower level will be ignored.\n` +
		`  manifest.json path: ${manifestFsPath}\n` +
		`  is higher than\n` +
		`  .library path: ${dotLibraryFsPath}`,
		"Rejected with correct error message");
});

test("_getNamespace: from .library with maven placeholder", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	sinon.stub(project, "_getManifest").rejects("No manifest aint' here");
	sinon.stub(project, "_getDotLibrary").resolves({
		content: {
			library: {name: {_: "${mvn-pony}"}}
		},
		filePath: "/mvn-unicorn/.library"
	});
	const resolveMavenPlaceholderStub =
		sinon.stub(project, "_resolveMavenPlaceholder").resolves("mvn-unicorn");
	const res = await project._getNamespace();

	t.is(resolveMavenPlaceholderStub.getCall(0).args[0], "${mvn-pony}",
		"resolveMavenPlaceholder called with correct argument");
	t.is(res, "mvn-unicorn", "Returned correct namespace");
	t.true(project._isSourceNamespaced, "Project still flagged as namespaced source structure");
});

test("_getNamespace: from .library with not matching file path", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	sinon.stub(project, "_getManifest").rejects("No manifest aint' here");
	sinon.stub(project, "_getDotLibrary").resolves({
		content: {
			library: {name: {_: "mvn-pony"}}
		},
		filePath: "/different/namespace/.library"
	});
	const err = await t.throwsAsync(project._getNamespace());

	t.deepEqual(err.message, `Detected namespace "mvn-pony" does not match detected directory structure ` +
		`"different/namespace" for project library.d`,
	"Rejected with correct error message");
	t.true(project._isSourceNamespaced, "Project still flagged as namespaced source structure");
});

test("_getNamespace: from library.js", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	sinon.stub(project, "_getManifest").resolves({});
	sinon.stub(project, "_getDotLibrary").resolves({});
	sinon.stub(project, "_getLibraryJsPath").resolves("/my/namespace/library.js");
	const res = await project._getNamespace();
	t.is(res, "my/namespace", "Returned correct namespace");
	t.true(project._isSourceNamespaced, "Project still flagged as namespaced source structure");
});

test("_getNamespace: from project root level library.js", async (t) => {
	const {sinon} = t.context;

	const project = new Library();

	const loggerStub = sinon.stub(project._log, "verbose");

	await project.init(basicProjectInput);

	sinon.stub(project, "_getManifest").resolves({});
	sinon.stub(project, "_getDotLibrary").resolves({});
	sinon.stub(project, "_getLibraryJsPath").resolves("/library.js");
	const err = await t.throwsAsync(project._getNamespace());

	t.is(err.message,
		"Failed to detect namespace or namespace is empty for project library.d. Check verbose log for details.",
		"Rejected with correct error message");

	const logCalls = loggerStub.getCalls().map((call) => call.args[0]);
	t.true(logCalls.includes(
		"Namespace resolution from library.js file path failed for project library.d: " +
		"Found library.js file in root directory. " +
		"Expected it to be in namespace directory."),
	"should contain message for root level library.js");
});

test("_getNamespace: neither manifest nor .library or library.js path contain it", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	sinon.stub(project, "_getManifest").resolves({});
	sinon.stub(project, "_getDotLibrary").resolves({});
	sinon.stub(project, "_getLibraryJsPath").rejects(new Error("Not found bla"));
	const err = await t.throwsAsync(project._getNamespace());
	t.is(err.message,
		"Failed to detect namespace or namespace is empty for project library.d. Check verbose log for details.",
		"Rejected with correct error message");
});

test("_getNamespace: maven placeholder resolution fails", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	sinon.stub(project, "_getManifest").resolves({
		content: {
			"sap.app": {
				id: "${mvn-pony}"
			}
		},
		filePath: "/not/used"
	});
	sinon.stub(project, "_getDotLibrary").resolves({});
	const resolveMavenPlaceholderStub =
		sinon.stub(project, "_resolveMavenPlaceholder")
			.rejects(new Error("because squirrel"));
	const err = await t.throwsAsync(project._getNamespace());
	t.is(err.message,
		"Failed to resolve namespace maven placeholder of project library.d: because squirrel",
		"Rejected with correct error message");
	t.is(resolveMavenPlaceholderStub.getCall(0).args[0], "${mvn-pony}",
		"resolveMavenPlaceholder called with correct argument");
});

test("_getCopyrightFromDotLibrary", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	sinon.stub(project, "_getDotLibrary").resolves({
		content: {
			library: {
				copyright: {
					_: "copyleft"
				}
			}
		}
	});
	const copyright = await project._getCopyrightFromDotLibrary();
	t.is(copyright, "copyleft", "Returned correct copyright");
});

test("_getCopyrightFromDotLibrary: No copyright in .library file", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	sinon.stub(project, "_getDotLibrary").resolves({
		content: {
			library: {}
		},
		filePath: "some path"
	});
	const copyright = await project._getCopyrightFromDotLibrary();
	t.is(copyright, null, "No copyright returned");
});

test("_getCopyrightFromDotLibrary: Propagates exception", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));

	sinon.stub(project, "_getDotLibrary").rejects(new Error("because shark"));
	const err = await t.throwsAsync(project._getCopyrightFromDotLibrary());
	t.is(err.message, "because shark",
		"Threw with excepted error message");
});

test("_getPreloadExcludesFromDotLibrary: Single exclude", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	sinon.stub(project, "_getDotLibrary").resolves({
		content: {
			library: {
				appData: {
					packaging: {
						"all-in-one": {
							exclude: {
								$: {
									name: "test/exclude/**"
								}
							}
						}
					}
				}
			}
		}
	});
	const excludes = await project._getPreloadExcludesFromDotLibrary();
	t.deepEqual(excludes, [
		"test/exclude/**",
	], "_getPreloadExcludesFromDotLibrary should return array with excludes");
});

test("_getPreloadExcludesFromDotLibrary: Multiple excludes", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	sinon.stub(project, "_getDotLibrary").resolves({
		content: {
			library: {
				appData: {
					packaging: {
						"all-in-one": {
							exclude: [
								{
									$: {
										name: "test/exclude1/**"
									}
								},
								{
									$: {
										name: "test/exclude2/**"
									}
								},
								{
									$: {
										name: "test/exclude3/**"
									}
								}
							]
						}
					}
				}
			}
		}
	});
	const excludes = await project._getPreloadExcludesFromDotLibrary();
	t.deepEqual(excludes, [
		"test/exclude1/**",
		"test/exclude2/**",
		"test/exclude3/**"
	], "_getPreloadExcludesFromDotLibrary should return array with excludes");
});

test("_getPreloadExcludesFromDotLibrary: No excludes in .library file", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	sinon.stub(project, "_getDotLibrary").resolves({
		content: {
			library: {}
		},
		filePath: "some path"
	});
	const excludes = await project._getPreloadExcludesFromDotLibrary();
	t.is(excludes, null, "No excludes returned");
});

test("_getPreloadExcludesFromDotLibrary: Propagates exception", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));

	sinon.stub(project, "_getDotLibrary").rejects(new Error("because shark"));
	const err = await t.throwsAsync(project._getPreloadExcludesFromDotLibrary());
	t.is(err.message, "because shark",
		"Threw with excepted error message");
});

test("_getNamespaceFromManifest", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	sinon.stub(project, "_getManifest").resolves({
		content: {
			"sap.app": {
				id: "library namespace"
			}
		},
		filePath: "some path"
	});
	const {namespace, filePath} = await project._getNamespaceFromManifest();
	t.is(namespace, "library namespace", "Returned correct namespace");
	t.is(filePath, "some path", "Returned correct file path");
});

test("_getNamespaceFromManifest: No ID in manifest.json file", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	sinon.stub(project, "_getManifest").resolves({
		content: {
			"sap.app": {}
		},
		filePath: "some path"
	});
	const res = await project._getNamespaceFromManifest();
	t.deepEqual(res, {}, "Empty object returned");
});

test("_getNamespaceFromManifest: Does not propagate exception", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));

	sinon.stub(project, "_getManifest").rejects(new Error("because shark"));
	const res = await project._getNamespaceFromManifest();
	t.deepEqual(res, {}, "Empty object returned");
});

test("_getNamespaceFromDotLibrary", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	sinon.stub(project, "_getDotLibrary").resolves({
		content: {
			library: {
				name: {
					_: "library namespace"
				}
			}
		},
		filePath: "some path"
	});
	const {namespace, filePath} = await project._getNamespaceFromDotLibrary();
	t.is(namespace, "library namespace",
		"Returned correct namespace");
	t.is(filePath, "some path",
		"Returned correct file path");
});

test("_getNamespaceFromDotLibrary: No library name in .library file", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));
	sinon.stub(project, "_getDotLibrary").resolves({
		content: {
			library: {}
		},
		filePath: "some path"
	});
	const res = await project._getNamespaceFromDotLibrary();
	t.deepEqual(res, {}, "Empty object returned");
});

test("_getNamespaceFromDotLibrary: Does not propagate exception", async (t) => {
	const {sinon} = t.context;

	const project = await (new Library().init(basicProjectInput));

	sinon.stub(project, "_getDotLibrary").rejects(new Error("because shark"));
	const res = await project._getNamespaceFromDotLibrary();
	t.deepEqual(res, {}, "Empty object returned");
});
