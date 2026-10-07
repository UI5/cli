import sinonGlobal from "sinon";
import {fileURLToPath} from "node:url";
import fs from "node:fs/promises";
import {graphFromPackageDependencies} from "../../../../lib/graph/graph.js";
import {setLogLevel} from "@ui5/logger";

// Ensures that all logging code paths are tested
setLogLevel("silly");

/**
 * Registers the AVA beforeEach/afterEach hooks that wire up the ui5.* process event stubs.
 * Each test file calls this with its own AVA `test` object so the hooks register against the
 * file's own test instance.
 *
 * @param {import("ava").TestFn} test The AVA test object of the calling test file
 */
export function registerBuildHooks(test) {
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

		process.off("ui5.log", t.context.logEventStub);
		process.off("ui5.build-metadata", t.context.buildMetadataEventStub);
		process.off("ui5.project-build-metadata", t.context.projectBuildMetadataEventStub);
		process.off("ui5.build-status", t.context.buildStatusEventStub);
		process.off("ui5.project-build-status", t.context.projectBuildStatusEventStub);
	});
}

/**
 * Creates a FixtureTester subclass bound to the given scope. The scope namespaces the
 * temporary directory tree per test file so that fixtures shared across files
 * (e.g. "application.a") don't collide when AVA runs the files in parallel.
 *
 * The returned class is used as `new FixtureTester(t, fixtureName)` in each test file.
 *
 * @param {string} scope Unique scope segment for the calling test file (e.g. "bundling")
 * @returns {typeof FixtureTester} A FixtureTester subclass bound to `scope`
 */
export function createFixtureTesterFactory(scope) {
	return class ScopedFixtureTester extends FixtureTester {
		constructor(t, fixtureName) {
			super(t, fixtureName, scope);
		}
	};
}

function getFixturePath(fixtureName) {
	return fileURLToPath(new URL(`../../../fixtures/${fixtureName}`, import.meta.url));
}

function getTmpPath(folderName) {
	return fileURLToPath(new URL(`../../../tmp/ProjectBuilder/${folderName}`, import.meta.url));
}

async function rmrf(dirPath) {
	return fs.rm(dirPath, {recursive: true, force: true, maxRetries: 3, retryDelay: 200});
}

class FixtureTester {
	constructor(t, fixtureName, scope) {
		this._t = t;
		this._sinon = t.context.sinon;
		this._fixtureName = fixtureName;
		this._initialized = false;

		// Public
		this.fixturePath = getTmpPath(`${scope}/${fixtureName}`);
		this.destPath = getTmpPath(`${scope}/${fixtureName}/dist`);
		this.ui5DataDir = getTmpPath(`${scope}/${fixtureName}/.ui5`);
	}

	async _initialize() {
		if (this._initialized) {
			return;
		}
		await rmrf(this.fixturePath); // Clean up any previous test runs
		await fs.cp(getFixturePath(this._fixtureName), this.fixturePath, {recursive: true});
		this._initialized = true;
	}

	async buildProject({graphConfig = {}, config = {}, assertions} = {}) {
		await this._initialize();
		this._sinon.resetHistory();

		const graph = await graphFromPackageDependencies({
			...graphConfig,
			cwd: this.fixturePath,
		});

		// Execute the build
		await graph.build({...config, ui5DataDir: this.ui5DataDir});

		// Apply assertions if provided
		if (assertions) {
			this._assertBuild(assertions);
		}
	}

	_assertBuild(assertions) {
		/**
		 * assertions object structure:
		 * {
		 *   projects: {
		 *     "projectName": {
		 *       skippedTasks: ["task1", "task2"],
		 *       writtenResources: {
		 *         "taskName": ["/resources/path/a", "/resources/path/b"],
		 *       },
		 *     },
		 *     // ...
		 *   },
		 *   allProjects: ["projectName1", "projectName2"]
		 * }
		 *
		 * projects - for asserting all projects which are expected to be built
		 * allProjects - optional, for asserting all seen projects nonetheless if built or not
		 *
		 * writtenResources - optional per project, asserts the exact set of resource paths a task
		 *   wrote (sourced from the `writtenResourcePaths` field of the `task-end` build-status
		 *   event). Only tasks listed are asserted; other tasks are ignored. This is the signal for
		 *   delta-build correctness: it reveals WHAT a task did (which outputs it (re-)wrote), not
		 *   just whether it ran.
		 */
		const {projects = {}, allProjects = []} = assertions;

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
				tasksByProject[event.projectName] = {executed: [], skipped: [], writtenResources: {}};
			}
			if (event.status === "task-skip") {
				tasksByProject[event.projectName].skipped.push(event.taskName);
			} else if (event.status === "task-start") {
				tasksByProject[event.projectName].executed.push(event.taskName);
			} else if (event.status === "task-end") {
				tasksByProject[event.projectName].writtenResources[event.taskName] =
					event.writtenResourcePaths;
			}
		}

		// Assert built projects in order
		const expectedProjects = Object.keys(projects);
		this._t.deepEqual(projectsInOrder, expectedProjects);

		// Optional check: Assert seen projects
		if (allProjects.length > 0) {
			const expectedAllProjects = allProjects.sort();
			const actualAllProjects = Array.from(seenProjects).sort();
			this._t.deepEqual(actualAllProjects, expectedAllProjects,
				"All seen projects (built or not) should match expected");
		}

		// Assert skipped tasks and written resources per project
		for (const [projectName, expected] of Object.entries(projects)) {
			const skippedTasks = expected.skippedTasks || [];
			const actualSkipped = (tasksByProject[projectName]?.skipped || []).sort();
			const expectedArray = skippedTasks.sort();
			this._t.deepEqual(actualSkipped, expectedArray);

			if (expected.writtenResources) {
				const actualWritten = tasksByProject[projectName]?.writtenResources || {};
				for (const [taskName, expectedPaths] of Object.entries(expected.writtenResources)) {
					this._t.deepEqual(
						[...(actualWritten[taskName] || [])].sort(),
						[...expectedPaths].sort(),
						`Written resources of task '${taskName}' in project '${projectName}' should match expected`
					);
				}
			}
		}
	}

	/**
	* Helper function to add a new module dependency ("module.z") to an arbitrary root project.
	*
	* @param {string} sourceDir - source path of the root project (e.g. `${this.fixturePath}/webapp` for applications)
	*/
	async addModuleDependency(sourceDir) {
		await fs.mkdir(`${this.fixturePath}/node_modules/module.z/dev`, {recursive: true});
		await fs.writeFile(`${this.fixturePath}/node_modules/module.z/dev/devTools.js`,
			`console.log("module.z devTools");`);
		await fs.writeFile(`${this.fixturePath}/node_modules/module.z/package.json`,
			`{
	"name": "module.z",
	"version": "1.0.0"
}`
		);
		await fs.writeFile(`${this.fixturePath}/node_modules/module.z/ui5.yaml`,
			`---
specVersion: "5.0"
type: module
metadata:
  name: module.z
resources:
  configuration:
    paths:
      /resources/z/module/dev/: dev`);

		await fs.writeFile(`${sourceDir}/moduleConsumer.js`,
			`sap.ui.define(["z/module/dev/devTools"], () => {});`);
		const packageJsonContent = JSON.parse(
			await fs.readFile(`${this.fixturePath}/package.json`, {encoding: "utf8"}));
		if (!packageJsonContent.dependencies) {
			packageJsonContent.dependencies = {};
		}
		packageJsonContent.dependencies["module.z"] = "file:../module.z";
		await fs.writeFile(`${this.fixturePath}/package.json`,
			JSON.stringify(packageJsonContent)
		);
	}

	/**
	* Adds a minimal `sap.ui.core` dependency to an arbitrary root project, at a controllable version.
	*
	* It is declared as a normal `type: library`: it only needs to exist in the graph and expose a
	* version via `taskUtil.getProject("sap.ui.core").getVersion()`. `generateLibraryPreload` reads only
	* the current project's own workspace (never the `dependencies` reader), so the core's built resource
	* content is not an input to a depender's preload — the version reaches the output solely through
	* `getProject("sap.ui.core").getVersion()`.
	*
	* Ships `/resources/ui5loader.js` and `/resources/sap/ui/core/Core.js` so a bundle definition with a
	* `require`/`preload` section filtering `sap/ui/core/Core.js` resolves, plus the `.library` file a
	* library project requires.
	*
	* @param {string} [version="1.120.0"] Initial `package.json` version of the dependency
	*/
	async addSapUiCoreDependency(version = "1.120.0") {
		const modulePath = `${this.fixturePath}/node_modules/@openui5/sap.ui.core`;
		await fs.mkdir(`${modulePath}/src/sap/ui/core`, {recursive: true});
		await fs.writeFile(`${modulePath}/src/ui5loader.js`,
			`(function () {\n\tvar thisIsTheUi5Loader = true;\n\tconsole.log(thisIsTheUi5Loader);\n})()\n`);
		await fs.writeFile(`${modulePath}/src/sap/ui/core/Core.js`,
			`sap.ui.define([], function() {\n\t"use strict";\n\treturn {};\n});\n`);
		await fs.writeFile(`${modulePath}/src/sap/ui/core/.library`,
			`<?xml version="1.0" encoding="UTF-8" ?>\n` +
			`<library xmlns="http://www.sap.com/sap.ui.library.xsd">\n` +
			`\t<name>sap.ui.core</name>\n` +
			`\t<vendor>SAP SE</vendor>\n` +
			`\t<copyright>Some fancy copyright</copyright>\n` +
			`\t<version>${version}</version>\n` +
			`\t<documentation>SAP UI core library</documentation>\n` +
			`</library>\n`);
		await fs.writeFile(`${modulePath}/ui5.yaml`,
			`---
specVersion: "5.0"
type: library
metadata:
  name: sap.ui.core
`);
		await fs.writeFile(`${modulePath}/package.json`,
			JSON.stringify({name: "@openui5/sap.ui.core", version}, null, "\t"));

		const packageJsonContent = JSON.parse(
			await fs.readFile(`${this.fixturePath}/package.json`, {encoding: "utf8"}));
		if (!packageJsonContent.dependencies) {
			packageJsonContent.dependencies = {};
		}
		packageJsonContent.dependencies["@openui5/sap.ui.core"] = "file:./node_modules/@openui5/sap.ui.core";
		await fs.writeFile(`${this.fixturePath}/package.json`,
			JSON.stringify(packageJsonContent)
		);
	}

	/**
	* Changes the `package.json` version of the "sap.ui.core" dependency created by
	* {@link addSapUiCoreDependency}. That `package.json` version is what
	* `taskUtil.getProject("sap.ui.core").getVersion()` returns, which is the only channel through which
	* the core version reaches a depender's `generateLibraryPreload` output.
	*
	* @param {string} version The new `package.json` version (e.g. "2.0.0")
	*/
	async setSapUiCoreDependencyVersion(version) {
		const modulePath = `${this.fixturePath}/node_modules/@openui5/sap.ui.core`;
		const pkgPath = `${modulePath}/package.json`;
		const pkg = JSON.parse(await fs.readFile(pkgPath, {encoding: "utf8"}));
		pkg.version = version;
		await fs.writeFile(pkgPath, JSON.stringify(pkg, null, "\t"));
		// Keep the .library version in sync: a UI5 library project's version is read from .library.
		await fs.writeFile(`${modulePath}/src/sap/ui/core/.library`,
			`<?xml version="1.0" encoding="UTF-8" ?>\n` +
			`<library xmlns="http://www.sap.com/sap.ui.library.xsd">\n` +
			`\t<name>sap.ui.core</name>\n` +
			`\t<vendor>SAP SE</vendor>\n` +
			`\t<copyright>Some fancy copyright</copyright>\n` +
			`\t<version>${version}</version>\n` +
			`\t<documentation>SAP UI core library</documentation>\n` +
			`</library>\n`);
	}

	/**
	* Helper function to add a new component dependency ("component.z") to an arbitrary root project.
	*
	* @param {string} sourceDir - source path of the root project (e.g. `${this.fixturePath}/webapp` for applications)
	*/
	async addComponentDependency(sourceDir) {
		await fs.mkdir(`${this.fixturePath}/node_modules/component.z/src`, {recursive: true});
		await fs.writeFile(`${this.fixturePath}/node_modules/component.z/src/Component.js`,
			`sap.ui.define(["sap/ui/core/UIComponent"], function(UIComponent){
	"use strict";
	return UIComponent.extend('component.z.Component', {
		createContent: function () {
            return new Label({ text: "Hello!" });
        }
	});
});
`);
		await fs.writeFile(`${this.fixturePath}/node_modules/component.z/src/manifest.json`,
			`{
    "_version": "1.1.0",
    "sap.app": {
        "_version": "1.1.0",
        "id": "component.z",
        "type": "component",
        "applicationVersion": {
            "version": "1.2.2"
        },
        "embeds": ["embedded"],
        "title": "{{title}}"
    }
}`);
		await fs.writeFile(`${this.fixturePath}/node_modules/component.z/ui5.yaml`,
			`---
specVersion: "5.0"
type: component
metadata:
  name: component.z`);
		await fs.writeFile(`${this.fixturePath}/node_modules/component.z/package.json`,
			`{
	"name": "component.z",
	"version": "1.0.0"
}`
		);

		await fs.writeFile(`${sourceDir}/componentConsumer.js`,
			`sap.ui.define(["component/z"], () => {});`);
		const packageJsonContent = JSON.parse(
			await fs.readFile(`${this.fixturePath}/package.json`, {encoding: "utf8"}));
		if (!packageJsonContent.dependencies) {
			packageJsonContent.dependencies = {};
		}
		packageJsonContent.dependencies["component.z"] = "file:../component.z";
		await fs.writeFile(`${this.fixturePath}/package.json`,
			JSON.stringify(packageJsonContent)
		);
	}

	/**
	* Helper function to add a new library dependency ("library.z") to an arbitrary root project.
	*
	* @param {string} sourceDir - source path of the root project (e.g. `${this.fixturePath}/webapp` for applications)
	*/
	async addLibraryDependency(sourceDir) {
		await fs.mkdir(`${this.fixturePath}/node_modules/library.z/src/library/z`, {recursive: true});
		await fs.writeFile(`${this.fixturePath}/node_modules/library.z/src/library/z/library.js`,
			`
sap.ui.define([
	"sap/base/util/ObjectPath",
	"sap/ui/core/Core",
	"sap/ui/core/library"
], function (ObjectPath, Core) {
	"use strict";

	Core.initLibrary({
		name: "library.z",
		version: ` + "\"${version}\"" + `,
		dependencies: [
			"sap.ui.core"
		],
		types: [
			"library.z.ExampleColor"
		],
		interfaces: [],
		elements: [],
		noLibraryCSS: false
	});
	const thisLib = ObjectPath.get("library.z");

	thisLib.ExampleColor = {
		Default : "Default",
		Highlight : "Highlight"
	};
	return thisLib;
});`);
		await fs.writeFile(`${this.fixturePath}/node_modules/library.z/src/library/z/manifest.json`,
			JSON.stringify({"sap.app": {"id": "library.z", "type": "library"}}, null, "\t"));
		await fs.writeFile(`${this.fixturePath}/node_modules/library.z/src/library/z/.library`,
			`<?xml version="1.0" encoding="UTF-8" ?>
<library xmlns="http://www.sap.com/sap.ui.library.xsd" >

	<name>library.z</name>
	<vendor>SAP SE</vendor>
	<copyright>Some fancy copyright</copyright>
	<version>`+"${version}"+`</version>

	<documentation>Library Z</documentation>

</library>`);
		await fs.writeFile(`${this.fixturePath}/node_modules/library.z/ui5.yaml`,
			`---
specVersion: "5.0"
type: library
metadata:
  name: library.z
`);
		await fs.writeFile(`${this.fixturePath}/node_modules/library.z/package.json`,
			`{
	"name": "library.z",
	"version": "1.0.0"
}`
		);

		await fs.writeFile(`${sourceDir}/libraryConsumer.js`,
			`sap.ui.define(["library/z/library"],
	(LibraryZ) => {
		console.log(LibraryZ.ExampleColor.Default);
});`);
		const packageJsonContent = JSON.parse(
			await fs.readFile(`${this.fixturePath}/package.json`, {encoding: "utf8"}));
		if (!packageJsonContent.dependencies) {
			packageJsonContent.dependencies = {};
		}
		packageJsonContent.dependencies["library.z"] = "file:../library.z";
		await fs.writeFile(`${this.fixturePath}/package.json`,
			JSON.stringify(packageJsonContent)
		);
	}

	/**
	* Helper function to add a new theme library dependency ("themelib.z") to an arbitrary root project.
	*
	* @param {string} sourceDir - source path of the root project (e.g. `${this.fixturePath}/webapp` for applications)
	*/
	async addThemeLibraryDependency(sourceDir) {
		await fs.mkdir(`${this.fixturePath}/node_modules/themelib.z/src/themelib/z/themes/my_theme`, {recursive: true});
		await fs.writeFile(
			`${this.fixturePath}/node_modules/themelib.z/src/themelib/z/themes/my_theme/library.source.less`,
			`@mycolor: blue;
.sapUiBody {
	background-color: @mycolor;
}`);
		await fs.writeFile(`${this.fixturePath}/node_modules/themelib.z/src/themelib/z/themes/my_theme/.theme`,
			`<?xml version="1.0" encoding="UTF-8" ?>
<theme xmlns="http://www.sap.com/sap.ui.library.xsd" >
	<name>my_theme</name>
	<vendor>me</vendor>
	<copyright>` +"\"${copyright}\"" + `</copyright>
	<version>` +"\"${version}\"" + `</version>
</theme>`);
		await fs.writeFile(`${this.fixturePath}/node_modules/themelib.z/ui5.yaml`,
			`---
specVersion: "5.0"
type: theme-library
metadata:
  name: themelib.z
`);
		await fs.writeFile(`${this.fixturePath}/node_modules/themelib.z/package.json`,
			`{
	"name": "themelib.z",
	"version": "1.0.0"
}`
		);

		await fs.writeFile(`${sourceDir}/themelibConsumer.js`,
			`sap.ui.define(["sap/ui/core/Theming"], (Theming) => {
	Theming.setTheme("my_theme");
	console.log(Theming.getTheme());
});`);
		const packageJsonContent = JSON.parse(
			await fs.readFile(`${this.fixturePath}/package.json`, {encoding: "utf8"}));
		if (!packageJsonContent.dependencies) {
			packageJsonContent.dependencies = {};
		}
		packageJsonContent.dependencies["themelib.z"] = "file:../themelib.z";
		await fs.writeFile(`${this.fixturePath}/package.json`,
			JSON.stringify(packageJsonContent)
		);
	}

	/**
	* Helper function to add a multi-library theme-library dependency ("themelib.multi") to a root project.
	*
	* Unlike {@link addThemeLibraryDependency}, this theme-library ships `library.source.less` for TWO
	* separate library namespaces (`lib/one` and `lib/two`) and gates each theme with a sibling
	* `library.js` marker file placed under the owning library's namespace directory in the
	* theme-library's OWN src tree. When the theme-library is built as a DEPENDENCY
	* (`isRootProject() === false`), buildThemes' `librariesPattern`
	* (`/resources/**&#47;(*.library|library.js)`) then filters which themes are built by the presence
	* of these markers (see packages/builder/lib/tasks/buildThemes.js `isAvailable`).
	*
	* By default both markers are present. Pass `{libTwoMarker: false}` to omit `lib/two`'s
	* `library.js` — its theme is then filtered out. The `lib/one` marker is always written so
	* `availableLibraries` is never empty (which would trigger the "build everything" escape hatch in
	* buildThemes). No `sap/ui/core/themes/*` is shipped, so the `themesPattern` theme-name filter is
	* bypassed and only the `librariesPattern` library filter is active.
	*
	* @param {string} sourceDir - source path of the root project (e.g. `${this.fixturePath}/webapp`)
	* @param {object} [options]
	* @param {boolean} [options.libTwoMarker=true] Whether to write the `lib/two/library.js` marker
	*/
	async addMultiLibraryThemeLibraryDependency(sourceDir, {libTwoMarker = true} = {}) {
		const modulePath = `${this.fixturePath}/node_modules/themelib.multi`;

		const writeThemeSource = async (namespace) => {
			const themeDir = `${modulePath}/src/${namespace}/themes/my_theme`;
			await fs.mkdir(themeDir, {recursive: true});
			await fs.writeFile(`${themeDir}/library.source.less`,
				`@mycolor: blue;
.sapUiBody {
	background-color: @mycolor;
}`);
			await fs.writeFile(`${themeDir}/.theme`,
				`<?xml version="1.0" encoding="UTF-8" ?>
<theme xmlns="http://www.sap.com/sap.ui.library.xsd" >
	<name>my_theme</name>
	<vendor>me</vendor>
	<copyright>` +"\"${copyright}\"" + `</copyright>
	<version>` +"\"${version}\"" + `</version>
</theme>`);
		};

		// A minimal `library.js` marker file for a given namespace. Its mere existence (matching
		// librariesPattern) is what enables the corresponding theme to be built.
		const writeLibraryMarker = async (namespace) => {
			await fs.writeFile(`${modulePath}/src/${namespace}/library.js`,
				`sap.ui.define([], () => {});\n`);
		};

		await writeThemeSource("lib/one");
		await writeThemeSource("lib/two");
		await writeLibraryMarker("lib/one");
		if (libTwoMarker) {
			await writeLibraryMarker("lib/two");
		}

		await fs.writeFile(`${modulePath}/ui5.yaml`,
			`---
specVersion: "5.0"
type: theme-library
metadata:
  name: themelib.multi
`);
		await fs.writeFile(`${modulePath}/package.json`,
			`{
	"name": "themelib.multi",
	"version": "1.0.0"
}`
		);

		await fs.writeFile(`${sourceDir}/themelibMultiConsumer.js`,
			`sap.ui.define(["sap/ui/core/Theming"], (Theming) => {
	Theming.setTheme("my_theme");
	console.log(Theming.getTheme());
});`);
		const packageJsonContent = JSON.parse(
			await fs.readFile(`${this.fixturePath}/package.json`, {encoding: "utf8"}));
		if (!packageJsonContent.dependencies) {
			packageJsonContent.dependencies = {};
		}
		packageJsonContent.dependencies["themelib.multi"] = "file:../themelib.multi";
		await fs.writeFile(`${this.fixturePath}/package.json`,
			JSON.stringify(packageJsonContent)
		);
	}

	/**
	* Adds or removes the `lib/two/library.js` marker of the "themelib.multi" dependency created by
	* {@link addMultiLibraryThemeLibraryDependency}, to toggle whether buildThemes builds `lib/two`'s theme.
	*
	* @param {boolean} present Whether the `lib/two/library.js` marker should exist afterwards
	*/
	async setMultiLibraryThemeLibTwoMarker(present) {
		const markerPath = `${this.fixturePath}/node_modules/themelib.multi/src/lib/two/library.js`;
		if (present) {
			await fs.writeFile(markerPath, `sap.ui.define([], () => {});\n`);
		} else {
			await fs.rm(markerPath, {force: true});
		}
	}
}
