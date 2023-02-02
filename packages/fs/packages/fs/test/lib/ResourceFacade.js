import test from "ava";
import sinon from "sinon";
import Resource from "../../lib/Resource.js";
import ResourceFacade from "../../lib/ResourceFacade.js";

test.afterEach.always( (t) => {
	sinon.restore();
});

test("Create instance", (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		string: "my content"
	});
	const resourceFacade = new ResourceFacade({
		path: "/my/path",
		resource
	});
	t.is(resourceFacade.getPath(), "/my/path", "Returns correct path");
	t.is(resourceFacade.getName(), "path", "Returns correct name");
	t.is(resourceFacade.getConcealedResource(), resource, "Returns correct concealed resource");
});

test("Create instance: Missing parameters", (t) => {
	t.throws(() => {
		new ResourceFacade({
			path: "/my/path",
		});
	}, {
		instanceOf: Error,
		message: "Unable to create ResourceFacade: Missing parameter 'resource'"
	});
	t.throws(() => {
		new ResourceFacade({
			resource: {},
		});
	}, {
		instanceOf: Error,
		message: "Unable to create ResourceFacade: Missing parameter 'path'"
	});
});

test("ResourceFacade #clone", async (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		string: "my content"
	});
	const resourceFacade = new ResourceFacade({
		path: "/my/path",
		resource
	});

	const clone = await resourceFacade.clone();
	t.true(clone instanceof Resource, "Cloned resource facade is an instance of Resource");
	t.is(clone.getPath(), "/my/path", "Cloned resource has path of resource facade");
});

test("ResourceFacade #setPath", (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		string: "my content"
	});
	const resourceFacade = new ResourceFacade({
		path: "/my/path",
		resource
	});

	const err = t.throws(() => {
		resourceFacade.setPath("my/other/path");
	});
	t.is(err.message, "The path of a ResourceFacade can't be changed", "Threw with expected error message");
});

test("ResourceFacade provides same public functions as Resource", (t) => {
	const resource = new Resource({
		path: "/my/path/to/resource",
		string: "my content"
	});
	const resourceFacade = new ResourceFacade({
		path: "/my/path",
		resource
	});

	const methods = Object.getOwnPropertyNames(Resource.prototype)
		.filter((p) => (!p.startsWith("_") && typeof resource[p] === "function"));

	methods.forEach((method) => {
		t.truthy(resourceFacade[method], `resourceFacade provides function #${method}`);
		if (["constructor", "getPath", "getName", "setPath", "clone"].includes(method)) {
			// special functions with separate tests
			return;
		}
		const stub = sinon.stub(resource, method);
		resourceFacade[method]("argument");
		t.is(stub.callCount, 1, `Resource#${method} stub got called once by resourceFacade#${method}`);
		stub.restore();
	});
});
