import test from "ava";
import {createRequire} from "node:module";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {
	startCapture, stopCapture, shareToolFiles, isToolFile,
} from "../../../../lib/build/helpers/ToolDependencyRecorder.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// A real, non-@ui5 node_modules package (the integration fixture's stub tool). Requiring it through a
// require anchored at the package resolves its index.js. This file runs in its own AVA process, so the
// package is loaded fresh here, because the resolve hook only fires on a module's FIRST resolution in a
// process (a cached require does not re-fire it), which is why this is a dedicated file rather than another case
// in the integration test.
const stubToolDir = path.join(dirname, "../../../fixtures/application.a/node_modules/stub-tool");
const requireFromStubTool = createRequire(path.join(stubToolDir, "index.js"));

// Fixtures for the capture re-fire test: a CJS and an ESM tool package under node_modules. The CJS one
// exercises the require path (fires only on the first resolution in the process); the ESM one exercises
// the import() path (re-fires on every call even when the module is cached).
const nmDir = path.join(dirname, "../../../fixtures/application.a/node_modules");
const requireRefireTool = createRequire(path.join(nmDir, "cjs-refire-tool", "index.js"));
const esmRefireToolUrl = pathToFileURL(path.join(nmDir, "esm-refire-tool", "index.js")).href;
// A CJS tool required cold only by the nested-capture test, so its resolution fires the hook there (other
// tests do not touch it, so it is not already cached by the time that test runs).
const requireNestedInner = createRequire(path.join(nmDir, "nested-inner-tool", "index.js"));

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

test("shareToolFiles unions a later subset into the stored set rather than replacing it", (t) => {
	// Cold capture of a tool's whole subtree.
	const subtree = ["/nm/tool/entry.js", "/nm/tool/lib/a.js", "/nm/tool/package.json"];
	t.deepEqual(shareToolFiles("taskE\0stepX", subtree), subtree, "first capture is stored and returned");

	// A later project re-captures only the entry (the cached module re-fires the hook for its entry alone).
	// The memo must grow to the union, never shrink to the subset, so the subtree is not lost.
	const unioned = shareToolFiles("taskE\0stepX", ["/nm/tool/entry.js"]);
	t.deepEqual(unioned, subtree, "an entry-only re-capture returns the retained subtree, not the subset");

	// A capture carrying a genuinely new path adds it to the union.
	t.deepEqual(shareToolFiles("taskE\0stepX", ["/nm/tool/lib/b.js"]),
		["/nm/tool/entry.js", "/nm/tool/lib/a.js", "/nm/tool/lib/b.js", "/nm/tool/package.json"],
		"a new path is unioned into the stored set");
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

	// Non-@ui5 packages are tracked, including build plumbing (no special-casing): tracking is fail-safe.
	t.true(isToolFile(`${nm}chart.js/dist/chart.cjs`), "a plain npm package is tracked");
	t.true(isToolFile(`${nm}workerpool/src/index.js`), "workerpool is tracked like any other package");

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

test.serial("a cold require is captured, a warm require of the same module is not, import() always re-fires",
	async (t) => {
		// The capture window observes a module only when a resolution fires the hook. Node's CJS loader
		// returns an already-cached module before consulting the hook, so a second require() of the same
		// module adds nothing; a dynamic import() re-fires on every call even when cached. A tool a capture
		// window must observe therefore has to be loaded for the first time inside that window, or reached via
		// import(). This precondition is why the recorder is sound for the shipped tasks;
		// pinning it here makes a regression (e.g. a loader change, or relying on a warm require) fail loudly.

		// Cold require inside a window: the first resolution in this process fires the hook.
		const cold = startCapture();
		requireRefireTool("cjs-refire-tool");
		const coldFiles = stopCapture(cold);
		t.true(coldFiles.some((f) => f.endsWith(path.join("cjs-refire-tool", "index.js"))),
			"a cold require is captured");

		// Warm require of the now-cached module inside a fresh window: the CJS loader short-circuits before
		// the hook, so nothing is added.
		const warm = startCapture();
		requireRefireTool("cjs-refire-tool");
		const warmFiles = stopCapture(warm);
		t.false(warmFiles.some((f) => f.endsWith(path.join("cjs-refire-tool", "index.js"))),
			"a warm require of an already-cached CJS module is not captured");

		// Dynamic import() re-fires even when the module is cached: capture it twice, both windows see it.
		const esm1 = startCapture();
		await import(esmRefireToolUrl);
		const esm1Files = stopCapture(esm1);
		t.true(esm1Files.some((f) => f.endsWith(path.join("esm-refire-tool", "index.js"))),
			"a cold import() is captured");

		const esm2 = startCapture();
		await import(esmRefireToolUrl);
		const esm2Files = stopCapture(esm2);
		t.true(esm2Files.some((f) => f.endsWith(path.join("esm-refire-tool", "index.js"))),
			"a second import() of the cached module still re-fires the hook and is captured");
	});

test.serial("nested (LIFO) captures attribute resolutions to the window that was open when each fired",
	async (t) => {
		// Only one capture is active at a time, tracked by a previous-pointer stack (startCapture saves the
		// prior active capture, stopCapture restores it). This is correct as long as captures nest strictly:
		// an inner window opens and closes entirely within an outer one. TaskRunner and ProjectBuilder run
		// tasks and projects serially, so the shipped executor only ever nests, never overlaps. This test
		// pins the nesting contract; the serial-execution assumption it rests on is a latent
		// hazard (parallelizing execution would overlap windows and misattribute, and would
		// need AsyncLocalStorage). A resolution fired inside the inner window must land in the inner set, and
		// one fired after the inner closes must land back in the outer set.

		const outer = startCapture();
		// Resolution #1 fires while only the outer window is open -> belongs to outer.
		await import(esmRefireToolUrl);

		const inner = startCapture();
		// Resolution #2 fires while the inner window is open -> belongs to inner, not outer. A dedicated cold
		// CJS module, so its require fires the hook here (a warm require would capture nothing).
		requireNestedInner("nested-inner-tool");
		const innerFiles = stopCapture(inner);

		const outerFiles = stopCapture(outer);

		t.true(innerFiles.some((f) => f.endsWith(path.join("nested-inner-tool", "index.js"))),
			"the inner window captures the resolution fired while it was open");
		t.false(innerFiles.some((f) => f.endsWith(path.join("esm-refire-tool", "index.js"))),
			"the inner window does not capture a resolution fired before it opened");
		t.true(outerFiles.some((f) => f.endsWith(path.join("esm-refire-tool", "index.js"))),
			"the outer window captures its own resolution, restored after the inner window closed");
		t.false(outerFiles.some((f) => f.endsWith(path.join("nested-inner-tool", "index.js"))),
			"the outer window does not absorb the inner window's resolution");
	});
