const test = require("ava");
const path = require("path");
const fs = require("graceful-fs");
const sinon = require("sinon");
const escapeStringRegexp = require("escape-string-regexp");
const staticTranslator = require("../../..").translators.static;
const projectPath = path.join(__dirname, "..", "..", "fixtures", "application.h");

test("Generates dependency tree for project with projectDependencies.yaml", (t) => {
	return staticTranslator.generateDependencyTree(projectPath)
		.then((parsedTree) => {
			t.deepEqual(parsedTree, expectedTree, "Parsed correctly");
		});
});

test("Generates dependency tree for project with projectDependencies.yaml (via parameters)", (t) => {
	return staticTranslator.generateDependencyTree(projectPath, {
		parameters: [path.join(projectPath, "projectDependencies.yaml")]
	})
		.then((parsedTree) => {
			t.deepEqual(parsedTree, expectedTree, "Parsed correctly");
		});
});

test("Generates dependency tree for project by passing tree object", (t) => {
	return staticTranslator.generateDependencyTree(projectPath, {
		tree: {
			id: "testsuite",
			version: "0.0.1",
			description: "Sample App",
			main: "index.html",
			path: "./",
			dependencies: [
				{
					id: "sap.f",
					version: "1.56.1",
					path: "../sap.f"
				},
				{
					id: "sap.m",
					version: "1.61.0",
					path: "../sap.m"
				}
			]
		}
	})
		.then((parsedTree) => {
			t.deepEqual(parsedTree, expectedTree, "Parsed correctly");
		});
});

test("Error: Throws if projectDependencies.yaml was not found", async (t) => {
	const projectPath = "notExistingPath";
	const fsError = new Error("File not found");
	const fsStub = sinon.stub(fs, "readFile");
	fsStub.callsArgWith(1, fsError);
	const error = await t.throwsAsync(staticTranslator.generateDependencyTree(projectPath));
	const yamlPath = path.join(projectPath, "projectDependencies.yaml");
	t.regex(error.message,
		new RegExp(`\\[static translator\\] Failed to load dependency tree from path ` +
			`${escapeStringRegexp(yamlPath)} - Error: ENOENT:`));
	fsStub.restore();
});

const expectedTree = {
	id: "testsuite",
	version: "0.0.1",
	description: "Sample App",
	main: "index.html",
	path: path.resolve(projectPath, "./"),
	dependencies: [
		{
			id: "sap.f",
			version: "1.56.1",
			path: path.resolve(projectPath, "../sap.f")
		},
		{
			id: "sap.m",
			version: "1.61.0",
			path: path.resolve(projectPath, "../sap.m")
		}
	]
};
