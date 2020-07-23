const test = require("ava");
const path = require("path");
const chai = require("chai");
chai.use(require("chai-fs"));
const fs = require("graceful-fs");
const {promisify} = require("util");
const readFile = promisify(fs.readFile);
const assert = chai.assert;
const sinon = require("sinon");
const mock = require("mock-require");

const ui5Builder = require("../../../");
const builder = ui5Builder.builder;
const applicationAPath = path.join(__dirname, "..", "..", "fixtures", "application.a");
const applicationGPath = path.join(__dirname, "..", "..", "fixtures", "application.g");
const applicationHPath = path.join(__dirname, "..", "..", "fixtures", "application.h");
const applicationIPath = path.join(__dirname, "..", "..", "fixtures", "application.i");
const applicationJPath = path.join(__dirname, "..", "..", "fixtures", "application.j");
const collectionPath = path.join(__dirname, "..", "..", "fixtures", "collection");
const libraryDPath = path.join(__dirname, "..", "..", "fixtures", "library.d");
const libraryEPath = path.join(__dirname, "..", "..", "fixtures", "library.e");
const libraryHPath = path.join(__dirname, "..", "..", "fixtures", "library.h");
const libraryIPath = path.join(__dirname, "..", "..", "fixtures", "library.i");
const libraryJPath = path.join(__dirname, "..", "..", "fixtures", "library.j");
const libraryCore = path.join(__dirname, "..", "..", "fixtures", "sap.ui.core-evo");
const themeJPath = path.join(__dirname, "..", "..", "fixtures", "theme.j");

const recursive = require("recursive-readdir");

const newLineRegexp = /\r?\n|\r/g;

const findFiles = (folder) => {
	return new Promise((resolve, reject) => {
		recursive(folder, (err, files) => {
			if (err) {
				reject(err);
			} else {
				resolve(files);
			}
		});
	});
};

function cloneProjectTree(tree) {
	const clone = JSON.parse(JSON.stringify(tree));

	function increaseDepth(node) {
		node._level++;
		if (Array.isArray(node.dependencies)) {
			node.dependencies.forEach(increaseDepth);
		}
	}

	increaseDepth(clone);
	return clone;
}

async function checkFileContentsIgnoreLineFeeds(expectedFiles, expectedPath, destPath) {
	for (let i = 0; i < expectedFiles.length; i++) {
		const expectedFile = expectedFiles[i];
		const relativeFile = path.relative(expectedPath, expectedFile);
		const destFile = path.join(destPath, relativeFile);
		const currentFileContentPromise = readFile(destFile, "utf8");
		const expectedFileContentPromise = readFile(expectedFile, "utf8");
		const assertContents = ([currentContent, expectedContent]) => {
			if (expectedFile.endsWith("sap-ui-cachebuster-info.json")) {
				currentContent = JSON.parse(currentContent.replace(/(:\s+)(\d+)/g, ": 0"));
				expectedContent = JSON.parse(expectedContent.replace(/(:\s+)(\d+)/g, ": 0"));
				assert.deepEqual(currentContent, expectedContent);
			} else {
				assert.equal(currentContent.replace(newLineRegexp, "\n"), expectedContent.replace(newLineRegexp, "\n"));
			}
		};
		await Promise.all([currentFileContentPromise, expectedFileContentPromise]).then(assertContents);
	}
}

test.afterEach.always((t) => {
	sinon.restore();
	mock.stopAll();
});

test.serial("Build", async (t) => {
	class DummyBuildContext {
		constructor({rootProject}) {
			t.deepEqual(rootProject, applicationATree, "Correct rootProject parameter");
		}
	}
	const getTagStub = sinon.stub().returns();
	const getResourceTagCollectionStub = sinon.stub().returns({
		getTag: getTagStub
	});
	const isRootProjectStub = sinon.stub().returns(true);
	const dummyProjectContext = {
		getResourceTagCollection: getResourceTagCollectionStub,
		isRootProject: isRootProjectStub,
		STANDARD_TAGS: {
			HideFromBuildResult: "👻"
		}
	};
	const createProjectContextStub = sinon.stub().returns(dummyProjectContext);
	const executeCleanupTasksStub = sinon.stub().resolves();
	DummyBuildContext.prototype.createProjectContext = createProjectContextStub;
	DummyBuildContext.prototype.executeCleanupTasks = executeCleanupTasksStub;
	mock("../../../lib/builder/BuildContext", DummyBuildContext);

	class DummyTaskUtil {
		constructor({projectBuildContext}) {
			t.is(projectBuildContext, dummyProjectContext, "Correct projectBuildContext parameter");
		}
	}
	mock("../../../lib/tasks/TaskUtil", DummyTaskUtil);

	const applicationType = require("../../../lib/types/application/applicationType");
	const appBuildStub = sinon.stub(applicationType, "build").resolves();

	const builder = mock.reRequire("../../../lib/builder/builder");

	const destPath = "./test/tmp/build/build";
	await builder.build({
		tree: applicationATree,
		destPath
	});

	t.is(createProjectContextStub.callCount, 1, "One project context got created");
	const createProjectContextParams = createProjectContextStub.getCall(0).args[0];
	t.is(createProjectContextParams.project, applicationATree, "Correct project provided to projectContext");
	t.truthy(createProjectContextParams.resources.workspace, "resources.workspace object provided to projectContext");
	t.truthy(createProjectContextParams.resources.dependencies,
		"resources.dependencies object provided to projectContext");
	t.deepEqual(Object.keys(createProjectContextParams), ["project", "resources"],
		"resource and project parameters provided");

	t.is(appBuildStub.callCount, 1, "Build called once");
	const appBuildParams = appBuildStub.getCall(0).args[0];
	t.is(Object.keys(appBuildParams).length, 5, "Five parameters provided to types build function");
	t.is(appBuildParams.project, applicationATree, "Correct project provided to type");
	t.truthy(appBuildParams.resourceCollections, "resourceCollections object provided to type");
	t.truthy(appBuildParams.resourceCollections.workspace, "resources.workspace object provided to type");
	t.truthy(appBuildParams.resourceCollections.dependencies, "resources.dependencies object provided to type");
	t.deepEqual(appBuildParams.tasks, [
		"replaceCopyright",
		"replaceVersion",
		"createDebugFiles",
		"escapeNonAsciiCharacters",
		"uglify",
		"buildThemes",
		"generateLibraryManifest",
		"generateVersionInfo",
		"generateFlexChangesBundle",
		"generateComponentPreload",
		"generateBundle",
		"generateLibraryPreload"
	], "Correct tasks provided to type");
	t.truthy(appBuildParams.parentLogger, "parentLogger object provided to type");
	t.true(appBuildParams.taskUtil instanceof DummyTaskUtil, "Correct taskUtil instance provided to type");

	t.is(getResourceTagCollectionStub.callCount, 1, "getResourceTagCollection called once");
	t.is(getTagStub.callCount, 2, "getTag called once");
	t.deepEqual(getTagStub.getCall(0).args[1], "👻", "First getTag call with expected tag name");
	t.deepEqual(getTagStub.getCall(1).args[1], "👻", "Second getTag call with expected tag name");
	t.is(isRootProjectStub.callCount, 2, "isRootProject called once");
	t.is(executeCleanupTasksStub.callCount, 1, "Cleanup called once");
});

test("Build application.a", (t) => {
	const destPath = "./test/tmp/build/application.a/dest";
	const expectedPath = path.join("test", "expected", "build", "application.a", "dest");

	return builder.build({
		tree: applicationATree,
		destPath,
		excludedTasks: ["generateComponentPreload", "generateStandaloneAppBundle", "generateVersionInfo"]
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);
		// Check for all file contents
		return checkFileContentsIgnoreLineFeeds(expectedFiles, expectedPath, destPath);
	}).then(() => {
		t.pass();
	});
});

test("Build application.a with error", async (t) => {
	const destPath = "./test/tmp/build/application.a/dest";

	const error = await t.throwsAsync(builder.build({
		tree: applicationATreeBadType,
		destPath
	}));
	t.deepEqual(error.message, `Unknown type 'non existent'`);
});

test("Build application.a with dependencies", (t) => {
	const destPath = "./test/tmp/build/application.a/dest-deps";
	const expectedPath = path.join("test", "expected", "build", "application.a", "dest-deps");

	return builder.build({
		tree: applicationATree,
		destPath,
		excludedTasks: ["generateComponentPreload", "generateStandaloneAppBundle", "generateVersionInfo", "generateLibraryPreload", "escapeNonAsciiCharacters", "generateLibraryManifest"],
		buildDependencies: true
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);
		// Check for all file contents
		return checkFileContentsIgnoreLineFeeds(expectedFiles, expectedPath, destPath);
	}).then(() => {
		t.pass();
	});
});

test("Build application.a with dependencies include", (t) => {
	const destPath = "./test/tmp/build/application.a/dest-deps-incl";
	const expectedPath = path.join("test", "expected", "build", "application.a", "dest-deps");

	return builder.build({
		tree: applicationATree,
		destPath,
		excludedTasks: ["generateComponentPreload", "generateStandaloneAppBundle", "generateVersionInfo", "generateLibraryPreload", "escapeNonAsciiCharacters", "generateLibraryManifest"],
		buildDependencies: true, includedDependencies: ["*"]
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);
		// Check for all file contents
		return checkFileContentsIgnoreLineFeeds(expectedFiles, expectedPath, destPath);
	}).then(() => {
		t.pass();
	});
});

test("Build application.a with dependencies exclude", (t) => {
	const destPath = "./test/tmp/build/application.a/dest-deps-excl";
	const expectedPath = path.join("test", "expected", "build", "application.a", "dest-deps-excl");

	return builder.build({
		tree: applicationATree,
		destPath,
		excludedTasks: ["generateComponentPreload", "generateStandaloneAppBundle", "generateVersionInfo", "generateLibraryPreload", "escapeNonAsciiCharacters", "generateLibraryManifest"],
		buildDependencies: true, excludedDependencies: ["library.d"]
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);
		// Check for all file contents
		return checkFileContentsIgnoreLineFeeds(expectedFiles, expectedPath, destPath);
	}).then(() => {
		t.pass();
	});
});

test("Build application.a self-contained", (t) => {
	const destPath = "./test/tmp/build/application.a/dest-self";
	const expectedPath = path.join("test", "expected", "build", "application.a", "dest-self");

	return builder.build({
		tree: applicationATree,
		destPath,
		excludedTasks: ["generateComponentPreload", "generateVersionInfo"],
		selfContained: true
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);
		// Check for all file contents
		return checkFileContentsIgnoreLineFeeds(expectedFiles, expectedPath, destPath);
	}).then(() => {
		t.pass();
	});
});

test("Build application.a with dependencies self-contained", (t) => {
	const destPath = "./test/tmp/build/application.a/dest-depself";
	const expectedPath = path.join("test", "expected", "build", "application.a", "dest-depself");

	return builder.build({
		tree: applicationATree,
		destPath,
		excludedTasks: ["generateComponentPreload", "generateVersionInfo", "escapeNonAsciiCharacters", "generateLibraryManifest"],
		buildDependencies: true,
		selfContained: true
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);
		// Check for all file contents
		return checkFileContentsIgnoreLineFeeds(expectedFiles, expectedPath, destPath);
	}).then(() => {
		t.pass();
	});
});

test("Build application.a [dev mode]", (t) => {
	const destPath = "./test/tmp/build/application.a/dest-dev";
	const expectedPath = path.join("test", "expected", "build", "application.a", "dest-dev");

	return builder.build({
		tree: applicationATree,
		destPath,
		dev: true
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);

		// Check for all file contents
		return checkFileContentsIgnoreLineFeeds(expectedFiles, expectedPath, destPath);
	}).then(() => {
		t.pass();
	});
});

test("Build application.a and clean target path [dev mode]", (t) => {
	const destPath = "./test/tmp/build/application.a/dest-clean";
	const destPathRubbishSubFolder = destPath + "/rubbish-should-be-deleted";
	const expectedPath = path.join("test", "expected", "build", "application.a", "dest-dev");

	return builder.build({
		tree: applicationATree,
		destPath: destPathRubbishSubFolder,
		dev: true
	}).then(() => {
		return builder.build({
			tree: applicationATree,
			destPath,
			cleanDest: true,
			dev: true
		});
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);
		// Check for all file contents
		return checkFileContentsIgnoreLineFeeds(expectedFiles, expectedPath, destPath);
	}).then(() => {
		t.pass();
	});
});

test("Build application.g", (t) => {
	const destPath = "./test/tmp/build/application.g/dest";
	const expectedPath = path.join("test", "expected", "build", "application.g", "dest");

	return builder.build({
		tree: applicationGTree,
		destPath,
		excludedTasks: ["generateStandaloneAppBundle", "generateVersionInfo"]
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);
		// Check for all file contents
		return checkFileContentsIgnoreLineFeeds(expectedFiles, expectedPath, destPath);
	}).then(() => {
		t.pass();
	});
});

test("Build application.g with component preload paths", (t) => {
	const destPath = "./test/tmp/build/application.g/dest2";
	const expectedPath = path.join("test", "expected", "build", "application.g", "dest");

	return builder.build({
		tree: applicationGTreeComponentPreloadPaths,
		destPath,
		excludedTasks: ["generateStandaloneAppBundle", "generateVersionInfo"]
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);
		// Check for all file contents
		return checkFileContentsIgnoreLineFeeds(expectedFiles, expectedPath, destPath);
	}).then(() => {
		t.pass();
	});
});

test("Build application.g with excludes", (t) => {
	const destPath = "./test/tmp/build/application.g/excludes";
	const expectedPath = path.join("test", "expected", "build", "application.g", "excludes");

	return builder.build({
		tree: applicationGTreeWithExcludes,
		destPath,
		includeTasks: ["createDebugFiles"],
		excludedTasks: ["*"]
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);
		// Check for all file contents
		return checkFileContentsIgnoreLineFeeds(expectedFiles, expectedPath, destPath);
	}).then(() => {
		t.pass();
	});
});

test("Build application.h", (t) => {
	const destPath = "./test/tmp/build/application.h/dest";
	const expectedPath = path.join("test", "expected", "build", "application.h", "dest");

	return builder.build({
		tree: applicationHTree,
		destPath,
		excludedTasks: ["createDebugFiles", "generateComponentPreload",
			"generateStandaloneAppBundle", "generateVersionInfo"]
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);
		// Check for all file contents
		return checkFileContentsIgnoreLineFeeds(expectedFiles, expectedPath, destPath);
	}).then(() => {
		t.pass();
	});
});

test("Build application.i", (t) => {
	const destPath = "./test/tmp/build/application.i/dest";
	const expectedPath = path.join("test", "expected", "build", "application.i", "dest");

	return builder.build({
		tree: applicationITree,
		destPath,
		excludedTasks: ["createDebugFiles", "generateStandaloneAppBundle", "generateVersionInfo"]
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);
		// Check for all file contents
		return checkFileContentsIgnoreLineFeeds(expectedFiles, expectedPath, destPath);
	}).then(() => {
		t.pass();
	});
});

test("Build application.j", (t) => {
	const destPath = "./test/tmp/build/application.j/dest";
	const expectedPath = path.join("test", "expected", "build", "application.j", "dest");

	return builder.build({
		tree: applicationJTree,
		destPath,
		excludedTasks: ["createDebugFiles", "generateStandaloneAppBundle", "generateVersionInfo"]
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);
		// Check for all file contents
		return checkFileContentsIgnoreLineFeeds(expectedFiles, expectedPath, destPath);
	}).then(() => {
		t.pass();
	});
});

test("Build library.d with copyright from .library file", (t) => {
	const destPath = "./test/tmp/build/library.d/dest";
	const expectedPath = path.join("test", "expected", "build", "library.d", "dest");

	return builder.build({
		tree: libraryDTree,
		destPath,
		excludedTasks: ["generateLibraryPreload"]
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);

		// Check for all file contents
		return checkFileContentsIgnoreLineFeeds(expectedFiles, expectedPath, destPath);
	}).then(() => {
		t.pass();
	});
});

test("Build library.e with copyright from settings of ui5.yaml", (t) => {
	const destPath = path.join("test", "tmp", "build", "library.e", "dest");
	const expectedPath = path.join("test", "expected", "build", "library.e", "dest");

	return builder.build({
		tree: libraryETree,
		destPath,
		excludedTasks: ["generateLibraryPreload"]
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);

		// Check for all file contents
		return checkFileContentsIgnoreLineFeeds(expectedFiles, expectedPath, destPath);
	}).then(() => {
		t.pass();
	});
});

test("Build library.h with custom bundles and component-preloads", (t) => {
	const destPath = path.join("test", "tmp", "build", "library.h", "dest");
	const expectedPath = path.join("test", "expected", "build", "library.h", "dest");

	return builder.build({
		tree: libraryHTree,
		destPath,
		excludedTasks: ["createDebugFiles", "generateLibraryPreload"]
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);

		// Check for all file contents
		return checkFileContentsIgnoreLineFeeds(expectedFiles, expectedPath, destPath);
	}).then(() => {
		t.pass();
	});
});

test("Build library.i with manifest info taken from .library and library.js", (t) => {
	const destPath = path.join("test", "tmp", "build", "library.i", "dest");
	const expectedPath = path.join("test", "expected", "build", "library.i", "dest");

	return builder.build({
		tree: libraryITree,
		destPath,
		excludedTasks: ["createDebugFiles", "generateLibraryPreload", "uglify"]
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);

		// Check for all file contents
		return checkFileContentsIgnoreLineFeeds(expectedFiles, expectedPath, destPath);
	}).then(() => {
		t.pass();
	});
});

test("Build library.j with JSDoc build only", (t) => {
	const destPath = path.join("test", "tmp", "build", "library.j", "dest");
	const expectedPath = path.join("test", "expected", "build", "library.j", "dest");

	return builder.build({
		tree: libraryJTree,
		destPath,
		includedTasks: ["generateJsdoc"],
		excludedTasks: ["*"]
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);

		// Check for all file contents
		return checkFileContentsIgnoreLineFeeds(expectedFiles, expectedPath, destPath);
	}).then(() => {
		t.pass();
	});
});

test("Build theme.j even without an library", (t) => {
	const destPath = "./test/tmp/build/theme.j/dest";
	const expectedPath = "./test/expected/build/theme.j/dest";
	return builder.build({
		tree: themeJTree,
		destPath
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);

		// Check for all file contents
		expectedFiles.forEach((expectedFile) => {
			const relativeFile = path.relative(expectedPath, expectedFile);
			const destFile = path.join(destPath, relativeFile);
			assert.fileEqual(destFile, expectedFile);
			t.pass();
		});
	});
});

test.serial("Cleanup", async (t) => {
	const BuildContext = require("../../../lib/builder/BuildContext");
	const createProjectContextStub = sinon.spy(BuildContext.prototype, "createProjectContext");
	const executeCleanupTasksStub = sinon.stub(BuildContext.prototype, "executeCleanupTasks").resolves();
	const applicationType = require("../../../lib/types/application/applicationType");
	const appBuildStub = sinon.stub(applicationType, "build").resolves();

	const builder = mock.reRequire("../../../lib/builder/builder");

	function getProcessListenerCount() {
		return ["SIGHUP", "SIGINT", "SIGTERM", "SIGBREAK"].map((eventName) => {
			return process.listenerCount(eventName);
		});
	}

	const listenersBefore = getProcessListenerCount();

	const destPath = "./test/tmp/build/cleanup";
	// Success case
	const pBuildSuccess = builder.build({
		tree: applicationATree,
		destPath
	});
	t.deepEqual(getProcessListenerCount(), listenersBefore.map((x) => x+1),
		"Per signal, one new listener registered");

	await pBuildSuccess;
	t.deepEqual(getProcessListenerCount(), listenersBefore, "All signal listeners got deregistered");

	t.deepEqual(appBuildStub.callCount, 1, "Build called once");
	t.deepEqual(createProjectContextStub.callCount, 1, "One project context got created");
	const createProjectContextParams = createProjectContextStub.getCall(0).args[0];
	t.truthy(createProjectContextParams.project, "project object provided");
	t.truthy(createProjectContextParams.resources.workspace, "resources.workspace object provided");
	t.truthy(createProjectContextParams.resources.dependencies, "resources.dependencies object provided");
	t.deepEqual(Object.keys(createProjectContextParams), ["project", "resources"],
		"resource and project parameters provided");
	t.deepEqual(executeCleanupTasksStub.callCount, 1, "Cleanup called once");

	// Error case
	const pBuildError = builder.build({
		tree: applicationATreeBadType,
		destPath
	});
	t.deepEqual(getProcessListenerCount(), listenersBefore.map((x) => x+1),
		"Per signal, one new listener registered");

	const error = await t.throwsAsync(pBuildError);
	t.deepEqual(error.message, `Unknown type 'non existent'`);
	t.deepEqual(getProcessListenerCount(), listenersBefore, "All signal listeners got deregistered");

	t.deepEqual(executeCleanupTasksStub.callCount, 2, "Cleanup called twice");
});


const libraryDTree = {
	"id": "library.d",
	"version": "1.0.0",
	"path": libraryDPath,
	"dependencies": [
		{
			"id": "sap.ui.core-evo",
			"version": "1.0.0",
			"path": libraryCore,
			"dependencies": [],
			"_level": 1,
			"specVersion": "0.1",
			"type": "library",
			"metadata": {
				"name": "sap.ui.core",
				"namespace": "sap/ui/core",
				"copyright": "Some fancy copyright"
			},
			"resources": {
				"configuration": {
					"paths": {
						"src": "main/src"
					}
				},
				"pathMappings": {
					"/resources/": "main/src"
				}
			}
		}
	],
	"_level": 0,
	"_isRoot": true,
	"specVersion": "0.1",
	"type": "library",
	"metadata": {
		"name": "library.d",
		"namespace": "library/d",
		"copyright": "Some fancy copyright"
	},
	"resources": {
		"configuration": {
			"paths": {
				"src": "main/src",
				"test": "main/test"
			},
			"propertiesFileSourceEncoding": "ISO-8859-1"
		},
		"pathMappings": {
			"/resources/": "main/src",
			"/test-resources/": "main/test"
		}
	}
};

const applicationATree = {
	"id": "application.a",
	"version": "1.0.0",
	"path": applicationAPath,
	"dependencies": [
		libraryDTree,
		{
			"id": "library.a",
			"version": "1.0.0",
			"path": path.join(collectionPath, "library.a"),
			"dependencies": [],
			"_level": 1,
			"specVersion": "0.1",
			"type": "library",
			"metadata": {
				"name": "library.a",
				"namespace": "library/a",
				"copyright": "${copyright}"
			},
			"resources": {
				"configuration": {
					"paths": {
						"src": "src",
						"test": "test"
					}
				},
				"pathMappings": {
					"/resources/": "src",
					"/test-resources/": "test"
				}
			}
		},
		{
			"id": "library.b",
			"version": "1.0.0",
			"path": path.join(collectionPath, "library.b"),
			"dependencies": [],
			"_level": 1,
			"specVersion": "0.1",
			"type": "library",
			"metadata": {
				"name": "library.b",
				"namespace": "library/b",
				"copyright": "${copyright}"
			},
			"resources": {
				"configuration": {
					"paths": {
						"src": "src",
						"test": "test"
					}
				},
				"pathMappings": {
					"/resources/": "src",
					"/test-resources/": "test"
				}
			}
		},
		{
			"id": "library.c",
			"version": "1.0.0",
			"path": path.join(collectionPath, "library.c"),
			"dependencies": [],
			"_level": 1,
			"specVersion": "0.1",
			"type": "library",
			"metadata": {
				"name": "library.c",
				"namespace": "library/c",
				"copyright": "${copyright}"
			},
			"resources": {
				"configuration": {
					"paths": {
						"src": "src",
						"test": "test"
					}
				},
				"pathMappings": {
					"/resources/": "src",
					"/test-resources/": "test"
				}
			}
		}
	],
	"_level": 0,
	"_isRoot": true,
	"specVersion": "0.1",
	"type": "application",
	"metadata": {
		"name": "application.a",
		"namespace": "application/a"
	},
	"resources": {
		"configuration": {
			"paths": {
				"webapp": "webapp"
			},
			"propertiesFileSourceEncoding": "ISO-8859-1"
		},
		"pathMappings": {
			"/": "webapp"
		}
	}
};

const applicationATreeBadType = {
	"id": "application.a",
	"version": "1.0.0",
	"path": applicationAPath,
	"_level": 0,
	"_isRoot": true,
	"specVersion": "0.1",
	"type": "non existent",
	"metadata": {
		"name": "application.a"
	},
	"resources": {
		"configuration": {
			"paths": {
				"webapp": "webapp"
			},
			"propertiesFileSourceEncoding": "ISO-8859-1"
		},
		"pathMappings": {
			"/": "webapp"
		}
	}
};

const applicationGTree = {
	"id": "application.g",
	"version": "1.0.0",
	"path": applicationGPath,
	"_level": 0,
	"_isRoot": true,
	"specVersion": "0.1",
	"type": "application",
	"metadata": {
		"name": "application.g",
		"namespace": "application/g",
		"copyright": "Some fancy copyright"
	},
	"dependencies": [],
	"resources": {
		"configuration": {
			"paths": {
				"webapp": "webapp"
			},
			"propertiesFileSourceEncoding": "ISO-8859-1"
		},
		"pathMappings": {
			"/": "webapp"
		}
	},
	"builder": {
		"componentPreload": {
			"namespaces": [
				"application/g",
				"application/g/subcomponentA",
				"application/g/subcomponentB"
			]
		}
	}
};

const applicationGTreeWithExcludes = {
	"id": "application.g",
	"version": "1.0.0",
	"path": applicationGPath,
	"_level": 0,
	"_isRoot": true,
	"specVersion": "0.1",
	"type": "application",
	"metadata": {
		"name": "application.g",
		"namespace": "application/g",
		"copyright": "Some fancy copyright"
	},
	"dependencies": [],
	"resources": {
		"configuration": {
			"paths": {
				"webapp": "webapp"
			},
			"propertiesFileSourceEncoding": "ISO-8859-1"
		},
		"pathMappings": {
			"/": "webapp"
		}
	},
	"builder": {
		"resources": {
			"excludes": [
				"/subcomponentA/**",
				"!**/manifest.json",
				"/subcomponentB/**",
				"/Component.js",
			]
		}
	}
};

const applicationGTreeComponentPreloadPaths = {
	"id": "application.g",
	"version": "1.0.0",
	"path": applicationGPath,
	"_level": 0,
	"_isRoot": true,
	"specVersion": "0.1",
	"type": "application",
	"metadata": {
		"name": "application.g",
		"namespace": "application/g",
		"copyright": "Some fancy copyright"
	},
	"dependencies": [],
	"resources": {
		"configuration": {
			"paths": {
				"webapp": "webapp"
			},
			"propertiesFileSourceEncoding": "ISO-8859-1"
		},
		"pathMappings": {
			"/": "webapp"
		}
	},
	"builder": {
		"componentPreload": {
			"paths": [
				"application/g/**/Component.js"
			]
		}
	}
};

const applicationHTree = {
	"id": "application.h",
	"version": "1.0.0",
	"path": applicationHPath,
	"_level": 0,
	"_isRoot": true,
	"specVersion": "0.1",
	"type": "application",
	"metadata": {
		"name": "application.h",
		"namespace": "application/h"
	},
	"dependencies": [],
	"resources": {
		"configuration": {
			"paths": {
				"webapp": "webapp"
			},
			"propertiesFileSourceEncoding": "ISO-8859-1"
		},
		"pathMappings": {
			"/": "webapp"
		}
	},
	"builder": {
		"bundles": [{
			"bundleDefinition": {
				"name": "application/h/sectionsA/customBundle.js",
				"defaultFileTypes": [".js"],
				"sections": [{
					"mode": "preload",
					"filters": [
						"application/h/sectionsA/",
						"!application/h/sectionsA/section2**",
					]
				}],
				"sort": true
			},
			"bundleOptions": {
				"optimize": true,
				"usePredefinedCalls": true
			}
		},
		{
			"bundleDefinition": {
				"name": "application/h/sectionsB/customBundle.js",
				"defaultFileTypes": [".js"],
				"sections": [{
					"mode": "preload",
					"filters": [
						"application/h/sectionsB/"
					]
				}]
			},
			"bundleOptions": {
				"optimize": true,
				"usePredefinedCalls": true
			}
		}]
	}
};

const applicationITree = {
	"id": "application.i",
	"version": "1.0.0",
	"path": applicationIPath,
	"_level": 0,
	"_isRoot": true,
	"specVersion": "0.1",
	"type": "application",
	"metadata": {
		"name": "application.i",
		"namespace": "application/i"
	},
	"dependencies": [],
	"resources": {
		"configuration": {
			"paths": {
				"webapp": "webapp"
			},
			"propertiesFileSourceEncoding": "ISO-8859-1"
		},
		"pathMappings": {
			"/": "webapp"
		}
	},
	"builder": {
		"bundles": []
	}
};

const applicationJTree = {
	"id": "application.j",
	"version": "1.0.0",
	"path": applicationJPath,
	"_level": 0,
	"_isRoot": true,
	"specVersion": "0.1",
	"type": "application",
	"metadata": {
		"name": "application.j",
		"namespace": "application/j"
	},
	"dependencies": [],
	"resources": {
		"configuration": {
			"paths": {
				"webapp": "webapp"
			},
			"propertiesFileSourceEncoding": "ISO-8859-1"
		},
		"pathMappings": {
			"/": "webapp"
		}
	},
	"builder": {
		"bundles": []
	}
};

const libraryETree = {
	"id": "library.e",
	"version": "1.0.0",
	"path": libraryEPath,
	"dependencies": [
		{
			"id": "sap.ui.core-evo",
			"version": "1.0.0",
			"path": libraryCore,
			"dependencies": [],
			"_level": 1,
			"specVersion": "0.1",
			"type": "library",
			"metadata": {
				"name": "sap.ui.core",
				"namespace": "sap/ui/core",
				"copyright": "Some fancy copyright"
			},
			"resources": {
				"configuration": {
					"paths": {
						"src": "main/src"
					}
				},
				"pathMappings": {
					"/resources/": "main/src"
				}
			}
		}
	],
	"_level": 0,
	"_isRoot": true,
	"specVersion": "0.1",
	"type": "library",
	"metadata": {
		"name": "library.e",
		"namespace": "library/e",
		"copyright": "UI development toolkit for HTML5 (OpenUI5)\n * (c) Copyright 2009-xxx SAP SE or an SAP affiliate company.\n * Licensed under the Apache License, Version 2.0 - see LICENSE.txt."
	},
	"resources": {
		"configuration": {
			"paths": {
				"src": "src",
				"test": "test"
			},
			"propertiesFileSourceEncoding": "ISO-8859-1"
		},
		"pathMappings": {
			"/resources/": "src",
			"/test-resources/": "test"
		}
	}
};

const libraryHTree = {
	"id": "library.h",
	"version": "1.0.0",
	"path": libraryHPath,
	"dependencies": [
		{
			"id": "sap.ui.core-evo",
			"version": "1.0.0",
			"path": libraryCore,
			"dependencies": [],
			"_level": 1,
			"specVersion": "0.1",
			"type": "library",
			"metadata": {
				"name": "sap.ui.core",
				"namespace": "sap/ui/core",
				"copyright": "Some fancy copyright"
			},
			"resources": {
				"configuration": {
					"paths": {
						"src": "main/src"
					}
				},
				"pathMappings": {
					"/resources/": "main/src"
				}
			}
		}
	],
	"_level": 0,
	"_isRoot": true,
	"specVersion": "0.1",
	"type": "library",
	"metadata": {
		"name": "library.h",
		"namespace": "library/h",
		"copyright": "Some fancy copyright"
	},
	"resources": {
		"configuration": {
			"paths": {
				"src": "main/src",
				"test": "main/test"
			},
			"propertiesFileSourceEncoding": "ISO-8859-1"
		},
		"pathMappings": {
			"/resources/": "main/src",
			"/test-resources/": "main/test"
		}
	},
	"builder": {
		"bundles": [{
			"bundleDefinition": {
				"name": "library/h/customBundle.js",
				"defaultFileTypes": [".js"],
				"sections": [{
					"mode": "preload",
					"filters": [
						"library/h/some.js",
						"library/h/library.js",
						"library/h/file.js",
						"!library/h/not.js",
						"!library/h/components/"
					],
					"resolve": false,
					"renderer": false
				}]
			},
			"bundleOptions": {
				"optimize": true,
				"usePredefinedCalls": true
			}
		}],
		"componentPreload": {
			"namespaces": [
				"library/h/components",
				"library/h/components/subcomponent1",
				"library/h/components/subcomponent2",
				"library/h/components/subcomponent3"
			]
		}
	}
};

const libraryITree = {
	"id": "library.i",
	"version": "1.0.0",
	"path": libraryIPath,
	"dependencies": [
		{
			"id": "sap.ui.core-evo",
			"version": "1.0.0",
			"path": libraryCore,
			"dependencies": [],
			"_level": 1,
			"specVersion": "0.1",
			"type": "library",
			"metadata": {
				"name": "sap.ui.core",
				"namespace": "sap/ui/core",
				"copyright": "Some fancy copyright"
			},
			"resources": {
				"configuration": {
					"paths": {
						"src": "main/src"
					}
				},
				"pathMappings": {
					"/resources/": "main/src"
				}
			}
		},
		cloneProjectTree(libraryDTree)
	],
	"_level": 0,
	"_isRoot": true,
	"specVersion": "0.1",
	"type": "library",
	"metadata": {
		"name": "library.i",
		"namespace": "library/i",
		"copyright": "Some fancy copyright"
	},
	"resources": {
		"configuration": {
			"paths": {
				"src": "main/src",
				"test": "main/test"
			},
			"propertiesFileSourceEncoding": "ISO-8859-1"
		},
		"pathMappings": {
			"/resources/": "main/src"
		}
	}
};

const libraryJTree = {
	"id": "library.j",
	"version": "1.0.0",
	"path": libraryJPath,
	"dependencies": [],
	"_level": 0,
	"_isRoot": true,
	"specVersion": "0.1",
	"type": "library",
	"metadata": {
		"name": "library.j",
		"namespace": "library/j",
		"copyright": "Some fancy copyright"
	},
	"resources": {
		"configuration": {
			"paths": {
				"src": "main/src"
			}
		},
		"pathMappings": {
			"/resources/": "main/src"
		}
	}
};

const themeJTree = {
	"id": "library.i",
	"version": "1.0.0",
	"path": themeJPath,
	"dependencies": [],
	"_level": 0,
	"_isRoot": true,
	"specVersion": "0.1",
	"type": "library",
	"metadata": {
		"name": "theme.j",
		"namespace": "theme/j",
		"copyright": "Some fancy copyright"
	},
	"resources": {
		"configuration": {
			"paths": {
				"src": "main/src",
				"test": "main/test"
			},
			"propertiesFileSourceEncoding": "ISO-8859-1"
		},
		"pathMappings": {
			"/resources/": "main/src"
		}
	}
};
