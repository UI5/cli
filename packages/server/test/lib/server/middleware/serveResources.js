const test = require("ava");
const sinon = require("sinon");
const resourceFactory = require("@ui5/fs").resourceFactory;
const serveResourcesMiddleware = require("../../../../lib/middleware/serveResources");
const writeResource = function(writer, path, size, stringContent) {
	const statInfo = {
		ino: 0,
		ctime: new Date(),
		mtime: new Date(),
		size: size,
		isDirectory: function() {
			return false;
		}
	};
	const resource = resourceFactory.createResource({path, buffer: Buffer.from(stringContent, "latin1"), statInfo});
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

	return writeResource(readerWriter, "/myFile3.properties", 1024 * 1024, "key=titel\nfame=straße").then((resource) => {
		const setStringSpy = sinon.spy(resource, "setString");
		const middleware = serveResourcesMiddleware({
			resources: {
				all: readerWriter
			},
			tree: {
				resources: {
					configuration: {
						propertiesFileSourceEncoding: "ISO-8859-1"
					}
				}
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

	return writeResource(readerWriter, "/myFile3.properties", 1024 * 1024, "key=titel\nfame=straße").then((resource) => {
		const setStringSpy = sinon.spy(resource, "setString");
		const middleware = serveResourcesMiddleware({
			resources: {
				all: readerWriter
			},
			tree: {
				resources: {
					configuration: {
						propertiesFileSourceEncoding: "UTF-8"
					}
				}
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
fame=stra\\ufffde`);
			t.is(setHeaderSpy.callCount, 2);
			t.is(setStringSpy.callCount, 1);
			t.is(setHeaderSpy.getCall(0).lastArg, "application/octet-stream");
		});
	});
});

test.serial("Check if properties file is served properly without property setting", (t) => {
	t.plan(4);

	const readerWriter = resourceFactory.createAdapter({virBasePath: "/"});

	return writeResource(readerWriter, "/myFile3.properties", 1024 * 1024, "key=titel\nfame=straße").then((resource) => {
		const setStringSpy = sinon.spy(resource, "setString");
		const middleware = serveResourcesMiddleware({
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
