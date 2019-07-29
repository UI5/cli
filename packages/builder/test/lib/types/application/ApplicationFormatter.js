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
	specVersion: "0.1",
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
	t.deepEqual(myProject.resources.configuration.propertiesFileSourceEncoding, "ISO-8859-1", "default resources encoding is set");
});

test("validate: test invalid encoding", async (t) => {
	const myProject = clone(applicationBTree);
	myProject.resources.configuration.propertiesFileSourceEncoding = "test";
	const applicationFormatter = new ApplicationFormatter({project: myProject});

	const error = await t.throwsAsync(applicationFormatter.validate(myProject));
	t.is(error.message, `Invalid properties file encoding specified for project application.b: encoding provided: test. Must be either "ISO-8859-1" or "UTF-8".`,
		"Missing source directory caused error");
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

test("format: No 'sap.app' configuration found", async (t) => {
	const project = createMockProject();
	const applicationFormatter = new ApplicationFormatter({project});
	sinon.stub(applicationFormatter, "validate").resolves();
	sinon.stub(applicationFormatter, "getManifest").resolves({content: {}, fsPath: {}});

	await applicationFormatter.format();
	t.deepEqual(project.resources.pathMappings["/"], "webapp", "path mappings is set");
	t.falsy(project.metadata.namespace,
		"namespace is falsy since getManifest resolves with an empty object");
});

test("format: No application id in 'sap.app' configuration found", async (t) => {
	const project = createMockProject();
	const applicationFormatter = new ApplicationFormatter({project});
	sinon.stub(applicationFormatter, "validate").resolves();
	sinon.stub(applicationFormatter, "getManifest").resolves({content: {"sap.app": {}}});

	await applicationFormatter.format();
	t.deepEqual(project.resources.pathMappings["/"], "webapp", "path mappings is set");
	t.falsy(project.metadata.namespace,
		"namespace is falsy since getManifest resolves with an empty object");
});

test("format: set namespace to id", async (t) => {
	const project = createMockProject();
	const applicationFormatter = new ApplicationFormatter({project});
	sinon.stub(applicationFormatter, "validate").resolves();
	sinon.stub(applicationFormatter, "getManifest").resolves({content: {"sap.app": {id: "my.id"}}});

	await applicationFormatter.format();
	t.deepEqual(project.metadata.namespace, "my/id",
		"namespace was successfully set since getManifest provides the correct object structure");
});

test("getManifest: reads correctly", async (t) => {
	const myProject = clone(applicationBTree);

	const libraryFormatter = new ApplicationFormatter({project: myProject});

	const {content, fsPath} = await libraryFormatter.getManifest();
	t.deepEqual(content._version, "1.1.0", "manifest.json content has been read");
	const expectedPath = path.join(applicationBPath, "webapp", "manifest.json");
	t.deepEqual(fsPath, expectedPath, "Correct manifest.json path returned");
});

test.serial("getManifest: invalid JSON", async (t) => {
	const myProject = clone(applicationBTree);

	const readFileStub = sinon.stub(fs, "readFile").callsArgWithAsync(1, undefined, "pony");

	const ApplicationFormatter = mock.reRequire("../../../../lib/types/application/ApplicationFormatter");
	const libraryFormatter = new ApplicationFormatter({project: myProject});

	const error = await t.throwsAsync(libraryFormatter.getManifest());
	t.deepEqual(error.message,
		"Failed to read manifest.json for project application.b: " +
		"Unexpected token p in JSON at position 0",
		"Rejected with correct error message");
	t.deepEqual(readFileStub.callCount, 1, "fs.read got called once");
	const expectedPath = path.join(applicationBPath, "webapp", "manifest.json");
	t.deepEqual(readFileStub.getCall(0).args[0], expectedPath, "fs.read got called with the correct argument");
});

test.serial("getManifest: fs read error", async (t) => {
	const myProject = clone(applicationBTree);

	const readFileStub = sinon.stub(fs, "readFile").callsArgWithAsync(1, new Error("EPON: Pony Error"));

	const ApplicationFormatter = mock.reRequire("../../../../lib/types/application/ApplicationFormatter");
	const libraryFormatter = new ApplicationFormatter({project: myProject});

	const error = await t.throwsAsync(libraryFormatter.getManifest());
	t.deepEqual(error.message,
		"Failed to read manifest.json for project application.b: " +
		"EPON: Pony Error",
		"Rejected with correct error message");
	t.deepEqual(readFileStub.callCount, 1, "fs.read got called once");
	const expectedPath = path.join(applicationBPath, "webapp", "manifest.json");
	t.deepEqual(readFileStub.getCall(0).args[0], expectedPath, "fs.read got called with the correct argument");
});

test.serial("getManifest: result is cached", async (t) => {
	const myProject = clone(applicationBTree);

	const readFileStub = sinon.stub(fs, "readFile").callsArgWithAsync(1, undefined,
		`{"pony": "no unicorn"}`);

	const ApplicationFormatter = mock.reRequire("../../../../lib/types/application/ApplicationFormatter");
	const libraryFormatter = new ApplicationFormatter({project: myProject});

	const expectedPath = path.join(applicationBPath, "webapp", "manifest.json");
	const {content, fsPath} = await libraryFormatter.getManifest();
	t.deepEqual(content, {pony: "no unicorn"}, "Correct result on first call");
	t.deepEqual(fsPath, expectedPath, "Correct manifest.json path returned on first call");
	const {content: content2, fsPath: fsPath2} = await libraryFormatter.getManifest();
	t.deepEqual(content2, {pony: "no unicorn"}, "Correct result on second call");
	t.deepEqual(fsPath2, expectedPath, "Correct manifest.json path returned on second call");

	t.deepEqual(readFileStub.callCount, 1, "fs.read got called exactly once (and then cached)");
});

const applicationHPath = path.join(__dirname, "..", "..", "..", "fixtures", "application.h");
const applicationHTree = {
	id: "application.h",
	version: "1.0.0",
	path: applicationHPath,
	dependencies: [],
	_level: 0,
	specVersion: "0.1",
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
		"namespace was successfully set since getManifest provides the correct object structure");
});

test("namespace: detect namespace from pom.xml via ${componentName} from properties", async (t) => {
	const myProject = clone(applicationHTree);
	myProject.resources.configuration.paths.webapp = "webapp-properties.componentName";
	const applicationFormatter = new ApplicationFormatter({project: myProject});

	await applicationFormatter.format();
	t.deepEqual(myProject.metadata.namespace, "application/h",
		"namespace was successfully set since getManifest provides the correct object structure");
});

test("namespace: detect namespace from pom.xml via ${appId} from properties", async (t) => {
	const myProject = clone(applicationHTree);
	myProject.resources.configuration.paths.webapp = "webapp-properties.appId";
	const applicationFormatter = new ApplicationFormatter({project: myProject});

	await applicationFormatter.format();
	t.falsy(myProject.metadata.namespace,
		"namespace is falsy since getManifest resolves with an empty object");
});
