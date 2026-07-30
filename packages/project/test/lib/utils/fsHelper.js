import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import path from "node:path";
import {exists, pathsExist, dirExists, findExistingDir} from "../../../lib/utils/fsHelper.js";

test.afterEach.always(() => {
	sinon.restore();
});

test("exists: returns true if directory or file exists", async (t) => {
	t.is(await exists("./test/fixtures/application.a/ui5.yaml"), true, "ui5.yaml found in path");
	t.is(await exists("./test/fixtures/application.a"), true, "directory exists in path");
});

test("exists: returns false if file or directory does not exist", async (t) => {
	t.is(await exists("./test/fixtures/application.a/invalid.yaml"), false, "file was not found in path");
	t.is(await exists("./path/does/not/exist"), false, "directory does not exist");
});

test.serial("exists: re-throws unexpected fs.stat errors", async (t) => {
	const {exists} = await esmock("../../../lib/utils/fsHelper.js", {
		"node:fs/promises": {
			stat: sinon.stub().rejects(new Error("Some fs.stat error"))
		}
	});
	await t.throwsAsync(exists("./test/fixtures/application.a/ui5.yaml"), {
		message: "Some fs.stat error"
	});
});

test("pathsExist: returns a boolean for each path", async (t) => {
	t.deepEqual(await pathsExist(["ui5.yaml", "webapp"], "./test/fixtures/application.a"),
		[true, true], "paths do exist");
	t.deepEqual(await pathsExist(["ui5.yaml", "webapp", "notExists"], "./test/fixtures/application.a"),
		[true, true, false], "some paths do exist");
});

test("dirExists: returns true only for existing directories", async (t) => {
	t.is(await dirExists("./test/fixtures/application.a"), true, "directory exists");
	t.is(await dirExists("./test/fixtures/application.a/ui5.yaml"), false, "a file is not a directory");
	t.is(await dirExists("./path/does/not/exist"), false, "missing directory");
});

test("findExistingDir: returns the directory itself when it exists", async (t) => {
	const dir = path.resolve("./test/fixtures/application.a");
	t.is(await findExistingDir(dir), dir, "existing directory is returned unchanged");
});

test("findExistingDir: walks up to the nearest existing ancestor", async (t) => {
	const existing = path.resolve("./test/fixtures/application.a");
	const missing = path.join(existing, "does", "not", "exist", "yet");
	t.is(await findExistingDir(missing), existing, "nearest existing ancestor is returned");
});

test.serial("findExistingDir: returns the filesystem root when no ancestor exists", async (t) => {
	const {findExistingDir} = await esmock("../../../lib/utils/fsHelper.js", {
		"node:fs/promises": {
			stat: sinon.stub().rejects(Object.assign(new Error("ENOENT"), {code: "ENOENT"}))
		}
	});
	const start = path.resolve("/some/missing/path");
	t.is(await findExistingDir(start), path.parse(start).root,
		"walk-up stops at the filesystem root");
});
