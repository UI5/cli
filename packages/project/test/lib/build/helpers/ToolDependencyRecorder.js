import test from "ava";
import {createRequire} from "node:module";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {startCapture, stopCapture} from "../../../../lib/build/helpers/ToolDependencyRecorder.js";

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
	// because stopCapture adds it explicitly (CPOUI5FOUNDATION-1386). This is what makes a version-only
	// bump observable.
	t.true(files.some((file) => file.endsWith(path.join("stub-tool", "package.json"))),
		"folds the tool package's package.json into the set even though it is not imported");
});
