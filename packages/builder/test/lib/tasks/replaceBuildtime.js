const test = require("ava");

const replaceBuildtime = require("../../../lib/tasks/replaceBuildtime");
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

	const content = "// timestamp: ${buildtime}";
	const expectedPrefix = "// timestamp";
	const expectedDatePattern = /^\d{8}-\d{4}$/;

	const resource = resourceFactory.createResource({
		path: "/test.js",
		string: content
	});

	const workspace = new DuplexCollection({reader, writer});
	await reader.write(resource);
	await replaceBuildtime({
		workspace,
		options: {
			pattern: "/test.js"
		}
	});
	const transformedResource = await writer.byPath("/test.js");

	if (!transformedResource) {
		t.fail("Could not find /test.js in target");
	} else {
		const buffer = await transformedResource.getBuffer();
		const actualContent = buffer.toString();
		t.not(actualContent, content, "placeholder is overridden");

		const values = actualContent.split(": ");
		t.is(values[0], expectedPrefix, "prefix is unmodified");
		t.regex(values[1], expectedDatePattern, "date matches the given pattern");
	}
});
