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

test("integration: buildtime is sourced from taskUtil.getBuildTime", async (t) => {
	const reader = createAdapter({
		virBasePath: "/"
	});
	const writer = createAdapter({
		virBasePath: "/"
	});
	const workspace = new DuplexCollection({reader, writer});

	// A fixed build run timestamp lets the test assert the exact formatted output: 25 September 2026,
	// 14:07 local -> "20260925-1407". Sourcing it from taskUtil.getBuildTime (not new Date()) keeps
	// every project and task in the run on one timestamp.
	const buildTime = new Date(2026, 8, 25, 14, 7, 3);

	const resource = createResource({
		path: "/test.js",
		string: "// timestamp: ${buildtime}"
	});
	await reader.write(resource);

	await replaceBuildtime({
		workspace,
		taskUtil: {getBuildTime: () => buildTime},
		options: {
			pattern: "/test.js"
		}
	});

	const transformedResource = await writer.byPath("/test.js");
	t.truthy(transformedResource, "Could find /test.js in target");
	t.is(await transformedResource.getString(), "// timestamp: 20260925-1407",
		"buildtime is formatted from the injected timestamp");
});
