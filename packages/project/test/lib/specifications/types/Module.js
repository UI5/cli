import test from "ava";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sinonGlobal from "sinon";
import Specification from "../../../../lib/specifications/Specification.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const moduleAPath = path.join(__dirname, "..", "..", "..", "fixtures", "module.a");

test.beforeEach((t) => {
	t.context.sinon = sinonGlobal.createSandbox();
	t.context.projectInput = {
		id: "module.a.id",
		version: "1.0.0",
		modulePath: moduleAPath,
		configuration: {
			specVersion: "2.3",
			kind: "project",
			type: "module",
			metadata: {
				name: "module.a",
				copyright: "Some fancy copyright" // allowed but ignored
			},
			resources: {
				configuration: {
					paths: {
						"/": "dist",
						"/dev/": "dev"
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
	const {default: Module} = await import("../../../../lib/specifications/types/Module.js");
	const project = await Specification.create(projectInput);
	t.true(project instanceof Module, `Is an instance of the Module class`);
});

test("getSourcePath: Throws", async (t) => {
	const {projectInput} = t.context;
	const project = await Specification.create(projectInput);
	const err = t.throws(() => {
		project.getSourcePath();
	});
	t.is(err.message, "Projects of type module have more than one source path",
		"Threw with expected error message");
});

test("getNamespace", async (t) => {
	const {projectInput} = t.context;
	const project = await Specification.create(projectInput);
	t.is(project.getNamespace(), null,
		"Returned no namespace");
});

test("Access project resources via reader", async (t) => {
	const {projectInput} = t.context;
	const project = await Specification.create(projectInput);
	t.throws(() => {
		project.getSourcePath();
	}, {
		message: "Projects of type module have more than one source path"
	}, "Threw with expected error message");
});

test("Access project resources via reader (multiple mappings)", async (t) => {
	const {projectInput} = t.context;
	const project = await Specification.create(projectInput);
	const reader = project.getReader();
	const resource1 = await reader.byPath("/dev/devTools.js");
	t.truthy(resource1, "Found the requested resource");
	t.is(resource1.getPath(), "/dev/devTools.js", "Resource has correct path");

	const resource2 = await reader.byPath("/index.js");
	t.truthy(resource2, "Found the requested resource");
	t.is(resource2.getPath(), "/index.js", "Resource has correct path");
});

test("Access project resources via reader (one mapping)", async (t) => {
	const {projectInput} = t.context;
	delete projectInput.configuration.resources.configuration.paths["/"];
	const project = await Specification.create(projectInput);
	const reader = project.getReader();
	const resource1 = await reader.byPath("/dev/devTools.js");
	t.truthy(resource1, "Found the requested resource");
	t.is(resource1.getPath(), "/dev/devTools.js", "Resource has correct path");

	const resource2 = await reader.byPath("/index.js");
	t.falsy(resource2, "Could not find resource in unmapped path");
});

test("Access project resources via reader w/ builder excludes", async (t) => {
	const {projectInput, sinon} = t.context;
	const baselineProject = await Specification.create(projectInput);
	const excludesProject = await Specification.create(projectInput);

	// As of specVersion 3.0, modules are not allowed to have a "builder.resources" configuration.
	// Hence modules can't practically be configured with builder excludes.
	// We still simply stub the respective API call to test the code and be prepared
	//
	// projectInput.configuration.builder = {
	// 	resources: {
	// 		excludes: ["**/devTools.js"]
	// 	}
	// };
	// So stub instead:
	sinon.stub(excludesProject, "getBuilderResourcesExcludes").returns(["**/devTools.js"]);

	// We now have two projects: One with excludes and one without
	// Always compare the results of both to make sure a file is really excluded because of the
	// configuration and not because of a typo or because of it's absence in the fixture

	t.is((await baselineProject.getReader({}).byGlob("**/devTools.js")).length, 1,
		"Found resource in baseline project for default style");
	t.is((await excludesProject.getReader({}).byGlob("**/devTools.js")).length, 0,
		"Did not find excluded resource for default style");

	t.is((await baselineProject.getReader({style: "buildtime"}).byGlob("**/devTools.js")).length, 1,
		"Found resource in baseline project for buildtime style");
	t.is((await excludesProject.getReader({style: "buildtime"}).byGlob("**/devTools.js")).length, 0,
		"Did not find excluded resource for buildtime style");

	t.is((await baselineProject.getReader({style: "dist"}).byGlob("**/devTools.js")).length, 1,
		"Found resource in baseline project for dist style");
	t.is((await excludesProject.getReader({style: "dist"}).byGlob("**/devTools.js")).length, 0,
		"Did not find excluded resource for dist style");

	t.is((await baselineProject.getReader({style: "flat"}).byGlob("**/devTools.js")).length, 1,
		"Found resource in baseline project for flat style");
	t.is((await excludesProject.getReader({style: "flat"}).byGlob("**/devTools.js")).length, 0,
		"Did not find excluded resource for flat style");

	t.is((await baselineProject.getReader({style: "runtime"}).byGlob("**/devTools.js")).length, 1,
		"Found resource in baseline project for runtime style");
	t.is((await excludesProject.getReader({style: "runtime"}).byGlob("**/devTools.js")).length, 1,
		"Found excluded resource for runtime style");
});

test("Access project resources via workspace w/ builder excludes", async (t) => {
	const {projectInput, sinon} = t.context;
	const baselineProject = await Specification.create(projectInput);
	const excludesProject = await Specification.create(projectInput);

	// As of specVersion 3.0, modules are not allowed to have a "builder.resources" configuration.
	// Hence modules can't practically be configured with builder excludes.
	// We still simply stub the respective API call to test the code and be prepared
	//
	// projectInput.configuration.builder = {
	// 	resources: {
	// 		excludes: ["**/devTools.js"]
	// 	}
	// };
	// So stub instead:
	sinon.stub(excludesProject, "getBuilderResourcesExcludes").returns(["**/devTools.js"]);

	// We now have two projects: One with excludes and one without
	// Always compare the results of both to make sure a file is really excluded because of the
	// configuration and not because of a typo or because of it's absence in the fixture

	t.is((await baselineProject.getWorkspace().byGlob("**/devTools.js")).length, 1,
		"Found resource in baseline project for default style");
	t.is((await excludesProject.getWorkspace().byGlob("**/devTools.js")).length, 0,
		"Did not find excluded resource for default style");
});

test("Modify project resources via workspace and access via reader", async (t) => {
	const {projectInput} = t.context;
	const project = await Specification.create(projectInput);
	const workspace = project.getWorkspace();
	const workspaceResource = await workspace.byPath("/dev/devTools.js");
	t.truthy(workspaceResource, "Found resource in workspace");

	const newContent = (await workspaceResource.getString()).replace(/dev/g, "duck duck");
	workspaceResource.setString(newContent);
	await workspace.write(workspaceResource);

	const reader = project.getReader();
	const readerResource = await reader.byPath("/dev/devTools.js");
	t.truthy(readerResource, "Found the requested resource byPath");
	t.is(readerResource.getPath(), "/dev/devTools.js", "Resource (byPath) has correct path");
	t.is(await readerResource.getString(), newContent,
		"Found resource (byPath) has expected (changed) content");

	const gGlobResult = await reader.byGlob("**/devTools.js");
	t.is(gGlobResult.length, 1, "Found the requested resource byGlob");
	t.is(gGlobResult[0].getPath(), "/dev/devTools.js", "Resource (byGlob) has correct path");
	t.is(await gGlobResult[0].getString(), newContent,
		"Found resource (byGlob) has expected (changed) content");
});

test("Modify project resources via workspace and access via reader for other path mapping", async (t) => {
	const {projectInput} = t.context;
	const project = await Specification.create(projectInput);
	const workspace = project.getWorkspace();
	const workspaceResource = await workspace.byPath("/index.js");
	t.truthy(workspaceResource, "Found resource in workspace");

	const newContent = (await workspaceResource.getString()).replace("world", "duck");
	workspaceResource.setString(newContent);
	await workspace.write(workspaceResource);

	const reader = project.getReader();
	const readerResource = await reader.byPath("/index.js");
	t.truthy(readerResource, "Found the requested resource byPath");
	t.is(readerResource.getPath(), "/index.js", "Resource (byPath) has correct path");
	t.is(await readerResource.getString(), newContent,
		"Found resource (byPath) has expected (changed) content");

	const gGlobResult = await reader.byGlob("**/index.js");
	t.is(gGlobResult.length, 1, "Found the requested resource byGlob");
	t.is(gGlobResult[0].getPath(), "/index.js", "Resource (byGlob) has correct path");
	t.is(await gGlobResult[0].getString(), newContent,
		"Found resource (byGlob) has expected (changed) content");
});

test("_configureAndValidatePaths: Default path mapping", async (t) => {
	const {projectInput} = t.context;
	projectInput.configuration.resources = {};
	const project = await Specification.create(projectInput);

	t.is(project._paths.length, 1, "One default path mapping");
	t.is(project._paths[0].virBasePath, "/", "Default path mapping for /");
	t.is(project._paths[0].fsBasePath, projectInput.modulePath, "Correct fs path");
});

test("_configureAndValidatePaths: Configured path mapping", async (t) => {
	const {projectInput} = t.context;
	const project = await Specification.create(projectInput);

	t.is(project._paths.length, 2, "Two path mappings");
	t.is(project._paths[0].virBasePath, "/", "Correct virtual base path for /");
	t.is(project._paths[0].fsBasePath, path.join(projectInput.modulePath, "dist"), "Correct fs path");
	t.is(project._paths[1].virBasePath, "/dev/", "Correct virtual base path for /dev/");
	t.is(project._paths[1].fsBasePath, path.join(projectInput.modulePath, "dev"), "Correct fs path");
});

test("_configureAndValidatePaths: Default directory does not exist", async (t) => {
	const {projectInput} = t.context;
	projectInput.configuration.resources = {};
	projectInput.modulePath = "/does/not/exist";
	const err = await t.throwsAsync(Specification.create(projectInput));

	t.is(err.message, "Unable to find root directory of module project module.a");
});

test("_configureAndValidatePaths: Directory does not exist", async (t) => {
	const {projectInput} = t.context;
	projectInput.configuration.resources.configuration.paths.doesNotExist = "does/not/exist";
	const err = await t.throwsAsync(Specification.create(projectInput));

	t.is(err.message, "Unable to find source directory 'does/not/exist' in module project module.a");
});
