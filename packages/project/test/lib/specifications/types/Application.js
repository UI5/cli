const test = require("ava");
const path = require("path");
const sinon = require("sinon");
const {createResource} = require("@ui5/fs").resourceFactory;
const Specification = require("../../../../lib/specifications/Specification");
const Application = require("../../../../lib/specifications/types/Application");

function clone(obj) {
	return JSON.parse(JSON.stringify(obj));
}

const applicationAPath = path.join(__dirname, "..", "..", "..", "fixtures", "application.a");
const basicProjectInput = {
	id: "application.a.id",
	version: "1.0.0",
	modulePath: applicationAPath,
	configuration: {
		specVersion: "2.3",
		kind: "project",
		type: "application",
		metadata: {name: "application.a"}
	}
};

test.afterEach.always((t) => {
	sinon.restore();
});

test("Correct class", async (t) => {
	const project = await Specification.create(basicProjectInput);
	t.true(project instanceof Application, `Is an instance of the Application class`);
});

test("getCachebusterSignatureType: Default", async (t) => {
	const project = await Specification.create(basicProjectInput);
	t.is(project.getCachebusterSignatureType(), "time",
		"Returned correct default cachebuster signature type configuration");
});

test("getCachebusterSignatureType: Configuration", async (t) => {
	const customProjectInput = clone(basicProjectInput);
	customProjectInput.configuration.builder = {
		cachebuster: {
			signatureType: "hash"
		}
	};
	const project = await Specification.create(customProjectInput);
	t.is(project.getCachebusterSignatureType(), "hash",
		"Returned correct default cachebuster signature type configuration");
});

test("Access project resources via reader: buildtime style", async (t) => {
	const project = await Specification.create(basicProjectInput);
	const reader = await project.getReader();
	const resource = await reader.byPath("/resources/id1/manifest.json");
	t.truthy(resource, "Found the requested resource");
	t.is(resource.getPath(), "/resources/id1/manifest.json", "Resource has correct path");
});

test("Access project resources via reader: flat style", async (t) => {
	const project = await Specification.create(basicProjectInput);
	const reader = await project.getReader({style: "flat"});
	const resource = await reader.byPath("/manifest.json");
	t.truthy(resource, "Found the requested resource");
	t.is(resource.getPath(), "/manifest.json", "Resource has correct path");
});

test("Access project resources via reader: runtime style", async (t) => {
	const project = await Specification.create(basicProjectInput);
	const reader = await project.getReader({style: "runtime"});
	const resource = await reader.byPath("/manifest.json");
	t.truthy(resource, "Found the requested resource");
	t.is(resource.getPath(), "/manifest.json", "Resource has correct path");
});

test("Modify project resources via workspace and access via flat and runtime readers", async (t) => {
	const project = await Specification.create(basicProjectInput);
	const workspace = await project.getWorkspace();
	const workspaceResource = await workspace.byPath("/resources/id1/index.html");
	t.truthy(workspaceResource, "Found resource in workspace");

	const newContent = (await workspaceResource.getString()).replace("Application A", "Some Name");
	workspaceResource.setString(newContent);
	await workspace.write(workspaceResource);

	const flatReader = await project.getReader({style: "flat"});
	const flatReaderResource = await flatReader.byPath("/index.html");
	t.truthy(flatReaderResource, "Found the requested resource byPath");
	t.is(flatReaderResource.getPath(), "/index.html", "Resource (byPath) has correct path");
	t.is(await flatReaderResource.getString(), newContent, "Found resource (byPath) has expected (changed) content");

	const flatGlobResult = await flatReader.byGlob("**/index.html");
	t.is(flatGlobResult.length, 1, "Found the requested resource byGlob");
	t.is(flatGlobResult[0].getPath(), "/index.html", "Resource (byGlob) has correct path");
	t.is(await flatGlobResult[0].getString(), newContent, "Found resource (byGlob) has expected (changed) content");

	const runtimeReader = await project.getReader({style: "runtime"});
	const runtimeReaderResource = await runtimeReader.byPath("/index.html");
	t.truthy(runtimeReaderResource, "Found the requested resource byPath");
	t.is(runtimeReaderResource.getPath(), "/index.html", "Resource (byPath) has correct path");
	t.is(await runtimeReaderResource.getString(), newContent, "Found resource (byPath) has expected (changed) content");

	const runtimeGlobResult = await runtimeReader.byGlob("**/index.html");
	t.is(runtimeGlobResult.length, 1, "Found the requested resource byGlob");
	t.is(runtimeGlobResult[0].getPath(), "/index.html", "Resource (byGlob) has correct path");
	t.is(await runtimeGlobResult[0].getString(), newContent, "Found resource (byGlob) has expected (changed) content");
});


test("Read and write resources outside of app namespace", async (t) => {
	const project = await Specification.create(basicProjectInput);
	const workspace = await project.getWorkspace();

	await workspace.write(createResource({
		path: "/resources/my-custom-bundle.js"
	}));

	const buildtimeReader = await project.getReader({style: "buildtime"});
	const buildtimeReaderResource = await buildtimeReader.byPath("/resources/my-custom-bundle.js");
	t.truthy(buildtimeReaderResource, "Found the requested resource byPath (buildtime)");
	t.is(buildtimeReaderResource.getPath(), "/resources/my-custom-bundle.js",
		"Resource (byPath) has correct path (buildtime)");

	const buildtimeGlobResult = await buildtimeReader.byGlob("**/my-custom-bundle.js");
	t.is(buildtimeGlobResult.length, 1, "Found the requested resource byGlob (buildtime)");
	t.is(buildtimeGlobResult[0].getPath(), "/resources/my-custom-bundle.js",
		"Resource (byGlob) has correct path (buildtime)");

	const flatReader = await project.getReader({style: "flat"});
	const flatReaderResource = await flatReader.byPath("/resources/my-custom-bundle.js");
	t.falsy(flatReaderResource, "Resource outside of app namespace can't be read using flat reader");

	const flatGlobResult = await flatReader.byGlob("**/my-custom-bundle.js");
	t.is(flatGlobResult.length, 0, "Resource outside of app namespace can't be found using flat reader");

	const runtimeReader = await project.getReader({style: "runtime"});
	const runtimeReaderResource = await runtimeReader.byPath("/resources/my-custom-bundle.js");
	t.truthy(runtimeReaderResource, "Found the requested resource byPath (runtime)");
	t.is(runtimeReaderResource.getPath(), "/resources/my-custom-bundle.js",
		"Resource (byPath) has correct path (runtime)");

	const runtimeGlobResult = await runtimeReader.byGlob("**/my-custom-bundle.js");
	t.is(runtimeGlobResult.length, 1, "Found the requested resource byGlob (runtime)");
	t.is(runtimeGlobResult[0].getPath(), "/resources/my-custom-bundle.js",
		"Resource (byGlob) has correct path (runtime)");
});

test("_configureAndValidatePaths: Default paths", async (t) => {
	const project = await Specification.create(basicProjectInput);

	t.is(project._webappPath, "webapp", "Correct default path");
});

test("_configureAndValidatePaths: Custom webapp directory", async (t) => {
	const applicationHPath = path.join(__dirname, "..", "..", "..", "fixtures", "application.h");
	const projectInput = {
		id: "application.h.id",
		version: "1.0.0",
		modulePath: applicationHPath,
		configuration: {
			specVersion: "2.3",
			kind: "project",
			type: "application",
			metadata: {name: "application.h"},
			resources: {
				configuration: {
					paths: {
						webapp: "webapp-properties.componentName"
					}
				}
			}
		}
	};

	const project = await Specification.create(projectInput);

	t.is(project._webappPath, "webapp-properties.componentName", "Correct path for src");
});

test("_configureAndValidatePaths: Webapp directory does not exist", async (t) => {
	const projectInput = clone(basicProjectInput);
	projectInput.configuration.resources = {
		configuration: {
			paths: {
				webapp: "does/not/exist"
			}
		}
	};
	const err = await t.throwsAsync(Specification.create(projectInput));

	t.is(err.message, "Unable to find directory 'does/not/exist' in application project application.a");
});

test("_getNamespaceFromManifestJson: No 'sap.app' configuration found", async (t) => {
	const project = await Specification.create(basicProjectInput);
	sinon.stub(project, "_getManifest").resolves({});

	const error = await t.throwsAsync(project._getNamespaceFromManifestJson());
	t.deepEqual(error.message, "No sap.app/id configuration found in manifest.json of project application.a",
		"Rejected with correct error message");
});

test("_getNamespaceFromManifestJson: No application id in 'sap.app' configuration found", async (t) => {
	const project = await Specification.create(basicProjectInput);
	sinon.stub(project, "_getManifest").resolves({"sap.app": {}});

	const error = await t.throwsAsync(project._getNamespaceFromManifestJson());
	t.deepEqual(error.message, "No sap.app/id configuration found in manifest.json of project application.a");
});

test("_getNamespaceFromManifestJson: set namespace to id", async (t) => {
	const project = await Specification.create(basicProjectInput);
	sinon.stub(project, "_getManifest").resolves({"sap.app": {id: "my.id"}});

	const namespace = await project._getNamespaceFromManifestJson();
	t.deepEqual(namespace, "my/id", "Returned correct namespace");
});

test("_getNamespaceFromManifestAppDescVariant: No 'id' property found", async (t) => {
	const project = await Specification.create(basicProjectInput);
	sinon.stub(project, "_getManifest").resolves({});

	const error = await t.throwsAsync(project._getNamespaceFromManifestAppDescVariant());
	t.deepEqual(error.message, `No "id" property found in manifest.appdescr_variant of project application.a`,
		"Rejected with correct error message");
});

test("_getNamespaceFromManifestAppDescVariant: set namespace to id", async (t) => {
	const project = await Specification.create(basicProjectInput);
	sinon.stub(project, "_getManifest").resolves({id: "my.id"});

	const namespace = await project._getNamespaceFromManifestAppDescVariant();
	t.deepEqual(namespace, "my/id", "Returned correct namespace");
});

test("_getNamespace: Correct fallback to manifest.appdescr_variant if manifest.json is missing", async (t) => {
	const project = await Specification.create(basicProjectInput);
	const _getManifestStub = sinon.stub(project, "_getManifest")
		.onFirstCall().rejects({code: "ENOENT"})
		.onSecondCall().resolves({id: "my.id"});

	const namespace = await project._getNamespace();
	t.deepEqual(namespace, "my/id", "Returned correct namespace");
	t.is(_getManifestStub.callCount, 2, "_getManifest called exactly twice");
	t.is(_getManifestStub.getCall(0).args[0], "/manifest.json", "_getManifest called for manifest.json first");
	t.is(_getManifestStub.getCall(1).args[0], "/manifest.appdescr_variant",
		"_getManifest called for manifest.appdescr_variant in fallback");
});

test("_getNamespace: Correct error message if fallback to manifest.appdescr_variant failed", async (t) => {
	const project = await Specification.create(basicProjectInput);
	const _getManifestStub = sinon.stub(project, "_getManifest")
		.onFirstCall().rejects({code: "ENOENT"})
		.onSecondCall().rejects(new Error("EPON: Pony Error"));

	const error = await t.throwsAsync(project._getNamespace());
	t.deepEqual(error.message, "EPON: Pony Error",
		"Rejected with correct error message");
	t.is(_getManifestStub.callCount, 2, "_getManifest called exactly twice");
	t.is(_getManifestStub.getCall(0).args[0], "/manifest.json", "_getManifest called for manifest.json first");
	t.is(_getManifestStub.getCall(1).args[0], "/manifest.appdescr_variant",
		"_getManifest called for manifest.appdescr_variant in fallback");
});

test("_getNamespace: Correct error message if fallback to manifest.appdescr_variant is not possible", async (t) => {
	const project = await Specification.create(basicProjectInput);
	const _getManifestStub = sinon.stub(project, "_getManifest")
		.onFirstCall().rejects({message: "No such stable or directory: manifest.json", code: "ENOENT"})
		.onSecondCall().rejects({code: "ENOENT"}); // both files are missing

	const error = await t.throwsAsync(project._getNamespace());
	t.deepEqual(error.message,
		"Could not find required manifest.json for project application.a: " +
		"No such stable or directory: manifest.json",
		"Rejected with correct error message");

	t.is(_getManifestStub.callCount, 2, "_getManifest called exactly twice");
	t.is(_getManifestStub.getCall(0).args[0], "/manifest.json", "_getManifest called for manifest.json first");
	t.is(_getManifestStub.getCall(1).args[0], "/manifest.appdescr_variant",
		"_getManifest called for manifest.appdescr_variant in fallback");
});

test("_getNamespace: No fallback if manifest.json is present but failed to parse", async (t) => {
	const project = await Specification.create(basicProjectInput);
	const _getManifestStub = sinon.stub(project, "_getManifest")
		.onFirstCall().rejects(new Error("EPON: Pony Error"));

	const error = await t.throwsAsync(project._getNamespace());
	t.deepEqual(error.message, "EPON: Pony Error",
		"Rejected with correct error message");

	t.is(_getManifestStub.callCount, 1, "_getManifest called exactly once");
	t.is(_getManifestStub.getCall(0).args[0], "/manifest.json", "_getManifest called for manifest.json only");
});

test("_getManifest: reads correctly", async (t) => {
	const project = await Specification.create(basicProjectInput);

	const content = await project._getManifest("/manifest.json");
	t.deepEqual(content._version, "1.1.0", "manifest.json content has been read");
});

test("_getManifest: invalid JSON", async (t) => {
	const project = await Specification.create(basicProjectInput);

	const byPathStub = sinon.stub().resolves({
		getString: async () => "no json"
	});

	project._getRawSourceReader = () => {
		return {
			byPath: byPathStub
		};
	};

	const error = await t.throwsAsync(project._getManifest("/some-manifest.json"));
	t.deepEqual(error.message,
		"Failed to read /some-manifest.json for project application.a: " +
		"Unexpected token o in JSON at position 1",
		"Rejected with correct error message");
	t.deepEqual(byPathStub.callCount, 1, "byPath got called once");
	t.deepEqual(byPathStub.getCall(0).args[0], "/some-manifest.json", "byPath got called with the correct argument");
});

test.serial("_getManifest: File does not exist", async (t) => {
	const project = await Specification.create(basicProjectInput);

	const error = await t.throwsAsync(project._getManifest("/does-not-exist.json"));
	t.deepEqual(error.message,
		"Failed to read /does-not-exist.json for project application.a: " +
		"Could not find resource /does-not-exist.json in project application.a",
		"Rejected with correct error message");
});

test.serial("_getManifest: result is cached", async (t) => {
	const project = await Specification.create(basicProjectInput);

	const byPathStub = sinon.stub().resolves({
		getString: async () => `{"pony": "no unicorn"}`
	});

	project._getRawSourceReader = () => {
		return {
			byPath: byPathStub
		};
	};

	const content = await project._getManifest("/some-manifest.json");
	t.deepEqual(content, {pony: "no unicorn"}, "Correct result on first call");

	const content2 = await project._getManifest("/some-other-manifest.json");
	t.deepEqual(content2, {pony: "no unicorn"}, "Correct result on second call");

	t.deepEqual(byPathStub.callCount, 2, "byPath got called exactly twice (and then cached)");
});

test.serial("_getManifest: Caches successes and failures", async (t) => {
	const project = await Specification.create(basicProjectInput);

	const getStringStub = sinon.stub()
		.onFirstCall().rejects(new Error("EPON: Pony Error"))
		.onSecondCall().resolves(`{"pony": "no unicorn"}`);
	const byPathStub = sinon.stub().resolves({
		getString: getStringStub
	});

	project._getRawSourceReader = () => {
		return {
			byPath: byPathStub
		};
	};

	const error = await t.throwsAsync(project._getManifest("/some-manifest.json"));
	t.deepEqual(error.message,
		"Failed to read /some-manifest.json for project application.a: " +
		"EPON: Pony Error",
		"Rejected with correct error message");

	const content = await project._getManifest("/some-other.manifest.json");
	t.deepEqual(content, {pony: "no unicorn"}, "Correct result on second call");

	const error2 = await t.throwsAsync(project._getManifest("/some-manifest.json"));
	t.deepEqual(error2.message,
		"Failed to read /some-manifest.json for project application.a: " +
		"EPON: Pony Error",
		"From cache: Rejected with correct error message");

	const content2 = await project._getManifest("/some-other.manifest.json");
	t.deepEqual(content2, {pony: "no unicorn"}, "From cache: Correct result on first call");

	t.deepEqual(byPathStub.callCount, 2,
		"byPath got called exactly twice (and then cached)");
});

const applicationHPath = path.join(__dirname, "..", "..", "..", "fixtures", "application.h");
const applicationH = {
	id: "application.h.id",
	version: "1.0.0",
	modulePath: applicationHPath,
	configuration: {
		specVersion: "2.3",
		kind: "project",
		type: "application",
		metadata: {name: "application.h"},
		resources: {
			configuration: {
				paths: {
					webapp: "webapp"
				}
			}
		}
	}
};

test("namespace: detect namespace from pom.xml via ${project.artifactId}", async (t) => {
	const myProject = clone(applicationH);
	myProject.configuration.resources.configuration.paths.webapp = "webapp-project.artifactId";
	const project = await Specification.create(myProject);

	t.deepEqual(project.getNamespace(), "application/h",
		"namespace was successfully set since getJson provides the correct object structure");
});

test("namespace: detect namespace from pom.xml via ${componentName} from properties", async (t) => {
	const myProject = clone(applicationH);
	myProject.configuration.resources.configuration.paths.webapp = "webapp-properties.componentName";
	const project = await Specification.create(myProject);

	t.deepEqual(project.getNamespace(), "application/h",
		"namespace was successfully set since getJson provides the correct object structure");
});

test("namespace: detect namespace from pom.xml via ${appId} from properties", async (t) => {
	const myProject = clone(applicationH);
	myProject.configuration.resources.configuration.paths.webapp = "webapp-properties.appId";

	const error = await t.throwsAsync(Specification.create(myProject));
	t.deepEqual(error.message, "Failed to resolve namespace of project application.h: \"${appId}\"" +
		" couldn't be resolved from maven property \"appId\" of pom.xml of project application.h");
});
