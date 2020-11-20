const test = require("ava");
const path = require("path");
const sinon = require("sinon");

test.afterEach.always((t) => {
	sinon.restore();
});

const ThemeLibraryFormatter = require("../../../../lib/types/themeLibrary/ThemeLibraryFormatter");

const themeLibraryEPath = path.join(__dirname, "..", "..", "..", "fixtures", "theme.library.e");
const themeLibraryETree = {
	id: "theme.library.e.id",
	version: "1.0.0",
	path: themeLibraryEPath,
	dependencies: [],
	_level: 0,
	_isRoot: true,
	specVersion: "1.1",
	type: "theme-library",
	metadata: {
		name: "theme.library.e",
		copyright: "UI development toolkit for HTML5 (OpenUI5)\n * (c) Copyright 2009-xxx SAP SE or an SAP affiliate " +
			"company.\n * Licensed under the Apache License, Version 2.0 - see LICENSE.txt."
	},
	resources: {
		configuration: {
			paths: {
				src: "src",
				test: "test"
			}
		}
	}
};

function clone(o) {
	return JSON.parse(JSON.stringify(o));
}

test("validate: project not defined", async (t) => {
	const themeLibraryFormatter = new ThemeLibraryFormatter({project: null});

	// error is thrown because project is not defined (null)
	const error = await t.throwsAsync(themeLibraryFormatter.validate());
	t.deepEqual(error.message, "Project is undefined", "Correct exception thrown");
});

test("validate: wrong specVersion (0.1)", async (t) => {
	const themeLibraryFormatter = new ThemeLibraryFormatter({project: {
		specVersion: "0.1"
	}});

	// error is thrown because project is not defined (null)
	const error = await t.throwsAsync(themeLibraryFormatter.validate());
	t.deepEqual(error.message,
		`theme-library type requires "specVersion" 1.1 or higher. Project "specVersion" is: 0.1`,
		"Correct exception thrown");
});

test("validate: wrong specVersion (1.0)", async (t) => {
	const themeLibraryFormatter = new ThemeLibraryFormatter({project: {
		specVersion: "1.0"
	}});

	// error is thrown because project is not defined (null)
	const error = await t.throwsAsync(themeLibraryFormatter.validate());
	t.deepEqual(error.message,
		`theme-library type requires "specVersion" 1.1 or higher. Project "specVersion" is: 1.0`,
		"Correct exception thrown");
});

test("validate: empty version", async (t) => {
	const myProject = clone(themeLibraryETree);
	myProject.version = undefined;
	const themeLibraryFormatter = new ThemeLibraryFormatter({project: myProject});

	// error is thrown because project's version is not defined
	const error = await t.throwsAsync(themeLibraryFormatter.validate(myProject));
	t.deepEqual(error.message, `"version" is missing for project theme.library.e.id`, "Correct exception thrown");
});

test("validate: empty type", async (t) => {
	const myProject = clone(themeLibraryETree);
	myProject.type = undefined;
	const themeLibraryFormatter = new ThemeLibraryFormatter({project: myProject});

	// error is thrown because project's type is not defined
	const error = await t.throwsAsync(themeLibraryFormatter.validate(myProject));
	t.deepEqual(error.message, `"type" configuration is missing for project theme.library.e.id`,
		"Correct exception thrown");
});


test("validate: empty metadata", async (t) => {
	const myProject = clone(themeLibraryETree);
	myProject.metadata = undefined;
	const themeLibraryFormatter = new ThemeLibraryFormatter({project: myProject});

	// error is thrown because project's metadata is not defined
	const error = await t.throwsAsync(themeLibraryFormatter.validate(myProject));
	t.deepEqual(error.message, `"metadata.name" configuration is missing for project theme.library.e.id`,
		"Correct exception thrown");
});

test("validate: empty resources", async (t) => {
	const myProject = clone(themeLibraryETree);
	myProject.resources = undefined;
	const themeLibraryFormatter = new ThemeLibraryFormatter({project: myProject});

	await themeLibraryFormatter.validate(myProject);
	t.deepEqual(myProject.resources.configuration.paths.src, "src", "default src directory is set");
	t.deepEqual(myProject.resources.configuration.paths.test, "test", "default test directory is set");
});

test("validate: src directory does not exist", async (t) => {
	const myProject = clone(themeLibraryETree);
	const themeLibraryFormatter = new ThemeLibraryFormatter({project: myProject});
	const dirExists = sinon.stub(themeLibraryFormatter, "dirExists");
	dirExists.onFirstCall().resolves(false);
	dirExists.onSecondCall().resolves(true);

	const error = await await t.throwsAsync(themeLibraryFormatter.validate(myProject));
	t.regex(error.message, /^Could not find source directory of project theme\.library\.e\.id: (?!(undefined))+/,
		"Missing source directory caused error");
});

test("validate: test directory does not exist", async (t) => {
	const myProject = clone(themeLibraryETree);
	const themeLibraryFormatter = new ThemeLibraryFormatter({project: myProject});
	const dirExists = sinon.stub(themeLibraryFormatter, "dirExists");
	dirExists.onFirstCall().resolves(true);
	dirExists.onSecondCall().resolves(false);

	await themeLibraryFormatter.validate(myProject);
	// Missing test directory is not an error
	t.deepEqual(myProject.resources.configuration.paths.test, null, "Project test path configuration is set to nul");
});

test("format: copyright already configured", async (t) => {
	const myProject = clone(themeLibraryETree);
	const themeLibraryFormatter = new ThemeLibraryFormatter({project: myProject});
	sinon.stub(themeLibraryFormatter, "validate").resolves();

	await themeLibraryFormatter.format();
	t.deepEqual(myProject.metadata.copyright, themeLibraryETree.metadata.copyright, "Copyright was not altered");
});

test("format: formats correctly", async (t) => {
	const myProject = clone(themeLibraryETree);
	const themeLibraryFormatter = new ThemeLibraryFormatter({project: myProject});
	sinon.stub(themeLibraryFormatter, "validate").resolves();

	await themeLibraryFormatter.format();
	t.deepEqual(myProject, {
		id: "theme.library.e.id",
		version: "1.0.0",
		path: themeLibraryEPath,
		dependencies: [],
		_level: 0,
		_isRoot: true,
		specVersion: "1.1",
		type: "theme-library",
		metadata: {
			name: "theme.library.e",
			copyright:
				"UI development toolkit for HTML5 (OpenUI5)\n * (c) Copyright 2009-xxx SAP SE or an SAP affiliate " +
				"company.\n * Licensed under the Apache License, Version 2.0 - see LICENSE.txt."
		},
		resources: {
			configuration: {
				paths: {
					src: "src",
					test: "test"
				}
			},
			pathMappings: {
				"/resources/": "src",
				"/test-resources/": "test"
			}
		}
	}, "Project got formatted correctly");
});

test("format: configuration test path", async (t) => {
	const myProject = clone(themeLibraryETree);
	const themeLibraryFormatter = new ThemeLibraryFormatter({project: myProject});
	sinon.stub(themeLibraryFormatter, "validate").resolves();
	myProject.resources.configuration.paths.test = null;
	await themeLibraryFormatter.format();

	t.falsy(myProject.resources.pathMappings["/test-resources/"], "test-resources pathMapping is not set");
});
