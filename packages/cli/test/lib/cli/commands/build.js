import test from "ava";
import sinon from "sinon";
import esmock from "esmock";

function getDefaultArgv() {
	// This has been taken from the actual argv object yargs provides
	return {
		"_": ["build"],
		"loglevel": "info",
		"log-level": "info",
		"logLevel": "info",
		"perf": false,
		"silent": false,
		"include-all-dependencies": false,
		"all": false,
		"a": false,
		"includeAllDependencies": false,
		"create-build-manifest": false,
		"createBuildManifest": false,
		"dest": "./dist",
		"clean-dest": false,
		"cleanDest": false,
		"experimental-css-variables": false,
		"experimentalCssVariables": false,
		"$0": "ui5"
	};
}

function getDefaultBuilderArgs() {
	return {
		destPath: "./dist",
		cleanDest: false,
		dependencyIncludes: {
			includeAllDependencies: false,
			includeDependency: undefined,
			includeDependencyRegExp: undefined,
			includeDependencyTree: undefined,
			excludeDependency: undefined,
			excludeDependencyRegExp: undefined,
			excludeDependencyTree: undefined,
			defaultIncludeDependency: undefined,
			defaultIncludeDependencyRegExp: undefined,
			defaultIncludeDependencyTree: undefined
		},
		createBuildManifest: false,
		selfContained: false,
		jsdoc: false,
		includedTasks: undefined,
		excludedTasks: undefined,
		cssVariables: false
	};
}

test.beforeEach(async (t) => {
	t.context.argv = getDefaultArgv();
	t.context.expectedBuilderArgs = getDefaultBuilderArgs();

	t.context.builder = sinon.stub().resolves();
	t.context.getBuilderSettings = sinon.stub().returns(undefined);
	const fakeGraph = {
		getRoot: sinon.stub().returns({
			getBuilderSettings: t.context.getBuilderSettings
		}),
		build: t.context.builder
	};
	t.context.expectedBuilderArgs.graph = fakeGraph;
	t.context.ProjectGraphStub = sinon.stub().resolves(fakeGraph);
	t.context.graphFromPackageDependenciesStub = sinon.stub().resolves(fakeGraph);
	t.context.graphFromStaticFileStub = sinon.stub().resolves(fakeGraph);

	t.context.build = await esmock.p("../../../../lib/cli/commands/build.js", {
		"@ui5/project/graph": {
			graphFromPackageDependencies: t.context.graphFromPackageDependenciesStub,
			graphFromStaticFile: t.context.graphFromStaticFileStub
		},
		"@ui5/project/graph/ProjectGraph": t.context.ProjectGraphStub
	});
});

test.afterEach.always((t) => {
	sinon.restore();
	esmock.purge(t.context.build);
});

test.serial("ui5 build (default) ", async (t) => {
	const {build, argv, builder, expectedBuilderArgs} = t.context;

	await build.handler(argv);

	t.deepEqual(builder.getCall(0).args[0], expectedBuilderArgs, "default build triggered with expected arguments");
});

test.serial("ui5 build self-contained", async (t) => {
	const {build, argv, builder, expectedBuilderArgs} = t.context;

	argv._.push("self-contained");

	await build.handler(argv);

	expectedBuilderArgs.selfContained = true;
	t.deepEqual(builder.getCall(0).args[0], expectedBuilderArgs, "Self-contained build called with expected arguments");
});

test.serial("ui5 build jsdoc", async (t) => {
	const {build, argv, builder, expectedBuilderArgs} = t.context;

	argv._.push("jsdoc");

	await build.handler(argv);

	expectedBuilderArgs.jsdoc = true;
	t.deepEqual(builder.getCall(0).args[0], expectedBuilderArgs, "JSDoc build called with expected arguments");
});

test.serial("ui5 build --framework-version", async (t) => {
	const {build, argv, graphFromPackageDependenciesStub} = t.context;

	argv.frameworkVersion = "1.99.0";

	await build.handler(argv);

	t.deepEqual(
		graphFromPackageDependenciesStub.getCall(0).args[0],
		{
			rootConfigPath: undefined,
			versionOverride: "1.99.0"
		}, "generateProjectGraph.graphFromPackageDependencies got called with expected arguments"
	);
});

test.serial("ui5 build --config", async (t) => {
	const {build, argv, graphFromPackageDependenciesStub} = t.context;

	argv.config = "ui5-test.yaml";

	await build.handler(argv);

	t.deepEqual(
		graphFromPackageDependenciesStub.getCall(0).args[0],
		{
			rootConfigPath: "ui5-test.yaml",
			versionOverride: undefined
		}, "generateProjectGraph.graphFromPackageDependencies got called with expected arguments"
	);
});

test.serial("ui5 build --dependency-definition", async (t) => {
	const {build, argv, graphFromStaticFileStub} = t.context;

	argv.dependencyDefinition = "dependencies.yaml";

	await build.handler(argv);

	t.deepEqual(
		graphFromStaticFileStub.getCall(0).args[0],
		{
			filePath: "dependencies.yaml",
			rootConfigPath: undefined,
			versionOverride: undefined
		}, "generateProjectGraph.graphFromStaticFile got called with expected arguments"
	);
});

test.serial("ui5 build --dependency-definition --config", async (t) => {
	const {build, argv, graphFromStaticFileStub} = t.context;

	argv.dependencyDefinition = "dependencies.yaml";
	argv.config = "ui5-test.yaml";

	await build.handler(argv);

	t.deepEqual(
		graphFromStaticFileStub.getCall(0).args[0],
		{
			filePath: "dependencies.yaml",
			rootConfigPath: "ui5-test.yaml",
			versionOverride: undefined
		}, "generateProjectGraph.graphFromStaticFile got called with expected arguments"
	);
});

test.serial("ui5 build --dependency-definition --config --framework-version", async (t) => {
	const {build, argv, graphFromStaticFileStub} = t.context;

	argv.dependencyDefinition = "dependencies.yaml";
	argv.config = "ui5-test.yaml";
	argv.frameworkVersion = "1.99.0";

	await build.handler(argv);

	t.deepEqual(
		graphFromStaticFileStub.getCall(0).args[0],
		{
			filePath: "dependencies.yaml",
			rootConfigPath: "ui5-test.yaml",
			versionOverride: "1.99.0"
		}, "generateProjectGraph.graphFromStaticFile got called with expected arguments"
	);
});

test.serial("ui5 build --createBuildManifest", async (t) => {
	const {build, argv, builder, expectedBuilderArgs} = t.context;

	argv["create-build-manifest"] = true;

	await build.handler(argv);

	expectedBuilderArgs.createBuildManifest = true;
	t.deepEqual(builder.getCall(0).args[0], expectedBuilderArgs, "default build triggered with expected arguments");
});

test.serial("ui5 build (Include/Exclude dependency options)", async (t) => {
	const {build, argv, builder, expectedBuilderArgs} = t.context;

	argv["include-dependency"] = ["sap.ui.core"];
	argv["include-dependency-regexp"] = ["^sap.[mf]$"];
	argv["include-dependency-tree"] = ["a"];
	argv["exclude-dependency"] = ["sap.ui.layout"];
	argv["exclude-dependency-regexp"] = ["^b0$"];
	argv["exclude-dependency-tree"] = ["c1"];

	await build.handler(argv);

	expectedBuilderArgs.dependencyIncludes = {
		includeAllDependencies: false,
		includeDependency: ["sap.ui.core"],
		includeDependencyRegExp: ["^sap.[mf]$"],
		includeDependencyTree: ["a"],
		excludeDependency: ["sap.ui.layout"],
		excludeDependencyRegExp: ["^b0$"],
		excludeDependencyTree: ["c1"],
		defaultIncludeDependency: undefined,
		defaultIncludeDependencyRegExp: undefined,
		defaultIncludeDependencyTree: undefined,
	};

	t.deepEqual(builder.getCall(0).args[0], expectedBuilderArgs, "default build triggered with expected arguments");
});

test.serial("ui5 build (Include dependency via configuration)", async (t) => {
	const {build, argv, builder, expectedBuilderArgs, getBuilderSettings} = t.context;

	getBuilderSettings.returns({
		includeDependency: ["a"],
		includeDependencyRegExp: ["^b0$"],
		includeDependencyTree: ["b1"],
	});

	await build.handler(argv);

	expectedBuilderArgs.dependencyIncludes = {
		includeAllDependencies: false,
		includeDependency: undefined,
		includeDependencyRegExp: undefined,
		includeDependencyTree: undefined,
		excludeDependency: undefined,
		excludeDependencyRegExp: undefined,
		excludeDependencyTree: undefined,
		defaultIncludeDependency: ["a"],
		defaultIncludeDependencyRegExp: ["^b0$"],
		defaultIncludeDependencyTree: ["b1"]
	};

	t.deepEqual(builder.getCall(0).args[0], expectedBuilderArgs, "default build triggered with expected arguments");
});

test.serial("ui5 build --experimental-css-variables", async (t) => {
	const {build, argv, builder, expectedBuilderArgs} = t.context;

	argv["experimental-css-variables"] = true;

	await build.handler(argv);

	expectedBuilderArgs.cssVariables = true;
	t.deepEqual(builder.getCall(0).args[0], expectedBuilderArgs,
		"Build with activated CSS Variables is called with expected arguments");
});
