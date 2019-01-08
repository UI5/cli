const {test} = require("ava");
const path = require("path");
const chai = require("chai");
const sinon = require("sinon");
chai.use(require("chai-fs"));

test.afterEach.always((t) => {
	sinon.restore();
});

const ModuleFormatter = require("../../../../lib/types/module/ModuleFormatter");

function clone(o) {
	return JSON.parse(JSON.stringify(o));
}

const moduleAPath = path.join(__dirname, "..", "..", "..", "fixtures", "module.a");
const moduleATree = {
	id: "module.a",
	version: "1.0.0",
	path: path.join(moduleAPath),
	dependencies: [],
	_level: 1,
	specVersion: "0.1",
	type: "module",
	metadata: {
		name: "module.d",
		copyright: "Some fancy copyright"
	},
	resources: {
		configuration: {
			paths: {
				"/": "dist",
				"/dev": "dev"
			}
		}
	}
};

test("validate: ok", async (t) => {
	const myProject = clone(moduleATree);
	const moduleFormatter = new ModuleFormatter();

	await t.notThrows(moduleFormatter.validate(myProject));
});

test("validate: project not defined", async (t) => {
	const moduleFormatter = new ModuleFormatter();

	const error = await t.throws(moduleFormatter.validate(null));
	t.deepEqual(error.message, "Project is undefined", "Correct exception thrown");
});

test("validate: empty version", async (t) => {
	const myProject = clone(moduleATree);
	myProject.version = undefined;
	const applicationFormatter = new ModuleFormatter();

	const error = await t.throws(applicationFormatter.validate(myProject));
	t.deepEqual(error.message, `"version" is missing for project module.a`, "Correct exception thrown");
});

test("validate: empty type", async (t) => {
	const myProject = clone(moduleATree);
	myProject.type = undefined;
	const applicationFormatter = new ModuleFormatter();

	const error = await t.throws(applicationFormatter.validate(myProject));
	t.deepEqual(error.message, `"type" configuration is missing for project module.a`, "Correct exception thrown");
});


test("validate: empty metadata", async (t) => {
	const myProject = clone(moduleATree);
	myProject.metadata = undefined;
	const applicationFormatter = new ModuleFormatter();

	const error = await t.throws(applicationFormatter.validate(myProject));
	t.deepEqual(error.message, `"metadata.name" configuration is missing for project module.a`,
		"Correct exception thrown");
});

test("validate: empty resources", async (t) => {
	const myProject = clone(moduleATree);
	myProject.resources = undefined;
	const moduleFormatter = new ModuleFormatter();
	sinon.stub(moduleFormatter, "dirExists").resolves(true);

	await moduleFormatter.validate(myProject);
	t.deepEqual(myProject.resources.configuration.paths, {
		"/": ""
	}, "Defaulted to correct resource path configuration");
});

test("validate: first configured directory does not exist", async (t) => {
	const myProject = clone(moduleATree);
	const moduleFormatter = new ModuleFormatter();
	const dirExists = sinon.stub(moduleFormatter, "dirExists");
	dirExists.onFirstCall().resolves(false);
	dirExists.onSecondCall().resolves(true);

	const error = await t.throws(moduleFormatter.validate(myProject));
	t.regex(error.message, /^Could not find "\/" directory of project module.a at (?!(undefined))+/,
		"Correct exception thrown");
});

test("validate: second configured directory does not exist", async (t) => {
	const myProject = clone(moduleATree);
	const moduleFormatter = new ModuleFormatter();
	const dirExists = sinon.stub(moduleFormatter, "dirExists");
	dirExists.onFirstCall().resolves(true);
	dirExists.onSecondCall().resolves(false);

	const error = await t.throws(moduleFormatter.validate(myProject));
	t.regex(error.message, /^Could not find "\/dev" directory of project module.a at (?!(undefined))+/,
		"Correct exception thrown");
});


test("format: pass through", async (t) => {
	const myProject = clone(moduleATree);
	const moduleFormatter = new ModuleFormatter();
	sinon.stub(moduleFormatter, "validate").resolves();

	await moduleFormatter.format(myProject);
	t.deepEqual(myProject.resources.pathMappings, {
		"/": "dist",
		"/dev": "dev",
	}, "path mappings correctly set");
});
