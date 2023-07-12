import test from "ava";
import sinon from "sinon";
import esmock from "esmock";

import Resolver from "../../../../lib/lbt/bundle/Resolver.js";
import ResourcePool from "../../../../lib/lbt/resources/ResourcePool.js";

const sortedCopy = (array) => array.slice().sort();

const TRIVIAL_MODULE = "sap.ui.define([], function() {});";

class MockPool extends ResourcePool {
	constructor(data) {
		super();
		for ( const [name, content] of Object.entries(data) ) {
			this.addResource({
				name,
				buffer: async () => content
			});
		}
	}
}

test.serial("resolve without resolving dependencies", async (t) => {
	const pool = new MockPool({
		"app.js": `
			sap.ui.define(['lib/mod1', 'lib/mod2'], function() {
				return function() {
					sap.ui.require(['lib/mod3'], function(){});
				};
			});`,
		"lib/mod1.js": TRIVIAL_MODULE,
		"lib/mod2.js": TRIVIAL_MODULE,
		"lib/mod3.js": TRIVIAL_MODULE
	});

	const bundleDefinition = {
		name: "bundle.js",
		sections: [
			{
				mode: "preload",
				filters: [
					"app.js",
				],
				resolve: false
			}
		]
	};

	const resolver = new Resolver(pool);

	// act
	const resolvedBundle = await resolver.resolve(bundleDefinition);

	// assert
	t.true(resolvedBundle != null, "resolve() should return a bundle");
	t.is(resolvedBundle.sections.length, 1, "bundle should contain 1 section");
	t.deepEqual(
		sortedCopy(resolvedBundle.sections[0].modules),
		[
			"app.js"
		], "bundle should only contain the specified module");
});


test.serial("resolve with resolving static dependencies", async (t) => {
	const pool = new MockPool({
		"app.js": `
			sap.ui.define(['lib/mod1', 'lib/mod2'], function() {
				return function() {
					sap.ui.require(['lib/mod3'], function(){});
				};
			});`,
		"lib/mod1.js": "sap.ui.define(['./mod4'], function() {});",
		"lib/mod2.js": TRIVIAL_MODULE,
		"lib/mod3.js": TRIVIAL_MODULE,
		"lib/mod4.js": TRIVIAL_MODULE
	});

	const bundleDefinition = {
		name: "bundle.js",
		sections: [
			{
				mode: "preload",
				filters: [
					"app.js",
				],
				resolve: true
			}
		]
	};

	const resolver = new Resolver(pool);

	// act
	const resolvedBundle = await resolver.resolve(bundleDefinition);

	// assert
	t.true(resolvedBundle != null, "resolve() should return a bundle");
	t.is(resolvedBundle.sections.length, 1, "bundle should contain 1 section");
	t.deepEqual(
		sortedCopy(resolvedBundle.sections[0].modules),
		[
			"app.js",
			"lib/mod1.js",
			"lib/mod2.js",
			// "lib/mod3.js" // conditional dependency from app.js to lib/mod3 is NOT included
			"lib/mod4.js",
		], "bundle should contain the expected modules");
});

test.serial("resolve, with resolving also conditional dependencies", async (t) => {
	const pool = new MockPool({
		"app.js": `
			sap.ui.define(['lib/mod1', 'lib/mod2'], function() {
				return function() {
					sap.ui.require(['lib/mod3'], function(){});
				};
			});`,
		"lib/mod1.js": "sap.ui.define(['./mod4'], function() {});",
		"lib/mod2.js": TRIVIAL_MODULE,
		"lib/mod3.js": TRIVIAL_MODULE,
		"lib/mod4.js": TRIVIAL_MODULE
	});

	const bundleDefinition = {
		name: "bundle.js",
		sections: [
			{
				mode: "preload",
				filters: [
					"app.js",
				],
				resolve: true,
				resolveConditional: true
			}
		]
	};

	const resolver = new Resolver(pool);

	// act
	const resolvedBundle = await resolver.resolve(bundleDefinition);

	// assert
	t.true(resolvedBundle != null, "resolve() should return a bundle");
	t.is(resolvedBundle.sections.length, 1, "bundle should contain 1 section");
	t.deepEqual(
		sortedCopy(resolvedBundle.sections[0].modules),
		[
			"app.js",
			"lib/mod1.js",
			"lib/mod2.js",
			"lib/mod3.js", // conditional dependency from app.js to lib/mod3 MUST BE included
			"lib/mod4.js",
		], "bundle should contain the expected modules");
});

test.serial("embedd a decomposable bundle", async (t) => {
	const pool = new MockPool({
		"lib/mod1.js": TRIVIAL_MODULE,
		"lib/mod2.js": "sap.ui.define(['lib/mod4'], function() {});",
		"lib/mod3.js": TRIVIAL_MODULE,
		"lib/mod4.js": TRIVIAL_MODULE,
		"vendor/decomposable-bundle.js": `
			define("embedded/mod1", function() {});
			define("lib/mod2", function() {});
			define("embedded/mod3", function() {});`
	});

	const bundleDefinition = {
		name: "bundle.js",
		sections: [
			{
				mode: "preload",
				filters: [
					"vendor/"
				],
				resolve: true
			}
		]
	};

	const resolver = new Resolver(pool);

	const resolvedBundle = await resolver.resolve(bundleDefinition);

	t.true(resolvedBundle != null, "resolve() should return a bundle");
	t.is(resolvedBundle.sections.length, 1, "bundle should contain 1 section");
	t.deepEqual(
		sortedCopy(resolvedBundle.sections[0].modules),
		[
			"lib/mod2.js",
			"lib/mod4.js"
		], "new bundle should contain the available modules of the decomposed bundle");
});

test.serial("embedd a non-decomposable bundle", async (t) => {
	const pool = new MockPool({
		"lib/mod1.js": TRIVIAL_MODULE,
		"lib/mod2.js": TRIVIAL_MODULE,
		"lib/mod3.js": "sap.ui.define(['lib/mod4'], function() {});",
		"lib/mod4.js": TRIVIAL_MODULE,
		"vendor/non-decomposable-bundle.js": `
			define("external/mod1", function() {});
			define("external/mod2", function() {});
			define("external/mod3", function() {});`
	});

	const bundleDefinition = {
		name: "bundle.js",
		sections: [
			{
				mode: "preload",
				filters: [
					"vendor/"
				],
				resolve: true
			}
		]
	};

	const resolver = new Resolver(pool);

	const resolvedBundle = await resolver.resolve(bundleDefinition);

	t.true(resolvedBundle != null, "resolve() should return a bundle");
	t.is(resolvedBundle.sections.length, 1, "bundle should contain 1 section");
	t.deepEqual(
		sortedCopy(resolvedBundle.sections[0].modules),
		[
			"vendor/non-decomposable-bundle.js"
		], "new bundle should contain the non-decomposable bundle");
});

test.serial("no errors for dependencies between non-decomposable bundles", async (t) => {
	const errorLogStub = sinon.stub();
	const myLoggerInstance = {
		error: errorLogStub,
		silly: sinon.stub(),
		verbose: sinon.stub()
	};
	const ResolverWithStub = await esmock("../../../../lib/lbt/bundle/Resolver", {
		"@ui5/logger": {
			getLogger: () => myLoggerInstance
		}
	});

	const pool = new MockPool({
		"lib/mod1.js": TRIVIAL_MODULE,
		"lib/mod2.js": TRIVIAL_MODULE,
		"lib/mod3.js": "sap.ui.define(['lib/mod4'], function() {});",
		"lib/mod4.js": TRIVIAL_MODULE,
		"vendor/non-decomposable-bundle1.js": `
			define("external1/mod1", function() {});
			define("external1/mod2", function() {});
			define("external1/mod3", function() {});
			define("external1/mod4", function() {});`,
		"vendor/non-decomposable-bundle2.js": `
			define("external2/mod1", ["lib/mod1"], function() {}); // exists in pool 
			define("external2/mod2", ["external1/mod1"], function() {}); // exists in previous bundle
			define("external2/mod3", ["external2/mod2"], function() {}); // exists in this bundle
			define("external2/mod4", ["external3/mod3"], function() {}); // exists in next bundle
			define("external2/mod5", ["external4/mod1"], function() {}); // missing`,
		"vendor/non-decomposable-bundle3.js": `
			define("external3/mod1", function() {});
			define("external3/mod2", function() {});
			define("external3/mod3", function() {});`
	});

	const bundleDefinition = {
		name: "bundle.js",
		sections: [
			{
				mode: "preload",
				filters: [
					"vendor/"
				],
				resolve: true
			}
		]
	};

	const resolver = new ResolverWithStub(pool);

	const resolvedBundle = await resolver.resolve(bundleDefinition);

	t.true(resolvedBundle != null, "resolve() should return a bundle");
	t.is(resolvedBundle.sections.length, 1, "bundle should contain 1 section");
	t.deepEqual(
		sortedCopy(resolvedBundle.sections[0].modules),
		[
			"lib/mod1.js",
			"vendor/non-decomposable-bundle1.js",
			"vendor/non-decomposable-bundle2.js",
			"vendor/non-decomposable-bundle3.js"
		], "new bundle should contain the non-decomposable bundle");

	t.is(errorLogStub.callCount, 1, "One error reported");
	t.is(errorLogStub.firstCall.args[0],
		"**** error: missing module external4/mod1.js, required by vendor/non-decomposable-bundle2.js",
		"only the expected missing module is reported");
});
