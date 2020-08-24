const test = require("ava");

const ResourceInfo = require("../../../../lib/lbt/resources/ResourceInfo");

test("ResourceInfo: constructor", async (t) => {
	const resourceInfo = new ResourceInfo("myName");
	t.falsy(resourceInfo.module, "module not set");
	t.falsy(resourceInfo.format, "format not set");
	t.is(resourceInfo.size, -1, "size not set");
});

test("ResourceInfo: copyFrom", async (t) => {
	// setup
	const resourceInfo = new ResourceInfo("myName");
	const origResourceInfo = new ResourceInfo("origMyName");
	origResourceInfo.i18nName = "i18nName";
	origResourceInfo.i18nLocale = "i18nLocale";
	origResourceInfo.isDebug = false;
	origResourceInfo.theme = "theme";
	origResourceInfo.merged = false;
	origResourceInfo.designtime = false;
	origResourceInfo.support = false;
	origResourceInfo.module = "module";
	origResourceInfo.required = new Set(["required"]);
	origResourceInfo.condRequired = new Set(["condRequired"]);
	origResourceInfo.included = new Set(["included"]);
	origResourceInfo.dynRequired = false;
	origResourceInfo.requiresTopLevelScope = false;
	origResourceInfo.exposedGlobalNames = new Set(["myGlobal"]);
	origResourceInfo.format = "raw";
	origResourceInfo.size = 13;

	// action
	resourceInfo.copyFrom("prefix", origResourceInfo);

	// expectation
	t.is(resourceInfo.i18nName, "i18nName", "value is copied over");
	t.is(resourceInfo.i18nLocale, "i18nLocale", "value is copied over");
	t.is(resourceInfo.isDebug, false, "value is copied over");
	t.is(resourceInfo.theme, "theme", "value is copied over");
	t.is(resourceInfo.merged, true, "value is copied over");
	t.is(resourceInfo.designtime, false, "value is copied over");
	t.is(resourceInfo.support, false, "value is copied over");
	t.is(resourceInfo.module, "module", "value is copied over");
	t.deepEqual(resourceInfo.required, new Set(["required"]), "value is copied over");
	t.deepEqual(resourceInfo.condRequired, new Set(["condRequired"]), "value is copied over");
	t.deepEqual(resourceInfo.included, new Set(["included"]), "value is copied over");
	t.is(resourceInfo.dynRequired, false, "value is copied over");
	t.is(resourceInfo.requiresTopLevelScope, false, "value is copied over");
	t.deepEqual(resourceInfo.exposedGlobalNames, new Set(["myGlobal"]), "value is copied over");
	t.is(resourceInfo.format, "raw", "value is copied over");
	t.is(resourceInfo.size, 13, "value is copied over");
});

test("ResourceInfo: toJSON", async (t) => {
	const resourceInfo = new ResourceInfo("myName");
	resourceInfo.i18nName = "i18nName";
	resourceInfo.i18nLocale = "i18nLocale";
	resourceInfo.isDebug = true;
	resourceInfo.theme = "theme";
	resourceInfo.merged = true;
	resourceInfo.designtime = true;
	resourceInfo.support = true;
	resourceInfo.module = "module";
	resourceInfo.required = new Set(["required"]);
	resourceInfo.condRequired = new Set(["condRequired"]);
	resourceInfo.included = new Set(["included"]);
	resourceInfo.dynRequired = true;
	resourceInfo.requiresTopLevelScope = true;
	resourceInfo.exposedGlobalNames = new Set(["myGlobal"]);
	resourceInfo.format = "raw";
	resourceInfo.size = 13;

	t.deepEqual(resourceInfo.toJSON(), {
		condRequired: [
			"condRequired",
		],
		designtime: true,
		dynRequired: true,
		exposedGlobalNames: [
			"myGlobal",
		],
		format: "raw",
		included: [
			"included",
		],
		isDebug: true,
		locale: "i18nLocale",
		merged: true,
		module: "module",
		name: "myName",
		raw: "i18nName",
		required: [
			"required",
		],
		requiresTopLevelScope: true,
		size: 13,
		support: true,
		theme: "theme",
	}, "json content is correct");
});
