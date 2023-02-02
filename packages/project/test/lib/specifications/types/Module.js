import test from "ava";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sinon from "sinon";
import Specification from "../../../../lib/specifications/Specification.js";

function clone(obj) {
	return JSON.parse(JSON.stringify(obj));
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const moduleAPath = path.join(__dirname, "..", "..", "..", "fixtures", "module.a");
const basicProjectInput = {
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

test.afterEach.always((t) => {
	sinon.restore();
});

test("Correct class", async (t) => {
	const {default: Module} = await import("../../../../lib/specifications/types/Module.js");
	const project = await Specification.create(basicProjectInput);
	t.true(project instanceof Module, `Is an instance of the Module class`);
});

test("getSourcePath: Throws", async (t) => {
	const project = await Specification.create(basicProjectInput);
	const err = t.throws(() => {
		project.getSourcePath();
	});
	t.is(err.message, "Projects of type module have more than one source path",
		"Threw with expected error message");
});

test("getNamespace", async (t) => {
	const project = await Specification.create(basicProjectInput);
	t.is(project.getNamespace(), null,
		"Returned no namespace");
});

test("Access project resources via reader", async (t) => {
	const project = await Specification.create(basicProjectInput);
	t.throws(() => {
		project.getSourcePath();
	}, {
		message: "Projects of type module have more than one source path"
	}, "Threw with expected error message");
});

test("Access project resources via reader (multiple mappings)", async (t) => {
	const project = await Specification.create(basicProjectInput);
	const reader = project.getReader();
	const resource1 = await reader.byPath("/dev/devTools.js");
	t.truthy(resource1, "Found the requested resource");
	t.is(resource1.getPath(), "/dev/devTools.js", "Resource has correct path");

	const resource2 = await reader.byPath("/index.js");
	t.truthy(resource2, "Found the requested resource");
	t.is(resource2.getPath(), "/index.js", "Resource has correct path");
});

test("Access project resources via reader (one mapping)", async (t) => {
	const projectInput = clone(basicProjectInput);
	delete projectInput.configuration.resources.configuration.paths["/"];
	const project = await Specification.create(projectInput);
	const reader = project.getReader();
	const resource1 = await reader.byPath("/dev/devTools.js");
	t.truthy(resource1, "Found the requested resource");
	t.is(resource1.getPath(), "/dev/devTools.js", "Resource has correct path");

	const resource2 = await reader.byPath("/index.js");
	t.falsy(resource2, "Could not find resource in unmapped path");
});

test("Modify project resources via workspace and access via reader", async (t) => {
	const project = await Specification.create(basicProjectInput);
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
	const project = await Specification.create(basicProjectInput);
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
	const projectInput = clone(basicProjectInput);
	projectInput.configuration.resources = {};
	const project = await Specification.create(projectInput);

	t.is(project._paths.length, 1, "One default path mapping");
	t.is(project._paths[0].virBasePath, "/", "Default path mapping for /");
	t.is(project._paths[0].fsBasePath, projectInput.modulePath, "Correct fs path");
});

test("_configureAndValidatePaths: Configured path mapping", async (t) => {
	const projectInput = clone(basicProjectInput);
	const project = await Specification.create(projectInput);

	t.is(project._paths.length, 2, "Two path mappings");
	t.is(project._paths[0].virBasePath, "/", "Correct virtual base path for /");
	t.is(project._paths[0].fsBasePath, path.join(projectInput.modulePath, "dist"), "Correct fs path");
	t.is(project._paths[1].virBasePath, "/dev/", "Correct virtual base path for /dev/");
	t.is(project._paths[1].fsBasePath, path.join(projectInput.modulePath, "dev"), "Correct fs path");
});

test("_configureAndValidatePaths: Default directory does not exist", async (t) => {
	const projectInput = clone(basicProjectInput);
	projectInput.configuration.resources = {};
	projectInput.modulePath = "/does/not/exist";
	const err = await t.throwsAsync(Specification.create(projectInput));

	t.is(err.message, "Unable to find root directory of module project module.a");
});

test("_configureAndValidatePaths: Directory does not exist", async (t) => {
	const projectInput = clone(basicProjectInput);
	projectInput.configuration.resources.configuration.paths.doesNotExist = "does/not/exist";
	const err = await t.throwsAsync(Specification.create(projectInput));

	t.is(err.message, "Unable to find source directory 'does/not/exist' in module project module.a");
});
