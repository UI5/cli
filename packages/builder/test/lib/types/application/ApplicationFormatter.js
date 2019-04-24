const {test} = require("ava");
const path = require("path");
const chai = require("chai");
const sinon = require("sinon");
chai.use(require("chai-fs"));

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
		}
	}
};

function clone(o) {
	return JSON.parse(JSON.stringify(o));
}

test("validate: not existing directory webapp for c3", async (t) => {
	const myProject = clone(applicationBTree);
	myProject.path = path.join(__dirname, "..", "..", "..", "fixtures", "application.notExisting");
	const applicationFormatter = new ApplicationFormatter();
	const error = await t.throws(applicationFormatter.validate(myProject));
	t.regex(error.message, /^Could not find application directory of project application\.b: (?!(undefined))+/,
		"Correct exception thrown");
});

test("validate: project not defined", async (t) => {
	const applicationFormatter = new ApplicationFormatter();

	// error is thrown because project is not defined (null)
	const error = await t.throws(applicationFormatter.validate(null));
	t.deepEqual(error.message, "Project is undefined", "Correct exception thrown");
});

test("validate: empty version", async (t) => {
	const myProject = clone(applicationBTree);
	myProject.version = undefined;
	const applicationFormatter = new ApplicationFormatter();

	// error is thrown because project's version is not defined
	const error = await t.throws(applicationFormatter.validate(myProject));
	t.deepEqual(error.message, `"version" is missing for project application.b`, "Correct exception thrown");
});

test("validate: empty type", async (t) => {
	const myProject = clone(applicationBTree);
	myProject.type = undefined;
	const applicationFormatter = new ApplicationFormatter();

	// error is thrown because project's type is not defined
	const error = await t.throws(applicationFormatter.validate(myProject));
	t.deepEqual(error.message, `"type" configuration is missing for project application.b`, "Correct exception thrown");
});

test("validate: empty metadata", async (t) => {
	const myProject = clone(applicationBTree);
	myProject.metadata = undefined;
	const applicationFormatter = new ApplicationFormatter();

	// error is thrown because project's metadata is not defined
	const error = await t.throws(applicationFormatter.validate(myProject));
	t.deepEqual(error.message, `"metadata.name" configuration is missing for project application.b`,
		"Correct exception thrown");
});

test("validate: empty resources", async (t) => {
	const myProject = clone(applicationBTree);
	myProject.resources = undefined;
	const applicationFormatter = new ApplicationFormatter();

	// error is thrown because project's resources are not defined
	await applicationFormatter.validate(myProject);
	t.deepEqual(myProject.resources.configuration.paths.webapp, "webapp", "default webapp directory is set");
});

test("readManifest: check applicationVersion", async (t) => {
	const applicationFormatter = new ApplicationFormatter();
	const oRes = await applicationFormatter.readManifest({
		path: applicationBPath,
		resources: {
			pathMappings: {
				"/": "webapp"
			}
		}
	});
	t.deepEqual(oRes["sap.app"].applicationVersion.version, "1.2.2", "Manifest read correctly");
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
	const applicationFormatter = new ApplicationFormatter();
	sinon.stub(applicationFormatter, "validate").resolves();
	sinon.stub(applicationFormatter, "readManifest").resolves({});
	const project = createMockProject();

	await applicationFormatter.format(project);
	t.deepEqual(project.resources.pathMappings["/"], "webapp", "path mappings is set");
	t.falsy(project.metadata.namespace,
		"namespace is falsy since readManifest resolves with an empty object");
});

test("format: No application id in 'sap.app' configuration found", async (t) => {
	const applicationFormatter = new ApplicationFormatter();
	sinon.stub(applicationFormatter, "validate").resolves();
	sinon.stub(applicationFormatter, "readManifest").resolves({"sap.app": {}});
	const project = createMockProject();

	await applicationFormatter.format(project);
	t.deepEqual(project.resources.pathMappings["/"], "webapp", "path mappings is set");
	t.falsy(project.metadata.namespace,
		"namespace is falsy since readManifest resolves with an empty object");
});

test("format: set namespace to id", async (t) => {
	const applicationFormatter = new ApplicationFormatter();
	sinon.stub(applicationFormatter, "validate").resolves();
	sinon.stub(applicationFormatter, "readManifest").resolves({"sap.app": {id: "my.id"}});
	const project = createMockProject();

	await applicationFormatter.format(project);
	t.deepEqual(project.metadata.namespace, "my/id",
		"namespace was successfully set since readManifest provides the correct object structure");
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
	const applicationFormatter = new ApplicationFormatter();

	await applicationFormatter.format(myProject);
	t.deepEqual(myProject.metadata.namespace, "application/h",
		"namespace was successfully set since readManifest provides the correct object structure");
});

test("namespace: detect namespace from pom.xml via ${componentName} from properties", async (t) => {
	const myProject = clone(applicationHTree);
	myProject.resources.configuration.paths.webapp = "webapp-properties.componentName";
	const applicationFormatter = new ApplicationFormatter();

	await applicationFormatter.format(myProject);
	t.deepEqual(myProject.metadata.namespace, "application/h",
		"namespace was successfully set since readManifest provides the correct object structure");
});

test("namespace: detect namespace from pom.xml via ${appId} from properties", async (t) => {
	const myProject = clone(applicationHTree);
	myProject.resources.configuration.paths.webapp = "webapp-properties.appId";
	const applicationFormatter = new ApplicationFormatter();

	await applicationFormatter.format(myProject);
	t.falsy(myProject.metadata.namespace,
		"namespace is falsy since readManifest resolves with an empty object");
});
