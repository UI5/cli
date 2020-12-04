const test = require("ava");
const sinon = require("sinon");
const path = require("path");
const Module = require("../../../lib/graph/Module");

const applicationAPath = path.join(__dirname, "..", "..", "fixtures", "application.a");
const buildDescriptionApplicationAPath =
	path.join(__dirname, "..", "..", "fixtures", "build-manifest", "application.a");
const buildDescriptionLibraryAPath =
	path.join(__dirname, "..", "..", "fixtures", "build-manifest", "library.e");

const basicModuleInput = {
	id: "application.a.id",
	version: "1.0.0",
	modulePath: applicationAPath
};
const archiveAppProjectInput = {
	id: "application.a.id",
	version: "1.0.0",
	modulePath: buildDescriptionApplicationAPath
};

const archiveLibProjectInput = {
	id: "library.e.id",
	version: "1.0.0",
	modulePath: buildDescriptionLibraryAPath
};

// test.beforeEach((t) => {
// });

test.afterEach.always(() => {
	sinon.restore();
});

test("Instantiate a basic module", async (t) => {
	const ui5Module = new Module(basicModuleInput);
	t.is(ui5Module.getId(), "application.a.id", "Should return correct ID");
	t.is(ui5Module.getVersion(), "1.0.0", "Should return correct version");
	t.is(ui5Module.getPath(), applicationAPath, "Should return correct module path");
});

test("Access module root resources via reader", async (t) => {
	const ui5Module = new Module(basicModuleInput);
	const rootReader = await ui5Module.getReader();
	const packageJsonResource = await rootReader.byPath("/package.json");
	t.is(packageJsonResource.getPath(), "/package.json", "Successfully retrieved root resource");
});

test("Get specifications from module", async (t) => {
	const ui5Module = new Module(basicModuleInput);
	const {project, extensions} = await ui5Module.getSpecifications();
	t.is(project.getName(), "application.a", "Should return correct project");
	t.is(extensions.length, 0, "Should return no extensions");
});

test("Get specifications from application project with build manifest", async (t) => {
	const ui5Module = new Module(archiveAppProjectInput);
	const {project, extensions} = await ui5Module.getSpecifications();
	t.is(project.getName(), "application.a", "Should return correct project");
	t.is(extensions.length, 0, "Should return no extensions");
});

test("Get specifications from library project with build manifest", async (t) => {
	const ui5Module = new Module(archiveLibProjectInput);
	const {project, extensions} = await ui5Module.getSpecifications();
	t.is(project.getName(), "library.e", "Should return correct project");
	t.is(extensions.length, 0, "Should return no extensions");
});

test("configuration (object)", async (t) => {
	const ui5Module = new Module({
		id: "application.a.id",
		version: "1.0.0",
		modulePath: applicationAPath,
		configuration: {
			specVersion: "2.6",
			type: "application",
			metadata: {
				name: "application.a"
			},
			customConfiguration: {
				configurationTest: true
			}
		}
	});
	const {project, extensions} = await ui5Module.getSpecifications();
	t.deepEqual(project.getCustomConfiguration(), {
		configurationTest: true
	});
	t.is(extensions.length, 0, "Should return no extensions");
});

test("configuration (array)", async (t) => {
	const ui5Module = new Module({
		id: "application.a.id",
		version: "1.0.0",
		modulePath: applicationAPath,
		configuration: [{
			specVersion: "2.6",
			type: "application",
			metadata: {
				name: "application.a"
			},
			customConfiguration: {
				configurationTest: true
			}
		}, {
			specVersion: "2.6",
			kind: "extension",
			type: "project-shim",
			metadata: {
				name: "my-project-shim"
			},
			shims: {}
		}]
	});
	const {project, extensions} = await ui5Module.getSpecifications();
	t.deepEqual(project.getCustomConfiguration(), {
		configurationTest: true
	});
	t.is(extensions.length, 1, "Should return one extension");
});

test("configPath", async (t) => {
	const ui5Module = new Module({
		id: "application.a.id",
		version: "1.0.0",
		modulePath: applicationAPath,
		configPath: "ui5-test-configPath.yaml"
	});
	const {project, extensions} = await ui5Module.getSpecifications();
	t.deepEqual(project.getCustomConfiguration(), {
		configPathTest: true
	});
	t.is(extensions.length, 0, "Should return no extensions");
});

test("configuration + configPath must not be provided", async (t) => {
	// 'configuration' as object
	t.throws(() => {
		new Module({
			id: "application.a.id",
			version: "1.0.0",
			modulePath: applicationAPath,
			configPath: "test-ui5.yaml",
			configuration: {
				test: "configuration"
			}
		});
	}, {
		message: "Could not create Module: 'configPath' must not be provided in combination with 'configuration'"
	});
	// 'configuration' as array
	t.throws(() => {
		new Module({
			id: "application.a.id",
			version: "1.0.0",
			modulePath: applicationAPath,
			configPath: "test-ui5.yaml",
			configuration: [{
				test: "configuration"
			}]
		});
	}, {
		message: "Could not create Module: 'configPath' must not be provided in combination with 'configuration'"
	});
});
