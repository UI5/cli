import test from "ava";
import sinonGlobal from "sinon";
import esmock from "esmock";
import runTask from "../../../lib/tasks/runTask.js";

test.beforeEach(async (t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();
	t.context.workspace = {
		byGlob: sinon.stub().resolves([]),
		byPath: sinon.stub().resolves(null),
		write: sinon.stub().resolves()
	};
	t.context.taskUtil = {
		setTag: sinon.stub(),
		getTag: sinon.stub(),
		getEnv: sinon.stub().returns(undefined),
		STANDARD_TAGS: {
			HasDebugVariant: "has debug variant",
			IsDebugVariant: "is debug variant",
			OmitFromBuildResult: "omit from build result"
		},
		registerCleanupTask: sinon.stub()
	};
	t.context.fsInterfaceStub = sinon.stub().returns("fs interface");
	t.context.minifierStub = sinon.stub();
	t.context.log = {warn: sinon.stub()};
	t.context.minify = await esmock.p("../../../lib/tasks/minify.js", {
		"@ui5/fs/fsInterface": t.context.fsInterfaceStub,
		"../../../lib/processors/minifier.js": t.context.minifierStub,
		"@ui5/logger": {
			getLogger: sinon.stub().withArgs("builder:tasks:minify").returns(t.context.log)
		}
	});
});

test.afterEach.always(async (t) => {
	for (const call of t.context.taskUtil.registerCleanupTask.getCalls()) {
		await call.firstArg();
	}
	esmock.purge(t.context.minify);
	t.context.sinon.restore();
});

// Shared setup for test categories 1-3 below:
function setup(t, paths, debugSourceMaps = []) {
	const {workspace, minifierStub} = t.context;
	const resources = new Map(paths.map((resourcePath) => [resourcePath, {getPath: () => resourcePath}]));
	const processed = new Map(paths.map((resourcePath) => [resourcePath, {
		resource: `resource ${resourcePath}`,
		dbgResource: `dbgResource ${resourcePath}`,
		sourceMapResource: `sourceMapResource ${resourcePath}`,
		dbgSourceMapResource: debugSourceMaps.includes(resourcePath) ?
			`dbgSourceMapResource ${resourcePath}` : undefined
	}]));
	workspace.byGlob.resolves([...resources.values()]);
	workspace.byPath.callsFake((resourcePath) => Promise.resolve(resources.get(resourcePath) ?? null));
	minifierStub.callsFake(({resources: [input]}) => Promise.resolve([processed.get(input.getPath())]));
	return {resources, processed};
}

const defaultTags = [
	["resource", "HasDebugVariant"],
	["dbgResource", "IsDebugVariant"],
	["sourceMapResource", "HasDebugVariant"],
	["dbgSourceMapResource", "IsDebugVariant"]
];

// 1. General minify task tests:
// Checks that minify gives the minifier the correct options and writes/tags the resources.
// Covered with/without source-map settings and with/without taskUtil usage.
const optionCases = [{
	name: "Default params",
	options: {},
	useTaskUtil: true,
	processorOptions: {addSourceMappingUrl: true, readSourceMappingUrl: true, useWorkers: true},
	tags: defaultTags
}, {
	name: "omitSourceMapResources: true, useInputSourceMaps: false",
	options: {omitSourceMapResources: true, useInputSourceMaps: false},
	useTaskUtil: true,
	processorOptions: {addSourceMappingUrl: false, readSourceMappingUrl: false, useWorkers: true},
	tags: [
		["resource", "HasDebugVariant"],
		["dbgResource", "IsDebugVariant"],
		["sourceMapResource", "HasDebugVariant"],
		["sourceMapResource", "OmitFromBuildResult"],
		["dbgSourceMapResource", "IsDebugVariant"],
		["dbgSourceMapResource", "OmitFromBuildResult"]
	]
}, {
	name: "No taskUtil",
	options: {},
	useTaskUtil: false,
	processorOptions: {addSourceMappingUrl: true, readSourceMappingUrl: true, useWorkers: false},
	tags: []
}];

for (const scenario of optionCases) {
	test(`minify: ${scenario.name}`, async (t) => {
		const {minify, workspace, taskUtil, minifierStub} = t.context;
		const paths = ["/resources/a.js", "/resources/b.js"];
		const {resources, processed} = setup(t, paths, [paths[0]]);
		const passedTaskUtil = scenario.useTaskUtil ? taskUtil : undefined;
		await runTask(minify, {
			workspace, taskUtil: passedTaskUtil, options: {pattern: "**", ...scenario.options}
		});

		t.true(workspace.byGlob.calledOnceWithExactly("**"), "Resources are discovered with one glob");
		t.deepEqual(minifierStub.getCalls().map((call) => call.firstArg), paths.map((resourcePath) => ({
			resources: [resources.get(resourcePath)],
			fs: "fs interface",
			taskUtil: passedTaskUtil,
			options: scenario.processorOptions
		})), "Each input is processed once with the expected interface and options");
		t.deepEqual(taskUtil.setTag.getCalls().map((call) => call.args), paths.flatMap((resourcePath) => {
			const output = processed.get(resourcePath);
			return scenario.tags.filter(([field]) => output[field]).map(([field, tag]) =>
				[output[field], taskUtil.STANDARD_TAGS[tag]]);
		}), "Correct tags, including optional debug source maps");
		t.deepEqual(workspace.write.getCalls().map((call) => call.firstArg), paths.flatMap((resourcePath) =>
			Object.values(processed.get(resourcePath)).filter(Boolean)), "All processor outputs are written in order");
	});
}


// 2. Exclusion handling:
// Covers various exclusion patterns and checks whether their returned keys are selected for minification.
const matchingPaths = {
	a: "/resources/a.js",
	b: "/resources/b.js",
	nested: "/resources/sub/a.js",
	hidden: "/resources/.hidden.js",
	support: "/resources/Rules.support.js",
	nestedSupport: "/resources/sub/Rules.support.js",
	test: "/test-resources/a.js"
};
const {a, b, nested, hidden, support, nestedSupport, test: testResource} = matchingPaths;
const exclusionCases = [{
	name: "No implicit support-file exclusions",
	excludes: [], expected: Object.values(matchingPaths)
}, {
	name: "Exclusions match absolute virtual paths",
	excludes: [a], expected: [b, nested, hidden, support, nestedSupport, testResource]
}, {
	name: "Exclusions can target paths outside /resources/",
	excludes: ["/test-resources/**/*.js"], expected: [a, b, nested, hidden, support, nestedSupport]
}, {
	name: "Global exclusions have no implicit prefix",
	excludes: ["**/*.js"], expected: []
}, {
	name: "Exclusions match dotfiles and preserve test-resources",
	excludes: ["/resources/**/*.js"], expected: [testResource]
}, {
	name: "Brace patterns and re-inclusions",
	excludes: ["/resources/{a,b}.js", "!/resources/a.js"],
	expected: [a, nested, hidden, support, nestedSupport, testResource]
}, {
	name: "Extglob exclusions",
	excludes: ["/resources/**/+(a|b).js"], expected: [hidden, support, nestedSupport, testResource]
}, {
	name: "Later exclusions override earlier re-inclusions",
	excludes: ["/resources/**/*.js", "!/resources/a.js", "/resources/a.js"], expected: [testResource]
}, {
	name: "A re-inclusion overrides an explicit support exclusion",
	excludes: ["**/*.support.js", "!/resources/Rules.support.js"],
	expected: [a, b, nested, hidden, support, testResource]
}];

for (const scenario of exclusionCases) {
	test(`minify: ${scenario.name}`, async (t) => {
		const {minify, workspace} = t.context;
		setup(t, Object.values(matchingPaths));
		const originalExcludes = [...scenario.excludes];
		const [step] = minify({pattern: "/**/*.js", excludes: scenario.excludes}).steps;
		const keys = await step.keys({workspace});

		t.true(workspace.byGlob.calledOnceWithExactly("/**/*.js"));
		t.deepEqual(scenario.excludes, originalExcludes, "`excludes` array is not mutated");
		t.deepEqual(keys.map((resource) => resource.getPath()), scenario.expected, "Correct exclusions are applied");
	});
}


// 3. Resource handling:
// Checks if resources are processed or skipped/tagged/warned about properly.
// This amounts to ordinary files, debug file pairs, and combined with various exclusion scenarios.
const nonDebug = "/resources/A.js";
const debug = "/resources/A-dbg.js";
const ordinary = "/resources/normal.js";
const pairedInputs = [debug, nonDebug, ordinary]; // Even setting debug first: to not depend on order
const pair = [[nonDebug, debug]];
const resourceCases = [{
	name: "Pair with both members eligible",
	paths: pairedInputs, excludes: [], pairs: pair, processed: [ordinary], warnings: 1
}, {
	name: "Pair with only the non-debug member excluded",
	paths: pairedInputs, excludes: [nonDebug], pairs: pair, processed: [ordinary], warnings: 0
}, {
	name: "Pair with only the debug member excluded",
	paths: pairedInputs, excludes: [debug], pairs: pair, processed: [ordinary], warnings: 1
}, {
	name: "Pair with both members excluded",
	paths: pairedInputs, excludes: [nonDebug, debug], pairs: pair, processed: [ordinary], warnings: 0
}, {
	name: "Pair without taskUtil",
	paths: pairedInputs, excludes: [], pairs: pair, processed: [ordinary], warnings: 1, useTaskUtil: false
}, {
	name: "Standalone -dbg.js without a .js sibling",
	paths: ["/resources/standalone-dbg.js"], excludes: [], pairs: [],
	processed: ["/resources/standalone-dbg.js"], warnings: 0
}, {
	name: "Excluded standalone files",
	paths: [nonDebug, "/resources/B-dbg.js"], excludes: ["**"], pairs: [], processed: [], warnings: 0
}];

for (const scenario of resourceCases) {
	test(`minify: ${scenario.name}`, async (t) => {
		const {minify, workspace, taskUtil, minifierStub, log} = t.context;
		const {resources, processed} = setup(t, scenario.paths);
		const useTaskUtil = scenario.useTaskUtil ?? true;
		const context = {workspace, taskUtil: useTaskUtil ? taskUtil : undefined};
		const [step] = minify({pattern: "/resources/**/*.js", excludes: scenario.excludes}).steps;
		const keys = await step.keys(context);

		t.true(workspace.byGlob.calledOnceWithExactly("/resources/**/*.js"));
		t.is(keys.filter((key) => typeof key === "string").length, scenario.pairs.length,
			"Pair scenario: each pair should get a string generated for");
		t.deepEqual(keys.filter((key) => typeof key !== "string"), scenario.processed.map((p) => resources.get(p)),
			"Standalone scenario: non-excluded standalone resources should get processed");
		t.false(taskUtil.setTag.called, "Key enumeration has no tag side effects");
		t.false(workspace.write.called);
		t.false(minifierStub.called);

		for (const key of keys) {
			await step.each(key, context);
		}

		t.deepEqual(minifierStub.getCalls().map((call) => call.firstArg.resources),
			scenario.processed.map((p) => [resources.get(p)]), "Only standalone resources are minified");
		const expectedTags = scenario.pairs.flatMap(([resourcePath, dbgPath]) => [
			[resources.get(resourcePath), taskUtil.STANDARD_TAGS.HasDebugVariant],
			[resources.get(dbgPath), taskUtil.STANDARD_TAGS.IsDebugVariant]
		]).concat(scenario.processed.flatMap((resourcePath) => {
			const output = processed.get(resourcePath);
			return defaultTags.filter(([field]) => output[field]).map(([field, tag]) =>
				[output[field], taskUtil.STANDARD_TAGS[tag]]);
		}));
		t.deepEqual(taskUtil.setTag.getCalls().map((call) => call.args), useTaskUtil ? expectedTags : [],
			"Pairs are tagged even when excluded; standalone files get tags only when processed");
		t.deepEqual(workspace.write.getCalls().map((call) => call.firstArg), scenario.processed.flatMap((p) =>
			Object.values(processed.get(p)).filter(Boolean)), "Correct processed resources are written");
		t.is(log.warn.callCount, scenario.warnings,
			"Warn only for the dbg/non-dbg pairs (but only for the non-dbg one)");
		for (const call of log.warn.getCalls()) {
			const [resourcePath, dbgPath] = scenario.pairs[0];
			t.true(call.firstArg.startsWith(`Skipping minification of ${resourcePath}: `+
				`a debug variant ${dbgPath} already exists next to it.`), "Correct warning is logged");
		}
	});
}
