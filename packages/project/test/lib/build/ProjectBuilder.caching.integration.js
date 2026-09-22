import test from "ava";
import fs from "node:fs/promises";
import {createFixtureTesterFactory, registerBuildHooks} from "./__helper__/ProjectBuilderFixtureTester.js";

const FixtureTester = createFixtureTesterFactory("caching");
registerBuildHooks(test);

// The three output resources buildThemes writes per theme (see themeBuilder.js): the compiled CSS,
// its RTL variant and the extracted theme parameters.
function themeOutputs(namespace) {
	const base = `/resources/${namespace}/themes/my_theme`;
	return [
		`${base}/library.css`,
		`${base}/library-RTL.css`,
		`${base}/library-parameters.json`,
	];
}

// buildThemes builds a library's theme only if a `library.js`/`.library` marker for that library is
// available via workspace+dependencies (its `librariesPattern` filter, active when the theme-library
// is built as a DEPENDENCY). The `themelib.multi` fixture ships `library.source.less` for two library
// namespaces (`lib/one`, `lib/two`), each gated by its own `library.js` marker. Adding/removing a
// marker changes which single theme should be (re)built — the others must stay served from cache.
//
// Previously buildThemes did NOT set `supportsDifferentialBuilds`, so ANY tracked-input change re-ran
// the whole task and rewrote EVERY matched theme (no per-theme delta, no preservation of unaffected
// theme output). Integrating buildThemes into the declarative new task system
// (CPOUI5FOUNDATION-1363) makes this correct by design: each `.source.less` is one forEachResource
// invocation that probes its own gating marker, so adding/removing a marker (re)builds or removes
// exactly one theme and leaves the others served from cache. The assertions below state that behavior.

test.serial(
	"buildThemes: adding a library rebuilds only the newly enabled theme, others stay cached",
	async (t) => {
		const fixtureTester = new FixtureTester(t, "application.a");
		const destPath = fixtureTester.destPath;

		// Materialize the fixture with an initial build (addMultiLibraryThemeLibraryDependency must run
		// AFTER the fixture is copied, as the first buildProject re-initializes the fixture directory).
		await fixtureTester.buildProject({
			config: {destPath, cleanDest: false, dependencyIncludes: {includeAllDependencies: true}},
		});

		// Add the multi-library theme-library, initially WITHOUT the lib/two marker: only lib/one's
		// theme is enabled by the librariesPattern filter.
		await fixtureTester.addMultiLibraryThemeLibraryDependency(
			`${fixtureTester.fixturePath}/webapp`, {libTwoMarker: false});

		// #1 build (fills the cache): buildThemes builds ONLY lib/one's theme.
		await fixtureTester.buildProject({
			config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
			assertions: {
				projects: {
					"themelib.multi": {
						writtenResources: {
							buildThemes: themeOutputs("lib/one"),
						},
					},
					"application.a": {
						skippedTasks: [
							"enhanceManifest",
							"escapeNonAsciiCharacters",
							"generateFlexChangesBundle",
							"generateVersionInfo",
							"replaceCopyright",
						],
					},
				},
			},
		});

		// Add the lib/two marker: its theme now becomes eligible. Only lib/two's theme is new work;
		// lib/one's already-built theme output is unaffected and should be reused from cache.
		await fixtureTester.setMultiLibraryThemeLibTwoMarker(true);

		// #2 build (with cache, with changes): DESIRED — buildThemes writes ONLY lib/two's theme.
		// Fails today: the whole task re-runs and rewrites lib/one's theme too (6 files instead of 3).
		// (Only themelib.multi is rebuilt here; application.a is fully served from cache.)
		await fixtureTester.buildProject({
			config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
			assertions: {
				projects: {
					"themelib.multi": {
						skippedTasks: ["replaceCopyright", "replaceVersion"],
						writtenResources: {
							buildThemes: themeOutputs("lib/two"),
						},
					},
				},
			},
		});

		// Both themes must be present in the dest regardless of the delta.
		for (const outPath of [...themeOutputs("lib/one"), ...themeOutputs("lib/two")]) {
			await t.notThrowsAsync(fs.readFile(`${destPath}${outPath}`, {encoding: "utf8"}),
				`Built dest contains ${outPath}`);
		}
	});

test.serial(
	"buildThemes: removing a library removes only its theme, others stay cached",
	async (t) => {
		const fixtureTester = new FixtureTester(t, "application.a");
		const destPath = fixtureTester.destPath;

		// Materialize the fixture with an initial build.
		await fixtureTester.buildProject({
			config: {destPath, cleanDest: false, dependencyIncludes: {includeAllDependencies: true}},
		});

		// Add the multi-library theme-library with BOTH markers present: both themes are built.
		await fixtureTester.addMultiLibraryThemeLibraryDependency(`${fixtureTester.fixturePath}/webapp`);

		// #1 build (fills the cache): buildThemes builds both lib/one's and lib/two's theme.
		await fixtureTester.buildProject({
			config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
			assertions: {
				projects: {
					"themelib.multi": {
						writtenResources: {
							buildThemes: [...themeOutputs("lib/one"), ...themeOutputs("lib/two")],
						},
					},
					"application.a": {
						skippedTasks: [
							"enhanceManifest",
							"escapeNonAsciiCharacters",
							"generateFlexChangesBundle",
							"generateVersionInfo",
							"replaceCopyright",
						],
					},
				},
			},
		});

		// Remove the lib/two marker: lib/two's theme is no longer eligible and its output must be
		// removed. lib/one's theme is unaffected and should be reused from cache (not rewritten).
		await fixtureTester.setMultiLibraryThemeLibTwoMarker(false);

		// #2 build (with cache, with changes): DESIRED — buildThemes does NOT rewrite lib/one's theme
		// (empty written set for buildThemes; the survivor is carried forward from cache).
		// Fails today: the whole task re-runs and rewrites lib/one's theme (3 files instead of 0).
		// (Only themelib.multi is rebuilt here; application.a is fully served from cache.)
		await fixtureTester.buildProject({
			config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
			assertions: {
				projects: {
					"themelib.multi": {
						skippedTasks: ["replaceCopyright", "replaceVersion"],
						writtenResources: {
							buildThemes: [],
						},
					},
				},
			},
		});

		// lib/one's theme must still be present; lib/two's theme output must be gone.
		for (const outPath of themeOutputs("lib/one")) {
			await t.notThrowsAsync(fs.readFile(`${destPath}${outPath}`, {encoding: "utf8"}),
				`Built dest still contains ${outPath}`);
		}
		for (const outPath of themeOutputs("lib/two")) {
			await t.throwsAsync(fs.readFile(`${destPath}${outPath}`, {encoding: "utf8"}),
				undefined, `Built dest no longer contains ${outPath}`);
		}
	});

test.serial("Build application.a project multiple times", async (t) => {
	const fixtureTester = new FixtureTester(t, "application.a");
	const destPath = fixtureTester.destPath;

	// #1 build (with empty cache)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: false},
		assertions: {
			projects: {
				// Default builds of project type "application" include the "generateVersionInfo"
				// task which requires dependencies to be built, so all dependencies are expected to be built here.
				// Subsequent builds can reuse the cached results of these dependencies.
				"library.d": {},
				"library.a": {},
				"library.b": {},
				"library.c": {},
				"application.a": {}
			}
		}
	});


	// #2 build (with cache, no changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});


	// Change a source file in application.a
	const changedFilePath = `${fixtureTester.fixturePath}/webapp/test.js`;
	await fs.appendFile(changedFilePath, `\ntest("line added");\n`);

	// #3 build (with cache, with changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {
				"application.a": {
					skippedTasks: [
						"escapeNonAsciiCharacters",
						// Note: replaceCopyright is skipped because no copyright is configured in the project
						"replaceCopyright",
						"enhanceManifest",
						"generateFlexChangesBundle",
						"generateVersionInfo",
					]
				}
			}
		}
	});

	// Check whether the changed file is in the destPath
	const builtFileContent = await fs.readFile(`${destPath}/test.js`, {encoding: "utf8"});
	t.true(builtFileContent.includes(`test("line added");`), "Build dest contains changed file content");


	// #4 build (with cache, no changes, with dependencies)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			// Dependencies are NOT rebuilt because
			// they were already built in build #1 and can be reused from cache.
			// Thus, empty assertion for built projects.
			projects: {}
		}
	});


	// #5 build (with cache, no changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});


	// #6 build (with cache, no changes, with dependencies)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {}
		}
	});


	// #7 build (with cache, no changes, with custom tasks)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-customTask.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {
				"application.a": {}
			}
		}
	});


	// #8 build (with cache, no changes, with custom tasks)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-customTask.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});


	// #9 build (with cache, no changes, with dependencies)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {}
		}
	});


	// Change a source file with existing source map in application.a
	const fileWithSourceMapPath =
		`${fixtureTester.fixturePath}/webapp/thirdparty/scriptWithSourceMap.js`;
	const fileWithSourceMapContent = await fs.readFile(fileWithSourceMapPath, {encoding: "utf8"});
	await fs.writeFile(
		fileWithSourceMapPath,
		fileWithSourceMapContent.replace(
			`This is a script with a source map.`,
			`This is a CHANGED script with a source map.`
		)
	);
	const sourceMapPath = `${fixtureTester.fixturePath}/webapp/thirdparty/scriptWithSourceMap.js.map`;
	const sourceMapContent = await fs.readFile(sourceMapPath, {encoding: "utf8"});
	await fs.writeFile(
		sourceMapPath,
		sourceMapContent.replace(
			`This is a script with a source map.`,
			`This is a CHANGED script with a source map.`
		)
	);

	// #10 build (with cache, with changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {
				"application.a": {
					skippedTasks: [
						"enhanceManifest",
						"escapeNonAsciiCharacters",
						"generateFlexChangesBundle",
						"generateVersionInfo",
						"replaceCopyright"
					]
				}
			}
		}
	});


	// Add a new file to application.a
	await fs.writeFile(`${fixtureTester.fixturePath}/webapp/someNew.js`,
		`console.log("SOME NEW CONTENT");\n`
	);

	// #11 build (with cache, with changes - someNew.js added)
	// Tasks that don't depend on someNew.js can reuse their caches from build #10.
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {"application.a": {
				skippedTasks: [
					"enhanceManifest",
					"escapeNonAsciiCharacters",
					"generateFlexChangesBundle",
					"replaceCopyright",
					"generateVersionInfo",
				]
			}}
		}
	});

	await fs.rm(`${fixtureTester.fixturePath}/webapp/someNew.js`);

	// #12 build (with cache, with changes - someNew.js removed)
	// Source state matches build #10's cached result -> cache reused, everything skipped
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {},
		}
	});
});

// Minify reads a resource's input source map (the `//# sourceMappingURL=` target) via fsInterface and
// embeds its content almost verbatim into the `-dbg.js.map` output, so that debug map is a direct
// function of the input map. The read is a tracked input, so changing ONLY the `.js.map` (not the `.js`
// that references it) invalidates minify's cache and re-runs it in delta mode with the `.js.map` as the
// sole changed path. But minify keeps only changed `.js` paths and reads input maps only as a side
// effect of processing their owning `.js`; the unchanged `.js` is filtered out, so the task writes
// nothing and the previously produced `-dbg.js.map` is carried forward STALE.
//
// This asserts the desired behavior (the changed input map is reflected in the built debug map) and is
// marked test.failing because the delta path does not yet achieve it. See BuildServer.integration.js for
// the same scenario over the served build, and the minify FIXME for why a fix needs the `.map` -> `.js`
// relation, not a local pattern tweak.
test.serial(
	"Build application.a, changing only an input source map read via fs by minify invalidates the debug source map",
	async (t) => {
		const fixtureTester = new FixtureTester(t, "application.a");
		const destPath = fixtureTester.destPath;

		const dbgSourceMapDestPath = `${destPath}/thirdparty/scriptWithSourceMap-dbg.js.map`;
		const jsMapFilePath =
			`${fixtureTester.fixturePath}/webapp/thirdparty/scriptWithSourceMap.js.map`;

		// #1 build (fills the cache): the produced debug source map embeds the input source map's
		// content, so it reflects the original marker.
		await fixtureTester.buildProject({
			config: {destPath, cleanDest: false},
		});
		const firstContent = await fs.readFile(dbgSourceMapDestPath, {encoding: "utf8"});
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

		// #2 build (with cache, with changes): the built debug source map must reflect the changed input
		// source map content. The minify task is expected to re-execute here (its cache is invalidated
		// because the changed .js.map is a tracked input) — proving the staleness is a differential-
		// execution defect, not a missed invalidation.
		await fixtureTester.buildProject({
			config: {destPath, cleanDest: true},
			assertions: {
				projects: {
					"application.a": {
						skippedTasks: [
							"enhanceManifest",
							"escapeNonAsciiCharacters",
							"generateFlexChangesBundle",
							"generateVersionInfo",
							// replaceCopyright is skipped because no copyright is configured in the project
							"replaceCopyright",
							// replaceVersion (new task system) has no work for the changed .js.map and is skipped
							"replaceVersion"
							// "minify" is NOT skipped: it re-runs in differential mode for the changed .js.map
						]
					}
				}
			}
		});
		const secondContent = await fs.readFile(dbgSourceMapDestPath, {encoding: "utf8"});
		t.true(secondContent.includes("This is a CHANGED script with a source map."),
			"Built debug source map reflects the changed input source map");
		t.false(secondContent.includes("This is a script with a source map."),
			"Built debug source map no longer reflects the stale input source map content");
	});

test.serial("Build library.d project multiple times", async (t) => {
	const fixtureTester = new FixtureTester(t, "library.d");
	const destPath = fixtureTester.destPath;

	// #1 build (with empty cache)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: false},
		assertions: {
			projects: {"library.d": {}}
		}
	});


	// #2 build (with cache, no changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});


	// Change a source file in library.d
	const changedFilePath = `${fixtureTester.fixturePath}/main/src/library/d/.library`;
	await fs.writeFile(
		changedFilePath,
		(await fs.readFile(changedFilePath, {encoding: "utf8"})).replace(
			`<documentation>Library D</documentation>`,
			`<documentation>Library D (updated #1)</documentation>`
		)
	);

	// #3 build (with cache, with changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {"library.d": {
				skippedTasks: [
					"buildThemes",
					"escapeNonAsciiCharacters",
					"minify",
					"replaceBuildtime",
				]
			}}
		}
	});

	// Check whether the changes are in the destPath
	const builtFileContent = await fs.readFile(`${destPath}/resources/library/d/.library`, {encoding: "utf8"});
	t.true(
		builtFileContent.includes(`<documentation>Library D (updated #1)</documentation>`),
		"Build dest contains changed file content"
	);

	// Check whether the manifest.json was updated with the new documentation
	const manifestContent = await fs.readFile(`${destPath}/resources/library/d/manifest.json`, {encoding: "utf8"});
	t.true(
		manifestContent.includes(`"Library D (updated #1)"`),
		"Build dest contains updated description in manifest.json"
	);


	// #4 build (with cache, no changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});


	// Update copyright in ui5.yaml (should trigger a full rebuild of the project)
	const ui5YamlPath = `${fixtureTester.fixturePath}/ui5.yaml`;
	await fs.writeFile(
		ui5YamlPath,
		(await fs.readFile(ui5YamlPath, {encoding: "utf8"})).replace(
			"copyright: Some fancy copyright",
			"copyright: Some updated fancy copyright"
		)
	);

	await fs.writeFile(`${fixtureTester.fixturePath}/main/src/library/d/someNew.js`,
		`console.log("SOME NEW CONTENT");\n`
	);

	// #5 build (with cache, with changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {"library.d": {}}
		}
	});

	await fs.rm(`${fixtureTester.fixturePath}/main/src/library/d/someNew.js`);

	// #6 build (with cache, with changes - someNew.js removed)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {"library.d": {
				skippedTasks: [
					"buildThemes",
					"enhanceManifest",
					"escapeNonAsciiCharacters",
					"replaceBuildtime",
				]
			}},
		}
	});

	// Re-add someNew.js (restores source state to match build #5)
	await fs.writeFile(`${fixtureTester.fixturePath}/main/src/library/d/someNew.js`,
		`console.log("SOME NEW CONTENT");\n`
	);

	// #7 build (with cache, with changes - someNew.js re-added)
	// Source state now matches build #5's cached result -> cache reused
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {},
		}
	});

	// Remove someNew.js again
	await fs.rm(`${fixtureTester.fixturePath}/main/src/library/d/someNew.js`);

	// #8 build (with cache, with changes - someNew.js removed again)
	// Source state matches build #6's cached result -> cache reused, everything skipped
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {},
		}
	});
});

// CPOUI5FOUNDATION-1363 (open-gaps §7, now closed): buildThemes is a differential new-task-system
// task. This scenario adds a NEW `@import`-ed `.less` file DURING a delta build (#4) and later changes
// it (#6). Reads first observed on a delta build are now folded back into the task's cached
// ResourceIndex (recordTaskResult.#foldNewTaskSystemDeltaReads), so the subsequent change (#6) is
// recognized as affecting buildThemes and the task re-runs; removing the import/file again (#7/#8)
// then correctly skips it.
test.serial("Build theme.library.e project multiple times", async (t) => {
	const fixtureTester = new FixtureTester(t, "theme.library.e");
	const destPath = fixtureTester.destPath;

	// #1 build (with empty cache)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: false},
		assertions: {
			projects: {"theme.library.e": {}}
		}
	});


	// #2 build (with cache, no changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});


	// Change a source file in theme.library.e
	const librarySourceFilePath =
		`${fixtureTester.fixturePath}/src/theme/library/e/themes/my_theme/library.source.less`;
	await fs.appendFile(librarySourceFilePath, `\n.someNewClass {\n\tcolor: red;\n}\n`);

	// #3 build (with cache, with changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {"theme.library.e": {}}
		}
	});

	// Check whether the changed file is in the destPath
	const builtFileContent = await fs.readFile(
		`${destPath}/resources/theme/library/e/themes/my_theme/library.source.less`, {encoding: "utf8"}
	);
	t.true(
		builtFileContent.includes(`.someNewClass`),
		"Build dest contains changed file content"
	);

	// Check whether the build output contains the new CSS rule
	const builtCssContent = await fs.readFile(
		`${destPath}/resources/theme/library/e/themes/my_theme/library.css`, {encoding: "utf8"}
	);
	t.true(
		builtCssContent.includes(`.someNewClass`),
		"Build dest contains new rule in library.css"
	);


	// Add a new less file and import it in library.source.less
	await fs.writeFile(`${fixtureTester.fixturePath}/src/theme/library/e/themes/my_theme/newImportFile.less`,
		`.someOtherNewClass {\n\tcolor: blue;\n}\n`
	);
	await fs.appendFile(librarySourceFilePath, `\n@import "newImportFile.less";\n`);

	// #4 build (with cache, with changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {"theme.library.e": {}},
		}
	});

	// Check whether the build output contains the import to the new file
	const builtCssContent2 = await fs.readFile(
		`${destPath}/resources/theme/library/e/themes/my_theme/library.css`, {encoding: "utf8"}
	);
	t.true(
		builtCssContent2.includes(`.someOtherNewClass`),
		"Build dest contains new rule in library.css"
	);


	// #5 build (with cache, no changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {},
		}
	});


	// Change content of new less file
	await fs.writeFile(`${fixtureTester.fixturePath}/src/theme/library/e/themes/my_theme/newImportFile.less`,
		`.someOtherNewClass {\n\tcolor: green;\n}\n`
	);

	// #6 build (with cache, with changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {"theme.library.e": {}},
		}
	});

	// Check whether the build output contains the changed content of the imported file
	const builtCssContent3 = await fs.readFile(
		`${destPath}/resources/theme/library/e/themes/my_theme/library.css`, {encoding: "utf8"}
	);
	t.true(
		builtCssContent3.includes(`.someOtherNewClass{color:green}`),
		"Build dest contains new rule in library.css"
	);


	// Delete import of library.source.less
	const librarySourceFileContent = (await fs.readFile(librarySourceFilePath)).toString();
	await fs.writeFile(librarySourceFilePath,
		librarySourceFileContent.replace(`\n@import "newImportFile.less";\n`, "")
	);

	// Change content of new less file again
	await fs.writeFile(`${fixtureTester.fixturePath}/src/theme/library/e/themes/my_theme/newImportFile.less`,
		`.someOtherNewClass {\n\tcolor: yellow;\n}\n`
	);

	// #7 build (with cache, with changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {"theme.library.e": {
				skippedTasks: ["buildThemes"]
			}},
		}
	});

	// Check if library.css does NOT contain the imported rule anymore
	t.false(
		(await fs.readFile(
			`${destPath}/resources/theme/library/e/themes/my_theme/library.css`, {encoding: "utf8"}
		)).includes(`.someOtherNewClass`),
		"Build dest should NOT contain the rule in library.css anymore"
	);


	// Delete the imported less file
	await fs.rm(`${fixtureTester.fixturePath}/src/theme/library/e/themes/my_theme/newImportFile.less`);

	// #8 build (with cache, with changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}, // -> everything should be skipped
		}
	});
});

test.serial("Build component.a project multiple times", async (t) => {
	const fixtureTester = new FixtureTester(t, "component.a");
	const destPath = fixtureTester.destPath;

	// #1 build (no cache, no changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {
				"component.a": {}
			}
		}
	});


	// #2 build (with cache, no changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});


	// Change a source file in component.a
	const changedFilePath = `${fixtureTester.fixturePath}/src/test.js`;
	await fs.appendFile(changedFilePath, `\ntest("line added");\n`);

	// #3 build (with cache, with changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {
				"component.a": {
					skippedTasks: [
						"escapeNonAsciiCharacters",
						// Note: replaceCopyright is skipped because no copyright is configured in the project
						"replaceCopyright",
						"enhanceManifest",
						"generateFlexChangesBundle",
					]
				}
			}
		}
	});

	// Check whether the changed file is in the destPath
	const builtFileContent = await fs.readFile(`${destPath}/resources/id1/test.js`, {encoding: "utf8"});
	t.true(builtFileContent.includes(`test("line added");`), "Build dest contains changed file content");


	// #4 build (with cache, no changes, with dependencies)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {
				"library.d": {},
				"library.a": {},
				"library.b": {},
				"library.c": {},
			}
		}
	});


	// #5 build (with cache, no changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});


	// #6 build (with cache, no changes, with dependencies)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {}
		}
	});


	// Add a new file to component.a
	await fs.writeFile(`${fixtureTester.fixturePath}/src/someNew.js`,
		`console.log("SOME NEW CONTENT");\n`
	);

	// #7 build (with cache, with changes - someNew.js added)
	// Tasks that don't depend on someNew.js can reuse their caches from build #3.
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {"component.a": {
				skippedTasks: [
					"enhanceManifest",
					"escapeNonAsciiCharacters",
					"generateFlexChangesBundle",
					"replaceCopyright",
				]
			}}
		}
	});

	await fs.rm(`${fixtureTester.fixturePath}/src/someNew.js`);

	// #8 build (with cache, with changes - someNew.js removed)
	// Source state matches build #6's cached result -> cache reused, everything skipped
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {},
		}
	});
});

test.serial("Build module.b project multiple times", async (t) => {
	const fixtureTester = new FixtureTester(t, "module.b");
	const destPath = fixtureTester.destPath;

	// #1 build (no cache, no changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {"module.b": {}}
		},
	});


	// #2 build (with cache, no changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});


	// Change a source file in module.b
	const changedFilePath = `${fixtureTester.fixturePath}/dev/devTools.js`;
	await fs.appendFile(changedFilePath, `\ntest("line added");\n`);

	// #3 build (no cache, with changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {"module.b": {}}
		}
	});

	// Check whether the changed file is in the destPath
	const builtFileContent = await fs.readFile(`${destPath}/resources/b/module/dev/devTools.js`, {encoding: "utf8"});
	t.true(builtFileContent.includes(`test("line added");`), "Build dest contains changed file content");


	// Remove a source file in module.b
	await fs.rm(`${fixtureTester.fixturePath}/dev/devTools.js`);

	// #4 build (no cache, with changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {"module.b": {}}
		}
	});

	// Check that the removed file is NOT in the destPath anymore
	// (dist output should be totally empty: no source files -> no build result)
	await t.throwsAsync(fs.readFile(`${destPath}/resources/b/module/dev/devTools.js`, {encoding: "utf8"}));


	// #5 build (with cache, no changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});


	// Add a new file in module.b
	await fs.mkdir(`${fixtureTester.fixturePath}/dev/newFolder`, {recursive: true});
	await fs.writeFile(`${fixtureTester.fixturePath}/dev/newFolder/newFile.js`,
		`console.log("this is a new file which should be included in the build result")`);

	// #6 build (no cache, with changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {"module.b": {}}
		},
	});

	// Check whether the added file is in the destPath
	const newFile = await fs.readFile(`${destPath}/resources/b/module/dev/newFolder/newFile.js`,
		{encoding: "utf8"});
	t.true(newFile.includes(`this is a new file which should be included in the build result`),
		"Build dest contains correct file content");


	// Add a new path mapping:
	const originalUi5Yaml = await fs.readFile(`${fixtureTester.fixturePath}/ui5.yaml`, {encoding: "utf8"}); // for later
	const newFileName = "someOtherNewFile.js";
	const newFolderName = "newPathmapping";
	const virtualPath = `/resources/b/module/${newFolderName}/`;
	await fs.writeFile(`${fixtureTester.fixturePath}/ui5.yaml`,
		`---
specVersion: "5.0"
type: module
metadata:
  name: module.b
resources:
  configuration:
    paths:
      /resources/b/module/dev/: dev
      ${virtualPath}: ${newFolderName}`
	);

	// Create a resource for this new path mapping:
	await fs.mkdir(`${fixtureTester.fixturePath}/${newFolderName}`, {recursive: true});
	await fs.writeFile(`${fixtureTester.fixturePath}/${newFolderName}/${newFileName}`,
		`console.log("this should be included in the build result if the path mapping has been set")`);

	// #7 build (no cache, with changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {"module.b": {}}
		},
	});

	// Check whether the added file is in the destPath
	const someOtherNewFile = await fs.readFile(`${destPath}${virtualPath}${newFileName}`,
		{encoding: "utf8"});
	t.true(someOtherNewFile.includes(`path mapping has been set`), "Build dest contains correct file content");


	// Remove the path mapping again (revert original ui5.yaml):
	await fs.writeFile(`${fixtureTester.fixturePath}/ui5.yaml`, originalUi5Yaml);

	// #8 build (with cache, with changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {} // -> cache can be reused
		},
	});

	// Check that the added resource of the path mapping is NOT in the destPath anymore:
	await t.throwsAsync(fs.readFile(`${destPath}${virtualPath}${newFileName}`,
		{encoding: "utf8"}));


	// #9 build (with cache, no changes, with dependencies)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {
				"library.d": {},
				"library.a": {},
				"library.b": {},
				"library.c": {},
			}
		},
	});
});
