const test = require("ava");

const ui5Builder = require("../../../");
const tasks = ui5Builder.builder.tasks;
const ui5Fs = require("@ui5/fs");
const resourceFactory = ui5Fs.resourceFactory;
const DuplexCollection = ui5Fs.DuplexCollection;

test("integration: replace version", (t) => {
	const reader = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const writer = resourceFactory.createAdapter({
		virBasePath: "/"
	});

	const content = "console.log('${version}');";
	const expected = "console.log('1.337.0');";

	const resource = resourceFactory.createResource({
		path: "/test.js",
		string: content
	});

	const workspace = new DuplexCollection({reader, writer});
	return reader.write(resource).then(() => {
		return tasks.replaceVersion({
			workspace,
			options: {
				pattern: "/test.js",
				version: "1.337.0"
			}
		}).then(() => {
			return writer.byPath("/test.js").then((resource) => {
				if (!resource) {
					t.fail("Could not find /test.js in target");
				} else {
					return resource.getBuffer();
				}
			});
		}).then((buffer) => {
			return t.deepEqual(buffer.toString(), expected);
		});
	});
});
