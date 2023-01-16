import test from "ava";
import {fileURLToPath} from "node:url";
import {Buffer} from "node:buffer";
import {readFile} from "node:fs/promises";

import FileSystem from "../../../lib/adapters/FileSystem.js";
import Resource from "../../../lib/Resource.js";
import path from "node:path";

test.serial("x", async (t) => {
	const fsBasePath = fileURLToPath(new URL("../../tmp/adapters/FileSystemWriteLargeFile/", import.meta.url));

	const fileSystem = new FileSystem({
		fsBasePath,
		virBasePath: "/"
	});

	// const largeBuffer = Buffer.alloc(1048576); // 1MB
	const largeBuffer = Buffer.alloc(1);

	await fileSystem.write(new Resource({
		path: "/large-file.txt",
		buffer: largeBuffer
	}));

	t.deepEqual(await readFile(path.join(fsBasePath, "large-file.txt")), largeBuffer,
		"Large file should be written as expected");

	const largeResource = await fileSystem.byPath("/large-file.txt");

	largeResource.setStream(largeResource.getStream());

	await fileSystem.write(largeResource);

	t.deepEqual(await readFile(path.join(fsBasePath, "large-file.txt")), largeBuffer,
		"Large file should be overwritten with exact same contents");
});
