// Test running "ui5 build"
// with fixtures (under ../fixtures)
// and by using node's child_process module and the ui5.cjs under ../../../packages/cli/bin/ui5.cjs.

import { execFile } from "node:child_process";
import {test, describe} from "node:test";
import {fileURLToPath} from "node:url";
import path from "node:path";
import fs from "node:fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ui5CliPath = path.resolve(__dirname, "../../../packages/cli/bin/ui5.cjs");

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
		// Copy fixture to temp location
		await fs.cp(this.originFixturePath, this.tmpPath, {recursive: true});
		// Install node_modules
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
	test("run the UI5 build command", async ({assert}) => {
		const fixtureHelper = new FixtureHelper("application.a.ts");
		await fixtureHelper.init();
		process.env.UI5_DATA_DIR = `${fixtureHelper.dotUi5Path}`;
		process.chdir(fixtureHelper.tmpPath);
		await new Promise((resolve, reject) => {
			execFile("node", [ui5CliPath, "build", "--dest", fixtureHelper.distPath], async (error, stdout, stderr) => {
				if (error) {
					assert.fail(error);
					reject(error);
					return;
				}
				resolve();
			});
		});

		// Test: no TS syntax is left in the preload (transpile + preload tasks succeeeded)
		const componentPreload = await fs.readFile(path.resolve(fixtureHelper.distPath, "Component-preload.js"), "utf-8");
		assert.ok(componentPreload.includes("application/a/ts/controller/Test.controller"), "Component-preload.js should contain the TS resource transpiled to JS");
		assert.ok(!componentPreload.includes("randomTSType"), "Component-preload.js should NOT contain any TS syntax");
		const componentPreloadMap = await fs.readFile(path.resolve(fixtureHelper.distPath, "Component-preload.js.map"), "utf-8");
		assert.ok(componentPreloadMap.includes("randomTSType"), "Component-preload.js.map should contain the TS type information");
	});
});
