const {test} = require("ava");
const path = require("path");
const chai = require("chai");
chai.use(require("chai-fs"));
const assert = chai.assert;


const ui5Builder = require("../../../../");
const builder = ui5Builder.builder;
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

	return t.notThrows(builder.build({
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
	const includedTasks = ["generateLibraryPreload"];

	return t.notThrows(builder.build({
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
		t.deepEqual(expectedFiles.length, 7, "7 files are expected");
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
