import test from "ava";
import fs from "node:fs/promises";
import {createFixtureTesterFactory, registerBuildHooks} from "./__helper__/ProjectBuilderFixtureTester.js";

// SKELETON (red-first) for CPOUI5FOUNDATION-1386 — tracking a task's external tool dependencies in the
// build cache. See NOTES.md ("Scenarios" A1) for the full design. This file is a STARTING POINT, not a
// finished test: it depends on fixture scaffolding and on the feature itself, both listed below.
//
// WHY ProjectBuilder level, not BuildServer: a long-running server memoizes the build signature for its
// lifetime (that separate, already-known gap is parked as BuildServer.buildSignature.integration.js's own
// `.failing` test), and a `require`d tool is cached in-process, so a running server cannot observe a tool
// content change at all. Each `buildProject()` here is a fresh validation pass against the persistent
// cache, which isolates the mechanism under test: does a tool's content change invalidate the stage that
// loaded it. The observable is "did the stage re-run" (via project-build-status events), NOT the produced
// bytes — the in-process module cache means a re-run reloads nothing, so asserting new output would be
// wrong here. The byte-faithful, fresh-process variant belongs in internal/e2e-tests.
//
// WHY a stub-tool custom task, not the literal less-openui5 bump: the standard buildThemes/minify tasks
// import their tool by bare specifier, resolved from @ui5/builder's own install (the hoisted monorepo
// node_modules), NOT from the fixture's node_modules — so a tool planted under the fixture is not what the
// worker loads. A custom task that loads a controllable stub tool from the fixture's own node_modules is
// the hermetic stand-in for the mechanism, and it exercises the custom-task path (CPOUI5FOUNDATION-1396)
// at the same time. The literal less-openui5/terser wiring is the e2e counterpart.
//
// FIXTURE SCAFFOLDING REQUIRED (mirrors the existing task.build-signature.js + ui5-customTask-*.yaml
// pattern in fixtures/application.a):
//   1. fixtures/application.a/node_modules/stub-tool/package.json
//        {"name": "stub-tool", "version": "1.0.0", "main": "index.js"}
//   2. fixtures/application.a/node_modules/stub-tool/index.js  (the v1 tool — a trivial transform)
//        module.exports = (src) => `${src}\n// stub-tool@1\n`;
//   3. fixtures/application.a/task.tool-content.js  (custom task that LOADS the stub tool and uses it,
//        so the tool is a module the recorder can observe; afterTask: minify)
//        module.exports = function build() {
//          return {task: async ({workspace, options: {projectNamespace}}) => {
//            const transform = require("stub-tool");                 // <- the tracked tool load
//            const r = await workspace.byPath(`/resources/${projectNamespace}/test.js`);
//            if (r) { r.setString(transform(await r.getString())); await workspace.write(r); }
//          }};
//        };
//   4. fixtures/application.a/ui5-customTask-toolContent.yaml  (wires "tool-content-task" -> task.tool-content.js)
//
// FEATURE REQUIRED for this to flip green: the recorder observes stub-tool as a tool-content dependency of
// the "tool-content-task" stage and folds its file content into the stage signature (NOTES.md recommended
// design). Until then the stage is a stale cache hit and the assertions below fail — which is why the test
// is marked `.failing` (AVA: a `.failing` test counts as a pass while it throws and HARD-ERRORS the moment
// it starts passing; drop `.failing` when the feature lands).
//
// Also note: the recorder uses `module.registerHooks`, available only on the engines range
// (`^22.22.3 || ^24.15.0 || >=26`). This behavioral test does not call the hook directly, so it stays red
// regardless of Node version and flips only once the feature (plus the engines bump) is in; a direct unit
// test of the recorder needs a Node-version guard.

const FixtureTester = createFixtureTesterFactory("toolContent");
registerBuildHooks(test);

const STUB_TOOL_V2 = `module.exports = (src) => \`\${src}\\n// stub-tool@2\\n\`;\n`;

// Per-task build status of one project from the recorded project-build-status events, so a test can assert
// a single task re-ran (task-start) rather than being served from cache (task-skip). Mirrors the helper in
// ProjectBuilder.caching.integration.js (local there, not exported — duplicated intentionally).
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

test.serial.failing(
	"Tool content bump re-runs only the stage that loaded the tool (CPOUI5FOUNDATION-1386, scenario A1)",
	async (t) => {
		const fixtureTester = new FixtureTester(t, "application.a");
		const destPath = fixtureTester.destPath;
		const toolMain = `${fixtureTester.fixturePath}/node_modules/stub-tool/index.js`;
		const toolPkg = `${fixtureTester.fixturePath}/node_modules/stub-tool/package.json`;

		// TODO(wiring): confirm how the ProjectBuilder FixtureTester selects the custom-task config
		// (BuildServer.buildSignature.integration.js passes graphConfig.rootConfigPath). Adjust the
		// `config` below to point the build at ui5-customTask-toolContent.yaml.

		// #1 build (cold cache): the "tool-content-task" stage loads stub-tool@1. The feature records its
		// file set and content-hashes it into the stage signature.
		await fixtureTester.buildProject({
			config: {destPath, cleanDest: false /* , rootConfigPath: "ui5-customTask-toolContent.yaml" */},
			assertions: {projects: {"application.a": {}}},
		});

		// Scenario A1 — the ticket: bump stub-tool (new version AND changed content) with no @ui5/builder
		// release. Nothing else changes: no project source, no dependency, no @ui5/* version.
		await fs.writeFile(toolMain, STUB_TOOL_V2);
		const pkg = JSON.parse(await fs.readFile(toolPkg, {encoding: "utf8"}));
		pkg.version = "2.0.0";
		await fs.writeFile(toolPkg, `${JSON.stringify(pkg, null, 2)}\n`);

		// #2 build (warm cache): the ONLY input that moved is the tool's content.
		await fixtureTester.buildProject({
			config: {destPath, cleanDest: true /* , rootConfigPath: "ui5-customTask-toolContent.yaml" */},
		});
		const status = taskStatusOf(t, "application.a");

		// THE BUG: on `main` the tool's content is not a tracked input, so the stage is a stale cache hit
		// and these two assertions fail. The feature makes the stage re-run.
		t.true(status.started.has("tool-content-task"),
			"The stage that loaded the bumped tool re-ran");
		t.false(status.skipped.has("tool-content-task"),
			"The tool-loading stage was NOT served from a stale cache after the tool changed");

		// Scenario C1 — scoping: a stage that did not load the tool must stay cached (only the
		// tool-loading stage re-runs, nothing else).
		t.true(status.skipped.has("replaceVersion"),
			"An unrelated stage is still served from cache — the tool change did not invalidate everything");
	});
