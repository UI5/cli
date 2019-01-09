const {test} = require("ava");
const {exists, pathsExist} = require("../../../lib/utils/fsHelper");

test("check if directory or file exists", async (t) => {
	t.is(await exists("./test/fixtures/init/application/ui5.yaml"), true, "ui5.yaml found in path");
	t.is(await exists("./test/fixtures/init"), true, "directory exists in path");
});

test("check if list of paths exist", async (t) => {
	t.deepEqual(await pathsExist(["src", "test"], "./test/fixtures/init/library"), [true, true], "paths do exist");
});

test("Error: throws if ui5.yaml was not found or directory does not exist", async (t) => {
	t.is(await exists("./test/fixtures/init/invalid/ui5.yaml"), false, "ui5.yaml was not found in path");
	t.is(await exists("./path/does/not/exist"), false, "directory does not exist");
});

test("Error: throws if not all paths exist", async (t) => {
	t.deepEqual(await pathsExist(["src", "test", "notExists"], "./test/fixtures/init/library"),
		[true, true, false], "paths do exist");
});
