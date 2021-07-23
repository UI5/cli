const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");
const logger = require("@ui5/logger");

test.beforeEach((t) => {
	t.context.log = {
		warn: sinon.stub()
	};
	sinon.stub(logger, "getLogger").withArgs("cli:utils:buildHelper").returns(t.context.log);
	t.context.buildHelper = mock.reRequire("../../../lib/utils/buildHelper");
});

test.afterEach.always((t) => {
	sinon.restore();
	mock.stopAll();
});

test.serial("getFlattenedDependencyTree", (t) => {
	const {getFlattenedDependencyTree} = t.context.buildHelper;
	const tree = {
		metadata: {
			name: "Sample"
		},
		dependencies: [{
			metadata: {
				name: "a0"
			},
			dependencies: [{
				metadata: {
					name: "b"
				},
				dependencies: [{
					metadata: {
						name: "c"
					},
					dependencies: [{
						metadata: {
							name: "d0"
						},
						dependencies: []
					}, {
						metadata: {
							name: "d1"
						},
						dependencies: []
					}]
				}]
			}]
		}, {
			metadata: {
				name: "a1"
			},
			dependencies: [{
				metadata: {
					name: "c"
				},
				dependencies: [{
					metadata: {
						name: "d0"
					},
					dependencies: []
				}, {
					metadata: {
						name: "d1"
					},
					dependencies: []
				}]
			}]
		}]
	};

	t.deepEqual(getFlattenedDependencyTree(tree), {
		a0: ["b", "c", "d0", "d1"],
		a1: ["c", "d0", "d1"],
		b: ["c", "d0", "d1"],
		c: ["d0", "d1"],
		d0: [],
		d1: []
	});
});

function assertCreateDependencyLists(t, {
	includeDependency, includeDependencyRegExp, includeDependencyTree,
	excludeDependency, excludeDependencyRegExp, excludeDependencyTree,
	defaultIncludeDependency, defaultIncludeDependencyRegExp, defaultIncludeDependencyTree,
	expectedIncludedDependencies, expectedExcludedDependencies
}) {
	const {createDependencyLists} = t.context.buildHelper;
	const tree = {
		metadata: {
			name: "Sample"
		},
		dependencies: [{
			metadata: {
				name: "a0"
			},
			dependencies: [{
				metadata: {
					name: "b0"
				},
				dependencies: []
			}, {
				metadata: {
					name: "b1"
				},
				dependencies: [{
					metadata: {
						name: "c"
					},
					dependencies: []
				}]
			}]
		}, {
			metadata: {
				name: "a1"
			},
			dependencies: [{
				metadata: {
					name: "b0"
				},
				dependencies: []
			}, {
				metadata: {
					name: "b1"
				},
				dependencies: [{
					metadata: {
						name: "c"
					},
					dependencies: []
				}]
			}, {
				metadata: {
					name: "b2"
				},
				dependencies: []
			}]
		}, {
			metadata: {
				name: "a2"
			},
			dependencies: [{
				metadata: {
					name: "b3"
				},
				dependencies: []
			}]
		}]
	};

	const {includedDependencies, excludedDependencies} = createDependencyLists({
		tree: tree,
		includeDependency: includeDependency,
		includeDependencyRegExp: includeDependencyRegExp,
		includeDependencyTree: includeDependencyTree,
		excludeDependency: excludeDependency,
		excludeDependencyRegExp: excludeDependencyRegExp,
		excludeDependencyTree: excludeDependencyTree,
		defaultIncludeDependency: defaultIncludeDependency,
		defaultIncludeDependencyRegExp: defaultIncludeDependencyRegExp,
		defaultIncludeDependencyTree: defaultIncludeDependencyTree
	});
	t.deepEqual(includedDependencies, expectedIncludedDependencies);
	t.deepEqual(excludedDependencies, expectedExcludedDependencies);
}

test.serial("createDependencyLists: only includes", (t) => {
	assertCreateDependencyLists(t, {
		includeDependency: ["a1", "b2"],
		includeDependencyRegExp: ["^b0$"],
		includeDependencyTree: ["a2"],
		expectedIncludedDependencies: ["a1", "b2", "b0", "a2", "b3"],
		expectedExcludedDependencies: []
	});
});

test.serial("createDependencyLists: only excludes", (t) => {
	assertCreateDependencyLists(t, {
		excludeDependency: ["a1", "b2"],
		excludeDependencyRegExp: ["^b0$"],
		excludeDependencyTree: ["a2"],
		expectedIncludedDependencies: [],
		expectedExcludedDependencies: ["a1", "b2", "b0", "a2", "b3"]
	});
});

test.serial("createDependencyLists: includeDependencyTree has lower priority than excludes", (t) => {
	assertCreateDependencyLists(t, {
		includeDependencyTree: ["a1"],
		excludeDependency: ["a1"],
		excludeDependencyRegExp: ["^b[0-2]$"],
		expectedIncludedDependencies: ["c"],
		expectedExcludedDependencies: ["a1", "b0", "b1", "b2"]
	});
});

test.serial("createDependencyLists: excludeDependencyTree has lower priority than includes", (t) => {
	assertCreateDependencyLists(t, {
		includeDependency: ["a1"],
		includeDependencyRegExp: ["^b[0-2]$"],
		excludeDependencyTree: ["a1"],
		expectedIncludedDependencies: ["a1", "b0", "b1", "b2"],
		expectedExcludedDependencies: ["c"]
	});
});

test.serial("createDependencyLists: includeDependencyTree has higher priority than excludeDependencyTree", (t) => {
	assertCreateDependencyLists(t, {
		includeDependencyTree: ["a1"],
		excludeDependencyTree: ["a1"],
		expectedIncludedDependencies: ["a1", "b0", "b1", "c", "b2"],
		expectedExcludedDependencies: []
	});
});

test.serial("createDependencyLists: defaultIncludeDependency/RegExp has lower priority than excludes", (t) => {
	assertCreateDependencyLists(t, {
		defaultIncludeDependency: ["a1", "b2", "c"],
		defaultIncludeDependencyRegExp: ["^b0$"],
		excludeDependency: ["a1"],
		excludeDependencyRegExp: ["^b.$"],
		expectedIncludedDependencies: ["c"],
		expectedExcludedDependencies: ["a1", "b0", "b1", "b2", "b3"]
	});
});

test.serial("createDependencyLists: defaultIncludeDependencyTree has lower priority than excludes", (t) => {
	assertCreateDependencyLists(t, {
		defaultIncludeDependencyTree: ["a1"],
		excludeDependencyTree: ["b1"],
		expectedIncludedDependencies: ["a1", "b0", "b2"],
		expectedExcludedDependencies: ["b1", "c"]
	});
});

test.serial("alignWithBuilderApi: * is added to excludedDependencies", (t) => {
	const {alignWithBuilderApi} = t.context.buildHelper;
	const args = {
		includedDependencies: ["a"],
		excludedDependencies: []
	};
	t.is(alignWithBuilderApi(false, args.includedDependencies, args.excludedDependencies), true,
		"Should return true if includedDependencies are given");
	t.deepEqual(args, {
		includedDependencies: ["a"],
		excludedDependencies: ["*"]
	});
});

test.serial("alignWithBuilderApi: includedDependencies=* is is an alias for buildAll", (t) => {
	const {alignWithBuilderApi} = t.context.buildHelper;
	const args = {
		includedDependencies: ["*"],
		excludedDependencies: []
	};
	t.is(alignWithBuilderApi(false, args.includedDependencies, args.excludedDependencies), true,
		"Should return true if includedDependencies are given");
	t.deepEqual(args, {
		includedDependencies: [],
		excludedDependencies: []
	});
});
