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
// marker changes which single theme should be (re)built, and the others must stay served from cache.
//
// buildThemes builds each theme as a map-step unit (CPOUI5FOUNDATION-1363), so adding a marker now
// rebuilds only the newly enabled theme, and removing a marker rebuilds nothing: the removed input
// yields a delta (ResourceRequestManager.getDeltas includes removed paths), the owning unit drops out,
// and its stale output is dropped from the carried-forward stage while the other theme stays cached.

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

		// #2 build (with cache, with changes): buildThemes does NOT rewrite lib/one's theme
		// (empty written set for buildThemes; the survivor is carried forward from cache).
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

		// Change ONLY the input source map — NOT the referencing scriptWithSourceMap.js.
		const jsMapContent = await fs.readFile(jsMapFilePath, {encoding: "utf8"});
		await fs.writeFile(
			jsMapFilePath,
			jsMapContent.replace(
				"This is a script with a source map.",
				"This is a CHANGED script with a source map."
			)
		);

		// #2 build (with cache, with changes): the built debug source map must reflect the changed input
		// source map content. The minify task is expected to re-execute here
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
							// replaceVersion has no work for the changed .js.map and is skipped
							"replaceVersion",
							// "minify" is NOT skipped: it re-runs for the changed .js.map
						],
						writtenResources: {
							// Only resources affected by the source map change should be written
							"minify": [
								"/resources/id1/thirdparty/scriptWithSourceMap-dbg.js",
								"/resources/id1/thirdparty/scriptWithSourceMap-dbg.js.map",
								"/resources/id1/thirdparty/scriptWithSourceMap.js",
								"/resources/id1/thirdparty/scriptWithSourceMap.js.map",
							]
						}
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

test.serial("Build application.a (custom task reads a root config file, tracked as a root input)", async (t) => {
	const fixtureTester = new FixtureTester(t, "application.a");
	const destPath = fixtureTester.destPath;
	await fixtureTester._initialize();

	// A tsconfig.json in the project root: outside the UI5 resource model, so it is reachable only
	// through getRootReader() and bypasses the source and dependency readers. The root-config custom
	// task embeds its content into an output resource, so a change to it must invalidate the task's
	// cache even though no source or dependency resource changed.
	const tsconfigPath = `${fixtureTester.fixturePath}/tsconfig.json`;
	const digestPath = `${destPath}/tsconfigDigest.js`;
	await fs.writeFile(tsconfigPath, `{"compilerOptions":{"target":"es2022"}}`);

	// #1 build (no cache): the full graph builds and the task reads the initial tsconfig.
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-customTask-root-config.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {
				"library.d": {},
				"library.a": {},
				"library.b": {},
				"library.c": {},
				"application.a": {},
			},
		},
	});
	t.true((await fs.readFile(digestPath, {encoding: "utf8"})).includes("es2022"),
		"Output embeds the initial tsconfig content");

	// #2 build (with cache, no changes): the whole project is served from cache, nothing is built.
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-customTask-root-config.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {projects: {}},
	});

	// Change only the root config. No source or dependency resource changes.
	await fs.writeFile(tsconfigPath, `{"compilerOptions":{"target":"es2015"}}`);

	// #3 build (with cache, root config changed): the root change invalidates application.a's result
	// cache, so it is rebuilt and the root-config task re-runs with the new content. Without root
	// tracking this build would serve the stale cached result and build nothing.
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-customTask-root-config.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {
				"application.a": {
					// Source is unchanged, so every source-driven task is served from cache. Only
					// root-config re-runs, because its stage signature folds in the root resources.
					skippedTasks: [
						"enhanceManifest",
						"escapeNonAsciiCharacters",
						"generateComponentPreload",
						"generateFlexChangesBundle",
						"generateVersionInfo",
						"minify",
						"replaceCopyright",
						"replaceVersion",
					],
					writtenResources: {
						"root-config": ["/tsconfigDigest.js"],
					},
				},
			},
		},
	});
	t.true((await fs.readFile(digestPath, {encoding: "utf8"})).includes("es2015"),
		"Output embeds the changed tsconfig content after the root change");

	// #4 build (with cache, no changes): fresh again, nothing is built.
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-customTask-root-config.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {projects: {}},
	});
});

// generateThemeDesignerResources opens with a scalar "scan" step whose body globs
// `library.source.less` to decide whether the library has any themes, and writes that verdict into the
// library `.theming` as the bIgnore flag (bIgnore true == no themes, so the SAP Theme Designer skips the
// library). A scalar step is a single implicit unit, so the per-unit reads delta cannot prune or select
// it, and that delta cannot see a file that newly matches the glob: the recorder stores resolved paths,
// not patterns, so a file absent on the previous build appears in no recorded read. Re-running the scalar
// step on any delta verdict (the owning stage signature does change, because the stage-level monitor
// recorded the glob) is what flips the verdict. The task is gated on isFrameworkProject(), so the
// `library.framework` fixture carries an `@openui5/` package id; it declares no framework version and no
// framework libraries, so graph enrichment resolves no framework and the build stays hermetic. The task
// is off by default (composeTaskList), so each build opts in through includedTasks.
//
// On a cleanDest rebuild a generateThemeDesignerResources served from cache would restore the previous
// build's `.theming`, so a flipped bIgnore flag is proof the scalar step re-ran this build.
const generateThemeDesignerResourcesTask = "generateThemeDesignerResources";

// Per-task build status of one project from the recorded project-build-status events, so a test can
// assert a single task re-ran (task-start) rather than being served from cache (task-skip).
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

async function readTheming(destPath) {
	return JSON.parse(await fs.readFile(
		`${destPath}/resources/library/framework/.theming`, {encoding: "utf8"}));
}

const SELF_CONTAINED_LESS = `@mycolor: blue;\n.sapUiBody {\n\tbackground-color: @mycolor;\n}\n`;

test.serial(
	"generateThemeDesignerResources: adding the first theme re-runs the scalar scan on a delta build",
	async (t) => {
		const fixtureTester = new FixtureTester(t, "library.framework");
		const destPath = fixtureTester.destPath;
		const includedTasks = [generateThemeDesignerResourcesTask];
		const themeSourcePath =
			`${fixtureTester.fixturePath}/main/src/library/framework/themes/my_theme/library.source.less`;

		// #1 build (fills the cache): the library has no themes, so scan reports none and the library
		// `.theming` carries bIgnore.
		await fixtureTester.buildProject({
			config: {destPath, cleanDest: false, includedTasks},
			assertions: {projects: {"library.framework": {}}},
		});
		t.is((await readTheming(destPath)).bIgnore, true,
			"Initial library .theming reports the library has no themes");

		// Add the first theme. Its `library.source.less` newly matches scan's glob, whose result was empty
		// on build #1.
		await fs.mkdir(`${fixtureTester.fixturePath}/main/src/library/framework/themes/my_theme`,
			{recursive: true});
		await fs.writeFile(themeSourcePath, SELF_CONTAINED_LESS);

		// #2 build (with cache, with changes): a delta build where unaffected tasks stay cached, yet the
		// scalar scan step re-runs and flips hasThemes.
		await fixtureTester.buildProject({
			config: {destPath, cleanDest: true, includedTasks},
		});
		const status = taskStatusOf(t, "library.framework");
		t.true(status.skipped.has("minify"),
			"Delta build: a source-unaffected task is served from cache");
		t.true(status.started.has(generateThemeDesignerResourcesTask),
			"generateThemeDesignerResources re-ran as a step-based task");
		t.false(status.skipped.has(generateThemeDesignerResourcesTask),
			"generateThemeDesignerResources was not served from cache");
		t.is((await readTheming(destPath)).bIgnore, undefined,
			"After adding the first theme the library .theming reports the library HAS themes");
		// buildThemes generated the newly added theme's CSS on the same delta build.
		await t.notThrowsAsync(
			fs.readFile(`${destPath}/resources/library/framework/themes/my_theme/library.css`,
				{encoding: "utf8"}),
			"The newly added theme was built");
	});

test.serial(
	"generateThemeDesignerResources: removing the last theme re-runs the scalar scan on a delta build",
	async (t) => {
		const fixtureTester = new FixtureTester(t, "library.framework");
		const destPath = fixtureTester.destPath;
		const includedTasks = [generateThemeDesignerResourcesTask];
		const themeSourcePath =
			`${fixtureTester.fixturePath}/main/src/library/framework/themes/my_theme/library.source.less`;

		// Ship the fixture with one theme present before the first build fills the cache.
		await fixtureTester._initialize();
		await fs.mkdir(`${fixtureTester.fixturePath}/main/src/library/framework/themes/my_theme`,
			{recursive: true});
		await fs.writeFile(themeSourcePath, SELF_CONTAINED_LESS);

		// #1 build (fills the cache): the library has a theme, so scan reports themes and the library
		// `.theming` carries no bIgnore.
		await fixtureTester.buildProject({
			config: {destPath, cleanDest: false, includedTasks},
		});
		t.is((await readTheming(destPath)).bIgnore, undefined,
			"Initial library .theming reports the library HAS themes");

		// Remove the only theme. Its `library.source.less` yields a delta (a removed path).
		await fs.rm(`${fixtureTester.fixturePath}/main/src/library/framework/themes`,
			{recursive: true, force: true});

		// #2 build (with cache, with changes): the scalar scan step re-runs and flips hasThemes back.
		await fixtureTester.buildProject({
			config: {destPath, cleanDest: true, includedTasks},
		});
		const status = taskStatusOf(t, "library.framework");
		t.true(status.started.has(generateThemeDesignerResourcesTask),
			"generateThemeDesignerResources re-ran as a step-based task");
		t.false(status.skipped.has(generateThemeDesignerResourcesTask),
			"generateThemeDesignerResources was not served from cache");
		t.is((await readTheming(destPath)).bIgnore, true,
			"After removing the last theme the library .theming reports the library has no themes");
		// The removed theme's CSS is gone from the built output.
		await t.throwsAsync(
			fs.readFile(`${destPath}/resources/library/framework/themes/my_theme/library.css`,
				{encoding: "utf8"}),
			undefined, "The removed theme is no longer built");
	});

// task.root-conditional reads /tsconfig.json through the project root reader only while /toggle.js
// exists in the workspace. Removing /toggle.js is a source change that re-runs the stage; on that
// re-run the task reads no root resource, so its previously recorded root request is cleared and the
// emptied request set is re-persisted. A later change to /tsconfig.json must then NOT invalidate the
// task, because the stage no longer reads that file. Without clearing, the stale root request survives
// in the cache, keeps folding /tsconfig.json into the stage signature, and every edit to it rebuilds
// application.a.
test.serial(
	"Build application.a (a stage that stops reading a root file stops being invalidated by it)",
	async (t) => {
		const fixtureTester = new FixtureTester(t, "application.a");
		const destPath = fixtureTester.destPath;
		await fixtureTester._initialize();

		const tsconfigPath = `${fixtureTester.fixturePath}/tsconfig.json`;
		const togglePath = `${fixtureTester.fixturePath}/webapp/toggle.js`;
		const digestPath = `${destPath}/rootConditionalDigest.js`;
		const graphConfig = {rootConfigPath: "ui5-customTask-root-conditional.yaml"};
		await fs.writeFile(tsconfigPath, `{"compilerOptions":{"target":"es2022"}}`);
		await fs.writeFile(togglePath, `sap.ui.define([], () => {});\n`);

		// #1 build (no cache): /toggle.js is present, so the task reads and records /tsconfig.json.
		await fixtureTester.buildProject({graphConfig, config: {destPath, cleanDest: true}});
		t.true((await fs.readFile(digestPath, {encoding: "utf8"})).includes("es2022"),
			"Output embeds the tsconfig content while the root read is active");

		// Remove /toggle.js. Its deletion re-runs the root-conditional stage, and on that re-run the
		// task reads no root resource.
		await fs.rm(togglePath);

		// #2 build (cache, toggle removed): the stage re-runs, records no root read, so its stale root
		// request is cleared and the emptied set is persisted.
		await fixtureTester.buildProject({graphConfig, config: {destPath, cleanDest: true}});
		t.is(await fs.readFile(digestPath, {encoding: "utf8"}),
			`export const content = "root-not-read";\n`,
			"Output no longer embeds the tsconfig content once the root read stopped");

		// Change only /tsconfig.json. The task no longer reads it.
		await fs.writeFile(tsconfigPath, `{"compilerOptions":{"target":"es2015"}}`);

		// #3 build (cache, tsconfig changed, toggle still absent): application.a is a full result-cache
		// hit and nothing rebuilds. Without the fix the stale root request would still fold tsconfig.json
		// into the stage signature, invalidating application.a and rebuilding it.
		await fixtureTester.buildProject({
			graphConfig, config: {destPath, cleanDest: true},
			assertions: {projects: {}},
		});
	});

// Two custom tasks read the project root: task.root-config reads /tsconfig.json by path with the default
// gitignore filter (useGitignore:true), task.root-glob globs /rootcfg/**/*.json with the filter disabled
// (useGitignore:false, recorded against the second root manager). Each task's root reads fold into its own
// stage's root signature, and the per-stage root signatures aggregate at the result-cache level, so a
// change to one task's root input re-runs only that task. Adding or removing a file matching root-glob's
// glob invalidates root-glob (root indices refresh by re-globbing), while root-config stays cached.
const ROOT_MULTI_SKIPPED_SOURCE_TASKS = [
	"enhanceManifest", "escapeNonAsciiCharacters", "generateComponentPreload",
	"generateFlexChangesBundle", "generateVersionInfo", "minify", "replaceCopyright", "replaceVersion",
];
test.serial(
	"Build application.a (root reads across two stages invalidate independently; glob + useGitignore:false)",
	async (t) => {
		const fixtureTester = new FixtureTester(t, "application.a");
		const destPath = fixtureTester.destPath;
		await fixtureTester._initialize();

		const tsconfigPath = `${fixtureTester.fixturePath}/tsconfig.json`;
		const cfgDir = `${fixtureTester.fixturePath}/rootcfg`;
		const globDigestPath = `${destPath}/rootGlobDigest.js`;
		const graphConfig = {rootConfigPath: "ui5-customTask-root-multi.yaml"};
		await fs.writeFile(tsconfigPath, `{"compilerOptions":{"target":"es2022"}}`);
		await fs.mkdir(cfgDir, {recursive: true});
		await fs.writeFile(`${cfgDir}/a.json`, `{"a":1}`);
		await fs.writeFile(`${cfgDir}/b.json`, `{"b":2}`);

		// #1 build (no cache): both tasks read and record their root reads.
		await fixtureTester.buildProject({graphConfig, config: {destPath, cleanDest: true}});
		let globDigest = await fs.readFile(globDigestPath, {encoding: "utf8"});
		t.true(globDigest.includes("a.json") && globDigest.includes("b.json"),
			"root-glob output lists both matching root files");

		// #2 build (cache, no changes): full result-cache hit.
		await fixtureTester.buildProject({graphConfig, config: {destPath, cleanDest: true},
			assertions: {projects: {}}});

		// Delete a matching root file (a novel state, never cached): root-glob must re-run, root-config
		// stays cached.
		await fs.rm(`${cfgDir}/b.json`);
		await fixtureTester.buildProject({
			graphConfig, config: {destPath, cleanDest: true},
			assertions: {projects: {"application.a": {
				skippedTasks: [...ROOT_MULTI_SKIPPED_SOURCE_TASKS, "root-config"],
				writtenResources: {"root-glob": ["/rootGlobDigest.js"]},
			}}},
		});
		globDigest = await fs.readFile(globDigestPath, {encoding: "utf8"});
		t.false(globDigest.includes("b.json"), "root-glob output drops the removed root file");

		// Add a matching root file (again a novel state): root-glob must re-run, root-config stays cached.
		await fs.writeFile(`${cfgDir}/c.json`, `{"c":3}`);
		await fixtureTester.buildProject({
			graphConfig, config: {destPath, cleanDest: true},
			assertions: {projects: {"application.a": {
				skippedTasks: [...ROOT_MULTI_SKIPPED_SOURCE_TASKS, "root-config"],
				writtenResources: {"root-glob": ["/rootGlobDigest.js"]},
			}}},
		});
		globDigest = await fs.readFile(globDigestPath, {encoding: "utf8"});
		t.true(globDigest.includes("a.json") && globDigest.includes("c.json"),
			"root-glob output lists the newly added root file");

		// Change only /tsconfig.json: now root-config must re-run, root-glob stays cached. This also shows
		// the per-stage root signatures aggregate independently, so one task's root change does not re-run
		// the other.
		await fs.writeFile(tsconfigPath, `{"compilerOptions":{"target":"es2015"}}`);
		await fixtureTester.buildProject({
			graphConfig, config: {destPath, cleanDest: true},
			assertions: {projects: {"application.a": {
				skippedTasks: [...ROOT_MULTI_SKIPPED_SOURCE_TASKS, "root-glob"],
				writtenResources: {"root-config": ["/tsconfigDigest.js"]},
			}}},
		});
	});
