const test = require("ava");
const path = require("path");
const Specification = require("../../../lib/specifications/Specification");

function clone(obj) {
	return JSON.parse(JSON.stringify(obj));
}

const applicationAPath = path.join(__dirname, "..", "..", "fixtures", "application.a");
const basicProjectInput = {
	id: "application.a.id",
	version: "1.0.0",
	modulePath: applicationAPath,
	configuration: {
		specVersion: "2.6",
		kind: "project",
		type: "application",
		metadata: {name: "application.a"}
	}
};

test("Invalid configuration", async (t) => {
	const customProjectInput = clone(basicProjectInput);
	customProjectInput.configuration.resources = {
		configuration: {
			propertiesFileSourceEncoding: "Ponycode"
		}
	};
	const error = await t.throwsAsync(Specification.create(customProjectInput));
	t.is(error.message, `Invalid ui5.yaml configuration for project application.a.id

Configuration resources/configuration/propertiesFileSourceEncoding must be equal to one of the allowed values
Allowed values: UTF-8, ISO-8859-1`, "Threw with validation error");
});

test("getCustomTasks", async (t) => {
	const customProjectInput = clone(basicProjectInput);
	customProjectInput.configuration.builder = {
		customTasks: [{
			name: "myTask",
			beforeTask: "minify",
			configuration: {
				color: "orange"
			}
		}]
	};
	const project = await Specification.create(customProjectInput);
	t.deepEqual(project.getCustomTasks(), [{
		name: "myTask",
		beforeTask: "minify",
		configuration: {
			color: "orange"
		}
	}], "Returned correct custom task configuration");
});

test("getCustomMiddleware", async (t) => {
	const customProjectInput = clone(basicProjectInput);
	customProjectInput.configuration.server = {
		customMiddleware: [{
			name: "myMiddleware",
			mountPath: "/app",
			afterMiddleware: "compression",
			configuration: {
				color: "orange"
			}
		}]
	};
	const project = await Specification.create(customProjectInput);
	t.deepEqual(project.getCustomMiddleware(), [{
		name: "myMiddleware",
		mountPath: "/app",
		afterMiddleware: "compression",
		configuration: {
			color: "orange"
		}
	}], "Returned correct custom middleware configuration");
});

test("getCustomTasks/getCustomMiddleware defaults", async (t) => {
	const customProjectInput = clone(basicProjectInput);
	const project = await Specification.create(customProjectInput);
	t.deepEqual(project.getCustomTasks(), [],
		"Returned correct default value for custom task configuration");
	t.deepEqual(project.getCustomMiddleware(), [],
		"Returned correct default value for custom middleware configuration");
});

test("getServerSettings", async (t) => {
	const customProjectInput = clone(basicProjectInput);
	customProjectInput.configuration.server = {
		settings: {
			httpPort: 1337
		}
	};
	const project = await Specification.create(customProjectInput);
	t.deepEqual(project.getServerSettings(), {
		httpPort: 1337
	}, "Returned correct server settings");
});

test("getBuilderSettings", async (t) => {
	const customProjectInput = clone(basicProjectInput);
	customProjectInput.configuration.builder = {
		settings: {
			includeDependency: ["my-lib"]
		}
	};
	const project = await Specification.create(customProjectInput);
	t.deepEqual(project.getBuilderSettings(), {
		includeDependency: ["my-lib"]
	}, "Returned correct build settings");
});

test("has-/getBuildManifest", async (t) => {
	const projectWithoutBuildManifest = await Specification.create(clone(basicProjectInput));
	t.false(projectWithoutBuildManifest.hasBuildManifest(), "Project has a no build manifest");
	t.deepEqual(projectWithoutBuildManifest.getBuildManifest(), {}, "Project has a no build manifest");

	const customProjectInput = clone(basicProjectInput);
	customProjectInput.buildManifest = "buildManifest";
	const project = await Specification.create(customProjectInput);
	t.true(project.hasBuildManifest(), "Project has a build manifest");
	t.is(project.getBuildManifest(), "buildManifest", "Returned correct build manifest");
});

// == Most functionality is tested in the specific types
