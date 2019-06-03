const test = require("ava");
const resourceFactory = require("@ui5/fs").resourceFactory;

test.serial("Check if index for files is created", (t) => {
	t.plan(3);
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
	]).then(() => {
		const middleware = serveIndexMiddleware({
			resourceCollections: {
				combo: readerWriter
			}
		});

		return new Promise((resolve, reject) => {
			const req = {
				url: "/"
			};
			const res = {
				writeHead: function(status, contentType) {
				},
				end: function(content) {
					t.regex(content, /<td title="1024 Bytes">1\.00 KB<\/td>\s*<td><a href="\/myFile1\.meh">myFile1\.meh<\/a><\/td>\s*<td>application\/octet-stream<\/td>/);
					t.regex(content, /<td title="1048576 Bytes">1\.00 MB<\/td>\s*<td><a href="\/myFile2\.js">myFile2\.js<\/a><\/td>\s*<td>application\/javascript<\/td>/g);
					t.regex(content, /<td title="1073741824 Bytes">1\.00 GB<\/td>\s*<td><a href="\/myFile3\.properties">myFile3\.properties<\/a><\/td>\s*<td>text\/plain;charset=ISO-8859-1<\/td>/g);
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

