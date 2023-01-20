import test from "ava";
import {fileURLToPath} from "node:url";
import {Buffer} from "node:buffer";
import {readFile} from "node:fs/promises";

import FileSystem from "../../../lib/adapters/FileSystem.js";
import Resource from "../../../lib/Resource.js";
import path from "node:path";

test.serial("Stream a large file from source to target", async (t) => {
	// This test used to fail. The FileSystem adapter would directly pipe the read-stream into a write stream with the
	// same path. Leading to only the first chunk of the source file or nothing at all being written into the target
	// This has been fixed with https://github.com/SAP/ui5-fs/pull/472

	const fsBasePath = fileURLToPath(new URL("../../tmp/adapters/FileSystemWriteLargeFile/", import.meta.url));

	const fileSystem = new FileSystem({
		fsBasePath,
		virBasePath: "/"
	});

	const largeBuffer = Buffer.alloc(1048576); // 1MB

	await fileSystem.write(new Resource({
		path: "/large-file.txt",
		buffer: largeBuffer
	}));

	t.deepEqual(await readFile(path.join(fsBasePath, "large-file.txt")), largeBuffer,
		"Large file should be written as expected");

	const largeResource = await fileSystem.byPath("/large-file.txt");

	largeResource.setStream(largeResource.getStream());

	await fileSystem.write(largeResource);

	t.deepEqual((await readFile(path.join(fsBasePath, "large-file.txt"))).length, largeBuffer.length,
		"Large file should be overwritten with exact same contents");
});
