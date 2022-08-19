/* eslint-disable ava/no-unknown-modifiers */
/* Test modifier `cb` was deprecated with ava version
3 and removed with ava version 4. Therefore, tests using `cb` has to be rewritten, when upgrade to ava version 4 */

const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");
const {Readable, Writable} = require("stream");
const resourceFactory = require("@ui5/fs").resourceFactory;
const serveResourcesMiddleware = require("../../../../lib/middleware/serveResources");
const MiddlewareUtil = require("../../../../lib/middleware/MiddlewareUtil");
const writeResource = function(writer, path, size, stringContent, stringEncoding, project) {
	const statInfo = {
		ino: 0,
		ctime: new Date(),
		mtime: new Date(),
		size: size,
		isDirectory: function() {
			return false;
		}
	};
	const resource = resourceFactory.createResource({
		path,
		buffer: Buffer.from(stringContent, stringEncoding),
		statInfo,
		project
	});
	// stub resource functionality in order to be able to get the Resource's content. Otherwise it would be drained.
	sinon.stub(resource, "getStream").returns({
		pipe: function() {
		}
	});

	writer.byPath = sinon.stub();
	writer.byPath.withArgs(path).resolves(resource);
	return writer.write(resource).then(() => {
		return resource;
	});
};
const fakeResponse = {
	writeHead: function(status, contentType) {},
	getHeader: function(string) {},
	setHeader: function(string, header) {}
};

test.afterEach.always((t) => {
	mock.stopAll();
	sinon.restore();
});

test.serial("Check if properties file is served properly", async (t) => {
	t.plan(4);

	const readerWriter = resourceFactory.createAdapter({virBasePath: "/"});
	const project = {
		getPropertiesFileSourceEncoding: () => "ISO-8859-1"
	};

	const resource = await writeResource(readerWriter, "/myFile3.properties", 1024 * 1024,
		"key=titel\nfame=straße", "latin1", project);

	const setStringSpy = sinon.spy(resource, "setString");
	const middleware = serveResourcesMiddleware({
		middlewareUtil: new MiddlewareUtil(),
		resources: {
			all: readerWriter
		}
	});

	const response = fakeResponse;

	const setHeaderSpy = sinon.spy(response, "setHeader");
	const req = {
		url: "/myFile3.properties",
		headers: {}
	};
	const next = function(err) {
		throw new Error(`Next callback called with error: ${err.message}`);
	};
	const content = await middleware(req, response, next).then((o) => {
		return resource.getString();
	});

	t.is(content, `key=titel
fame=stra\\u00dfe`);
	t.is(setHeaderSpy.callCount, 2);
	t.is(setStringSpy.callCount, 1);
	t.is(setHeaderSpy.getCall(0).lastArg, "application/octet-stream");
});

test.serial("Check if properties file is served properly with UTF-8", async (t) => {
	t.plan(4);

	const readerWriter = resourceFactory.createAdapter({virBasePath: "/"});
	const project = {
		getPropertiesFileSourceEncoding: () => "UTF-8"
	};

	const resource = await writeResource(readerWriter, "/myFile3.properties", 1024 * 1024,
		"key=titel\nfame=straße", "utf8", project);

	const setStringSpy = sinon.spy(resource, "setString");
	const middleware = serveResourcesMiddleware({
		middlewareUtil: new MiddlewareUtil(),
		resources: {
			all: readerWriter
		}
	});

	const response = fakeResponse;

	const setHeaderSpy = sinon.spy(response, "setHeader");
	const req = {
		url: "/myFile3.properties",
		headers: {}
	};
	const next = function(err) {
		throw new Error(`Next callback called with error: ${err.message}`);
	};
	await middleware(req, response, next);
	const content = await resource.getString();

	t.is(content, `key=titel
fame=stra\\u00dfe`);
	t.is(setHeaderSpy.callCount, 2);
	t.is(setStringSpy.callCount, 1);
	t.is(setHeaderSpy.getCall(0).lastArg, "application/octet-stream");
});

test.serial("Check if properties file is served properly without property setting", async (t) => {
	t.plan(4);

	const readerWriter = resourceFactory.createAdapter({virBasePath: "/"});

	const resource = await writeResource(readerWriter, "/myFile3.properties",
		1024 * 1024, "key=titel\nfame=straße", "utf8"
	);
	const setStringSpy = sinon.spy(resource, "setString");
	const middleware = serveResourcesMiddleware({
		middlewareUtil: new MiddlewareUtil(),
		resources: {
			all: readerWriter
		}
	});

	const response = fakeResponse;

	const setHeaderSpy = sinon.spy(response, "setHeader");
	const req = {
		url: "/myFile3.properties",
		headers: {}
	};
	const next = function(err) {
		throw new Error(`Next callback called with error: ${err.stack}`);
	};

	await middleware(req, response, next);
	const content = await resource.getString();

	t.is(content, `key=titel
fame=stra\\u00dfe`);
	t.is(setHeaderSpy.callCount, 2);
	t.is(setStringSpy.callCount, 1);
	t.is(setHeaderSpy.getCall(0).lastArg, "application/octet-stream");
});

test.serial("Check if properties file is served properly without property setting but legacy spec version",
	async (t) => {
		t.plan(4);

		const readerWriter = resourceFactory.createAdapter({virBasePath: "/"});
		const project = {
			getPropertiesFileSourceEncoding: () => "",
			getSpecVersion: () => "1.1"
		};
		const resource = await writeResource(readerWriter, "/myFile3.properties",
			1024 * 1024, "key=titel\nfame=straße", "latin1", project
		);
		const setStringSpy = sinon.spy(resource, "setString");
		const middleware = serveResourcesMiddleware({
			middlewareUtil: new MiddlewareUtil(),
			resources: {
				all: readerWriter
			}
		});

		const response = fakeResponse;

		const setHeaderSpy = sinon.spy(response, "setHeader");
		const req = {
			url: "/myFile3.properties",
			headers: {}
		};
		const next = function(err) {
			throw new Error(`Next callback called with error: ${err.stack}`);
		};
		await middleware(req, response, next);
		const content = await resource.getString();
		t.is(content, `key=titel
fame=stra\\u00dfe`);
		t.is(setHeaderSpy.callCount, 2);
		t.is(setStringSpy.callCount, 1);
		t.is(setHeaderSpy.getCall(0).lastArg, "application/octet-stream");
	});

test.serial("Check if properties file is served properly without property setting but spec version", async (t) => {
	t.plan(4);

	const readerWriter = resourceFactory.createAdapter({virBasePath: "/"});
	const project = {
		getPropertiesFileSourceEncoding: () => "",
		getSpecVersion: () => "2.0"
	};
	const resource = await writeResource(readerWriter, "/myFile3.properties",
		1024 * 1024, "key=titel\nfame=straße", "utf8", project
	);
	const setStringSpy = sinon.spy(resource, "setString");
	const middleware = serveResourcesMiddleware({
		middlewareUtil: new MiddlewareUtil(),
		resources: {
			all: readerWriter
		}
	});

	const response = fakeResponse;

	const setHeaderSpy = sinon.spy(response, "setHeader");
	const req = {
		url: "/myFile3.properties",
		headers: {}
	};
	const next = function(err) {
		throw new Error(`Next callback called with error: ${err.stack}`);
	};
	await middleware(req, response, next);
	const content = await resource.getString();

	t.is(content, `key=titel
fame=stra\\u00dfe`);
	t.is(setHeaderSpy.callCount, 2);
	t.is(setStringSpy.callCount, 1);
	t.is(setHeaderSpy.getCall(0).lastArg, "application/octet-stream");
});

test.serial("Check verbose logging", (t) => {
	const logger = require("@ui5/logger");
	const verboseLogStub = sinon.stub();
	const myLoggerInstance = {
		verbose: verboseLogStub,
		isLevelEnabled: () => true
	};
	sinon.stub(logger, "getLogger").returns(myLoggerInstance);
	const serveResourcesMiddlewareWithMock = mock.reRequire("../../../../lib/middleware/serveResources");


	const resource = {
		getPath: sinon.stub().returns("/foo.js"),
		getStatInfo: sinon.stub().returns({
			ino: 0,
			ctime: new Date(),
			mtime: new Date(),
			size: 1024 * 1024,
			isDirectory: function() {
				return false;
			}
		}),
		getStream: () => {
			const stream = new Readable();
			stream.push(Buffer.from(""));
			stream.push(null);
			return stream;
		},
		getProject: () => {
			return {
				getVersion: () => "1.0.0"
			};
		},
		getPathTree: () => {
			return {
				"mypath": {
					"a": {
						"b": {}
					}

				}
			};
		}
	};

	const resources = {
		all: {
			byPath: sinon.stub()
		}
	};
	const middleware = serveResourcesMiddlewareWithMock({
		middlewareUtil: new MiddlewareUtil(),
		resources
	});

	resources.all.byPath.withArgs("/foo.js").resolves(resource);

	const req = {
		url: "/foo.js",
		headers: {}
	};

	return new Promise((resolve, reject) => {
		const res = new Writable();
		res.setHeader = sinon.stub();
		res.getHeader = sinon.stub();
		res._write = sinon.stub();
		res.end = function() {
			t.is(verboseLogStub.callCount, 1, "was called once");
			const expected = "\n└─ mypath\n" +
				"   └─ a\n" +
				"      └─ b\n";
			t.deepEqual(verboseLogStub.getCall(0).args, [expected], "treeify works correctly");
			resolve();
		};

		middleware(req, res, function(err) {
			if (err) {
				t.fail("Unexpected error passed to next function: " + err);
			} else {
				t.fail("Unexpected call of next function");
			}
			reject(new Error("should not happen"));
		});
	});
});

test.serial.cb("Check if version replacement is done", (t) => {
	const input = "foo ${version} bar";
	const expected = "foo 1.0.0 bar";

	const resource = {
		getPath: sinon.stub().returns("/foo.js"),
		getStatInfo: sinon.stub().returns({
			ino: 0,
			ctime: new Date(),
			mtime: new Date(),
			size: 1024 * 1024,
			isDirectory: function() {
				return false;
			}
		}),
		getStream: () => {
			const stream = new Readable();
			stream.push(Buffer.from(input));
			stream.push(null);
			return stream;
		},
		getProject: () => {
			return {
				getVersion: () => "1.0.0"
			};
		},
		getPathTree: () => ""
	};

	const resources = {
		all: {
			byPath: sinon.stub()
		}
	};
	const middleware = serveResourcesMiddleware({
		middlewareUtil: new MiddlewareUtil(),
		resources
	});

	resources.all.byPath.withArgs("/foo.js").resolves(resource);

	const req = {
		url: "/foo.js",
		headers: {}
	};

	const res = new Writable();
	const buffers = [];
	res.setHeader = sinon.stub();
	res.getHeader = sinon.stub();
	res._write = function(chunk, encoding, callback) {
		buffers.push(chunk);
		callback();
	};
	res.end = function() {
		t.is(Buffer.concat(buffers).toString(), expected);
		t.end();
	};

	middleware(req, res, function(err) {
		if (err) {
			t.fail("Unexpected error passed to next function: " + err);
		} else {
			t.fail("Unexpected call of next function");
		}
		t.end();
	});
});

// Skip test in Node v8 as unicode handling of streams seems to be broken
test.serial[
	// eslint-disable-next-line ava/no-unknown-modifiers
	process.version.startsWith("v8.") ? "skip" : "cb"
]("Check if utf8 characters are correctly processed in version replacement", (t) => {
	const utf8string = "Κυ";
	const expected = utf8string;

	const resource = {
		getPath: sinon.stub().returns("/foo.js"),
		getStatInfo: sinon.stub().returns({
			ino: 0,
			ctime: new Date(),
			mtime: new Date(),
			size: 1024 * 1024,
			isDirectory: function() {
				return false;
			}
		}),
		getStream: () => {
			const stream = new Readable();
			const utf8stringAsBuffer = Buffer.from(utf8string, "utf8");
			// Pushing each byte separately makes content unreadable
			// if stream encoding is not set to utf8
			// This might happen when reading large files with utf8 characters
			stream.push(Buffer.from([utf8stringAsBuffer[0]]));
			stream.push(Buffer.from([utf8stringAsBuffer[1]]));
			stream.push(Buffer.from([utf8stringAsBuffer[2]]));
			stream.push(Buffer.from([utf8stringAsBuffer[3]]));
			stream.push(null);
			return stream;
		},
		getProject: () => {
			return {
				getVersion: () => "1.0.0"
			};
		},
		getPathTree: () => ""
	};

	const resources = {
		all: {
			byPath: sinon.stub()
		}
	};
	const middleware = serveResourcesMiddleware({
		middlewareUtil: new MiddlewareUtil(),
		resources
	});

	resources.all.byPath.withArgs("/foo.js").resolves(resource);

	const req = {
		url: "/foo.js",
		headers: {}
	};

	const res = new Writable();
	const buffers = [];
	res.setHeader = sinon.stub();
	res.getHeader = sinon.stub();
	res._write = function(chunk, encoding, callback) {
		buffers.push(chunk);
		callback();
	};
	res.end = function() {
		t.is(Buffer.concat(buffers).toString(), expected);
		t.end();
	};

	middleware(req, res, function(err) {
		if (err) {
			t.fail("Unexpected error passed to next function: " + err);
		} else {
			t.fail("Unexpected call of next function");
		}
		t.end();
	});
});
