const {test} = require("ava");
const fs = require("fs");
const path = require("path");
const chai = require("chai");
chai.use(require("chai-fs"));
const assert = chai.assert;


const ui5Builder = require("../../../");
const builder = ui5Builder.builder;
const applicationGPath = path.join(__dirname, "..", "..", "fixtures", "application.g");

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

test("integration: Build application.g with manifestBundler", (t) => {
	const destPath = path.join("test", "tmp", "build", "application.g", "cachebuster");
	const expectedPath = path.join("test", "expected", "build", "application.g", "cachebuster");
	const excludedTasks = ["generateVersionInfo"];
	const includedTasks = ["generateCachebusterInfo"];

	return builder.build({
		tree: applicationGTree,
		destPath,
		excludedTasks,
		includedTasks
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
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
});

const applicationGTree = {
	"id": "application.g",
	"version": "1.0.0",
	"path": applicationGPath,
	"dependencies": [],
	"builder": {},
	"_level": 0,
	"specVersion": "0.1",
	"type": "application",
	"metadata": {
		"name": "application.g",
		"namespace": "application.g",
		"copyright": "Some fancy copyright"
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
