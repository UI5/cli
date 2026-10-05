import test from "ava";
import {makeStringLiteral, removeHashbang, stripBOM} from "../../../../lib/lbt/utils/stringUtils.js";

const BOM = "\uFEFF";

test("makeStringLiteral: escapes special characters", (t) => {
	t.is(makeStringLiteral("a'b"), "'a\\'b'", "single quote is escaped");
	t.is(makeStringLiteral("a\r\n\tb"), "'a\\r\\n\\tb'", "control characters are escaped");
	t.is(makeStringLiteral("a\\b"), "'a\\\\b'", "backslash is escaped");
});

test("removeHashbang: removes leading hashbang line", (t) => {
	t.is(removeHashbang("#!/usr/bin/env node\nvar a = 1;"), "\nvar a = 1;");
	t.is(removeHashbang("var a = 1;"), "var a = 1;", "content without hashbang is unchanged");
});

test("stripBOM: removes a single leading BOM", (t) => {
	t.is(stripBOM(BOM + "<mvc:View/>"), "<mvc:View/>", "leading BOM is removed");
});

test("stripBOM: leaves content without BOM unchanged", (t) => {
	t.is(stripBOM("<mvc:View/>"), "<mvc:View/>", "content without BOM is unchanged");
	t.is(stripBOM(""), "", "empty string is unchanged");
});

test("stripBOM: only removes a leading BOM, not BOMs elsewhere", (t) => {
	t.is(stripBOM("a" + BOM + "b"), "a" + BOM + "b", "non-leading BOM is preserved");
});

test("stripBOM: only removes a single BOM", (t) => {
	t.is(stripBOM(BOM + BOM + "x"), BOM + "x", "only the first BOM is removed");
});
