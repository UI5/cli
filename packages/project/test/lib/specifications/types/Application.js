import test from "ava";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createResource} from "@ui5/fs/resourceFactory";
import sinonGlobal from "sinon";
import Specification from "../../../../lib/specifications/Specification.js";
import Application from "../../../../lib/specifications/types/Application.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const applicationAPath = path.join(__dirname, "..", "..", "..", "fixtures", "application.a");
const applicationHPath = path.join(__dirname, "..", "..", "..", "fixtures", "application.h");

test.beforeEach((t) => {
	t.context.sinon = sinonGlobal.createSandbox();
	t.context.projectInput = {
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

	t.context.applicationHInput = {
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
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});

test("Correct class", async (t) => {
	const {projectInput} = t.context;
	const project = await Specification.create(projectInput);
	t.true(project instanceof Application, `Is an instance of the Application class`);
});

test("getNamespace", async (t) => {
	const {projectInput} = t.context;
	const project = await Specification.create(projectInput);
	t.is(project.getNamespace(), "id1",
		"Returned correct namespace");
});

test("getSourcePath", async (t) => {
	const {projectInput} = t.context;
	const project = await Specification.create(projectInput);
	t.is(project.getSourcePath(), path.join(applicationAPath, "webapp"),
		"Returned correct source path");
});

test("getCachebusterSignatureType: Default", async (t) => {
	const {projectInput} = t.context;
	const project = await Specification.create(projectInput);
	t.is(project.getCachebusterSignatureType(), "time",
		"Returned correct default cachebuster signature type configuration");
});

test("getCachebusterSignatureType: Configuration", async (t) => {
	const {projectInput} = t.context;
	projectInput.configuration.builder = {
		cachebuster: {
			signatureType: "hash"
		}
	};
	const project = await Specification.create(projectInput);
	t.is(project.getCachebusterSignatureType(), "hash",
		"Returned correct default cachebuster signature type configuration");
});

test("Access project resources via reader: buildtime style", async (t) => {
	const {projectInput} = t.context;
	const project = await Specification.create(projectInput);
	const reader = project.getReader();
	const resource = await reader.byPath("/resources/id1/manifest.json");
	t.truthy(resource, "Found the requested resource");
	t.is(resource.getPath(), "/resources/id1/manifest.json", "Resource has correct path");
});

test("Access project resources via reader: flat style", async (t) => {
	const {projectInput} = t.context;
	const project = await Specification.create(projectInput);
	const reader = project.getReader({style: "flat"});
	const resource = await reader.byPath("/manifest.json");
	t.truthy(resource, "Found the requested resource");
	t.is(resource.getPath(), "/manifest.json", "Resource has correct path");
});

test("Access project resources via reader: runtime style", async (t) => {
	const {projectInput} = t.context;
	const project = await Specification.create(projectInput);
	const reader = project.getReader({style: "runtime"});
	const resource = await reader.byPath("/manifest.json");
	t.truthy(resource, "Found the requested resource");
	t.is(resource.getPath(), "/manifest.json", "Resource has correct path");
});

test("Access project resources via reader w/ builder excludes", async (t) => {
	const {projectInput} = t.context;
	const baselineProject = await Specification.create(projectInput);

	projectInput.configuration.builder = {
		resources: {
			excludes: ["**/manifest.json"]
		}
	};
	const excludesProject = await Specification.create(projectInput);

	// We now have two projects: One with excludes and one without
	// Always compare the results of both to make sure a file is really excluded because of the
	// configuration and not because of a typo or because of it's absence in the fixture

	t.is((await baselineProject.getReader({}).byGlob("**/manifest.json")).length, 1,
		"Found resource in baseline project for default style");
	t.is((await excludesProject.getReader({}).byGlob("**/manifest.json")).length, 0,
		"Did not find excluded resource for default style");

	t.is((await baselineProject.getReader({style: "buildtime"}).byGlob("**/manifest.json")).length, 1,
		"Found resource in baseline project for buildtime style");
	t.is((await excludesProject.getReader({style: "buildtime"}).byGlob("**/manifest.json")).length, 0,
		"Did not find excluded resource for buildtime style");

	t.is((await baselineProject.getReader({style: "dist"}).byGlob("**/manifest.json")).length, 1,
		"Found resource in baseline project for dist style");
	t.is((await excludesProject.getReader({style: "dist"}).byGlob("**/manifest.json")).length, 0,
		"Did not find excluded resource for dist style");

	t.is((await baselineProject.getReader({style: "flat"}).byGlob("**/manifest.json")).length, 1,
		"Found resource in baseline project for flat style");
	t.is((await excludesProject.getReader({style: "flat"}).byGlob("**/manifest.json")).length, 0,
		"Did not find excluded resource for flat style");

	t.is((await baselineProject.getReader({style: "runtime"}).byGlob("**/manifest.json")).length, 1,
		"Found resource in baseline project for runtime style");
	t.is((await excludesProject.getReader({style: "runtime"}).byGlob("**/manifest.json")).length, 1,
		"Found excluded resource for runtime style");
});

test("Access project resources via workspace w/ builder excludes", async (t) => {
	const {projectInput} = t.context;
	const baselineProject = await Specification.create(projectInput);

	projectInput.configuration.builder = {
		resources: {
			excludes: ["**/manifest.json"]
		}
	};
	const excludesProject = await Specification.create(projectInput);

	// We now have two projects: One with excludes and one without
	// Always compare the results of both to make sure a file is really excluded because of the
	// configuration and not because of a typo or because of it's absence in the fixture

	t.is((await baselineProject.getWorkspace().byGlob("**/manifest.json")).length, 1,
		"Found resource in baseline project for default style");
	t.is((await excludesProject.getWorkspace().byGlob("**/manifest.json")).length, 0,
		"Did not find excluded resource for default style");
});

test("Access project resources w/ absolute builder excludes", async (t) => {
	const {projectInput} = t.context;
	const baselineProject = await Specification.create(projectInput);

	projectInput.configuration.builder = {
		resources: {
			excludes: ["/resources/id1/manifest.json"]
		}
	};
	const excludesProject = await Specification.create(projectInput);

	// We now have two projects: One with excludes and one without
	// Always compare the results of both to make sure a file is really excluded because of the
	// configuration and not because of a typo or because of it's absence in the fixture

	t.is((await baselineProject.getReader({}).byGlob("**/manifest.json")).length, 1,
		"Found resource in baseline project for default style");
	t.is((await excludesProject.getReader({}).byGlob("**/manifest.json")).length, 0,
		"Did not find excluded resource for default style");

	t.is((await baselineProject.getReader({style: "buildtime"}).byGlob("**/manifest.json")).length, 1,
		"Found resource in baseline project for buildtime style");
	t.is((await excludesProject.getReader({style: "buildtime"}).byGlob("**/manifest.json")).length, 0,
		"Did not find excluded resource for buildtime style");

	t.is((await baselineProject.getReader({style: "dist"}).byGlob("**/manifest.json")).length, 1,
		"Found resource in baseline project for dist style");
	t.is((await excludesProject.getReader({style: "dist"}).byGlob("**/manifest.json")).length, 0,
		"Did not find excluded resource for dist style");

	t.is((await baselineProject.getReader({style: "flat"}).byGlob("**/manifest.json")).length, 1,
		"Found resource in baseline project for flat style");
	t.is((await excludesProject.getReader({style: "flat"}).byGlob("**/manifest.json")).length, 0,
		"Did not find excluded resource for flat style");

	// Excludes are not applied for "runtime" style
	t.is((await baselineProject.getReader({style: "runtime"}).byGlob("**/manifest.json")).length, 1,
		"Found resource in baseline project for runtime style");
	t.is((await excludesProject.getReader({style: "runtime"}).byGlob("**/manifest.json")).length, 1,
		"Found excluded resource for runtime style");

	t.is((await baselineProject.getWorkspace().byGlob("**/manifest.json")).length, 1,
		"Found resource in baseline project for default style");
	t.is((await excludesProject.getWorkspace().byGlob("**/manifest.json")).length, 0,
		"Did not find excluded resource for default style");
});

test("Access project resources w/ relative builder excludes", async (t) => {
	const {projectInput} = t.context;
	const baselineProject = await Specification.create(projectInput);

	projectInput.configuration.builder = {
		resources: {
			excludes: ["manifest.json"]
		}
	};
	const excludesProject = await Specification.create(projectInput);

	// We now have two projects: One with excludes and one without
	// Always compare the results of both to make sure a file is really excluded because of the
	// configuration and not because of a typo or because of it's absence in the fixture

	t.is((await baselineProject.getReader({}).byGlob("**/manifest.json")).length, 1,
		"Found resource in baseline project for default style");
	t.is((await excludesProject.getReader({}).byGlob("**/manifest.json")).length, 0,
		"Did not find excluded resource for default style");

	t.is((await baselineProject.getReader({style: "buildtime"}).byGlob("**/manifest.json")).length, 1,
		"Found resource in baseline project for buildtime style");
	t.is((await excludesProject.getReader({style: "buildtime"}).byGlob("**/manifest.json")).length, 0,
		"Did not find excluded resource for buildtime style");

	t.is((await baselineProject.getReader({style: "dist"}).byGlob("**/manifest.json")).length, 1,
		"Found resource in baseline project for dist style");
	t.is((await excludesProject.getReader({style: "dist"}).byGlob("**/manifest.json")).length, 0,
		"Did not find excluded resource for dist style");

	t.is((await baselineProject.getReader({style: "flat"}).byGlob("**/manifest.json")).length, 1,
		"Found resource in baseline project for flat style");
	t.is((await excludesProject.getReader({style: "flat"}).byGlob("**/manifest.json")).length, 0,
		"Did not find excluded resource for flat style");

	// Excludes are not applied for "runtime" style
	t.is((await baselineProject.getReader({style: "runtime"}).byGlob("**/manifest.json")).length, 1,
		"Found resource in baseline project for runtime style");
	t.is((await excludesProject.getReader({style: "runtime"}).byGlob("**/manifest.json")).length, 1,
		"Found excluded resource for runtime style");

	t.is((await baselineProject.getWorkspace().byGlob("**/manifest.json")).length, 1,
		"Found resource in baseline project for default style");
	t.is((await excludesProject.getWorkspace().byGlob("**/manifest.json")).length, 0,
		"Did not find excluded resource for default style");
});

test("Access project resources w/ legacy builder excludes", async (t) => {
	const {projectInput} = t.context;
	const baselineProject = await Specification.create(projectInput);

	projectInput.configuration.builder = {
		resources: {
			excludes: ["/manifest.json"]
		}
	};
	const excludesProject = await Specification.create(projectInput);

	// We now have two projects: One with excludes and one without
	// Always compare the results of both to make sure a file is really excluded because of the
	// configuration and not because of a typo or because of it's absence in the fixture

	t.is((await baselineProject.getReader({}).byGlob("**/manifest.json")).length, 1,
		"Found resource in baseline project for default style");
	t.is((await excludesProject.getReader({}).byGlob("**/manifest.json")).length, 0,
		"Did not find excluded resource for default style");

	t.is((await baselineProject.getReader({style: "buildtime"}).byGlob("**/manifest.json")).length, 1,
		"Found resource in baseline project for buildtime style");
	t.is((await excludesProject.getReader({style: "buildtime"}).byGlob("**/manifest.json")).length, 0,
		"Did not find excluded resource for buildtime style");

	t.is((await baselineProject.getReader({style: "dist"}).byGlob("**/manifest.json")).length, 1,
		"Found resource in baseline project for dist style");
	t.is((await excludesProject.getReader({style: "dist"}).byGlob("**/manifest.json")).length, 0,
		"Did not find excluded resource for dist style");

	t.is((await baselineProject.getReader({style: "flat"}).byGlob("**/manifest.json")).length, 1,
		"Found resource in baseline project for flat style");
	t.is((await excludesProject.getReader({style: "flat"}).byGlob("**/manifest.json")).length, 0,
		"Did not find excluded resource for flat style");

	// Excludes are not applied for "runtime" style
	t.is((await baselineProject.getReader({style: "runtime"}).byGlob("**/manifest.json")).length, 1,
		"Found resource in baseline project for runtime style");
	t.is((await excludesProject.getReader({style: "runtime"}).byGlob("**/manifest.json")).length, 1,
		"Found excluded resource for runtime style");

	t.is((await baselineProject.getWorkspace().byGlob("**/manifest.json")).length, 1,
		"Found resource in baseline project for default style");
	t.is((await excludesProject.getWorkspace().byGlob("**/manifest.json")).length, 0,
		"Did not find excluded resource for default style");
});

test("Modify project resources via workspace and access via flat and runtime readers", async (t) => {
	const {projectInput} = t.context;
	const project = await Specification.create(projectInput);
	const workspace = project.getWorkspace();
	const workspaceResource = await workspace.byPath("/resources/id1/index.html");
	t.truthy(workspaceResource, "Found resource in workspace");

	const newContent = (await workspaceResource.getString()).replace("Application A", "Some Name");
	workspaceResource.setString(newContent);
	await workspace.write(workspaceResource);

	const flatReader = project.getReader({style: "flat"});
	const flatReaderResource = await flatReader.byPath("/index.html");
	t.truthy(flatReaderResource, "Found the requested resource byPath");
	t.is(flatReaderResource.getPath(), "/index.html", "Resource (byPath) has correct path");
	t.is(await flatReaderResource.getString(), newContent, "Found resource (byPath) has expected (changed) content");

	const flatGlobResult = await flatReader.byGlob("**/index.html");
	t.is(flatGlobResult.length, 1, "Found the requested resource byGlob");
	t.is(flatGlobResult[0].getPath(), "/index.html", "Resource (byGlob) has correct path");
	t.is(await flatGlobResult[0].getString(), newContent, "Found resource (byGlob) has expected (changed) content");

	const runtimeReader = project.getReader({style: "runtime"});
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
	const {projectInput} = t.context;
	const project = await Specification.create(projectInput);
	const workspace = project.getWorkspace();

	await workspace.write(createResource({
		path: "/resources/my-custom-bundle.js"
	}));

	const buildtimeReader = project.getReader({style: "buildtime"});
	const buildtimeReaderResource = await buildtimeReader.byPath("/resources/my-custom-bundle.js");
	t.truthy(buildtimeReaderResource, "Found the requested resource byPath (buildtime)");
	t.is(buildtimeReaderResource.getPath(), "/resources/my-custom-bundle.js",
		"Resource (byPath) has correct path (buildtime)");

	const buildtimeGlobResult = await buildtimeReader.byGlob("**/my-custom-bundle.js");
	t.is(buildtimeGlobResult.length, 1, "Found the requested resource byGlob (buildtime)");
	t.is(buildtimeGlobResult[0].getPath(), "/resources/my-custom-bundle.js",
		"Resource (byGlob) has correct path (buildtime)");

	const flatReader = project.getReader({style: "flat"});
	const flatReaderResource = await flatReader.byPath("/resources/my-custom-bundle.js");
	t.falsy(flatReaderResource, "Resource outside of app namespace can't be read using flat reader");

	const flatGlobResult = await flatReader.byGlob("**/my-custom-bundle.js");
	t.is(flatGlobResult.length, 0, "Resource outside of app namespace can't be found using flat reader");

	const runtimeReader = project.getReader({style: "runtime"});
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
	const {projectInput} = t.context;
	const project = await Specification.create(projectInput);

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
	const {projectInput} = t.context;
	projectInput.configuration.resources = {
		configuration: {
			paths: {
				webapp: "does/not/exist"
			}
		}
	};
	const err = await t.throwsAsync(Specification.create(projectInput));

	t.is(err.message, "Unable to find source directory 'does/not/exist' in application project application.a");
});

test("_getNamespaceFromManifestJson: No 'sap.app' configuration found", async (t) => {
	const {projectInput, sinon} = t.context;
	const project = await Specification.create(projectInput);
	sinon.stub(project, "_getManifest").resolves({});

	const error = await t.throwsAsync(project._getNamespaceFromManifestJson());
	t.is(error.message, "No sap.app/id configuration found in manifest.json of project application.a",
		"Rejected with correct error message");
});

test("_getNamespaceFromManifestJson: No application id in 'sap.app' configuration found", async (t) => {
	const {projectInput, sinon} = t.context;
	const project = await Specification.create(projectInput);
	sinon.stub(project, "_getManifest").resolves({"sap.app": {}});

	const error = await t.throwsAsync(project._getNamespaceFromManifestJson());
	t.is(error.message, "No sap.app/id configuration found in manifest.json of project application.a");
});

test("_getNamespaceFromManifestJson: set namespace to id", async (t) => {
	const {projectInput, sinon} = t.context;
	const project = await Specification.create(projectInput);
	sinon.stub(project, "_getManifest").resolves({"sap.app": {id: "my.id"}});

	const namespace = await project._getNamespaceFromManifestJson();
	t.is(namespace, "my/id", "Returned correct namespace");
});

test("_getNamespaceFromManifestAppDescVariant: No 'id' property found", async (t) => {
	const {projectInput, sinon} = t.context;
	const project = await Specification.create(projectInput);
	sinon.stub(project, "_getManifest").resolves({});

	const error = await t.throwsAsync(project._getNamespaceFromManifestAppDescVariant());
	t.is(error.message, `No "id" property found in manifest.appdescr_variant of project application.a`,
		"Rejected with correct error message");
});

test("_getNamespaceFromManifestAppDescVariant: set namespace to id", async (t) => {
	const {projectInput, sinon} = t.context;
	const project = await Specification.create(projectInput);
	sinon.stub(project, "_getManifest").resolves({id: "my.id"});

	const namespace = await project._getNamespaceFromManifestAppDescVariant();
	t.is(namespace, "my/id", "Returned correct namespace");
});

test("_getNamespace: Correct fallback to manifest.appdescr_variant if manifest.json is missing", async (t) => {
	const {projectInput, sinon} = t.context;
	const project = await Specification.create(projectInput);
	const _getManifestStub = sinon.stub(project, "_getManifest")
		.onFirstCall().rejects({code: "ENOENT"})
		.onSecondCall().resolves({id: "my.id"});

	const namespace = await project._getNamespace();
	t.is(namespace, "my/id", "Returned correct namespace");
	t.is(_getManifestStub.callCount, 2, "_getManifest called exactly twice");
	t.is(_getManifestStub.getCall(0).args[0], "/manifest.json", "_getManifest called for manifest.json first");
	t.is(_getManifestStub.getCall(1).args[0], "/manifest.appdescr_variant",
		"_getManifest called for manifest.appdescr_variant in fallback");
});

test("_getNamespace: Correct error message if fallback to manifest.appdescr_variant failed", async (t) => {
	const {projectInput, sinon} = t.context;
	const project = await Specification.create(projectInput);
	const _getManifestStub = sinon.stub(project, "_getManifest")
		.onFirstCall().rejects({code: "ENOENT"})
		.onSecondCall().rejects(new Error("EPON: Pony Error"));

	const error = await t.throwsAsync(project._getNamespace());
	t.is(error.message, "EPON: Pony Error",
		"Rejected with correct error message");
	t.is(_getManifestStub.callCount, 2, "_getManifest called exactly twice");
	t.is(_getManifestStub.getCall(0).args[0], "/manifest.json", "_getManifest called for manifest.json first");
	t.is(_getManifestStub.getCall(1).args[0], "/manifest.appdescr_variant",
		"_getManifest called for manifest.appdescr_variant in fallback");
});

test("_getNamespace: Correct error message if fallback to manifest.appdescr_variant is not possible", async (t) => {
	const {projectInput, sinon} = t.context;
	const project = await Specification.create(projectInput);
	const _getManifestStub = sinon.stub(project, "_getManifest")
		.onFirstCall().rejects({message: "No such stable or directory: manifest.json", code: "ENOENT"})
		.onSecondCall().rejects({code: "ENOENT"}); // both files are missing

	const error = await t.throwsAsync(project._getNamespace());
	t.deepEqual(error.message,
		"Could not find required manifest.json for project application.a: " +
		"No such stable or directory: manifest.json" +
		"\n\n" +
		"If you are about to start a new project, please refer to:\n" +
		"https://sap.github.io/ui5-tooling/v3/pages/GettingStarted/#starting-a-new-project",
		"Rejected with correct error message");

	t.is(_getManifestStub.callCount, 2, "_getManifest called exactly twice");
	t.is(_getManifestStub.getCall(0).args[0], "/manifest.json", "_getManifest called for manifest.json first");
	t.is(_getManifestStub.getCall(1).args[0], "/manifest.appdescr_variant",
		"_getManifest called for manifest.appdescr_variant in fallback");
});

test("_getNamespace: No fallback if manifest.json is present but failed to parse", async (t) => {
	const {projectInput, sinon} = t.context;
	const project = await Specification.create(projectInput);
	const _getManifestStub = sinon.stub(project, "_getManifest")
		.onFirstCall().rejects(new Error("EPON: Pony Error"));

	const error = await t.throwsAsync(project._getNamespace());
	t.is(error.message, "EPON: Pony Error",
		"Rejected with correct error message");

	t.is(_getManifestStub.callCount, 1, "_getManifest called exactly once");
	t.is(_getManifestStub.getCall(0).args[0], "/manifest.json", "_getManifest called for manifest.json only");
});

test("_getManifest: reads correctly", async (t) => {
	const {projectInput} = t.context;
	const project = await Specification.create(projectInput);

	const content = await project._getManifest("/manifest.json");
	t.is(content._version, "1.1.0", "manifest.json content has been read");
});

test("_getManifest: invalid JSON", async (t) => {
	const {projectInput, sinon} = t.context;
	const project = await Specification.create(projectInput);

	const byPathStub = sinon.stub().resolves({
		getString: async () => "no json"
	});

	project._getRawSourceReader = () => {
		return {
			byPath: byPathStub
		};
	};

	const error = await t.throwsAsync(project._getManifest("/some-manifest.json"));
	t.regex(error.message, /^Failed to read \/some-manifest\.json for project application\.a: /,
		"Rejected with correct error message");
	t.is(byPathStub.callCount, 1, "byPath got called once");
	t.is(byPathStub.getCall(0).args[0], "/some-manifest.json", "byPath got called with the correct argument");
});

test.serial("_getManifest: File does not exist", async (t) => {
	const {projectInput} = t.context;
	const project = await Specification.create(projectInput);

	const error = await t.throwsAsync(project._getManifest("/does-not-exist.json"));
	t.is(error.message,
		"Could not find resource /does-not-exist.json in project application.a",
		"Rejected with correct error message");
	t.is(error.code, "ENOENT");
});

test.serial("_getManifest: result is cached", async (t) => {
	const {projectInput, sinon} = t.context;
	const project = await Specification.create(projectInput);

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

	t.is(byPathStub.callCount, 2, "byPath got called exactly twice (and then cached)");
});

test.serial("_getManifest: Caches successes and failures", async (t) => {
	const {projectInput, sinon} = t.context;
	const project = await Specification.create(projectInput);

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

	t.is(byPathStub.callCount, 2,
		"byPath got called exactly twice (and then cached)");
});

test("namespace: detect namespace from pom.xml via ${project.artifactId}", async (t) => {
	const {applicationHInput} = t.context;
	applicationHInput.configuration.resources.configuration.paths.webapp = "webapp-project.artifactId";
	const project = await Specification.create(applicationHInput);

	t.is(project.getNamespace(), "application/h",
		"namespace was successfully set since getJson provides the correct object structure");
});

test("namespace: detect namespace from pom.xml via ${componentName} from properties", async (t) => {
	const {applicationHInput} = t.context;
	applicationHInput.configuration.resources.configuration.paths.webapp = "webapp-properties.componentName";
	const project = await Specification.create(applicationHInput);

	t.is(project.getNamespace(), "application/h",
		"namespace was successfully set since getJson provides the correct object structure");
});

test("namespace: detect namespace from pom.xml via ${appId} from properties", async (t) => {
	const {applicationHInput} = t.context;
	applicationHInput.configuration.resources.configuration.paths.webapp = "webapp-properties.appId";

	const error = await t.throwsAsync(Specification.create(applicationHInput));
	t.deepEqual(error.message, "Failed to resolve namespace of project application.h: \"${appId}\"" +
		" couldn't be resolved from maven property \"appId\" of pom.xml of project application.h");
});
