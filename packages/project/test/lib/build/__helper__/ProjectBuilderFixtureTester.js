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
		 *     },
		 *     // ...
		 *   },
		 *   allProjects: ["projectName1", "projectName2"]
		 * }
		 *
		 * projects - for asserting all projects which are expected to be built
		 * allProjects - optional, for asserting all seen projects nonetheless if built or not
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
				tasksByProject[event.projectName] = {executed: [], skipped: []};
			}
			if (event.status === "task-skip") {
				tasksByProject[event.projectName].skipped.push(event.taskName);
			} else if (event.status === "task-start") {
				tasksByProject[event.projectName].executed.push(event.taskName);
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

		// Assert skipped tasks per project
		for (const [projectName, expectedSkipped] of Object.entries(projects)) {
			const skippedTasks = expectedSkipped.skippedTasks || [];
			const actualSkipped = (tasksByProject[projectName]?.skipped || []).sort();
			const expectedArray = skippedTasks.sort();
			this._t.deepEqual(actualSkipped, expectedArray);
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
}
