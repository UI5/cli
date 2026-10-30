import test from "ava";
import esmock from "esmock";

test("Redacts repeated home paths and the bare home outside standard home locations", async (t) => {
	const redactPaths = await esmock("../../../../../lib/middleware/helper/redactPaths.js", {
		"node:os": {homedir: () => "/srv/dev.user+[1]"},
		"node:path": {sep: "/"},
	});

	t.is(redactPaths("Home: /srv/dev.user+[1], /srv/dev.user+[1]/a.js, /srv/dev.user+[1]/b.js"),
		"Home: ~, ~/a.js, ~/b.js");
});

test("Redacts POSIX and Windows homes independently of the host OS", async (t) => {
	const redactPaths = await esmock("../../../../../lib/middleware/helper/redactPaths.js", {
		"node:os": {homedir: () => "/srv/developer"},
	});

	t.is(redactPaths("/Users/someone/a.js /home/someone/b.js /root/c.js"), "~/a.js ~/b.js ~/c.js");
	t.is(redactPaths("C:\\Users\\Some One\\a.js d:\\users\\someone\\b.js"), "~\\a.js ~\\b.js");
});

test("Redacts foreign usernames that start with the current username", async (t) => {
	const redactPaths = await esmock("../../../../../lib/middleware/helper/redactPaths.js", {
		"node:os": {homedir: () => "/Users/some"},
		"node:path": {sep: "/"},
	});

	t.is(redactPaths("/Users/some/a.js /Users/someone/b.js /Users/some"), "~/a.js ~/b.js ~");
});

test("Handles an empty home directory without changing unrelated text", async (t) => {
	const redactPaths = await esmock("../../../../../lib/middleware/helper/redactPaths.js", {
		"node:os": {homedir: () => ""},
	});

	t.is(redactPaths("Cannot load /resources/Component.js from /home/someone/project"),
		"Cannot load /resources/Component.js from ~/project");
	t.is(redactPaths(""), "");
});

test("Returns a safe placeholder when home lookup fails", async (t) => {
	const redactPaths = await esmock("../../../../../lib/middleware/helper/redactPaths.js", {
		"node:os": {
			homedir() {
				throw new Error("Home lookup failed");
			},
		},
	});

	t.is(redactPaths("Failed to build /Users/someone/project/Component.js"), "Error details unavailable");
});
