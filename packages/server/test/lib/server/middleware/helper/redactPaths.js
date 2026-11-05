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

test("Does not truncate a bare foreign username that shares the home prefix", async (t) => {
	const redactPaths = await esmock("../../../../../lib/middleware/helper/redactPaths.js", {
		"node:os": {homedir: () => "/Users/john"},
		"node:path": {sep: "/"},
	});

	// Bare paths with no trailing separator: the current user's home still redacts to ~, but a longer
	// username that merely shares the prefix must stay intact (it must not become "~ny"). Each path is on
	// its own line so the greedy "/Users/<name>/" pass does not span them.
	t.is(redactPaths("home /Users/john"), "home ~");
	t.is(redactPaths("other /Users/johnny"), "other /Users/johnny");
	t.is(redactPaths("/Users/john: failed"), "~: failed");
	t.is(redactPaths("a /Users/john\nb /Users/johnny"), "a ~\nb /Users/johnny");
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
