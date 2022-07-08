const test = require("ava");
const path = require("path");
const sinon = require("sinon");

const Specification = require("../../../lib/specifications/Specification");

test.afterEach.always((t) => {
	sinon.restore();
});

const applicationAPath = path.join(__dirname, "..", "..", "fixtures", "application.a");
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

test("Instantiate a basic project", async (t) => {
	const project = await Specification.create(basicProjectInput);
	t.is(project.getName(), "application.a", "Returned correct name");
	t.is(project.getVersion(), "1.0.0", "Returned correct version");
	t.is(project.getPath(), applicationAPath, "Returned correct project path");
});

test("Configurations", async (t) => {
	const project = await Specification.create(basicProjectInput);
	t.is(project.getKind(), "project", "Returned correct kind configuration");
	t.is(project.getType(), "application", "Returned correct type configuration");
});

test("Access project root resources via reader", async (t) => {
	const project = await Specification.create(basicProjectInput);
	const rootReader = await project.getRootReader();
	const packageJsonResource = await rootReader.byPath("/package.json");
	t.is(packageJsonResource.getPath(), "/package.json", "Successfully retrieved root resource");
});

test("_dirExists: Directory exists", async (t) => {
	const project = await Specification.create(basicProjectInput);
	const bExists = await project._dirExists("/webapp");
	t.true(bExists, "directory exists");
});

test("_dirExists: Missing leading slash", async (t) => {
	const project = await Specification.create(basicProjectInput);
	const bExists = await project._dirExists("webapp");
	t.false(bExists, "directory is not found");
});

test("_dirExists: Trailing slash is ok", async (t) => {
	const project = await Specification.create(basicProjectInput);
	const bExists = await project._dirExists("/webapp/");
	t.true(bExists, "directory exists");
});

test("_dirExists: Directory is a file", async (t) => {
	const project = await Specification.create(basicProjectInput);

	const bExists = await project._dirExists("webapp/index.html");
	t.false(bExists, "directory is a file");
});

test("_dirExists: Directory does not exist", async (t) => {
	const project = await Specification.create(basicProjectInput);

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
