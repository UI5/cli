import path from "node:path";
import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import jsdocGenerator from "../../../../lib/processors/jsdoc/jsdocGenerator.js";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);

import {fileURLToPath} from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.serial("generateJsdocConfig", async (t) => {
	const res = await jsdocGenerator._generateJsdocConfig({
		sourcePath: "/some/source/path",
		targetPath: "/some/target/path",
		tmpPath: "/some/tm\\p/path",
		namespace: "some/namespace",
		projectName: "some.projectName",
		version: "1.0.0",
		variants: ["apijson"]
	});

	const jsdocGeneratorPath = path.resolve(__dirname, "..", "..", "..", "..", "lib", "processors",
		"jsdoc");

	const backslashRegex = /\\/g;

	const pluginPath = path.join(jsdocGeneratorPath, "lib", "ui5", "plugin.cjs")
		.replace(backslashRegex, "\\\\");
	const templatePath = "@ui5/builder/internal/jsdoc/template";
	const destinationPath = path.join("/", "some", "tm\\p", "path")
		.replace(backslashRegex, "\\\\");
	const jsapiFilePath = path.join("/", "some", "target", "path", "libraries", "some.projectName.js")
		.replace(backslashRegex, "\\\\");
	const apiJsonFolderPath = path.join("/", "some", "tm\\p", "path", "dependency-apis")
		.replace(backslashRegex, "\\\\");
	const apiJsonFilePath =
		path.join("/", "some", "target", "path", "test-resources", "some", "namespace", "designtime", "api.json")
			.replace(backslashRegex, "\\\\");


	t.is(res, `{
		"plugins": ["${pluginPath}"],
		"opts": {
			"recurse": true,
			"lenient": true,
			"template": "${templatePath}",
			"ui5": {
				"saveSymbols": true
			},
			"destination": "${destinationPath}"
		},
		"templates": {
			"ui5": {
				"variants": ["apijson"],
				"version": "1.0.0",
				"uilib": "some.namespace",
				"jsapiFile": "${jsapiFilePath}",
				"apiJsonFolder": "${apiJsonFolderPath}",
				"apiJsonFile": "${apiJsonFilePath}"
			}
		}
	}`, "Correct config generated");
});

test.serial("writeJsdocConfig", async (t) => {
	const jsdocGenerator = await esmock("../../../../lib/processors/jsdoc/jsdocGenerator.js", {
		"graceful-fs": {
			writeFile: (configPath, configContent, callback) => {
				t.deepEqual(configPath, path.join("/", "some", "path", "jsdoc-config.json"),
					"Correct config path supplied");
				t.is(configContent, "some config", "Correct config content supplied");
				callback();
			}
		}});

	const res = await jsdocGenerator._writeJsdocConfig("/some/path", "some config");

	t.deepEqual(res, path.join("/", "some", "path", "jsdoc-config.json"), "Correct config path returned");
});

test.serial("buildJsdoc", async (t) => {
	let exitCode = 0;
	const cpStub = sinon.stub().returns({
		on: (event, callback) => {
			callback(exitCode);
		}
	});

	const jsdocGenerator = await esmock("../../../../lib/processors/jsdoc/jsdocGenerator.js", {
		"node:child_process": {
			spawn: cpStub
		}
	});

	await jsdocGenerator._buildJsdoc({
		sourcePath: "/some/path",
		configPath: "/some/config/path/jsdoc-config.json"
	});
	t.is(cpStub.callCount, 1, "Spawn got called");

	const firstCallArgs = cpStub.getCall(0).args;
	t.is(firstCallArgs[0], "node", "Spawn got called with correct process argument");
	t.deepEqual(firstCallArgs[1], [
		require.resolve("jsdoc/jsdoc.js"),
		"-c",
		"/some/config/path/jsdoc-config.json",
		"--verbose",
		"/some/path"
	], "Spawn got called with correct arguments");


	// Re-execute with exit code 1
	exitCode = 1;
	await t.throwsAsync(jsdocGenerator._buildJsdoc({
		sourcePath: "/some/path",
		configPath: "/some/config/path/jsdoc-config.json"
	}), {
		message: "JSDoc reported an error, check the log for issues (exit code: 1)"
	});

	// Re-execute with exit code 2
	exitCode = 2;
	const error = await t.throwsAsync(jsdocGenerator._buildJsdoc({
		sourcePath: "/some/path",
		configPath: "/some/config/path/jsdoc-config.json"
	}));
	t.is(error.message, "JSDoc reported an error, check the log for issues (exit code: 2)");
});

test.serial("jsdocGenerator", async (t) => {
	const byPathStub = sinon.stub().resolves("some resource");
	const createAdapterStub = sinon.stub().returns({
		byPath: byPathStub
	});

	const jsdocGenerator = await esmock("../../../../lib/processors/jsdoc/jsdocGenerator.js", {
		"@ui5/fs/resourceFactory": {
			createAdapter: createAdapterStub
		}
	});

	const generateJsdocConfigStub = sinon.stub(jsdocGenerator, "_generateJsdocConfig").resolves("some config");
	const writeJsdocConfigStub = sinon.stub(jsdocGenerator, "_writeJsdocConfig").resolves("/some/config/path");
	const buildJsdocStub = sinon.stub(jsdocGenerator, "_buildJsdoc").resolves();

	const res = await jsdocGenerator({
		sourcePath: "/some/source/path",
		targetPath: "/some/target/path",
		tmpPath: "/some/tmp/path",
		options: {
			projectName: "some.project.name",
			namespace: "some/project/name",
			version: "1.0.0"
		}
	});

	t.is(res.length, 1, "Returned 1 resource");
	t.is(res[0], "some resource", "Returned 1 resource");

	t.is(generateJsdocConfigStub.callCount, 1, "generateJsdocConfig called once");
	t.deepEqual(generateJsdocConfigStub.getCall(0).args[0], {
		targetPath: "/some/target/path",
		tmpPath: "/some/tmp/path",
		namespace: "some/project/name",
		projectName: "some.project.name",
		version: "1.0.0",
		variants: ["apijson"]
	}, "generateJsdocConfig called with correct arguments");

	t.is(writeJsdocConfigStub.callCount, 1, "writeJsdocConfig called once");
	t.is(writeJsdocConfigStub.getCall(0).args[0], "/some/tmp/path",
		"writeJsdocConfig called with correct tmpPath argument");
	t.is(writeJsdocConfigStub.getCall(0).args[1], "some config",
		"writeJsdocConfig called with correct config argument");

	t.is(buildJsdocStub.callCount, 1, "buildJsdoc called once");
	t.deepEqual(buildJsdocStub.getCall(0).args[0], {
		sourcePath: "/some/source/path",
		configPath: "/some/config/path"
	}, "buildJsdoc called with correct arguments");

	t.deepEqual(createAdapterStub.getCall(0).args[0], {
		fsBasePath: "/some/target/path",
		virBasePath: "/"
	}, "createAdapter called with correct arguments");
	t.is(byPathStub.getCall(0).args[0], "/test-resources/some/project/name/designtime/api.json",
		"byPath called with correct path for api.json");


	/* Test branch: empty variants array*/
	await jsdocGenerator({
		sourcePath: "/some/source/path",
		targetPath: "/some/target/path",
		tmpPath: "/some/tmp/path",
		options: {
			projectName: "some.project.name",
			namespace: "some/project/name",
			version: "1.0.0",
			variants: []
		}
	});

	t.deepEqual(generateJsdocConfigStub.getCall(1).args[0].variants, ["apijson"],
		"generateJsdocConfig called with correct variants arguments");


	/* Test branch: variants array set + sdkBuild requested*/
	await jsdocGenerator({
		sourcePath: "/some/source/path",
		targetPath: "/some/target/path",
		tmpPath: "/some/tmp/path",
		options: {
			projectName: "some.project.name",
			namespace: "some/project/name",
			version: "1.0.0",
			variants: ["pony"],
			sdkBuild: true
		}
	});

	t.deepEqual(generateJsdocConfigStub.getCall(2).args[0].variants, ["pony"],
		"generateJsdocConfig called with correct variants arguments");

	sinon.restore();
});

test("jsdocGenerator missing parameters", async (t) => {
	await t.throwsAsync(jsdocGenerator(), {
		instanceOf: TypeError
	}, "TypeError thrown");
});
