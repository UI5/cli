import test from "ava";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sinon from "sinon";
import Specification from "../../../lib/specifications/Specification.js";

function clone(o) {
	return JSON.parse(JSON.stringify(o));
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

test.afterEach.always((t) => {
	sinon.restore();
});

test("Default getters", async (t) => {
	const project = await Specification.create(basicProjectInput);
	t.is(project.getPropertiesFileSourceEncoding(), "UTF-8",
		"Returned correct default propertiesFileSourceEncoding configuration");
	t.is(project.getCopyright(), undefined,
		"Returned correct default copyright configuration");
	t.deepEqual(project.getComponentPreloadPaths(), [],
		"Returned correct default componentPreloadPaths configuration");
	t.deepEqual(project.getComponentPreloadNamespaces(), [],
		"Returned correct default componentPreloadNamespaces configuration");
	t.deepEqual(project.getComponentPreloadExcludes(), [],
		"Returned correct default componentPreloadExcludes configuration");
	t.deepEqual(project.getMinificationExcludes(), [],
		"Returned correct default minificationExcludes configuration");
	t.deepEqual(project.getBundles(), [],
		"Returned correct default bundles configuration");
});

test("getPropertiesFileSourceEncoding", async (t) => {
	const customProjectInput = clone(basicProjectInput);
	customProjectInput.configuration.resources = {
		configuration: {
			propertiesFileSourceEncoding: "ISO-8859-1"
		}
	};
	const project = await Specification.create(customProjectInput);
	t.is(project.getPropertiesFileSourceEncoding(), "ISO-8859-1",
		"Returned correct propertiesFileSourceEncoding configuration");
});

test("getCopyright", async (t) => {
	const customProjectInput = clone(basicProjectInput);
	customProjectInput.configuration.metadata.copyright = "copyright";
	const project = await Specification.create(customProjectInput);
	t.is(project.getCopyright(), "copyright",
		"Returned correct copyright configuration");
});

test("getComponentPreloadPaths", async (t) => {
	const customProjectInput = clone(basicProjectInput);
	customProjectInput.configuration.builder = {
		componentPreload: {
			paths: ["paths"]
		}
	};
	const project = await Specification.create(customProjectInput);
	t.deepEqual(project.getComponentPreloadPaths(), ["paths"],
		"Returned correct componentPreloadPaths configuration");
});

test("getComponentPreloadNamespaces", async (t) => {
	const customProjectInput = clone(basicProjectInput);
	customProjectInput.configuration.builder = {
		componentPreload: {
			namespaces: ["namespaces"]
		}
	};
	const project = await Specification.create(customProjectInput);
	t.deepEqual(project.getComponentPreloadNamespaces(), ["namespaces"],
		"Returned correct componentPreloadNamespaces configuration");
});

test("getComponentPreloadExcludes", async (t) => {
	const customProjectInput = clone(basicProjectInput);
	customProjectInput.configuration.builder = {
		componentPreload: {
			excludes: ["excludes"]
		}
	};
	const project = await Specification.create(customProjectInput);
	t.deepEqual(project.getComponentPreloadExcludes(), ["excludes"],
		"Returned correct componentPreloadExcludes configuration");
});

test("getMinificationExcludes", async (t) => {
	const customProjectInput = clone(basicProjectInput);
	customProjectInput.configuration.builder = {
		minification: {
			excludes: ["excludes"]
		}
	};
	const project = await Specification.create(customProjectInput);
	t.deepEqual(project.getMinificationExcludes(), ["excludes"],
		"Returned correct minificationExcludes configuration");
});

test("getBundles", async (t) => {
	const customProjectInput = clone(basicProjectInput);
	customProjectInput.configuration.builder = {
		bundles: [{bundleDefinition: {name: "bundle"}}]
	};
	const project = await Specification.create(customProjectInput);
	t.deepEqual(project.getBundles(), [{bundleDefinition: {name: "bundle"}}],
		"Returned correct bundles configuration");
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
	t.is(res, "unicorn", "Resolved placeholder correctly");
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
	t.is(res, "unicorn", "Resolved placeholder correctly");
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
	t.is(err.message,
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
	t.is(res.project.modelVersion, "4.0.0", "pom.xml content has been read");
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

	t.is(byPathStub.callCount, 1, "getRootReader().byPath got called exactly once (and then cached)");
});
