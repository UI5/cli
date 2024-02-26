import test from "ava";
import path from "node:path";
import {directoryDeepEqual, fileEqual, findFiles, readFileContent} from "../../utils/fshelper.js";

import {graphFromObject} from "@ui5/project/graph";
import * as taskRepository from "../../../lib/tasks/taskRepository.js";

const __dirname = import.meta.dirname;

const applicationGPath = path.join(__dirname, "..", "..", "fixtures", "application.g");

test("integration: Build application.g", async (t) => {
	const destPath = path.join("test", "tmp", "build", "application.g", "cachebuster");
	const expectedPath = path.join("test", "expected", "build", "application.g", "cachebuster");
	const excludedTasks = ["escapeNonAsciiCharacters", "generateVersionInfo"];
	const includedTasks = ["generateCachebusterInfo"];

	const cleanupCacheBusterInfo = (fileContent) => fileContent.replace(/(:\s+)(\d+)/g, ": 0");

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
	await directoryDeepEqual(t, destPath, expectedPath);

	// Check for all file contents
	await Promise.all(expectedFiles.map(async (expectedFile) => {
		const relativeFile = path.relative(expectedPath, expectedFile);
		const destFile = path.join(destPath, relativeFile);
		if (expectedFile.endsWith("sap-ui-cachebuster-info.json")) {
			const destContent = JSON.parse(cleanupCacheBusterInfo(await readFileContent(destFile)));
			const expectedContent = JSON.parse(cleanupCacheBusterInfo(await readFileContent(expectedFile)));
			t.deepEqual(destContent, expectedContent);
		} else {
			await fileEqual(t, destFile, expectedFile);
		}
	}));
	t.pass();
});

test("integration: Build application.g with cachebuster using hashes", async (t) => {
	const destPath = path.join("test", "tmp", "build", "application.g", "cachebuster_hash");
	const expectedPath = path.join("test", "expected", "build", "application.g", "cachebuster");
	const excludedTasks = ["escapeNonAsciiCharacters", "generateVersionInfo"];
	const includedTasks = ["generateCachebusterInfo"];

	const cleanupCacheBusterInfo = (fileContent) => fileContent.replace(/(:\s+)("[^"]+")/g, ": \"\"");

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
	await directoryDeepEqual(t, destPath, expectedPath);

	// Check for all file contents
	await Promise.all(expectedFiles.map(async (expectedFile) => {
		const relativeFile = path.relative(expectedPath, expectedFile);
		const destFile = path.join(destPath, relativeFile);
		if (expectedFile.endsWith("sap-ui-cachebuster-info.json")) {
			const destContent = JSON.parse(cleanupCacheBusterInfo(await readFileContent(destFile)));
			const expectedContent = JSON.parse(cleanupCacheBusterInfo(await readFileContent(destFile)));
			t.deepEqual(destContent, expectedContent);
		} else {
			await fileEqual(t, destFile, expectedFile);
		}
	}));
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
