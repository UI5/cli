const test = require("ava");
const ModuleName = require("../../../../lib/lbt/utils/ModuleName");


test("fromUI5LegacyName", (t) => {
	t.deepEqual(ModuleName.fromUI5LegacyName(""), ".js");
	t.deepEqual(ModuleName.fromUI5LegacyName("a/b"), "a/b.js");
	t.deepEqual(ModuleName.fromUI5LegacyName("a.b"), "a/b.js");
	t.deepEqual(ModuleName.fromUI5LegacyName("jquery.sap.b"), "jquery.sap.b.js");
	t.deepEqual(ModuleName.fromUI5LegacyName("jquery-b"), "jquery-b.js");
	t.deepEqual(ModuleName.fromUI5LegacyName("jquery-b", ".mjs"), "jquery-b.mjs");
	const jQuerythirdParty = "sap.ui.thirdparty.jquery.jquery-b";
	const jQuerythirdPartyExpected = "sap/ui/thirdparty/jquery/jquery-b.mjs";
	t.deepEqual(ModuleName.fromUI5LegacyName(jQuerythirdParty, ".mjs"), jQuerythirdPartyExpected,
		"replaces dots with slashes and adds .mjs ending");
});

test("toUI5LegacyName", (t) => {
	t.deepEqual(ModuleName.toUI5LegacyName(".js"), "");
	t.deepEqual(ModuleName.toUI5LegacyName("a/b.js"), "a.b");
	t.deepEqual(ModuleName.toUI5LegacyName("a/b.js"), "a.b");
	t.deepEqual(ModuleName.toUI5LegacyName("jquery.sap.b.js"), "jquery.sap.b");
	t.deepEqual(ModuleName.toUI5LegacyName("jquery-b.js"), "jquery-b");
	const error = t.throws(() => {
		ModuleName.toUI5LegacyName("jquery-b.mjs");
	});

	t.deepEqual(error.message, "can't convert a non-JS resource name jquery-b.mjs to a UI5 module name");
	const jQuerythirdParty = "sap/ui/thirdparty/jquery/jquery-b.js";
	const jQuerythirdPartyExpected = "sap.ui.thirdparty.jquery.jquery-b";
	t.deepEqual(ModuleName.toUI5LegacyName(jQuerythirdParty), jQuerythirdPartyExpected,
		"replaces slashes with dots and removes .js ending");
});

test("fromRequireJSName", (t) => {
	t.deepEqual(ModuleName.fromRequireJSName("a"), "a.js", "adds .js ending");
	t.deepEqual(ModuleName.fromRequireJSName("x/a"), "x/a.js", "adds .js ending");
});

test("toRequireJSName", (t) => {
	t.deepEqual(ModuleName.toRequireJSName("a.js"), "a", "extracts module name a");
	t.deepEqual(ModuleName.toRequireJSName("x/a.js"), "x/a", "extracts module name x/a");

	const error = t.throws(() => {
		ModuleName.toRequireJSName("a");
	});

	t.deepEqual(error.message, "can't convert a non-JS resource name a to a requireJS module name");
});

test("getDebugName", (t) => {
	t.deepEqual(ModuleName.getDebugName("a.controller.js"), "a-dbg.controller.js", "'-dbg' is added");
	t.deepEqual(ModuleName.getDebugName("a.designtime.js"), "a-dbg.designtime.js", "'-dbg' is added");
	t.deepEqual(ModuleName.getDebugName("a.fragment.js"), "a-dbg.fragment.js", "'-dbg' is added");
	t.deepEqual(ModuleName.getDebugName("a.support.js"), "a-dbg.support.js", "'-dbg' is added");
	t.deepEqual(ModuleName.getDebugName("a.view.js"), "a-dbg.view.js", "'-dbg' is added");
	t.deepEqual(ModuleName.getDebugName("a.css"), "a-dbg.css", "'-dbg' is added");
	t.falsy(ModuleName.getDebugName("a"), "non supported file ending");
	t.falsy(ModuleName.getDebugName("a.mjs"), "non supported file ending");
});

test("getNonDebugName", (t) => {
	t.deepEqual(ModuleName.getNonDebugName("a-dbg.controller.js"), "a.controller.js", "contains '-dbg'");
	t.deepEqual(ModuleName.getNonDebugName("a-dbg.designtime.js"), "a.designtime.js", "contains '-dbg'");
	t.deepEqual(ModuleName.getNonDebugName("a-dbg.fragment.js"), "a.fragment.js", "contains '-dbg'");
	t.deepEqual(ModuleName.getNonDebugName("a-dbg.support.js"), "a.support.js", "contains '-dbg'");
	t.deepEqual(ModuleName.getNonDebugName("a-dbg.view.js"), "a.view.js", "contains '-dbg'");
	t.deepEqual(ModuleName.getNonDebugName("a-dbg.css"), "a.css", "contains '-dbg'");
	t.falsy(ModuleName.getNonDebugName("a"), "does not contain '-dbg'");
	t.falsy(ModuleName.getNonDebugName("a-dbg.mjs"), "does contain '-dbg' but ending is not supported");
});

test("resolveRelativePath", (t) => {
	// paths without relative path operators
	t.deepEqual(ModuleName.resolveRelativePath("a/b/c", "c/x"), "c/x");
	t.deepEqual(ModuleName.resolveRelativePath("a/b/c.g", "c.g/x"), "c.g/x");
	t.deepEqual(ModuleName.resolveRelativePath("a/b/c.g", "gg"), "gg");
	t.falsy(ModuleName.resolveRelativePath("a"));

	// paths without relative path operators (. or ..)
	t.deepEqual(ModuleName.resolveRelativePath("a/b/c/./g", "./g/./x"), "a/b/c/./g/x");
	t.deepEqual(ModuleName.resolveRelativePath("a/b/c/:/g", "c.g/x"), "c.g/x");
	t.deepEqual(ModuleName.resolveRelativePath("a/b/c/../g", "c.g/x"), "c.g/x");
});
