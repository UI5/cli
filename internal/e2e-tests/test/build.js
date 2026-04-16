// Test running "ui5 build"
// with fixtures (under ../fixtures)
// and by using node's child_process module and the ui5.cjs under ../../../packages/cli/bin/ui5.cjs.

import { execFile } from "node:child_process";
import {describe, test, afterEach} from "node:test";
import {fileURLToPath} from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import AdmZip from "adm-zip";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ui5CliPath = path.resolve(__dirname, "../../../packages/cli/bin/ui5.cjs");
const originalCwd = process.cwd();

class FixtureHelper {
	constructor(fixtureName) {
		this.fixtureName = fixtureName;
		this.originFixturePath = path.resolve(__dirname, "../fixtures", fixtureName);
		this.tmpPath = path.resolve(__dirname, "../tmp", fixtureName);
		this.dotUi5Path = path.resolve(this.tmpPath, ".ui5");
		this.distPath = path.resolve(this.tmpPath, "dist");
	}

	async init() {
		// Clean up previous runs
		await fs.rm(this.tmpPath, {recursive: true, force: true});
		// Copy source files to temp location
		await fs.cp(this.originFixturePath, this.tmpPath, {recursive: true});
		// Install node_modules
		await this._installNodeModules();
		// Setup environment
		process.env.UI5_DATA_DIR = `${this.dotUi5Path}`;
		process.chdir(this.tmpPath);
	}

	async prepareForNextRun() {
		// Delete everything from the tmp/<projectname> folder except .ui5, dist & node_modules folders
		const entries = await fs.readdir(this.tmpPath, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.name === ".ui5" || entry.name === "dist" || entry.name === "node_modules") {
				continue;
			}
			const entryPath = path.resolve(this.tmpPath, entry.name);
			await fs.rm(entryPath, { recursive: true, force: true });
		}
		// Copy source files to temp location
		await fs.cp(this.originFixturePath, this.tmpPath, {recursive: true});
	}

	async build(assert, ui5YamlName) {
		await new Promise((resolve, reject) => {
			execFile("node", [ui5CliPath, "build", "--config", ui5YamlName, "--dest", this.distPath], async (error, stdout, stderr) => {
				if (error) {
					assert.fail(error);
					reject(error);
					return;
				}
				resolve();
			});
		});
	}

	async _installNodeModules() {
		await new Promise((resolve, reject) => {
			execFile("npm", ["install"], { cwd: this.tmpPath }, (error, stdout, stderr) => {
				if (error) {
					reject(error);
					return;
				}
				resolve();
			});
		});
	}
}

describe("ui5 build", () => {
	afterEach(() => {
		process.env.UI5_DATA_DIR = undefined;
		process.chdir(originalCwd);
	});

	test("ui5-tooling-transpile", async ({assert}) => {
		const fixtureHelper = new FixtureHelper("application.a.ts");
		await fixtureHelper.init();
		const ui5YamlName = "ui5-tooling-transpile.yaml";

		// #1 Build
		await fixtureHelper.build(assert, ui5YamlName);

		// Test: no TS syntax is left in the preload (transpile + preload tasks succeeeded)
		const componentPreload = await fs.readFile(path.resolve(fixtureHelper.distPath, "Component-preload.js"), "utf-8");
		assert.ok(componentPreload.includes("application/a/ts/controller/Test.controller"), "Component-preload.js should contain the TS resource transpiled to JS");
		assert.ok(!componentPreload.includes("randomTSType"), "Component-preload.js should NOT contain any TS syntax");
		const componentPreloadMap = await fs.readFile(path.resolve(fixtureHelper.distPath, "Component-preload.js.map"), "utf-8");
		assert.ok(componentPreloadMap.includes("randomTSType"), "Component-preload.js.map should contain the TS type information");

		// --------------------------------------------------------------------------------------------

		// Modify source files
		await fixtureHelper.prepareForNextRun();
		const fileToModify = path.resolve(fixtureHelper.tmpPath, "webapp/controller/Test.controller.ts");
		const fileContent = await fs.readFile(fileToModify, "utf-8");
		const modifiedContent = fileContent.replace("second: \"test\"", "second: \"test_2\"");
		await fs.writeFile(fileToModify, modifiedContent, "utf-8");

		// #2 Build
		await fixtureHelper.build(assert, ui5YamlName);

		// Test: the modified content is reflected in the new build output (transpile + preload tasks succeeeded)
		const newComponentPreload = await fs.readFile(path.resolve(fixtureHelper.distPath, "Component-preload.js"), "utf-8");
		assert.ok(newComponentPreload.includes("second:\"test_2\""), "Component-preload.js should contain the updated content from the modified source file");
	});

	test("ui5-task-zipper", async ({assert}) => {
		const fixtureHelper = new FixtureHelper("application.a");
		await fixtureHelper.init();
		const ui5YamlName = "ui5-task-zipper.yaml";

		// #1 Build
		await fixtureHelper.build(assert, ui5YamlName);

		// Test: the zip file is created in the dist folder
		const zipFilePath = path.resolve(fixtureHelper.distPath, "webapp.zip");
		const zipFileExists = await fs.access(zipFilePath).then(() => true).catch(() => false);
		assert.ok(zipFileExists, "The zip file should be created in the dist folder");

		// Check the archive content
		const zip = new AdmZip(zipFilePath);
		const zipEntries = zip.getEntries();
		assert.ok(zipEntries.length > 0, "The zip file should contain entries");

		// Check that the zip file contains the expected source file
		const testControllerEntry = zipEntries.find(entry => entry.entryName === "controller/Test.controller.js");
		assert.ok(testControllerEntry, "The zip file should contain the expected source file");

		// --------------------------------------------------------------------------------------------

		// Delete a source file
		await fixtureHelper.prepareForNextRun();
		await fs.rm(path.resolve(fixtureHelper.tmpPath, "webapp/controller/Test.controller.js"));

		// #2 Build
		await fixtureHelper.build(assert, ui5YamlName);

		// Test: the zip file is updated and does not contain the deleted file
		const newZipFileExists = await fs.access(zipFilePath).then(() => true).catch(() => false);
		assert.ok(newZipFileExists, "The zip file should be created in the dist folder after the second build");

		// Check the archive content
		const zip2 = new AdmZip(zipFilePath);
		const zipEntries2 = zip2.getEntries();
		assert.ok(zipEntries2.length > 0, "The zip file should contain entries after the second build");

		// Check that the zip file does NOT contain the expected source file anymore
		const deletedTestControllerEntry = zipEntries2.find(entry => entry.entryName === "controller/Test.controller.js");
		assert.ok(!deletedTestControllerEntry, "The zip file should NOT contain the deleted source file");
	});

	test("ui5-tooling-modules", async ({assert}) => {
		const fixtureHelper = new FixtureHelper("application.a");
		await fixtureHelper.init();
		const ui5YamlName = "ui5-tooling-modules.yaml";

		// #1 Build (no thirdparty module yet -> just checking that the build succeeds)
		await fixtureHelper.build(assert, ui5YamlName);

		// --------------------------------------------------------------------------------------------

		// Add a new source file with a third party import
		await fixtureHelper.prepareForNextRun();
		const newControllerPath = path.resolve(fixtureHelper.tmpPath, "webapp/controller/New.controller.js");
		const newControllerContent =
`sap.ui.define(["chart.js"], (chartJS) => {
	return Controller.extend("application.a.controller.New",{
		onInit() {
			console.log(chartJS);
		}
	});
});`;
		await fs.writeFile(newControllerPath, newControllerContent, "utf-8");

		// #2 Build
		await fixtureHelper.build(assert, ui5YamlName);

		// Test: the dist contains the new controller and the third party import
		const newComponentPreload = await fs.readFile(path.resolve(fixtureHelper.distPath, "Component-preload.js"), "utf-8");
		assert.ok(newComponentPreload.includes("sap.ui.predefine(\"application/a/controller/New.controller\", [\"application/a/thirdparty/chart.js\"]"), "Component-preload.js should contain the 'New' controller and chart.js");
	});

	test("ui5-tooling-stringreplace", async ({assert}) => {
		const fixtureHelper = new FixtureHelper("application.a");
		await fixtureHelper.init();
		const ui5YamlName = "ui5-tooling-stringreplace.yaml";

		// #1 Build (no string replacing yet -> just checking that the build succeeds)
		await fixtureHelper.build(assert, ui5YamlName);

		// --------------------------------------------------------------------------------------------


		// Add a new source file with a placeholder string
		await fixtureHelper.prepareForNextRun();
		const newControllerPath = path.resolve(fixtureHelper.tmpPath, "webapp/controller/New.controller.js");
		const newControllerContent =
`sap.ui.define([], () => {
	return Controller.extend("application.a.controller.New",{
		onInit() {
			console.log(\${PLACEHOLDER_TEXT});
		}
	});
});`;
		await fs.writeFile(newControllerPath, newControllerContent, "utf-8");

		// #2 Build
		// FIXME: Currently failing here for IB (https://github.com/UI5/cli/pull/1267), April 02 2026 - aa3a2c1c04f7a5cd27650335cde37a798baacf2a
		// Error message:
		// ("Minification failed with error: Unexpected token punc «{», expected punc «,» in file /resources/application/a/controller/New.controller.js (line 4, col 16, pos 114)")
		//
		// -> Probably, the string replacement doesn't get executed as very first middleware (minify happens earlier unexpectedly)
		await fixtureHelper.build(assert, ui5YamlName);

		// Test: the placeholder in the source file is replaced in the dist output
		const componentPreload = await fs.readFile(path.resolve(fixtureHelper.distPath, "Component-preload.js"), "utf-8");
		assert.ok(componentPreload.includes("console.log(\"INSERTED_TEXT\")"), "The placeholder should get replaced with the expected text in the component preload");
	});
});
