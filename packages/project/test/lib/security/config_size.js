import test from "ava";
import path from "node:path";
import os from "node:os";
import {mkdtemp, mkdir, rm, writeFile} from "node:fs/promises";
import Module from "../../../lib/graph/Module.js";
import Specification from "../../../lib/specifications/Specification.js";
import {getDefaults, validate} from "../../../lib/validation/validator.js";
import {setLimit} from "../utils/__helper__/limits.js";

const configuration = {
	specVersion: "4.0", kind: "project", type: "application", metadata: {name: "size.test"}
};
const basicYaml = "specVersion: \"4.0\"\ntype: application\nmetadata:\n  name: size.test\n";

async function createProject(t, files) {
	const projectDir = await mkdtemp(path.join(os.tmpdir(), "ui5-config-size-"));
	t.teardown(() => rm(projectDir, {recursive: true, force: true}));
	for (const [relativePath, content] of Object.entries(files)) {
		const filePath = path.join(projectDir, relativePath);
		await mkdir(path.dirname(filePath), {recursive: true});
		await writeFile(filePath, content);
	}
	return {id: "size.test", version: "1.0.0", modulePath: projectDir};
}

test.before(async () => {
	// Compile bundled schemas before small JSON limits apply to project input.
	const previous = process.env.UI5_JSON_MAX_DEPTH;
	delete process.env.UI5_JSON_MAX_DEPTH;
	try {
		await validate({config: configuration, project: {id: "size.test"}});
		await getDefaults({config: configuration, project: {id: "size.test"}});
	} finally {
		if (previous === undefined) {
			delete process.env.UI5_JSON_MAX_DEPTH;
		} else {
			process.env.UI5_JSON_MAX_DEPTH = previous;
		}
	}
});

for (const absolute of [false, true]) {
	test.serial(`YAML whole-file byte boundary (absolute: ${absolute})`, async (t) => {
		const yaml = `${basicYaml}---\n${basicYaml}`;
		const input = await createProject(t, {"ui5.yaml": yaml});
		if (absolute) {
			input.configPath = path.join(input.modulePath, "ui5.yaml");
		}
		setLimit(t, "UI5_CONFIG_MAX_BYTES", Buffer.byteLength(yaml));
		t.is((await new Module(input)._readConfigFile()).length, 2);
		process.env.UI5_CONFIG_MAX_BYTES = String(Buffer.byteLength(yaml) - 1);
		const error = await t.throwsAsync(new Module(input)._readConfigFile(), {code: "ERR_CONFIG_TOO_LARGE"});
		t.true(error.message.includes(input.configPath || "ui5.yaml"));
		t.true(error.message.includes(`${Buffer.byteLength(yaml) - 1} bytes`));
	});
}

for (const collection of ["array", "object"]) {
	test.serial(`YAML ${collection} boundary reaches validation and defaults`, async (t) => {
		setLimit(t, "UI5_CONFIG_MAX_COLLECTION", 10);
		const value = collection === "array" ? {entries: Array(10).fill(1)} :
			Object.fromEntries(Array.from({length: 10}, (_, i) => [`key${i}`, i]));
		const yaml = `${basicYaml}customConfiguration: ${JSON.stringify(value)}\n`;
		const input = await createProject(t, {"ui5.yaml": yaml,
			"webapp/manifest.json": "{\"sap.app\":{\"id\":\"size.test\"}}"});
		const {project} = await new Module(input).getSpecifications();
		t.is(project.getNamespace(), "size/test");
		const [config] = await new Module(input)._readConfigFile();
		const defaulted = await getDefaults({config, project: {id: input.id}});
		t.deepEqual(defaulted.config.customConfiguration, value);
		process.env.UI5_CONFIG_MAX_COLLECTION = "9";
		await t.throwsAsync(new Module(input).getSpecifications(), {
			code: "ERR_CONFIG_COLLECTION_TOO_LARGE",
			message: new RegExp("ui5.yaml.*maximum collection size of 9")
		});
	});
}

for (const limit of [5, 100]) {
	test.serial(`YAML nesting below and above cap ${limit}`, async (t) => {
		setLimit(t, "UI5_CONFIG_MAX_DEPTH", limit);
		const yaml = (depth) => `${basicYaml}customConfiguration: {deep: ${"[".repeat(depth)}0${"]".repeat(depth)}}\n`;
		const input = await createProject(t, {"ui5.yaml": yaml(limit - 3)});
		t.is((await new Module(input)._readConfigFile()).length, 1);
		await writeFile(path.join(input.modulePath, "ui5.yaml"), yaml(limit - 2));
		const error = await t.throwsAsync(new Module(input)._readConfigFile(), {code: "ERR_CONFIG_TOO_DEEP"});
		t.true(error.message.includes("ui5.yaml"));
		t.true(error.message.includes(`nesting exceeded maxDepth (${limit})`));
	});
}

test.serial("Manifest byte boundary through Specification.create", async (t) => {
	const manifest = JSON.stringify({"sap.app": {id: "size.test"}, "description": String.fromCharCode(233)});
	const input = await createProject(t, {"webapp/manifest.json": manifest});
	setLimit(t, "UI5_MANIFEST_MAX_BYTES", Buffer.byteLength(manifest));
	const project = await Specification.create({...input, configuration});
	t.is(project.getNamespace(), "size/test");
	process.env.UI5_MANIFEST_MAX_BYTES = String(Buffer.byteLength(manifest) - 1);
	await t.throwsAsync(Specification.create({...input, configuration}), {
		code: "ERR_CONFIG_TOO_LARGE", message: new RegExp("webapp/manifest.json.*maximum size")
	});
});

test.serial("Manifest depth boundary and 20000-level input through Specification.create", async (t) => {
	setLimit(t, "UI5_JSON_MAX_DEPTH", 5);
	const manifest = (depth) => "{\"sap.app\":{\"id\":\"size.test\"},\"deep\":" +
		"[".repeat(depth) + "0" + "]".repeat(depth) + "}";
	const input = await createProject(t, {"webapp/manifest.json": manifest(4)});
	const project = await Specification.create({...input, configuration});
	t.is(project.getNamespace(), "size/test");
	for (const depth of [5, 20000]) {
		await writeFile(path.join(input.modulePath, "webapp/manifest.json"), manifest(depth));
		await t.throwsAsync(Specification.create({...input, configuration}), {
			code: "ERR_CONFIG_TOO_DEEP", message: new RegExp("webapp/manifest.json.*maximum JSON nesting depth of 5")
		});
	}
});
