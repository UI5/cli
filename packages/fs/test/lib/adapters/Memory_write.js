import test from "ava";
import {createAdapter, createResource} from "../../../lib/resourceFactory.js";
import sinon from "sinon";

test("glob resources from application.a w/ virtual base path prefix", async (t) => {
	const dest = createAdapter({
		virBasePath: "/app/"
	});

	const res = createResource({
		path: "/app/index.html"
	});
	await dest.write(res);
	const resources = await dest.byGlob("/app/*.html");
	t.is(resources.length, 1, "Found exactly one resource");
	t.not(resources[0], res, "Not the same resource instance");
});

test("glob resources from application.a w/o virtual base path prefix", async (t) => {
	const dest = createAdapter({
		virBasePath: "/app/"
	});

	const res = createResource({
		path: "/app/index.html"
	});
	await dest.write(res);
	const resources = await dest.byGlob("/**/*.html");
	t.is(resources.length, 1, "Found exactly one resource");
});

test("Write resource w/ virtual base path", async (t) => {
	const readerWriter = createAdapter({
		virBasePath: "/app/"
	});

	const res = createResource({
		path: "/app/test.html"
	});
	await readerWriter.write(res);

	t.deepEqual(readerWriter._virFiles, {
		"test.html": res
	}, "Adapter added resource with correct path");

	t.deepEqual(Object.keys(readerWriter._virDirs), [], "Adapter added correct virtual directories");
	t.not(readerWriter._virFiles["test.html"], res, "Not the same resource instance");
});

test("Write resource w/o virtual base path", async (t) => {
	const readerWriter = createAdapter({
		virBasePath: "/"
	});

	const res = createResource({
		path: "/one/two/three/test.html"
	});
	await readerWriter.write(res);

	t.deepEqual(readerWriter._virFiles, {
		"one/two/three/test.html": res
	}, "Adapter added resource with correct path");

	t.deepEqual(Object.keys(readerWriter._virDirs), [
		"one/two/three",
		"one/two",
		"one"
	], "Adapter added correct virtual directories");

	const dirRes = readerWriter._virDirs["one/two/three"];
	t.is(dirRes.getStatInfo().isDirectory(), true, "Directory resource is a directory");
	t.is(dirRes.getPath(), "/one/two/three", "Directory resource has correct path");
});

test("Write resource w/ deep virtual base path", async (t) => {
	const readerWriter = createAdapter({
		virBasePath: "/app/a/"
	});

	const res = createResource({
		path: "/app/a/one/two/three/test.html"
	});
	await readerWriter.write(res);

	t.deepEqual(readerWriter._virFiles, {
		"one/two/three/test.html": res
	}, "Adapter added resource with correct path");

	t.deepEqual(Object.keys(readerWriter._virDirs), [
		"one/two/three",
		"one/two",
		"one"
	], "Adapter added correct virtual directories");

	const dirRes = readerWriter._virDirs["one/two/three"];
	t.is(dirRes.getStatInfo().isDirectory(), true, "Directory resource is a directory");
	t.is(dirRes.getPath(), "/app/a/one/two/three", "Directory resource has correct path");
});

test("Write resource w/ crazy virtual base path", async (t) => {
	const readerWriter = createAdapter({
		virBasePath: "/app/🐛/"
	});

	const res = createResource({
		path: "/app/🐛/one\\/2/3️⃣/test"
	});
	await readerWriter.write(res);

	t.deepEqual(readerWriter._virFiles, {
		"one\\/2/3️⃣/test": res
	}, "Adapter added resource with correct path");

	t.deepEqual(Object.keys(readerWriter._virDirs), [
		"one\\/2/3️⃣",
		"one\\/2",
		"one\\"
	], "Adapter added correct virtual directories");
});

test("Migration of resource is executed", async (t) => {
	const writer = createAdapter({
		virBasePath: "/"
	});

	const resource = createResource({
		path: "/test.js"
	});

	const migrateResourceWriterSpy = sinon.spy(writer, "_migrateResource");
	await writer.write(resource);
	t.is(migrateResourceWriterSpy.callCount, 1);
});

test("Resource: Change instance after write", async (t) => {
	const writer = createAdapter({
		virBasePath: "/"
	});

	const resource = createResource({
		path: "/test.js",
		string: "MyInitialContent"
	});

	await writer.write(resource);

	resource.setString("MyNewContent");

	const resource1 = await writer.byPath("/test.js");

	t.is(await resource.getString(), "MyNewContent");
	t.is(await resource1.getString(), "MyInitialContent");

	await writer.write(resource);

	const resource2 = await writer.byPath("/test.js");
	t.is(await resource.getString(), "MyNewContent");
	t.is(await resource1.getString(), "MyInitialContent");
	t.is(await resource2.getString(), "MyNewContent");
});
