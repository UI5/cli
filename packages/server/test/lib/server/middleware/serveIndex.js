const test = require("ava");
const resourceFactory = require("@ui5/fs").resourceFactory;

test.serial("serveIndex default", (t) => {
	t.plan(4);
	const serveIndexMiddleware = require("../../../../lib/middleware/serveIndex");
	const writeResource = function(writer, path, size = 0, stringContent = "abc") {
		const resource = resourceFactory.createResource({path, string: stringContent});
		resource.getStatInfo = function() {
			return {
				mtime: 0,
				size: size,
				isDirectory: function() {
					return false;
				}
			};
		};
		return writer.write(resource);
	};

	const readerWriter = resourceFactory.createAdapter({virBasePath: "/"});

	return Promise.all([
		writeResource(readerWriter, "/myFile1.meh", 1024), // KB
		writeResource(readerWriter, "/myFile2.js", 1024 * 1024), // MB
		writeResource(readerWriter, "/myFile3.properties", 1024 * 1024 * 1024), // GB
		writeResource(readerWriter, "/.myFile4", 1024), // hidden 1 KB
	]).then(() => {
		const middleware = serveIndexMiddleware({
			resources: {
				all: readerWriter
			}
		});

		return new Promise((resolve, reject) => {
			const req = {
				path: "/"
			};
			const res = {
				writeHead: function(status, contentType) {
				},
				end: function(content) {
					t.regex(content, RegExp("<li><a href=\"/myFile1.meh\" class=\"icon icon icon-meh icon-default\" title=\"myFile1.meh\"><span class=\"name\">myFile1.meh</span><span class=\"size\">1.00 KB</span>"));
					t.regex(content, RegExp("<li><a href=\"/myFile2.js\" class=\"icon icon icon-js icon-application-javascript\" title=\"myFile2.js\"><span class=\"name\">myFile2.js</span><span class=\"size\">1.00 MB</span>"));
					t.regex(content, RegExp("<li><a href=\"/myFile3.properties\" class=\"icon icon icon-properties icon-default\" title=\"myFile3.properties\"><span class=\"name\">myFile3.properties</span><span class=\"size\">1.00 GB</span>"));
					t.regex(content, RegExp("<li><a href=\"/.myFile4\" class=\"icon icon icon- icon-default\" title=\".myFile4\"><span class=\"name\">.myFile4</span><span class=\"size\">1.00 KB</span>"));
					resolve();
				},
			};
			const next = function(err) {
				reject(new Error(`Next callback called with error: ${err.message}`));
			};
			middleware(req, res, next);
		});
	});
});

test.serial("serveIndex no hidden", (t) => {
	t.plan(4);
	const serveIndexMiddleware = require("../../../../lib/middleware/serveIndex");
	const writeResource = function(writer, path, size = 0, stringContent = "abc") {
		const resource = resourceFactory.createResource({path, string: stringContent});
		resource.getStatInfo = function() {
			return {
				mtime: 0,
				size: size,
				isDirectory: function() {
					return false;
				}
			};
		};
		return writer.write(resource);
	};

	const readerWriter = resourceFactory.createAdapter({virBasePath: "/"});

	return Promise.all([
		writeResource(readerWriter, "/myFile1.meh", 1024), // KB
		writeResource(readerWriter, "/myFile2.js", 1024 * 1024), // MB
		writeResource(readerWriter, "/myFile3.properties", 1024 * 1024 * 1024), // GB
		writeResource(readerWriter, "/.myFile4", 1024), // hidden 1 KB
	]).then(() => {
		const middleware = serveIndexMiddleware({
			resources: {
				all: readerWriter
			},
			simpleIndex: false,
			showHidden: false
		});

		return new Promise((resolve, reject) => {
			const req = {
				path: "/"
			};
			const res = {
				writeHead: function(status, contentType) {
				},
				end: function(content) {
					t.regex(content, RegExp("<li><a href=\"/myFile1.meh\" class=\"icon icon icon-meh icon-default\" title=\"myFile1.meh\"><span class=\"name\">myFile1.meh</span><span class=\"size\">1.00 KB</span>"));
					t.regex(content, RegExp("<li><a href=\"/myFile2.js\" class=\"icon icon icon-js icon-application-javascript\" title=\"myFile2.js\"><span class=\"name\">myFile2.js</span><span class=\"size\">1.00 MB</span>"));
					t.regex(content, RegExp("<li><a href=\"/myFile3.properties\" class=\"icon icon icon-properties icon-default\" title=\"myFile3.properties\"><span class=\"name\">myFile3.properties</span><span class=\"size\">1.00 GB</span>"));
					t.notRegex(content, RegExp("<li><a href=\"/.myFile4\" class=\"icon icon icon- icon-default\" title=\".myFile4\"><span class=\"name\">.myFile4</span><span class=\"size\">1.00 KB</span>"));
					resolve();
				},
			};
			const next = function(err) {
				reject(new Error(`Next callback called with error: ${err.message}`));
			};
			middleware(req, res, next);
		});
	});
});

test.serial("serveIndex no details", (t) => {
	t.plan(4);
	const serveIndexMiddleware = require("../../../../lib/middleware/serveIndex");
	const writeResource = function(writer, path, size = 0, stringContent = "abc") {
		const resource = resourceFactory.createResource({path, string: stringContent});
		resource.getStatInfo = function() {
			return {
				mtime: 0,
				size: size,
				isDirectory: function() {
					return false;
				}
			};
		};
		return writer.write(resource);
	};

	const readerWriter = resourceFactory.createAdapter({virBasePath: "/"});

	return Promise.all([
		writeResource(readerWriter, "/myFile1.meh", 1024), // KB
		writeResource(readerWriter, "/myFile2.js", 1024 * 1024), // MB
		writeResource(readerWriter, "/myFile3.properties", 1024 * 1024 * 1024), // GB
		writeResource(readerWriter, "/.myFile4", 1024), // hidden 1 KB
	]).then(() => {
		const middleware = serveIndexMiddleware({
			resources: {
				all: readerWriter
			},
			simpleIndex: true,
			showHidden: true
		});

		return new Promise((resolve, reject) => {
			const req = {
				path: "/"
			};
			const res = {
				writeHead: function(status, contentType) {
				},
				end: function(content) {
					t.regex(content, RegExp("<li><a href=\"/myFile1.meh\" class=\"icon icon icon-meh icon-default\" title=\"myFile1.meh\"><span class=\"name\">myFile1.meh</span><span class=\"size\">1.00 KB</span>"));
					t.regex(content, RegExp("<li><a href=\"/myFile2.js\" class=\"icon icon icon-js icon-application-javascript\" title=\"myFile2.js\"><span class=\"name\">myFile2.js</span><span class=\"size\">1.00 MB</span>"));
					t.regex(content, RegExp("<li><a href=\"/myFile3.properties\" class=\"icon icon icon-properties icon-default\" title=\"myFile3.properties\"><span class=\"name\">myFile3.properties</span><span class=\"size\">1.00 GB</span>"));
					t.regex(content, RegExp("<li><a href=\"/.myFile4\" class=\"icon icon icon- icon-default\" title=\".myFile4\"><span class=\"name\">.myFile4</span><span class=\"size\">1.00 KB</span>"));
					resolve();
				},
			};
			const next = function(err) {
				reject(new Error(`Next callback called with error: ${err.message}`));
			};
			middleware(req, res, next);
		});
	});
});

