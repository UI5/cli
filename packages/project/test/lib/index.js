const test = require("ava");
const index = require("../../index");

test("index.js exports all expected modules", (t) => {
	t.truthy(index.normalizer, "Module exported");
	t.truthy(index.projectPreprocessor, "Module exported");

	t.truthy(index.ui5Framework.Openui5Resolver, "Module exported");
	t.truthy(index.ui5Framework.Sapui5Resolver, "Module exported");

	t.truthy(index.validation.validator, "Module exported");
	t.truthy(index.validation.ValidationError, "Module exported");

	t.truthy(index.translators.npm, "Module exported");
	t.truthy(index.translators.static, "Module exported");
});
