import path from "node:path";
import {readFile} from "node:fs/promises";
import {access as fsAccess, constants as fsConstants, mkdir} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import test from "ava";
import {rimraf} from "rimraf";
import sinon from "sinon";

import {createAdapter, createResource} from "../../../lib/resourceFactory.js";

function getFileContent(path) {
	return readFile(path, "utf8");
}

async function fileEqual(t, actual, expected) {
	const actualContent = await getFileContent(actual);
	const expectedContent = await getFileContent(expected);
	t.is(actualContent, expectedContent);
}

async function fileContent(t, path, expected) {
	const actualContent = await getFileContent(path);
	t.is(actualContent, expected);
}

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
	return rimraf(t.context.tmpDirPath);
});

test("Write resource", async (t) => {
	const readerWriters = t.context.readerWriters;
	const destFsPath = path.join(t.context.tmpDirPath, "index.html");

	// Get resource from one readerWriter
	const resource = await readerWriters.source.byPath("/app/index.html");
	// Write resource content to another readerWriter

	await readerWriters.dest.write(resource);
	await t.notThrowsAsync(fileEqual(t, destFsPath, "./test/fixtures/application.a/webapp/index.html"));
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

	await t.notThrowsAsync(fileEqual(t, destFsPath, "./test/fixtures/application.a/webapp/index.html"));
	await t.notThrowsAsync(resource.getBuffer(), "Resource content can still be accessed");
});

test("Write resource in drain mode", async (t) => {
	const readerWriters = t.context.readerWriters;
	const destFsPath = path.join(t.context.tmpDirPath, "index.html");

	// Get resource from one readerWriter
	const resource = await readerWriters.source.byPath("/app/index.html");
	// Write resource content to another readerWriter
	await readerWriters.dest.write(resource, {drain: true});

	await t.notThrowsAsync(fileEqual(t, destFsPath, "./test/fixtures/application.a/webapp/index.html"));

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

	await t.notThrowsAsync(fileEqual(t, destFsPath, "./test/fixtures/application.a/webapp/index.html"));
	await t.throwsAsync(resource.getBuffer(),
		{message: /Content of Resource \/app\/index.html has been drained/});
});

test("Write with readOnly and drain options set should fail", async (t) => {
	const readerWriters = t.context.readerWriters;

	// Get resource from one readerWriter
	const resource = await readerWriters.source.byPath("/app/index.html");
	// Write resource content to another readerWriter
	await t.throwsAsync(readerWriters.dest.write(resource, {readOnly: true, drain: true}), {
		message: "Error while writing resource /app/index.html: " +
			"Do not use options 'drain' and 'readOnly' at the same time."
	});
});

test("Write unmodified resource into same file", async (t) => {
	const {source, dest} = t.context.readerWriters;
	const destFsPath = path.join(t.context.tmpDirPath, "index.html");

	// Preparation: Create resource in dest
	const sourceResource = await source.byPath("/app/index.html");
	await dest.write(sourceResource);

	const resource = await dest.byPath("/app/index.html");
	resource.setStream(resource.getStream());
	await dest.write(resource);

	await t.notThrowsAsync(fileEqual(t, destFsPath, "./test/fixtures/application.a/webapp/index.html"));
	await t.notThrowsAsync(resource.getBuffer(), "Resource content can still be accessed");
});

test("Write unmodified resource into same file in drain mode", async (t) => {
	const {source, dest} = t.context.readerWriters;
	const destFsPath = path.join(t.context.tmpDirPath, "index.html");

	// Preparation: Create resource in dest
	const sourceResource = await source.byPath("/app/index.html");
	await dest.write(sourceResource);

	const resource = await dest.byPath("/app/index.html");
	await dest.write(resource, {drain: true});

	await t.notThrowsAsync(fileEqual(t, destFsPath, "./test/fixtures/application.a/webapp/index.html"));
	await t.notThrowsAsync(resource.getBuffer(),
		"Resource content can still be accessed, since stream had to be buffered");
});

test("Write unmodified resource into same file in read-only mode", async (t) => {
	const {source, dest} = t.context.readerWriters;
	const destFsPath = path.join(t.context.tmpDirPath, "index.html");

	// Preparation: Create resource in dest
	const sourceResource = await source.byPath("/app/index.html");
	await dest.write(sourceResource);

	const resource = await dest.byPath("/app/index.html");
	await dest.write(resource, {readOnly: true});

	await t.notThrowsAsync(fileEqual(t, destFsPath, "./test/fixtures/application.a/webapp/index.html"));
	await t.notThrowsAsync(resource.getBuffer(),
		"Resource content can still be accessed, since stream had to be buffered");

	await t.notThrowsAsync(fsAccess(destFsPath, fsConstants.R_OK), "File can be read");
	await t.throwsAsync(fsAccess(destFsPath, fsConstants.W_OK),
		{message: /EACCES: permission denied|EPERM: operation not permitted/},
		"File can not be written");
});

test("Write modified resource into same file", async (t) => {
	const {source, dest} = t.context.readerWriters;
	const destFsPath = path.join(t.context.tmpDirPath, "index.html");

	// Preparation: Create resource in dest
	const sourceResource = await source.byPath("/app/index.html");
	await dest.write(sourceResource);

	const resource = await dest.byPath("/app/index.html");
	// Simulate a modification by setting a stream
	resource.setStream(resource.getStream());
	await dest.write(resource);

	await t.notThrowsAsync(fileEqual(t, destFsPath, "./test/fixtures/application.a/webapp/index.html"));
	await t.notThrowsAsync(resource.getBuffer(), "Resource content can still be accessed");
});

test("Write modified resource into same file in drain mode", async (t) => {
	const {source, dest} = t.context.readerWriters;
	const destFsPath = path.join(t.context.tmpDirPath, "index.html");

	// Preparation: Create resource in dest
	const sourceResource = await source.byPath("/app/index.html");
	await dest.write(sourceResource);

	const resource = await dest.byPath("/app/index.html");
	// Simulate a modification by setting a stream
	resource.setStream(resource.getStream());
	await dest.write(resource, {drain: true});

	await t.notThrowsAsync(fileEqual(t, destFsPath, "./test/fixtures/application.a/webapp/index.html"));
	await t.throwsAsync(resource.getBuffer(),
		{message: /Content of Resource \/app\/index.html has been drained/});
});

test("Write modified resource into same file in read-only mode", async (t) => {
	const {source, dest} = t.context.readerWriters;
	const destFsPath = path.join(t.context.tmpDirPath, "index.html");

	// Preparation: Create resource in dest
	const sourceResource = await source.byPath("/app/index.html");
	await dest.write(sourceResource);

	const resource = await dest.byPath("/app/index.html");
	// Simulate a modification by setting a stream
	resource.setStream(resource.getStream());
	await dest.write(resource, {readOnly: true});

	await t.notThrowsAsync(fileEqual(t, destFsPath, "./test/fixtures/application.a/webapp/index.html"));
	await t.notThrowsAsync(resource.getBuffer(),
		"Resource content can still be accessed");

	await t.notThrowsAsync(fsAccess(destFsPath, fsConstants.R_OK), "File can be read");
	await t.throwsAsync(fsAccess(destFsPath, fsConstants.W_OK),
		{message: /EACCES: permission denied|EPERM: operation not permitted/},
		"File can not be written");
});

test("Write new resource", async (t) => {
	const readerWriters = t.context.readerWriters;
	const destFsPath = path.join(t.context.tmpDirPath, "index.html");

	const resource = createResource({
		path: "/app/index.html",
		string: "Resource content",
	});

	await readerWriters.dest.write(resource);
	await t.notThrowsAsync(fileContent(t, destFsPath, "Resource content"));
	await t.notThrowsAsync(resource.getBuffer(), "Resource content can still be accessed");
});

test("Write new resource in drain mode", async (t) => {
	const readerWriters = t.context.readerWriters;
	const destFsPath = path.join(t.context.tmpDirPath, "index.html");

	const resource = createResource({
		path: "/app/index.html",
		string: "Resource content",
	});

	await readerWriters.dest.write(resource, {drain: true});
	await t.notThrowsAsync(fileContent(t, destFsPath, "Resource content"));
	await t.throwsAsync(resource.getBuffer(),
		{message: /Content of Resource \/app\/index.html has been drained/});
});

test("Write new resource in read-only mode", async (t) => {
	const readerWriters = t.context.readerWriters;
	const destFsPath = path.join(t.context.tmpDirPath, "index.html");

	const resource = createResource({
		path: "/app/index.html",
		string: "Resource content",
	});

	await readerWriters.dest.write(resource, {readOnly: true});
	await t.notThrowsAsync(fileContent(t, destFsPath, "Resource content"));
	await t.notThrowsAsync(resource.getBuffer(),
		"Resource content can still be accessed");
	await t.notThrowsAsync(fsAccess(destFsPath, fsConstants.R_OK), "File can be read");
	await t.throwsAsync(fsAccess(destFsPath, fsConstants.W_OK),
		{message: /EACCES: permission denied|EPERM: operation not permitted/},
		"File can not be written");
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
	await t.notThrowsAsync(fileEqual(t, destFsPath, "./test/fixtures/application.a/webapp/index.html"));
	await t.notThrowsAsync(resource.getBuffer(), "Resource content can still be accessed");
});
