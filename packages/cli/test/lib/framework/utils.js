import test from "ava";
import sinonGlobal from "sinon";
import esmock from "esmock";
import path from "node:path";

test.beforeEach(async (t) => {
	// Tests either rely on not having UI5_DATA_DIR defined, or explicitly define it
	t.context.originalUi5DataDirEnv = process.env.UI5_DATA_DIR;
	delete process.env.UI5_DATA_DIR;

	const sinon = t.context.sinon = sinonGlobal.createSandbox();

	t.context.graph = {
		getRoot: sinon.stub().returns({})
	};

	t.context.graphFromStaticFile = sinon.stub().resolves(t.context.graph),
	t.context.graphFromPackageDependencies = sinon.stub().resolves(t.context.graph);

	t.context.Sapui5Resolver = sinon.stub();
	t.context.Openui5Resolver = sinon.stub();
	t.context.Sapui5MavenSnapshotResolver = sinon.stub();

	t.context.ConfigurationGetUi5DataDirStub = sinon.stub().returns(undefined);
	t.context.ConfigurationStub = {
		fromFile: sinon.stub().resolves({
			getUi5DataDir: t.context.ConfigurationGetUi5DataDirStub
		})
	};

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
		"@ui5/project/config/Configuration": t.context.ConfigurationStub
	});
	t.context._utils = t.context.utils._utils;
});

test.afterEach.always((t) => {
	// Reset UI5_DATA_DIR env
	if (typeof t.context.originalUi5DataDirEnv === "undefined") {
		delete process.env.UI5_DATA_DIR;
	} else {
		process.env.UI5_DATA_DIR = t.context.originalUi5DataDirEnv;
	}
	t.context.sinon.restore();
	esmock.purge(t.context.utils);
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
	const {getFrameworkResolver} = t.context._utils;
	const {Sapui5Resolver} = t.context;

	const result = await getFrameworkResolver("SAPUI5", "1.100.0");
	t.is(result, Sapui5Resolver);
});

test.serial("getFrameworkResolver: OpenUI5", async (t) => {
	const {getFrameworkResolver} = t.context._utils;
	const {Openui5Resolver} = t.context;

	const result = await getFrameworkResolver("OpenUI5", "1.100.0");
	t.is(result, Openui5Resolver);
});

test.serial("getFrameworkResolver: OpenUI5 Snapshot", async (t) => {
	const {getFrameworkResolver} = t.context._utils;
	const {Sapui5MavenSnapshotResolver} = t.context;

	const result = await getFrameworkResolver("OpenUI5", "1.100.0-SNAPSHOT");
	t.is(result, Sapui5MavenSnapshotResolver);
});

test.serial("getFrameworkResolver: SAPUI5 Snapshot", async (t) => {
	const {getFrameworkResolver} = t.context._utils;
	const {Sapui5MavenSnapshotResolver} = t.context;

	const result = await getFrameworkResolver("SAPUI5", "1.100.0-SNAPSHOT");
	t.is(result, Sapui5MavenSnapshotResolver);
});

test.serial("getFrameworkResolver: Invalid framework.name", async (t) => {
	const {getFrameworkResolver} = t.context._utils;

	await t.throwsAsync(() => getFrameworkResolver("UI5", "1.100.0"), {
		message: "Invalid framework.name: UI5"
	});
});

test.serial("createFrameworkResolverInstance: Without ui5DataDir", async (t) => {
	const {createFrameworkResolverInstance} = t.context.utils;
	const {sinon} = t.context;

	const ResolverStub = sinon.stub().returns({});
	sinon.stub(t.context._utils, "getFrameworkResolver").resolves(ResolverStub);
	sinon.stub(t.context._utils, "getUi5DataDir").resolves(undefined);

	const result = await createFrameworkResolverInstance({
		frameworkName: "<framework-name>",
		frameworkVersion: "<framework-version>"
	}, {
		cwd: "my-project-path"
	});

	t.is(t.context._utils.getFrameworkResolver.callCount, 1);
	t.deepEqual(t.context._utils.getFrameworkResolver.getCall(0).args, [
		"<framework-name>",
		"<framework-version>"
	]);

	t.is(t.context._utils.getUi5DataDir.callCount, 1);
	t.deepEqual(t.context._utils.getUi5DataDir.getCall(0).args, [
		{
			cwd: "my-project-path"
		}
	]);

	t.is(ResolverStub.callCount, 1);
	t.is(result, ResolverStub.getCall(0).returnValue);
	t.true(ResolverStub.alwaysCalledWithNew());
	t.deepEqual(ResolverStub.getCall(0).args, [
		{
			cwd: "my-project-path",
			version: "<framework-version>",
			ui5DataDir: undefined
		}
	]);
});

test.serial("createFrameworkResolverInstance: With ui5DataDir", async (t) => {
	const {createFrameworkResolverInstance} = t.context.utils;
	const {sinon} = t.context;

	const ResolverStub = sinon.stub().returns({});
	sinon.stub(t.context._utils, "getFrameworkResolver").resolves(ResolverStub);
	sinon.stub(t.context._utils, "getUi5DataDir").resolves("my-ui5-data-dir");

	const result = await createFrameworkResolverInstance({
		frameworkName: "<framework-name>",
		frameworkVersion: "<framework-version>"
	}, {
		cwd: "my-project-path"
	});

	t.is(t.context._utils.getFrameworkResolver.callCount, 1);
	t.deepEqual(t.context._utils.getFrameworkResolver.getCall(0).args, [
		"<framework-name>",
		"<framework-version>"
	]);

	t.is(t.context._utils.getUi5DataDir.callCount, 1);
	t.deepEqual(t.context._utils.getUi5DataDir.getCall(0).args, [
		{
			cwd: "my-project-path"
		}
	]);

	t.is(ResolverStub.callCount, 1);
	t.is(result, ResolverStub.getCall(0).returnValue);
	t.true(ResolverStub.alwaysCalledWithNew());
	t.deepEqual(ResolverStub.getCall(0).args, [
		{
			cwd: "my-project-path",
			version: "<framework-version>",
			ui5DataDir: "my-ui5-data-dir"
		}
	]);
});

test.serial("frameworkResolverResolveVersion", async (t) => {
	const {frameworkResolverResolveVersion} = t.context.utils;
	const {sinon} = t.context;

	const resolveVersionStub = sinon.stub().resolves("1.111.1");
	sinon.stub(t.context._utils, "getFrameworkResolver").resolves({
		resolveVersion: resolveVersionStub
	});
	sinon.stub(t.context._utils, "getUi5DataDir").resolves(undefined);

	const result = await frameworkResolverResolveVersion({
		frameworkName: "SAPUI5",
		frameworkVersion: "latest"
	}, {
		cwd: "my-project-path"
	});

	t.is(result, "1.111.1");

	t.is(resolveVersionStub.callCount, 1);
	t.deepEqual(resolveVersionStub.getCall(0).args, [
		"latest",
		{
			cwd: "my-project-path",
			ui5DataDir: undefined
		}
	]);
});

test.serial("getUi5DataDir: no value defined", async (t) => {
	const {ConfigurationGetUi5DataDirStub} = t.context;
	const {getUi5DataDir} = t.context._utils;

	const result = await getUi5DataDir({
		cwd: path.resolve("foo")
	});

	t.is(result, undefined);

	t.is(ConfigurationGetUi5DataDirStub.callCount, 1);
});

test.serial("getUi5DataDir: from environment variable", async (t) => {
	const {ConfigurationGetUi5DataDirStub} = t.context;
	const {getUi5DataDir} = t.context._utils;

	// Environment variable must be preferred over configuration value
	ConfigurationGetUi5DataDirStub.returns(".ui5-data-dir-from-configuration");
	process.env.UI5_DATA_DIR = ".ui5-data-dir-from-env-variable";

	const result = await getUi5DataDir({
		cwd: path.resolve("foo")
	});

	t.is(result, path.join(path.resolve("foo"), ".ui5-data-dir-from-env-variable"));

	t.is(ConfigurationGetUi5DataDirStub.callCount, 0);
});

test.serial("getUi5DataDir: from Configuration", async (t) => {
	const {ConfigurationGetUi5DataDirStub} = t.context;
	const {getUi5DataDir} = t.context._utils;

	ConfigurationGetUi5DataDirStub.returns(".ui5-data-dir-from-configuration");

	const result = await getUi5DataDir({
		cwd: path.resolve("foo")
	});

	t.is(result, path.join(path.resolve("foo"), ".ui5-data-dir-from-configuration"));

	t.is(ConfigurationGetUi5DataDirStub.callCount, 1);
});
