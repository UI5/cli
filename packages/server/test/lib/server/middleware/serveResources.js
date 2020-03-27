const test = require("ava");
const sinon = require("sinon");
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
	sinon.restore();
});

test.serial("Check if properties file is served properly", (t) => {
	t.plan(4);

	const readerWriter = resourceFactory.createAdapter({virBasePath: "/"});
	const project = {
		resources: {
			configuration: {
				propertiesFileSourceEncoding: "ISO-8859-1"
			}
		}
	};

	return writeResource(readerWriter, "/myFile3.properties", 1024 * 1024, "key=titel\nfame=straße", "latin1", project)
		.then((resource) => {
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
			return middleware(req, response, next).then((o) => {
				return resource.getString();
			}).then((content) => {
				t.is(content, `key=titel
fame=stra\\u00dfe`);
				t.is(setHeaderSpy.callCount, 2);
				t.is(setStringSpy.callCount, 1);
				t.is(setHeaderSpy.getCall(0).lastArg, "application/octet-stream");
			});
		});
});

test.serial("Check if properties file is served properly with UTF-8", (t) => {
	t.plan(4);

	const readerWriter = resourceFactory.createAdapter({virBasePath: "/"});
	const project = {
		resources: {
			configuration: {
				propertiesFileSourceEncoding: "UTF-8"
			}
		}
	};

	return writeResource(readerWriter, "/myFile3.properties", 1024 * 1024, "key=titel\nfame=straße", "utf8", project)
		.then((resource) => {
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
			return middleware(req, response, next).then((o) => {
				return resource.getString();
			}).then((content) => {
				t.is(content, `key=titel
fame=stra\\u00dfe`);
				t.is(setHeaderSpy.callCount, 2);
				t.is(setStringSpy.callCount, 1);
				t.is(setHeaderSpy.getCall(0).lastArg, "application/octet-stream");
			});
		});
});

test.serial("Check if properties file is served properly without property setting", (t) => {
	t.plan(4);

	const readerWriter = resourceFactory.createAdapter({virBasePath: "/"});

	return writeResource(readerWriter, "/myFile3.properties", 1024 * 1024, "key=titel\nfame=straße", "utf8").then((resource) => {
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
		return middleware(req, response, next).then((o) => {
			return resource.getString();
		}).then((content) => {
			t.is(content, `key=titel
fame=stra\\u00dfe`);
			t.is(setHeaderSpy.callCount, 2);
			t.is(setStringSpy.callCount, 1);
			t.is(setHeaderSpy.getCall(0).lastArg, "application/octet-stream");
		});
	});
});

test.serial("Check if properties file is served properly without property setting but legacy spec version", (t) => {
	t.plan(4);

	const readerWriter = resourceFactory.createAdapter({virBasePath: "/"});
	const project = {
		specVersion: "1.1"
	};
	return writeResource(readerWriter, "/myFile3.properties", 1024 * 1024, "key=titel\nfame=straße", "latin1", project).then((resource) => {
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
		return middleware(req, response, next).then((o) => {
			return resource.getString();
		}).then((content) => {
			t.is(content, `key=titel
fame=stra\\u00dfe`);
			t.is(setHeaderSpy.callCount, 2);
			t.is(setStringSpy.callCount, 1);
			t.is(setHeaderSpy.getCall(0).lastArg, "application/octet-stream");
		});
	});
});

test.serial("Check if properties file is served properly without property setting but spec version", (t) => {
	t.plan(4);

	const readerWriter = resourceFactory.createAdapter({virBasePath: "/"});
	const project = {
		specVersion: "2.0"
	};
	return writeResource(readerWriter, "/myFile3.properties", 1024 * 1024, "key=titel\nfame=straße", "utf8", project).then((resource) => {
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
		return middleware(req, response, next).then((o) => {
			return resource.getString();
		}).then((content) => {
			t.is(content, `key=titel
fame=stra\\u00dfe`);
			t.is(setHeaderSpy.callCount, 2);
			t.is(setStringSpy.callCount, 1);
			t.is(setHeaderSpy.getCall(0).lastArg, "application/octet-stream");
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
		_project: {
			version: "1.0.0"
		}
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
	},

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
		_project: {
			version: "1.0.0"
		}
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
	},

	middleware(req, res, function(err) {
		if (err) {
			t.fail("Unexpected error passed to next function: " + err);
		} else {
			t.fail("Unexpected call of next function");
		}
		t.end();
	});
});
