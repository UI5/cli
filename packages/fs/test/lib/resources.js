import test from "ava";
import sinon from "sinon";
import {readFile} from "node:fs/promises";

import {createAdapter, createFilterReader,
	createFlatReader, createLinkReader, createResource} from "../../lib/resourceFactory.js";

test.afterEach.always((t) => {
	sinon.restore();
});

function getFileContent(path) {
	return readFile(path, "utf8");
}

async function fileEqual(t, actual, expected) {
	const actualContent = await getFileContent(actual);
	const expectedContent = await getFileContent(expected);
	t.is(actualContent, expectedContent);
}

["FileSystem", "Memory"].forEach((adapter) => {
	async function getAdapter(config) {
		if (adapter === "Memory") {
			const fsAdapter = createAdapter(config);
			const fsResources = await fsAdapter.byGlob("**/*");
			// By removing the fsBasePath a MemAdapter will be created
			delete config.fsBasePath;
			const memAdapter = createAdapter(config);
			for (const resource of fsResources) {
				await memAdapter.write(resource);
			}
			return memAdapter;
		} else if (adapter === "FileSystem") {
			return createAdapter(config);
		}
	}

	/* BEWARE:
		Always make sure that every test writes to a separate file! By default, tests are running concurrent.
	*/
	test(adapter +
		": Get resource from application.a (/index.html) and write it to /dest/ using a ReadableStream", async (t) => {
		const source = await getAdapter({
			fsBasePath: "./test/fixtures/application.a/webapp",
			virBasePath: "/app/"
		});
		const dest = await getAdapter({
			fsBasePath: "./test/tmp/readerWriters/application.a/simple-read-write",
			virBasePath: "/dest/"
		});

		// Get resource from one readerWriter
		const resource = await source.byPath("/app/index.html");

		// Write resource content to another readerWriter
		resource.setPath("/dest/index_readableStreamTest.html");
		await dest.write(resource);

		t.notThrows(async () => {
			if (adapter === "FileSystem") {
				await fileEqual(
					t,
					"./test/tmp/readerWriters/application.a/simple-read-write/index_readableStreamTest.html",
					"./test/fixtures/application.a/webapp/index.html");
			} else {
				const destResource = await dest.byPath("/dest/index_readableStreamTest.html");
				t.deepEqual(await destResource.getString(), await resource.getString());
			}
		});
	});

	test(adapter + ": Create resource, write and change content", async (t) => {
		const dest = await getAdapter({
			fsBasePath: "./test/tmp/writer/",
			virBasePath: "/dest/writer/"
		});

		const resource = createResource({
			path: "/dest/writer/content/test.js",
			string: "MyInitialContent"
		});

		await dest.write(resource);

		resource.setString("MyNewContent");

		const resource1 = await dest.byPath("/dest/writer/content/test.js");

		t.is(await resource.getString(), "MyNewContent");
		t.is(await resource1.getString(), "MyInitialContent");

		t.is(await resource.getString(), "MyNewContent");
		t.is(await resource1.getString(), "MyInitialContent");

		await dest.write(resource);

		const resource2 = await dest.byPath("/dest/writer/content/test.js");
		t.is(await resource.getString(), "MyNewContent");
		t.is(await resource2.getString(), "MyNewContent");
	});

	test(adapter + ": Create resource, write and change path", async (t) => {
		const dest = await getAdapter({
			fsBasePath: "./test/tmp/writer/",
			virBasePath: "/dest/writer/"
		});

		const resource = createResource({
			path: "/dest/writer/path/test.js",
			string: "MyInitialContent"
		});

		await dest.write(resource);

		resource.setPath("/dest/writer/path/test2.js");

		const resourceOldPath = await dest.byPath("/dest/writer/path/test.js");
		const resourceNewPath = await dest.byPath("/dest/writer/path/test2.js");

		t.is(await resource.getPath(), "/dest/writer/path/test2.js");
		t.truthy(resourceOldPath);
		t.is(await resourceOldPath.getString(), await resource.getString());
		t.is(await resourceOldPath.getPath(), "/dest/writer/path/test.js");
		t.not(resourceNewPath);

		await dest.write(resource);

		const resourceOldPath1 = await dest.byPath("/dest/writer/path/test.js");
		const resourceNewPath1 = await dest.byPath("/dest/writer/path/test2.js");

		t.is(await resource.getPath(), "/dest/writer/path/test2.js");
		t.truthy(resourceNewPath1);
		t.is(await resourceNewPath1.getString(), await resource.getString());
		t.is(await resourceNewPath1.getPath(), "/dest/writer/path/test2.js");
		t.not(resourceOldPath1);
	});

	test(adapter +
		": Create a resource with a path different from the path configured in the adapter", async (t) => {
		t.pass(2);
		const dest = await getAdapter({
			fsBasePath: "./test/tmp/writer/",
			virBasePath: "/dest2/writer/"
		});

		const resource = createResource({
			path: "/dest2/tmp/test.js",
			string: "MyContent"
		});

		const error = await t.throwsAsync(dest.write(resource));
		t.is(error.message,
			"Failed to write resource with virtual path '/dest2/tmp/test.js': Path must start with the " +
			"configured virtual base path of the adapter. Base path: '/dest2/writer/'",
			"Threw with expected error message");
	});

	test(adapter +
		": Create a resource with a path above the path configured in the adapter", async (t) => {
		t.pass(2);
		const dest = await getAdapter({
			fsBasePath: "./test/tmp/writer/",
			virBasePath: "/dest2/writer/"
		});

		const resource = createResource({
			path: "/dest2/test.js",
			string: "MyContent"
		});

		const error = await t.throwsAsync(dest.write(resource));
		t.is(error.message,
			"Failed to write resource with virtual path '/dest2/test.js': Path must start with the " +
			"configured virtual base path of the adapter. Base path: '/dest2/writer/'",
			"Threw with expected error message");
	});

	test(adapter +
		": Create a resource with a path resolving outside the path configured in the adapter", async (t) => {
		t.pass(2);
		const dest = await getAdapter({
			fsBasePath: "./test/tmp/writer/",
			virBasePath: "/dest/writer/"
		});

		const resource = createResource({
			path: "/dest/writer/../relative.js",
			string: "MyContent"
		});
		// Resource will already resolve relative path segments
		t.is(resource.getPath(), "/dest/relative.js", "Resource path resolved");

		// This would cause the base path to not match
		// So we cheat, simulating a misbehaving or old Resource instance, using a relative path segment
		sinon.stub(resource, "getPath").returns("/dest/writer/../relative.js");

		await t.throwsAsync(dest.write(resource), {
			message:
				"Failed to write resource with virtual path '/dest/writer/../relative.js': " +
				"Path must start with the configured virtual base path of the adapter. Base path: '/dest/writer/'"
		}, "Threw with expected error message");
	});

	test(adapter + ": Filter resources", async (t) => {
		const source = createAdapter({
			fsBasePath: "./test/fixtures/application.a/webapp",
			virBasePath: "/app/"
		});
		const filteredSource = createFilterReader({
			reader: source,
			callback: (resource) => {
				return resource.getPath().endsWith(".js");
			}
		});
		const sourceResources = await source.byGlob("**");
		t.is(sourceResources.length, 2, "Found two resources in source");

		const resources = await filteredSource.byGlob("**");

		t.is(resources.length, 1, "Found exactly one resource via filter");
		t.is(resources[0].getPath(), "/app/test.js", "Found correct resource");
	});

	test(adapter + ": Flatten resources", async (t) => {
		const source = await getAdapter({
			fsBasePath: "./test/fixtures/application.a/webapp",
			virBasePath: "/resources/app/"
		});
		const transformedSource = createFlatReader({
			reader: source,
			namespace: "app"
		});

		const resources = await transformedSource.byGlob("**/*.js");
		t.is(resources.length, 1, "Found one resource via transformer");
		t.is(resources[0].getPath(), "/test.js", "Found correct resource");
	});

	test(adapter + ": Link resources", async (t) => {
		const source = await getAdapter({
			fsBasePath: "./test/fixtures/application.a/webapp",
			virBasePath: "/resources/app/"
		});
		const transformedSource = createLinkReader({
			reader: source,
			pathMapping: {
				linkPath: "/wow/this/is/a/beautiful/path/just/wow/",
				targetPath: "/resources/"
			}
		});

		const resources = await transformedSource.byGlob("**/*.js");
		t.is(resources.length, 1, "Found one resource via transformer");
		t.is(resources[0].getPath(), "/wow/this/is/a/beautiful/path/just/wow/app/test.js", "Found correct resource");
	});
});
