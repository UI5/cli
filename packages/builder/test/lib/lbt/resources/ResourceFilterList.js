const test = require("ava");
const ResourceFilterList = require("../../../../lib/lbt/resources/ResourceFilterList");

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

