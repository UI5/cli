import test from "ava";
import {createRequire} from "node:module";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
	startCapture, stopCapture, shareToolFiles, isToolFile,
} from "../../../../lib/build/helpers/ToolDependencyRecorder.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// A real, non-@ui5 node_modules package (the integration fixture's stub tool). Requiring it through a
// require anchored at the package resolves its index.js. This file runs in its own AVA process, so the
// package is loaded fresh here — the resolve hook only fires on a module's FIRST resolution in a process
// (a cached require does not re-fire it), which is why this is a dedicated file rather than another case
// in the integration test.
const stubToolDir = path.join(dirname, "../../../fixtures/application.a/node_modules/stub-tool");
const requireFromStubTool = createRequire(path.join(stubToolDir, "index.js"));

test.serial("stopCapture folds each tracked package's package.json into the set", (t) => {
	const handle = startCapture();
	requireFromStubTool("stub-tool");
	const files = stopCapture(handle);

	t.true(files.some((file) => file.endsWith(path.join("stub-tool", "index.js"))),
		"captures the tool's loaded module file");
	// The resolver reads package.json as metadata but the tool never imports it, so it is only in the set
	// because stopCapture adds it explicitly. This is what makes a version-only
	// bump observable.
	t.true(files.some((file) => file.endsWith(path.join("stub-tool", "package.json"))),
		"folds the tool package's package.json into the set even though it is not imported");
});

test.serial("stopCapture denylists build plumbing (workerpool)", (t) => {
	const handle = startCapture();
	// workerpool is a non-@ui5 node_modules package, but it is build plumbing, not a content-transform
	// tool, so it must be excluded via the denylist.
	requireFromStubTool("workerpool");
	const files = stopCapture(handle);

	t.false(files.some((file) => file.includes(`${path.sep}workerpool${path.sep}`)),
		"excludes workerpool (build plumbing)");
});

test.serial("stopCapture records a resolve-only lookup and folds the package.json (the jsdoc path)", (t) => {
	// jsdoc has no dedicated tracking: generateJsdoc resolves jsdoc's entry on the main thread with
	// import.meta.resolve, which resolves without loading the module. That resolve must still fire the hook
	// and be captured, and the recorder must fold in the package's package.json so a jsdoc version bump moves
	// the stage's digest. Uses jsdoc's real entry, the exact specifier generateJsdoc resolves.
	const handle = startCapture();
	import.meta.resolve("jsdoc/jsdoc.js");
	const files = stopCapture(handle);

	t.true(files.some((file) => file.endsWith(path.join("jsdoc", "jsdoc.js"))),
		"a resolve-only lookup (no module load) is captured");
	t.true(files.some((file) => file.endsWith(path.join("jsdoc", "package.json"))),
		"the package's package.json is folded in, so a jsdoc version bump is observed");
});

test("shareToolFiles memoizes a non-empty set and recalls it for a blind capture", (t) => {
	const files = ["/nm/tool/index.js", "/nm/tool/package.json"];

	// First project captures the set: it is stored and returned unchanged.
	t.deepEqual(shareToolFiles("taskA\0stepX", files), files, "a non-empty set is returned as-is");
	// Later project's capture is blind (empty): the stored set is recalled.
	t.deepEqual(shareToolFiles("taskA\0stepX", []), files, "an empty capture recalls the stored set");
});

test("shareToolFiles keeps keys independent and returns empty for an unknown key", (t) => {
	shareToolFiles("taskB\0stepX", ["/nm/b/index.js"]);

	t.deepEqual(shareToolFiles("taskC\0stepX", []), [],
		"an unknown key recalls nothing, not another key's set");
});

test("shareToolFiles does not let a blind capture overwrite a stored set", (t) => {
	const files = ["/nm/tool/index.js"];
	shareToolFiles("taskD\0stepX", files);
	shareToolFiles("taskD\0stepX", []); // blind capture must not clear the memo

	t.deepEqual(shareToolFiles("taskD\0stepX", []), files,
		"the stored set survives an intervening empty capture");
});

test("isToolFile excludes the UI5 tooling packages but tracks @ui5-scoped application packages", (t) => {
	const nm = "file:///app/node_modules/";

	// UI5 tooling packages: their versions are already folded into the build signature, so excluded.
	for (const tooling of ["@ui5/builder", "@ui5/fs", "@ui5/project", "@ui5/logger"]) {
		t.false(isToolFile(`${nm}${tooling}/lib/index.js`), `${tooling} is a barrier (excluded)`);
	}

	// @ui5-scoped application dependencies a task bundles are NOT tooling, so they are tracked. This is
	// the @ui5/webcomponents case: the old flat `@ui5/*` filter dropped them and missed version/entry bumps.
	t.true(isToolFile(`${nm}@ui5/webcomponents/dist/Button.js`),
		"@ui5/webcomponents (an application dependency) is tracked");
	t.true(isToolFile(`${nm}@ui5/webcomponents-base/dist/Device.js`),
		"@ui5/webcomponents-base is tracked");

	// Non-@ui5 packages are tracked; build plumbing is denylisted.
	t.true(isToolFile(`${nm}chart.js/dist/chart.cjs`), "a plain npm package is tracked");
	t.false(isToolFile(`${nm}workerpool/src/index.js`), "workerpool (build plumbing) is excluded");

	// Not under node_modules (e.g. a workspace package resolved to its realpath) is not a tool file.
	t.false(isToolFile("file:///repo/packages/logger/lib/index.js"), "a non-node_modules path is not a tool");
});

test("isToolFile keys the barrier on the owning package, so a tool nested under tooling is tracked", (t) => {
	// The owning package is the LAST /node_modules/ segment. A tool hoisted under a tooling package is
	// attributed to the tool, not the tooling package, so it stays tracked.
	t.true(isToolFile("file:///app/node_modules/@ui5/builder/node_modules/terser/dist/bundle.min.js"),
		"terser nested under @ui5/builder is attributed to terser and tracked");
	// A non-tooling @ui5 package nested under a tooling package is likewise tracked by its own name.
	t.true(isToolFile("file:///app/node_modules/@ui5/project/node_modules/@ui5/webcomponents/dist/a.js"),
		"@ui5/webcomponents nested under @ui5/project is attributed to @ui5/webcomponents and tracked");
});
