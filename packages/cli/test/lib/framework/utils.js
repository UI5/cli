import test from "ava";
import sinon from "sinon";
import esmock from "esmock";

test.beforeEach(async (t) => {
	t.context.graph = {
		getRoot: sinon.stub().returns({})
	};

	t.context.graphFromStaticFile = sinon.stub().resolves(t.context.graph),
	t.context.graphFromPackageDependencies = sinon.stub().resolves(t.context.graph);

	t.context.Sapui5Resolver = sinon.stub();
	t.context.Openui5Resolver = sinon.stub();
	t.context.Sapui5MavenSnapshotResolver = sinon.stub();
	t.context.utils = await esmock.p("../../../lib/framework/utils.js", {
		"@ui5/project/graph": {
			graphFromStaticFile: t.context.graphFromStaticFile,
			graphFromPackageDependencies: t.context.graphFromPackageDependencies
		},
		"@ui5/project/ui5Framework/Sapui5Resolver": {
			default: t.context.Sapui5Resolver
		},
		"@ui5/project/ui5Framework/Openui5Resolver": {
			default: t.context.Openui5Resolver
		},
		"@ui5/project/ui5Framework/Sapui5MavenSnapshotResolver": {
			default: t.context.Sapui5MavenSnapshotResolver
		},
	});
});

test.afterEach.always((t) => {
	sinon.restore();
});

test.serial("getRootProjectConfiguration: dependencyDefinition", async (t) => {
	const {getRootProjectConfiguration} = t.context.utils;
	const {graphFromStaticFile, graphFromPackageDependencies} = t.context;

	const result = await getRootProjectConfiguration({
		dependencyDefinition: "foo"
	});

	t.is(graphFromStaticFile.callCount, 1);
	t.deepEqual(graphFromStaticFile.getCall(0).args, [{
		filePath: "foo",
		resolveFrameworkDependencies: false
	}]);

	t.is(graphFromPackageDependencies.callCount, 0);

	t.is(t.context.graph.getRoot.callCount, 1);
	t.deepEqual(t.context.graph.getRoot.getCall(0).args, []);

	t.is(result, t.context.graph.getRoot.getCall(0).returnValue);
});

test.serial("getRootProjectConfiguration: config", async (t) => {
	const {getRootProjectConfiguration} = t.context.utils;
	const {graphFromStaticFile, graphFromPackageDependencies} = t.context;

	const result = await getRootProjectConfiguration({
		config: "foo"
	});

	t.is(graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: "foo",
		resolveFrameworkDependencies: false
	}]);

	t.is(graphFromStaticFile.callCount, 0);

	t.is(t.context.graph.getRoot.callCount, 1);
	t.deepEqual(t.context.graph.getRoot.getCall(0).args, []);

	t.is(result, t.context.graph.getRoot.getCall(0).returnValue);
});

test.serial("getFrameworkResolver: SAPUI5", async (t) => {
	const {getFrameworkResolver} = t.context.utils;
	const {Sapui5Resolver} = t.context;

	const result = await getFrameworkResolver("SAPUI5", "1.100.0");
	t.is(result, Sapui5Resolver);
});

test.serial("getFrameworkResolver: OpenUI5", async (t) => {
	const {getFrameworkResolver} = t.context.utils;
	const {Openui5Resolver} = t.context;

	const result = await getFrameworkResolver("OpenUI5", "1.100.0");
	t.is(result, Openui5Resolver);
});

test.serial("getFrameworkResolver: OpenUI5 Snapshot", async (t) => {
	const {getFrameworkResolver} = t.context.utils;
	const {Sapui5MavenSnapshotResolver} = t.context;

	const result = await getFrameworkResolver("OpenUI5", "1.100.0-SNAPSHOT");
	t.is(result, Sapui5MavenSnapshotResolver);
});

test.serial("getFrameworkResolver: SAPUI5 Snapshot", async (t) => {
	const {getFrameworkResolver} = t.context.utils;
	const {Sapui5MavenSnapshotResolver} = t.context;

	const result = await getFrameworkResolver("SAPUI5", "1.100.0-SNAPSHOT");
	t.is(result, Sapui5MavenSnapshotResolver);
});

test.serial("getFrameworkResolver: Invalid framework.name", async (t) => {
	const {getFrameworkResolver} = t.context.utils;

	await t.throwsAsync(() => getFrameworkResolver("UI5", "1.100.0"), {
		message: "Invalid framework.name: UI5"
	});
});
