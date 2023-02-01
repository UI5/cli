import test from "ava";
import path from "node:path";
import {fileURLToPath} from "node:url";
import chalk from "chalk";
import Specification from "../../../lib/specifications/Specification.js";

function clone(obj) {
	return JSON.parse(JSON.stringify(obj));
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
	t.is(error.message, `${chalk.red("Invalid ui5.yaml configuration for project application.a.id")}

Configuration \
${chalk.underline(chalk.red("resources/configuration/propertiesFileSourceEncoding"))} \
must be equal to one of the allowed values
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

test("getFramework*: Defaults", async (t) => {
	const customProjectInput = clone(basicProjectInput);
	const project = await Specification.create(customProjectInput);
	t.is(project.getFrameworkName(), undefined, "Returned correct framework name");
	t.is(project.getFrameworkVersion(), undefined, "Returned correct framework version");
	t.deepEqual(project.getFrameworkDependencies(), [], "Returned correct framework dependencies");
	t.false(project.isFrameworkProject(), "Is not a framework project");
});

test("getFramework* configurations", async (t) => {
	const customProjectInput = clone(basicProjectInput);
	customProjectInput.configuration.framework = {
		name: "OpenUI5",
		version: "1.111.1",
		libraries: [
			{name: "lib-1"},
			{name: "lib-2"},
		]
	};
	customProjectInput.id = "@openui5/" + customProjectInput.id;
	const project = await Specification.create(customProjectInput);
	t.is(project.getFrameworkName(), "OpenUI5", "Returned correct framework name");
	t.is(project.getFrameworkVersion(), "1.111.1", "Returned correct framework version");
	t.deepEqual(project.getFrameworkDependencies(), [
		{name: "lib-1"},
		{name: "lib-2"}
	], "Returned correct framework dependencies");
	t.true(project.isFrameworkProject(), "Is a framework project");
});

test("isFrameworkProject: sapui5", async (t) => {
	const customProjectInput = clone(basicProjectInput);
	customProjectInput.id = "@sapui5/" + customProjectInput.id;
	const project = await Specification.create(customProjectInput);
	t.true(project.isFrameworkProject(), "Is a framework project");
});

test("isDeprecated/isSapInternal: Defaults", async (t) => {
	const customProjectInput = clone(basicProjectInput);

	const project = await Specification.create(customProjectInput);
	t.false(project.isDeprecated(), "Is not deprecated");
	t.false(project.isSapInternal(), "Is not SAP-internal");
	t.false(project.getAllowSapInternal(), "Does not allow SAP-internal");
});

test("isDeprecated/isSapInternal: True", async (t) => {
	const customProjectInput = clone(basicProjectInput);
	customProjectInput.configuration.metadata.deprecated = true;
	customProjectInput.configuration.metadata.sapInternal = true;
	customProjectInput.configuration.metadata.allowSapInternal = true;
	const project = await Specification.create(customProjectInput);
	t.true(project.isDeprecated(), "Is deprecated");
	t.true(project.isSapInternal(), "Is SAP-internal");
	t.true(project.getAllowSapInternal(), "Does allow SAP-internal");
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

test("getBuildManifest", async (t) => {
	const projectWithoutBuildManifest = await Specification.create(clone(basicProjectInput));
	t.is(projectWithoutBuildManifest.getBuildManifest(), null, "Project has a no build manifest");

	const customProjectInput = clone(basicProjectInput);
	customProjectInput.buildManifest = "buildManifest";
	const project = await Specification.create(customProjectInput);
	t.is(project.getBuildManifest(), "buildManifest", "Returned correct build manifest");
});

// == Most functionality is tested in the specific types
