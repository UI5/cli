const test = require("ava");
const sinon = require("sinon");
const fs = require("graceful-fs");

test.afterEach.always((t) => {
	sinon.restore();
});

const AbstractFormatter = require("../../../lib/types/AbstractFormatter");

class CustomFormatter extends AbstractFormatter {}

test.serial("dirExists: existing dir stat rejects", async (t) => {
	sinon.stub(fs, "stat").callsArgWith(1, new Error("MYERROR"));
	const error = await t.throwsAsync(new CustomFormatter({}).dirExists("non-existing"));
	t.deepEqual(error.message, "MYERROR", "error code MYERROR when reading dir");
});

test.serial("dirExists: non existing dir", async (t) => {
	sinon.stub(fs, "stat").callsArgWith(1, {code: "ENOENT"});
	const bExists = await new CustomFormatter({}).dirExists("non-existing");
	t.false(bExists, "non-existing does not exist");
});

test.serial("dirExists: existing dir", async (t) => {
	sinon.stub(fs, "stat").callsArgWith(1, null, {isDirectory: () => true});
	const bExists = await new CustomFormatter({}).dirExists("dir");
	t.true(bExists, "directory exists");
});

test.serial("dirExists: existing file", async (t) => {
	sinon.stub(fs, "stat").callsArgWith(1, null, {isDirectory: () => false});
	const bExists = await new CustomFormatter({}).dirExists("file");
	t.false(bExists, "file exists but is not a directory");
});
