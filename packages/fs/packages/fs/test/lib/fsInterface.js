const test = require("ava");
const {promisify} = require("util");
const Buffer = require("buffer").Buffer;
const path = require("path");
const fs = require("fs");
const ui5Fs = require("../../");
const fsInterface = ui5Fs.fsInterface;
const MemAdapter = ui5Fs.adapters.Memory;
const FsAdapter = ui5Fs.adapters.FileSystem;
const Resource = ui5Fs.Resource;

const assertReadFile = (t, readFile, basepath, filepath, content) => {
	content = content || "content of " + filepath;
	const fullpath = path.join(basepath, filepath);
	return readFile(fullpath).then((buffer) => {
		t.true(Buffer.isBuffer(buffer));
		t.deepEqual(buffer.toString(), content);
	}).then(() => readFile(fullpath, {})).then((buffer) => {
		t.true(Buffer.isBuffer(buffer));
		t.deepEqual(buffer.toString(), content);
	}).then(() => readFile(fullpath, {encoding: null})).then((buffer) => {
		t.true(Buffer.isBuffer(buffer));
		t.deepEqual(buffer.toString(), content);
	}).then(() => readFile(fullpath, "utf8").then((content) => {
		t.is(typeof content, "string");
		t.deepEqual(content, content);
	}).then(() => readFile(fullpath, {encoding: "utf8"})).then((content) => {
		t.is(typeof content, "string");
		t.deepEqual(content, content);
	}));
};

test("MemAdapter: readFile", (t) => {
	const memAdapter = new MemAdapter({
		virBasePath: "/"
	});
	const fs = fsInterface(memAdapter);
	const readFile = promisify(fs.readFile);

	const fsPath = path.join("/", "foo.txt");
	return memAdapter.write(new Resource({
		path: "/foo.txt",
		string: `content of ${fsPath}`
	})).then(() => assertReadFile(t, readFile, "", fsPath));
});

test("FsAdapter: readFile with non-ASCII characters in path", (t) => {
	const fsAdapter = new FsAdapter({
		virBasePath: "/",
		fsBasePath: path.join(__dirname, "..", "fixtures", "fsInterfáce")
	});
	const fs = fsInterface(fsAdapter);
	const readFile = promisify(fs.readFile);

	return assertReadFile(t, readFile, "", path.join("/", "bâr.txt"), "content");
});

test("fs: readFile", (t) => {
	const readFile = promisify(fs.readFile);
	return assertReadFile(t, readFile,
		path.join(__dirname, "..", "fixtures", "fsInterfáce"), path.join("/", "foo.txt"), "content");
});


const assertStat = (t, stat, basepath, filepath) => {
	const fullpath = path.join(basepath, filepath);
	return stat(fullpath).then((stats) => {
		t.is(stats.isFile(), true);
		t.is(stats.isDirectory(), false);
		t.is(stats.isBlockDevice(), false);
		t.is(stats.isCharacterDevice(), false);
		t.is(stats.isSymbolicLink(), false);
		t.is(stats.isFIFO(), false);
		t.is(stats.isSocket(), false);
	});
};

test("MemAdapter: stat", (t) => {
	const memAdapter = new MemAdapter({
		virBasePath: "/"
	});
	const fs = fsInterface(memAdapter);
	const stat = promisify(fs.stat);

	const fsPath = path.join("/", "foo.txt");
	return memAdapter.write(new Resource({
		path: "/foo.txt",
		string: `content of ${fsPath}`
	})).then(() => assertStat(t, stat, "", fsPath));
});

test("FsAdapter: stat", (t) => {
	const fsAdapter = new FsAdapter({
		virBasePath: "/",
		fsBasePath: path.join(__dirname, "..", "fixtures", "fsInterfáce")
	});
	const fs = fsInterface(fsAdapter);
	const stat = promisify(fs.stat);

	return assertStat(t, stat, "", path.join("/", "foo.txt"));
});

test("fs: stat", (t) => {
	const stat = promisify(fs.stat);
	return assertStat(t, stat, path.join(__dirname, "..", "fixtures", "fsInterfáce"), path.join("/", "foo.txt"));
});

test("MemAdapter: mkdir", async (t) => {
	const memAdapter = new MemAdapter({
		virBasePath: "/"
	});
	const fs = fsInterface(memAdapter);
	const mkdir = promisify(fs.mkdir);

	await t.notThrowsAsync(mkdir("pony"), "mkdir executes successfully");
});
