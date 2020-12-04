const test = require("ava");
const path = require("path");
const sinon = require("sinon");
const Specification = require("../../../lib/specifications/Specification");

function clone(o) {
	return JSON.parse(JSON.stringify(o));
}

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

test.afterEach.always((t) => {
	sinon.restore();
});

test("getPropertiesFileSourceEncoding: Default", async (t) => {
	const project = await Specification.create(basicProjectInput);
	t.is(project.getPropertiesFileSourceEncoding(), "UTF-8",
		"Returned correct default propertiesFileSourceEncoding configuration");
});

test("getPropertiesFileSourceEncoding: Configuration", async (t) => {
	const customProjectInput = clone(basicProjectInput);
	customProjectInput.configuration.resources = {
		configuration: {
			propertiesFileSourceEncoding: "ISO-8859-1"
		}
	};
	const project = await Specification.create(customProjectInput);
	t.is(project.getPropertiesFileSourceEncoding(), "ISO-8859-1",
		"Returned correct default propertiesFileSourceEncoding configuration");
});

test("hasMavenPlaceholder: has maven placeholder", async (t) => {
	const project = await Specification.create(basicProjectInput);
	const res = project._hasMavenPlaceholder("${mvn-pony}");
	t.true(res, "String has maven placeholder");
});

test("hasMavenPlaceholder: has no maven placeholder", async (t) => {
	const project = await Specification.create(basicProjectInput);

	const res = project._hasMavenPlaceholder("$mvn-pony}");
	t.false(res, "String has no maven placeholder");
});

test("_resolveMavenPlaceholder: resolves maven placeholder from first POM level", async (t) => {
	const project = await Specification.create(basicProjectInput);
	sinon.stub(project, "_getPom").resolves({
		project: {
			properties: {
				"mvn-pony": "unicorn"
			}
		}
	});

	const res = await project._resolveMavenPlaceholder("${mvn-pony}");
	t.deepEqual(res, "unicorn", "Resolved placeholder correctly");
});

test("_resolveMavenPlaceholder: resolves maven placeholder from deeper POM level", async (t) => {
	const project = await Specification.create(basicProjectInput);
	sinon.stub(project, "_getPom").resolves({
		"mvn-pony": {
			some: {
				id: "unicorn"
			}
		}
	});

	const res = await project._resolveMavenPlaceholder("${mvn-pony.some.id}");
	t.deepEqual(res, "unicorn", "Resolved placeholder correctly");
});

test("_resolveMavenPlaceholder: can't resolve from POM", async (t) => {
	const project = await Specification.create(basicProjectInput);
	sinon.stub(project, "_getPom").resolves({});

	const err = await t.throwsAsync(project._resolveMavenPlaceholder("${mvn-pony}"));
	t.deepEqual(err.message,
		`"\${mvn-pony}" couldn't be resolved from maven property "mvn-pony" ` +
		`of pom.xml of project application.a`,
		"Rejected with correct error message");
});

test("_resolveMavenPlaceholder: provided value is no placeholder", async (t) => {
	const project = await Specification.create(basicProjectInput);

	const err = await t.throwsAsync(project._resolveMavenPlaceholder("My ${mvn-pony}"));
	t.deepEqual(err.message,
		`"My \${mvn-pony}" is not a maven placeholder`,
		"Rejected with correct error message");
});

test("_getPom: reads correctly", async (t) => {
	const projectInput = clone(basicProjectInput);
	// Application H contains a pom.xml
	const applicationHPath = path.join(__dirname, "..", "..", "fixtures", "application.h");
	projectInput.modulePath = applicationHPath;
	projectInput.configuration.metadata.name = "application.h";
	const project = await Specification.create(projectInput);

	const res = await project._getPom();
	t.deepEqual(res.project.modelVersion, "4.0.0", "pom.xml content has been read");
});

test.serial("_getPom: fs read error", async (t) => {
	const project = await Specification.create(basicProjectInput);
	project.getRootReader = () => {
		return {
			byPath: async () => {
				throw new Error("EPON: Pony Error");
			}
		};
	};
	const error = await t.throwsAsync(project._getPom());
	t.deepEqual(error.message,
		"Failed to read pom.xml for project application.a: " +
		"EPON: Pony Error",
		"Rejected with correct error message");
});

test.serial("_getPom: result is cached", async (t) => {
	const project = await Specification.create(basicProjectInput);

	const byPathStub = sinon.stub().resolves({
		getString: async () => `<pony>no unicorn</pony>`
	});

	project.getRootReader = () => {
		return {
			byPath: byPathStub
		};
	};

	let res = await project._getPom();
	t.deepEqual(res, {pony: "no unicorn"}, "Correct result on first call");
	res = await project._getPom();
	t.deepEqual(res, {pony: "no unicorn"}, "Correct result on second call");

	t.deepEqual(byPathStub.callCount, 1, "getRootReader().byPath got called exactly once (and then cached)");
});
