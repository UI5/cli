import test from "ava";
import sinon from "sinon";
import {Stream, Transform} from "node:stream";
import {statSync, createReadStream} from "node:fs";
import {stat, readFile} from "node:fs/promises";
import path from "node:path";
import Resource from "../../lib/Resource.js";

function createBasicResource() {
	const fsPath = path.join("test", "fixtures", "application.a", "webapp", "index.html");
	const statInfo = statSync(fsPath);
	const resource = new Resource({
		path: "/app/index.html",
		createStream: function() {
			return createReadStream(fsPath);
		},
		project: {},
		statInfo: statInfo,
		fsPath
	});
	return resource;
}

/**
 * Reads a readable stream and resolves with its content
 *
 * @param {stream.Readable} readableStream readable stream
 * @returns {Promise<string>} resolves with the read string
 */
const readStream = (readableStream) => {
	return new Promise((resolve, reject) => {
		let streamedResult = "";
		readableStream.on("data", (chunk) => {
			streamedResult += chunk;
		});
		readableStream.on("end", () => {
			resolve(streamedResult);
		});
		readableStream.on("error", (err) => {
			reject(err);
		});
	});
};

test.afterEach.always((t) => {
	sinon.restore();
});

test("Resource: constructor with missing path parameter", (t) => {
	t.throws(() => {
		new Resource({});
	}, {
		instanceOf: Error,
		message: "Unable to create Resource: Missing parameter 'path'"
	});
});

test("Resource: constructor with duplicated content parameter", (t) => {
	const fsPath = path.join("test", "fixtures", "application.a", "webapp", "index.html");
	[{
		path: "/my/path",
		buffer: Buffer.from("Content"),
		string: "Content",
	}, {
		path: "/my/path",
		buffer: Buffer.from("Content"),
		stream: createReadStream(fsPath),
	}, {
		path: "/my/path",
		buffer: Buffer.from("Content"),
		createStream: () => {
			return createReadStream(fsPath);
		},
	}, {
		path: "/my/path",
		string: "Content",
		stream: createReadStream(fsPath),
	}, {
		path: "/my/path",
		string: "Content",
		createStream: () => {
			return createReadStream(fsPath);
		},
	}, {
		path: "/my/path",
		stream: createReadStream(fsPath),
		createStream: () => {
			return createReadStream(fsPath);
		},
	}].forEach((resourceParams) => {
		t.throws(() => {
			new Resource(resourceParams);
		}, {
			instanceOf: Error,
			message: "Unable to create Resource: Multiple content parameters provided. " +
				"Please provide only one of the following parameters: 'buffer', 'string', 'stream' or 'createStream'"
		}, "Threw with expected error message");
	});
});

test("Resource: constructor with createBuffer factory must provide createStream", (t) => {
	t.throws(() => {
		new Resource({
			path: "/my/path",
			createBuffer: () => Buffer.from("Content"),
		});
	}, {
		instanceOf: Error,
		message: "Unable to create Resource: Parameter 'createStream' must be provided when " +
				"parameter 'createBuffer' is used"
	});
});

test("Resource: constructor with invalid createBuffer parameter", (t) => {
	t.throws(() => {
		new Resource({
			path: "/my/path",
			createBuffer: "not a function",
			createStream: () => {
				return new Stream.Readable();
			}
		});
	}, {
		instanceOf: Error,
		message: "Unable to create Resource: Parameter 'createBuffer' must be a function"
	});
});

test("Resource: constructor with invalid content parameters", (t) => {
	t.throws(() => {
		new Resource({
			path: "/my/path",
			createStream: "not a function"
		});
	}, {
		instanceOf: Error,
		message: "Unable to create Resource: Parameter 'createStream' must be a function"
	});

	t.throws(() => {
		new Resource({
			path: "/my/path",
			stream: "not a stream"
		});
	}, {
		instanceOf: Error,
		message: "Unable to create Resource: Parameter 'stream' must be a readable stream"
	});

	t.throws(() => {
		new Resource({
			path: "/my/path",
			buffer: "not a buffer"
		});
	}, {
		instanceOf: Error,
		message: "Unable to create Resource: Parameter 'buffer' must be of type Buffer"
	});

	t.throws(() => {
		new Resource({
			path: "/my/path",
			string: 123
		});
	}, {
		instanceOf: Error,
		message: "Unable to create Resource: Parameter 'string' must be of type string"
	});

	t.throws(() => {
		new Resource({
			path: "/my/path",
			buffer: Buffer.from("Content"),
			byteSize: -1
		});
	}, {
		instanceOf: Error,
		message: "Unable to create Resource: Parameter 'byteSize' must be a positive number"
	});

	t.throws(() => {
		new Resource({
			path: "/my/path",
			buffer: Buffer.from("Content"),
			byteSize: "not a number"
		});
	}, {
		instanceOf: Error,
		message: "Unable to create Resource: Parameter 'byteSize' must be a positive number"
	});

	t.throws(() => {
		new Resource({
			path: "/my/path",
			buffer: Buffer.from("Content"),
			lastModified: -1
		});
	}, {
		instanceOf: Error,
		message: "Unable to create Resource: Parameter 'lastModified' must be a positive number"
	});

	t.throws(() => {
		new Resource({
			path: "/my/path",
			buffer: Buffer.from("Content"),
			lastModified: "not a number"
		});
	}, {
		instanceOf: Error,
		message: "Unable to create Resource: Parameter 'lastModified' must be a positive number"
	});

	const invalidStatInfo = {
		isDirectory: () => false,
		isFile: () => false,
		size: 100,
		mtimeMs: Date.now()
	};
	t.throws(() => {
		new Resource({
			path: "/my/path",
			statInfo: invalidStatInfo
		});
	}, {
		instanceOf: Error,
		message: "Unable to create Resource: statInfo must represent either a file or a directory"
	});

	t.throws(() => {
		new Resource({
			path: "/my/path",
			sourceMetadata: "invalid value"
		});
	}, {
		instanceOf: Error,
		message: `Unable to create Resource: Parameter 'sourceMetadata' must be of type "object"`
	});
});

test("Resource: From buffer", async (t) => {
	const resource = new Resource({
		path: "/my/path",
		buffer: Buffer.from("Content")
	});
	t.is(await resource.getSize(), 7, "Content is set");
	t.false(resource.isModified(), "Content of new resource is not modified");
	t.false(resource.getSourceMetadata().contentModified, "Content of new resource is not modified");
});

test("Resource: From string", async (t) => {
	const resource = new Resource({
		path: "/my/path",
		string: "Content"
	});
	t.is(await resource.getSize(), 7, "Content is set");
	t.false(resource.isModified(), "Content of new resource is not modified");
	t.false(resource.getSourceMetadata().contentModified, "Content of new resource is not modified");
});

test("Resource: From stream", async (t) => {
	const fsPath = path.join("test", "fixtures", "application.a", "webapp", "index.html");
	const resource = new Resource({
		path: "/my/path",
		stream: createReadStream(fsPath)
	});
	t.is(await resource.getSize(), 91, "Content is set");
	t.false(resource.isModified(), "Content of new resource is not modified");
	t.false(resource.getSourceMetadata().contentModified, "Content of new resource is not modified");
});

test("Resource: From createStream", async (t) => {
	const fsPath = path.join("test", "fixtures", "application.a", "webapp", "index.html");
	const resource = new Resource({
		path: "/my/path",
		byteSize: 91,
		createStream: () => {
			return createReadStream(fsPath);
		}
	});
	t.is(await resource.getSize(), 91, "Content is set");
	t.false(resource.isModified(), "Content of new resource is not modified");
	t.false(resource.getSourceMetadata().contentModified, "Content of new resource is not modified");
});

test("Resource: From createBuffer", async (t) => {
	const fsPath = path.join("test", "fixtures", "application.a", "webapp", "index.html");
	const resource = new Resource({
		path: "/my/path",
		byteSize: 91,
		createBuffer: async () => {
			return Buffer.from(await readFile(fsPath));
		},
		createStream: () => {
			return createReadStream(fsPath);
		}
	});
	t.is(await resource.getSize(), 91, "Content is set");
	t.false(resource.isModified(), "Content of new resource is not modified");
	t.false(resource.getSourceMetadata().contentModified, "Content of new resource is not modified");
});

test("Resource: Source metadata", async (t) => {
	const resource = new Resource({
		path: "/my/path",
		string: "Content",
		sourceMetadata: {
			adapter: "My Adapter",
			fsPath: "/some/path"
		}
	});
	t.is(await resource.getSize(), 7, "Content is set");
	t.false(resource.isModified(), "Content of new resource is not modified");
	t.false(resource.getSourceMetadata().contentModified, "Content of new resource is not modified");
	t.is(resource.getSourceMetadata().adapter, "My Adapter", "Correct source metadata 'adapter' value");
	t.is(resource.getSourceMetadata().fsPath, "/some/path", "Correct source metadata 'fsPath' value");
});

test("Resource: Source metadata with modified content", async (t) => {
	const resource = new Resource({
		path: "/my/path",
		string: "Content",
		sourceMetadata: {
			adapter: "My Adapter",
			fsPath: "/some/path",
			contentModified: true
		}
	});
	t.is(await resource.getSize(), 7, "Content is set");
	t.false(resource.isModified(), "Content of new resource is not modified");
	t.true(resource.getSourceMetadata().contentModified, "Content of new resource is already modified");
	t.is(resource.getSourceMetadata().adapter, "My Adapter", "Correct source metadata 'adapter' value");
	t.is(resource.getSourceMetadata().fsPath, "/some/path", "Correct source metadata 'fsPath' value");
});

test("Resource: Illegal source metadata attribute", (t) => {
	t.throws(() => {
		new Resource({
			path: "/my/path",
			string: "Content",
			sourceMetadata: {
				adapter: "My Adapter",
				fsPath: "/some/path",
				pony: "🦄"
			}
		});
	}, {
		message: `Parameter 'sourceMetadata' contains an illegal attribute: pony`
	}, "Threw with expected error message");
});

test("Resource: Illegal source metadata value", (t) => {
	t.throws(() => {
		new Resource({
			path: "/my/path",
			string: "Content",
			sourceMetadata: {
				adapter: "My Adapter",
				fsPath: {
					some: "value"
				}
			}
		});
	}, {
		message: `Attribute 'fsPath' of parameter 'sourceMetadata' must be of type "string" or "boolean"`
	}, "Threw with expected error message");
});

test("Resource: getBuffer with throwing an error", (t) => {
	t.plan(1);

	const resource = new Resource({
		path: "/my/path/to/resource",
	});

	return resource.getBuffer().catch(function(error) {
		t.is(error.message, "Resource /my/path/to/resource has no content",
			"getBuffer called w/o having a resource content provided");
	});
});

test("Resource: getPath / getName", (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource.js",
		buffer: Buffer.from("Content")
	});
	t.is(resource.getPath(), "/my/path/to/resource.js", "Correct path");
	t.is(resource.getName(), "resource.js", "Correct name");
});

test("Resource: setPath / getName", (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource.js",
		buffer: Buffer.from("Content")
	});
	resource.setPath("/my/other/file.json");
	t.is(resource.getPath(), "/my/other/file.json", "Correct path");
	t.is(resource.getName(), "file.json", "Correct name");
});

test("Resource: setPath with non-absolute path", (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource.js",
		buffer: Buffer.from("Content")
	});
	t.throws(() => {
		resource.setPath("my/other/file.json");
	}, {
		message: "Unable to set resource path: Path must be absolute: my/other/file.json"
	}, "Threw with expected error message");
	t.is(resource.getPath(), "/my/path/to/resource.js", "Path is unchanged");
	t.is(resource.getName(), "resource.js", "Name is unchanged");
});

test("Create Resource with non-absolute path", (t) => {
	t.throws(() => {
		new Resource({
			path: "my/path/to/resource.js",
			buffer: Buffer.from("Content")
		});
	}, {
		message: "Unable to set resource path: Path must be absolute: my/path/to/resource.js"
	}, "Threw with expected error message");
});

test("Resource: getStream", async (t) => {
	t.plan(1);

	const resource = new Resource({
		path: "/my/path/to/resource",
		buffer: Buffer.from("Content")
	});

	const result = await readStream(resource.getStream());
	t.is(result, "Content", "Stream has been read correctly");
});

test("Resource: getStream for empty string", async (t) => {
	t.plan(1);

	const resource = new Resource({
		path: "/my/path/to/resource",
		string: ""
	});

	const result = await readStream(resource.getStream());
	t.is(result, "", "Stream has been read correctly for empty string");
});

test("Resource: getStream for empty string instance", async (t) => {
	t.plan(1);

	const resource = new Resource({
		path: "/my/path/to/resource",
		// eslint-disable-next-line no-new-wrappers
		string: new String("")
	});

	const result = await readStream(resource.getStream());
	t.is(result, "", "Stream has been read correctly for empty string");
});

test("Resource: getStream throwing an error", (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource"
	});

	t.throws(() => {
		resource.getStream();
	}, {
		instanceOf: Error,
		message: "Resource /my/path/to/resource has no content"
	});
});

test("Resource: getStream call while resource is being transformed", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		stream: new Stream.Readable({
			read() {
				this.push("Stream content");
				this.push(null);
			}
		})
	});

	const p1 = resource.getBuffer(); // Trigger async transformation of stream to buffer
	t.throws(() => {
		resource.getStream(); // Synchronous getStream can't wait for transformation to finish
	}, {
		message: /Content of Resource \/my\/path\/to\/resource is currently being transformed. Consider using Resource.getStreamAsync\(\) to wait for the transformation to finish./
	});
	await p1; // Wait for initial transformation to finish

	t.false(resource.isModified(), "Resource has not been modified");

	const value = await resource.getString();
	t.is(value, "Stream content", "Initial content still set");
});

test("Resource: setString", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		sourceMetadata: {} // Needs to be passed in order to get the "modified" state
	});

	t.is(resource.getSourceMetadata().contentModified, false, "sourceMetadata modified flag set correctly");
	t.false(resource.isModified(), "Resource is not modified");
	t.falsy(resource.getLastModified(), "lastModified is not set");

	resource.setString("Content");

	t.is(resource.getSourceMetadata().contentModified, true, "sourceMetadata modified flag updated correctly");
	t.true(resource.isModified(), "Resource is modified");
	t.truthy(resource.getLastModified(), "lastModified should be updated");

	const value = await resource.getString();
	t.is(value, "Content", "String set");
});

test("Resource: setBuffer", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		sourceMetadata: {} // Needs to be passed in order to get the "modified" state
	});

	t.is(resource.getSourceMetadata().contentModified, false, "sourceMetadata modified flag set correctly");
	t.false(resource.isModified(), "Resource is not modified");
	t.falsy(resource.getLastModified(), "lastModified is not set");

	resource.setBuffer(Buffer.from("Content"));

	t.is(resource.getSourceMetadata().contentModified, true, "sourceMetadata modified flag updated correctly");
	t.true(resource.isModified(), "Resource is modified");
	t.truthy(resource.getLastModified(), "lastModified should be updated");

	const value = await resource.getString();
	t.is(value, "Content", "String set");
});

test("Resource: setBuffer call while resource is being transformed", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		stream: new Stream.Readable({
			read() {
				this.push("Stream content");
				this.push(null);
			}
		})
	});

	const p1 = resource.getBuffer(); // Trigger async transformation of stream to buffer
	t.throws(() => {
		resource.setBuffer(Buffer.from("Content")); // Set new buffer while transformation is still ongoing
	}, {
		message: `Unable to set buffer: Content of Resource /my/path/to/resource is currently being transformed`
	});
	await p1; // Wait for initial transformation to finish

	t.false(resource.isModified(), "Resource has not been modified");

	const value = await resource.getString();
	t.is(value, "Stream content", "Initial content still set");
});

test("Resource: size modification", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource"
	});
	t.true(resource.hasSize(), "resource without content has size");
	t.is(await resource.getSize(), 0, "initial size without content");

	// string
	resource.setString("Content");

	t.is(await resource.getSize(), 7, "size after manually setting the string");
	t.is(await new Resource({
		path: "/my/path/to/resource",
		string: "Content"
	}).getSize(), 7, "size when passing string to constructor");

	// buffer
	resource.setBuffer(Buffer.from("Super"));

	t.true(resource.hasSize(), "has size");
	t.is(await resource.getSize(), 5, "size after manually setting the string");

	const clonedResource1 = await resource.clone();
	t.true(clonedResource1.hasSize(), "has size after cloning");
	t.is(await clonedResource1.getSize(), 5, "size after cloning the resource");

	// buffer with alloc
	const buf = Buffer.alloc(1234);
	buf.write("some string", 0, "utf8");
	resource.setBuffer(buf);

	t.is(await resource.getSize(), 1234, "buffer with alloc after setting the buffer");
	t.is(await new Resource({
		path: "/my/path/to/resource",
		buffer: buf
	}).getSize(), 1234, "buffer with alloc when passing buffer to constructor");

	const clonedResource2 = await resource.clone();
	t.true(clonedResource2.hasSize(), "buffer with alloc after clone has size");
	t.is(await clonedResource2.getSize(), 1234, "buffer with alloc after clone");

	// stream
	const streamResource = new Resource({
		path: "/my/path/to/resource",
	});
	const stream = new Stream.Readable();
	stream._read = function() {};
	stream.push("I am a ");
	stream.push("readable ");
	stream.push("stream!");
	stream.push(null);

	streamResource.setStream(stream);
	t.false(streamResource.hasSize(), "size not yet known for streamResource");

	// stream is read and stored in buffer
	// test parallel size retrieval
	await streamResource.getBuffer();
	const [size1, size2] = await Promise.all([streamResource.getSize(), streamResource.getSize()]);
	t.is(size1, 23, "size for streamResource, parallel 1");
	t.is(size2, 23, "size for streamResource, parallel 2");
	t.is(await streamResource.getSize(), 23, "size for streamResource read again");
});

test("Resource: setStream (Stream)", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		sourceMetadata: {} // Needs to be passed in order to get the "modified" state
	});

	t.is(resource.getSourceMetadata().contentModified, false, "sourceMetadata modified flag set correctly");
	t.false(resource.isModified(), "Resource is not modified");
	t.falsy(resource.getLastModified(), "lastModified is not set");

	const stream = new Stream.Readable();
	stream._read = function() {};
	stream.push("I am a ");
	stream.push("readable ");
	stream.push("stream!");
	stream.push(null);

	resource.setStream(stream);

	t.is(resource.getSourceMetadata().contentModified, true, "sourceMetadata modified flag updated correctly");
	t.true(resource.isModified(), "Resource is modified");
	t.truthy(resource.getLastModified(), "lastModified should be updated");

	const value = await resource.getString();
	t.is(value, "I am a readable stream!", "Stream set correctly");
});

test("Resource: setStream (Create stream callback)", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		sourceMetadata: {} // Needs to be passed in order to get the "modified" state
	});

	t.is(resource.getSourceMetadata().contentModified, false, "sourceMetadata modified flag set correctly");
	t.false(resource.isModified(), "Resource is not modified");
	t.falsy(resource.getLastModified(), "lastModified is not set");

	resource.setStream(() => {
		const stream = new Stream.Readable();
		stream._read = function() {};
		stream.push("I am a ");
		stream.push("readable ");
		stream.push("stream!");
		stream.push(null);
		return stream;
	});

	t.is(resource.getSourceMetadata().contentModified, true, "sourceMetadata modified flag updated correctly");
	t.true(resource.isModified(), "Resource is modified");
	t.truthy(resource.getLastModified(), "lastModified should be updated");

	const value = await resource.getString();
	t.is(value, "I am a readable stream!", "Stream set correctly");
});

test("Resource: setStream call while resource is being transformed", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		stream: new Stream.Readable({
			read() {
				this.push("Stream content");
				this.push(null);
			}
		})
	});

	const p1 = resource.getBuffer(); // Trigger async transformation of stream to buffer
	t.throws(() => {
		resource.setStream(new Stream.Readable()); // Set new stream while transformation is still ongoing
	}, {
		message: `Unable to set stream: Content of Resource /my/path/to/resource is currently being transformed`
	});
	await p1; // Wait for initial transformation to finish

	t.false(resource.isModified(), "Resource has not been modified");

	const value = await resource.getString();
	t.is(value, "Stream content", "Initial content still set");
});


test("Resource: clone resource with buffer", async (t) => {
	t.plan(2);

	const resource = new Resource({
		path: "/my/path/to/resource",
		buffer: Buffer.from("Content")
	});

	const clonedResource = await resource.clone();
	t.pass("Resource cloned");

	const clonedResourceContent = await clonedResource.getString();
	t.is(clonedResourceContent, "Content", "Cloned resource has correct content string");
});

test("Resource: clone resource with stream", async (t) => {
	t.plan(2);

	const resource = new Resource({
		path: "/my/path/to/resource"
	});
	const stream = new Stream.Readable();
	stream._read = function() {};
	stream.push("Content");
	stream.push(null);

	resource.setStream(stream);

	const clonedResource = await resource.clone();
	t.pass("Resource cloned");

	const clonedResourceContent = await clonedResource.getString();
	t.is(clonedResourceContent, "Content", "Cloned resource has correct content string");
});

test("Resource: clone resource with createBuffer factory", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		createStream: () => {
			const stream = new Stream.Readable();
			stream._read = function() {};
			stream.push("Stream Content");
			stream.push(null);
			return stream;
		},
		createBuffer: async () => {
			return Buffer.from("Buffer Content");
		}

	});

	const clonedResource = await resource.clone();

	const clonedResourceContent = await clonedResource.getString();
	t.is(clonedResourceContent, "Buffer Content", "Cloned resource has correct content string");
});

test("Resource: clone resource with createStream factory", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		createStream: () => {
			const stream = new Stream.Readable();
			stream._read = function() {};
			stream.push("Stream Content");
			stream.push(null);
			return stream;
		},
	});

	const clonedResource = await resource.clone();

	const clonedResourceContent = await clonedResource.getString();
	t.is(clonedResourceContent, "Stream Content", "Cloned resource has correct content string");
});

test("Resource: clone resource with stream during transformation to buffer", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource"
	});
	const stream = new Stream.Readable();
	stream._read = function() {};
	stream.push("Content");
	stream.push(null);

	resource.setStream(stream);

	const p1 = resource.getBuffer(); // Trigger async transformation of stream to buffer

	const clonedResource = await resource.clone();
	t.pass("Resource cloned");
	await p1; // Wait for initial transformation to finish

	t.is(await resource.getString(), "Content", "Original resource has correct content string");
	t.is(await clonedResource.getString(), "Content", "Cloned resource has correct content string");
});

test("Resource: clone resource while stream is drained/waiting for new content", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource"
	});
	const stream = new Stream.Readable();
	stream._read = function() {};
	stream.push("Content");
	stream.push(null);

	resource.setStream(stream);

	resource.getStream(); // Drain stream

	const p1 = resource.clone(); // Trigger async clone while stream is drained

	resource.setString("New Content");
	const clonedResource = await p1; // Wait for clone to finish

	t.is(await resource.getString(), "New Content", "Original resource has correct content string");
	t.is(await clonedResource.getString(), "New Content", "Cloned resource has correct content string");
});

test("Resource: clone resource with sourceMetadata", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		sourceMetadata: {
			adapter: "FileSystem",
			fsPath: "/resources/my.js"
		}
	});

	const clonedResource = await resource.clone();

	t.not(resource.getSourceMetadata(), clonedResource.getSourceMetadata(),
		"Clone has de-referenced instance of sourceMetadata");
	t.deepEqual(clonedResource.getSourceMetadata(), {
		adapter: "FileSystem",
		fsPath: "/resources/my.js",
		contentModified: false,
	});

	// Change existing resource and clone
	resource.setString("New Content");

	const clonedResource2 = await resource.clone();

	t.not(clonedResource2.getSourceMetadata(), resource.getSourceMetadata(),
		"Clone has de-referenced instance of sourceMetadata");
	t.deepEqual(clonedResource2.getSourceMetadata(), {
		adapter: "FileSystem",
		fsPath: "/resources/my.js",
		contentModified: true,
	});

	t.true(resource.isModified(), "Original resource is flagged as modified");
	t.false(clonedResource.isModified(), "Cloned resource 1 is not flagged as modified");
	t.false(clonedResource2.isModified(), "Cloned resource 2 is not flagged as modified");
});

test("Resource: clone resource with project removes project", async (t) => {
	const myProject = {
		name: "my project"
	};

	const resource = new Resource({
		path: "/my/path/to/resource",
		project: myProject
	});

	const clonedResource = await resource.clone();
	t.pass("Resource cloned");

	const clonedResourceProject = await clonedResource.getProject();
	t.falsy(clonedResourceProject, "Cloned resource should not have a project");
});

test("Resource: create resource with sourceMetadata.contentModified: true", (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		sourceMetadata: {
			adapter: "FileSystem",
			fsPath: "/resources/my.js",
			contentModified: true
		}
	});

	t.true(resource.getSourceMetadata().contentModified, "Modified flag is still true");
	t.false(resource.isModified(), "Resource is not modified");
	t.falsy(resource.getLastModified(), "lastModified is not set");
});

test("getStream with createStream callback content: Subsequent content requests should throw error due " +
		"to drained content", async (t) => {
	const resource = createBasicResource();
	resource.getStream();
	t.throws(() => {
		resource.getStream();
	}, {message: /Content of Resource \/app\/index.html is currently flagged as drained. Consider using Resource\.getStreamAsync\(\) to wait for new content./});
	await t.throwsAsync(resource.getBuffer(), {
		message: /Timeout waiting for content of Resource \/app\/index.html to become available/
	});
	await t.throwsAsync(resource.getString(), {
		message: /Timeout waiting for content of Resource \/app\/index.html to become available/
	});
});

test("getStream with Buffer content: Subsequent content requests should throw error due to drained " +
		"content", async (t) => {
	const resource = createBasicResource();
	await resource.getBuffer();
	resource.getStream();
	t.throws(() => {
		resource.getStream();
	}, {message: /Content of Resource \/app\/index.html is currently flagged as drained. Consider using Resource\.getStreamAsync\(\) to wait for new content./});
	await t.throwsAsync(resource.getBuffer(), {message: /Timeout waiting for content of Resource \/app\/index.html to become available./});
	await t.throwsAsync(resource.getString(), {message: /Timeout waiting for content of Resource \/app\/index.html to become available./});
});

test("getStream with Stream content: Subsequent content requests should throw error due to drained " +
		"content", async (t) => {
	const resource = createBasicResource();
	const tStream = new Transform({
		transform(chunk, encoding, callback) {
			this.push(chunk.toString());
			callback();
		}
	});
	const stream = resource.getStream();
	stream.pipe(tStream);
	resource.setStream(tStream);

	resource.getStream();
	t.throws(() => {
		resource.getStream();
	}, {message: /Content of Resource \/app\/index.html is currently flagged as drained. Consider using Resource\.getStreamAsync\(\) to wait for new content./});
	await t.throwsAsync(resource.getBuffer(), {message: /Timeout waiting for content of Resource \/app\/index.html to become available./});
	await t.throwsAsync(resource.getString(), {message: /Timeout waiting for content of Resource \/app\/index.html to become available./});
});

test("getStream from factory content: Prefers createStream factory over createBuffer", async (t) => {
	const createBufferStub = sinon.stub().resolves(Buffer.from("Buffer content"));
	const createStreamStub = sinon.stub().returns(
		new Stream.Readable({
			read() {
				this.push("Stream content");
				this.push(null);
			}
		}));
	const resource = new Resource({
		path: "/my/path/to/resource",
		createBuffer: createBufferStub,
		createStream: createStreamStub
	});
	const stream = await resource.getStream();
	const streamedResult = await readStream(stream);
	t.is(streamedResult, "Stream content", "getStream used createStream factory");
	t.true(createStreamStub.calledOnce, "createStream factory called once");
	t.false(createBufferStub.called, "createBuffer factory not called");
});

test("getStreamAsync with Buffer content", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		buffer: Buffer.from("Content")
	});

	const stream = await resource.getStreamAsync();
	const result = await readStream(stream);
	t.is(result, "Content", "Stream has been read correctly");
});

test("getStreamAsync with createStream callback", async (t) => {
	const fsPath = path.join("test", "fixtures", "application.a", "webapp", "index.html");
	const resource = new Resource({
		path: "/my/path/to/resource",
		createStream: () => {
			return createReadStream(fsPath);
		}
	});

	const stream = await resource.getStreamAsync();
	const result = await readStream(stream);
	t.is(result.length, 91, "Stream content has correct length");
});

test("getStreamAsync with Stream content", async (t) => {
	const stream = new Stream.Readable();
	stream._read = function() {};
	stream.push("Stream ");
	stream.push("content!");
	stream.push(null);

	const resource = new Resource({
		path: "/my/path/to/resource",
		stream
	});

	const resultStream = await resource.getStreamAsync();
	const result = await readStream(resultStream);
	t.is(result, "Stream content!", "Stream has been read correctly");
});

test("getStreamAsync: Factory content can be used to create new streams after setting new content", async (t) => {
	const fsPath = path.join("test", "fixtures", "application.a", "webapp", "index.html");
	const createStreamStub = sinon.stub().returns(
		new Stream.Readable({
			read() {
				this.push("Stream content");
				this.push(null);
			}
		}));
	const resource = new Resource({
		path: "/my/path/to/resource",
		createStream: createStreamStub,
	});

	// First call creates a stream
	const stream1 = await resource.getStreamAsync();
	const result1 = await readStream(stream1);
	t.is(result1.length, 14, "First stream read successfully");
	t.is(createStreamStub.callCount, 1, "Factory called once");

	// Content is now drained. To call getStreamAsync again, we need to set new content
	// by calling setStream with the factory again
	resource.setStream(() => createReadStream(fsPath));

	const stream2 = await resource.getStreamAsync();
	const result2 = await readStream(stream2);
	t.is(result2.length, 91, "Second stream read successfully after resetting content");
});

test("getStreamAsync: Waits for new content after stream is drained", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		string: "Initial content"
	});

	const stream1 = await resource.getStreamAsync();
	const result1 = await readStream(stream1);
	t.is(result1, "Initial content", "First stream read successfully");

	// Content is now drained, set new content
	setTimeout(() => {
		resource.setString("New content");
	}, 10);

	const stream2 = await resource.getStreamAsync();
	const result2 = await readStream(stream2);
	t.is(result2, "New content", "Second stream read successfully after setting new content");
});

test("getStreamAsync: Waits for content transformation to complete", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		stream: new Stream.Readable({
			read() {
				this.push("Initial content");
				this.push(null);
			}
		})
	});

	// Start getBuffer which will transform content
	const bufferPromise = resource.getBuffer();

	// Immediately call getStreamAsync while transformation is in progress
	const streamPromise = resource.getStreamAsync();

	// Both should complete successfully
	await bufferPromise;
	const stream = await streamPromise;
	const result = await readStream(stream);
	t.is(result, "Initial content", "Stream read successfully after waiting for transformation");
});

test("getStreamAsync with no content throws error", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource"
	});

	await t.throwsAsync(resource.getStreamAsync(), {
		message: "Resource /my/path/to/resource has no content"
	});
});

test("getStreamAsync from factory content: Prefers createStream factory", async (t) => {
	const createBufferStub = sinon.stub().resolves(Buffer.from("Buffer content"));
	const createStreamStub = sinon.stub().returns(
		new Stream.Readable({
			read() {
				this.push("Stream content");
				this.push(null);
			}
		}));
	const resource = new Resource({
		path: "/my/path/to/resource",
		createBuffer: createBufferStub,
		createStream: createStreamStub
	});

	const stream = await resource.getStreamAsync();
	const streamedResult = await readStream(stream);
	t.is(streamedResult, "Stream content", "getStreamAsync used createStream factory");
	t.true(createStreamStub.calledOnce, "createStream factory called once");
	t.false(createBufferStub.called, "createBuffer factory not called");
});

test("modifyStream: Modify buffer content with transform stream", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		string: "hello world"
	});

	t.false(resource.isModified(), "Resource is not modified initially");

	await resource.modifyStream(async (stream) => {
		const content = await readStream(stream);
		return Buffer.from(content.toUpperCase());
	});

	const result = await resource.getString();
	t.is(result, "HELLO WORLD", "Content was modified correctly");
	t.true(resource.isModified(), "Resource is marked as modified");
});

test("modifyStream: Return new stream from callback", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		string: "test content"
	});

	await resource.modifyStream((stream) => {
		const transformStream = new Transform({
			transform(chunk, encoding, callback) {
				this.push(chunk.toString().toUpperCase());
				callback();
			}
		});
		stream.pipe(transformStream);
		return transformStream;
	});

	const result = await resource.getString();
	t.is(result, "TEST CONTENT", "Content was modified with transform stream");
});

test("modifyStream: Can modify multiple times", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		string: "test"
	});

	await resource.modifyStream(async (stream) => {
		const content = await readStream(stream);
		return Buffer.from(content + " modified");
	});

	t.is(await resource.getString(), "test modified", "First modification applied");

	await resource.modifyStream(async (stream) => {
		const content = await readStream(stream);
		return Buffer.from(content + " again");
	});

	t.is(await resource.getString(), "test modified again", "Second modification applied");
});

test("modifyStream: Works with factory content", async (t) => {
	const fsPath = path.join("test", "fixtures", "application.a", "webapp", "index.html");
	const resource = new Resource({
		path: "/my/path/to/resource",
		createStream: () => createReadStream(fsPath)
	});

	await resource.modifyStream(async (stream) => {
		const content = await readStream(stream);
		return Buffer.from(content.toUpperCase());
	});

	const result = await resource.getString();
	t.true(result.includes("<!DOCTYPE HTML>"), "Content was read and modified from factory");
});

test("modifyStream: Waits for drained content", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		string: "initial"
	});

	// Drain the content
	const stream1 = await resource.getStreamAsync();
	await readStream(stream1);

	// Set new content after a delay
	setTimeout(() => {
		resource.setString("new content");
	}, 10);

	// modifyStream should wait for new content
	await resource.modifyStream(async (stream) => {
		const content = await readStream(stream);
		return Buffer.from(content.toUpperCase());
	});

	const result = await resource.getString();
	t.is(result, "NEW CONTENT", "modifyStream waited for new content and modified it");
});

test("modifyStream: Locks content during modification", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		string: "test"
	});

	const modifyPromise = resource.modifyStream(async (stream) => {
		// Simulate slow transformation
		await new Promise((resolve) => setTimeout(resolve, 20));
		const content = await readStream(stream);
		return Buffer.from(content.toUpperCase());
	});

	// Try to access content while modification is in progress
	// This should wait for the lock to be released
	const bufferPromise = resource.getBuffer();

	await modifyPromise;
	const buffer = await bufferPromise;

	t.is(buffer.toString(), "TEST", "Content access waited for modification to complete");
});

test("modifyStream: Throws error if callback returns invalid content", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		string: "test"
	});

	await t.throwsAsync(
		resource.modifyStream(async (stream) => {
			return "not a buffer or stream";
		}),
		{
			message: "Unable to set new content: Content must be either a Buffer or a Readable Stream"
		}
	);
});

test("modifyStream: Async callback returning Promise<Buffer>", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		string: "async test"
	});

	await resource.modifyStream(async (stream) => {
		const content = await readStream(stream);
		// Simulate async operation
		await new Promise((resolve) => setTimeout(resolve, 5));
		return Buffer.from(content.replace("async", "ASYNC"));
	});

	const result = await resource.getString();
	t.is(result, "ASYNC test", "Async callback worked correctly");
});

test("modifyStream: Sync callback returning Buffer", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		string: "sync test"
	});

	await resource.modifyStream((stream) => {
		// Return buffer synchronously
		return Buffer.from("SYNC TEST");
	});

	const result = await resource.getString();
	t.is(result, "SYNC TEST", "Sync callback returning Buffer worked correctly");
});

test("modifyStream: Updates modified flag", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		string: "test",
		sourceMetadata: {}
	});

	t.false(resource.isModified(), "Resource is not marked as modified");
	t.false(resource.getSourceMetadata().contentModified, "contentModified is false initially");

	await resource.modifyStream(async (stream) => {
		const content = await readStream(stream);
		return Buffer.from(content.toUpperCase());
	});

	t.true(resource.isModified(), "Resource is marked as modified");
	t.true(resource.getSourceMetadata().contentModified, "contentModified is true after modification");
});

test("getBuffer from Stream content with known size", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		byteSize: 14,
		stream: new Stream.Readable({
			read() {
				this.push("Stream content");
				this.push(null);
			}
		})
	});

	const p1 = resource.getBuffer();
	const p2 = resource.getBuffer();

	t.is((await p1).toString(), "Stream content");
	t.is((await p2).toString(), "Stream content");
});

test("getBuffer from Stream content with incorrect size", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		byteSize: 80,
		stream: new Stream.Readable({
			read() {
				this.push("Stream content");
				this.push(null);
			}
		})
	});

	await await t.throwsAsync(resource.getBuffer(), {
		message: `Stream ended early: expected 80 bytes, got 14`
	}, `Threw with expected error message`);

	const resource2 = new Resource({
		path: "/my/path/to/resource",
		byteSize: 1,
		stream: new Stream.Readable({
			read() {
				this.push("Stream content");
				this.push(null);
			}
		})
	});

	await await t.throwsAsync(resource2.getBuffer(), {
		message: `Stream exceeded expected size: 1, got at least 14`
	}, `Threw with expected error message`);
});

test("getBuffer from Stream content with stream error", async (t) => {
	let destroyCalled = false;
	const resource = new Resource({
		path: "/my/path/to/resource",
		byteSize: 14,
		stream: new Stream.Readable({
			read() {
				this.emit("error", new Error("Stream failure"));
			},
			destroy(err, callback) {
				destroyCalled = true;
				// The error will be present when stream.destroy is called due to the error
				t.truthy(err, "destroy called with error");
				callback(err);
			}
		})
	});

	await t.throwsAsync(resource.getBuffer());
	t.true(destroyCalled, "Stream destroy was called due to error");
});

test("getBuffer from Stream content: Subsequent content requests should not throw error due to drained " +
		"content", async (t) => {
	const resource = createBasicResource();
	const tStream = new Transform({
		transform(chunk, encoding, callback) {
			this.push(chunk.toString());
			callback();
		}
	});
	const stream = resource.getStream();
	stream.pipe(tStream);
	resource.setStream(tStream);

	const p1 = resource.getBuffer();
	const p2 = resource.getBuffer();

	await t.notThrowsAsync(p1);

	// Race condition in _getBufferFromStream used to cause p2
	// to throw "Content stream of Resource /app/index.html is flagged as drained."
	await t.notThrowsAsync(p2);
});

test("getBuffer from Stream content: getBuffer call while stream is consumed and new content is not yet set",
	async (t) => {
		const resource = createBasicResource();
		const tStream = new Transform({
			transform(chunk, encoding, callback) {
				this.push(chunk.toString());
				callback();
			}
		});
		const stream = resource.getStream();
		const p1 = resource.getBuffer();
		stream.pipe(tStream);
		resource.setStream(tStream);

		const p2 = resource.getBuffer();

		await t.notThrowsAsync(p1);

		// Race condition in _getBufferFromStream used to cause p2
		// to throw "Content stream of Resource /app/index.html is flagged as drained."
		await t.notThrowsAsync(p2);
	});

test("getBuffer from factory content: Prefers createBuffer factory over createStream", async (t) => {
	const createBufferStub = sinon.stub().resolves(Buffer.from("Buffer content"));
	const createStreamStub = sinon.stub().returns(
		new Stream.Readable({
			read() {
				this.push("Stream content");
				this.push(null);
			}
		}));
	const resource = new Resource({
		path: "/my/path/to/resource",
		createBuffer: createBufferStub,
		createStream: createStreamStub
	});
	const buffer = await resource.getBuffer();
	t.is(buffer.toString(), "Buffer content", "getBuffer used createBuffer factory");
	t.true(createBufferStub.calledOnce, "createBuffer factory called once");
	t.false(createStreamStub.called, "createStream factory not called");

	// Calling getBuffer again should not call factories again
	const buffer2 = await resource.getBuffer();
	t.is(buffer2, buffer, "getBuffer returned same buffer instance");
	t.true(createBufferStub.calledOnce, "createBuffer factory still called only once");
});

test("getBuffer from factory content: Factory does not return buffer instance", async (t) => {
	const createBufferStub = sinon.stub().resolves("Buffer content");
	const createStreamStub = sinon.stub().returns(
		new Stream.Readable({
			read() {
				this.push("Stream content");
				this.push(null);
			}
		}));
	const resource = new Resource({
		path: "/my/path/to/resource",
		createBuffer: createBufferStub,
		createStream: createStreamStub
	});
	await t.throwsAsync(resource.getBuffer(), {
		message: `Buffer factory of Resource /my/path/to/resource did not return a Buffer instance`
	}, `Threw with expected error message`);
	t.true(createBufferStub.calledOnce, "createBuffer factory called once");
	t.false(createStreamStub.called, "createStream factory not called");
});

test("Resource: getProject", (t) => {
	t.plan(1);
	const resource = new Resource({
		path: "/my/path/to/resource",
		project: {getName: () => "Mock Project"}
	});
	const project = resource.getProject();
	t.is(project.getName(), "Mock Project");
});

test("Resource: setProject", (t) => {
	t.plan(1);
	const resource = new Resource({
		path: "/my/path/to/resource"
	});
	const project = {getName: () => "Mock Project"};
	resource.setProject(project);
	t.is(resource.getProject().getName(), "Mock Project");
});

test("Resource: reassign with setProject", (t) => {
	t.plan(2);
	const resource = new Resource({
		path: "/my/path/to/resource",
		project: {getName: () => "Mock Project"}
	});
	const project = {getName: () => "New Mock Project"};
	const error = t.throws(() => resource.setProject(project));
	t.is(error.message, "Unable to assign project New Mock Project to resource /my/path/to/resource: " +
		"Resource is already associated to project " + project);
});

test("Resource: constructor with stream", async (t) => {
	const stream = new Stream.Readable();
	stream._read = function() {};
	stream.push("I am a ");
	stream.push("readable ");
	stream.push("stream!");
	stream.push(null);

	const resource = new Resource({
		path: "/my/path/to/resource",
		stream,
		byteSize: 23,
		sourceMetadata: {} // Needs to be passed in order to get the "modified" state
	});

	t.is(resource.getSourceMetadata().contentModified, false);

	const value = await resource.getString();
	t.is(value, "I am a readable stream!");

	// modified should still be false although setBuffer is called internally
	t.is(resource.getSourceMetadata().contentModified, false);
});

test("integration stat", async (t) => {
	const fsPath = path.join("test", "fixtures", "application.a", "webapp", "index.html");
	const statInfo = await stat(fsPath);

	const resource = new Resource({
		path: "/some/path",
		statInfo,
		createStream: () => {
			return createReadStream(fsPath);
		}
	});
	t.is(await resource.getSize(), 91);
	t.false(resource.isDirectory());
	t.is(resource.getLastModified(), statInfo.mtimeMs);

	// Setting the same content again should end up with the same size
	resource.setString(await resource.getString());
	t.is(await resource.getSize(), 91);
	t.true(resource.getLastModified() > statInfo.mtimeMs, "lastModified should be updated");

	resource.setString("myvalue");
	t.is(await resource.getSize(), 7);
});

test("getSize", async (t) => {
	const fsPath = path.join("test", "fixtures", "application.a", "webapp", "index.html");
	const statInfo = await stat(fsPath);

	const resource = new Resource({
		path: "/some/path",
		byteSize: statInfo.size,
		createStream: () => {
			return createReadStream(fsPath);
		}
	});
	t.true(resource.hasSize());
	t.is(await resource.getSize(), 91);

	const resourceNoSize = new Resource({
		path: "/some/path",
		createStream: () => {
			return createReadStream(fsPath);
		}
	});
	t.false(resourceNoSize.hasSize(), "Resource with createStream and no byteSize has no size");
	t.is(await resourceNoSize.getSize(), 91);
});

/* Integrity Glossary

	"Content" = "sha256-R70pB1+LgBnwvuxthr7afJv2eq8FBT3L4LO8tjloUX8="
	"New content" = "sha256-EvQbHDId8MgpzlgZllZv3lKvbK/h0qDHRmzeU+bxPMo="
*/
test("getIntegrity: Throws error for directory resource", async (t) => {
	const resource = new Resource({
		path: "/my/directory",
		isDirectory: true
	});

	await t.throwsAsync(resource.getIntegrity(), {
		message: "Unable to calculate integrity for directory resource: /my/directory"
	});
});

test("getIntegrity: Returns integrity for buffer content", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		buffer: Buffer.from("Content")
	});

	const integrity = await resource.getIntegrity();
	t.is(integrity, "sha256-R70pB1+LgBnwvuxthr7afJv2eq8FBT3L4LO8tjloUX8=",
		"Correct integrity for content");
});

test("getIntegrity: Returns integrity for stream content", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		stream: new Stream.Readable({
			read() {
				this.push("Content");
				this.push(null);
			}
		}),
	});

	const integrity = await resource.getIntegrity();
	t.is(integrity, "sha256-R70pB1+LgBnwvuxthr7afJv2eq8FBT3L4LO8tjloUX8=",
		"Correct integrity for content");
});

test("getIntegrity: Returns integrity for factory content", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		createStream: () => {
			return new Stream.Readable({
				read() {
					this.push("Content");
					this.push(null);
				}
			});
		}
	});

	const integrity = await resource.getIntegrity();
	t.is(integrity, "sha256-R70pB1+LgBnwvuxthr7afJv2eq8FBT3L4LO8tjloUX8=",
		"Correct integrity for content");
});

test("getIntegrity: Throws error for resource with no content", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource"
	});

	await t.throwsAsync(resource.getIntegrity(), {
		message: "Resource /my/path/to/resource has no content"
	});
});

test("getIntegrity: Different content produces different integrities", async (t) => {
	const resource1 = new Resource({
		path: "/my/path/to/resource1",
		string: "Content 1"
	});

	const resource2 = new Resource({
		path: "/my/path/to/resource2",
		string: "Content 2"
	});

	const integrity1 = await resource1.getIntegrity();
	const integrity2 = await resource2.getIntegrity();

	t.not(integrity1, integrity2, "Different content produces different integrities");
});

test("getIntegrity: Same content produces same integrity", async (t) => {
	const resource1 = new Resource({
		path: "/my/path/to/resource1",
		string: "Content"
	});

	const resource2 = new Resource({
		path: "/my/path/to/resource2",
		buffer: Buffer.from("Content")
	});

	const resource3 = new Resource({
		path: "/my/path/to/resource2",
		stream: new Stream.Readable({
			read() {
				this.push("Content");
				this.push(null);
			}
		}),
	});

	const integrity1 = await resource1.getIntegrity();
	const integrity2 = await resource2.getIntegrity();
	const integrity3 = await resource3.getIntegrity();

	t.is(integrity1, integrity2, "Same content produces same integrity for string and buffer content");
	t.is(integrity1, integrity3, "Same content produces same integrity for string and stream");
});

test("getIntegrity: Waits for drained content", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		string: "Initial content"
	});

	// Drain the stream
	await resource.getStreamAsync();
	const p1 = resource.getIntegrity(); // Start getIntegrity which should wait for new content

	resource.setString("New content");

	const integrity = await p1;
	t.is(integrity, "sha256-EvQbHDId8MgpzlgZllZv3lKvbK/h0qDHRmzeU+bxPMo=",
		"Correct integrity for new content");
});

test("getIntegrity: Waits for content transformation to complete", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		stream: new Stream.Readable({
			read() {
				this.push("Content");
				this.push(null);
			}
		})
	});

	// Start getBuffer which will transform content
	const bufferPromise = resource.getBuffer();

	// Immediately call getIntegrity while transformation is in progress
	const integrityPromise = resource.getIntegrity();

	// Both should complete successfully
	await bufferPromise;
	const integrity = await integrityPromise;
	t.is(integrity, "sha256-R70pB1+LgBnwvuxthr7afJv2eq8FBT3L4LO8tjloUX8=",
		"Correct integrity after waiting for transformation");
});

test("getIntegrity: Can be called multiple times on buffer content", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		buffer: Buffer.from("Content")
	});

	const integrity1 = await resource.getIntegrity();
	const integrity2 = await resource.getIntegrity();
	const integrity3 = await resource.getIntegrity();

	t.is(integrity1, integrity2, "First and second integrity are identical");
	t.is(integrity2, integrity3, "Second and third integrity are identical");

	t.is(integrity1, "sha256-R70pB1+LgBnwvuxthr7afJv2eq8FBT3L4LO8tjloUX8=",
		"Correct integrity for content");
});

test("getIntegrity: Can be called multiple times on factory content", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		createStream: () => {
			return new Stream.Readable({
				read() {
					this.push("Content");
					this.push(null);
				}
			});
		}
	});

	const integrity1 = await resource.getIntegrity();
	const integrity2 = await resource.getIntegrity();
	const integrity3 = await resource.getIntegrity();

	t.is(integrity1, integrity2, "First and second integrity are identical");
	t.is(integrity2, integrity3, "Second and third integrity are identical");

	t.is(integrity1, "sha256-R70pB1+LgBnwvuxthr7afJv2eq8FBT3L4LO8tjloUX8=",
		"Correct integrity for content");
});

test("getIntegrity: Can be called multiple times on stream content", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		stream: new Stream.Readable({
			read() {
				this.push("Content");
				this.push(null);
			}
		})
	});

	const integrity1 = await resource.getIntegrity();
	const integrity2 = await resource.getIntegrity();
	const integrity3 = await resource.getIntegrity();

	t.is(integrity1, integrity2, "First and second integrity are identical");
	t.is(integrity2, integrity3, "Second and third integrity are identical");

	t.is(integrity1, "sha256-R70pB1+LgBnwvuxthr7afJv2eq8FBT3L4LO8tjloUX8=",
		"Correct integrity for content");
});

test("getIntegrity: Integrity changes after content modification", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		string: "Original content"
	});

	const integrity1 = await resource.getIntegrity();
	t.is(integrity1, "sha256-OUni2q0Lopc2NkTnXeaaYPNQJNUATQtbAqMWJvtCVNo=",
		"Correct integrity for original content");

	resource.setString("Modified content");

	const integrity2 = await resource.getIntegrity();
	t.is(integrity2, "sha256-8fba0TDG5CusKMUf/7GVTTxaYjVbRXacQv2lt3RdtT8=",
		"Integrity changes after content modification");
	t.not(integrity1, integrity2, "New integrity is different from original");
});

test("getIntegrity: Works with empty content", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		string: ""
	});

	const integrity = await resource.getIntegrity();

	t.is(integrity, "sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=",
		"Correct integrity for empty content");
});

test("getIntegrity: Works with large content", async (t) => {
	const largeContent = "x".repeat(1024 * 1024); // 1MB of 'x'
	const resource = new Resource({
		path: "/my/path/to/resource",
		string: largeContent
	});

	const integrity = await resource.getIntegrity();

	t.is(integrity, "sha256-j5kLoLV3tRzwCeoEk2jBa72hsh4bk74HqCR1i7JTw5s=",
		"Correct integrity for large content");
});
