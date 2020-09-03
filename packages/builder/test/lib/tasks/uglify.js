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

test("integration: uglify copyright", (t) => {
	const reader = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const writer = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const duplexCollection = new DuplexCollection({reader: reader, writer: writer});
	const content = `
/*
 * Copyright jQuery Foundation and other contributors
 */
function test(paramA) {
	var variableA = paramA;
	console.log(variableA);
}
test();`;
	const testResource = resourceFactory.createResource({
		path: "/test.js",
		string: content
	});
	const expected = `/*
 * Copyright jQuery Foundation and other contributors
 */
function test(t){var o=t;console.log(o)}test();`;

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

test("integration: uglify raw module (@ui5-bundle-raw-include)", (t) => {
	const reader = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const writer = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const duplexCollection = new DuplexCollection({reader: reader, writer: writer});
	const content = `
//@ui5-bundle-raw-include sap/ui/my/module.js
function test(paramA) {
	var variableA = paramA;
	console.log(variableA);
}
test();`;
	const testResource = resourceFactory.createResource({
		path: "/test.js",
		string: content
	});
	const expected = `//@ui5-bundle-raw-include sap/ui/my/module.js
function test(t){var o=t;console.log(o)}test();`;

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

test("integration: uglify raw module (@ui5-bundle)", (t) => {
	const reader = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const writer = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const duplexCollection = new DuplexCollection({reader: reader, writer: writer});
	const content = `
//@ui5-bundle sap/ui/my/module.js
function test(paramA) {
	var variableA = paramA;
	console.log(variableA);
}
test();`;
	const testResource = resourceFactory.createResource({
		path: "/test.js",
		string: content
	});
	const expected = `//@ui5-bundle sap/ui/my/module.js
function test(t){var o=t;console.log(o)}test();`;

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

test("integration: uglify error handling", async (t) => {
	const reader = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const writer = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const duplexCollection = new DuplexCollection({reader: reader, writer: writer});
	const content = `
this code can't be parsed!`;
	const testResource = resourceFactory.createResource({
		path: "/test.js",
		string: content
	});

	await reader.write(testResource);

	const error = await t.throwsAsync(uglify({
		workspace: duplexCollection,
		options: {
			pattern: "/test.js"
		}
	}));

	t.regex(error.message, /Uglification failed with error/, "Error should contain expected message");
	t.regex(error.message, /test\.js/, "Error should contain filename");
	t.regex(error.message, /col/, "Error should contain col");
	t.regex(error.message, /pos/, "Error should contain pos");
	t.regex(error.message, /line/, "Error should contain line");
});
