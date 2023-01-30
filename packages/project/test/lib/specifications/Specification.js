import test from "ava";
import esmock from "esmock";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sinon from "sinon";
import Specification from "../../../lib/specifications/Specification.js";
import Application from "../../../lib/specifications/types/Application.js";
import Library from "../../../lib/specifications/types/Library.js";
import ThemeLibrary from "../../../lib/specifications/types/ThemeLibrary.js";
import Module from "../../../lib/specifications/types/Module.js";
import Task from "../../../lib/specifications/extensions/Task.js";
import ProjectShim from "../../../lib/specifications/extensions/ProjectShim.js";
import ServerMiddleware from "../../../lib/specifications/extensions/ServerMiddleware.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const applicationAPath = path.join(__dirname, "..", "..", "fixtures", "application.a");
const libraryHPath = path.join(__dirname, "..", "..", "fixtures", "library.h");
const themeLibraryEPath = path.join(__dirname, "..", "..", "fixtures", "theme.library.e");
const genericExtensionPath = path.join(__dirname, "..", "..", "fixtures", "extension.a");
const moduleAPath = path.join(__dirname, "..", "..", "fixtures", "module.a");

function createSubclass(Specification) {
	class MockSpecification extends Specification {
		getRootPath() {
			return "path";
		}
		getType() {
			return "type";
		}
		getKind() {
			return "kind";
		}
		getName() {
			return "name";
		}
	}
	return MockSpecification;
}

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

test("Specification can't be instantiated", (t) => {
	t.throws(() => {
		new Specification();
	}, {
		message: "Class 'Specification' is abstract. Please use one of the 'types' subclasses"
	});
});

test("Instantiate a basic project", async (t) => {
	const project = await Specification.create(t.context.basicProjectInput);
	t.is(project.getName(), "application.a", "Returned correct name");
	t.is(project.getVersion(), "1.0.0", "Returned correct version");
	t.is(project.getRootPath(), applicationAPath, "Returned correct project path");
});

test("init: Missing id", async (t) => {
	delete t.context.basicProjectInput.id;
	await t.throwsAsync(Specification.create(t.context.basicProjectInput), {
		message: "Could not create Specification: Missing or empty parameter 'id'"
	}, "Threw with expected error message");
});

test("init: Missing version", async (t) => {
	delete t.context.basicProjectInput.version;
	await t.throwsAsync(Specification.create(t.context.basicProjectInput), {
		message: "Could not create Specification: Missing or empty parameter 'version'"
	}, "Threw with expected error message");
});

test("init: Missing modulePath", async (t) => {
	delete t.context.basicProjectInput.modulePath;
	await t.throwsAsync(Specification.create(t.context.basicProjectInput), {
		message: "Could not create Specification: Missing or empty parameter 'modulePath'"
	}, "Threw with expected error message");
});

test("init: Missing configuration", async (t) => {
	delete t.context.basicProjectInput.configuration;
	const project = new Application();

	await t.throwsAsync(project.init(t.context.basicProjectInput), {
		message: "Could not create Specification: Missing or empty parameter 'configuration'"
	}, "Threw with expected error message");
});

test("init: Invalid constructor name", async (t) => {
	const MockSpecification = createSubclass(Specification);
	const project = new MockSpecification();

	await t.throwsAsync(project.init(t.context.basicProjectInput), {
		message: "Configuration mismatch: Supplied configuration of type 'application' " +
		"does not match with specification class MockSpecification"
	}, "Threw with expected error message");
});

test("Configurations", async (t) => {
	const project = await Specification.create(t.context.basicProjectInput);
	t.is(project.getKind(), "project", "Returned correct kind configuration");
	t.is(project.getType(), "application", "Returned correct type configuration");
	t.is(project.getSpecVersion().toString(), "2.3", "Returned correct specification version");
	t.is(project.getSpecVersion().major(), 2,
		"SpecVersionComparator returned correct major version");
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
	t.is(project.getRootPath(), applicationAPath, "Returned correct project path");
});

test("Migrate legacy project", async (t) => {
	t.context.basicProjectInput.configuration.specVersion = "1.0";
	const project = await Specification.create(t.context.basicProjectInput);

	t.is(project.getSpecVersion().toString(), "2.6", "Project got migrated to latest specVersion");
});

test("Migrate legacy project unexpected configuration", async (t) => {
	t.context.basicProjectInput.configuration.specVersion = "1.0";
	t.context.basicProjectInput.configuration.someCustomSetting = "Pineapple";
	const err = await t.throwsAsync(Specification.create(t.context.basicProjectInput));

	t.is(err.message,
		"project application.a defines unsupported Specification Version 1.0. Please manually upgrade to 3.0 or " +
		"higher. For details see https://sap.github.io/ui5-tooling/pages/Configuration/#specification-versions - " +
		"An attempted migration to a supported specification version failed, likely due to unrecognized " +
		"configuration. Check verbose log for details.",
		"Threw with expected error message");
});

test("Migrate legacy module: specVersion 1.0", async (t) => {
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

	t.is(project.getSpecVersion().toString(), "2.6", "Project got migrated to latest specVersion");
});

test("Migrate legacy module: specVersion 0.1", async (t) => {
	const project = await Specification.create({
		id: "my.task",
		version: "3.4.7-beta",
		modulePath: genericExtensionPath,
		configuration: {
			specVersion: "0.1",
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

	t.is(project.getSpecVersion().toString(), "2.6", "Project got migrated to latest specVersion");
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

	t.is(project.getSpecVersion().toString(), "2.6", "Project got migrated to latest specVersion");
});

[{
	kind: "project",
	type: "application",
	modulePath: applicationAPath,
	SpecificationClass: Application
}, {
	kind: "project",
	type: "library",
	modulePath: libraryHPath,
	SpecificationClass: Library
}, {
	kind: "project",
	type: "theme-library",
	modulePath: themeLibraryEPath,
	SpecificationClass: ThemeLibrary
}, {
	kind: "project",
	type: "module",
	modulePath: moduleAPath,
	SpecificationClass: Module
}, {
	kind: "extension",
	type: "task",
	modulePath: genericExtensionPath,
	SpecificationClass: Task
}, {
	kind: "extension",
	type: "project-shim",
	modulePath: genericExtensionPath,
	SpecificationClass: ProjectShim
}, {
	kind: "extension",
	type: "server-middleware",
	modulePath: genericExtensionPath,
	SpecificationClass: ServerMiddleware
}].forEach(({kind, type, modulePath, SpecificationClass}) => {
	test(`create: kind '${kind}', type '${type}'`, async (t) => {
		const additionalConfiguration = {};
		if (type === "task") {
			additionalConfiguration.task = {path: "lib/middleware.js"};
		} else if (type === "server-middleware") {
			additionalConfiguration.middleware = {path: "lib/middleware.js"};
		} else if (type === "project-shim") {
			additionalConfiguration.shims = {};
		}
		const project = await Specification.create({
			id: `${type}.a.id`,
			version: "1.0.0",
			modulePath,
			configuration: {
				specVersion: "2.6",
				kind,
				type,
				metadata: {
					name: `${type}.a`
				},
				...additionalConfiguration
			}
		});
		t.true(project instanceof SpecificationClass);
	});
});

test("create: Missing configuration", async (t) => {
	await t.throwsAsync(Specification.create({
		id: "application.a.id",
		version: "1.0.0",
	}), {
		message: "Unable to create Specification instance: Missing configuration parameter"
	});
});

test("create: Unknown kind", async (t) => {
	await t.throwsAsync(Specification.create({
		configuration: {
			kind: "foo",
		}
	}), {
		message: "Unable to create Specification instance: Unknown kind 'foo'"
	});
});

test("create: Unknown type", async (t) => {
	await t.throwsAsync(Specification.create({
		configuration: {
			kind: "project",
			type: "foo"
		}
	}), {
		message: "Unable to create Specification instance: Unknown specification type 'foo'"
	});
});

test("Invalid specVersion", async (t) => {
	t.context.basicProjectInput.configuration.specVersion = "0.5";
	await t.throwsAsync(Specification.create(t.context.basicProjectInput), {
		message:
		"Unsupported Specification Version 0.5 defined. Your UI5 CLI installation might be outdated. " +
		"For details, see https://sap.github.io/ui5-tooling/pages/Configuration/#specification-versions"
	}, "Threw with expected error message");
});

test("getRootReader: Default parameters", async (t) => {
	// Since Specification#create instantiates a far-away subclass, it would be a mess to mock
	// every class up to "Specification.js" just to stub the resourceFactory's createReader method
	// Therefore we just come up with our own subclass that can be instantiated right away:

	const createReaderStub = sinon.stub();
	const Specification = await esmock("../../../lib/specifications/Specification.js", {
		"@ui5/fs/resourceFactory": {
			createReader: createReaderStub
		}
	});

	const MockSpecification = createSubclass(Specification);
	const spec = new MockSpecification();
	await spec.getRootReader();

	t.is(createReaderStub.callCount, 1, "createReader got called once");
	t.deepEqual(createReaderStub.getCall(0).args[0], {
		fsBasePath: "path",
		name: "Root reader for type kind name",
		useGitignore: true,
		virBasePath: "/",
	}, "createReader got called with expected arguments");
});

test("getRootReader: Custom parameters", async (t) => {
	const createReaderStub = sinon.stub();
	const Specification = await esmock("../../../lib/specifications/Specification.js", {
		"@ui5/fs/resourceFactory": {
			createReader: createReaderStub
		}
	});

	const MockSpecification = createSubclass(Specification);
	const spec = new MockSpecification();
	await spec.getRootReader({});
	await spec.getRootReader({
		useGitignore: false
	});


	t.is(createReaderStub.callCount, 2, "createReader got called twice");
	t.deepEqual(createReaderStub.getCall(0).args[0], {
		fsBasePath: "path",
		name: "Root reader for type kind name",
		useGitignore: true,
		virBasePath: "/",
	}, "createReader got called with expected arguments on first call");

	t.deepEqual(createReaderStub.getCall(1).args[0], {
		fsBasePath: "path",
		name: "Root reader for type kind name",
		useGitignore: false,
		virBasePath: "/",
	}, "createReader got called with expected arguments on second call");
});
