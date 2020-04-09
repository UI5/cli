const path = require("path");
const {promisify} = require("util");
const fs = require("fs");
const fsAccess = promisify(fs.access);
const test = require("ava");
const rimraf = promisify(require("rimraf"));
const chai = require("chai");
chai.use(require("chai-fs"));
const assert = chai.assert;

const ui5Fs = require("../../../");

test.beforeEach((t) => {
	const tmpDirName = t.title.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase(); // Generate tmp dir name from test name

	// Create a tmp directory for every test
	t.context.tmpDirPath = path.join(__dirname, "..", "..", "tmp", "adapters", "FileSystemWrite", tmpDirName);

	t.context.readerWriters = {
		source: ui5Fs.resourceFactory.createAdapter({
			fsBasePath: "./test/fixtures/application.a/webapp",
			virBasePath: "/app/"
		}),
		dest: ui5Fs.resourceFactory.createAdapter({
			fsBasePath: "./test/tmp/adapters/FileSystemWrite/" + tmpDirName,
			virBasePath: "/app/"
		})
	};
});

test.afterEach.always((t) => {
	// Cleanup tmp directory
	return rimraf(t.context.tmpDirPath);
});


test("Write resource", async (t) => {
	const readerWriters = t.context.readerWriters;
	const destFsPath = path.join(t.context.tmpDirPath, "index.html");

	// Get resource from one readerWriter
	const resource = await readerWriters.source.byPath("/app/index.html");
	// Write resource content to another readerWriter

	await readerWriters.dest.write(resource);
	t.notThrows(() => {
		assert.fileEqual(destFsPath, "./test/fixtures/application.a/webapp/index.html");
	});
	await t.notThrowsAsync(resource.getBuffer(), "Resource content can still be accessed");
});

test("Write resource in readOnly mode", async (t) => {
	const readerWriters = t.context.readerWriters;
	const destFsPath = path.join(t.context.tmpDirPath, "index.html");

	// Get resource from one readerWriter
	const resource = await readerWriters.source.byPath("/app/index.html");
	// Write resource content to another readerWriter
	await readerWriters.dest.write(resource, {readOnly: true});

	await t.notThrowsAsync(fsAccess(destFsPath, fs.constants.R_OK), "File can be read");
	await t.throwsAsync(fsAccess(destFsPath, fs.constants.W_OK),
		{message: /EACCES: permission denied|EPERM: operation not permitted/},
		"File can not be written");

	t.notThrows(() => {
		assert.fileEqual(destFsPath, "./test/fixtures/application.a/webapp/index.html");
	});
	await t.notThrowsAsync(resource.getBuffer(), "Resource content can still be accessed");
});

test("Write resource in drain mode", async (t) => {
	const readerWriters = t.context.readerWriters;
	const destFsPath = path.join(t.context.tmpDirPath, "index.html");

	// Get resource from one readerWriter
	const resource = await readerWriters.source.byPath("/app/index.html");
	// Write resource content to another readerWriter
	await readerWriters.dest.write(resource, {drain: true});

	t.notThrows(() => {
		assert.fileEqual(destFsPath, "./test/fixtures/application.a/webapp/index.html");
	});
	await t.throwsAsync(resource.getBuffer(),
		{message: /Content of Resource \/app\/index.html has been drained/});
});

test("Writing with readOnly and drain options set should fail", async (t) => {
	const readerWriters = t.context.readerWriters;

	// Get resource from one readerWriter
	const resource = await readerWriters.source.byPath("/app/index.html");
	// Write resource content to another readerWriter
	await t.throwsAsync(readerWriters.dest.write(resource, {readOnly: true, drain: true}), {
		message: "Error while writing resource /app/index.html: " +
			"Do not use options 'drain' and 'readOnly' at the same time."
	});
});
