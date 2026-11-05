import test from "ava";
import fs from "node:fs/promises";
import {createFixtureTesterFactory, registerBuildHooks} from "./__helper__/ProjectBuilderFixtureTester.js";

// A step-based custom task (a steps array, not a single task body) that requires its tool at module TOP
// LEVEL (task.tool-content-toplevel-steps.js). The require resolves when the extension module is loaded,
// before any step's execution window, so only extension-load capture (Task._getImplementation) can track
// it. The step runner folds that load-time set into the step's stage signature. This is the same path a
// standard built-in task's top-level-imported tool takes, exercised here hermetically via stub-tool. Runs
// in its own process, so the extension module loads fresh and its top-level require is observed on the cold
// build.

const FixtureTester = createFixtureTesterFactory("toolContentExtLoadSteps");
registerBuildHooks(test);

const GRAPH_CONFIG = {rootConfigPath: "ui5-customTask-toolContentToplevelSteps.yaml"};

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
	"A step-based custom task's top-level-imported tool is tracked via the load-time fold",
	async (t) => {
		const fixtureTester = new FixtureTester(t, "application.a");
		const destPath = fixtureTester.destPath;

		// #1 build (cold): the extension module loads, its top-level require("stub-tool") resolves inside the
		// extension-load capture, and the step runner folds the files into the step's stage signature.
		await fixtureTester.buildProject({
			graphConfig: GRAPH_CONFIG,
			config: {destPath, cleanDest: false},
		});
		t.true(taskStatusOf(t, "application.a").started.has("tool-content-toplevel-steps-task"),
			"Cold build runs the task");

		// Bump stub-tool (new version AND changed content). The task imports it at module top level, so the
		// step's execution-window hook never saw it; only the extension-load fold recorded it on build #1.
		const toolMain = `${fixtureTester.fixturePath}/node_modules/stub-tool/index.js`;
		const toolPkg = `${fixtureTester.fixturePath}/node_modules/stub-tool/package.json`;
		await fs.writeFile(toolMain, "module.exports = (src) => `${src}\\n// stub-tool@2\\n`;\n");
		const pkg = JSON.parse(await fs.readFile(toolPkg, {encoding: "utf8"}));
		pkg.version = "2.0.0";
		await fs.writeFile(toolPkg, `${JSON.stringify(pkg, null, 2)}\n`);

		// #2 build (warm): the step's recorded tool set re-hashes the bumped stub-tool from disk, the digest
		// moves, the stage misses. (The extension module is cached in this process, so build #2's own
		// load-time capture is empty; the recorded set from build #1 plus the sticky record keep it stable.)
		await fixtureTester.buildProject({
			graphConfig: GRAPH_CONFIG,
			config: {destPath, cleanDest: true},
		});
		const status = taskStatusOf(t, "application.a");
		t.true(status.started.has("tool-content-toplevel-steps-task"),
			"After the top-level-imported tool is bumped, the step-based task re-runs");
		t.false(status.skipped.has("tool-content-toplevel-steps-task"),
			"The task was NOT served from a stale cache");
	});
