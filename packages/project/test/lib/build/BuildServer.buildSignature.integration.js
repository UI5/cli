import test from "ava";
import esmock from "esmock";
import fs from "node:fs/promises";
import {
	createParcelWatcherMock, createFixtureTesterFactory, registerBuildHooks,
} from "./__helper__/BuildServerFixtureTester.js";

// Mock @parcel/watcher for the entire import tree reachable from graph.js so the build server's
// WatchHandler does not try to subscribe to real FSEvents/inotify/ReadDirectoryChangesW handles.
// Tests fire watcher events deterministically via FixtureTester#fireWatcherEvent instead of
// waiting for OS-level event delivery, which is both flaky (timing-dependent) and impossible
// inside sandboxed environments where FSEvents/inotify access is restricted.
const watcherMock = createParcelWatcherMock();
const {graphFromPackageDependencies} = await esmock.p("../../../lib/graph/graph.js", {}, {
	"@parcel/watcher": {
		default: watcherMock.api,
		...watcherMock.api,
	},
});

const FixtureTester = createFixtureTesterFactory("buildSignature", {graphFromPackageDependencies, watcherMock});
registerBuildHooks(test, {watcherMock});

// A custom task's determineBuildSignature callback derives the project's build signature from an
// input that is NOT a watched source resource (here: an on-disk control file at the project root).
// The desired behavior is that changing such an input while the server runs invalidates the served
// build result — otherwise the dev server keeps serving a stale state and the user has no way of
// knowing. This test asserts that desired behavior: request a resource, change the control file
// (which both the task body and determineBuildSignature read), request again, and expect the served
// content to reflect the new value WITHOUT restarting the server.
//
// It is marked test.failing because it currently fails: BuildServer computes each project's build
// signature exactly once (BuildContext memoizes the ProjectBuildContext for the server's lifetime),
// so determineBuildSignature is never re-evaluated for a running server, and the changed control
// file is ignored until the next `serve()`. AVA reports a failing-marked test as a pass while it
// throws and as a hard error once it starts passing, so committing it keeps CI green and flips to a
// signal the moment the behavior is fixed (at which point drop the `.failing`).
test.serial.failing(
	"Serve application.a, changing a determineBuildSignature input invalidates served output", async (t) => {
		const fixtureTester = t.context.fixtureTester = await FixtureTester.create(t, "application.a");

		// The custom task appends the control file's value to test.js and also feeds it into
		// determineBuildSignature.
		const controlFilePath = `${fixtureTester.fixturePath}/buildSignatureControl.txt`;
		await fs.writeFile(controlFilePath, "v1");

		await fixtureTester.serveProject({
			graphConfig: {rootConfigPath: "ui5-customTask-buildSignature.yaml"},
		});

		// #1 request: served test.js reflects control value "v1"
		const first = await fixtureTester.requestResource({resource: "/test.js"});
		const firstContent = await first.getString();
		t.true(firstContent.includes("// build-signature-control: v1"),
			"Initial served resource reflects control value v1");

		// Change ONLY the control file — no watched source resource changes. The determineBuildSignature
		// input is now different. The control file lives at the project root, outside the watched
		// source paths, so no watcher event fires for it (mirroring a real determineBuildSignature
		// input that is not a project source resource).
		await fs.writeFile(controlFilePath, "v2");

		// #2 request: the served resource must reflect the new control value "v2".
		const second = await fixtureTester.requestResource({resource: "/test.js"});
		const secondContent = await second.getString();
		t.true(secondContent.includes("// build-signature-control: v2"),
			"Served resource reflects the changed determineBuildSignature input without a server restart");
		t.false(secondContent.includes("// build-signature-control: v1"),
			"Served resource no longer reflects the stale control value v1");
	});

// Served counterpart of the ProjectBuilder minify source-map staleness test (see
// ProjectBuilder.caching.integration.js for the full mechanism). Minify reads a resource's input source
// map via fsInterface and embeds its content into the `-dbg.js.map` output. That read goes through the
// monitored workspace's byPath, so changing ONLY the `.js.map` (not the referencing `.js`) invalidates
// minify's cache and re-runs it in delta mode with the `.js.map` as the sole changed path. But minify
// keeps only changed `.js` paths, so the unchanged `.js` is filtered out, the task writes nothing, and
// the previously served `-dbg.js.map` is carried forward STALE.
//
// This asserts the desired behavior (the changed input map is reflected in the served debug map without
// a server restart) and is marked test.failing because the delta path does not yet achieve it. See the
// minify FIXME for why a fix needs the `.map` -> `.js` relation, not a local pattern tweak.
test.serial.failing(
	"Serve application.a, changing only an input source map read via fs by minify invalidates the debug source map",
	async (t) => {
		const fixtureTester = t.context.fixtureTester = await FixtureTester.create(t, "application.a");

		await fixtureTester.serveProject();

		const dbgSourceMapResourcePath = "/thirdparty/scriptWithSourceMap-dbg.js.map";
		const jsMapFilePath = `${fixtureTester.fixturePath}/webapp/thirdparty/scriptWithSourceMap.js.map`;

		// #1 request (fills the cache): the produced debug source map embeds the input source map's
		// content, so it reflects the original marker.
		const first = await fixtureTester.requestResource({resource: dbgSourceMapResourcePath});
		const firstContent = await first.getString();
		t.true(firstContent.includes("This is a script with a source map."),
			"Initial debug source map reflects the original input source map content");

		// Change ONLY the input source map — NOT the referencing scriptWithSourceMap.js. The minify task
		// read this map via fsInterface, so it is a tracked input and this change invalidates minify's
		// cache. But the owning .js is unchanged, so the differential minify path has no .js to reprocess.
		const jsMapContent = await fs.readFile(jsMapFilePath, {encoding: "utf8"});
		await fs.writeFile(
			jsMapFilePath,
			jsMapContent.replace(
				"This is a script with a source map.",
				"This is a CHANGED script with a source map."
			)
		);
		await fixtureTester.fireWatcherEvent("update", jsMapFilePath);

		// #2 request: the served debug source map must reflect the changed input source map content.
		// The minify task is expected to re-execute here (its cache is invalidated because the changed
		// .js.map is a tracked input) — proving the staleness is a differential-execution defect, not a
		// missed invalidation.
		const second = await fixtureTester.requestResource({
			resource: dbgSourceMapResourcePath,
			assertions: {
				projects: {
					"application.a": {
						skippedTasks: [
							"escapeNonAsciiCharacters",
							// replaceCopyright is skipped because no copyright is configured in the project
							"replaceCopyright",
							"replaceVersion",
							"enhanceManifest",
							"generateFlexChangesBundle",
							"generateVersionInfo"
							// "minify" is NOT skipped: it re-runs in differential mode for the changed .js.map
						]
					}
				}
			}
		});
		const secondContent = await second.getString();
		t.true(secondContent.includes("This is a CHANGED script with a source map."),
			"Served debug source map reflects the changed input source map without a server restart");
		t.false(secondContent.includes("This is a script with a source map."),
			"Served debug source map no longer reflects the stale input source map content");
	});

// CPOUI5FOUNDATION-1363 (cross-project theme `@import` regression guard): buildThemes resolves LESS
// `@import`s through its workspace+dependencies combo (fsInterface(combo) in buildThemes.js). When a
// theme-library's `library.source.less` `@import`s the base theme LESS of a *different* control
// library, that `@import` is a cross-project DEPENDENCY read. Changing the imported base LESS while the
// server runs must re-run the theme-library's buildThemes and serve fresh CSS — the theme-library
// "builds on top of" the base theme, so a base-theme change must propagate. This test asserts that:
// build the theme-library's `library.css` (which embeds the base color pulled in via the cross-project
// `@import`), change ONLY the base library's `themes/base/library.source.less`, notify the watcher, and
// expect the served CSS to reflect the new base color WITHOUT a server restart.
//
// This scenario passes on main and guards the current cross-project `@import` invalidation behavior
// against regression while the new task system (CPOUI5FOUNDATION-1363) is developed on a separate
// branch, where the same behavior must be preserved by design rather than by chance.
test.serial(
	"Serve theme.library.e, changing an @import-ed base theme LESS in a dependency invalidates the theme CSS",
	async (t) => {
		const fixtureTester = t.context.fixtureTester = await FixtureTester.create(t, "theme.library.e");

		// Wire up a base control library dependency that ships a base theme `library.source.less`, and
		// make theme.library.e's theme `@import` it across the project boundary. Done before serveProject
		// so the file watcher does not race with these writes (see FixtureTester.create's note).
		const baseLibDir = `${fixtureTester.fixturePath}/node_modules/library.base`;
		const baseThemeDir = `${baseLibDir}/src/library/base/themes/base`;
		const baseLessPath = `${baseThemeDir}/library.source.less`;
		await fs.mkdir(baseThemeDir, {recursive: true});
		await fs.writeFile(baseLessPath,
			`@baseColor: #010101;\n.baseRule {\n\tcolor: @baseColor;\n}\n`);
		await fs.writeFile(`${baseLibDir}/src/library/base/.library`,
			`<?xml version="1.0" encoding="UTF-8" ?>\n` +
			`<library xmlns="http://www.sap.com/sap.ui.library.xsd">\n` +
			`\t<name>library.base</name>\n\t<vendor>me</vendor>\n\t<version>1.0.0</version>\n` +
			`\t<documentation>Base library</documentation>\n</library>\n`);
		// specVersion 2.3 (like the library.a fixture) so no manifest.json is required in source.
		await fs.writeFile(`${baseLibDir}/ui5.yaml`,
			`---\nspecVersion: "2.3"\ntype: library\nmetadata:\n  name: library.base\n`);
		await fs.writeFile(`${baseLibDir}/package.json`,
			`{\n\t"name": "library.base",\n\t"version": "1.0.0"\n}\n`);

		// Declare the dependency and rewrite the theme LESS to import the base library's base theme.
		const pkgPath = `${fixtureTester.fixturePath}/package.json`;
		const pkg = JSON.parse(await fs.readFile(pkgPath, {encoding: "utf8"}));
		pkg.dependencies = {...(pkg.dependencies || {}), "library.base": "file:./node_modules/library.base"};
		await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2));

		const themeLessPath =
			`${fixtureTester.fixturePath}/src/theme/library/e/themes/my_theme/library.source.less`;
		await fs.writeFile(themeLessPath,
			`@import "/resources/library/base/themes/base/library.source.less";\n\n` +
			`.sapUiBody {\n\tbackground-color: @baseColor;\n}\n`);

		await fixtureTester.serveProject();

		const cssResource = "/resources/theme/library/e/themes/my_theme/library.css";

		// #1 request builds the theme; the compiled CSS embeds the base color imported from library.base.
		const first = await fixtureTester.requestResource({resource: cssResource});
		const firstContent = await first.getString();
		t.true(firstContent.includes("#010101"),
			"Initial theme CSS reflects the base color imported from the base library's base theme");

		// Change ONLY the base library's base theme LESS — the theme-library's own source is untouched.
		await fs.writeFile(baseLessPath,
			`@baseColor: #020202;\n.baseRule {\n\tcolor: @baseColor;\n}\n`);
		await fixtureTester.fireWatcherEvent("update", baseLessPath);

		// #2 request: the served theme CSS must reflect the changed base color, because the theme
		// `@import`s the base library's base theme and thus builds on top of it.
		const second = await fixtureTester.requestResource({resource: cssResource});
		const secondContent = await second.getString();
		t.true(secondContent.includes("#020202"),
			"Served theme CSS reflects the changed @import-ed base theme LESS without a server restart");
		t.false(secondContent.includes("#010101"),
			"Served theme CSS no longer reflects the stale base color");
	});
