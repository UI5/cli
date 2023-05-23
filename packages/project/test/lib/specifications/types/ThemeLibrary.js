import test from "ava";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sinonGlobal from "sinon";
import Specification from "../../../../lib/specifications/Specification.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const themeLibraryEPath = path.join(__dirname, "..", "..", "..", "fixtures", "theme.library.e");

test.beforeEach((t) => {
	t.context.sinon = sinonGlobal.createSandbox();
	t.context.projectInput = {
		id: "theme.library.e.id",
		version: "1.0.0",
		modulePath: themeLibraryEPath,
		configuration: {
			specVersion: "2.6",
			kind: "project",
			type: "theme-library",
			metadata: {
				name: "theme.library.e",
				copyright: "Some fancy copyright"
			}
		}
	};
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});

test("Correct class", async (t) => {
	const {projectInput} = t.context;
	const {default: ThemeLibrary} = await import("../../../../lib/specifications/types/ThemeLibrary.js");
	const project = await Specification.create(projectInput);
	t.true(project instanceof ThemeLibrary, `Is an instance of the ThemeLibrary class`);
});

test("getCopyright", async (t) => {
	const {projectInput} = t.context;
	const project = await Specification.create(projectInput);

	t.is(project.getCopyright(), "Some fancy copyright", "Copyright was read correctly");
});

test("getSourcePath", async (t) => {
	const {projectInput} = t.context;
	const project = await Specification.create(projectInput);
	t.is(project.getSourcePath(), path.join(themeLibraryEPath, "src"), "Correct source path");
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
	const reader = project.getReader();
	const resource = await reader.byPath("/resources/theme/library/e/themes/my_theme/.theme");
	t.truthy(resource, "Found the requested resource");
	t.is(resource.getPath(), "/resources/theme/library/e/themes/my_theme/.theme", "Resource has correct path");
});

test("Access project test-resources via reader", async (t) => {
	const {projectInput} = t.context;
	const project = await Specification.create(projectInput);
	const reader = project.getReader();
	const resource = await reader.byPath("/test-resources/theme/library/e/Test.html");
	t.truthy(resource, "Found the requested resource");
	t.is(resource.getPath(), "/test-resources/theme/library/e/Test.html", "Resource has correct path");
});

test("Access project resources via reader w/ builder excludes", async (t) => {
	const {projectInput} = t.context;
	const baselineProject = await Specification.create(projectInput);

	projectInput.configuration.builder = {
		resources: {
			excludes: ["**/.theme"]
		}
	};
	const excludesProject = await Specification.create(projectInput);

	// We now have two projects: One with excludes and one without
	// Always compare the results of both to make sure a file is really excluded because of the
	// configuration and not because of a typo or because of it's absence in the fixture

	t.is((await baselineProject.getReader({}).byGlob("**/.theme")).length, 1,
		"Found resource in baseline project for default style");
	t.is((await excludesProject.getReader({}).byGlob("**/.theme")).length, 0,
		"Did not find excluded resource for default style");

	t.is((await baselineProject.getReader({style: "buildtime"}).byGlob("**/.theme")).length, 1,
		"Found resource in baseline project for buildtime style");
	t.is((await excludesProject.getReader({style: "buildtime"}).byGlob("**/.theme")).length, 0,
		"Did not find excluded resource for buildtime style");

	t.is((await baselineProject.getReader({style: "dist"}).byGlob("**/.theme")).length, 1,
		"Found resource in baseline project for dist style");
	t.is((await excludesProject.getReader({style: "dist"}).byGlob("**/.theme")).length, 0,
		"Did not find excluded resource for dist style");

	t.is((await baselineProject.getReader({style: "flat"}).byGlob("**/.theme")).length, 1,
		"Found resource in baseline project for flat style");
	t.is((await excludesProject.getReader({style: "flat"}).byGlob("**/.theme")).length, 0,
		"Did not find excluded resource for flat style");

	// Excludes are not applied for "runtime" style
	t.is((await baselineProject.getReader({style: "runtime"}).byGlob("**/.theme")).length, 1,
		"Found resource in baseline project for runtime style");
	t.is((await excludesProject.getReader({style: "runtime"}).byGlob("**/.theme")).length, 1,
		"Found excluded resource for runtime style");
});

test("Access project resources via workspace w/ builder excludes", async (t) => {
	const {projectInput} = t.context;
	const baselineProject = await Specification.create(projectInput);

	projectInput.configuration.builder = {
		resources: {
			excludes: ["**/.theme"]
		}
	};
	const excludesProject = await Specification.create(projectInput);

	// We now have two projects: One with excludes and one without
	// Always compare the results of both to make sure a file is really excluded because of the
	// configuration and not because of a typo or because of it's absence in the fixture

	t.is((await baselineProject.getWorkspace().byGlob("**/.theme")).length, 1,
		"Found resource in baseline project for default style");
	t.is((await excludesProject.getWorkspace().byGlob("**/.theme")).length, 0,
		"Did not find excluded resource for default style");
});

test("Access project resources via reader w/ absolute builder excludes", async (t) => {
	const {projectInput} = t.context;
	const baselineProject = await Specification.create(projectInput);

	projectInput.configuration.builder = {
		resources: {
			excludes: ["/resources/theme/library/e/themes/my_theme/.theme"]
		}
	};
	const excludesProject = await Specification.create(projectInput);

	// We now have two projects: One with excludes and one without
	// Always compare the results of both to make sure a file is really excluded because of the
	// configuration and not because of a typo or because of it's absence in the fixture

	t.is((await baselineProject.getReader({}).byGlob("**/.theme")).length, 1,
		"Found resource in baseline project for default style");
	t.is((await excludesProject.getReader({}).byGlob("**/.theme")).length, 0,
		"Did not find excluded resource for default style");

	t.is((await baselineProject.getReader({style: "buildtime"}).byGlob("**/.theme")).length, 1,
		"Found resource in baseline project for buildtime style");
	t.is((await excludesProject.getReader({style: "buildtime"}).byGlob("**/.theme")).length, 0,
		"Did not find excluded resource for buildtime style");

	t.is((await baselineProject.getReader({style: "dist"}).byGlob("**/.theme")).length, 1,
		"Found resource in baseline project for dist style");
	t.is((await excludesProject.getReader({style: "dist"}).byGlob("**/.theme")).length, 0,
		"Did not find excluded resource for dist style");

	t.is((await baselineProject.getReader({style: "flat"}).byGlob("**/.theme")).length, 1,
		"Found resource in baseline project for flat style");
	t.is((await excludesProject.getReader({style: "flat"}).byGlob("**/.theme")).length, 0,
		"Did not find excluded resource for flat style");

	// Excludes are not applied for "runtime" style
	t.is((await baselineProject.getReader({style: "runtime"}).byGlob("**/.theme")).length, 1,
		"Found resource in baseline project for runtime style");
	t.is((await excludesProject.getReader({style: "runtime"}).byGlob("**/.theme")).length, 1,
		"Found excluded resource for runtime style");

	t.is((await baselineProject.getWorkspace().byGlob("**/.theme")).length, 1,
		"Found resource in baseline project for default style");
	t.is((await excludesProject.getWorkspace().byGlob("**/.theme")).length, 0,
		"Did not find excluded resource for default style");
});

test("Modify project resources via workspace and access via flat and runtime reader", async (t) => {
	const {projectInput} = t.context;
	const project = await Specification.create(projectInput);
	const workspace = project.getWorkspace();
	const workspaceResource = await workspace.byPath("/resources/theme/library/e/themes/my_theme/library.source.less");
	t.truthy(workspaceResource, "Found resource in workspace");

	const newContent = (await workspaceResource.getString()).replace("fancy", "fancy dancy");
	workspaceResource.setString(newContent);
	await workspace.write(workspaceResource);

	const reader = project.getReader();
	const readerResource = await reader.byPath("/resources/theme/library/e/themes/my_theme/library.source.less");
	t.truthy(readerResource, "Found the requested resource byPath");
	t.is(readerResource.getPath(), "/resources/theme/library/e/themes/my_theme/library.source.less",
		"Resource (byPath) has correct path");
	t.is(await readerResource.getString(), newContent,
		"Found resource (byPath) has expected (changed) content");

	const globResult = await reader.byGlob("**/library.source.less");
	t.is(globResult.length, 1, "Found the requested resource byGlob");
	t.is(globResult[0].getPath(), "/resources/theme/library/e/themes/my_theme/library.source.less",
		"Resource (byGlob) has correct path");
	t.is(await globResult[0].getString(), newContent,
		"Found resource (byGlob) has expected (changed) content");
});

test("_configureAndValidatePaths: Default paths", async (t) => {
	const {projectInput} = t.context;
	const project = await Specification.create(projectInput);

	t.is(project._srcPath, "src", "Correct default path for src");
	t.is(project._testPath, "test", "Correct default path for test");
	t.true(project._testPathExists, "Test path detected as existing");
});

test("_configureAndValidatePaths: Test directory does not exist", async (t) => {
	const {projectInput} = t.context;
	projectInput.configuration.resources = {
		configuration: {
			paths: {
				test: "does/not/exist"
			}
		}
	};
	const project = await Specification.create(projectInput);

	t.is(project._srcPath, "src", "Correct path for src");
	t.is(project._testPath, "does/not/exist", "Correct path for test");
	t.false(project._testPathExists, "Test path detected as non-existent");
});

test("_configureAndValidatePaths: Source directory does not exist", async (t) => {
	const {projectInput} = t.context;
	projectInput.configuration.resources = {
		configuration: {
			paths: {
				src: "does/not/exist"
			}
		}
	};
	const err = await t.throwsAsync(Specification.create(projectInput));

	t.is(err.message, "Unable to find source directory 'does/not/exist' in theme-library project theme.library.e");
});
