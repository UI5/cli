import test from "ava";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {
	AnyMap,
	originalPositionFor,
} from "@jridgewell/trace-mapping";
import lineColumn from "line-column";
import {graphFromPackageDependencies} from "@ui5/project/graph";
import * as taskRepository from "../../../lib/tasks/taskRepository.js";

const applicationURL = new URL("../../fixtures/sourcemaps/test.application/", import.meta.url);
const applicationDestRootURL = new URL("../../tmp/build/sourcemaps/test.application/", import.meta.url);

test.beforeEach((t) => {
	const readDestFile = async (filePath) => {
		return readFile(new URL(filePath, t.context.destURL), {encoding: "utf8"});
	};

	t.context.assertSourceMapping = async function(t, {
		generatedFilePath,
		sourceFilePath,
		code,
		tracedName = undefined
	}) {
		const generatedFile = await readDestFile(generatedFilePath);
		const sourceFile = await readDestFile(sourceFilePath);
		const sourceMap = JSON.parse(await readDestFile(generatedFilePath + ".map"));
		const tracer = new AnyMap(sourceMap);

		const generatedCodeIndex = generatedFile.indexOf(code);
		t.not(generatedCodeIndex, -1, `Code '${code}' must be present in generated code file '${generatedFilePath}'`);

		const codeLineColumn = lineColumn(generatedFile).fromIndex(generatedCodeIndex);

		const tracedCode = originalPositionFor(tracer, {
			line: codeLineColumn.line,
			column: codeLineColumn.col - 1
		});

		t.is(tracedCode.source, sourceFilePath,
			`Original position of code should be found in source file '${sourceFilePath}'`);

		if (tracedName) {
			t.is(tracedCode.name, tracedName);
		}

		const sourceCodeIndex = lineColumn(sourceFile).toIndex(tracedCode.line, tracedCode.column + 1);
		t.is(
			sourceFile.substring(sourceCodeIndex, sourceCodeIndex + code.length), code,
			"Code should be at right place in source file"
		);
	};
});

test.serial("Verify source maps (test.application)", async (t) => {
	const destURL = t.context.destURL = new URL("./dest-standard-build/", applicationDestRootURL);

	const graph = await graphFromPackageDependencies({
		cwd: fileURLToPath(applicationURL)
	});
	graph.setTaskRepository(taskRepository);

	await graph.build({
		destPath: fileURLToPath(destURL)
	});

	// Default mapping created via minify task
	await t.context.assertSourceMapping(t, {
		generatedFilePath: "JavaScriptSourceWithCopyrightPlaceholder.js",
		sourceFilePath: "JavaScriptSourceWithCopyrightPlaceholder-dbg.js",
		code: "sap.ui.define(",
		tracedName: "sap"
	});
	await t.context.assertSourceMapping(t, {
		generatedFilePath: "JavaScriptSourceWithCopyrightPlaceholder.js",
		sourceFilePath: "JavaScriptSourceWithCopyrightPlaceholder-dbg.js",
		code: "functionWithinJavaScriptSourceWithCopyrightPlaceholder"
	});
	await t.context.assertSourceMapping(t, {
		generatedFilePath: "JavaScriptSourceWithCopyrightPlaceholder.js",
		sourceFilePath: "JavaScriptSourceWithCopyrightPlaceholder-dbg.js",
		code: "functionCallWithinJavaScriptSourceWithCopyrightPlaceholder()",
		tracedName: "functionCallWithinJavaScriptSourceWithCopyrightPlaceholder"
	});

	// Mapping from debug variant to TypeScript source
	await t.context.assertSourceMapping(t, {
		generatedFilePath: "TypeScriptSource-dbg.js",
		sourceFilePath: "TypeScriptSource.ts",
		code: "functionWithinTypeScriptSource"
	});
	await t.context.assertSourceMapping(t, {
		generatedFilePath: "TypeScriptSource-dbg.js",
		sourceFilePath: "TypeScriptSource.ts",
		code: "functionCallWithinTypeScriptSource()",
		tracedName: "functionCallWithinTypeScriptSource"
	});

	// Mapping from minified Javascript to TypeScript source
	await t.context.assertSourceMapping(t, {
		generatedFilePath: "TypeScriptSource.js",
		sourceFilePath: "TypeScriptSource.ts",
		code: "functionWithinTypeScriptSource"
	});
	await t.context.assertSourceMapping(t, {
		generatedFilePath: "TypeScriptSource.js",
		sourceFilePath: "TypeScriptSource.ts",
		code: "functionCallWithinTypeScriptSource()",
		tracedName: "functionCallWithinTypeScriptSource"
	});

	// Mapping from Component-preload.js to JavaScript Source
	await t.context.assertSourceMapping(t, {
		generatedFilePath: "Component-preload.js",
		sourceFilePath: "JavaScriptSourceWithCopyrightPlaceholder-dbg.js",
		code: "sap.ui.define(",
		tracedName: "sap"
	});
	await t.context.assertSourceMapping(t, {
		generatedFilePath: "Component-preload.js",
		sourceFilePath: "JavaScriptSourceWithCopyrightPlaceholder-dbg.js",
		code: "functionWithinJavaScriptSourceWithCopyrightPlaceholder"
	});
	await t.context.assertSourceMapping(t, {
		generatedFilePath: "Component-preload.js",
		sourceFilePath: "JavaScriptSourceWithCopyrightPlaceholder-dbg.js",
		code: "functionCallWithinJavaScriptSourceWithCopyrightPlaceholder()",
		tracedName: "functionCallWithinJavaScriptSourceWithCopyrightPlaceholder"
	});

	// Mapping from Component-preload.js to TypeScript Source
	await t.context.assertSourceMapping(t, {
		generatedFilePath: "Component-preload.js",
		sourceFilePath: "TypeScriptSource.ts",
		code: "functionWithinTypeScriptSource"
	});
	await t.context.assertSourceMapping(t, {
		generatedFilePath: "Component-preload.js",
		sourceFilePath: "TypeScriptSource.ts",
		code: "functionCallWithinTypeScriptSource()",
		tracedName: "functionCallWithinTypeScriptSource"
	});
});
