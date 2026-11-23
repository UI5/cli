import test from "ava";
import sinon from "sinon";
import path from "node:path";
import os from "node:os";
import {mkdtemp, rm} from "node:fs/promises";
import FileSystem from "../../../lib/adapters/FileSystem.js";
import Memory from "../../../lib/adapters/Memory.js";
import Link from "../../../lib/readers/Link.js";
import Resource from "../../../lib/Resource.js";
import ResourceFacade from "../../../lib/ResourceFacade.js";
import {createFlatReader} from "../../../lib/resourceFactory.js";

for (const requestPath of [
	"/app/../other/secret.js",
	"/app/dir/../../other/secret.js",
	"/app/../../resources/other/secret.js",
	"/app/../application/secret.js",
	"/app/..",
	"/application/secret.js"
]) {
	test(`byPath: Reject ${requestPath} before calling the backing reader`, async (t) => {
		const reader = {_byPath: sinon.stub().resolves(null)};
		const link = new Link({
			reader,
			pathMapping: {linkPath: "/app/", targetPath: "/resources/app/"}
		});

		t.is(await link.byPath(requestPath), null);
		t.true(reader._byPath.notCalled);
	});
}

test("byPath: Normalize the path before calling the backing reader", async (t) => {
	const resource = new Resource({path: "/resources/app/File.js"});
	const reader = {_byPath: sinon.stub().resolves(resource)};
	const link = new Link({
		reader,
		pathMapping: {linkPath: "/app/", targetPath: "/resources/app/"}
	});
	const facade = await link.byPath("/app/dir/.././File.js");

	t.is(reader._byPath.firstCall.args[0], "/resources/app/File.js");
	t.is(facade.getPath(), "/app/File.js");
	t.is(facade.getConcealedResource(), resource);
});

for (const {title, targetPath, requestPath, resourcePath, facadePath} of [{
	title: "Target directory",
	targetPath: "/resources/app/",
	requestPath: "/app/dir/..",
	resourcePath: "/resources/app",
	facadePath: "/app/"
}, {
	title: "Root target",
	targetPath: "/",
	requestPath: "/app/File.js",
	resourcePath: "/File.js",
	facadePath: "/app/File.js"
}, {
	title: "Normalized target path",
	targetPath: "/resources/other/../app/",
	requestPath: "/app/File.js",
	resourcePath: "/resources/app/File.js",
	facadePath: "/app/File.js"
}, {
	title: "Normalized resource path",
	targetPath: "/resources/app/",
	requestPath: "/app/File.js",
	resourcePath: "/resources/app/dir/../File.js",
	facadePath: "/app/File.js"
}]) {
	test(`byPath and byGlob: ${title}`, async (t) => {
		const resource = {getPath: () => resourcePath};
		const reader = {
			_byPath: sinon.stub().resolves(resource),
			_byGlob: sinon.stub().resolves([resource])
		};
		const link = new Link({reader, pathMapping: {linkPath: "/app/", targetPath}});

		const facade = await link.byPath(requestPath, {nodir: false});
		t.is(facade.getPath(), facadePath);
		t.is(facade.getConcealedResource(), resource);
		const resources = await link.byGlob(requestPath, {nodir: false});
		t.deepEqual(resources.map((resource) => resource.getPath()), [facadePath]);
		t.is(resources[0].getConcealedResource(), resource);
	});
}

for (const resourcePath of [
	"/resources/other/secret.js",
	"/resources/application/secret.js",
	"/resources/app/../other/secret.js",
	"/resources/app/.."
]) {
	test(`Reject a backing reader resource at ${resourcePath}`, async (t) => {
		const outsideResource = {getPath: () => resourcePath};
		const insideResource = new Resource({path: "/resources/app/File.js"});
		const reader = {
			_byPath: sinon.stub().resolves(outsideResource),
			_byGlob: sinon.stub().resolves([outsideResource, insideResource])
		};
		const link = new Link({
			reader,
			pathMapping: {linkPath: "/app/", targetPath: "/resources/app/"}
		});

		t.is(await link.byPath("/app/File.js"), null);
		const resources = await link.byGlob("/app/**");
		t.is(resources.length, 1);
		t.is(resources[0].getPath(), "/app/File.js");
		t.is(resources[0].getConcealedResource(), insideResource);
	});
}

for (const adapter of ["Memory", "FileSystem"]) {
	for (const linkPath of ["/app/", "/"]) {
		const readerType = linkPath === "/" ? "createFlatReader" : "Link";
		test(`${readerType}: Contain ${adapter} reads within the target subtree`, async (t) => {
			let reader;
			if (adapter === "FileSystem") {
				const fsBasePath = await mkdtemp(path.join(os.tmpdir(), "ui5-fs-link-"));
				t.teardown(() => rm(fsBasePath, {recursive: true, force: true}));
				reader = new FileSystem({virBasePath: "/", fsBasePath});
			} else {
				reader = new Memory({virBasePath: "/"});
			}
			for (const resourcePath of [
				"/resources/app/File.js",
				"/resources/app/dir/Nested.js",
				"/resources/other/secret.js",
				"/resources/application/secret.js"
			]) {
				await reader.write(new Resource({path: resourcePath, string: resourcePath}));
			}
			const link = linkPath === "/" ? createFlatReader({reader, namespace: "app"}) : new Link({
				reader,
				pathMapping: {linkPath, targetPath: "/resources/app/"}
			});

			for (const requestPath of [
				"../other/secret.js",
				"dir/../../other/secret.js",
				"../../resources/other/secret.js",
				"../application/secret.js"
			]) {
				t.is(await link.byPath(linkPath + requestPath), null, requestPath);
				t.deepEqual(await link.byGlob(linkPath + requestPath), [], requestPath);
			}

			for (const requestPath of ["File.js", "./File.js", "dir/../File.js", "dir//../File.js"]) {
				const resource = await link.byPath(linkPath + requestPath);
				t.true(resource instanceof ResourceFacade);
				t.is(resource.getPath(), linkPath + "File.js");
				t.is(resource.getConcealedResource().getPath(), "/resources/app/File.js");
				t.is(await resource.getString(), "/resources/app/File.js");
				const resources = await link.byGlob(linkPath + requestPath);
				t.deepEqual(resources.map((resource) => resource.getPath()), [linkPath + "File.js"]);
			}

			t.is(await link.byPath(linkPath + "missing.js"), null);
			const resources = await link.byGlob(linkPath + "**/*.js");
			t.deepEqual(resources.map((resource) => resource.getPath()).sort(), [
				linkPath + "File.js", linkPath + "dir/Nested.js"
			]);
		});
	}
}

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
		"/some/lib/some/lib/dir/**", // Weird, but expected. We prefix everything with the targetPath
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
