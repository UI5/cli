const test = require("ava");

const ShimCollection = require("../../../lib/graph/ShimCollection");

test("Add shims", (t) => {
	const collection = new ShimCollection();
	collection.addProjectShim({
		getName: () => "shim-1",
		getConfigurationShims: () => {
			return {
				"module-1": "configuration shim 1-1",
				"module-2": "configuration shim 2-1"
			};
		},
		getDependencyShims: () => {
			return {
				"module-1": ["dependency shim 1-1"],
				"module-2": ["dependency shim 2-1"]
			};
		},
		getCollectionShims: () => {
			return {
				"module-1": "collection shim 1-1",
				"module-2": "collection shim 2-1"
			};
		},
	});
	collection.addProjectShim({
		getName: () => "shim-2",
		getConfigurationShims: () => {
			return {
				"module-1": "configuration shim 1-2",
				"module-2": "configuration shim 2-2"
			};
		},
		getDependencyShims: () => {
			return {
				"module-1": ["dependency shim 1-2"],
				"module-2": ["dependency shim 2-2"]
			};
		},
		getCollectionShims: () => {
			return {
				"module-1": "collection shim 1-2",
				"module-2": "collection shim 2-2"
			};
		},
	});

	t.deepEqual(collection.getProjectConfigurationShims("module-1"), [{
		name: "shim-1",
		shim: "configuration shim 1-1",
	}, {
		name: "shim-2",
		shim: "configuration shim 1-2",
	}], "Returns correct project configuration shims for module-1");

	t.deepEqual(collection.getCollectionShims("module-2"), [{
		name: "shim-1",
		shim: "collection shim 2-1",
	}, {
		name: "shim-2",
		shim: "collection shim 2-2",
	}], "Returns correct collection shims for module-2");

	t.deepEqual(collection.getAllDependencyShims(), {
		"module-1": [{
			name: "shim-1",
			shim: ["dependency shim 1-1"],
		}, {
			name: "shim-2",
			shim: ["dependency shim 1-2"],
		}],
		"module-2": [{
			name: "shim-1",
			shim: ["dependency shim 2-1"],
		}, {
			name: "shim-2",
			shim: ["dependency shim 2-2"],
		}]
	}, "Returns correct dependency shims");
});
