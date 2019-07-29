const test = require("ava");
const path = require("path");
const sinon = require("sinon");
const mock = require("mock-require");

const chai = require("chai");
chai.use(require("chai-fs"));
const assert = chai.assert;
const {promisify} = require("util");
const extractZip = promisify(require("extract-zip"));
const recursive = require("recursive-readdir");

const ui5Builder = require("../../../../");
const builder = ui5Builder.builder;
const generateManifestBundle = require("../../../../lib/tasks/bundlers/generateManifestBundle");

test.serial("generateManifestBundle", async (t) => {
	const byGlobStub = sinon.stub().resolves(["some resource", "some other resource"]);
	const writeStub = sinon.stub().resolves();
	const workspace = {
		byGlob: byGlobStub,
		write: writeStub
	};

	const manifestBundlerStub = sinon.stub().resolves(["some new resource", "some other new resource"]);
	mock("../../../../lib/processors/bundlers/manifestBundler", manifestBundlerStub);
	const generateManifestBundle = mock.reRequire("../../../../lib/tasks/bundlers/generateManifestBundle");


	await generateManifestBundle({
		workspace,
		options: {
			projectName: "some project",
			namespace: "some/project"
		}
	});
	t.deepEqual(byGlobStub.callCount, 1, "workspace.byGlob got called once");
	t.deepEqual(byGlobStub.getCall(0).args[0], "/resources/some/project/**/{manifest.json,*.properties}",
		"workspace.byGlob got called with the correct arguments");

	t.deepEqual(manifestBundlerStub.callCount, 1, "manifestBundler got called once");
	t.deepEqual(manifestBundlerStub.getCall(0).args[0], {
		resources: ["some resource", "some other resource"],
		options: {
			descriptor: "manifest.json",
			propertiesExtension: ".properties",
			bundleName: "manifest-bundle.zip",
			namespace: "some/project"
		}
	}, "manifestBundler got called with the correct arguments");

	t.deepEqual(writeStub.callCount, 2, "workspace.write got called twice");
	t.deepEqual(writeStub.getCall(0).args[0], "some new resource",
		"workspace.write got called with the correct arguments");
	t.deepEqual(writeStub.getCall(1).args[0], "some other new resource",
		"workspace.write got called with the correct arguments");

	mock.stop("../../../../lib/processors/bundlers/manifestBundler");
});

test.serial("generateManifestBundle with no resources", async (t) => {
	const byGlobStub = sinon.stub().resolves([]);
	const workspace = {
		byGlob: byGlobStub
	};

	const manifestBundlerStub = sinon.stub().resolves([]);
	mock("../../../../lib/processors/bundlers/manifestBundler", manifestBundlerStub);
	const generateManifestBundle = mock.reRequire("../../../../lib/tasks/bundlers/generateManifestBundle");


	await generateManifestBundle({
		workspace,
		options: {
			projectName: "some project",
			namespace: "some/project"
		}
	});
	t.deepEqual(byGlobStub.callCount, 1, "workspace.byGlob got called once");
	t.deepEqual(byGlobStub.getCall(0).args[0], "/resources/some/project/**/{manifest.json,*.properties}",
		"workspace.byGlob got called with the correct arguments");

	t.deepEqual(manifestBundlerStub.callCount, 0, "manifestBundler not called");

	mock.stop("../../../../lib/processors/bundlers/manifestBundler");
});

test("generateManifestBundle with missing parameters", async (t) => {
	const error = await t.throwsAsync(generateManifestBundle({}));
	t.deepEqual(error.message, "[generateManifestBundle]: One or more mandatory options not provided",
		"Rejected with correct error message");
});


/* ===================
	Integration Tests
*/

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

test("integration: Build application.b with manifestBundler", (t) => {
	const destPath = path.join("test", "tmp", "build", "application.b", "dest");
	const destBundle = path.resolve(path.join(destPath, "manifest-bundle"));
	const expectedPath = path.join("test", "expected", "build", "application.b", "dest", "manifest-bundle");
	const excludedTasks = ["*"];
	const includedTasks = ["escapeNonAsciiCharacters", "generateManifestBundle"];

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
	"dependencies": [],
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
			},
			"propertiesFileSourceEncoding": "ISO-8859-1"
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
				"namespace": "sap/ui/core"
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
		"namespace": "library/k"
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
