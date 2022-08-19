const test = require("ava");
const {resourceFactory} = require("../../../");

test("glob resources from application.a w/ virtual base path prefix", async (t) => {
	const dest = resourceFactory.createAdapter({
		virBasePath: "/app/"
	});

	const res = resourceFactory.createResource({
		path: "/app/index.html"
	});
	await dest.write(res)
		.then(() => dest.byGlob("/app/*.html"))
		.then((resources) => {
			t.is(resources.length, 1, "Found exactly one resource");
		});
});

test("glob resources from application.a w/o virtual base path prefix", async (t) => {
	const dest = resourceFactory.createAdapter({
		virBasePath: "/app/"
	});

	const res = resourceFactory.createResource({
		path: "/app/index.html"
	});
	await dest.write(res)
		.then(() => dest.byGlob("/**/*.html"))
		.then((resources) => {
			t.is(resources.length, 1, "Found exactly one resource");
		});
});

test("Write resource w/ virtual base path", async (t) => {
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/app/"
	});

	const res = resourceFactory.createResource({
		path: "/app/test.html"
	});
	await readerWriter.write(res);

	t.deepEqual(readerWriter._virFiles, {
		"test.html": res
	}, "Adapter added resource with correct path");

	t.deepEqual(Object.keys(readerWriter._virDirs), [], "Adapter added correct virtual directories");
});

test("Write resource w/o virtual base path", async (t) => {
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/"
	});

	const res = resourceFactory.createResource({
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
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/app/a/"
	});

	const res = resourceFactory.createResource({
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
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/app/🐛/"
	});

	const res = resourceFactory.createResource({
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
