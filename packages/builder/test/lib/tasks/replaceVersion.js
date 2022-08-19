const test = require("ava");

const replaceVersion = require("../../../lib/tasks/replaceVersion");
const ui5Fs = require("@ui5/fs");
const resourceFactory = ui5Fs.resourceFactory;
const DuplexCollection = ui5Fs.DuplexCollection;

test("integration: replace version", async (t) => {
	const reader = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const writer = resourceFactory.createAdapter({
		virBasePath: "/"
	});

	const content = "console.log('${version} equals ${project.version}');";
	const expected = "console.log('1.337.0 equals 1.337.0');";

	const resource = resourceFactory.createResource({
		path: "/test.js",
		string: content
	});

	const workspace = new DuplexCollection({reader, writer});
	await reader.write(resource);
	await replaceVersion({
		workspace,
		options: {
			pattern: "/test.js",
			version: "1.337.0"
		}
	});

	const transformedResource = await writer.byPath("/test.js");
	if (!transformedResource) {
		t.fail("Could not find /test.js in target");
	} else {
		const buffer = await transformedResource.getBuffer();
		t.deepEqual(buffer.toString(), expected);
	}
});
