import test from "ava";
import fs from "node:fs/promises";
import path from "node:path";
import {createFixtureTesterFactory, registerBuildHooks} from "./__helper__/ProjectBuilderFixtureTester.js";

// A custom task that loads its tool ONLY inside a worker it spawns itself (task.tool-content-worker.js ->
// tool-content-worker.js requires stub-tool). The worker realm is invisible to the main-thread recorder, so
// the tool is not tracked and a bump of it is served from a stale cache. This pins the documented known
// limitation (NOTES.md 2.6): a custom task must resolve its tool on the main thread to have it tracked.
// This is a boundary test of current behavior, not a bug to fix: the gap fails safe (a stale hit a new
// @ui5/builder release clears), and the convention steers authors away from it.

const FixtureTester = createFixtureTesterFactory("toolContentWorker");
registerBuildHooks(test);

const GRAPH_CONFIG = {rootConfigPath: "ui5-customTask-toolContentWorker.yaml"};

// Reads the transformed resource from the build output by locating the file carrying the stub-tool marker.
// The task appends "// stub-tool@<version>" to test.js, so the marker reveals which tool version produced
// the cached output. Returns the marker string ("stub-tool@1" / "stub-tool@2") or null.
async function builtToolMarker(destPath) {
	async function walk(dir) {
		const entries = await fs.readdir(dir, {withFileTypes: true});
		for (const entry of entries) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				const found = await walk(full);
				if (found) {
					return found;
				}
			} else if (entry.name === "test.js") {
				const content = await fs.readFile(full, {encoding: "utf8"});
				const m = content.match(/stub-tool@\d+/);
				if (m) {
					return m[0];
				}
			}
		}
		return null;
	}
	return walk(destPath);
}

test.serial(
	"A tool loaded only inside a task-spawned worker is not tracked (documented limitation)",
	async (t) => {
		const fixtureTester = new FixtureTester(t, "application.a");
		const destPath = fixtureTester.destPath;

		// #1 build (cold): the task runs and transforms test.js via the worker, which requires stub-tool@1.
		// That resolution happens in the worker realm, invisible to the main-thread recorder, so no stub-tool
		// files enter the task's tool-content signature. The output carries the "// stub-tool@1" marker.
		await fixtureTester.buildProject({
			graphConfig: GRAPH_CONFIG,
			config: {destPath, cleanDest: false},
		});
		t.is(await builtToolMarker(destPath), "stub-tool@1", "Cold build transforms with stub-tool@1");

		// Bump stub-tool (new version AND changed content), exactly as the tracked top-level-import test does.
		const toolMain = `${fixtureTester.fixturePath}/node_modules/stub-tool/index.js`;
		const toolPkg = `${fixtureTester.fixturePath}/node_modules/stub-tool/package.json`;
		await fs.writeFile(toolMain, "module.exports = (src) => `${src}\\n// stub-tool@2\\n`;\n");
		const pkg = JSON.parse(await fs.readFile(toolPkg, {encoding: "utf8"}));
		pkg.version = "2.0.0";
		await fs.writeFile(toolPkg, `${JSON.stringify(pkg, null, 2)}\n`);

		// #2 build (warm): because the worker-loaded tool was never recorded, the bump moves no signature, the
		// project is restored from the result cache, and the task never re-runs. The output still carries the
		// stale "// stub-tool@1" marker. A tracked tool (the top-level-import and in-body-import tests) would
		// instead re-run and produce "stub-tool@2"; this is the opposite, stale, outcome.
		await fixtureTester.buildProject({
			graphConfig: GRAPH_CONFIG,
			config: {destPath, cleanDest: true},
		});
		t.is(await builtToolMarker(destPath), "stub-tool@1",
			"After the worker-only tool is bumped, the stale stub-tool@1 output is served (tool not tracked)");
	});

