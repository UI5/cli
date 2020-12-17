const test = require("ava");
const path = require("path");
const sinon = require("sinon");
const fs = require("graceful-fs");
const mock = require("mock-require");

test.afterEach.always((t) => {
	sinon.restore();
});

const ApplicationFormatter = require("../../../../lib/types/application/ApplicationFormatter");

const applicationBPath = path.join(__dirname, "..", "..", "..", "fixtures", "application.b");
const applicationBTree = {
	id: "application.b",
	version: "1.0.0",
	path: applicationBPath,
	dependencies: [],
	_level: 0,
	_isRoot: true,
	specVersion: "2.0",
	type: "application",
	metadata: {
		name: "application.b"
	},
	resources: {
		configuration: {
			paths: {
				webapp: "webapp"
			}
		},
		pathMappings: {
			"/": "webapp"
		}
	}
};

function clone(o) {
	return JSON.parse(JSON.stringify(o));
}

test("validate: not existing directory webapp for c3", async (t) => {
	const myProject = clone(applicationBTree);
	myProject.path = path.join(__dirname, "..", "..", "..", "fixtures", "application.notExisting");
	const applicationFormatter = new ApplicationFormatter({project: myProject});
	const error = await t.throwsAsync(applicationFormatter.validate());
	t.regex(error.message, /^Could not find application directory of project application\.b: (?!(undefined))+/,
		"Correct exception thrown");
});

test("validate: project not defined", async (t) => {
	const applicationFormatter = new ApplicationFormatter({project: null});

	// error is thrown because project is not defined (null)
	const error = await t.throwsAsync(applicationFormatter.validate());
	t.deepEqual(error.message, "Project is undefined", "Correct exception thrown");
});

test("validate: empty version", async (t) => {
	const myProject = clone(applicationBTree);
	myProject.version = undefined;
	const applicationFormatter = new ApplicationFormatter({project: myProject});

	// error is thrown because project's version is not defined
	const error = await t.throwsAsync(applicationFormatter.validate());
	t.deepEqual(error.message, `"version" is missing for project application.b`, "Correct exception thrown");
});

test("validate: empty type", async (t) => {
	const myProject = clone(applicationBTree);
	myProject.type = undefined;
	const applicationFormatter = new ApplicationFormatter({project: myProject});

	// error is thrown because project's type is not defined
	const error = await t.throwsAsync(applicationFormatter.validate());
	t.deepEqual(error.message, `"type" configuration is missing for project application.b`, "Correct exception thrown");
});

test("validate: empty metadata", async (t) => {
	const myProject = clone(applicationBTree);
	myProject.metadata = undefined;
	const applicationFormatter = new ApplicationFormatter({project: myProject});

	// error is thrown because project's metadata is not defined
	const error = await t.throwsAsync(applicationFormatter.validate());
	t.deepEqual(error.message, `"metadata.name" configuration is missing for project application.b`,
		"Correct exception thrown");
});

test("validate: empty resources", async (t) => {
	const myProject = clone(applicationBTree);
	myProject.resources = undefined;
	const applicationFormatter = new ApplicationFormatter({project: myProject});

	// error is thrown because project's resources are not defined
	await applicationFormatter.validate();
	t.deepEqual(myProject.resources.configuration.paths.webapp, "webapp", "default webapp directory is set");
});

test("validate: empty encoding", async (t) => {
	const myProject = clone(applicationBTree);
	delete myProject.resources.configuration.propertiesFileSourceEncoding;
	const applicationFormatter = new ApplicationFormatter({project: myProject});

	await applicationFormatter.validate(myProject);
	t.deepEqual(myProject.resources.configuration.propertiesFileSourceEncoding, "UTF-8",
		"default resources encoding is set");
});

test("validate: empty encoding - legacy specVersion 0.1", async (t) => {
	const myProject = clone(applicationBTree);
	myProject.specVersion = "0.1";
	delete myProject.resources.configuration.propertiesFileSourceEncoding;
	const applicationFormatter = new ApplicationFormatter({project: myProject});

	await applicationFormatter.validate(myProject);
	t.deepEqual(myProject.resources.configuration.propertiesFileSourceEncoding, "ISO-8859-1",
		"default resources encoding is set");
});

test("validate: empty encoding - legacy specVersion 1.0", async (t) => {
	const myProject = clone(applicationBTree);
	myProject.specVersion = "1.0";
	delete myProject.resources.configuration.propertiesFileSourceEncoding;
	const applicationFormatter = new ApplicationFormatter({project: myProject});

	await applicationFormatter.validate(myProject);
	t.deepEqual(myProject.resources.configuration.propertiesFileSourceEncoding, "ISO-8859-1",
		"default resources encoding is set");
});

test("validate: empty encoding - legacy specVersion 1.1", async (t) => {
	const myProject = clone(applicationBTree);
	myProject.specVersion = "1.1";
	delete myProject.resources.configuration.propertiesFileSourceEncoding;
	const applicationFormatter = new ApplicationFormatter({project: myProject});

	await applicationFormatter.validate(myProject);
	t.deepEqual(myProject.resources.configuration.propertiesFileSourceEncoding, "ISO-8859-1",
		"default resources encoding is set");
});

test("validate: test invalid encoding", async (t) => {
	const myProject = clone(applicationBTree);
	myProject.resources.configuration.propertiesFileSourceEncoding = "test";
	const applicationFormatter = new ApplicationFormatter({project: myProject});

	const error = await t.throwsAsync(applicationFormatter.validate(myProject));
	t.is(error.message, `Invalid properties file encoding specified for project application.b. Encoding provided: ` +
		`test. Must be either "ISO-8859-1" or "UTF-8".`, "Missing source directory caused error");
});

test("format and validate non-ASCII project correctly", async (t) => {
	const applicationØPath = path.join(__dirname, "..", "..", "..", "fixtures", "application.ø");
	const myProject = {
		id: "application.ø.id",
		version: "1.0.0",
		path: applicationØPath,
		dependencies: [],
		_level: 0,
		_isRoot: true,
		specVersion: "2.0",
		type: "application",
		metadata: {
			name: "application.ø"
		},
		resources: {
			configuration: {
				paths: {
					webapp: "wêbäpp"
				}
			},
			pathMappings: {
				"/": "wêbäpp"
			}
		}
	};
	const applicationFormatter = new ApplicationFormatter({project: myProject});

	await applicationFormatter.format();
	t.deepEqual(myProject, {
		id: "application.ø.id",
		version: "1.0.0",
		path: applicationØPath,
		dependencies: [],
		_level: 0,
		_isRoot: true,
		specVersion: "2.0",
		type: "application",
		metadata: {
			name: "application.ø",
			namespace: "application/ø"
		},
		resources: {
			configuration: {
				paths: {
					webapp: "wêbäpp"
				},
				propertiesFileSourceEncoding: "UTF-8",
			},
			pathMappings: {
				"/": "wêbäpp"
			}
		}
	}, "Project got formatted correctly");
});

function createMockProject() {
	return {
		resources: {
			configuration: {
				paths: {
					webapp: "webapp"
				}
			}
		},
		metadata: {
			name: "projectName"
		}
	};
}

test("getSourceBasePath: posix", async (t) => {
	const myProject = clone(applicationBTree);
	myProject.path = "my/pony";
	const applicationFormatter = new ApplicationFormatter({project: myProject});

	const sourceBasePath = applicationFormatter.getSourceBasePath(true);
	t.is(sourceBasePath, "my/pony/webapp", "correct path");
});

test("format", async (t) => {
	const project = createMockProject();
	const applicationFormatter = new ApplicationFormatter({project});
	const validateStub = sinon.stub(applicationFormatter, "validate").resolves();
	const getNamespaceStub = sinon.stub(applicationFormatter, "getNamespace").resolves("my/namespace");

	await applicationFormatter.format();
	t.deepEqual(project.resources.pathMappings["/"], "webapp", "path mappings is set");
	t.deepEqual(project.metadata.namespace, "my/namespace", "correct namespace set");
	t.deepEqual(validateStub.callCount, 1, "validate called once");
	t.deepEqual(getNamespaceStub.callCount, 1, "getNamespace called once");
});

test("getNamespaceFromManifestJson: No 'sap.app' configuration found", async (t) => {
	const project = createMockProject();
	const applicationFormatter = new ApplicationFormatter({project});
	sinon.stub(applicationFormatter, "getJson").resolves({content: {}, fsPath: {}});

	const error = await t.throwsAsync(applicationFormatter.getNamespaceFromManifestJson());
	t.deepEqual(error.message, "No sap.app/id configuration found in manifest.json of project projectName",
		"Rejected with correct error message");
});

test("getNamespaceFromManifestJson: No application id in 'sap.app' configuration found", async (t) => {
	const project = createMockProject();
	const applicationFormatter = new ApplicationFormatter({project});
	sinon.stub(applicationFormatter, "getJson").resolves({content: {"sap.app": {}}});

	const error = await t.throwsAsync(applicationFormatter.getNamespaceFromManifestJson());
	t.deepEqual(error.message, "No sap.app/id configuration found in manifest.json of project projectName");
});

test("getNamespaceFromManifestJson: set namespace to id", async (t) => {
	const project = createMockProject();
	const applicationFormatter = new ApplicationFormatter({project});
	sinon.stub(applicationFormatter, "getJson").resolves({content: {"sap.app": {id: "my.id"}}});

	const namespace = await applicationFormatter.getNamespaceFromManifestJson();
	t.deepEqual(namespace, "my/id", "Returned correct namespace");
});

test("getNamespaceFromManifestAppDescVariant: No 'id' property found", async (t) => {
	const project = createMockProject();
	const applicationFormatter = new ApplicationFormatter({project});
	sinon.stub(applicationFormatter, "getJson").resolves({content: {}, fsPath: {}});

	const error = await t.throwsAsync(applicationFormatter.getNamespaceFromManifestAppDescVariant());
	t.deepEqual(error.message, `No "id" property found in manifest.appdescr_variant of project projectName`,
		"Rejected with correct error message");
});

test("getNamespaceFromManifestAppDescVariant: set namespace to id", async (t) => {
	const project = createMockProject();
	const applicationFormatter = new ApplicationFormatter({project});
	sinon.stub(applicationFormatter, "getJson").resolves({content: {id: "my.id"}});

	const namespace = await applicationFormatter.getNamespaceFromManifestAppDescVariant();
	t.deepEqual(namespace, "my/id", "Returned correct namespace");
});

test("getNamespace: Correct fallback to manifest.appdescr_variant if manifest.json is missing", async (t) => {
	const project = createMockProject();
	const applicationFormatter = new ApplicationFormatter({project});
	const getJsonStub = sinon.stub(applicationFormatter, "getJson")
		.onFirstCall().rejects({code: "ENOENT"})
		.onSecondCall().resolves({content: {id: "my.id"}});

	const namespace = await applicationFormatter.getNamespace();
	t.deepEqual(namespace, "my/id", "Returned correct namespace");
	t.is(getJsonStub.callCount, 2, "getJson called exactly twice");
	t.is(getJsonStub.getCall(0).args[0], "manifest.json", "getJson called for manifest.json first");
	t.is(getJsonStub.getCall(1).args[0], "manifest.appdescr_variant",
		"getJson called for manifest.appdescr_variant in fallback");
});

test("getNamespace: Correct error message if fallback to manifest.appdescr_variant failed", async (t) => {
	const project = createMockProject();
	const applicationFormatter = new ApplicationFormatter({project});
	const getJsonStub = sinon.stub(applicationFormatter, "getJson")
		.onFirstCall().rejects({code: "ENOENT"})
		.onSecondCall().rejects(new Error("EPON: Pony Error"));

	const error = await t.throwsAsync(applicationFormatter.getNamespace());
	t.deepEqual(error.message, "EPON: Pony Error",
		"Rejected with correct error message");
	t.is(getJsonStub.callCount, 2, "getJson called exactly twice");
	t.is(getJsonStub.getCall(0).args[0], "manifest.json", "getJson called for manifest.json first");
	t.is(getJsonStub.getCall(1).args[0], "manifest.appdescr_variant",
		"getJson called for manifest.appdescr_variant in fallback");
});

test("getNamespace: Correct error message if fallback to manifest.appdescr_variant is not possible", async (t) => {
	const project = createMockProject();
	const applicationFormatter = new ApplicationFormatter({project});
	const getJsonStub = sinon.stub(applicationFormatter, "getJson")
		.onFirstCall().rejects({message: "No such stable or directory: manifest.json", code: "ENOENT"})
		.onSecondCall().rejects({code: "ENOENT"}); // both files are missing

	const error = await t.throwsAsync(applicationFormatter.getNamespace());
	t.deepEqual(error.message,
		"Could not find required manifest.json for project projectName: " +
		"No such stable or directory: manifest.json",
		"Rejected with correct error message");

	t.is(getJsonStub.callCount, 2, "getJson called exactly twice");
	t.is(getJsonStub.getCall(0).args[0], "manifest.json", "getJson called for manifest.json first");
	t.is(getJsonStub.getCall(1).args[0], "manifest.appdescr_variant",
		"getJson called for manifest.appdescr_variant in fallback");
});

test("getNamespace: No fallback if manifest.json is present but failed to parse", async (t) => {
	const project = createMockProject();
	const applicationFormatter = new ApplicationFormatter({project});
	const getJsonStub = sinon.stub(applicationFormatter, "getJson")
		.onFirstCall().rejects(new Error("EPON: Pony Error"));

	const error = await t.throwsAsync(applicationFormatter.getNamespace());
	t.deepEqual(error.message, "EPON: Pony Error",
		"Rejected with correct error message");

	t.is(getJsonStub.callCount, 1, "getJson called exactly once");
	t.is(getJsonStub.getCall(0).args[0], "manifest.json", "getJson called for manifest.json only");
});

test("getJson: reads correctly", async (t) => {
	const myProject = clone(applicationBTree);

	const libraryFormatter = new ApplicationFormatter({project: myProject});

	const {content, fsPath} = await libraryFormatter.getJson("manifest.json");
	t.deepEqual(content._version, "1.1.0", "manifest.json content has been read");
	const expectedPath = path.join(applicationBPath, "webapp", "manifest.json");
	t.deepEqual(fsPath, expectedPath, "Correct manifest.json path returned");
});

test.serial("getJson: invalid JSON", async (t) => {
	const myProject = clone(applicationBTree);

	const readFileStub = sinon.stub(fs, "readFile").callsArgWithAsync(1, undefined, "pony");

	const ApplicationFormatter = mock.reRequire("../../../../lib/types/application/ApplicationFormatter");
	const libraryFormatter = new ApplicationFormatter({project: myProject});

	const error = await t.throwsAsync(libraryFormatter.getJson("manifest.json"));
	t.deepEqual(error.message,
		"Failed to read manifest.json for project application.b: " +
		"Unexpected token p in JSON at position 0",
		"Rejected with correct error message");
	t.deepEqual(readFileStub.callCount, 1, "fs.read got called once");
	const expectedPath = path.join(applicationBPath, "webapp", "manifest.json");
	t.deepEqual(readFileStub.getCall(0).args[0], expectedPath, "fs.read got called with the correct argument");
});

test.serial("getJson: fs read error", async (t) => {
	const myProject = clone(applicationBTree);

	const readFileStub = sinon.stub(fs, "readFile").callsArgWithAsync(1, new Error("EPON: Pony Error"));

	const ApplicationFormatter = mock.reRequire("../../../../lib/types/application/ApplicationFormatter");
	const libraryFormatter = new ApplicationFormatter({project: myProject});

	const error = await t.throwsAsync(libraryFormatter.getJson("manifest.json"));
	t.deepEqual(error.message,
		"Failed to read manifest.json for project application.b: " +
		"EPON: Pony Error",
		"Rejected with correct error message");
	t.deepEqual(readFileStub.callCount, 1, "fs.read got called once");
	const expectedPath = path.join(applicationBPath, "webapp", "manifest.json");
	t.deepEqual(readFileStub.getCall(0).args[0], expectedPath, "fs.read got called with the correct argument");
});

test.serial("getJson: result is cached", async (t) => {
	const myProject = clone(applicationBTree);

	const readFileStub = sinon.stub(fs, "readFile").callsArgWithAsync(1, undefined,
		`{"pony": "no unicorn"}`);

	const ApplicationFormatter = mock.reRequire("../../../../lib/types/application/ApplicationFormatter");
	const libraryFormatter = new ApplicationFormatter({project: myProject});
	const expectedPath = path.join(applicationBPath, "webapp", "manifest.json");
	const expectedPath2 = path.join(applicationBPath, "webapp", "otherfile.json");

	const {content, fsPath} = await libraryFormatter.getJson("manifest.json");
	t.deepEqual(content, {pony: "no unicorn"}, "Correct result on first call");
	t.deepEqual(fsPath, expectedPath, "Correct manifest.json path returned on first call");

	const {content: content2, fsPath: fsPath2} = await libraryFormatter.getJson("otherfile.json");
	t.deepEqual(content2, {pony: "no unicorn"}, "Correct result on second call");
	t.deepEqual(fsPath2, expectedPath2, "Correct otherfile.json path returned on second call");

	t.deepEqual(readFileStub.callCount, 2, "fs.read got called exactly twice (and then cached)");
});

test.serial("getJson: Alternative file names", async (t) => {
	const myProject = clone(applicationBTree);

	const readFileStub = sinon.stub(fs, "readFile").callsArgWithAsync(1, undefined,
		`{"pony": "no unicorn"}`);

	const ApplicationFormatter = mock.reRequire("../../../../lib/types/application/ApplicationFormatter");
	const libraryFormatter = new ApplicationFormatter({project: myProject});
	const expectedPath = path.join(applicationBPath, "webapp", "manifest.appdescr_variant");
	const expectedPath2 = path.join(applicationBPath, "webapp", "pony.json");

	const {content, fsPath} = await libraryFormatter.getJson("manifest.appdescr_variant");
	t.deepEqual(content, {pony: "no unicorn"}, "Correct result on first call");
	t.deepEqual(fsPath, expectedPath, "Correct manifest.appdescr_variant path returned on first call");

	const {content: content2, fsPath: fsPath2} = await libraryFormatter.getJson("pony.json");
	t.deepEqual(content2, {pony: "no unicorn"}, "Correct result on second call");
	t.deepEqual(fsPath2, expectedPath2, "Correct pony.json path returned on second call");

	t.deepEqual(readFileStub.callCount, 2, "fs.read got called exactly twice");
});

test.serial("getJson: Caches successes and failures", async (t) => {
	const myProject = clone(applicationBTree);

	const readFileStub = sinon.stub(fs, "readFile")
		.onFirstCall().callsArgWithAsync(1, new Error("EPON: Pony Error"))
		.onSecondCall().callsArgWithAsync(1, undefined, `{"pony": "no unicorn"}`);

	const ApplicationFormatter = mock.reRequire("../../../../lib/types/application/ApplicationFormatter");
	const libraryFormatter = new ApplicationFormatter({project: myProject});
	const expectedPath = path.join(applicationBPath, "webapp", "manifest.json");
	const expectedPath2 = path.join(applicationBPath, "webapp", "manifest.appdescr_variant");

	const error = await t.throwsAsync(libraryFormatter.getJson("manifest.json"));
	t.deepEqual(error.message,
		"Failed to read manifest.json for project application.b: " +
		"EPON: Pony Error",
		"Rejected with correct error message");

	const {content, fsPath} = await libraryFormatter.getJson("manifest.appdescr_variant");
	t.deepEqual(content, {pony: "no unicorn"}, "Correct result on second call");
	t.deepEqual(fsPath, expectedPath2, "Correct manifest.appdescr_variant path returned on second call");

	const error2 = await t.throwsAsync(libraryFormatter.getJson("manifest.json"));
	t.deepEqual(error2.message,
		"Failed to read manifest.json for project application.b: " +
		"EPON: Pony Error",
		"From cache: Rejected with correct error message");

	const {content: content2, fsPath: fsPath2} = await libraryFormatter.getJson("manifest.appdescr_variant");
	t.deepEqual(content2, {pony: "no unicorn"}, "From cache: Correct result on first call");
	t.deepEqual(fsPath2, expectedPath2, "From cache: Correct manifest.appdescr_variant path returned on first call");

	t.deepEqual(readFileStub.callCount, 2,
		"fs.read got called exactly twice (and then cached)");
	t.deepEqual(readFileStub.getCall(0).args[0], expectedPath,
		"manifest.json: fs.read got called with the correct argument");
	t.deepEqual(readFileStub.getCall(1).args[0], expectedPath2,
		"manifest.appdescr_variant: fs.read got called with the correct argument");
});

const applicationHPath = path.join(__dirname, "..", "..", "..", "fixtures", "application.h");
const applicationHTree = {
	id: "application.h",
	version: "1.0.0",
	path: applicationHPath,
	dependencies: [],
	_level: 0,
	_isRoot: true,
	specVersion: "2.0",
	type: "application",
	metadata: {
		name: "application.h"
	},
	resources: {
		configuration: {
			paths: {
				webapp: "webapp"
			}
		}
	}
};

test("namespace: detect namespace from pom.xml via ${project.artifactId}", async (t) => {
	const myProject = clone(applicationHTree);
	myProject.resources.configuration.paths.webapp = "webapp-project.artifactId";
	const applicationFormatter = new ApplicationFormatter({project: myProject});

	await applicationFormatter.format();
	t.deepEqual(myProject.metadata.namespace, "application/h",
		"namespace was successfully set since getJson provides the correct object structure");
});

test("namespace: detect namespace from pom.xml via ${componentName} from properties", async (t) => {
	const myProject = clone(applicationHTree);
	myProject.resources.configuration.paths.webapp = "webapp-properties.componentName";
	const applicationFormatter = new ApplicationFormatter({project: myProject});

	await applicationFormatter.format();
	t.deepEqual(myProject.metadata.namespace, "application/h",
		"namespace was successfully set since getJson provides the correct object structure");
});

test("namespace: detect namespace from pom.xml via ${appId} from properties", async (t) => {
	const myProject = clone(applicationHTree);
	myProject.resources.configuration.paths.webapp = "webapp-properties.appId";
	const applicationFormatter = new ApplicationFormatter({project: myProject});

	const error = await t.throwsAsync(applicationFormatter.format());
	t.deepEqual(error.message, "Failed to resolve namespace of project application.h: \"${appId}\"" +
		" couldn't be resolved from maven property \"appId\" of pom.xml of project application.h");
});
