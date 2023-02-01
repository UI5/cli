import test from "ava";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sinon from "sinon";
import Specification from "../../../../lib/specifications/Specification.js";

function clone(obj) {
	return JSON.parse(JSON.stringify(obj));
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const themeLibraryEPath = path.join(__dirname, "..", "..", "..", "fixtures", "theme.library.e");
const basicProjectInput = {
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

test.afterEach.always((t) => {
	sinon.restore();
});

test("Correct class", async (t) => {
	const {default: ThemeLibrary} = await import("../../../../lib/specifications/types/ThemeLibrary.js");
	const project = await Specification.create(basicProjectInput);
	t.true(project instanceof ThemeLibrary, `Is an instance of the ThemeLibrary class`);
});

test("getCopyright", async (t) => {
	const project = await Specification.create(basicProjectInput);

	t.is(project.getCopyright(), "Some fancy copyright", "Copyright was read correctly");
});

test("getSourcePath", async (t) => {
	const project = await Specification.create(basicProjectInput);
	t.is(project.getSourcePath(), path.join(themeLibraryEPath, "src"), "Correct source path");
});

test("getNamespace", async (t) => {
	const project = await Specification.create(basicProjectInput);
	t.is(project.getNamespace(), null,
		"Returned no namespace");
});

test("Access project resources via reader", async (t) => {
	const project = await Specification.create(basicProjectInput);
	const reader = project.getReader();
	const resource = await reader.byPath("/resources/theme/library/e/themes/my_theme/.theme");
	t.truthy(resource, "Found the requested resource");
	t.is(resource.getPath(), "/resources/theme/library/e/themes/my_theme/.theme", "Resource has correct path");
});

test("Access project test-resources via reader", async (t) => {
	const project = await Specification.create(basicProjectInput);
	const reader = project.getReader();
	const resource = await reader.byPath("/test-resources/theme/library/e/Test.html");
	t.truthy(resource, "Found the requested resource");
	t.is(resource.getPath(), "/test-resources/theme/library/e/Test.html", "Resource has correct path");
});

test("Modify project resources via workspace and access via flat and runtime reader", async (t) => {
	const project = await Specification.create(basicProjectInput);
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
	const project = await Specification.create(basicProjectInput);

	t.is(project._srcPath, "src", "Correct default path for src");
	t.is(project._testPath, "test", "Correct default path for test");
	t.true(project._testPathExists, "Test path detected as existing");
});

test("_configureAndValidatePaths: Test directory does not exist", async (t) => {
	const projectInput = clone(basicProjectInput);
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
	const projectInput = clone(basicProjectInput);
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
