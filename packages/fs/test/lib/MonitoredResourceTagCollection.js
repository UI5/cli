import test from "ava";
import MonitoredResourceTagCollection from "../../lib/MonitoredResourceTagCollection.js";
import ResourceTagCollection from "../../lib/ResourceTagCollection.js";

test("MonitoredResourceTagCollection: constructor", (t) => {
	const tagCollection = new ResourceTagCollection({
		allowedTags: ["ui5:MyTag"],
		allowedNamespaces: []
	});

	const monitored = new MonitoredResourceTagCollection(tagCollection);

	t.truthy(monitored);
	t.truthy(monitored.getTagOperations());
	t.is(monitored.getTagOperations().size, 0);
});

test("MonitoredResourceTagCollection: setTag tracks operation", (t) => {
	const tagCollection = new ResourceTagCollection({
		allowedTags: ["ui5:MyTag"],
		allowedNamespaces: []
	});

	const monitored = new MonitoredResourceTagCollection(tagCollection);
	monitored.setTag("/my/resource.js", "ui5:MyTag", "value1");

	const operations = monitored.getTagOperations();
	t.is(operations.size, 1);
	t.true(operations.has("/my/resource.js"));
	t.is(operations.get("/my/resource.js").get("ui5:MyTag"), "value1");
});

test("MonitoredResourceTagCollection: setTag with default value", (t) => {
	const tagCollection = new ResourceTagCollection({
		allowedTags: ["ui5:MyTag"],
		allowedNamespaces: []
	});

	const monitored = new MonitoredResourceTagCollection(tagCollection);
	monitored.setTag("/my/resource.js", "ui5:MyTag");

	const operations = monitored.getTagOperations();
	t.is(operations.get("/my/resource.js").get("ui5:MyTag"), true);
});

test("MonitoredResourceTagCollection: setTag multiple tags on same resource", (t) => {
	const tagCollection = new ResourceTagCollection({
		allowedTags: ["ui5:TagA", "ui5:TagB"],
		allowedNamespaces: []
	});

	const monitored = new MonitoredResourceTagCollection(tagCollection);
	monitored.setTag("/my/resource.js", "ui5:TagA", "val1");
	monitored.setTag("/my/resource.js", "ui5:TagB", "val2");

	const operations = monitored.getTagOperations();
	t.is(operations.size, 1);
	t.is(operations.get("/my/resource.js").size, 2);
	t.is(operations.get("/my/resource.js").get("ui5:TagA"), "val1");
	t.is(operations.get("/my/resource.js").get("ui5:TagB"), "val2");
});

test("MonitoredResourceTagCollection: getTag delegates to tagCollection", (t) => {
	const tagCollection = new ResourceTagCollection({
		allowedTags: ["ui5:MyTag"],
		allowedNamespaces: []
	});
	tagCollection.setTag("/my/resource.js", "ui5:MyTag", "existing");

	const monitored = new MonitoredResourceTagCollection(tagCollection);
	const value = monitored.getTag("/my/resource.js", "ui5:MyTag");

	t.is(value, "existing");
});

test("MonitoredResourceTagCollection: getAllTagsForResource reads from previous state", (t) => {
	const tagCollection = new ResourceTagCollection({
		allowedTags: ["ui5:MyTag"],
		allowedNamespaces: []
	});
	tagCollection.setTag("/my/resource.js", "ui5:MyTag", "initial");

	const monitored = new MonitoredResourceTagCollection(tagCollection);
	monitored.setTag("/my/resource.js", "ui5:MyTag", "updated");

	const tags = monitored.getAllTagsForResource("/my/resource.js");
	t.is(tags["ui5:MyTag"], "initial");
});

test("MonitoredResourceTagCollection: getAllTagsForResource returns null for unknown resource", (t) => {
	const tagCollection = new ResourceTagCollection({
		allowedTags: ["ui5:MyTag"],
		allowedNamespaces: []
	});

	const monitored = new MonitoredResourceTagCollection(tagCollection);
	const tags = monitored.getAllTagsForResource("/unknown/resource.js");

	t.is(tags, null);
});

test("MonitoredResourceTagCollection: clearTag tracks operation when resource has prior operations", (t) => {
	const tagCollection = new ResourceTagCollection({
		allowedTags: ["ui5:MyTag"],
		allowedNamespaces: []
	});

	const monitored = new MonitoredResourceTagCollection(tagCollection);
	monitored.setTag("/my/resource.js", "ui5:MyTag", "value1");
	monitored.clearTag("/my/resource.js", "ui5:MyTag");

	const operations = monitored.getTagOperations();
	t.is(operations.get("/my/resource.js").get("ui5:MyTag"), undefined);
	t.true(operations.get("/my/resource.js").has("ui5:MyTag"));
});

test("MonitoredResourceTagCollection: clearTag with no prior operations for resource", (t) => {
	const tagCollection = new ResourceTagCollection({
		allowedTags: ["ui5:MyTag"],
		allowedNamespaces: []
	});
	tagCollection.setTag("/my/resource.js", "ui5:MyTag", "value1");

	const monitored = new MonitoredResourceTagCollection(tagCollection);
	monitored.clearTag("/my/resource.js", "ui5:MyTag");

	const operations = monitored.getTagOperations();
	t.false(operations.has("/my/resource.js"));
});
