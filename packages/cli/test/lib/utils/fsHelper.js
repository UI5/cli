const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");
const {exists, pathsExist} = require("../../../lib/utils/fsHelper");

test.afterEach.always(() => {
	sinon.restore();
	mock.stopAll();
});

test("Returns true if directory or file exists", async (t) => {
	t.is(await exists("./test/fixtures/init/application/ui5.yaml"), true, "ui5.yaml found in path");
	t.is(await exists("./test/fixtures/init"), true, "directory exists in path");
});

test("Returns true if list of paths exist", async (t) => {
	t.deepEqual(await pathsExist(["src", "test"], "./test/fixtures/init/library"), [true, true], "paths do exist");
});

test("Returns false if ui5.yaml was not found or directory does not exist", async (t) => {
	t.is(await exists("./test/fixtures/init/invalid/ui5.yaml"), false, "ui5.yaml was not found in path");
	t.is(await exists("./path/does/not/exist"), false, "directory does not exist");
});

test("Returns results of multiple paths", async (t) => {
	t.deepEqual(await pathsExist(["src", "test", "notExists"], "./test/fixtures/init/library"),
		[true, true, false], "some paths do exist");
});

test.serial("Throws in case of fs.stat error", async (t) => {
	sinon.stub(require("fs"), "stat").callsArgWithAsync(1, new Error("Some fs.stat error"));
	const {exists, pathsExist} = mock.reRequire("../../../lib/utils/fsHelper");

	await t.throwsAsync(exists("./test/fixtures/init/application/ui5.yaml"), {
		message: "Some fs.stat error"
	});

	await t.throwsAsync(pathsExist(["src", "test"], "./foo"), {
		message: "Some fs.stat error"
	});
});
