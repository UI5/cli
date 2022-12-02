import path from "node:path";
import {promisify} from "node:util";
import {access as fsAccess, constants as fsConstants, mkdir} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import test from "ava";
import rimraf from "rimraf";
const rimrafp = promisify(rimraf);
import chai from "chai";
import chaifs from "chai-fs";
chai.use(chaifs);
const assert = chai.assert;
import sinon from "sinon";

import {createAdapter} from "../../../lib/resourceFactory.js";

test.beforeEach(async (t) => {
	const tmpDirName = t.title.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase(); // Generate tmp dir name from test name

	// Create a tmp directory for every test
	t.context.tmpDirPath = fileURLToPath(new URL("../../tmp/adapters/FileSystemWrite/" + tmpDirName, import.meta.url));
	await mkdir(t.context.tmpDirPath, {recursive: true});

	t.context.readerWriters = {
		source: createAdapter({
			fsBasePath: "./test/fixtures/application.a/webapp",
			virBasePath: "/app/"
		}),
		dest: createAdapter({
			fsBasePath: "./test/tmp/adapters/FileSystemWrite/" + tmpDirName,
			virBasePath: "/app/"
		})
	};
});

test.afterEach.always((t) => {
	// Cleanup tmp directory
	return rimrafp(t.context.tmpDirPath);
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

	await t.notThrowsAsync(fsAccess(destFsPath, fsConstants.R_OK), "File can be read");
	await t.throwsAsync(fsAccess(destFsPath, fsConstants.W_OK),
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

	// Should not fail as resource hasn't been modified
	await t.notThrowsAsync(resource.getBuffer());
});

test("Write modified resource in drain mode", async (t) => {
	const readerWriters = t.context.readerWriters;
	const destFsPath = path.join(t.context.tmpDirPath, "index.html");

	// Get resource from one readerWriter
	const resource = await readerWriters.source.byPath("/app/index.html");

	resource.setString(`<!DOCTYPE html>
<html>
<head>
	<title>Application A</title>
</head>
<body>

</body>
</html>`
	);

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

test("Migration of resource is executed", async (t) => {
	const readerWriters = t.context.readerWriters;
	const migrateResourceWriterSpy = sinon.spy(readerWriters.dest, "_migrateResource");
	const destFsPath = path.join(t.context.tmpDirPath, "index.html");

	// Get resource from one readerWriter
	const resource = await readerWriters.source.byPath("/app/index.html");

	// Write resource content to another readerWriter
	await readerWriters.dest.write(resource);

	t.is(migrateResourceWriterSpy.callCount, 1);
	t.notThrows(() => {
		assert.fileEqual(destFsPath, "./test/fixtures/application.a/webapp/index.html");
	});
	await t.notThrowsAsync(resource.getBuffer(), "Resource content can still be accessed");
});
