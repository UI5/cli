const test = require("ava");

const uglify = require("../../../lib/tasks/uglify");
const ui5Fs = require("@ui5/fs");
const resourceFactory = ui5Fs.resourceFactory;
const DuplexCollection = ui5Fs.DuplexCollection;

test("integration: uglify", (t) => {
	const reader = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const writer = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const duplexCollection = new DuplexCollection({reader: reader, writer: writer});
	const content = `
function test(paramA) {
	var variableA = paramA;
	console.log(variableA);
}
test();`;
	const testResource = resourceFactory.createResource({
		path: "/test.js",
		string: content
	});
	const expected = "function test(t){var o=t;console.log(o)}test();";

	return reader.write(testResource)
		.then(() => {
			return reader.byPath("/test.js");
		}).then(() => {
			return uglify({
				workspace: duplexCollection,
				options: {
					pattern: "/test.js"
				}
			});
		}).then(() => {
			return writer.byPath("/test.js").then((resource) => {
				if (!resource) {
					t.fail("Could not find /test.js in target locator");
				} else {
					return resource.getBuffer();
				}
			});
		}).then((buffer) => {
			return t.deepEqual(buffer.toString(), expected, "Correct content");
		});
});
