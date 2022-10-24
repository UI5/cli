import test from "ava";
import sinonGlobal from "sinon";
import esmock from "esmock";

test.beforeEach(async (t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();

	t.context.log = {
		verbose: sinon.stub(),
		isLevelEnabled: sinon.stub().returns(false)
	};
	t.context.pool = {
		prepare: sinon.stub().resolves()
	};
	t.context.LocatorResourcePool = sinon.stub().returns(t.context.pool);

	t.context.Resource = sinon.stub();

	t.context.builder = {
		createBundle: sinon.stub().resolves([])
	};
	t.context.BundleBuilder = sinon.stub().returns(t.context.builder);

	t.context.processor = await esmock("../../../../lib/processors/bundlers/moduleBundler.js", {
		"@ui5/logger": {
			getLogger: sinon.stub().withArgs("builder:processors:bundlers:moduleBundler").returns(t.context.log)
		},
		"@ui5/fs/Resource": t.context.Resource,
		"../../../../lib/lbt/resources/LocatorResourcePool": t.context.LocatorResourcePool,
		"../../../../lib/lbt/bundle/Builder": t.context.BundleBuilder
	});
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});

test.serial("Builder returns single bundle", async (t) => {
	const {processor, Resource, LocatorResourcePool, pool, BundleBuilder, builder, log} = t.context;

	const resources = [];
	const bundleDefinition = {
		"some": "definition"
	};
	const bundleOptions = {
		"some": "option"
	};

	const createdBundle = {
		name: "BundleName.js",
		content: "Bundle Content",
		bundleInfo: {
			"Bundle": "Info"
		}
	};

	builder.createBundle.resolves(createdBundle);

	const expectedOutputResource = {
		"output": "resource"
	};
	Resource.returns(expectedOutputResource);

	const outputResources = await processor({
		resources,
		options: {
			bundleDefinition,
			bundleOptions
		}
	});

	t.deepEqual(outputResources, [{bundle: expectedOutputResource}]);
	t.is(outputResources[0].bundle, expectedOutputResource);

	t.is(LocatorResourcePool.callCount, 1, "LocatorResourcePool should be created once");
	t.true(LocatorResourcePool.calledWithNew());
	t.deepEqual(LocatorResourcePool.getCall(0).args, [
		{
			ignoreMissingModules: false // default
		}
	], "LocatorResourcePool should be called with expected args");

	t.is(BundleBuilder.callCount, 1, "BundleBuilder should be created once");
	t.true(BundleBuilder.calledWithNew());
	t.is(BundleBuilder.getCall(0).args.length, 1);
	t.is(BundleBuilder.getCall(0).args[0], pool, "LocatorResourcePool should be called with pool");

	t.is(pool.prepare.callCount, 1, "pool.prepare should be called once");
	t.is(pool.prepare.getCall(0).args.length, 2);
	t.is(pool.prepare.getCall(0).args[0], resources, "pool.prepare should be called with resources");
	t.is(pool.prepare.getCall(0).args[1], undefined, "pool.prepare should be called without moduleNameMapping");

	t.is(builder.createBundle.callCount, 1, "builder.createBundle should be called once");
	t.is(builder.createBundle.getCall(0).args.length, 2);
	t.is(builder.createBundle.getCall(0).args[0], bundleDefinition,
		"builder.createBundle should be called with bundleDefinition");
	t.deepEqual(builder.createBundle.getCall(0).args[1], {
		// default bundleOptions
		optimize: true,
		sourceMap: true,
		decorateBootstrapModule: false,
		addTryCatchRestartWrapper: false,
		usePredefineCalls: false,
		numberOfParts: 1,
		ignoreMissingModules: false,

		some: "option"
	},
	"builder.createBundle should be called with bundleOptions");
	t.true(builder.createBundle.calledAfter(pool.prepare),
		"builder.createBundle should be called before pool.prepare");

	t.is(Resource.callCount, 1, "One resource should be created");
	t.true(Resource.calledWithNew());
	t.deepEqual(Resource.getCall(0).args, [
		{
			path: "/resources/BundleName.js",
			string: "Bundle Content"
		}
	], "Resource should be called with expected args");

	t.is(log.verbose.callCount, 0, "log.verbose is not called when verbose level is not enabled");
});

test.serial("Builder returns multiple bundles", async (t) => {
	const {processor, Resource, LocatorResourcePool, pool, BundleBuilder, builder, log} = t.context;

	const resources = [];
	const bundleDefinition = {
		"some": "definition"
	};
	const bundleOptions = {
		"some": "option"
	};

	const createdBundles = [
		{
			name: "BundleName1.js",
			content: "Bundle Content 1",
			bundleInfo: {
				"Bundle": "Info 1"
			}
		},
		undefined, // Empty bundle
		{
			name: "BundleName2.js",
			content: "Bundle Content 2",
			bundleInfo: {
				"Bundle": "Info 2"
			}
		},
		undefined // Empty bundle
	];

	builder.createBundle.resolves(createdBundles);

	const expectedOutputResources = [
		{
			bundle: {
				"output": "resource 1"
			},
		},
		undefined,
		{
			bundle: {
				"output": "resource 2"
			}
		},
		undefined
	];
	Resource.onFirstCall().returns(expectedOutputResources[0].bundle);
	Resource.onSecondCall().returns(expectedOutputResources[2].bundle);

	const outputResources = await processor({
		resources,
		options: {
			bundleDefinition,
			bundleOptions
		}
	});

	t.deepEqual(outputResources, expectedOutputResources);
	t.is(outputResources[0].bundle, expectedOutputResources[0].bundle);
	t.is(outputResources[1], expectedOutputResources[1]);
	t.is(outputResources[2].bundle, expectedOutputResources[2].bundle);

	t.is(LocatorResourcePool.callCount, 1, "LocatorResourcePool should be created once");
	t.true(LocatorResourcePool.calledWithNew());
	t.deepEqual(LocatorResourcePool.getCall(0).args, [
		{
			ignoreMissingModules: false // default
		}
	], "LocatorResourcePool should be called with expected args");

	t.is(BundleBuilder.callCount, 1, "BundleBuilder should be created once");
	t.true(BundleBuilder.calledWithNew());
	t.is(BundleBuilder.getCall(0).args.length, 1);
	t.is(BundleBuilder.getCall(0).args[0], pool, "LocatorResourcePool should be called with pool");

	t.is(pool.prepare.callCount, 1, "pool.prepare should be called once");
	t.is(pool.prepare.getCall(0).args.length, 2);
	t.is(pool.prepare.getCall(0).args[0], resources, "pool.prepare should be called with resources");
	t.is(pool.prepare.getCall(0).args[1], undefined, "pool.prepare should be called without moduleNameMapping");

	t.is(builder.createBundle.callCount, 1, "builder.createBundle should be called once");
	t.is(builder.createBundle.getCall(0).args.length, 2);
	t.is(builder.createBundle.getCall(0).args[0], bundleDefinition,
		"builder.createBundle should be called with bundleDefinition");
	t.deepEqual(builder.createBundle.getCall(0).args[1], {
		// default bundleOptions
		optimize: true,
		sourceMap: true,
		decorateBootstrapModule: false,
		addTryCatchRestartWrapper: false,
		usePredefineCalls: false,
		numberOfParts: 1,
		ignoreMissingModules: false,

		some: "option"
	},
	"builder.createBundle should be called with bundleOptions");
	t.true(builder.createBundle.calledAfter(pool.prepare),
		"builder.createBundle should be called before pool.prepare");

	t.is(Resource.callCount, 2, "Two resources should be created");
	t.true(Resource.calledWithNew());
	t.deepEqual(Resource.getCall(0).args, [
		{
			path: "/resources/BundleName1.js",
			string: "Bundle Content 1"
		}
	], "Resource should be called with expected args");
	t.deepEqual(Resource.getCall(1).args, [
		{
			path: "/resources/BundleName2.js",
			string: "Bundle Content 2"
		}
	], "Resource should be called with expected args");

	t.is(log.verbose.callCount, 0, "log.verbose is not called when verbose level is not enabled");
});

test.serial("bundleOptions default (no options passed)", async (t) => {
	const {processor, Resource, LocatorResourcePool, pool, BundleBuilder, builder, log} = t.context;

	const resources = [];
	const bundleDefinition = {
		"some": "definition"
	};

	const createdBundle = {
		name: "BundleName.js",
		content: "Bundle Content",
		bundleInfo: {
			"Bundle": "Info"
		}
	};

	builder.createBundle.resolves(createdBundle);

	const expectedOutputResource = {
		"output": "resource"
	};
	Resource.returns(expectedOutputResource);

	const outputResources = await processor({
		resources,
		options: {
			bundleDefinition
		}
	});

	t.deepEqual(outputResources, [{bundle: expectedOutputResource}]);
	t.is(outputResources[0].bundle, expectedOutputResource);

	t.is(LocatorResourcePool.callCount, 1, "LocatorResourcePool should be created once");
	t.true(LocatorResourcePool.calledWithNew());
	t.deepEqual(LocatorResourcePool.getCall(0).args, [
		{
			ignoreMissingModules: false // default
		}
	], "LocatorResourcePool should be called with expected args");

	t.is(BundleBuilder.callCount, 1, "BundleBuilder should be created once");
	t.true(BundleBuilder.calledWithNew());
	t.is(BundleBuilder.getCall(0).args.length, 1);
	t.is(BundleBuilder.getCall(0).args[0], pool, "LocatorResourcePool should be called with pool");

	t.is(pool.prepare.callCount, 1, "pool.prepare should be called once");
	t.is(pool.prepare.getCall(0).args.length, 2);
	t.is(pool.prepare.getCall(0).args[0], resources, "pool.prepare should be called with resources");
	t.is(pool.prepare.getCall(0).args[1], undefined, "pool.prepare should be called without moduleNameMapping");

	t.is(builder.createBundle.callCount, 1, "builder.createBundle should be called once");
	t.is(builder.createBundle.getCall(0).args.length, 2);
	t.is(builder.createBundle.getCall(0).args[0], bundleDefinition,
		"builder.createBundle should be called with bundleDefinition");
	t.deepEqual(builder.createBundle.getCall(0).args[1], {
		// default bundleOptions
		optimize: true,
		sourceMap: true,
		decorateBootstrapModule: false,
		addTryCatchRestartWrapper: false,
		usePredefineCalls: false,
		numberOfParts: 1,
		ignoreMissingModules: false
	},
	"builder.createBundle should be called with bundleOptions");
	t.true(builder.createBundle.calledAfter(pool.prepare),
		"builder.createBundle should be called before pool.prepare");

	t.is(Resource.callCount, 1, "One resource should be created");
	t.true(Resource.calledWithNew());
	t.deepEqual(Resource.getCall(0).args, [
		{
			path: "/resources/BundleName.js",
			string: "Bundle Content"
		}
	], "Resource should be called with expected args");

	t.is(log.verbose.callCount, 0, "log.verbose is not called when verbose level is not enabled");
});

test.serial("bundleOptions default (empty options passed)", async (t) => {
	const {processor, LocatorResourcePool, builder, log} = t.context;

	const resources = [];
	const bundleDefinition = {
		"some": "definition"
	};
	const bundleOptions = {};

	const createdBundle = {
		name: "BundleName.js",
		content: "Bundle Content",
		bundleInfo: {
			"Bundle": "Info"
		}
	};

	builder.createBundle.resolves(createdBundle);

	await processor({
		resources,
		options: {
			bundleDefinition,
			bundleOptions
		}
	});

	t.is(LocatorResourcePool.callCount, 1, "LocatorResourcePool should be created once");
	t.true(LocatorResourcePool.calledWithNew());
	t.deepEqual(LocatorResourcePool.getCall(0).args, [
		{
			ignoreMissingModules: false // default
		}
	], "LocatorResourcePool should be called with expected args");

	t.is(builder.createBundle.callCount, 1, "builder.createBundle should be called once");
	t.is(builder.createBundle.getCall(0).args.length, 2);
	t.is(builder.createBundle.getCall(0).args[0], bundleDefinition,
		"builder.createBundle should be called with bundleDefinition");
	t.deepEqual(builder.createBundle.getCall(0).args[1], {
		// default bundleOptions
		optimize: true,
		sourceMap: true,
		decorateBootstrapModule: false,
		addTryCatchRestartWrapper: false,
		usePredefineCalls: false,
		numberOfParts: 1,
		ignoreMissingModules: false
	},
	"builder.createBundle should be called with bundleOptions");

	t.deepEqual(bundleOptions, {}, "Passed bundleOptions object should not be modified");

	t.is(log.verbose.callCount, 0, "log.verbose is not called when verbose level is not enabled");
});

test.serial("bundleOptions (all options passed)", async (t) => {
	const {processor, LocatorResourcePool, builder, log} = t.context;

	const resources = [];
	const bundleDefinition = {
		"some": "definition"
	};
	const bundleOptions = {
		optimize: false,
		sourceMap: false,
		decorateBootstrapModule: true,
		addTryCatchRestartWrapper: true,
		usePredefineCalls: true,
		numberOfParts: 7,
		ignoreMissingModules: true
	};

	const createdBundle = {
		name: "BundleName.js",
		content: "Bundle Content",
		bundleInfo: {
			"Bundle": "Info"
		}
	};

	builder.createBundle.resolves(createdBundle);

	await processor({
		resources,
		options: {
			bundleDefinition,
			bundleOptions
		}
	});

	t.is(LocatorResourcePool.callCount, 1, "LocatorResourcePool should be created once");
	t.true(LocatorResourcePool.calledWithNew());
	t.deepEqual(LocatorResourcePool.getCall(0).args, [
		{
			ignoreMissingModules: true
		}
	], "LocatorResourcePool should be called with expected args");

	t.is(builder.createBundle.callCount, 1, "builder.createBundle should be called once");
	t.is(builder.createBundle.getCall(0).args.length, 2);
	t.is(builder.createBundle.getCall(0).args[0], bundleDefinition,
		"builder.createBundle should be called with bundleDefinition");
	t.deepEqual(builder.createBundle.getCall(0).args[1], bundleOptions,
		"builder.createBundle should be called with bundleOptions");

	t.is(log.verbose.callCount, 0, "log.verbose is not called when verbose level is not enabled");
});

test.serial("Passes ignoreMissingModules bundleOption to LocatorResourcePool", async (t) => {
	const {processor, Resource, LocatorResourcePool, pool, BundleBuilder, builder, log} = t.context;

	const resources = [];
	const bundleDefinition = {
		"some": "definition"
	};
	const bundleOptions = {
		ignoreMissingModules: "foo"
	};

	const effectiveBundleOptions = {
		// Defaults
		"optimize": true,
		"sourceMap": true,
		"decorateBootstrapModule": false,
		"addTryCatchRestartWrapper": false,
		"usePredefineCalls": false,
		"numberOfParts": 1,

		"ignoreMissingModules": "foo"
	};

	const createdBundle = {
		name: "BundleName.js",
		content: "Bundle Content",
		bundleInfo: {
			"Bundle": "Info"
		}
	};

	builder.createBundle.resolves(createdBundle);

	const expectedOutputResource = {
		"output": "resource"
	};
	Resource.returns(expectedOutputResource);

	const outputResources = await processor({
		resources,
		options: {
			bundleDefinition,
			bundleOptions
		}
	});

	t.deepEqual(outputResources, [{bundle: expectedOutputResource}]);
	t.is(outputResources[0].bundle, expectedOutputResource);

	t.is(LocatorResourcePool.callCount, 1, "LocatorResourcePool should be created once");
	t.true(LocatorResourcePool.calledWithNew());
	t.deepEqual(LocatorResourcePool.getCall(0).args, [
		{
			ignoreMissingModules: "foo" // as defined in bundleOptions
		}
	], "LocatorResourcePool should be called with expected args");

	t.is(BundleBuilder.callCount, 1, "BundleBuilder should be created once");
	t.true(BundleBuilder.calledWithNew());
	t.is(BundleBuilder.getCall(0).args.length, 1);
	t.is(BundleBuilder.getCall(0).args[0], pool, "LocatorResourcePool should be called with pool");

	t.is(pool.prepare.callCount, 1, "pool.prepare should be called once");
	t.is(pool.prepare.getCall(0).args.length, 2);
	t.is(pool.prepare.getCall(0).args[0], resources, "pool.prepare should be called with resources");
	t.is(pool.prepare.getCall(0).args[1], undefined, "pool.prepare should be called without moduleNameMapping");

	t.is(builder.createBundle.callCount, 1, "builder.createBundle should be called once");
	t.is(builder.createBundle.getCall(0).args.length, 2);
	t.is(builder.createBundle.getCall(0).args[0], bundleDefinition,
		"builder.createBundle should be called with bundleDefinition");
	t.deepEqual(builder.createBundle.getCall(0).args[1], effectiveBundleOptions,
		"builder.createBundle should be called with bundleOptions");
	t.true(builder.createBundle.calledAfter(pool.prepare),
		"builder.createBundle should be called before pool.prepare");

	t.is(Resource.callCount, 1, "One resource should be created");
	t.true(Resource.calledWithNew());
	t.deepEqual(Resource.getCall(0).args, [
		{
			path: "/resources/BundleName.js",
			string: "Bundle Content"
		}
	], "Resource should be called with expected args");

	t.is(log.verbose.callCount, 0, "log.verbose is not called when verbose level is not enabled");
});

test.serial("Verbose Logging", async (t) => {
	const {processor, Resource, builder, log} = t.context;

	const resources = [];
	const bundleDefinition = {
		"some": "definition"
	};
	const bundleOptions = {
		"some": "option"
	};

	const effectiveBundleOptions = {
		// Defaults
		"optimize": true,
		"sourceMap": true,
		"decorateBootstrapModule": false,
		"addTryCatchRestartWrapper": false,
		"usePredefineCalls": false,
		"numberOfParts": 1,
		"ignoreMissingModules": false,

		"some": "option",
	};

	const createdBundle = {
		name: "Bundle Name",
		content: "Bundle Content",
		bundleInfo: {
			"Bundle": "Info"
		}
	};

	builder.createBundle.resolves(createdBundle);

	const expectedOutputResource = {
		"output": "resource"
	};
	Resource.returns(expectedOutputResource);

	log.isLevelEnabled.returns(true);

	await processor({
		resources,
		options: {
			bundleDefinition,
			bundleOptions
		}
	});

	t.is(log.isLevelEnabled.callCount, 1);
	t.deepEqual(log.isLevelEnabled.getCall(0).args, ["verbose"]);

	t.is(log.verbose.callCount, 3, "log.verbose is called 3 times when verbose level is enabled");

	t.deepEqual(log.verbose.getCall(0).args, ["Generating bundle:"]);
	t.deepEqual(log.verbose.getCall(1).args, ["bundleDefinition: " + JSON.stringify(bundleDefinition, null, 2)]);
	t.deepEqual(log.verbose.getCall(2).args, ["bundleOptions: " + JSON.stringify(effectiveBundleOptions, null, 2)]);
});
