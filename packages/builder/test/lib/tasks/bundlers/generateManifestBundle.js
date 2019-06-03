const {test} = require("ava");
const path = require("path");
const chai = require("chai");
chai.use(require("chai-fs"));
const assert = chai.assert;


const ui5Builder = require("../../../../");
const builder = ui5Builder.builder;
const applicationBPath = path.join(__dirname, "..", "..", "..", "fixtures", "application.b");
const libraryCore = path.join(__dirname, "..", "..", "..", "fixtures", "sap.ui.core-evo");
const libraryKPath = path.join(__dirname, "..", "..", "..", "fixtures", "library.k");
const {promisify} = require("util");
const extractZip = promisify(require("extract-zip"));

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

test("integration: Build application.b with manifestBundler", (t) => {
	const destPath = path.join("test", "tmp", "build", "application.b", "dest");
	const destBundle = path.resolve(path.join(destPath, "manifest-bundle"));
	const expectedPath = path.join("test", "expected", "build", "application.b", "dest", "manifest-bundle");
	const excludedTasks = ["*"];
	const includedTasks = ["generateManifestBundle"];

	return builder.build({
		tree: applicationBTree,
		destPath,
		excludedTasks,
		includedTasks
	}).then(() => {
		return extractZip(destBundle + ".zip", {dir: destBundle});
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destBundle, expectedPath);

		// Check for all file contents
		expectedFiles.forEach((expectedFile) => {
			const relativeFile = path.relative(expectedPath, expectedFile);
			const destFile = path.join(destBundle, relativeFile);
			assert.fileEqual(destFile, expectedFile);
		});
		t.pass();
	});
});

test("integration: Build library.k with manifestBundler", (t) => {
	const destPath = path.join("test", "tmp", "build", "library.k", "dest");
	const destBundle = path.resolve(path.join(destPath, "resources", "library", "k", "manifest-bundle"));
	const expectedPath = path.join("test", "expected", "build", "library.k", "dest", "resources", "library", "k", "manifest-bundle");
	const excludedTasks = ["*"];
	const includedTasks = ["generateLibraryManifest", "generateManifestBundle"];

	return builder.build({
		tree: libraryKTree,
		destPath,
		excludedTasks,
		includedTasks
	}).then(() => {
		return extractZip(destBundle + ".zip", {dir: destBundle});
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destBundle, expectedPath);

		// Check for all file contents
		expectedFiles.forEach((expectedFile) => {
			const relativeFile = path.relative(expectedPath, expectedFile);
			const destFile = path.join(destBundle, relativeFile);
			assert.fileEqual(destFile, expectedFile);
		});
		t.pass();
	});
});

const applicationBTree = {
	"id": "application.b",
	"version": "1.0.0",
	"path": applicationBPath,
	"dependencies": [
		{
			"id": "library.d",
			"version": "1.0.0",
			"path": path.join(applicationBPath, "..", "library.d"),
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
		},
		{
			"id": "library.a",
			"version": "1.0.0",
			"path": path.join(applicationBPath, "..", "collection", "library.a"),
			"dependencies": [],
			"_level": 1,
			"specVersion": "0.1",
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
			"path": path.join(applicationBPath, "..", "collection", "library.b"),
			"dependencies": [],
			"_level": 1,
			"specVersion": "0.1",
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
			"path": path.join(applicationBPath, "..", "collection", "library.c"),
			"dependencies": [],
			"_level": 1,
			"specVersion": "0.1",
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
				},
				"pathMappings": {
					"/resources/": "src",
					"/test-resources/": "test"
				}
			}
		}
	],
	"builder": {},
	"_level": 0,
	"specVersion": "0.1",
	"type": "application",
	"metadata": {
		"name": "application.b",
		"namespace": "id1"
	},
	"resources": {
		"configuration": {
			"paths": {
				"webapp": "webapp"
			}
		},
		"pathMappings": {
			"/": "webapp"
		}
	}
};

const libraryKTree = {
	"id": "library.k",
	"version": "1.0.0",
	"path": libraryKPath,
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
	"specVersion": "0.1",
	"type": "library",
	"metadata": {
		"name": "library.k",
		"copyright": "UI development toolkit for HTML5 (OpenUI5)\n * (c) Copyright 2009-xxx SAP SE or an SAP affiliate company.\n * Licensed under the Apache License, Version 2.0 - see LICENSE.txt."
	},
	"resources": {
		"configuration": {
			"paths": {
				"src": "src",
				"test": "test"
			}
		},
		"pathMappings": {
			"/resources/": "src"
		}
	}
};
