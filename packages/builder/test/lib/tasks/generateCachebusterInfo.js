import test from "ava";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import chai from "chai";
import chaiFs from "chai-fs";
chai.use(chaiFs);
const assert = chai.assert;

import {graphFromObject} from "@ui5/project/graph";
import * as taskRepository from "../../../lib/tasks/taskRepository.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const applicationGPath = path.join(__dirname, "..", "..", "fixtures", "application.g");

import recursive from "recursive-readdir";

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

test("integration: Build application.g", async (t) => {
	const destPath = path.join("test", "tmp", "build", "application.g", "cachebuster");
	const expectedPath = path.join("test", "expected", "build", "application.g", "cachebuster");
	const excludedTasks = ["escapeNonAsciiCharacters", "generateVersionInfo"];
	const includedTasks = ["generateCachebusterInfo"];

	const graph = await graphFromObject({
		dependencyTree: applicationGTree
	});

	graph.setTaskRepository(taskRepository);
	await graph.build({
		destPath,
		excludedTasks,
		includedTasks
	});
	const expectedFiles = await findFiles(expectedPath);

	// Check for all directories and files
	assert.directoryDeepEqual(destPath, expectedPath);

	// Check for all file contents
	expectedFiles.forEach((expectedFile) => {
		const relativeFile = path.relative(expectedPath, expectedFile);
		const destFile = path.join(destPath, relativeFile);
		if (expectedFile.endsWith("sap-ui-cachebuster-info.json")) {
			const currentContent = JSON.parse(fs.readFileSync(destFile, "utf-8").replace(/(:\s+)(\d+)/g, ": 0"));
			const expectedContent = JSON.parse(fs.readFileSync(expectedFile, "utf-8").replace(/(:\s+)(\d+)/g, ": 0"));
			assert.deepEqual(currentContent, expectedContent);
		} else {
			assert.fileEqual(destFile, expectedFile);
		}
	});
	t.pass();
});

test("integration: Build application.g with cachebuster using hashes", async (t) => {
	const destPath = path.join("test", "tmp", "build", "application.g", "cachebuster_hash");
	const expectedPath = path.join("test", "expected", "build", "application.g", "cachebuster");
	const excludedTasks = ["escapeNonAsciiCharacters", "generateVersionInfo"];
	const includedTasks = ["generateCachebusterInfo"];

	const graph = await graphFromObject({
		dependencyTree: applicationGTreeWithCachebusterHash
	});

	graph.setTaskRepository(taskRepository);
	await graph.build({
		destPath,
		excludedTasks,
		includedTasks
	});

	const expectedFiles = await findFiles(expectedPath);

	// Check for all directories and files
	assert.directoryDeepEqual(destPath, expectedPath);

	// Check for all file contents
	expectedFiles.forEach((expectedFile) => {
		const relativeFile = path.relative(expectedPath, expectedFile);
		const destFile = path.join(destPath, relativeFile);
		if (expectedFile.endsWith("sap-ui-cachebuster-info.json")) {
			const currentContent = JSON.parse(fs.readFileSync(destFile, "utf-8").replace(/(:\s+)("[^"]+")/g, ": \"\""));
			const expectedContent = JSON.parse(fs.readFileSync(expectedFile, "utf-8").replace(/(:\s+)(\d+)/g, ": \"\""));
			assert.deepEqual(currentContent, expectedContent);
		} else {
			assert.fileEqual(destFile, expectedFile);
		}
	});
	t.pass();
});

const applicationGTree = {
	"id": "application.g",
	"version": "1.0.0",
	"path": applicationGPath,
	"dependencies": [],
	"configuration": {
		"builder": {},
		"specVersion": "2.0",
		"type": "application",
		"metadata": {
			"name": "application.g",
			"copyright": "Some fancy copyright"
		},
		"resources": {
			"configuration": {
				"paths": {
					"webapp": "webapp"
				}
			}
		}
	}
};

const applicationGTreeWithCachebusterHash = {
	"id": "application.g",
	"version": "1.0.0",
	"path": applicationGPath,
	"dependencies": [],
	"configuration": {
		"builder": {
			"cachebuster": {
				"signatureType": "hash"
			}
		},
		"specVersion": "2.0",
		"type": "application",
		"metadata": {
			"name": "application.g",
			"copyright": "Some fancy copyright"
		},
		"resources": {
			"configuration": {
				"paths": {
					"webapp": "webapp"
				}
			}
		}
	}
};
