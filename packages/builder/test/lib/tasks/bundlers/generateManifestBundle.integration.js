import test from "ava";
import {fileURLToPath} from "node:url";
import path from "node:path";
import chai from "chai";
import chaiFs from "chai-fs";
chai.use(chaiFs);
const assert = chai.assert;
import extractZip from "extract-zip";
import recursive from "recursive-readdir";
import {graphFromObject} from "@ui5/project/graph";
import * as taskRepository from "../../../../lib/tasks/taskRepository.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const applicationBPath = path.join(__dirname, "..", "..", "..", "fixtures", "application.b");
const libraryCore = path.join(__dirname, "..", "..", "..", "fixtures", "sap.ui.core-evo");
const libraryKPath = path.join(__dirname, "..", "..", "..", "fixtures", "library.k");


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

test("integration: Build application.b with manifestBundler", async (t) => {
	const destPath = path.join("test", "tmp", "build", "application.b", "dest");
	const destBundle = path.resolve(path.join(destPath, "manifest-bundle"));
	const expectedPath = path.join("test", "expected", "build", "application.b", "dest", "manifest-bundle");
	const excludedTasks = ["*"];
	const includedTasks = ["escapeNonAsciiCharacters", "generateManifestBundle"];

	const graph = await graphFromObject({
		dependencyTree: applicationBTree
	});

	graph.setTaskRepository(taskRepository);
	await graph.build({
		destPath,
		excludedTasks,
		includedTasks
	});
	await extractZip(destBundle + ".zip", {dir: destBundle});

	const expectedFiles = await findFiles(expectedPath);

	// Check for all directories and files
	assert.directoryDeepEqual(destBundle, expectedPath);

	// Check for all file contents
	expectedFiles.forEach((expectedFile) => {
		const relativeFile = path.relative(expectedPath, expectedFile);
		const destFile = path.join(destBundle, relativeFile);
		assert.fileEqual(destFile, expectedFile);
	});
	t.pass("No assertion exception");
});

test("integration: Build library.k with manifestBundler", async (t) => {
	const destPath = path.join("test", "tmp", "build", "library.k", "dest");
	const destBundle = path.resolve(path.join(destPath, "resources", "library", "k", "manifest-bundle"));
	const expectedPath =
		path.join("test", "expected", "build", "library.k", "dest", "resources", "library", "k", "manifest-bundle");
	const excludedTasks = ["*"];
	const includedTasks = ["generateLibraryManifest", "generateManifestBundle"];

	const graph = await graphFromObject({
		dependencyTree: libraryKTree
	});

	graph.setTaskRepository(taskRepository);
	await graph.build({
		destPath,
		excludedTasks,
		includedTasks
	});

	await extractZip(destBundle + ".zip", {dir: destBundle});

	const expectedFiles = await findFiles(expectedPath);

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

const applicationBTree = {
	"id": "application.b",
	"version": "1.0.0",
	"path": applicationBPath,
	"dependencies": [],
	"configuration": {
		"specVersion": "2.0",
		"type": "application",
		"metadata": {
			"name": "application.b"
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
			"configuration": {
				"specVersion": "2.0",
				"type": "library",
				"metadata": {
					"name": "sap.ui.core"
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
			"name": "library.k"
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
