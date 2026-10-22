import test from "ava";
import fs from "node:fs/promises";
import {createFixtureTesterFactory, registerBuildHooks} from "./__helper__/ProjectBuilderFixtureTester.js";

// POC for CPOUI5FOUNDATION-1386 — tracking a task's external tool dependencies in the build cache.
//
// A custom task loads a stub tool (fixtures/application.a/node_modules/stub-tool) and uses it to transform
// a resource. The tool's content is a build input, but without this feature the cache never observes it:
// bumping the tool with no @ui5/builder release is a stale cache hit. The ToolDependencyRecorder observes
// the require("stub-tool") resolution during the task and folds the tool's content into the stage
// signature, so a tool change turns a stale hit into a correct miss.
//
// Driven at ProjectBuilder level (fresh build per call) rather than BuildServer: a running server
// memoizes the signature for its lifetime and caches a require()d tool in-process, so it cannot observe a
// tool change. The observable is "did the stage re-run" via project-build-status events, not produced
// bytes (the in-process module cache means a re-run reloads nothing). The second build restores the cache
// from the shared ui5DataDir (SQLite), so this also exercises persist/restore of the tool-content rows.

const FixtureTester = createFixtureTesterFactory("toolContent");
registerBuildHooks(test);

const GRAPH_CONFIG = {rootConfigPath: "ui5-customTask-toolContent.yaml"};

// Per-task build status of one project from the recorded project-build-status events, so a test can
// assert a single task re-ran (task-start) rather than being served from cache (task-skip). Mirrors the
// helper in ProjectBuilder.caching.integration.js (local there, not exported — duplicated intentionally).
function taskStatusOf(t, projectName) {
	const started = new Set();
	const skipped = new Set();
	for (const [event] of t.context.projectBuildStatusEventStub.args) {
		if (event.projectName !== projectName) {
			continue;
		}
		if (event.status === "task-start") {
			started.add(event.taskName);
		} else if (event.status === "task-skip") {
			skipped.add(event.taskName);
		}
	}
	return {started, skipped};
}

test.serial(
	"Tool content bump re-runs only the stage that loaded the tool (CPOUI5FOUNDATION-1386, scenario A1)",
	async (t) => {
		const fixtureTester = new FixtureTester(t, "application.a");
		const destPath = fixtureTester.destPath;

		// #1 build (cold cache): the "tool-content-task" stage loads stub-tool@1. The recorder captures its
		// file set and content-hashes it into the stage signature.
		await fixtureTester.buildProject({
			graphConfig: GRAPH_CONFIG,
			config: {destPath, cleanDest: false},
		});
		t.true(taskStatusOf(t, "application.a").started.has("tool-content-task"),
			"Cold build runs the tool-content task");

		// Scenario A1 — the ticket: bump stub-tool (new version AND changed content) with no @ui5/builder
		// release. Nothing else changes: no project source, no dependency, no @ui5/* version.
		const toolMain = `${fixtureTester.fixturePath}/node_modules/stub-tool/index.js`;
		const toolPkg = `${fixtureTester.fixturePath}/node_modules/stub-tool/package.json`;
		await fs.writeFile(toolMain, "module.exports = (src) => `${src}\\n// stub-tool@2\\n`;\n");
		const pkg = JSON.parse(await fs.readFile(toolPkg, {encoding: "utf8"}));
		pkg.version = "2.0.0";
		await fs.writeFile(toolPkg, `${JSON.stringify(pkg, null, 2)}\n`);

		// #2 build (warm cache): the ONLY input that moved is the tool's content.
		await fixtureTester.buildProject({
			graphConfig: GRAPH_CONFIG,
			config: {destPath, cleanDest: true},
		});
		const status = taskStatusOf(t, "application.a");

		// THE BUG (CPOUI5FOUNDATION-1386): without tool tracking the stage is a stale cache hit. With it,
		// the content-hash moves, the stage signature misses, and the stage re-runs.
		t.true(status.started.has("tool-content-task"),
			"The stage that loaded the bumped tool re-ran");
		t.false(status.skipped.has("tool-content-task"),
			"The tool-loading stage was NOT served from a stale cache after the tool changed");

		// Scenario C1 — scoping: a stage that did not load the tool stays cached (only the tool-loading
		// stage re-runs, nothing else).
		t.true(status.skipped.has("replaceVersion"),
			"An unrelated stage is still served from cache — the tool change did not invalidate everything");
	});

test.serial(
	"No change between builds keeps the tool-loading stage cached (no over-invalidation)",
	async (t) => {
		const fixtureTester = new FixtureTester(t, "application.a");
		const destPath = fixtureTester.destPath;

		await fixtureTester.buildProject({
			graphConfig: GRAPH_CONFIG,
			config: {destPath, cleanDest: false},
		});

		// Rebuild with nothing changed: the tool content is identical, so its digest is stable and the
		// stage must stay cached (a re-hash of identical content must not be a false re-run).
		await fixtureTester.buildProject({
			graphConfig: GRAPH_CONFIG,
			config: {destPath, cleanDest: true},
		});
		const status = taskStatusOf(t, "application.a");
		// Identical tool content must not re-run the stage. A fully-unchanged rebuild is served from the
		// project-level result cache (no per-task events fire at all), so the meaningful signal is the
		// absence of a re-run, not a skip event.
		t.false(status.started.has("tool-content-task"),
			"With no change, the tool-loading stage does not re-run");
	});
