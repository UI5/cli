const test = require("ava");
const fs = require("graceful-fs");
const path = require("path");
const sinon = require("sinon");
const mock = require("mock-require");

test.afterEach.always((t) => {
	sinon.restore();
});

const LibraryFormatter = require("../../../../lib/types/library/LibraryFormatter");

const libraryEPath = path.join(__dirname, "..", "..", "..", "fixtures", "library.e");
const libraryETree = {
	id: "library.e.id",
	version: "1.0.0",
	path: libraryEPath,
	dependencies: [],
	_level: 0,
	specVersion: "0.1",
	type: "library",
	metadata: {
		name: "library.e",
		copyright: "UI development toolkit for HTML5 (OpenUI5)\n * (c) Copyright 2009-xxx SAP SE or an SAP affiliate " +
			"company.\n * Licensed under the Apache License, Version 2.0 - see LICENSE.txt."
	},
	resources: {
		configuration: {
			paths: {
				src: "src",
				test: "test"
			}
		}
	}
};

function clone(o) {
	return JSON.parse(JSON.stringify(o));
}

test("validate: project not defined", async (t) => {
	const libraryFormatter = new LibraryFormatter({project: null});

	// error is thrown because project is not defined (null)
	const error = await t.throwsAsync(libraryFormatter.validate());
	t.deepEqual(error.message, "Project is undefined", "Correct exception thrown");
});

test("validate: empty version", async (t) => {
	const myProject = clone(libraryETree);
	myProject.version = undefined;
	const libraryFormatter = new LibraryFormatter({project: myProject});

	// error is thrown because project's version is not defined
	const error = await t.throwsAsync(libraryFormatter.validate(myProject));
	t.deepEqual(error.message, `"version" is missing for project library.e.id`, "Correct exception thrown");
});

test("validate: empty type", async (t) => {
	const myProject = clone(libraryETree);
	myProject.type = undefined;
	const libraryFormatter = new LibraryFormatter({project: myProject});

	// error is thrown because project's type is not defined
	const error = await t.throwsAsync(libraryFormatter.validate(myProject));
	t.deepEqual(error.message, `"type" configuration is missing for project library.e.id`, "Correct exception thrown");
});


test("validate: empty metadata", async (t) => {
	const myProject = clone(libraryETree);
	myProject.metadata = undefined;
	const libraryFormatter = new LibraryFormatter({project: myProject});

	// error is thrown because project's metadata is not defined
	const error = await t.throwsAsync(libraryFormatter.validate(myProject));
	t.deepEqual(error.message, `"metadata.name" configuration is missing for project library.e.id`,
		"Correct exception thrown");
});

test("validate: empty resources", async (t) => {
	const myProject = clone(libraryETree);
	myProject.resources = undefined;
	const libraryFormatter = new LibraryFormatter({project: myProject});

	await libraryFormatter.validate(myProject);
	t.deepEqual(myProject.resources.configuration.paths.src, "src", "default src directory is set");
	t.deepEqual(myProject.resources.configuration.paths.test, "test", "default test directory is set");
});

test("validate: empty encoding", async (t) => {
	const myProject = clone(libraryETree);
	delete myProject.resources.configuration.propertiesFileSourceEncoding;
	const libraryFormatter = new LibraryFormatter({project: myProject});

	await libraryFormatter.validate(myProject);
	t.deepEqual(myProject.resources.configuration.propertiesFileSourceEncoding, "ISO-8859-1", "default resources encoding is set");
});

test("validate: src directory does not exist", async (t) => {
	const myProject = clone(libraryETree);
	const libraryFormatter = new LibraryFormatter({project: myProject});
	const dirExists = sinon.stub(libraryFormatter, "dirExists");
	dirExists.onFirstCall().resolves(false);
	dirExists.onSecondCall().resolves(true);

	const error = await t.throwsAsync(libraryFormatter.validate(myProject));
	t.regex(error.message, /^Could not find source directory of project library\.e\.id: (?!(undefined))+/,
		"Missing source directory caused error");
});

test("validate: test directory does not exist", async (t) => {
	const myProject = clone(libraryETree);
	const libraryFormatter = new LibraryFormatter({project: myProject});
	const dirExists = sinon.stub(libraryFormatter, "dirExists");
	dirExists.onFirstCall().resolves(true);
	dirExists.onSecondCall().resolves(false);

	await libraryFormatter.validate(myProject);
	// Missing test directory is not an error
	t.deepEqual(myProject.resources.configuration.paths.test, null, "Project test path configuration is set to null");
});

test("validate: test invalid encoding", async (t) => {
	const myProject = clone(libraryETree);
	myProject.resources.configuration.propertiesFileSourceEncoding = "test";
	const libraryFormatter = new LibraryFormatter({project: myProject});

	const error = await t.throwsAsync(libraryFormatter.validate(myProject));
	t.is(error.message, `Invalid properties file encoding specified for project library.e.id: encoding provided: test. Must be either "ISO-8859-1" or "UTF-8".`,
		"Missing source directory caused error");
});

test("format: copyright already configured", async (t) => {
	const myProject = clone(libraryETree);
	const libraryFormatter = new LibraryFormatter({project: myProject});
	sinon.stub(libraryFormatter, "validate").resolves();

	await libraryFormatter.format();
	t.deepEqual(myProject.metadata.copyright, libraryETree.metadata.copyright, "Copyright was not altered");
});

test.serial("format: copyright retrieval fails", async (t) => {
	const myProject = clone(libraryETree);

	const log = require("@ui5/logger");
	const loggerInstance = log.getLogger("types:library:LibraryFormatter");

	mock("@ui5/logger", {
		getLogger: () => loggerInstance
	});
	mock.reRequire("@ui5/logger");
	const loggerVerboseSpy = sinon.spy(loggerInstance, "verbose");

	const LibraryFormatter = mock.reRequire("../../../../lib/types/library/LibraryFormatter");

	const libraryFormatter = new LibraryFormatter({project: myProject});
	sinon.stub(libraryFormatter, "validate").resolves();
	sinon.stub(libraryFormatter, "getCopyright").rejects(Error("my-pony"));

	await libraryFormatter.format();
	t.deepEqual(myProject.metadata.copyright, libraryETree.metadata.copyright, "Copyright was not altered");


	t.is(loggerVerboseSpy.callCount, 4, "calls to verbose");
	t.is(loggerVerboseSpy.getCall(3).args[0], "my-pony", "message from rejection");

	mock.stop("@ui5/logger");
});

test("format: formats correctly", async (t) => {
	const myProject = clone(libraryETree);
	myProject.metadata.copyright = undefined;
	const libraryFormatter = new LibraryFormatter({project: myProject});
	sinon.stub(libraryFormatter, "validate").resolves();

	await libraryFormatter.format();
	t.deepEqual(myProject, {
		id: "library.e.id",
		version: "1.0.0",
		path: libraryEPath,
		dependencies: [],
		_level: 0,
		specVersion: "0.1",
		type: "library",
		metadata: {
			name: "library.e",
			copyright: "${copyright}",
			namespace: "library/e"
		},
		resources: {
			configuration: {
				paths: {
					src: "src",
					test: "test"
				}
			},
			pathMappings: {
				"/resources/": "src",
				"/test-resources/": "test"
			}
		}
	}, "Project got formatted correctly");
});


test.serial("format: namespace resolution fails", async (t) => {
	const myProject = clone(libraryETree);
	myProject.metadata.copyright = undefined;


	const globbyStub = sinon.stub().resolves([]);
	mock("globby", globbyStub);
	mock.reRequire("globby");


	const log = require("@ui5/logger");
	const loggerInstance = log.getLogger("types:library:LibraryFormatter");

	mock("@ui5/logger", {
		getLogger: () => loggerInstance
	});
	mock.reRequire("@ui5/logger");
	const loggerVerboseSpy = sinon.spy(loggerInstance, "verbose");

	const LibraryFormatter = mock.reRequire("../../../../lib/types/library/LibraryFormatter");

	const libraryFormatter = new LibraryFormatter({project: myProject});
	sinon.stub(libraryFormatter, "validate").resolves();


	const error = await t.throwsAsync(libraryFormatter.format());
	t.deepEqual(error.message, "Failed to detect namespace or namespace is empty for project library.e." +
		" Check verbose log for details.");

	t.deepEqual(globbyStub.callCount, 3, "globby got called three times");
	t.deepEqual(globbyStub.getCall(0).args[0], "**/manifest.json", "First glob is for manifest.json files");
	t.deepEqual(globbyStub.getCall(1).args[0], "**/.library", "Second glob is for .library files");
	t.deepEqual(globbyStub.getCall(2).args[0], "**/library.js", "Third glob for library.js files");
	t.deepEqual(loggerVerboseSpy.callCount, 6, "7 calls to log.verbose should be done");
	const logVerboseCalls = loggerVerboseSpy.getCalls().map((call) => call.args[0]);

	t.true(logVerboseCalls.includes(
		"Namespace resolution from .library failed for project library.e: " +
		"Could not find .library file for project library.e"),
	"should contain message for missing .library");

	t.true(logVerboseCalls.includes(
		"Namespace resolution from manifest.json failed for project library.e: " +
		"Could not find manifest.json file for project library.e"),
	"should contain message for missing manifest.json");

	t.true(logVerboseCalls.includes(
		"Namespace resolution from library.js file path failed for project library.e: " +
		"Could not find library.js file for project library.e"),
	"should contain message for missing library.js");

	mock.stop("globby");
	mock.stop("@ui5/logger");
});

test("format: configuration test path", async (t) => {
	const myProject = clone(libraryETree);
	const libraryFormatter = new LibraryFormatter({project: myProject});
	sinon.stub(libraryFormatter, "validate").resolves();
	myProject.resources.configuration.paths.test = null;
	await libraryFormatter.format();

	t.falsy(myProject.resources.pathMappings["/test-resources/"], "test-resources pathMapping is not set");
});

test("getDotLibrary: reads correctly", async (t) => {
	const myProject = clone(libraryETree);
	myProject.resources.pathMappings = {
		"/resources/": myProject.resources.configuration.paths.src
	};

	const libraryFormatter = new LibraryFormatter({project: myProject});

	const {content, fsPath} = await libraryFormatter.getDotLibrary();
	t.deepEqual(content.library.name, "library.e", ".library content has been read");
	const expectedPath = path.join(myProject.path,
		myProject.resources.configuration.paths.src, "library", "e", ".library");
	t.deepEqual(fsPath, expectedPath, ".library fsPath is correct");
});

test.serial("getDotLibrary: multiple dot library files", async (t) => {
	const myProject = clone(libraryETree);
	myProject.resources.pathMappings = {
		"/resources/": myProject.resources.configuration.paths.src
	};

	mock("globby", function(name) {
		t.deepEqual(name, "**/.library", "Glob for .library files");
		return Promise.resolve(["folder1/.library", "folder2/.library"]);
	});
	mock.reRequire("globby");

	const LibraryFormatter = mock.reRequire("../../../../lib/types/library/LibraryFormatter");

	const libraryFormatter = new LibraryFormatter({project: myProject});
	const error = await t.throwsAsync(libraryFormatter.getDotLibrary());
	t.deepEqual(error.message, "Found multiple (2) .library files for project library.e",
		"Rejected with correct error message");
	mock.stop("globby");
});

test.serial("getDotLibrary: no dot library file", async (t) => {
	const myProject = clone(libraryETree);
	myProject.resources.pathMappings = {
		"/resources/": myProject.resources.configuration.paths.src
	};

	mock("globby", function(name) {
		return Promise.resolve([]);
	});
	mock.reRequire("globby");

	const LibraryFormatter = mock.reRequire("../../../../lib/types/library/LibraryFormatter");

	const libraryFormatter = new LibraryFormatter({project: myProject});

	const error = await t.throwsAsync(libraryFormatter.getDotLibrary());
	t.deepEqual(error.message, "Could not find .library file for project library.e",
		"Rejected with correct error message");
	mock.stop("globby");
});

test.serial("getDotLibrary: result is cached", async (t) => {
	const myProject = clone(libraryETree);
	myProject.resources.pathMappings = {
		"/resources/": myProject.resources.configuration.paths.src
	};
	const globby = require("globby");
	const globbySpy = sinon.spy(globby);
	mock("globby", globbySpy);
	mock.reRequire("globby");

	const LibraryFormatter = mock.reRequire("../../../../lib/types/library/LibraryFormatter");
	const libraryFormatter = new LibraryFormatter({project: myProject});

	const {content, fsPath} = await libraryFormatter.getDotLibrary();
	t.deepEqual(content.library.name, "library.e", ".library content has been read");
	const expectedPath = path.join(myProject.path,
		myProject.resources.configuration.paths.src, "library", "e", ".library");
	t.deepEqual(fsPath, expectedPath, ".library fsPath is correct");

	const {content: contentSecondCall, fsPath: fsPathSecondCall} = await libraryFormatter.getDotLibrary();
	t.deepEqual(contentSecondCall.library.name, "library.e", ".library content has been read," +
		"but should be cached now.");
	const expectedPathSecondCall = path.join(myProject.path,
		myProject.resources.configuration.paths.src, "library", "e", ".library");
	t.deepEqual(fsPathSecondCall, expectedPathSecondCall, ".library fsPath is correct");

	t.deepEqual(globbySpy.callCount, 1,
		"globby got called exactly once (and then cached)");
	mock.stop("globby");
});

test("getLibraryJsPath: reads correctly", async (t) => {
	const myProject = clone(libraryETree);
	myProject.resources.pathMappings = {
		"/resources/": myProject.resources.configuration.paths.src
	};

	const libraryFormatter = new LibraryFormatter({project: myProject});

	const fsPath = await libraryFormatter.getLibraryJsPath();
	const expectedPath = path.join(myProject.path,
		myProject.resources.configuration.paths.src, "library", "e", "library.js");
	t.deepEqual(fsPath, expectedPath, ".library fsPath is correct");
});

test.serial("getLibraryJsPath: multiple dot library files", async (t) => {
	const myProject = clone(libraryETree);
	myProject.resources.pathMappings = {
		"/resources/": myProject.resources.configuration.paths.src
	};

	mock("globby", function(name) {
		t.deepEqual(name, "**/library.js", "Glob for library.js files");
		return Promise.resolve(["folder1/library.js", "folder2/library.js"]);
	});
	mock.reRequire("globby");

	const LibraryFormatter = mock.reRequire("../../../../lib/types/library/LibraryFormatter");

	const libraryFormatter = new LibraryFormatter({project: myProject});
	const error = await t.throwsAsync(libraryFormatter.getLibraryJsPath());
	t.deepEqual(error.message, "Found multiple (2) library.js files for project library.e",
		"Rejected with correct error message");
	mock.stop("globby");
});

test.serial("getLibraryJsPath: no dot library file", async (t) => {
	const myProject = clone(libraryETree);
	myProject.resources.pathMappings = {
		"/resources/": myProject.resources.configuration.paths.src
	};

	mock("globby", function(name) {
		return Promise.resolve([]);
	});
	mock.reRequire("globby");

	const LibraryFormatter = mock.reRequire("../../../../lib/types/library/LibraryFormatter");

	const libraryFormatter = new LibraryFormatter({project: myProject});

	const error = await t.throwsAsync(libraryFormatter.getLibraryJsPath());
	t.deepEqual(error.message, "Could not find library.js file for project library.e",
		"Rejected with correct error message");
	mock.stop("globby");
});

test.serial("getLibraryJsPath: result is cached", async (t) => {
	const myProject = clone(libraryETree);
	myProject.resources.pathMappings = {
		"/resources/": myProject.resources.configuration.paths.src
	};
	const globby = require("globby");
	const globbySpy = sinon.spy(globby);
	mock("globby", globbySpy);
	mock.reRequire("globby");

	const LibraryFormatter = mock.reRequire("../../../../lib/types/library/LibraryFormatter");

	const libraryFormatter = new LibraryFormatter({project: myProject});

	const fsPath = await libraryFormatter.getLibraryJsPath();
	const expectedPath = path.join(myProject.path,
		myProject.resources.configuration.paths.src, "library", "e", "library.js");
	t.deepEqual(fsPath, expectedPath, ".library fsPath is correct");

	const fsPathSecondCall = await libraryFormatter.getLibraryJsPath();
	const expectedPathSecondCall = path.join(myProject.path,
		myProject.resources.configuration.paths.src, "library", "e", "library.js");
	t.deepEqual(fsPathSecondCall, expectedPathSecondCall, ".library fsPath is correct");

	t.deepEqual(globbySpy.callCount, 1,
		"globby got called exactly once (and then cached)");
	mock.stop("globby");
});

test("getCopyright: takes copyright from project configuration", async (t) => {
	const myProject = clone(libraryETree);
	myProject.metadata.copyright = "unicorn"; // Simulate configured copyright

	const libraryFormatter = new LibraryFormatter({project: myProject});
	const copyright = await libraryFormatter.getCopyright();
	t.deepEqual(copyright, "unicorn", "Returned correct copyright");
});

test("getCopyright: takes copyright from .library", async (t) => {
	const myProject = clone(libraryETree);
	myProject.resources.pathMappings = {
		"/resources/": myProject.resources.configuration.paths.src
	};
	myProject.metadata.copyright = undefined; // Simulate unconfigured copyright

	const libraryFormatter = new LibraryFormatter({project: myProject});
	const res = await libraryFormatter.getCopyright();
	t.deepEqual(res, "${copyright}", "Returned correct copyright");
});

test("getCopyright: takes copyright from stubbed .library", async (t) => {
	const myProject = clone(libraryETree);
	myProject.metadata.copyright = undefined; // Simulate unconfigured copyright

	const libraryFormatter = new LibraryFormatter({project: myProject});
	sinon.stub(libraryFormatter, "getDotLibrary").resolves({
		content: {
			library: {copyright: "pony"}
		},
		fsPath: "/some/path"
	});
	const res = await libraryFormatter.getCopyright();
	t.deepEqual(res, "pony", "Returned correct copyright");
});


test("getCopyright: no copyright available", async (t) => {
	const myProject = clone(libraryETree);
	myProject.metadata.copyright = undefined; // Simulate unconfigured copyright

	const libraryFormatter = new LibraryFormatter({project: myProject});
	sinon.stub(libraryFormatter, "getDotLibrary").resolves({
		content: {
			library: {}
		},
		fsPath: "/some/path"
	});
	const err = await t.throwsAsync(libraryFormatter.getCopyright());
	t.deepEqual(err.message,
		"No copyright configuration found in .library " +
		"of project library.e",
		"Rejected with correct error message");
});

test("getNamespace: from manifest.json", async (t) => {
	const myProject = clone(libraryETree);

	const libraryFormatter = new LibraryFormatter({project: myProject});
	sinon.stub(libraryFormatter, "getManifest").resolves({
		content: {
			"sap.app": {
				id: "mani-pony"
			}
		},
		fsPath: path.normalize("/some/path/mani-pony/manifest.json") // normalize for windows
	});
	const getSourceBasePathStub = sinon.stub(libraryFormatter, "getSourceBasePath").returns("/some/path/");
	const res = await libraryFormatter.getNamespace();
	t.deepEqual(getSourceBasePathStub.getCall(0).args[0], true,
		"getSourceBasePath called with correct argument");
	t.deepEqual(res, "mani-pony", "Returned correct namespace");
});

test("getNamespace: from manifest.json with not matching file path", async (t) => {
	const myProject = clone(libraryETree);

	const libraryFormatter = new LibraryFormatter({project: myProject});
	sinon.stub(libraryFormatter, "getManifest").resolves({
		content: {
			"sap.app": {
				id: "mani-pony"
			}
		},
		fsPath: path.normalize("/some/path/different/namespace/manifest.json") // normalize for windows
	});
	sinon.stub(libraryFormatter, "getSourceBasePath").returns("/some/path/");
	const err = await t.throwsAsync(libraryFormatter.getNamespace());

	t.deepEqual(err.message, `Detected namespace "mani-pony" does not match detected directory structure ` +
		`"different/namespace" for project library.e`, "Rejected with correct error message");
});

test.serial("getNamespace: from manifest.json without sap.app id", async (t) => {
	const myProject = clone(libraryETree);

	const log = require("@ui5/logger");
	const loggerInstance = log.getLogger("types:library:LibraryFormatter");

	mock("@ui5/logger", {
		getLogger: () => loggerInstance
	});
	mock.reRequire("@ui5/logger");

	const LibraryFormatter = mock.reRequire("../../../../lib/types/library/LibraryFormatter");

	const libraryFormatter = new LibraryFormatter({project: myProject});
	sinon.stub(libraryFormatter, "getManifest").resolves({
		content: {
			"sap.app": {
			}
		},
		fsPath: path.normalize("/some/path/different/namespace/manifest.json") // normalize for windows
	});
	sinon.stub(libraryFormatter, "getSourceBasePath").returns("/some/path/");

	const loggerSpy = sinon.spy(loggerInstance, "verbose");
	const err = await t.throwsAsync(libraryFormatter.getNamespace());

	t.deepEqual(err.message, `Failed to detect namespace or namespace is empty for project library.e. Check verbose log for details.`, "Rejected with correct error message");
	t.is(loggerSpy.callCount, 4, "calls to verbose");


	t.is(loggerSpy.getCall(0).args[0], "No \"sap.app\" ID configuration found in manifest.json of project library.e", "correct verbose message");
	mock.stop("@ui5/logger");
});

test("getNamespace: from .library", async (t) => {
	const myProject = clone(libraryETree);

	const libraryFormatter = new LibraryFormatter({project: myProject});
	sinon.stub(libraryFormatter, "getManifest").rejects("No manifest aint' here");
	sinon.stub(libraryFormatter, "getDotLibrary").resolves({
		content: {
			library: {name: "dot-pony"}
		},
		fsPath: path.normalize("/some/path/dot-pony/.library") // normalize for windows
	});
	sinon.stub(libraryFormatter, "getSourceBasePath").returns("/some/path/");
	const res = await libraryFormatter.getNamespace();
	t.deepEqual(res, "dot-pony", "Returned correct namespace");
});

test("getNamespace: from .library with maven placeholder", async (t) => {
	const myProject = clone(libraryETree);

	const libraryFormatter = new LibraryFormatter({project: myProject});
	sinon.stub(libraryFormatter, "getManifest").rejects("No manifest aint' here");
	sinon.stub(libraryFormatter, "getDotLibrary").resolves({
		content: {
			library: {name: "${mvn-pony}"}
		},
		fsPath: path.normalize("/some/path/mvn-unicorn/.library") // normalize for windows
	});
	const resolveMavenPlaceholderStub =
		sinon.stub(libraryFormatter, "resolveMavenPlaceholder").resolves("mvn-unicorn");
	const getSourceBasePathStub = sinon.stub(libraryFormatter, "getSourceBasePath").returns("/some/path/");
	const res = await libraryFormatter.getNamespace();

	t.deepEqual(resolveMavenPlaceholderStub.getCall(0).args[0], "${mvn-pony}",
		"resolveMavenPlaceholder called with correct argument");
	t.deepEqual(getSourceBasePathStub.getCall(0).args[0], true,
		"getSourceBasePath called with correct argument");
	t.deepEqual(res, "mvn-unicorn", "Returned correct namespace");
});

test("getNamespace: from .library with not matching file path", async (t) => {
	const myProject = clone(libraryETree);

	const libraryFormatter = new LibraryFormatter({project: myProject});
	sinon.stub(libraryFormatter, "getManifest").rejects("No manifest aint' here");
	sinon.stub(libraryFormatter, "getDotLibrary").resolves({
		content: {
			library: {name: "mvn-pony"}
		},
		fsPath: path.normalize("/some/path/different/namespace/.library") // normalize for windows
	});
	sinon.stub(libraryFormatter, "getSourceBasePath").returns("/some/path/");
	const err = await t.throwsAsync(libraryFormatter.getNamespace());

	t.deepEqual(err.message, `Detected namespace "mvn-pony" does not match detected directory structure ` +
		`"different/namespace" for project library.e`,
	"Rejected with correct error message");
});

test("getNamespace: from library.js", async (t) => {
	const myProject = clone(libraryETree);

	const libraryFormatter = new LibraryFormatter({project: myProject});
	sinon.stub(libraryFormatter, "getManifest").resolves({});
	sinon.stub(libraryFormatter, "getDotLibrary").resolves({});
	sinon.stub(libraryFormatter, "getLibraryJsPath").resolves(path.normalize("/some/path/my/namespace/library.js"));
	sinon.stub(libraryFormatter, "getSourceBasePath").returns("/some/path/");
	const res = await libraryFormatter.getNamespace();
	t.deepEqual(res, "my/namespace", "Returned correct namespace");
});

test.serial("getNamespace: from project root level library.js", async (t) => {
	const myProject = clone(libraryETree);

	const log = require("@ui5/logger");
	const loggerInstance = log.getLogger("types:library:LibraryFormatter");

	mock("@ui5/logger", {
		getLogger: () => loggerInstance
	});
	mock.reRequire("@ui5/logger");
	const loggerSpy = sinon.spy(loggerInstance, "verbose");

	const LibraryFormatter = mock.reRequire("../../../../lib/types/library/LibraryFormatter");

	const libraryFormatter = new LibraryFormatter({project: myProject});
	sinon.stub(libraryFormatter, "getManifest").resolves({});
	sinon.stub(libraryFormatter, "getDotLibrary").resolves({});
	sinon.stub(libraryFormatter, "getLibraryJsPath").resolves(path.normalize("/some/path/library.js"));
	sinon.stub(libraryFormatter, "getSourceBasePath").returns("/some/path/");
	const err = await t.throwsAsync(libraryFormatter.getNamespace());

	t.deepEqual(err.message,
		"Failed to detect namespace or namespace is empty for project library.e. Check verbose log for details.",
		"Rejected with correct error message");

	const logCalls = loggerSpy.getCalls().map((call) => call.args[0]);
	t.true(logCalls.includes(
		"Namespace resolution from library.js file path failed for project library.e: " +
		"Found library.js file in root directory. " +
		"Expected it to be in namespace directory."),
	"should contain message for root level library.js");

	mock.stop("@ui5/logger");
});

test("getNamespace: neither manifest nor .library or library.js path contain it", async (t) => {
	const myProject = clone(libraryETree);

	const libraryFormatter = new LibraryFormatter({project: myProject});
	sinon.stub(libraryFormatter, "getManifest").resolves({});
	sinon.stub(libraryFormatter, "getDotLibrary").resolves({});
	sinon.stub(libraryFormatter, "getLibraryJsPath").rejects(new Error("Not found bla"));
	const err = await t.throwsAsync(libraryFormatter.getNamespace());
	t.deepEqual(err.message,
		"Failed to detect namespace or namespace is empty for project library.e. Check verbose log for details.",
		"Rejected with correct error message");
});

test("getNamespace: maven placeholder resolution fails", async (t) => {
	const myProject = clone(libraryETree);

	const libraryFormatter = new LibraryFormatter({project: myProject});
	sinon.stub(libraryFormatter, "getManifest").resolves({
		content: {
			"sap.app": {
				id: "${mvn-pony}"
			}
		},
		fsPath: path.normalize("/some/path/not/used") // normalize for windows
	});
	const resolveMavenPlaceholderStub =
		sinon.stub(libraryFormatter, "resolveMavenPlaceholder")
			.rejects(new Error("because squirrel"));
	const err = await t.throwsAsync(libraryFormatter.getNamespace());
	t.deepEqual(resolveMavenPlaceholderStub.getCall(0).args[0], "${mvn-pony}",
		"resolveMavenPlaceholder called with correct argument");
	t.deepEqual(err.message,
		"Failed to resolve namespace maven placeholder of project library.e: because squirrel",
		"Rejected with correct error message");
});

test("getManifest: reads correctly", async (t) => {
	const myProject = clone(libraryETree);
	myProject.resources.pathMappings = {
		"/resources/": myProject.resources.configuration.paths.src
	};

	const libraryFormatter = new LibraryFormatter({project: myProject});

	const {content, fsPath} = await libraryFormatter.getManifest();
	t.deepEqual(content._version, "1.1.0", "manifest.json content has been read");
	const expectedPath = path.join(libraryEPath, "src", "library", "e", "manifest.json");
	t.deepEqual(fsPath, expectedPath, "Correct manifest.json path returned");
});

test.serial("getManifest: invalid JSON", async (t) => {
	const myProject = clone(libraryETree);
	myProject.resources.pathMappings = {
		"/resources/": myProject.resources.configuration.paths.src
	};

	const readFileStub = sinon.stub(fs, "readFile").callsArgWithAsync(1, undefined, "pony");

	const LibraryFormatter = mock.reRequire("../../../../lib/types/library/LibraryFormatter");
	const libraryFormatter = new LibraryFormatter({project: myProject});

	const error = await t.throwsAsync(libraryFormatter.getManifest());
	t.deepEqual(error.message,
		"Failed to read manifest.json for project library.e: " +
		"Unexpected token p in JSON at position 0",
		"Rejected with correct error message");
	t.deepEqual(readFileStub.callCount, 1, "fs.read got called once");
	const expectedPath = path.join(libraryEPath, "src", "library", "e", "manifest.json");
	t.deepEqual(readFileStub.getCall(0).args[0], expectedPath, "fs.read got called with the correct argument");
});

test.serial("getManifest: fs read error", async (t) => {
	const myProject = clone(libraryETree);
	myProject.resources.pathMappings = {
		"/resources/": myProject.resources.configuration.paths.src
	};

	const readFileStub = sinon.stub(fs, "readFile").callsArgWithAsync(1, new Error("EPON: Pony Error"));

	const LibraryFormatter = mock.reRequire("../../../../lib/types/library/LibraryFormatter");
	const libraryFormatter = new LibraryFormatter({project: myProject});

	const error = await t.throwsAsync(libraryFormatter.getManifest());
	t.deepEqual(error.message,
		"Failed to read manifest.json for project library.e: " +
		"EPON: Pony Error",
		"Rejected with correct error message");
	t.deepEqual(readFileStub.callCount, 1, "fs.read got called once");
	const expectedPath = path.join(libraryEPath, "src", "library", "e", "manifest.json");
	t.deepEqual(readFileStub.getCall(0).args[0], expectedPath, "fs.read got called with the correct argument");
});

test.serial("getManifest: multiple manifest.json files", async (t) => {
	const myProject = clone(libraryETree);
	myProject.resources.pathMappings = {
		"/resources/": myProject.resources.configuration.paths.src
	};

	mock("globby", function(name) {
		t.deepEqual(name, "**/manifest.json", "Glob for .library files");
		return Promise.resolve(["folder1/.library", "folder2/.library"]);
	});
	mock.reRequire("globby");

	const LibraryFormatter = mock.reRequire("../../../../lib/types/library/LibraryFormatter");

	const libraryFormatter = new LibraryFormatter({project: myProject});
	const error = await t.throwsAsync(libraryFormatter.getManifest());
	t.deepEqual(error.message, "Found multiple (2) manifest.json files for project library.e",
		"Rejected with correct error message");
	mock.stop("globby");
});


test.serial("getManifest: result is cached", async (t) => {
	const myProject = clone(libraryETree);
	myProject.resources.pathMappings = {
		"/resources/": myProject.resources.configuration.paths.src
	};

	const readFileStub = sinon.stub(fs, "readFile").callsArgWithAsync(1, undefined,
		`{"pony": "no unicorn"}`);

	const LibraryFormatter = mock.reRequire("../../../../lib/types/library/LibraryFormatter");
	const libraryFormatter = new LibraryFormatter({project: myProject});

	const expectedPath = path.join(libraryEPath, "src", "library", "e", "manifest.json");
	const {content, fsPath} = await libraryFormatter.getManifest();

	t.deepEqual(readFileStub.callCount, 1, "fs.read got called exactly once (and then cached)");
	t.deepEqual(content, {pony: "no unicorn"}, "Correct result on first call");
	t.deepEqual(fsPath, expectedPath, "Correct manifest.json path returned on first call");
	const {content: content2, fsPath: fsPath2} = await libraryFormatter.getManifest(); // normalize for windows
	t.deepEqual(content2, {pony: "no unicorn"}, "Correct result on second call");
	t.deepEqual(fsPath2, expectedPath, "Correct manifest.json path returned on second call");
});

test("getNamespaceFromFsPath: fsPath w/ trailing slash + base path w/ trailing slash", async (t) => {
	const myProject = clone(libraryETree);
	myProject.resources.pathMappings = {
		"/resources/": myProject.resources.configuration.paths.src
	};

	const libraryFormatter = new LibraryFormatter({project: myProject});
	sinon.stub(libraryFormatter, "getSourceBasePath").returns("/some/path/");

	const fsPath = "/some/path/my/namespace/";
	const res = libraryFormatter.getNamespaceFromFsPath(fsPath);
	t.deepEqual(res, "my/namespace", "Returned correct namespace");
});

test("getNamespaceFromFsPath: fsPath w/o trailing slash + base path w/ trailing slash", async (t) => {
	const myProject = clone(libraryETree);
	myProject.resources.pathMappings = {
		"/resources/": myProject.resources.configuration.paths.src
	};

	const libraryFormatter = new LibraryFormatter({project: myProject});
	sinon.stub(libraryFormatter, "getSourceBasePath").returns("/some/path/");

	const fsPath = "/some/path/my/namespace";
	const res = libraryFormatter.getNamespaceFromFsPath(fsPath);
	t.deepEqual(res, "my/namespace", "Returned correct namespace");
});

test("getNamespaceFromFsPath: fsPath w/ trailing slash + base path w/o trailing slash", async (t) => {
	const myProject = clone(libraryETree);
	myProject.resources.pathMappings = {
		"/resources/": myProject.resources.configuration.paths.src
	};

	const libraryFormatter = new LibraryFormatter({project: myProject});
	sinon.stub(libraryFormatter, "getSourceBasePath").returns("/some/path");

	const fsPath = "/some/path/my/namespace/";
	const res = libraryFormatter.getNamespaceFromFsPath(fsPath);
	t.deepEqual(res, "my/namespace", "Returned correct namespace");
});

test("getNamespaceFromFsPath: fsPath w/o trailing slash + base path w/o trailing slash", async (t) => {
	const myProject = clone(libraryETree);
	myProject.resources.pathMappings = {
		"/resources/": myProject.resources.configuration.paths.src
	};

	const libraryFormatter = new LibraryFormatter({project: myProject});
	sinon.stub(libraryFormatter, "getSourceBasePath").returns("/some/path");

	const fsPath = "/some/path/my/namespace";
	const res = libraryFormatter.getNamespaceFromFsPath(fsPath);
	t.deepEqual(res, "my/namespace", "Returned correct namespace");
});

test("getNamespaceFromFsPath: equal paths: fsPath w/ trailing slash + base path w/ trailing slash", async (t) => {
	const myProject = clone(libraryETree);
	myProject.resources.pathMappings = {
		"/resources/": myProject.resources.configuration.paths.src
	};

	const libraryFormatter = new LibraryFormatter({project: myProject});
	sinon.stub(libraryFormatter, "getSourceBasePath").returns("/some/path/");

	const fsPath = "/some/path/";
	const res = libraryFormatter.getNamespaceFromFsPath(fsPath);
	t.deepEqual(res, "", "Returned correct namespace");
});

test("getNamespaceFromFsPath: equal paths: fsPath w/o trailing slash + base path w/ trailing slash", async (t) => {
	const myProject = clone(libraryETree);
	myProject.resources.pathMappings = {
		"/resources/": myProject.resources.configuration.paths.src
	};

	const libraryFormatter = new LibraryFormatter({project: myProject});
	sinon.stub(libraryFormatter, "getSourceBasePath").returns("/some/path/");

	const fsPath = "/some/path";
	const res = libraryFormatter.getNamespaceFromFsPath(fsPath);
	t.deepEqual(res, "", "Returned correct namespace");
});

test("getNamespaceFromFsPath: equal paths: fsPath w/ trailing slash + base path w/o trailing slash", async (t) => {
	const myProject = clone(libraryETree);
	myProject.resources.pathMappings = {
		"/resources/": myProject.resources.configuration.paths.src
	};

	const libraryFormatter = new LibraryFormatter({project: myProject});
	sinon.stub(libraryFormatter, "getSourceBasePath").returns("/some/path");

	const fsPath = "/some/path/";
	const res = libraryFormatter.getNamespaceFromFsPath(fsPath);
	t.deepEqual(res, "", "Returned correct namespace");
});

test("getNamespaceFromFsPath: equal paths: fsPath w/o trailing slash + base path w/o trailing slash", async (t) => {
	const myProject = clone(libraryETree);
	myProject.resources.pathMappings = {
		"/resources/": myProject.resources.configuration.paths.src
	};

	const libraryFormatter = new LibraryFormatter({project: myProject});
	sinon.stub(libraryFormatter, "getSourceBasePath").returns("/some/path");

	const fsPath = "/some/path";
	const res = libraryFormatter.getNamespaceFromFsPath(fsPath);
	t.deepEqual(res, "", "Returned correct namespace");
});

test("getNamespaceFromFsPath: fsPath is not based on base path", async (t) => {
	const myProject = clone(libraryETree);
	myProject.resources.pathMappings = {
		"/resources/": myProject.resources.configuration.paths.src
	};

	const libraryFormatter = new LibraryFormatter({project: myProject});
	sinon.stub(libraryFormatter, "getSourceBasePath").returns("/some/path");

	const fsPath = "/some/different/path";
	const err = t.throws(() => libraryFormatter.getNamespaceFromFsPath(fsPath));
	t.deepEqual(err.message, `Given file system path /some/different/path is not based on source base ` +
		`path /some/path.`,
	"Threw with correct error message");
});
