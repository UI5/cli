const test = require("ava");
const path = require("path");
const sinon = require("sinon");

const Specification = require("../../../lib/specifications/Specification");
const applicationAPath = path.join(__dirname, "..", "..", "fixtures", "application.a");
const genericExtensionPath = path.join(__dirname, "..", "..", "fixtures", "extension.a");
const moduleAPath = path.join(__dirname, "..", "..", "fixtures", "module.a");

test.beforeEach((t) => {
	t.context.basicProjectInput = {
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
});

test.afterEach.always((t) => {
	sinon.restore();
});

test("Instantiate a basic project", async (t) => {
	const project = await Specification.create(t.context.basicProjectInput);
	t.is(project.getName(), "application.a", "Returned correct name");
	t.is(project.getVersion(), "1.0.0", "Returned correct version");
	t.is(project.getPath(), applicationAPath, "Returned correct project path");
});

test("Configurations", async (t) => {
	const project = await Specification.create(t.context.basicProjectInput);
	t.is(project.getKind(), "project", "Returned correct kind configuration");
	t.is(project.getType(), "application", "Returned correct type configuration");
});

test("Access project root resources via reader", async (t) => {
	const project = await Specification.create(t.context.basicProjectInput);
	const rootReader = await project.getRootReader();
	const packageJsonResource = await rootReader.byPath("/package.json");
	t.is(packageJsonResource.getPath(), "/package.json", "Successfully retrieved root resource");
});

test("_dirExists: Directory exists", async (t) => {
	const project = await Specification.create(t.context.basicProjectInput);
	const bExists = await project._dirExists("/webapp");
	t.true(bExists, "directory exists");
});

test("_dirExists: Missing leading slash", async (t) => {
	const project = await Specification.create(t.context.basicProjectInput);
	const bExists = await project._dirExists("webapp");
	t.false(bExists, "directory is not found");
});

test("_dirExists: Trailing slash is ok", async (t) => {
	const project = await Specification.create(t.context.basicProjectInput);
	const bExists = await project._dirExists("/webapp/");
	t.true(bExists, "directory exists");
});

test("_dirExists: Directory is a file", async (t) => {
	const project = await Specification.create(t.context.basicProjectInput);

	const bExists = await project._dirExists("webapp/index.html");
	t.false(bExists, "directory is a file");
});

test("_dirExists: Directory does not exist", async (t) => {
	const project = await Specification.create(t.context.basicProjectInput);

	const bExists = await project._dirExists("/w");
	t.false(bExists, "directory does not exist");
});

test("Project with incorrect name", async (t) => {
	const project = await Specification.create({
		id: "application.a.id",
		version: "1.0.0",
		modulePath: applicationAPath,
		configuration: {
			specVersion: "2.3",
			kind: "project",
			type: "application",
			metadata: {name: "application a"}
		}
	});
	t.is(project.getName(), "application a", "Returned correct name");
	t.is(project.getVersion(), "1.0.0", "Returned correct version");
	t.is(project.getPath(), applicationAPath, "Returned correct project path");
});

test("Migrate legacy project", async (t) => {
	t.context.basicProjectInput.configuration.specVersion = "1.0";
	const project = await Specification.create(t.context.basicProjectInput);

	t.is(project.getSpecVersion(), "2.6", "Project got migrated to latest specVersion");
});

test("Migrate legacy project unexpected configuration", async (t) => {
	t.context.basicProjectInput.configuration.specVersion = "1.0";
	t.context.basicProjectInput.configuration.someCustomSetting = "Pineapple";
	const err = await t.throwsAsync(Specification.create(t.context.basicProjectInput));

	t.is(err.message,
		"project application.a defines unsupported specification version 1.0. Please manually upgrade to 2.0 or " +
		"higher. For details see https://sap.github.io/ui5-tooling/pages/Configuration/#specification-versions - " +
		"An attempted migration to a supported specification version failed, likely due to unrecognized " +
		"configuration. Check verbose log for details.",
		"Threw with expected error message");
});

test("Migrate legacy module", async (t) => {
	const project = await Specification.create({
		id: "my.task",
		version: "3.4.7-beta",
		modulePath: genericExtensionPath,
		configuration: {
			specVersion: "1.0",
			kind: "extension",
			type: "task",
			metadata: {
				name: "task-a"
			},
			task: {
				path: "lib/extensionModule.js"
			}
		}
	});

	t.is(project.getSpecVersion(), "2.6", "Project got migrated to latest specVersion");
});

test("Migrate legacy extension", async (t) => {
	const project = await Specification.create({
		id: "module.a.id",
		version: "1.0.0",
		modulePath: moduleAPath,
		configuration: {
			specVersion: "1.1",
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
	});

	t.is(project.getSpecVersion(), "2.6", "Project got migrated to latest specVersion");
});
