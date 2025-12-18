import test from "ava";
import ResourceFilterList, {negateFilters} from "../../../../lib/lbt/resources/ResourceFilterList.js";

test("single string matcher", (t) => {
	const filterList = new ResourceFilterList([
		"foo/bar.js"
	]);

	t.is(filterList.toString(), "foo/bar.js");
	t.true(filterList.matches("foo/bar.js"));
	t.falsy(filterList.matches("boo/far.js"));
	t.falsy(filterList.matches("foo/bar.json"));
	t.falsy(filterList.matches("foo/bar"));
	t.falsy(filterList.matches("bar.js"));
});

test("multiple string matchers", (t) => {
	const filterList = new ResourceFilterList([
		"foo/bar.js",
		"foo/baz.js"
	]);

	t.is(filterList.toString(), "foo/bar.js,foo/baz.js");
	t.true(filterList.matches("foo/bar.js"));
	t.true(filterList.matches("foo/baz.js"));
	t.falsy(filterList.matches("foo/fam.js"));
});

test("single prefix pattern + shortcuts", (t) => {
	["foo/**/*", "foo/", "foo/**/"].forEach( (pattern) => {
		const filterList = new ResourceFilterList([pattern]);

		t.is(filterList.toString(), pattern);
		t.true(filterList.matches("foo/bar"));
		t.true(filterList.matches("foo/bar.js"));
		t.true(filterList.matches("foo/bar.xml"));
		t.true(filterList.matches("foo/bar.any"));
		t.true(filterList.matches("foo/foo/bar"));
		t.true(filterList.matches("foo/foo/bar.js"));
		t.true(filterList.matches("foo/foo/bar.xml"));
		t.true(filterList.matches("foo/foo/bar.any"));
		t.falsy(filterList.matches("boo/far.js"));
		t.falsy(filterList.matches("foo.js"));
		t.falsy(filterList.matches("boo/foo/bar.js"), "doesn't match infix");
	});
});

test("'any' pattern + shortcuts", (t) => {
	["**/*", "**/"].forEach( (pattern) => {
		const filterList = new ResourceFilterList([pattern]);

		t.is(filterList.toString(), pattern);
		t.true(filterList.matches("bar"));
		t.true(filterList.matches("bar.js"));
		t.true(filterList.matches("bar.xml"));
		t.true(filterList.matches("bar.any"));
		t.true(filterList.matches("foo/bar"));
		t.true(filterList.matches("foo/bar.js"));
		t.true(filterList.matches("foo/bar.xml"));
		t.true(filterList.matches("foo/bar.any"));
		t.true(filterList.matches("foo/baz/bar"));
		t.true(filterList.matches("foo/baz/bar.js"));
		t.true(filterList.matches("foo/baz/bar.xml"));
		t.true(filterList.matches("foo/baz/bar.any"));
	});
});

test("single infix pattern", (t) => {
	const filterList = new ResourceFilterList([
		"foo/**/bar.js"
	]);

	t.is(filterList.toString(), "foo/**/bar.js");
	t.true(filterList.matches("foo/bar.js"));
	t.true(filterList.matches("foo/baz/bar.js"));
	t.true(filterList.matches("foo/baz/bam/bar.js"));
	t.falsy(filterList.matches("foobar/bar.js"));
});

test("single suffix pattern", (t) => {
	const filterList = new ResourceFilterList([
		"**/bar.js"
	]);

	t.is(filterList.toString(), "**/bar.js");
	t.true(filterList.matches("bar.js"));
	t.true(filterList.matches("foo/bar.js"));
	t.true(filterList.matches("foo/baz/bar.js"));
	t.true(filterList.matches("foo/baz/bam/bar.js"));
	t.falsy(filterList.matches("foobar.js"));
	t.falsy(filterList.matches("foo/baz.js"));
});

test("include and exclude", (t) => {
	const filterList = new ResourceFilterList([
		"foo/",
		"!foo/bar/*.xml"
	]);

	t.is(filterList.toString(), "foo/,!foo/bar/*.xml");
	t.true(filterList.matches("foo/bar.js"));
	t.true(filterList.matches("foo/bar.xml"));
	t.true(filterList.matches("foo/bar/baz.js"));
	t.true(filterList.matches("foo/bar/baz/bam.xml"));
	t.falsy(filterList.matches("foo/bar/baz.xml"));
});

test("exclude and include", (t) => {
	const filterList = new ResourceFilterList([
		"!foo/",
		"foo/bar/*.xml"
	]);

	t.is(filterList.toString(), "!foo/,foo/bar/*.xml");
	t.falsy(filterList.matches("foo/bar.js"));
	t.falsy(filterList.matches("foo/bar.xml"));
	t.falsy(filterList.matches("foo/bar/baz.js"));
	t.falsy(filterList.matches("foo/bar/baz/bam.xml"));
	t.true(filterList.matches("foo/bar/baz.xml"));
});

test("file types", (t) => {
	const filterList = new ResourceFilterList([
		"foo/",
		"bar.txt"
	], [
		".js",
		"xml"
	]);

	t.true(filterList.matches("foo/bar.js"));
	t.true(filterList.matches("foo/bar.xml"));
	t.falsy(filterList.matches("foo/barjs"));
	t.falsy(filterList.matches("foo/barxml"));
	t.true(filterList.matches("foo/bar/baz.js"));
	t.true(filterList.matches("foo/bar/baz.xml"));
	t.falsy(filterList.matches("bar/foo.js"));
	t.falsy(filterList.matches("bar/foo.xml"));
	t.true(filterList.matches("bar.txt"));
	t.falsy(filterList.matches("bar.js"));
	t.falsy(filterList.matches("bar.xml"));
});

test("patterns with special chars", (t) => {
	const filterList = new ResourceFilterList([
		"foo?/",
		"bar[variant]*"
	]);
	t.is(filterList.toString(), "foo?/,bar[variant]*");
	t.true(filterList.matches("foo?/bar.js"));
	t.falsy(filterList.matches("foo/bar.js"));
	t.falsy(filterList.matches("fo/bar.js"));
	t.true(filterList.matches("bar[variant].txt"));
	t.true(filterList.matches("bar[variant].js"));
	t.falsy(filterList.matches("barv.js"));
});

test("fromString", (t) => {
	const filterList = ResourceFilterList.fromString(" foo?/ , bar[variant]*");

	t.true(filterList.matches("foo?/bar.js"));
	t.falsy(filterList.matches("foo/bar.js"));
	t.falsy(filterList.matches("fo/bar.js"));
	t.true(filterList.matches("bar[variant].txt"));
	t.true(filterList.matches("bar[variant].js"));
	t.falsy(filterList.matches("barv.js"));
});

test("fromString: undefined", (t) => {
	const filterList = ResourceFilterList.fromString();

	t.true(filterList.matches("foo/bar.js"));
	t.true(filterList.matches("bar.js"));
	t.true(filterList.matches("foobar"));
});

test("fromString: empty", (t) => {
	const filterList = ResourceFilterList.fromString("");

	t.true(filterList.matches("foo/bar.js"));
	t.true(filterList.matches("bar.js"));
	t.true(filterList.matches("foobar"));
});


test("negateFilters", (t) => {
	const res = negateFilters([
		"pattern",
		"+pattern",
		"!pattern",
		"-pattern",
		" pattern",
		"!!",
		"++",
		"--",
		" ",
		"+!",
		"!+",
		"+-",
		"! ",
		undefined
	]);

	t.deepEqual(res, [
		"!pattern",
		"!pattern",
		"+pattern",
		"+pattern",
		"! pattern",
		"+!", // "!!"
		"!+", // "++"
		"+-", // "--"
		"! ", // " "
		"!!", // "+!"
		"++", // "!+"
		"!-", // "+-"
		"+ ", // "! "
		"!undefined"
	], "Patterns negated as expected");
});

test("error handling", (t) => {
	const filterList = new ResourceFilterList();

	// these are accepted
	filterList.addFilters(null);
	filterList.addFilters(undefined);
	filterList.addFilters([]);
	// these are not
	t.throws(() => {
		filterList.addFilters("test");
	});
	t.throws(() => {
		filterList.addFilters({});
	});
});

// Advanced sequential filter tests for glob conversion reference

test("sequential ordering: simple re-inclusion after exclusion", (t) => {
	const filterList = new ResourceFilterList([
		"!foo/",
		"foo/bar/"
	]);

	t.is(filterList.toString(), "!foo/,foo/bar/");
	// Everything from foo is excluded first, then foo/bar is re-included
	t.falsy(filterList.matches("foo/test.js"));
	t.falsy(filterList.matches("foo/baz.js"));
	t.true(filterList.matches("foo/bar/test.js"));
	t.true(filterList.matches("foo/bar/baz/test.js"));
	t.falsy(filterList.matches("foo/other/test.js"));
});

test("sequential ordering: complex nested re-inclusion", (t) => {
	const filterList = new ResourceFilterList([
		"foo/",
		"!foo/bar/",
		"foo/bar/critical.js"
	]);

	t.is(filterList.toString(), "foo/,!foo/bar/,foo/bar/critical.js");
	// Include all of foo, exclude foo/bar, but re-include the critical file
	t.true(filterList.matches("foo/test.js"));
	t.true(filterList.matches("foo/baz/test.js"));
	t.falsy(filterList.matches("foo/bar/test.js"));
	t.falsy(filterList.matches("foo/bar/other.js"));
	t.true(filterList.matches("foo/bar/critical.js"));
	t.falsy(filterList.matches("foo/bar/baz/test.js"));
});

test("sequential ordering: multiple exclusion-inclusion cycles", (t) => {
	const filterList = new ResourceFilterList([
		"app/",
		"!app/test/",
		"app/test/integration/",
		"!app/test/integration/mock/"
	]);

	t.is(filterList.toString(), "app/,!app/test/,app/test/integration/,!app/test/integration/mock/");
	// Include app, exclude test, re-include integration, exclude mock
	t.true(filterList.matches("app/Component.js"));
	t.falsy(filterList.matches("app/test/unit/test.js"));
	t.true(filterList.matches("app/test/integration/journey.js"));
	t.falsy(filterList.matches("app/test/integration/mock/data.json"));
});

test("sequential ordering: exclusion followed by broader inclusion", (t) => {
	const filterList = new ResourceFilterList([
		"!sap/ui/core/library.js",
		"sap/ui/core/"
	]);

	t.is(filterList.toString(), "!sap/ui/core/library.js,sap/ui/core/");
	// Initially exclude library.js, then include all of sap/ui/core
	// The broader inclusion should override the specific exclusion
	t.true(filterList.matches("sap/ui/core/library.js"));
	t.true(filterList.matches("sap/ui/core/Core.js"));
	t.true(filterList.matches("sap/ui/core/Element.js"));
});

test("sequential ordering: inclusion followed by broader exclusion", (t) => {
	const filterList = new ResourceFilterList([
		"sap/ui/core/library.js",
		"!sap/ui/core/"
	]);

	t.is(filterList.toString(), "sap/ui/core/library.js,!sap/ui/core/");
	// Initially include library.js, then exclude all of sap/ui/core
	// The broader exclusion should override the specific inclusion
	t.falsy(filterList.matches("sap/ui/core/library.js"));
	t.falsy(filterList.matches("sap/ui/core/Core.js"));
	t.falsy(filterList.matches("sap/ui/core/Element.js"));
});

test("matchByDefault behavior: empty filter list", (t) => {
	const filterList = new ResourceFilterList([]);

	t.is(filterList.matchByDefault, true, "matchByDefault should be true for empty list");
	t.true(filterList.matches("foo/bar.js"));
	t.true(filterList.matches("anything.xml"));
});

test("matchByDefault behavior: only includes", (t) => {
	const filterList = new ResourceFilterList([
		"foo/",
		"bar/"
	]);

	// When any include exists, matchByDefault becomes false (match nothing by default)
	t.is(filterList.matchByDefault, false, "matchByDefault should be false when includes exist");
	t.true(filterList.matches("foo/test.js"));
	t.true(filterList.matches("bar/test.js"));
	t.falsy(filterList.matches("baz/test.js"), "Non-matching resources should not match");
});

test("matchByDefault behavior: only excludes", (t) => {
	const filterList = new ResourceFilterList([
		"!foo/",
		"!bar/"
	]);

	// When only excludes exist, matchByDefault stays true (match everything by default)
	t.is(filterList.matchByDefault, true, "matchByDefault should be true when only excludes");
	t.falsy(filterList.matches("foo/test.js"));
	t.falsy(filterList.matches("bar/test.js"));
	t.true(filterList.matches("baz/test.js"), "Non-matching resources should match");
});

test("matchByDefault behavior: mixed includes and excludes", (t) => {
	const filterList = new ResourceFilterList([
		"foo/",
		"!bar/"
	]);

	// When any include exists, matchByDefault becomes false
	t.is(filterList.matchByDefault, false, "matchByDefault should be false when any include exists");
	t.true(filterList.matches("foo/test.js"));
	t.falsy(filterList.matches("bar/test.js"));
	t.falsy(filterList.matches("baz/test.js"));
});

test("initialMatch parameter override", (t) => {
	const filterList = new ResourceFilterList([
		"foo/"
	]);

	// Normal behavior
	t.true(filterList.matches("foo/test.js"));
	t.falsy(filterList.matches("bar/test.js"));

	// Override with initialMatch=true
	t.true(filterList.matches("foo/test.js", true));
	t.true(filterList.matches("bar/test.js", true), "initialMatch=true should allow non-matching");

	// Override with initialMatch=false
	t.true(filterList.matches("foo/test.js", false), "Filter should still match");
	t.falsy(filterList.matches("bar/test.js", false));
});

test("complex pattern with file types and sequential ordering", (t) => {
	const filterList = new ResourceFilterList([
		"app/",
		"!app/test/",
		"app/test/integration.test.js"
	], [".js", ".xml"]);

	// File type filtering + sequential ordering
	t.true(filterList.matches("app/Component.js"));
	t.true(filterList.matches("app/view/Main.xml"));
	t.falsy(filterList.matches("app/Component.json"), "Non-matching file type");
	t.falsy(filterList.matches("app/test/unit.test.js"));
	t.true(filterList.matches("app/test/integration.test.js"), "Re-included specific file");
	t.falsy(filterList.matches("app/test/integration.test.json"), "File type doesn't match");
});

test("wildcard patterns with sequential ordering", (t) => {
	const filterList = new ResourceFilterList([
		"sap/**/*.js",
		"!sap/ui/core/*.js",
		"sap/ui/core/Core.js"
	]);

	t.true(filterList.matches("sap/ui/base/Object.js"));
	t.true(filterList.matches("sap/m/Button.js"));
	t.falsy(filterList.matches("sap/ui/core/Element.js"));
	t.true(filterList.matches("sap/ui/core/Core.js"), "Re-included after exclusion");
	t.true(filterList.matches("sap/ui/core/util/Export.js"), "Nested path should match");
});

test("prefix notation consistency", (t) => {
	// Test that +, -, and ! prefixes work consistently
	const includePlus = new ResourceFilterList(["+foo/"]);
	const includeNone = new ResourceFilterList(["foo/"]);
	const excludeMinus = new ResourceFilterList(["-foo/"]);
	const excludeBang = new ResourceFilterList(["!foo/"]);

	// + and no prefix should behave identically
	t.is(includePlus.matches("foo/test.js"), includeNone.matches("foo/test.js"));
	t.is(includePlus.matches("bar/test.js"), includeNone.matches("bar/test.js"));

	// - and ! should behave identically
	t.is(excludeMinus.matches("foo/test.js"), excludeBang.matches("foo/test.js"));
	t.is(excludeMinus.matches("bar/test.js"), excludeBang.matches("bar/test.js"));
});

test("edge case: double asterisk patterns", (t) => {
	const filterList = new ResourceFilterList([
		"**/test/**/*.js"
	]);

	t.true(filterList.matches("test/unit.js"));
	t.true(filterList.matches("app/test/unit.js"));
	t.true(filterList.matches("app/test/integration/journey.js"));
	t.falsy(filterList.matches("app/unit.js"), "test not in path");
	t.falsy(filterList.matches("test/unit.xml"), "wrong extension");
});

test("edge case: trailing slash normalization", (t) => {
	// All these should behave identically
	const patterns = ["foo/", "foo/**/", "foo/**/*"];
	const resources = [
		"foo/bar.js",
		"foo/baz/test.js",
		"foo/baz/deep/test.js"
	];

	patterns.forEach((pattern) => {
		const filterList = new ResourceFilterList([pattern]);
		resources.forEach((resource) => {
			t.true(filterList.matches(resource),
				`Pattern ${pattern} should match ${resource}`);
		});
		t.falsy(filterList.matches("foo.js"), `Pattern ${pattern} should not match foo.js`);
	});
});

// toGlobPatterns() tests

test("toGlobPatterns: simple includes only", (t) => {
	const filterList = new ResourceFilterList([
		"foo/",
		"bar/"
	]);

	const result = filterList.toGlobPatterns();

	t.deepEqual(result.positivePatterns, ["foo/", "bar/"]);
	t.deepEqual(result.negativePatterns, []);
	t.is(result.requiresPostFiltering, false, "Simple includes don't need post-filtering");
});

test("toGlobPatterns: simple excludes only", (t) => {
	const filterList = new ResourceFilterList([
		"!foo/",
		"!bar/"
	]);

	const result = filterList.toGlobPatterns();

	t.deepEqual(result.positivePatterns, ["**/*"], "matchByDefault=true requires wildcard");
	t.deepEqual(result.negativePatterns, ["foo/", "bar/"]);
	t.is(result.requiresPostFiltering, false, "Simple excludes don't need post-filtering");
});

test("toGlobPatterns: include then exclude (no re-inclusion)", (t) => {
	const filterList = new ResourceFilterList([
		"foo/",
		"!foo/bar/"
	]);

	const result = filterList.toGlobPatterns();

	t.deepEqual(result.positivePatterns, ["foo/"]);
	t.deepEqual(result.negativePatterns, ["foo/bar/"]);
	t.is(result.requiresPostFiltering, false, "No re-inclusion, standard glob can handle");
});

test("toGlobPatterns: exclude then include (re-inclusion scenario)", (t) => {
	const filterList = new ResourceFilterList([
		"!foo/",
		"foo/bar/"
	]);

	// matchByDefault is false because we have an include (foo/bar/)
	t.is(filterList.matchByDefault, false);

	const result = filterList.toGlobPatterns();

	// No wildcard needed because matchByDefault is false
	t.deepEqual(result.positivePatterns, ["foo/bar/"]);
	t.deepEqual(result.negativePatterns, ["foo/"]);
	t.is(result.requiresPostFiltering, true, "Re-inclusion requires post-filtering");
});

test("toGlobPatterns: complex re-inclusion scenario", (t) => {
	const filterList = new ResourceFilterList([
		"foo/",
		"!foo/bar/",
		"foo/bar/critical.js"
	]);

	const result = filterList.toGlobPatterns();

	t.deepEqual(result.positivePatterns, ["foo/", "foo/bar/critical.js"]);
	t.deepEqual(result.negativePatterns, ["foo/bar/"]);
	t.is(result.requiresPostFiltering, true, "Complex re-inclusion requires post-filtering");
});

test("toGlobPatterns: multiple exclusion-inclusion cycles", (t) => {
	const filterList = new ResourceFilterList([
		"app/",
		"!app/test/",
		"app/test/integration/",
		"!app/test/integration/mock/"
	]);

	const result = filterList.toGlobPatterns();

	t.deepEqual(result.positivePatterns, ["app/", "app/test/integration/"]);
	t.deepEqual(result.negativePatterns, ["app/test/", "app/test/integration/mock/"]);
	t.is(result.requiresPostFiltering, true, "Multiple cycles require post-filtering");
});

test("toGlobPatterns: wildcard patterns", (t) => {
	const filterList = new ResourceFilterList([
		"sap/**/*.js",
		"!sap/ui/core/*.js",
		"sap/ui/core/Core.js"
	]);

	const result = filterList.toGlobPatterns();

	t.deepEqual(result.positivePatterns, ["sap/**/*.js", "sap/ui/core/Core.js"]);
	t.deepEqual(result.negativePatterns, ["sap/ui/core/*.js"]);
	t.is(result.requiresPostFiltering, true, "Re-inclusion after wildcard exclusion");
});

test("toGlobPatterns: exact file matches", (t) => {
	const filterList = new ResourceFilterList([
		"foo/bar.js",
		"foo/baz.js"
	]);

	const result = filterList.toGlobPatterns();

	t.deepEqual(result.positivePatterns, ["foo/bar.js", "foo/baz.js"]);
	t.deepEqual(result.negativePatterns, []);
	t.is(result.requiresPostFiltering, false);
});

test("toGlobPatterns: empty filter list", (t) => {
	const filterList = new ResourceFilterList([]);

	const result = filterList.toGlobPatterns();

	t.deepEqual(result.positivePatterns, ["**/*"], "Empty list with matchByDefault=true");
	t.deepEqual(result.negativePatterns, []);
	t.is(result.requiresPostFiltering, false);
});

test("toGlobPatterns: prefix markers removed", (t) => {
	const filterList = new ResourceFilterList([
		"+foo/",
		"-bar/",
		"!baz/"
	]);

	// matchByDefault is false because we have an include (+foo/)
	t.is(filterList.matchByDefault, false);

	const result = filterList.toGlobPatterns();

	// Prefixes should be stripped from patterns
	// No wildcard because matchByDefault is false
	t.deepEqual(result.positivePatterns, ["foo/"]);
	t.deepEqual(result.negativePatterns, ["bar/", "baz/"]);
	// Include comes before excludes, so no re-inclusion scenario
	t.is(result.requiresPostFiltering, false);
});

