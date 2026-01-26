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
		const eventArgs = this._t.context.projectBuildStatusEventStub.args.map((args) => args[0]);

		const projectsInOrder = [];
		const seenProjects = new Set();
		const tasksByProject = {};

		for (const event of eventArgs) {
			if (!seenProjects.has(event.projectName)) {
				projectsInOrder.push(event.projectName);
				seenProjects.add(event.projectName);
			}
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
