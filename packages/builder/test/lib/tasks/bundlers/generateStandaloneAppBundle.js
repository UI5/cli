const test = require("ava");
const path = require("path");
const chai = require("chai");
chai.use(require("chai-fs"));
const assert = chai.assert;
const sinon = require("sinon");
const mock = require("mock-require");

let generateStandaloneAppBundle = require("../../../../lib/tasks/bundlers/generateStandaloneAppBundle");

test.beforeEach((t) => {
	// Stubbing processors/bundlers/moduleBundler
	t.context.moduleBundlerStub = sinon.stub();
	t.context.moduleBundlerStub.resolves(["I am a resource"]);
	mock("../../../../lib/processors/bundlers/moduleBundler", t.context.moduleBundlerStub);

	// Re-require tested module
	generateStandaloneAppBundle = mock.reRequire("../../../../lib/tasks/bundlers/generateStandaloneAppBundle");
});

test.afterEach.always((t) => {
	mock.stopAll();
	sinon.restore();
});

test.serial("execute module bundler and write results", async (t) => {
	const dummyResource = {
		getPath: function() {
			return "ponyPath";
		}
	};
	const dummyReaderWriter = {
		byGlob: async function() {
			return [dummyResource, dummyResource];
		},
		write: function() {}
	};
	sinon.stub(dummyReaderWriter, "write").resolves();
	const params = {
		workspace: dummyReaderWriter,
		dependencies: dummyReaderWriter,
		options: {
			projectName: "some.project.name",
			namespace: "some/project/namespace"
		}
	};
	await generateStandaloneAppBundle(params);

	t.deepEqual(t.context.moduleBundlerStub.callCount, 2, "moduleBundler should be called once");

	const {resources, options} = t.context.moduleBundlerStub.getCall(0).args[0];
	t.deepEqual(resources.length, 4, "moduleBundler got supplied with 4 resources");
	t.deepEqual(options.bundleDefinition.sections[0].filters, [
		"jquery.sap.global.js"
	], "Correct filter in first bundle definition section");
	t.deepEqual(options.bundleDefinition.sections[1].filters, [
		"some/project/namespace/",
		"!some/project/namespace/test/",
		"!some/project/namespace/*.html",
		"sap/ui/core/Core.js"
	], "Correct filter in second bundle definition section");
});

test.serial("execute module bundler and write results without namespace", async (t) => {
	const dummyResource = {
		getPath: function() {
			return "ponyPath";
		}
	};
	const dummyReaderWriter = {
		byGlob: async function() {
			return [dummyResource, dummyResource];
		},
		write: function() {}
	};
	sinon.stub(dummyReaderWriter, "write").resolves();
	const params = {
		workspace: dummyReaderWriter,
		dependencies: dummyReaderWriter,
		options: {
			projectName: "some.project.name"
		}
	};
	await generateStandaloneAppBundle(params);

	t.deepEqual(t.context.moduleBundlerStub.callCount, 2, "moduleBundler should be called once");

	const {resources, options} = t.context.moduleBundlerStub.getCall(0).args[0];
	t.deepEqual(resources.length, 4, "moduleBundler got supplied with 4 resources");
	t.deepEqual(options.bundleDefinition.sections[0].filters, [
		"jquery.sap.global.js"
	], "Correct filter in first bundle definition section");
	t.deepEqual(options.bundleDefinition.sections[1].filters, [
		"/",
		"!/test/",
		"!/*.html",
		"sap/ui/core/Core.js"
	], "Correct filter in second bundle definition section");
});


test.serial("execute module bundler and write results in evo mode", async (t) => {
	const dummyResource = {
		getPath: function() {
			return "/resources/ui5loader.js"; // Triggers evo mode
		}
	};
	const dummyReaderWriter = {
		byGlob: async function() {
			return [dummyResource, dummyResource];
		},
		write: function() {}
	};
	sinon.stub(dummyReaderWriter, "write").resolves();
	const params = {
		workspace: dummyReaderWriter,
		dependencies: dummyReaderWriter,
		options: {
			projectName: "some.project.name",
			namespace: "some/project/namespace"
		}
	};
	await generateStandaloneAppBundle(params);

	t.deepEqual(t.context.moduleBundlerStub.callCount, 2, "moduleBundler should be called once");

	const {resources, options} = t.context.moduleBundlerStub.getCall(0).args[0];
	t.deepEqual(resources.length, 4, "moduleBundler got supplied with 4 resources");
	t.deepEqual(options.bundleDefinition.sections[0].filters, [
		"ui5loader-autoconfig.js"
	], "Evo mode active - Correct filter in first bundle definition section");
	t.deepEqual(options.bundleDefinition.sections[1].filters, [
		"some/project/namespace/",
		"!some/project/namespace/test/",
		"!some/project/namespace/*.html",
		"sap/ui/core/Core.js"
	], "Correct filter in second bundle definition section");
});

/* =================*/
/* Integration tests */

const recursive = require("recursive-readdir");
const ui5Builder = require("../../../../");
const builder = ui5Builder.builder;
const applicationBPath = path.join(__dirname, "..", "..", "..", "fixtures", "application.b");
const sapUiCorePath = path.join(__dirname, "..", "..", "..", "fixtures", "sap.ui.core");

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

test("integration: build application.b standalone", async (t) => {
	// beforeEach mocks do not apply to this test as all modules have already been required via ui5Builder require above
	const destPath = "./test/tmp/build/application.b/standalone";
	const expectedPath = "./test/expected/build/application.b/standalone";
	const excludedTasks = ["*"];
	const includedTasks = ["generateStandaloneAppBundle"];

	return t.notThrowsAsync(builder.build({
		tree: applicationBTree,
		destPath,
		excludedTasks,
		includedTasks
	}).then(() => {
		return findFiles(expectedPath);
	}).then((expectedFiles) => {
		// Check for all directories and files
		assert.directoryDeepEqual(destPath, expectedPath, "Result directory structure correct");

		// Check for all file contents
		t.deepEqual(expectedFiles.length, 11, "11 files are expected");
		expectedFiles.forEach((expectedFile) => {
			const relativeFile = path.relative(expectedPath, expectedFile);
			const destFile = path.join(destPath, relativeFile);
			assert.fileEqual(destFile, expectedFile, "Correct file content");
		});
	}));
});

const applicationBTree = {
	"id": "application.b",
	"version": "1.0.0",
	"path": applicationBPath,
	"dependencies": [
		{
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
		},
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
