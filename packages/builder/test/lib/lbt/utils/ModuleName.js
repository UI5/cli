import test from "ava";
import * as ModuleName from "../../../../lib/lbt/utils/ModuleName.js";


test("fromUI5LegacyName", (t) => {
	t.is(ModuleName.fromUI5LegacyName(""), ".js");
	t.is(ModuleName.fromUI5LegacyName("a/b"), "a/b.js");
	t.is(ModuleName.fromUI5LegacyName("a.b"), "a/b.js");
	t.is(ModuleName.fromUI5LegacyName("jquery.sap.b"), "jquery.sap.b.js");
	t.is(ModuleName.fromUI5LegacyName("jquery-b"), "jquery-b.js");
	t.is(ModuleName.fromUI5LegacyName("jquery-b", ".mjs"), "jquery-b.mjs");
	const jQuerythirdParty = "sap.ui.thirdparty.jquery.jquery-b";
	const jQuerythirdPartyExpected = "sap/ui/thirdparty/jquery/jquery-b.mjs";
	t.deepEqual(ModuleName.fromUI5LegacyName(jQuerythirdParty, ".mjs"), jQuerythirdPartyExpected,
		"replaces dots with slashes and adds .mjs ending");
});

test("toUI5LegacyName", (t) => {
	t.is(ModuleName.toUI5LegacyName(".js"), "");
	t.is(ModuleName.toUI5LegacyName("a/b.js"), "a.b");
	t.is(ModuleName.toUI5LegacyName("a/b.js"), "a.b");
	t.is(ModuleName.toUI5LegacyName("jquery.sap.b.js"), "jquery.sap.b");
	t.is(ModuleName.toUI5LegacyName("jquery-b.js"), "jquery-b");
	const error = t.throws(() => {
		ModuleName.toUI5LegacyName("jquery-b.mjs");
	});

	t.is(error.message, "can't convert a non-JS resource name jquery-b.mjs to a UI5 module name");
	const jQuerythirdParty = "sap/ui/thirdparty/jquery/jquery-b.js";
	const jQuerythirdPartyExpected = "sap.ui.thirdparty.jquery.jquery-b";
	t.deepEqual(ModuleName.toUI5LegacyName(jQuerythirdParty), jQuerythirdPartyExpected,
		"replaces slashes with dots and removes .js ending");
});

test("fromRequireJSName", (t) => {
	t.is(ModuleName.fromRequireJSName("a"), "a.js", "adds .js ending");
	t.is(ModuleName.fromRequireJSName("x/a"), "x/a.js", "adds .js ending");
});

test("toRequireJSName", (t) => {
	t.is(ModuleName.toRequireJSName("a.js"), "a", "extracts module name a");
	t.is(ModuleName.toRequireJSName("x/a.js"), "x/a", "extracts module name x/a");

	const error = t.throws(() => {
		ModuleName.toRequireJSName("a");
	});

	t.is(error.message, "can't convert a non-JS resource name a to a requireJS module name");
});

test("getDebugName", (t) => {
	t.is(ModuleName.getDebugName("a.controller.js"), "a-dbg.controller.js", "'-dbg' is added");
	t.is(ModuleName.getDebugName("a.designtime.js"), "a-dbg.designtime.js", "'-dbg' is added");
	t.is(ModuleName.getDebugName("a.fragment.js"), "a-dbg.fragment.js", "'-dbg' is added");
	t.is(ModuleName.getDebugName("a.support.js"), "a-dbg.support.js", "'-dbg' is added");
	t.is(ModuleName.getDebugName("a.view.js"), "a-dbg.view.js", "'-dbg' is added");
	t.is(ModuleName.getDebugName("a.css"), "a-dbg.css", "'-dbg' is added");
	t.falsy(ModuleName.getDebugName("a"), "non supported file ending");
	t.falsy(ModuleName.getDebugName("a.mjs"), "non supported file ending");
});

test("getNonDebugName", (t) => {
	t.is(ModuleName.getNonDebugName("a-dbg.controller.js"), "a.controller.js", "contains '-dbg'");
	t.is(ModuleName.getNonDebugName("a-dbg.designtime.js"), "a.designtime.js", "contains '-dbg'");
	t.is(ModuleName.getNonDebugName("a-dbg.fragment.js"), "a.fragment.js", "contains '-dbg'");
	t.is(ModuleName.getNonDebugName("a-dbg.support.js"), "a.support.js", "contains '-dbg'");
	t.is(ModuleName.getNonDebugName("a-dbg.view.js"), "a.view.js", "contains '-dbg'");
	t.is(ModuleName.getNonDebugName("a-dbg.css"), "a.css", "contains '-dbg'");
	t.falsy(ModuleName.getNonDebugName("a"), "does not contain '-dbg'");
	t.falsy(ModuleName.getNonDebugName("a-dbg.mjs"), "does contain '-dbg' but ending is not supported");
});

test("resolveRelativePath", (t) => {
	// paths without relative path operators
	t.is(ModuleName.resolveRelativePath("a/b/c", "c/x"), "c/x");
	t.is(ModuleName.resolveRelativePath("a/b/c.g", "c.g/x"), "c.g/x");
	t.is(ModuleName.resolveRelativePath("a/b/c.g", "gg"), "gg");
	t.falsy(ModuleName.resolveRelativePath("a"));

	// paths without relative path operators (. or ..)
	t.is(ModuleName.resolveRelativePath("a/b/c/./g", "./g/./x"), "a/b/c/./g/x");
	t.is(ModuleName.resolveRelativePath("a/b/c/:/g", "c.g/x"), "c.g/x");
	t.is(ModuleName.resolveRelativePath("a/b/c/../g", "c.g/x"), "c.g/x");
});
