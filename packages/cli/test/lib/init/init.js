const {test} = require("ava");
const path = require("path");

const ui5Cli = require("../../../");
const init = ui5Cli.init;

test("Init for application", async (t) => {
	const projectConfig = await init({
		cwd: path.join(__dirname, "..", "..", "fixtures", "init-application")
	});

	t.deepEqual(projectConfig, {
		specVersion: "0.1",
		type: "application",
		metadata: {
			name: "init-application"
		}
	});
});

test("Init for library", async (t) => {
	const projectConfig = await init({
		cwd: path.join(__dirname, "..", "..", "fixtures", "init-library")
	});

	t.deepEqual(projectConfig, {
		specVersion: "0.1",
		type: "library",
		metadata: {
			name: "init-library"
		}
	});
});

test("Init for invalid project (Found 'webapp' and 'src' folders)", async (t) => {
	await t.throws(init({
		cwd: path.join(__dirname, "..", "..", "fixtures", "init-invalid-webapp-src")
	}),
	"Could not detect project type: Found 'webapp' and 'src' folders.\n" +
	"Applications should only have a 'webapp' folder.\n" +
	"Libraries should only have a 'src' and (optional) 'test' folder.");
});

test("Init for invalid project (No package.json)", async (t) => {
	await t.throws(init({
		cwd: path.join(__dirname, "..", "..", "fixtures", "init-invalid-no-package-json")
	}),
	"Initialization not possible: Missing package.json file");
});
