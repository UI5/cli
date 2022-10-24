import test from "ava";
import replaceBuildtime from "../../../lib/tasks/replaceBuildtime.js";
import {createAdapter, createResource} from "@ui5/fs/resourceFactory";
import DuplexCollection from "@ui5/fs/DuplexCollection";

test("integration: replace version", async (t) => {
	const reader = createAdapter({
		virBasePath: "/"
	});
	const writer = createAdapter({
		virBasePath: "/"
	});

	const content = "// timestamp: ${buildtime}";
	const expectedPrefix = "// timestamp";
	const expectedDatePattern = /^\d{8}-\d{4}$/;

	const resource = createResource({
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
