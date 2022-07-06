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

const {generateProjectGraph} = require("@ui5/project");

const applicationAPath = path.join(__dirname, "..", "..", "fixtures", "application.a");
const applicationGPath = path.join(__dirname, "..", "..", "fixtures", "application.g");
const applicationHPath = path.join(__dirname, "..", "..", "fixtures", "application.h");
const applicationIPath = path.join(__dirname, "..", "..", "fixtures", "application.i");
const applicationJPath = path.join(__dirname, "..", "..", "fixtures", "application.j");
const applicationKPath = path.join(__dirname, "..", "..", "fixtures", "application.k");
const applicationLPath = path.join(__dirname, "..", "..", "fixtures", "application.l");
const applicationØPath = path.join(__dirname, "..", "..", "fixtures", "application.ø");
const collectionPath = path.join(__dirname, "..", "..", "fixtures", "collection");
const libraryDPath = path.join(__dirname, "..", "..", "fixtures", "library.d");
const libraryEPath = path.join(__dirname, "..", "..", "fixtures", "library.e");
const libraryHPath = path.join(__dirname, "..", "..", "fixtures", "library.h");
const libraryIPath = path.join(__dirname, "..", "..", "fixtures", "library.i");
const libraryJPath = path.join(__dirname, "..", "..", "fixtures", "library.j");
const libraryLPath = path.join(__dirname, "..", "..", "fixtures", "library.l");
const libraryØPath = path.join(__dirname, "..", "..", "fixtures", "library.ø");
const libraryCore = path.join(__dirname, "..", "..", "fixtures", "sap.ui.core-evo");
const libraryCoreBuildtime = path.join(__dirname, "..", "..", "fixtures", "sap.ui.core-buildtime");
const themeJPath = path.join(__dirname, "..", "..", "fixtures", "theme.j");
const themeLibraryEPath = path.join(__dirname, "..", "..", "fixtures", "theme.library.e");

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

function clone(obj) {
	return JSON.parse(JSON.stringify(obj));
}

function cloneProjectTree(tree) {
	tree = clone(tree);

	function increaseDepth(node) {
		node._level++;
		if (Array.isArray(node.dependencies)) {
			node.dependencies.forEach(increaseDepth);
		}
	}

	increaseDepth(tree);
	return tree;
}

function arrayToMap(array) {
	const map = {};
	array.forEach((v) => {
		if (map[v]) {
			throw new Error(`Unable to convert array to map because of duplicate entry '${v}'`);
		}
		map[v] = true;
	});
	return map;
}

function directoryDeepEqual(t, destPath, expectedPath) {
	try {
		assert.directoryDeepEqual(destPath, expectedPath);
	} catch (err) {
		if (err instanceof chai.AssertionError) {
			t.deepEqual(arrayToMap(err.actual), arrayToMap(err.expected), err.message);
		}
	}
}

async function checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath) {
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
				t.deepEqual(currentContent, expectedContent);
			} else {
				if (expectedFile.endsWith(".json")) {
					try {
						t.deepEqual(JSON.parse(currentContent), JSON.parse(expectedContent), expectedFile);
					} catch (e) {
						t.falsy(e, expectedFile);
					}
				}
				t.is(currentContent.replace(newLineRegexp, "\n"),
					expectedContent.replace(newLineRegexp, "\n"),
					relativeFile);
			}
		};
		await Promise.all([currentFileContentPromise, expectedFileContentPromise]).then(assertContents);
	}
}

test.afterEach.always((t) => {
	sinon.restore();
	mock.stopAll();
});

// TODO: FIX
test.serial.skip("Build", async (t) => {
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
	const getOptionStub = sinon.stub().returns("Pony");
	const dummyProjectContext = {
		getResourceTagCollection: getResourceTagCollectionStub,
		isRootProject: isRootProjectStub,
		getOption: getOptionStub,
		STANDARD_TAGS: {
			OmitFromBuildResult: "👻"
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
		"replaceBuildtime",
		"escapeNonAsciiCharacters",
		"minify",
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
	t.is(getTagStub.callCount, 3, "getTag called three times");
	t.deepEqual(getTagStub.getCall(0).args[1], "👻", "First getTag call with expected tag name");
	t.deepEqual(getTagStub.getCall(1).args[1], "👻", "Second getTag call with expected tag name");
	t.is(isRootProjectStub.callCount, 3, "isRootProject called three times");
	t.is(executeCleanupTasksStub.callCount, 1, "Cleanup called once");
});

test.serial("Build application.a", async (t) => {
	const destPath = "./test/tmp/build/application.a/dest";
	const expectedPath = path.join("test", "expected", "build", "application.a", "dest");

	const graph = await generateProjectGraph.usingNodePackageDependencies({
		cwd: applicationAPath
	});
	await graph.build({
		destPath,
		excludedTasks: ["generateComponentPreload", "generateStandaloneAppBundle", "generateVersionInfo"]
	});

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

test.serial("Build application.a with dependencies", async (t) => {
	const destPath = "./test/tmp/build/application.a/dest-deps";
	const expectedPath = path.join("test", "expected", "build", "application.a", "dest-deps");

	const graph = await generateProjectGraph.usingObject({
		dependencyTree: applicationATree
	});
	await graph.build({
		destPath,
		excludedTasks: [
			"generateComponentPreload", "generateStandaloneAppBundle", "generateVersionInfo",
			"generateLibraryPreload", "escapeNonAsciiCharacters", "generateLibraryManifest"
		],
		includedDependencies: ["*"]
	});

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

test.serial("Build application.a with dependencies exclude", async (t) => {
	const destPath = "./test/tmp/build/application.a/dest-deps-excl";
	const expectedPath = path.join("test", "expected", "build", "application.a", "dest-deps-excl");

	const graph = await generateProjectGraph.usingObject({
		dependencyTree: applicationATree
	});
	await graph.build({
		destPath,
		excludedTasks: [
			"generateComponentPreload", "generateStandaloneAppBundle", "generateVersionInfo",
			"generateLibraryPreload", "escapeNonAsciiCharacters", "generateLibraryManifest"
		],
		includedDependencies: ["*"],
		excludedDependencies: ["library.d"]
	});

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

test.serial("Build application.a self-contained", async (t) => {
	const destPath = "./test/tmp/build/application.a/dest-self";
	const expectedPath = path.join("test", "expected", "build", "application.a", "dest-self");

	const graph = await generateProjectGraph.usingObject({
		dependencyTree: applicationATree
	});
	await graph.build({
		destPath,
		excludedTasks: ["generateComponentPreload", "generateVersionInfo"],
		selfContained: true
	});

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

test.serial("Build application.a with dependencies self-contained", async (t) => {
	const destPath = "./test/tmp/build/application.a/dest-depself";
	const expectedPath = path.join("test", "expected", "build", "application.a", "dest-depself");

	const graph = await generateProjectGraph.usingObject({
		dependencyTree: applicationATree
	});
	await graph.build({
		destPath,
		excludedTasks: [
			"generateComponentPreload", "generateVersionInfo", "escapeNonAsciiCharacters",
			"generateLibraryManifest"
		],
		includedDependencies: ["*"],
		selfContained: true
	});

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

test.serial("Build application.a and clean target path", async (t) => {
	const destPath = "./test/tmp/build/application.a/dest-clean";
	const destPathRubbishSubFolder = destPath + "/rubbish-should-be-deleted";
	const expectedPath = path.join("test", "expected", "build", "application.a", "dest-clean");

	const graph1 = await generateProjectGraph.usingObject({
		dependencyTree: applicationATree
	});
	const graph2 = await generateProjectGraph.usingObject({
		dependencyTree: applicationATree
	});
	await graph1.build({
		graph: graph1,
		destPath: destPathRubbishSubFolder,
		excludedTasks: ["*"]
	});
	await graph2.build({
		graph: graph2,
		destPath,
		cleanDest: true,
		excludedTasks: ["*"]
	});

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

test.serial("Build application.g", async (t) => {
	const destPath = "./test/tmp/build/application.g/dest";
	const expectedPath = path.join("test", "expected", "build", "application.g", "dest");

	const graph = await generateProjectGraph.usingObject({
		dependencyTree: applicationGTree
	});
	await graph.build({
		destPath,
		excludedTasks: ["generateVersionInfo"]
	});

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

test.serial("Build application.g with component preload paths", async (t) => {
	const destPath = "./test/tmp/build/application.g/dest2";
	const expectedPath = path.join("test", "expected", "build", "application.g", "dest");

	const graph = await generateProjectGraph.usingObject({
		dependencyTree: applicationGTreeComponentPreloadPaths
	});
	await graph.build({
		destPath,
		excludedTasks: ["generateVersionInfo"]
	});

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

test.serial("Build application.g with excludes", async (t) => {
	const destPath = "./test/tmp/build/application.g/excludes";
	const expectedPath = path.join("test", "expected", "build", "application.g", "excludes");

	const graph = await generateProjectGraph.usingObject({
		dependencyTree: applicationGTreeWithExcludes
	});
	await graph.build({
		destPath,
		excludedTasks: ["*"]
	});

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

test.serial("Build application.h", async (t) => {
	const destPath = "./test/tmp/build/application.h/dest";
	const expectedPath = path.join("test", "expected", "build", "application.h", "dest");

	const graph = await generateProjectGraph.usingObject({
		dependencyTree: applicationHTree
	});
	await graph.build({
		destPath,
		excludedTasks: ["generateComponentPreload",
			"generateStandaloneAppBundle", "generateVersionInfo"]
	});

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

test.serial("Build application.h (no minify)", async (t) => {
	const destPath = "./test/tmp/build/application.h/no-minify";
	const expectedPath = path.join("test", "expected", "build", "application.h", "no-minify");

	const graph = await generateProjectGraph.usingObject({
		dependencyTree: applicationHTree
	});
	await graph.build({
		destPath,
		excludedTasks: ["minify", "generateComponentPreload",
			"generateStandaloneAppBundle", "generateVersionInfo"]
	});

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

test.serial("Build application.i", async (t) => {
	const destPath = "./test/tmp/build/application.i/dest";
	const expectedPath = path.join("test", "expected", "build", "application.i", "dest");

	const graph = await generateProjectGraph.usingObject({
		dependencyTree: applicationITree
	});
	await graph.build({
		destPath,
		excludedTasks: ["generateVersionInfo"]
	});

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

test.serial("Build application.j", async (t) => {
	const destPath = "./test/tmp/build/application.j/dest";
	const expectedPath = path.join("test", "expected", "build", "application.j", "dest");

	const graph = await generateProjectGraph.usingObject({
		dependencyTree: applicationJTree
	});
	await graph.build({
		destPath,
		excludedTasks: ["generateVersionInfo"]
	});

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

test.serial("Build application.j with resources.json and version info", async (t) => {
	const destPath = "./test/tmp/build/application.j/dest-resources-json";
	const expectedPath = path.join("test", "expected", "build", "application.j", "dest-resources-json");

	sinon.stub(Date.prototype, "getFullYear").returns(2020);
	sinon.stub(Date.prototype, "getMonth").returns(7);
	sinon.stub(Date.prototype, "getDate").returns(12);
	sinon.stub(Date.prototype, "getHours").returns(9);
	sinon.stub(Date.prototype, "getMinutes").returns(17);

	const graph = await generateProjectGraph.usingObject({
		dependencyTree: applicationJTree
	});
	await graph.build({
		destPath,
		includedTasks: ["generateResourcesJson", "generateVersionInfo"]
	});

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

test.serial("Build application.k (componentPreload excludes)", async (t) => {
	const destPath = "./test/tmp/build/application.k/dest";
	const expectedPath = path.join("test", "expected", "build", "application.k", "dest");

	const graph = await generateProjectGraph.usingObject({
		dependencyTree: applicationKTree
	});
	await graph.build({
		destPath,
		includedTasks: ["generateComponentPreload"],
		excludedTasks: ["*"]
	});

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

test.serial("Build application.k (package sub-components / componentPreload excludes)", async (t) => {
	const destPath = "./test/tmp/build/application.k/dest-package-subcomponents";
	const expectedPath = path.join("test", "expected", "build", "application.k", "dest-package-subcomponents");

	const graph = await generateProjectGraph.usingObject({
		dependencyTree: applicationKPackageSubcomponentsTree
	});
	await graph.build({
		destPath,
		includedTasks: ["generateComponentPreload"],
		excludedTasks: ["*"]
	});

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

test.serial("Build application.l: minification excludes, w/ namespace", async (t) => {
	const destPath = "./test/tmp/build/application.l/dest";
	const expectedPath = path.join("test", "expected", "build", "application.l", "dest");

	const graph = await generateProjectGraph.usingObject({
		dependencyTree: applicationLTree
	});
	await graph.build({
		destPath,
		excludedTasks: ["generateComponentPreload", "generateStandaloneAppBundle", "generateVersionInfo"]
	});

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

test.serial("Build application.ø", async (t) => {
	const destPath = "./test/tmp/build/application.ø/dest";
	const expectedPath = path.join("test", "expected", "build", "application.ø", "dest");

	const graph = await generateProjectGraph.usingObject({
		dependencyTree: applicationØTree
	});
	await graph.build({
		destPath,
		excludedTasks: ["generateVersionInfo"]
	});

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

test.serial("Build library.d with copyright from .library file", async (t) => {
	const destPath = "./test/tmp/build/library.d/dest";
	const expectedPath = path.join("test", "expected", "build", "library.d", "dest");

	const graph = await generateProjectGraph.usingObject({
		dependencyTree: libraryDTree
	});
	await graph.build({
		destPath,
		excludedTasks: ["generateLibraryPreload"]
	});

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

test.serial("Build library.e with copyright from metadata configuration of tree", async (t) => {
	const destPath = path.join("test", "tmp", "build", "library.e", "dest");
	const expectedPath = path.join("test", "expected", "build", "library.e", "dest");

	const graph = await generateProjectGraph.usingObject({
		dependencyTree: libraryETree
	});
	await graph.build({
		destPath,
		excludedTasks: ["generateLibraryPreload"]
	});

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

test.serial("Build library.h with custom bundles and component-preloads", async (t) => {
	const destPath = path.join("test", "tmp", "build", "library.h", "dest");
	const expectedPath = path.join("test", "expected", "build", "library.h", "dest");

	const graph = await generateProjectGraph.usingObject({
		dependencyTree: libraryHTree
	});
	await graph.build({
		destPath,
		excludedTasks: ["generateLibraryPreload"]
	});

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

test.serial("Build library.h with custom bundles and component-preloads (no minify)", async (t) => {
	const destPath = path.join("test", "tmp", "build", "library.h", "no-minify");
	const expectedPath = path.join("test", "expected", "build", "library.h", "no-minify");

	const graph = await generateProjectGraph.usingObject({
		dependencyTree: libraryHTree
	});
	await graph.build({
		destPath,
		excludedTasks: ["minify", "generateLibraryPreload"]
	});

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

test.serial("Build library.h with custom bundles and component-preloads with resources.json", async (t) => {
	const destPath = path.join("test", "tmp", "build", "library.h", "dest-resources-json");
	const expectedPath = path.join("test", "expected", "build", "library.h", "dest-resources-json");

	const graph = await generateProjectGraph.usingObject({
		dependencyTree: libraryHTree
	});
	await graph.build({
		destPath,
		includedTasks: ["generateResourcesJson"],
		excludedTasks: ["generateLibraryPreload"]
	});

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

test.serial("Build library.i with manifest info taken from .library and library.js", async (t) => {
	const destPath = path.join("test", "tmp", "build", "library.i", "dest");
	const expectedPath = path.join("test", "expected", "build", "library.i", "dest");

	const graph = await generateProjectGraph.usingObject({
		dependencyTree: libraryITree
	});
	await graph.build({
		destPath,
		excludedTasks: ["generateLibraryPreload", "minify"]
	});

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

test.serial("Build library.j with JSDoc build only", async (t) => {
	const destPath = path.join("test", "tmp", "build", "library.j", "dest");
	const expectedPath = path.join("test", "expected", "build", "library.j", "dest");

	const graph = await generateProjectGraph.usingObject({
		dependencyTree: libraryJTree
	});
	await graph.build({
		destPath,
		includedTasks: ["generateJsdoc"],
		excludedTasks: ["*"]
	});

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

test.serial("Build library.l", async (t) => {
	const destPath = path.join("test", "tmp", "build", "library.l", "dest");
	const expectedPath = path.join("test", "expected", "build", "library.l", "dest");

	const graph = await generateProjectGraph.usingObject({
		dependencyTree: libraryLTree
	});
	await graph.build({
		destPath,
		excludedTasks: ["generateLibraryManifest", "generateLibraryPreload"]
	});

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

test.serial("Build theme.j even without an library", async (t) => {
	const destPath = "./test/tmp/build/theme.j/dest";
	const expectedPath = "./test/expected/build/theme.j/dest";

	const graph = await generateProjectGraph.usingObject({
		dependencyTree: themeJTree
	});
	await graph.build({
		destPath
	});

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

test.serial("Build theme.j even without an library with resources.json", async (t) => {
	const destPath = "./test/tmp/build/theme.j/dest-resources-json";
	const expectedPath = "./test/expected/build/theme.j/dest-resources-json";

	const graph = await generateProjectGraph.usingObject({
		dependencyTree: themeJTree
	});
	await graph.build({
		destPath,
		includedTasks: [
			"generateResourcesJson"
		],
	});

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

test.serial("Build library.ø", async (t) => {
	const destPath = "./test/tmp/build/library.ø/dest";
	const expectedPath = path.join("test", "expected", "build", "library.ø", "dest");

	const graph = await generateProjectGraph.usingObject({
		dependencyTree: libraryØTree
	});
	await graph.build({
		destPath
	});

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

test.serial("Build library.coreBuildtime: replaceBuildtime", async (t) => {
	const destPath = path.join("test", "tmp", "build", "sap.ui.core-buildtime", "dest");
	const expectedPath = path.join("test", "expected", "build", "sap.ui.core-buildtime", "dest");

	const dateStubs = [
		sinon.stub(Date.prototype, "getFullYear").returns(2022),
		sinon.stub(Date.prototype, "getMonth").returns(5),
		sinon.stub(Date.prototype, "getDate").returns(20),
		sinon.stub(Date.prototype, "getHours").returns(16),
		sinon.stub(Date.prototype, "getMinutes").returns(30),
	];

	const graph = await generateProjectGraph.usingObject({
		dependencyTree: libraryCoreBuildtimeTree
	});
	await graph.build({
		destPath,
		excludedTasks: ["generateLibraryManifest", "generateLibraryPreload"]
	});

	dateStubs.forEach((stub) => stub.restore());

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

test.serial("Build library with theme configured for CSS variables", async (t) => {
	const destPath = "./test/tmp/build/theme.j/dest-css-variables";
	const expectedPath = "./test/expected/build/theme.j/dest-css-variables";

	const graph = await generateProjectGraph.usingObject({
		dependencyTree: themeJTree
	});
	await graph.build({
		destPath,
		cssVariables: true,
	});

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

test.serial("Build library with theme configured for CSS variables and theme designer resources", async (t) => {
	const destPath = "./test/tmp/build/theme.j/dest-css-variables-theme-designer-resources";
	const expectedPath = "./test/expected/build/theme.j/dest-css-variables-theme-designer-resources";

	const graph = await generateProjectGraph.usingObject({
		dependencyTree: themeJTree
	});
	await graph.build({
		destPath,
		cssVariables: true,
		includedTasks: ["generateThemeDesignerResources"]
	});

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

test.serial("Build theme-library with CSS variables", async (t) => {
	const destPath = "./test/tmp/build/theme.library.e/dest-css-variables";
	const expectedPath = "./test/expected/build/theme.library.e/dest-css-variables";

	const graph = await generateProjectGraph.usingObject({
		dependencyTree: themeLibraryETree
	});
	await graph.build({
		destPath,
		cssVariables: true
	});

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

test.serial("Build theme-library with CSS variables and theme designer resources", async (t) => {
	const destPath = "./test/tmp/build/theme.library.e/dest-css-variables-theme-designer-resources";
	const expectedPath = "./test/expected/build/theme.library.e/dest-css-variables-theme-designer-resources";

	const graph = await generateProjectGraph.usingObject({
		dependencyTree: themeLibraryETree
	});
	await graph.build({
		destPath,
		cssVariables: true,
		includedTasks: ["generateThemeDesignerResources"]
	});

	const expectedFiles = await findFiles(expectedPath);
	// Check for all directories and files
	directoryDeepEqual(t, destPath, expectedPath);
	// Check for all file contents
	await checkFileContentsIgnoreLineFeeds(t, expectedFiles, expectedPath, destPath);
	t.pass();
});

// TODO: FIX
test.serial.skip("Cleanup", async (t) => {
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
			"configuration": {
				"specVersion": "2.6",
				"type": "library",
				"metadata": {
					"name": "sap.ui.core",
					"copyright": "Some fancy copyright"
				},
				"resources": {
					"configuration": {
						"paths": {
							"src": "main/src"
						}
					}
				}
			}
		}
	],
	"configuration": {
		"specVersion": "2.6",
		"type": "library",
		"metadata": {
			"name": "library.d",
			"copyright": "Some fancy copyright"
		},
		"resources": {
			"configuration": {
				"paths": {
					"src": "main/src",
					"test": "main/test"
				},
				"propertiesFileSourceEncoding": "ISO-8859-1"
			}
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
			"configuration": {
				"specVersion": "2.6",
				"type": "library",
				"metadata": {
					"name": "library.a",
					"copyright": "${copyright}"
				},
				"resources": {
					"configuration": {
						"paths": {
							"src": "src",
							"test": "test"
						}
					}
				}
			}
		},
		{
			"id": "library.b",
			"version": "1.0.0",
			"path": path.join(collectionPath, "library.b"),
			"dependencies": [],
			"configuration": {
				"specVersion": "2.6",
				"type": "library",
				"metadata": {
					"name": "library.b",
					"copyright": "${copyright}"
				},
				"resources": {
					"configuration": {
						"paths": {
							"src": "src",
							"test": "test"
						}
					}
				}
			}
		},
		{
			"id": "library.c",
			"version": "1.0.0",
			"path": path.join(collectionPath, "library.c"),
			"dependencies": [],
			"configuration": {
				"specVersion": "2.6",
				"type": "library",
				"metadata": {
					"name": "library.c",
					"copyright": "${copyright}"
				},
				"resources": {
					"configuration": {
						"paths": {
							"src": "src",
							"test": "test"
						}
					}
				}
			}
		}
	],
	"configuration": {
		"specVersion": "2.6",
		"type": "application",
		"metadata": {
			"name": "application.a"
		},
		"resources": {
			"configuration": {
				"paths": {
					"webapp": "webapp"
				},
				"propertiesFileSourceEncoding": "ISO-8859-1"
			}
		}
	}
};

const applicationATreeBadType = {
	"id": "application.a",
	"version": "1.0.0",
	"path": applicationAPath,
	"specVersion": "2.6",
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
	"dependencies": [],
	"configuration": {
		"specVersion": "2.6",
		"type": "application",
		"metadata": {
			"name": "application.g",
			"copyright": "Some fancy copyright"
		},
		"resources": {
			"configuration": {
				"paths": {
					"webapp": "webapp"
				},
				"propertiesFileSourceEncoding": "ISO-8859-1"
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
	}
};

const applicationGTreeWithExcludes = {
	"id": "application.g",
	"version": "1.0.0",
	"path": applicationGPath,
	"dependencies": [],
	"configuration": {
		"specVersion": "2.6",
		"type": "application",
		"metadata": {
			"name": "application.g",
			"copyright": "Some fancy copyright"
		},
		"resources": {
			"configuration": {
				"paths": {
					"webapp": "webapp"
				},
				"propertiesFileSourceEncoding": "ISO-8859-1"
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
	}
};

const applicationGTreeComponentPreloadPaths = {
	"id": "application.g",
	"version": "1.0.0",
	"path": applicationGPath,
	"dependencies": [],
	"configuration": {
		"specVersion": "2.6",
		"type": "application",
		"metadata": {
			"name": "application.g",
			"copyright": "Some fancy copyright"
		},
		"resources": {
			"configuration": {
				"paths": {
					"webapp": "webapp"
				},
				"propertiesFileSourceEncoding": "ISO-8859-1"
			}
		},
		"builder": {
			"componentPreload": {
				"paths": [
					"application/g/**/Component.js"
				]
			}
		}
	}
};

const applicationHTree = {
	"id": "application.h",
	"version": "1.0.0",
	"path": applicationHPath,
	"dependencies": [],
	"configuration": {
		"specVersion": "2.6",
		"type": "application",
		"metadata": {
			"name": "application.h"
		},
		"resources": {
			"configuration": {
				"paths": {
					"webapp": "webapp"
				},
				"propertiesFileSourceEncoding": "ISO-8859-1"
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
					}]
				},
				"bundleOptions": {
					"optimize": true
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
					"optimize": false
				}
			}]
		}
	}
};

const applicationITree = {
	"id": "application.i",
	"version": "1.0.0",
	"path": applicationIPath,
	"dependencies": [],
	"configuration": {
		"specVersion": "2.6",
		"type": "application",
		"metadata": {
			"name": "application.i"
		},
		"resources": {
			"configuration": {
				"paths": {
					"webapp": "webapp"
				},
				"propertiesFileSourceEncoding": "ISO-8859-1"
			}
		},
		"builder": {
			"bundles": []
		}
	},
};

const applicationJTree = {
	"id": "application.j",
	"version": "1.0.0",
	"path": applicationJPath,
	"dependencies": [],
	"configuration": {
		"specVersion": "2.6",
		"type": "application",
		"metadata": {
			"name": "application.j"
		},
		"resources": {
			"configuration": {
				"paths": {
					"webapp": "webapp"
				},
				"propertiesFileSourceEncoding": "ISO-8859-1"
			}
		},
		"builder": {
			"bundles": []
		}
	}
};

const applicationKTree = {
	"id": "application.k",
	"version": "1.0.0",
	"path": applicationKPath,
	"dependencies": [],
	"configuration": {
		"specVersion": "2.6",
		"type": "application",
		"metadata": {
			"name": "application.k",
			"copyright": "Some fancy copyright"
		},
		"resources": {
			"configuration": {
				"paths": {
					"webapp": "webapp"
				},
				"propertiesFileSourceEncoding": "ISO-8859-1"
			}
		},
		"builder": {
			"componentPreload": {
				"namespaces": [
					"application/k",
					"application/k/subcomponentA",
					"application/k/subcomponentB"
				],
				"excludes": [
					"application/k/**/thirdparty/",
					"!application/k/subcomponentB/thirdparty/"
				]
			}
		}
	}
};

const applicationKPackageSubcomponentsTree = clone(applicationKTree);
applicationKPackageSubcomponentsTree.configuration.builder = {
	"componentPreload": {
		"excludes": [
			"application/k/**/thirdparty/",
			"!application/k/subcomponentB/thirdparty/"
		]
	}
};

const applicationLTree = {
	"id": "application.l",
	"version": "1.0.0",
	"path": applicationLPath,
	"dependencies": [],
	"configuration": {
		"specVersion": "2.6",
		"type": "application",
		"metadata": {
			"name": "application.l"
		},
		"resources": {
			"configuration": {
				"paths": {
					"webapp": "webapp"
				},
				"propertiesFileSourceEncoding": "ISO-8859-1"
			}
		},
		"builder": {
			"minification": {
				"excludes": [
					"application/l/**/thirdparty/**",
					"!application/l/subdir/thirdparty/File1.js"
				]
			}
		}
	}
};

const applicationØTree = {
	"id": "application.ø",
	"version": "1.0.0",
	"path": applicationØPath,
	"dependencies": [
		{
			"id": "sap.ui.core-evo",
			"version": "1.0.0",
			"path": libraryCore,
			"dependencies": [],
			"configuration": {
				"specVersion": "2.6",
				"type": "library",
				"metadata": {
					"name": "sap.ui.core",
					"copyright": "Some fancy copyright"
				},
				"resources": {
					"configuration": {
						"paths": {
							"src": "main/src"
						}
					}
				}
			}
		}
	],
	"configuration": {
		"specVersion": "2.0",
		"type": "application",
		"metadata": {
			"name": "application.ø"
		},
		"resources": {
			"configuration": {
				"paths": {
					"webapp": "wêbäpp"
				},
				"propertiesFileSourceEncoding": "UTF-8",
			}
		}
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
			"configuration": {
				"specVersion": "2.6",
				"type": "library",
				"metadata": {
					"name": "sap.ui.core",
					"copyright": "Some fancy copyright"
				},
				"resources": {
					"configuration": {
						"paths": {
							"src": "main/src"
						}
					}
				}
			}
		}
	],
	"configuration": {
		"specVersion": "2.6",
		"type": "library",
		"metadata": {
			"name": "library.e",
			"copyright": "UI development toolkit for HTML5 (OpenUI5)\n * (c) Copyright 2009-xxx SAP SE or an " +
				"SAP affiliate company.\n * Licensed under the Apache License, Version 2.0 - see LICENSE.txt."
		},
		"resources": {
			"configuration": {
				"paths": {
					"src": "src",
					"test": "test"
				},
				"propertiesFileSourceEncoding": "ISO-8859-1"
			}
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
			"configuration": {
				"specVersion": "2.6",
				"type": "library",
				"metadata": {
					"name": "sap.ui.core",
					"copyright": "Some fancy copyright"
				},
				"resources": {
					"configuration": {
						"paths": {
							"src": "main/src"
						}
					}
				}
			}
		}
	],
	"configuration": {
		"specVersion": "2.6",
		"type": "library",
		"metadata": {
			"name": "library.h",
			"copyright": "Some fancy copyright"
		},
		"resources": {
			"configuration": {
				"paths": {
					"src": "main/src",
					"test": "main/test"
				},
				"propertiesFileSourceEncoding": "ISO-8859-1"
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
							"library/h/fi*.js",
							"!library/h/components/"
						],
						"resolve": false,
						"renderer": false
					}, {
						"mode": "raw",
						"filters": [
							"library/h/not.js"
						],
						"resolve": true,
						"sort": true,
						"renderer": false
					}]
				},
				"bundleOptions": {
					"optimize": true
				}
			}, {
				"bundleDefinition": {
					"name": "library/h/customBundle-dbg.js",
					"defaultFileTypes": [".js"],
					"sections": [{
						"mode": "preload",
						"filters": [
							"library/h/some.js",
							"library/h/library.js",
							"library/h/fi*.js",
							"!library/h/components/"
						],
						"resolve": false,
						"renderer": false
					}, {
						"mode": "raw",
						"filters": [
							"library/h/not.js"
						],
						"resolve": true,
						"sort": true,
						"renderer": false
					}]
				},
				"bundleOptions": {
					"optimize": false
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
			"configuration": {
				"specVersion": "2.6",
				"type": "library",
				"metadata": {
					"name": "sap.ui.core",
					"copyright": "Some fancy copyright"
				},
				"resources": {
					"configuration": {
						"paths": {
							"src": "main/src"
						}
					}
				}
			}
		},
		cloneProjectTree(libraryDTree)
	],
	"configuration": {
		"specVersion": "2.6",
		"type": "library",
		"metadata": {
			"name": "library.i",
			"copyright": "Some fancy copyright"
		},
		"resources": {
			"configuration": {
				"paths": {
					"src": "main/src",
					"test": "main/test"
				},
				"propertiesFileSourceEncoding": "ISO-8859-1"
			}
		}
	}
};

const libraryJTree = {
	"id": "library.j",
	"version": "1.0.0",
	"path": libraryJPath,
	"dependencies": [],
	"configuration": {
		"specVersion": "2.6",
		"type": "library",
		"metadata": {
			"name": "library.j",
			"copyright": "Some fancy copyright"
		},
		"resources": {
			"configuration": {
				"paths": {
					"src": "main/src"
				}
			}
		}
	},
};

const libraryLTree = {
	"id": "library.l",
	"version": "1.0.0",
	"path": libraryLPath,
	"dependencies": [],
	"configuration": {
		"specVersion": "2.6",
		"type": "library",
		"metadata": {
			"name": "library.l",
			"copyright": "Some fancy copyright"
		},
		"resources": {
			"configuration": {
				"paths": {
					"src": "main/src"
				},
				"propertiesFileSourceEncoding": "ISO-8859-1"
			}
		},
		"builder": {
			"minification": {
				"excludes": [
					"**/thirdparty/**",
					"!**/subdir/thirdparty/File1.js"
				]
			}
		}
	}
};

const libraryØTree = {
	"id": "library.ø",
	"version": "1.0.0",
	"path": libraryØPath,
	"dependencies": [
		{
			"id": "sap.ui.core-evo",
			"version": "1.0.0",
			"path": libraryCore,
			"dependencies": [],
			"configuration": {
				"specVersion": "2.6",
				"type": "library",
				"metadata": {
					"name": "sap.ui.core",
					"copyright": "Some fancy copyright"
				},
				"resources": {
					"configuration": {
						"paths": {
							"src": "main/src"
						}
					}
				}
			}
		}
	],
	"configuration": {
		"specVersion": "2.0",
		"type": "library",
		"metadata": {
			"name": "library.ø",
			"copyright": "Some fancy copyright"
		},
		"resources": {
			"configuration": {
				"paths": {
					"src": "máin/ßrc",
					"test": "máin/吉"
				},
				"propertiesFileSourceEncoding": "UTF-8"
			}
		}
	}
};

const libraryCoreBuildtimeTree = {
	"id": "library.coreBuildtime",
	"version": "1.0.0",
	"path": libraryCoreBuildtime,
	"dependencies": [],
	"configuration": {
		"specVersion": "2.6",
		"type": "library",
		"metadata": {
			"name": "library.coreBuildtime",
			"copyright": "Some fancy copyright"
		},
		"resources": {
			"configuration": {
				"paths": {
					"src": "main/src"
				},
				"propertiesFileSourceEncoding": "ISO-8859-1"
			}
		}
	}
};

const themeJTree = {
	"id": "theme.j",
	"version": "1.0.0",
	"path": themeJPath,
	"dependencies": [],
	"configuration": {
		"specVersion": "2.6",
		"type": "theme-library",
		"metadata": {
			"name": "theme.j",
			"copyright": "Some fancy copyright"
		},
		"resources": {
			"configuration": {
				"paths": {
					"src": "main/src",
					"test": "main/test"
				},
				"propertiesFileSourceEncoding": "ISO-8859-1"
			}
		}
	}
};

const themeLibraryETree = {
	"id": "theme.library.e.id",
	"version": "1.0.0",
	"path": themeLibraryEPath,
	"dependencies": [],
	"configuration": {
		"specVersion": "2.0",
		"type": "theme-library",
		"metadata": {
			"name": "theme.library.e",
			"copyright": "Some fancy copyright"
		},
		"resources": {
			"configuration": {
				"paths": {
					"src": "src",
					"test": "test"
				}
			}
		}
	}
};
