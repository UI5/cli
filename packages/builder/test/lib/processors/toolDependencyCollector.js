import test from "ava";
import {createRequire} from "node:module";
import {installToolDependencyHook, collectToolDependencies} from "../../../lib/processors/toolDependencyCollector.js";

// less-openui5 is a real, non-@ui5 node_modules dependency of @ui5/builder — the tool buildThemes loads.
// This file runs in its own AVA process, so it is loaded fresh here and the resolve hook fires on its
// first resolution (a cached require does not re-fire it, which is why the worker accumulates at module
// level — asserted by the second-call check below).
const require = createRequire(import.meta.url);

test.serial("collects a required tool's files, including its package.json, and persists across calls", (t) => {
	installToolDependencyHook();

	require("less-openui5");
	const first = collectToolDependencies();

	t.true(first.some((file) => file.includes("/node_modules/less-openui5/")),
		"captures the tool's loaded module files");
	t.true(first.some((file) => file.endsWith("less-openui5/package.json")),
		"folds the tool package's package.json into the set even though it is not imported");
	t.false(first.some((file) => file.includes("/node_modules/@ui5/")),
		"excludes @ui5/* barrier packages");

	// A second require of the same module is served from the module cache and does not re-fire the hook,
	// yet the accumulated set persists — this is what lets a reused worker return the full set on every
	// call (CPOUI5FOUNDATION-1386).
	require("less-openui5");
	const second = collectToolDependencies();
	t.deepEqual(second, first, "the accumulated set persists across calls (capture-once)");
});
