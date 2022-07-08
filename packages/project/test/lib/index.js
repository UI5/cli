const test = require("ava");
const index = require("../../index");

test("index.js exports all expected modules", (t) => {
	t.truthy(index.generateProjectGraph, "Module exported");

	t.truthy(index.ui5Framework.Openui5Resolver, "Module exported");
	t.truthy(index.ui5Framework.Sapui5Resolver, "Module exported");

	t.truthy(index.validation.validator, "Module exported");
	t.truthy(index.validation.ValidationError, "Module exported");

	t.truthy(index.graph.ProjectGraph, "Module exported");
	t.truthy(index.graph.projectGraphBuilder, "Module exported");
});
