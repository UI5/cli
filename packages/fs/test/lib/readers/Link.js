import test from "ava";
import sinon from "sinon";
import Link from "../../../lib/readers/Link.js";
import ResourceFacade from "../../../lib/ResourceFacade.js";

test("_byGlob: Basic Link", async (t) => {
	const dummyResourceA = {
		getPath: () => "/resources/some/lib/FileA.js"
	};
	const dummyResourceB = {
		getPath: () => "/resources/some/lib/dir/FileB.js"
	};
	const abstractReader = {
		_byGlob: sinon.stub().resolves([dummyResourceA, dummyResourceB])
	};
	const trace = {
		collection: sinon.spy()
	};
	const readerCollection = new Link({
		reader: abstractReader,
		pathMapping: {
			linkPath: `/`,
			targetPath: `/resources/some/lib/`
		}
	});
	const options = "options";
	const resources = await readerCollection._byGlob("anyPattern", options, trace);
	t.is(resources.length, 2, "Glob returned two resources");

	t.true(resources[0] instanceof ResourceFacade, "First resource is an instance of ResourceFacade");
	t.is(resources[0].getConcealedResource(), dummyResourceA, "First resource contains dummy resource A");
	t.is(resources[0].getPath(), "/FileA.js", "First resource has correct rewritten path");

	t.true(resources[1] instanceof ResourceFacade, "Second resource is an instance of ResourceFacade");
	t.is(resources[1].getConcealedResource(), dummyResourceB, "Second resource contains dummy resource B");
	t.is(resources[1].getPath(), "/dir/FileB.js", "Second resource has correct rewritten path");

	t.is(abstractReader._byGlob.callCount, 1, "Mocked _byGlob got called once");
	t.deepEqual(abstractReader._byGlob.getCall(0).args[0], ["/resources/some/lib/anyPattern"],
		"Mocked _byGlob got called with expected patterns");
	t.is(abstractReader._byGlob.getCall(0).args[1], options,
		"Mocked _byGlob got called with expected options");
	t.is(abstractReader._byGlob.getCall(0).args[2], trace,
		"Mocked _byGlob got called with expected trace object");
});

test("_byGlob: Complex pattern", async (t) => {
	const abstractReader = {
		_byGlob: sinon.stub().resolves([])
	};
	const trace = {
		collection: sinon.spy()
	};
	const readerCollection = new Link({
		reader: abstractReader,
		pathMapping: {
			linkPath: `/`,
			targetPath: `/resources/some/lib/`
		}
	});

	const options = "options";
	const resources = await readerCollection._byGlob("{anyPattern,otherPattern}/**", options, trace);
	t.is(resources.length, 0, "Glob returned no resources");

	t.is(abstractReader._byGlob.callCount, 1, "Mocked _byGlob got called once");
	t.deepEqual(abstractReader._byGlob.getCall(0).args[0], [
		"/resources/some/lib/anyPattern/**",
		"/resources/some/lib/otherPattern/**",
	], "Mocked _byGlob got called with expected patterns");
	t.is(abstractReader._byGlob.getCall(0).args[1], options,
		"Mocked _byGlob got called with expected options");
	t.is(abstractReader._byGlob.getCall(0).args[2], trace,
		"Mocked _byGlob got called with expected trace object");
});

test("_byGlob: Request prefixed with target path", async (t) => {
	const abstractReader = {
		_byGlob: sinon.stub().resolves([])
	};
	const trace = {
		collection: sinon.spy()
	};
	const readerCollection = new Link({
		reader: abstractReader,
		pathMapping: {
			linkPath: `/my/lib/`,
			targetPath: `/some/lib/`
		}
	});
	const options = "options";
	const resources = await readerCollection._byGlob("/some/lib/dir/**", options, trace);
	t.is(resources.length, 0, "Glob returned no resources");

	t.is(abstractReader._byGlob.callCount, 1, "Mocked _byGlob got called once");
	t.deepEqual(abstractReader._byGlob.getCall(0).args[0], [
		"/some/lib/some/lib/dir/**", // TODO 3.0: Is this expected? Maybe this can lead to serious issues
	], "Mocked _byGlob got called with expected patterns");
	t.is(abstractReader._byGlob.getCall(0).args[1], options,
		"Mocked _byGlob got called with expected options");
	t.is(abstractReader._byGlob.getCall(0).args[2], trace,
		"Mocked _byGlob got called with expected trace object");
});

test("_byGlob: Request prefixed with link path", async (t) => {
	const abstractReader = {
		_byGlob: sinon.stub().resolves([])
	};
	const trace = {
		collection: sinon.spy()
	};
	const readerCollection = new Link({
		reader: abstractReader,
		pathMapping: {
			linkPath: `/my/lib/`,
			targetPath: `/some/lib/`
		}
	});
	const options = "options";
	const resources = await readerCollection._byGlob("/my/lib/dir/**", options, trace);
	t.is(resources.length, 0, "Glob returned no resources");

	t.is(abstractReader._byGlob.callCount, 1, "Mocked _byGlob got called once");
	t.deepEqual(abstractReader._byGlob.getCall(0).args[0], [
		"/some/lib/dir/**",
	], "Mocked _byGlob got called with expected patterns");
	t.is(abstractReader._byGlob.getCall(0).args[1], options,
		"Mocked _byGlob got called with expected options");
	t.is(abstractReader._byGlob.getCall(0).args[2], trace,
		"Mocked _byGlob got called with expected trace object");
});

test("_byPath: Basic Link", async (t) => {
	const dummyResource = {
		getPath: () => "/resources/some/lib/dir/File.js"
	};
	const abstractReader = {
		_byPath: sinon.stub().resolves(dummyResource)
	};
	const trace = {
		collection: sinon.spy()
	};
	const readerCollection = new Link({
		reader: abstractReader,
		pathMapping: {
			linkPath: `/`,
			targetPath: `/resources/some/lib/`
		}
	});
	const options = "options";
	const resource = await readerCollection._byPath("/dir/File.js", options, trace);

	t.true(resource instanceof ResourceFacade, "First resource is an instance of ResourceFacade");
	t.is(resource.getConcealedResource(), dummyResource, "First resource contains dummy resource A");
	t.is(resource.getPath(), "/dir/File.js", "First resource has correct rewritten path");

	t.is(abstractReader._byPath.callCount, 1, "Mocked _byPath got called once");
	t.is(abstractReader._byPath.getCall(0).args[0], "/resources/some/lib/dir/File.js",
		"Mocked _byPath got called with expected patterns");
	t.is(abstractReader._byPath.getCall(0).args[1], options,
		"Mocked _byPath got called with expected options");
	t.is(abstractReader._byPath.getCall(0).args[2], trace,
		"Mocked _byPath got called with expected trace object");
});

test("_byPath: Rewrite on same level", async (t) => {
	const dummyResource = {
		getPath: () => "/some/lib/dir/File.js"
	};
	const abstractReader = {
		_byPath: sinon.stub().resolves(dummyResource)
	};
	const trace = {
		collection: sinon.spy()
	};
	const readerCollection = new Link({
		reader: abstractReader,
		pathMapping: {
			linkPath: `/my/lib/`,
			targetPath: `/some/lib/`
		}
	});
	const options = "options";
	const resource = await readerCollection._byPath("/my/lib/dir/File.js", options, trace);

	t.true(resource instanceof ResourceFacade, "First resource is an instance of ResourceFacade");
	t.is(resource.getConcealedResource(), dummyResource, "First resource contains dummy resource A");
	t.is(resource.getPath(), "/my/lib/dir/File.js", "First resource has correct rewritten path");

	t.is(abstractReader._byPath.callCount, 1, "Mocked _byPath got called once");
	t.is(abstractReader._byPath.getCall(0).args[0], "/some/lib/dir/File.js",
		"Mocked _byPath got called with expected patterns");
	t.is(abstractReader._byPath.getCall(0).args[1], options,
		"Mocked _byPath got called with expected options");
	t.is(abstractReader._byPath.getCall(0).args[2], trace,
		"Mocked _byPath got called with expected trace object");
});

test("_byPath: No resource found", async (t) => {
	const abstractReader = {
		_byPath: sinon.stub().resolves(null)
	};
	const trace = {
		collection: sinon.spy()
	};
	const readerCollection = new Link({
		reader: abstractReader,
		pathMapping: {
			linkPath: `/`,
			targetPath: `/some/lib/`
		}
	});
	const options = "options";
	const resource = await readerCollection._byPath("/dir/File.js", options, trace);

	t.is(resource, null, "No resource returned");

	t.is(abstractReader._byPath.callCount, 1, "Mocked _byPath got called once");
	t.is(abstractReader._byPath.getCall(0).args[0], "/some/lib/dir/File.js",
		"Mocked _byPath got called with expected patterns");
	t.is(abstractReader._byPath.getCall(0).args[1], options,
		"Mocked _byPath got called with expected options");
	t.is(abstractReader._byPath.getCall(0).args[2], trace,
		"Mocked _byPath got called with expected trace object");
});

test("_byPath: Request different prefix", async (t) => {
	const abstractReader = {
		_byPath: sinon.stub()
	};
	const trace = {
		collection: sinon.spy()
	};
	const readerCollection = new Link({
		reader: abstractReader,
		pathMapping: {
			linkPath: `/my/lib/`,
			targetPath: `/some/lib/`
		}
	});
	const options = "options";
	const resource = await readerCollection._byPath("/some/lib/dir/File.js", options, trace);

	t.is(resource, null, "No resource returned");
	t.is(abstractReader._byPath.callCount, 0, "Mocked _byPath never got called");
});

test("Missing attributes", (t) => {
	const abstractReader = {};
	let err = t.throws(() => {
		new Link({
			pathMapping: {
				linkPath: `/`,
				targetPath: `/`,
			}
		});
	});
	t.is(err.message, `Missing parameter "reader"`,
		"Threw with expected error message");

	err = t.throws(() => {
		new Link({
			reader: abstractReader
		});
	});
	t.is(err.message, `Missing parameter "pathMapping"`,
		"Threw with expected error message");

	err = t.throws(() => {
		new Link({
			reader: abstractReader,
			pathMapping: {
				targetPath: `/`,
			}
		});
	});
	t.is(err.message, `Path mapping is missing attribute "linkPath"`,
		"Threw with expected error message");

	err = t.throws(() => {
		new Link({
			reader: abstractReader,
			pathMapping: {
				linkPath: `/`,
			}
		});
	});
	t.is(err.message, `Path mapping is missing attribute "targetPath"`,
		"Threw with expected error message");

	err = t.throws(() => {
		new Link({
			reader: abstractReader,
			pathMapping: {
				linkPath: `/path`,
				targetPath: `/`,
			}
		});
	});
	t.is(err.message, `Link path must end with a slash: /path`,
		"Threw with expected error message");

	err = t.throws(() => {
		new Link({
			reader: abstractReader,
			pathMapping: {
				linkPath: `/`,
				targetPath: `/path`,
			}
		});
	});
	t.is(err.message, `Target path must end with a slash: /path`,
		"Threw with expected error message");
});
