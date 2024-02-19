import test from "ava";
import path from "node:path";
import createBuildManifest from "../../../../lib/build/helpers/createBuildManifest.js";
import Module from "../../../../lib/graph/Module.js";
import Specification from "../../../../lib/specifications/Specification.js";

const __dirname = import.meta.dirname;

const applicationAPath = path.join(__dirname, "..", "..", "..", "fixtures", "application.a");
const buildDescrApplicationAPath =
	path.join(__dirname, "..", "..", "..", "fixtures", "build-manifest", "application.a");
const applicationAConfig = {
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
const libraryEPath = path.join(__dirname, "..", "..", "..", "fixtures", "library.e");
const buildDescrLibraryEPath = path.join(__dirname, "..", "..", "..", "fixtures", "build-manifest", "library.e");
const libraryEConfig = {
	id: "library.e.id",
	version: "1.0.0",
	modulePath: libraryEPath,
	configuration: {
		specVersion: "2.3",
		kind: "project",
		type: "library",
		metadata: {name: "library.e"}
	}
};

const buildConfig = {
	selfContained: false,
	jsdoc: false,
	includedTasks: [],
	excludedTasks: []
};

// Note: The actual build-manifest.json files in the fixtures are never used in these tests

test("Create project from application project providing a build manifest", async (t) => {
	const inputProject = await Specification.create(applicationAConfig);
	inputProject.getResourceTagCollection().setTag("/resources/id1/foo.js", "ui5:HasDebugVariant");

	const taskRepository = {
		getVersions: async () => ({a: "a", b: "b"})
	};

	const metadata = await createBuildManifest(inputProject, buildConfig, taskRepository);
	const m = new Module({
		id: "build-descr-application.a.id",
		version: "2.0.0",
		modulePath: buildDescrApplicationAPath,
		configuration: metadata
	});

	const {project} = await m.getSpecifications();
	t.truthy(project, "Module was able to create project from build manifest metadata");
	t.is(project.getName(), project.getName(), "Archive project has correct name");
	t.is(project.getNamespace(), project.getNamespace(), "Archive project has correct namespace");
	t.is(project.getResourceTagCollection().getTag("/resources/id1/foo.js", "ui5:HasDebugVariant"), true,
		"Archive project has correct tag");
	t.is(project.getVersion(), "2.0.0", "Archive project has version from archive module");

	const reader = project.getReader();
	const resources = await reader.byGlob("**/test.js");
	t.is(resources.length, 1,
		"Found requested resource in archive project");
	t.is(resources[0].getPath(), "/resources/id1/test.js",
		"Resource has expected path");
});

test("Create project from library project providing a build manifest", async (t) => {
	const inputProject = await Specification.create(libraryEConfig);
	inputProject.getResourceTagCollection().setTag("/resources/library/e/file.js", "ui5:HasDebugVariant");

	const taskRepository = {
		getVersions: async () => ({a: "a", b: "b"})
	};

	const metadata = await createBuildManifest(inputProject, buildConfig, taskRepository);
	const m = new Module({
		id: "build-descr-library.e.id",
		version: "2.0.0",
		modulePath: buildDescrLibraryEPath,
		configuration: metadata
	});

	const {project} = await m.getSpecifications();
	t.truthy(project, "Module was able to create project from build manifest metadata");
	t.is(project.getName(), project.getName(), "Archive project has correct name");
	t.is(project.getNamespace(), project.getNamespace(), "Archive project has correct namespace");
	t.is(project.getResourceTagCollection().getTag("/resources/library/e/file.js", "ui5:HasDebugVariant"), true,
		"Archive project has correct tag");
	t.is(project.getVersion(), "2.0.0", "Archive project has version from archive module");

	const reader = project.getReader();
	const resources = await reader.byGlob("**/some.js");
	t.is(resources.length, 1,
		"Found requested resource in archive project");
	t.is(resources[0].getPath(), "/resources/library/e/some.js",
		"Resource has expected path");
});
