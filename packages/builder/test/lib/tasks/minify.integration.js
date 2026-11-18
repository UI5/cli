import test from "ava";
import sinonGlobal from "sinon";
import fs from "node:fs/promises";
import path from "node:path";
import minify from "../../../lib/tasks/minify.js";
import runTask from "../../../lib/tasks/runTask.js";
import * as resourceFactory from "@ui5/fs/resourceFactory";
import DuplexCollection from "@ui5/fs/DuplexCollection";

// Prevent Node.js from interpreting generated sourceMappingURL examples in this test file.
const SOURCE_MAPPING_URL = "//" + "# sourceMappingURL";
const hasDebug = "has debug variant";
const isDebug = "is debug variant";
const omit = "omit from build result";

test.beforeEach((t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();
	t.context.taskUtil = {
		getEnv: (name) => process.env[name],
		setTag: sinon.stub(),
		getTag: sinon.stub().returns(false),
		STANDARD_TAGS: {HasDebugVariant: hasDebug, IsDebugVariant: isDebug, OmitFromBuildResult: omit},
		registerCleanupTask: sinon.stub()
	};
	t.context.warnings = [];
	t.context.onLog = ({level, moduleName, message}) => {
		if (level === "warn" && moduleName === "builder:tasks:minify") {
			t.context.warnings.push(message);
		}
	};
	process.on("ui5.log", t.context.onLog);
});

test.afterEach.always(async (t) => {
	try {
		for (const call of t.context.taskUtil.registerCleanupTask.getCalls()) {
			await call.firstArg();
		}
	} finally {
		process.off("ui5.log", t.context.onLog);
		t.context.sinon.restore();
	}
});

// Shared setup for test categories 1-3 below:
async function setup(t, sources, omitPaths = []) {
	const reader = resourceFactory.createAdapter({virBasePath: "/"});
	const writer = resourceFactory.createAdapter({virBasePath: "/"});
	const workspace = new DuplexCollection({reader, writer});
	for (const [resourcePath, content] of Object.entries(sources)) {
		await reader.write(resourceFactory.createResource({path: resourcePath, string: content}));
	}
	t.context.taskUtil.getTag.callsFake((resource, tag) => tag === omit && omitPaths.includes(resource.getPath()));
	return {reader, writer, workspace};
}

// Helper function to easily retrieve the contents of all resources from a reader:
async function getContents(reader) {
	const resources = await reader.byGlob("/**/*");
	return Object.fromEntries(await Promise.all(resources.map(async (resource) =>
		[resource.getPath(), await resource.getString()])));
}

// 1. General minify task tests:
// Checks that minification produces the expected files under different settings.
// It also checks that invalid JavaScript produces an error.
const source = `
function test(paramA) {
	var variableA = paramA;
	console.log(variableA);
}
test();`;
const minified = "function test(t){var o=t;console.log(o)}test();";
const sourceMap = `{"version":3,"file":"test.js",` +
	`"names":["test","paramA","variableA","console","log"],"sources":["test-dbg.js"],` +
	`"mappings":"AACA,SAASA,KAAKC,GACb,IAAIC,EAAYD,EAChBE,QAAQC,IAAIF,EACb,CACAF","ignoreList":[]}`;
const invalidSource = `
// Top level return will cause a parsing error
return;`;
const errorPath = "/resources/my/namespace/test.js";
const parseError = `Minification failed with error: 'return' outside of function in file ` +
	`${errorPath} (line 3, col 0, pos 48)`;

const optionCases = [{
	name: "minify omitSourceMapResources=true", useTaskUtil: true,
	options: {omitSourceMapResources: true}, expected: minified, mapTags: [hasDebug, omit]
}, {
	name: "minify omitSourceMapResources=false", useTaskUtil: true,
	options: {}, expected: `${minified}\n${SOURCE_MAPPING_URL}=test.js.map`, mapTags: [hasDebug]
}, {
	name: "minify omitSourceMapResources=true (without taskUtil)", useTaskUtil: false,
	options: {omitSourceMapResources: true}, expected: minified, mapTags: []
}, {
	name: "minify omitSourceMapResources=false (without taskUtil)", useTaskUtil: false,
	options: {omitSourceMapResources: false}, expected: `${minified}\n${SOURCE_MAPPING_URL}=test.js.map`, mapTags: []
}, {
	name: "minify error", useTaskUtil: true, options: {omitSourceMapResources: true}, error: parseError
}, {
	name: "minify error (without taskUtil)", useTaskUtil: false,
	options: {omitSourceMapResources: true}, error: parseError
}];

for (const scenario of optionCases) {
	test.serial(`integration: ${scenario.name}`, async (t) => {
		const resourcePath = scenario.error ? errorPath : "/test.js";
		const {writer, workspace} = await setup(t, {[resourcePath]: scenario.error ? invalidSource : source});
		const parameters = {
			workspace, taskUtil: scenario.useTaskUtil ? t.context.taskUtil : undefined,
			options: {pattern: resourcePath, ...scenario.options}
		};
		if (scenario.error) {
			await t.throwsAsync(() => runTask(minify, parameters), {message: scenario.error});
			return;
		}
		await runTask(minify, parameters);

		t.deepEqual(await getContents(writer), {
			"/test.js": scenario.expected, "/test-dbg.js": source, "/test.js.map": sourceMap
		}, "Correct minified content, original debug content and exact source map");
		const expectedTags = scenario.useTaskUtil ? [
			["/test.js", hasDebug], ["/test-dbg.js", isDebug], ...scenario.mapTags.map((tag) => ["/test.js.map", tag])
		] : [];
		t.deepEqual(t.context.taskUtil.setTag.getCalls().map(({args: [resource, tag]}) =>
			[resource.getPath(), tag]).sort(), expectedTags.sort(), "Correct tags on all generated resources");
	});
}


// 2. Exclusion handling:
// Checks that exclusion patterns choose the correct files, whether stored on disk or in memory.
// This amounts to the reader glob matching and the exclusion logic applied to the discovered resources.
const adapterCases = [{name: "Memory", fileSystem: false}, {name: "FileSystem", fileSystem: true}];
const virtualBases = ["/resources/", "/resources/ns/", "/test-resources/"];
const matchingFiles = [
	"a.js", "b.js", "sub/a.js", ".hidden.js", "sub/.hidden.js",
	"Rules.support.js", "sub/Rules.support.js", "name[1].js"
];
const exclusionCases = [
	[], ["*.js"], ["**/*.js"], ["**/.*.js"],
	["**/{a,b}.js", "!**/a.js"], ["**/+(a|b).js"], ["**/!(b).js"],
	["**/*.js", "!**/a.js", "**/a.js"], ["!**/*.support.js"],
	["ns/**/*.js", "!ns/a.js"], ["**/name\\[1\\].js"]
];

for (const scenario of adapterCases) {
	test.serial(`integration: exclusion matching agrees with the ${scenario.name} reader`, async (t) => {
		let fsBasePath;
		if (scenario.fileSystem) {
			const tmp = path.resolve(import.meta.dirname, "../../tmp/minify-excludes");
			await fs.mkdir(tmp, {recursive: true});
			fsBasePath = await fs.mkdtemp(path.join(tmp, "sources-"));
			t.teardown(() => fs.rm(fsBasePath, {recursive: true, force: true}));
		}
		for (const virBasePath of virtualBases) {
			const workspace = resourceFactory.createAdapter({virBasePath, fsBasePath});
			for (const name of matchingFiles) {
				await workspace.write(resourceFactory.createResource({path: virBasePath + name, string: "source"}));
			}
			for (const excludes of exclusionCases) {
				const previousPattern = ["/**/*.js", "!**/*.support.js", ...excludes.map((exclude) =>
					exclude.startsWith("!") ? `/resources/${exclude.slice(1)}` : `!/resources/${exclude}`)];
				const expected = await workspace.byGlob(previousPattern);
				const [step] = minify({pattern: "/**/*.js", excludes: [
					"**/*.support.js",
					...excludes.flatMap((exclude) => resourceFactory.prefixGlobPattern(exclude, "/resources/"))
				]}).steps;
				const keys = await step.keys({workspace});
				t.deepEqual(keys.map((res) => res.getPath()).sort(), expected.map((res) => res.getPath()).sort(),
					`Same eligibility for ${virBasePath} and ${JSON.stringify(excludes)}`);
			}
		}
	});
}


// 3. Resource handling:
// Checks if resources are processed or skipped/tagged/warned about properly.
// This amounts to ordinary files, debug file pairs, and combined with various exclusion scenarios.
const base = "/resources/my/namespace/";
const content = "function a(x){return x;}\n";
const nonDebug = base + "withDbg.js";
const debug = base + "withDbg-dbg.js";
const ordinary = {
	path: base + "normal.js", debug: base + "normal-dbg.js",
	content: `function a(n){return n}\n${SOURCE_MAPPING_URL}=normal.js.map`
};
const pairSources = {[nonDebug]: content, [debug]: content, [ordinary.path]: content};
const pair = [[nonDebug, debug]];
const test1 = base + "test1.js";
const test2 = base + "test2.js";

const resourceCases = [{
	name: "minify skips and tags an existing pair",
	sources: pairSources, pairs: pair, processed: [ordinary], warnings: 1
}, {
	name: "minify tags an excluded pair", options: {excludes: [nonDebug, debug]},
	sources: pairSources, pairs: pair, processed: [ordinary], warnings: 0
}, {
	name: "minify tags a glob-excluded pair", options: {excludes: [base + "withDbg*.js"]},
	sources: pairSources, pairs: pair, processed: [ordinary], warnings: 0
}, {
	name: "minify preserves re-inclusions", options: {excludes: [base + "*.js", "!" + ordinary.path]},
	sources: pairSources, pairs: pair, processed: [ordinary], warnings: 0
}, {
	name: "minify tags a pair with only the non-debug member excluded", options: {excludes: [nonDebug]},
	sources: pairSources, pairs: pair, processed: [ordinary], warnings: 0
}, {
	name: "minify tags a pair with only the debug member excluded", options: {excludes: [debug]},
	sources: pairSources, pairs: pair, processed: [ordinary], warnings: 1
}, {
	name: "pair discovery respects positive scope and UI5 module suffixes",
	options: {pattern: "/resources/scope/**/*.js", excludes: ["**/*.support.js", "**/*.controller.js"]},
	sources: {
		"/resources/scope/Rules.support.js": "not valid JavaScript",
		"/resources/scope/Rules-dbg.support.js": "not valid JavaScript",
		"/resources/scope/Main.controller.js": "not valid JavaScript",
		"/resources/scope/Main-dbg.controller.js": "not valid JavaScript",
		"/resources/scope/Solo.support.js": "not valid JavaScript",
		"/test-resources/scope/A.js": "not valid JavaScript",
		"/test-resources/scope/A-dbg.js": "not valid JavaScript"
	},
	pairs: [
		["/resources/scope/Rules.support.js", "/resources/scope/Rules-dbg.support.js"],
		["/resources/scope/Main.controller.js", "/resources/scope/Main-dbg.controller.js"]
	],
	processed: [], warnings: 0
}, {
	name: "standalone minify has no implicit support-file exclusion", useTaskUtil: false,
	options: {pattern: "/custom/**/*.js"},
	sources: {"/custom/Rules.support.js": "function identity(value) { return value; }\n"},
	pairs: [], warnings: 0,
	processed: [{
		path: "/custom/Rules.support.js", debug: "/custom/Rules-dbg.support.js",
		content: `function identity(n){return n}\n${SOURCE_MAPPING_URL}=Rules.support.js.map`
	}]
}, {
	name: "minify processes a standalone -dbg.js without a .js sibling",
	sources: {[base + "standalone-dbg.js"]: content}, pairs: [], warnings: 0,
	processed: [{
		path: base + "standalone-dbg.js", debug: base + "standalone-dbg-dbg.js",
		content: `function a(n){return n}\n${SOURCE_MAPPING_URL}=standalone-dbg.js.map`
	}]
}, {
	name: "minify with taskUtil and resources tagged with OmitFromBuildResult",
	sources: {
		[test1]: "function test(param1) { var variableA = param1; console.log(variableA); } test();",
		[test2]: "function test(param2) { var variableB = param2; console.log(variableB); } test();"
	},
	pairs: [], omitPaths: [test1], warnings: 0,
	processed: [{
		path: test1, debug: base + "test1-dbg.js", content: `${minified}\n${SOURCE_MAPPING_URL}=test1.js.map`
	}, {
		path: test2, debug: base + "test2-dbg.js", content: `${minified}\n${SOURCE_MAPPING_URL}=test2.js.map`
	}]
}];

for (const scenario of resourceCases) {
	test.serial(`integration: ${scenario.name}`, async (t) => {
		const {writer, workspace} = await setup(t, scenario.sources, scenario.omitPaths);
		const useTaskUtil = scenario.useTaskUtil ?? true;
		await runTask(minify, {
			workspace, taskUtil: useTaskUtil ? t.context.taskUtil : undefined,
			options: {pattern: "/resources/**/*.js", ...scenario.options}
		});

		const written = await getContents(writer);
		t.deepEqual(Object.keys(written).sort(), scenario.processed.flatMap(({path, debug}) =>
			[path, debug, path + ".map"]).sort(), "Only minified inputs and their derived resources are written");
		const actual = await getContents(workspace);
		const expected = {...scenario.sources};
		for (const {path, debug, content} of scenario.processed) {
			expected[path] = content;
			t.is(written[debug], scenario.sources[path], "Generated debug variant preserves the original content");
		}
		for (const [resourcePath, content] of Object.entries(expected)) {
			t.is(actual[resourcePath], content, "Correct output content (transformed or unchanged source)");
		}
		const expectedTags = scenario.pairs.flatMap(([resourcePath, dbgPath]) => [
			[resourcePath, hasDebug], [dbgPath, isDebug]
		]).concat(scenario.processed.flatMap(({path, debug}) => [
			...(scenario.omitPaths?.includes(path) ? [[debug, omit], [path + ".map", omit]] : []),
			[path, hasDebug], [debug, isDebug], [path + ".map", hasDebug]
		]));
		t.deepEqual(t.context.taskUtil.setTag.getCalls().map(({args: [resource, tag]}) =>
			[resource.getPath(), tag]).sort(), useTaskUtil ? expectedTags.sort() : [],
		"Correct tags on pairs and generated resources");
		t.is(t.context.warnings.length, scenario.warnings,
			"Warn only for the dbg/non-dbg pairs (but only for the non-dbg one)");
	});
}
