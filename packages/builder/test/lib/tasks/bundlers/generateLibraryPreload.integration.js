const test = require("ava");
const path = require("path");
const chai = require("chai");
chai.use(require("chai-fs"));
const assert = chai.assert;

const ui5Fs = require("@ui5/fs");
const resourceFactory = ui5Fs.resourceFactory;
const DuplexCollection = ui5Fs.DuplexCollection;

const ui5Builder = require("../../../../");
const builder = ui5Builder.builder;
const {generateLibraryPreload} = ui5Builder.tasks;
const libraryDPath = path.join(__dirname, "..", "..", "..", "fixtures", "library.d");
const sapUiCorePath = path.join(__dirname, "..", "..", "..", "fixtures", "sap.ui.core");

const recursive = require("recursive-readdir");

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

test("integration: build library.d with library preload", async (t) => {
	const destPath = "./test/tmp/build/library.d/preload";
	const expectedPath = "./test/expected/build/library.d/preload";
	const excludedTasks = ["*"];
	const includedTasks = ["generateLibraryPreload"];

	return t.notThrowsAsync(builder.build({
		tree: libraryDTree,
		destPath,
		excludedTasks,
		includedTasks
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);

		// Check for all file contents
		t.deepEqual(expectedFiles.length, 4, "4 files are expected");
		expectedFiles.forEach((expectedFile) => {
			const relativeFile = path.relative(expectedPath, expectedFile);
			const destFile = path.join(destPath, relativeFile);
			assert.fileEqual(destFile, expectedFile);
		});
	}));
});

const libraryDTree = {
	"id": "library.d",
	"version": "1.0.0",
	"path": libraryDPath,
	"dependencies": [],
	"_level": 1,
	"specVersion": "0.1",
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
			}
		},
		"pathMappings": {
			"/resources/": "main/src",
			"/test-resources/": "main/test"
		}
	}
};

test("integration: build sap.ui.core with library preload", async (t) => {
	const destPath = "./test/tmp/build/sap.ui.core/preload";
	const expectedPath = "./test/expected/build/sap.ui.core/preload";
	const excludedTasks = ["*"];
	const includedTasks = ["minify", "generateLibraryPreload"];

	return t.notThrowsAsync(builder.build({
		tree: sapUiCoreTree,
		destPath,
		excludedTasks,
		includedTasks
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath);

		// Check for all file contents
		t.deepEqual(expectedFiles.length, 17, "17 files are expected");
		expectedFiles.forEach((expectedFile) => {
			const relativeFile = path.relative(expectedPath, expectedFile);
			const destFile = path.join(destPath, relativeFile);
			assert.fileEqual(destFile, expectedFile);
		});
	}));
});

const sapUiCoreTree = {
	"id": "sap.ui.core",
	"version": "1.0.0",
	"path": sapUiCorePath,
	"dependencies": [],
	"_level": 1,
	"specVersion": "0.1",
	"type": "library",
	"metadata": {
		"name": "sap.ui.core",
		"copyright": "Some fancy copyright"
	},
	"resources": {
		"configuration": {
			"paths": {
				"src": "main/src",
				"test": "main/test"
			}
		},
		"pathMappings": {
			"/resources/": "main/src",
			"/test-resources/": "main/test"
		}
	}
};


test("integration: generateLibraryPreload", async (t) => {
	const reader = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	await reader.write(resourceFactory.createResource({
		path: "/resources/my/test/lib/library.js",
		string: ""
	}));

	const writer = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const duplexCollection = new DuplexCollection({reader, writer});
	const dependencies = resourceFactory.createAdapter({
		virBasePath: "/"
	});

	await generateLibraryPreload({
		workspace: duplexCollection,
		dependencies: dependencies,
		options: {
			projectName: "my.test.lib"
		}
	});

	const writtenResources = await writer.byGlob(["**/**"]);
	t.deepEqual(writtenResources.map((r) => r.getPath()).sort(), [
		"/resources/my/test/lib/library-preload.js"
	], "Expected preload files should be created");

	const libraryPreload = await writer.byPath("/resources/my/test/lib/library-preload.js");
	t.truthy(libraryPreload, "library-preload.js should have been created");
	const libraryPreloadContent = await libraryPreload.getString();
	t.true(libraryPreloadContent.includes("//@ui5-bundle my/test/lib/library-preload.js"),
		"library-preload should be a bundle");
	t.regex(libraryPreloadContent, new RegExp("my/test/lib/library"),
		"library-preload should include library.js module");
});

test("integration: generateLibraryPreload with designtime and support files", async (t) => {
	const reader = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	await reader.write(resourceFactory.createResource({
		path: "/resources/my/test/lib/library.js",
		string: ""
	}));

	// designtime
	await reader.write(resourceFactory.createResource({
		path: "/resources/my/test/lib/designtime/foo.js",
		string: ""
	}));
	await reader.write(resourceFactory.createResource({
		path: "/resources/my/test/lib/some.designtime.js",
		string: ""
	}));

	// support
	await reader.write(resourceFactory.createResource({
		path: "/resources/my/test/lib/some.support.js",
		string: ""
	}));
	await reader.write(resourceFactory.createResource({
		path: "/resources/my/test/lib/support/foo.support.js",
		string: ""
	}));

	const writer = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const duplexCollection = new DuplexCollection({reader, writer});
	const dependencies = resourceFactory.createAdapter({
		virBasePath: "/"
	});

	await generateLibraryPreload({
		workspace: duplexCollection,
		dependencies: dependencies,
		options: {
			projectName: "my.test.lib"
		}
	});

	const writtenResources = await writer.byGlob(["**/**"]);
	t.deepEqual(writtenResources.map((r) => r.getPath()).sort(), [
		"/resources/my/test/lib/designtime/library-preload.designtime.js",
		"/resources/my/test/lib/library-preload.js",
		"/resources/my/test/lib/library-preload.support.js"
	], "Expected preload files should be created");

	const libraryPreload = await writer.byPath("/resources/my/test/lib/library-preload.js");
	t.truthy(libraryPreload, "library-preload.js should have been created");
	const libraryPreloadContent = await libraryPreload.getString();
	t.true(libraryPreloadContent.includes("//@ui5-bundle my/test/lib/library-preload.js"),
		"library-preload should be a bundle");
	t.regex(libraryPreloadContent, new RegExp("my/test/lib/library"),
		"library-preload should include library.js module");

	const designtimePreload = await writer.byPath("/resources/my/test/lib/designtime/library-preload.designtime.js");
	t.truthy(designtimePreload, "library-preload.js should have been created");
	const designtimePreloadContent = await designtimePreload.getString();
	t.true(designtimePreloadContent.includes("//@ui5-bundle my/test/lib/designtime/library-preload.designtime.js"),
		"library-preload.designtime should be a bundle");
	t.regex(designtimePreloadContent, new RegExp("my/test/lib/designtime/foo"),
		"library-preload should include designtime/foo module");
	t.regex(designtimePreloadContent, new RegExp("my/test/lib/some\\.designtime"),
		"library-preload should include some.designtime module");

	const supportPreload = await writer.byPath("/resources/my/test/lib/library-preload.support.js");
	t.truthy(supportPreload, "library-preload.js should have been created");
	const supportPreloadContent = await supportPreload.getString();
	t.true(supportPreloadContent.includes("//@ui5-bundle my/test/lib/library-preload.support.js"),
		"library-preload.support should be a bundle");
	t.regex(supportPreloadContent, new RegExp("my/test/lib/some\\.support"),
		"library-preload.support should include some.support module");
	t.regex(supportPreloadContent, new RegExp("my/test/lib/support/foo\\.support"),
		"library-preload.support should include support/foo.support module");
});
