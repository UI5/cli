import test from "ava";
import {enhancePatternWithExcludes} from "../../../../lib/build/definitions/_utils.js";

test("enhancePatternWithExcludes", (t) => {
	const patterns = ["/default/pattern", "!/other/pattern"];
	const excludes = ["a", "!b", "c", "!d"];

	enhancePatternWithExcludes(patterns, excludes, "/prefix/");

	t.deepEqual(patterns, [
		"/default/pattern",
		"!/other/pattern",
		"!/prefix/a",
		"/prefix/b",
		"!/prefix/c",
		"/prefix/d"
	]);
});
