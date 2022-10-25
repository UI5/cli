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
	t.context.utils = await esmock("../../../lib/framework/utils.js", {
		"@ui5/project/graph": {
			graphFromStaticFile: t.context.graphFromStaticFile,
			graphFromPackageDependencies: t.context.graphFromPackageDependencies
		},
		"@ui5/project/ui5Framework/Sapui5Resolver": t.context.Sapui5Resolver,
		"@ui5/project/ui5Framework/Openui5Resolver": t.context.Openui5Resolver
	});
});

test.afterEach.always(() => {
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

test.serial("getFrameworkResolver: SAPUI5", (t) => {
	const {getFrameworkResolver} = t.context.utils;
	const {Sapui5Resolver} = t.context;

	const result = getFrameworkResolver("SAPUI5");
	t.is(result, Sapui5Resolver);
});

test.serial("getFrameworkResolver: OpenUI5", (t) => {
	const {getFrameworkResolver} = t.context.utils;
	const {Sapui5Resolver} = t.context;

	const result = getFrameworkResolver("SAPUI5");
	t.is(result, Sapui5Resolver);
});

test.serial("getFrameworkResolver: Invalid framework.name", (t) => {
	const {getFrameworkResolver} = t.context.utils;

	t.throws(() => getFrameworkResolver("UI5"), {
		message: "Invalid framework.name: UI5"
	});
});

test.serial("isValidSpecVersion", (t) => {
	const {isValidSpecVersion} = t.context.utils;

	t.true(isValidSpecVersion("2.0"));
	t.true(isValidSpecVersion("2.1"));
	t.true(isValidSpecVersion("3.0"));
	t.true(isValidSpecVersion("123456789"));
	t.true(isValidSpecVersion("123456789.0.0.0"));

	t.false(isValidSpecVersion());
	t.false(isValidSpecVersion(undefined));
	t.false(isValidSpecVersion(null));
	t.false(isValidSpecVersion(true));
	t.false(isValidSpecVersion({}));
	t.false(isValidSpecVersion(function() {}));
	t.false(isValidSpecVersion(""));
	t.false(isValidSpecVersion("0.1"));
	t.false(isValidSpecVersion("1.0"));
	t.false(isValidSpecVersion("1.1"));
});
