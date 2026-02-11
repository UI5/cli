import test from "ava";
import sinonGlobal from "sinon";
import {fileURLToPath} from "node:url";
import fs from "node:fs/promises";
import {graphFromPackageDependencies} from "../../../lib/graph/graph.js";
import {setLogLevel} from "@ui5/logger";

// Ensures that all logging code paths are tested
setLogLevel("silly");

test.beforeEach((t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();

	t.context.logEventStub = sinon.stub();
	t.context.buildMetadataEventStub = sinon.stub();
	t.context.projectBuildMetadataEventStub = sinon.stub();
	t.context.buildStatusEventStub = sinon.stub();
	t.context.projectBuildStatusEventStub = sinon.stub();

	process.on("ui5.log", t.context.logEventStub);
	process.on("ui5.build-metadata", t.context.buildMetadataEventStub);
	process.on("ui5.project-build-metadata", t.context.projectBuildMetadataEventStub);
	process.on("ui5.build-status", t.context.buildStatusEventStub);
	process.on("ui5.project-build-status", t.context.projectBuildStatusEventStub);
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
	delete process.env.UI5_DATA_DIR;

	process.off("ui5.log", t.context.logEventStub);
	process.off("ui5.build-metadata", t.context.buildMetadataEventStub);
	process.off("ui5.project-build-metadata", t.context.projectBuildMetadataEventStub);
	process.off("ui5.build-status", t.context.buildStatusEventStub);
	process.off("ui5.project-build-status", t.context.projectBuildStatusEventStub);
});

test.serial("Build application.a project multiple times", async (t) => {
	const fixtureTester = new FixtureTester(t, "application.a");
	const destPath = fixtureTester.destPath;

	// #1 build (with empty cache)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: false},
		assertions: {
			projects: {
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


	// #6 build (with cache, no changes, with custom tasks)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-customTask.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {
				"application.a": {}
			}
		}
	});


	// #7 build (with cache, no changes, with custom tasks)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-customTask.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});


	// #8 build (with cache, no changes, with dependencies)
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

	// #9 build (with cache, with changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {
				"application.a": {
					skippedTasks: [
						"enhanceManifest",
						"escapeNonAsciiCharacters",
						"generateFlexChangesBundle",
						"replaceCopyright"
					]
				}
			}
		}
	});
});

// eslint-disable-next-line ava/no-skip-test -- tag handling to be implemented
test.serial.skip("Build application.a (custom task and tag handling)", async (t) => {
	const fixtureTester = new FixtureTester(t, "application.a");
	const destPath = fixtureTester.destPath;

	// #1 build (no cache, no changes, with custom tasks)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-customTask.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {
				"application.a": {}
			}
		}
	});


	// Create new file which should get tagged as "OmitFromBuildResult" by a custom task
	await fs.writeFile(`${fixtureTester.fixturePath}/webapp/fileToBeOmitted.js`,
		`console.log("this file should be ommited in the build result")`);

	// #2 build (with cache, with changes, with custom tasks)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-customTask.yaml"},
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
					]
				}
			}
		}
	});

	// Check that fileToBeOmitted.js is not in dist
	await t.throwsAsync(fs.readFile(`${destPath}/fileToBeOmitted.js`, {encoding: "utf8"}));


	// #3 build (with cache, no changes, with custom tasks)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-customTask.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});

	// Check that fileToBeOmitted.js is not in dist again --> FIXME: Currently failing here
	await t.throwsAsync(fs.readFile(`${destPath}/fileToBeOmitted.js`, {encoding: "utf8"}));


	// Delete the file again
	await fs.rm(`${fixtureTester.fixturePath}/webapp/fileToBeOmitted.js`);

	// #4 build (with cache, with changes, with custom tasks)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-customTask.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {} // everything should be skipped (already done in very first build)
		}
	});
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

	// #5 build (with cache, with changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {"library.d": {}}
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

test.serial("Build race condition: file modified during active build", async (t) => {
	const fixtureTester = new FixtureTester(t, "application.a");
	const destPath = fixtureTester.destPath;
	await fixtureTester._initialize();
	const testFilePath = `${fixtureTester.fixturePath}/webapp/test.js`;
	const originalContent = await fs.readFile(testFilePath, {encoding: "utf8"});

	// #1 Build with race condition triggered by custom task
	// The custom task (configured in ui5-race-condition.yaml) modifies test.js during the build,
	// after the source index is created but before tasks that process test.js execute.
	// This creates a race condition where the cached content hash no longer matches the actual file.
	//
	// Expected behavior:
	// - Build should detect that source file hash changed during execution
	// - Build should fail with an error OR mark cache as invalid
	//
	// FIXME: Current behavior:
	// - Build succeeds without detecting the race condition
	// - Cache is written with inconsistent data (index hash != processed content hash)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-race-condition.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {
				"application.a": {}
			}
		}
	});

	// Verify the race condition occurred: the modification made by the custom task is in the output
	const builtFileContent = await fs.readFile(`${destPath}/test.js`, {encoding: "utf8"});
	t.true(
		builtFileContent.includes(`RACE CONDITION MODIFICATION`),
		"Build output contains the modification made during build"
	);

	// #2 Revert the source file to original content
	await fs.writeFile(testFilePath, originalContent);

	// #3 Build again after reverting the source
	// FIXME: The cache should be invalidated because the previous build had a race condition,
	// but currently it's reused (projects: {}). Once proper validation is implemented,
	// this should trigger a full rebuild: {"application.a": {}}
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-race-condition.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {} // Current: cache reused | Expected: {"application.a": {}}
		}
	});

	// FIXME: Due to incorrect cache reuse from build #1, the output still contains the modification
	// even though the source was reverted. This demonstrates the cache corruption issue.
	// Expected: finalBuiltContent should NOT contain "RACE CONDITION MODIFICATION"
	const finalBuiltContent = await fs.readFile(`${destPath}/test.js`, {encoding: "utf8"});
	t.true(
		finalBuiltContent.includes(`RACE CONDITION MODIFICATION`),
		"Build output incorrectly contains the modification due to corrupted cache"
	);
});

function getFixturePath(fixtureName) {
	return fileURLToPath(new URL(`../../fixtures/${fixtureName}`, import.meta.url));
}

function getTmpPath(folderName) {
	return fileURLToPath(new URL(`../../tmp/ProjectBuilder/${folderName}`, import.meta.url));
}

async function rmrf(dirPath) {
	return fs.rm(dirPath, {recursive: true, force: true});
}

class FixtureTester {
	constructor(t, fixtureName) {
		this._t = t;
		this._sinon = t.context.sinon;
		this._fixtureName = fixtureName;
		this._initialized = false;

		// Public
		this.fixturePath = getTmpPath(fixtureName);
		this.destPath = getTmpPath(`${fixtureName}/dist`);
	}

	async _initialize() {
		if (this._initialized) {
			return;
		}
		process.env.UI5_DATA_DIR = getTmpPath(`${this._fixtureName}/.ui5`);
		await rmrf(this.fixturePath); // Clean up any previous test runs
		await fs.cp(getFixturePath(this._fixtureName), this.fixturePath, {recursive: true});
		this._initialized = true;
	}

	async buildProject({graphConfig = {}, config = {}, assertions = {}} = {}) {
		await this._initialize();
		this._sinon.resetHistory();

		const graph = await graphFromPackageDependencies({
			...graphConfig,
			cwd: this.fixturePath,
		});

		// Execute the build
		await graph.build(config);

		// Apply assertions if provided
		if (assertions) {
			this._assertBuild(assertions);
		}
	}

	_assertBuild(assertions) {
		const {projects = {}} = assertions;

		const projectsInOrder = [];
		const seenProjects = new Set();
		const tasksByProject = {};

		// Extract build status to identify built projects and their order
		const buildStatusEvents = this._t.context.buildStatusEventStub.args.map((args) => args[0]);
		for (const event of buildStatusEvents) {
			if (!seenProjects.has(event.projectName)) {
				seenProjects.add(event.projectName);
				if (event.status === "project-build-start") {
					projectsInOrder.push(event.projectName);
				}
			}
		}

		// Extract task status to identify skipped & executed tasks per project
		const projectBuildStatusEvents = this._t.context.projectBuildStatusEventStub.args.map((args) => args[0]);
		for (const event of projectBuildStatusEvents) {
			if (!tasksByProject[event.projectName]) {
				tasksByProject[event.projectName] = {executed: [], skipped: []};
			}
			if (event.status === "task-skip") {
				tasksByProject[event.projectName].skipped.push(event.taskName);
			} else if (event.status === "task-start") {
				tasksByProject[event.projectName].executed.push(event.taskName);
			}
		}

		// Assert projects built in order
		const expectedProjects = Object.keys(projects);
		this._t.deepEqual(projectsInOrder, expectedProjects);

		// Assert skipped tasks per project
		for (const [projectName, expectedSkipped] of Object.entries(projects)) {
			const skippedTasks = expectedSkipped.skippedTasks || [];
			const actualSkipped = (tasksByProject[projectName]?.skipped || []).sort();
			const expectedArray = skippedTasks.sort();
			this._t.deepEqual(actualSkipped, expectedArray);
		}
	}
}
