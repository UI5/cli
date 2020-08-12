const test = require("ava");
const sinon = require("sinon");

const Resource = require("../../lib/Resource");
const ResourceTagCollection = require("../../lib/ResourceTagCollection");

test.afterEach.always((t) => {
	sinon.restore();
});

test("Constructor with missing allowedTags parameter", (t) => {
	t.throws(() => {
		new ResourceTagCollection({});
	}, {
		instanceOf: Error,
		message: "Missing parameter 'allowedTags'"
	});
});

test("setTag", (t) => {
	const resource = new Resource({
		path: "/some/path"
	});
	const tagCollection = new ResourceTagCollection({
		allowedTags: ["abc:MyTag"]
	});

	const validateResourceSpy = sinon.spy(tagCollection, "_validateResource");
	const validateTagSpy = sinon.spy(tagCollection, "_validateTag");
	const validateValueSpy = sinon.spy(tagCollection, "_validateValue");

	tagCollection.setTag(resource, "abc:MyTag", "my value");

	t.deepEqual(tagCollection._pathTags, {
		"/some/path": {
			"abc:MyTag": "my value"
		}
	}, "Tag correctly stored");

	t.is(validateResourceSpy.callCount, 1, "_validateResource called once");
	t.is(validateResourceSpy.getCall(0).args[0], resource,
		"_validateResource called with correct arguments");

	t.is(validateTagSpy.callCount, 1, "_validateTag called once");
	t.is(validateTagSpy.getCall(0).args[0], "abc:MyTag",
		"_validateTag called with correct arguments");

	t.is(validateValueSpy.callCount, 1, "_validateValue called once");
	t.is(validateValueSpy.getCall(0).args[0], "my value",
		"_validateValue called with correct arguments");
});

test("setTag: Value defaults to true", (t) => {
	const resource = new Resource({
		path: "/some/path"
	});
	const tagCollection = new ResourceTagCollection({
		allowedTags: ["abc:MyTag"]
	});
	tagCollection.setTag(resource, "abc:MyTag");

	t.deepEqual(tagCollection._pathTags, {
		"/some/path": {
			"abc:MyTag": true
		}
	}, "Tag correctly stored");
});

test("getTag", (t) => {
	const resource = new Resource({
		path: "/some/path"
	});
	const tagCollection = new ResourceTagCollection({
		allowedTags: ["abc:MyTag"]
	});
	tagCollection.setTag(resource, "abc:MyTag", 123);

	const validateResourceSpy = sinon.spy(tagCollection, "_validateResource");
	const validateTagSpy = sinon.spy(tagCollection, "_validateTag");

	const value = tagCollection.getTag(resource, "abc:MyTag");

	t.is(value, 123, "Got correct tag value");

	t.is(validateResourceSpy.callCount, 1, "_validateResource called once");
	t.is(validateResourceSpy.getCall(0).args[0], resource,
		"_validateResource called with correct arguments");

	t.is(validateTagSpy.callCount, 1, "_validateTag called once");
	t.is(validateTagSpy.getCall(0).args[0], "abc:MyTag",
		"_validateTag called with correct arguments");
});

test("clearTag", (t) => {
	const resource = new Resource({
		path: "/some/path"
	});
	const tagCollection = new ResourceTagCollection({
		allowedTags: ["abc:MyTag"]
	});

	tagCollection.setTag(resource, "abc:MyTag", 123);

	const validateResourceSpy = sinon.spy(tagCollection, "_validateResource");
	const validateTagSpy = sinon.spy(tagCollection, "_validateTag");

	tagCollection.clearTag(resource, "abc:MyTag");

	t.deepEqual(tagCollection._pathTags, {
		"/some/path": {
			"abc:MyTag": undefined
		}
	}, "Tag value set to undefined");

	t.is(validateResourceSpy.callCount, 1, "_validateResource called once");
	t.is(validateResourceSpy.getCall(0).args[0], resource,
		"_validateResource called with correct arguments");

	t.is(validateTagSpy.callCount, 1, "_validateTag called once");
	t.is(validateTagSpy.getCall(0).args[0], "abc:MyTag",
		"_validateTag called with correct arguments");
});

test("_validateTag: Not in list of allowed tags", (t) => {
	const tagCollection = new ResourceTagCollection({
		allowedTags: ["abc:MyTag"]
	});
	t.throws(() => {
		tagCollection._validateTag("abc:MyOtherTag");
	}, {
		instanceOf: Error,
		message: "Invalid Tag: Not found in list of allowed tags. Allowed tags: abc:MyTag"
	});
});

test("_validateTag: Missing colon", (t) => {
	const tagCollection = new ResourceTagCollection({
		allowedTags: ["aBcMyTag"]
	});
	t.throws(() => {
		tagCollection._validateTag("aBcMyTag");
	}, {
		instanceOf: Error,
		message: "Invalid Tag: Colon required after namespace"
	});
});

test("_validateTag: Too many colons", (t) => {
	const tagCollection = new ResourceTagCollection({
		allowedTags: ["aBc:My:Tag"]
	});
	t.throws(() => {
		tagCollection._validateTag("aBc:My:Tag");
	}, {
		instanceOf: Error,
		message: "Invalid Tag: Expected exactly one colon but found 2"
	});
});

test("_validateTag: Invalid namespace with uppercase letter", (t) => {
	const tagCollection = new ResourceTagCollection({
		allowedTags: ["aBc:MyTag"]
	});
	t.throws(() => {
		tagCollection._validateTag("aBc:MyTag");
	}, {
		instanceOf: Error,
		message: "Invalid Tag: Namespace part must be alphanumeric, lowercase and start with a letter"
	});
});

test("_validateTag: Invalid namespace starting with number", (t) => {
	const tagCollection = new ResourceTagCollection({
		allowedTags: ["0abc:MyTag"]
	});
	t.throws(() => {
		tagCollection._validateTag("0abc:MyTag");
	}, {
		instanceOf: Error,
		message: "Invalid Tag: Namespace part must be alphanumeric, lowercase and start with a letter"
	});
});

test("_validateTag: Invalid namespace containing an illegal character", (t) => {
	const tagCollection = new ResourceTagCollection({
		allowedTags: ["a🦦c:MyTag"]
	});
	t.throws(() => {
		tagCollection._validateTag("a🦦c:MyTag");
	}, {
		instanceOf: Error,
		message: "Invalid Tag: Namespace part must be alphanumeric, lowercase and start with a letter"
	});
});

test("_validateTag: Invalid tag name starting with number", (t) => {
	const tagCollection = new ResourceTagCollection({
		allowedTags: ["abc:0MyTag"]
	});
	t.throws(() => {
		tagCollection._validateTag("abc:0MyTag");
	}, {
		instanceOf: Error,
		message: "Invalid Tag: Name part must be alphanumeric and start with a capital letter"
	});
});

test("_validateTag: Invalid tag name starting with lowercase letter", (t) => {
	const tagCollection = new ResourceTagCollection({
		allowedTags: ["abc:myTag"]
	});
	t.throws(() => {
		tagCollection._validateTag("abc:myTag");
	}, {
		instanceOf: Error,
		message: "Invalid Tag: Name part must be alphanumeric and start with a capital letter"
	});
});

test("_validateTag: Invalid tag name containing an illegal character", (t) => {
	const tagCollection = new ResourceTagCollection({
		allowedTags: ["abc:My/Tag"]
	});
	t.throws(() => {
		tagCollection._validateTag("abc:My/Tag");
	}, {
		instanceOf: Error,
		message: "Invalid Tag: Name part must be alphanumeric and start with a capital letter"
	});
});

test("_validateValue: Valid values", (t) => {
	const tagCollection = new ResourceTagCollection({
		allowedTags: ["abc:MyTag"]
	});
	tagCollection._validateValue("bla");
	tagCollection._validateValue("");
	tagCollection._validateValue(true);
	tagCollection._validateValue(false);
	tagCollection._validateValue(123);
	tagCollection._validateValue(0);
	tagCollection._validateValue(NaN); // Is a number 🤷
	t.pass("No exception thrown");
});

test("_validateValue: Invalid value of type object", (t) => {
	const tagCollection = new ResourceTagCollection({
		allowedTags: ["abc:MyTag"]
	});
	t.throws(() => {
		tagCollection._validateValue({foo: "bar"});
	}, {
		instanceOf: Error,
		message: "Invalid Tag Value: Must be of type string, number or boolean but is object"
	});
});

test("_validateValue: Invalid value undefined", (t) => {
	const tagCollection = new ResourceTagCollection({
		allowedTags: ["abc:MyTag"]
	});
	t.throws(() => {
		tagCollection._validateValue(undefined);
	}, {
		instanceOf: Error,
		message: "Invalid Tag Value: Must be of type string, number or boolean but is undefined"
	});
});

test("_validateValue: Invalid value null", (t) => {
	const tagCollection = new ResourceTagCollection({
		allowedTags: ["abc:MyTag"]
	});
	t.throws(() => {
		tagCollection._validateValue(null);
	}, {
		instanceOf: Error,
		message: "Invalid Tag Value: Must be of type string, number or boolean but is object"
	});
});

test("_validateResource: Empty path", (t) => {
	const tagCollection = new ResourceTagCollection({
		allowedTags: ["abc:MyTag"]
	});
	t.throws(() => {
		tagCollection._validateResource({
			getPath: () => ""
		});
	}, {
		instanceOf: Error,
		message: "Invalid Resource: Resource path must not be empty"
	});
});
