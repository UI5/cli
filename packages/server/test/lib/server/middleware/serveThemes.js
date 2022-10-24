import test from "ava";

import sinon from "sinon";
import esmock from "esmock";

import {ThemeBuilder} from "@ui5/builder/processors/themeBuilder";
import MiddlewareUtil from "../../../../lib/middleware/MiddlewareUtil.js";

const failOnNext = function(t, reject) {
	return function(err) {
		if (err) {
			t.fail("Unexpected error passed to next function: " + err);
		} else {
			t.fail("Unexpected call of next function");
		}
		reject();
	};
};

const createResources = function() {
	return {
		// Input
		"library.source.less": {},

		// Default result
		"library.css": {
			getBuffer: sinon.stub().resolves("/* library.css */"),
			getPath: sinon.stub().returns("/resources/sap/ui/test/themes/base/library.css")
		},
		"library-RTL.css": {
			getBuffer: sinon.stub().resolves("/* library-RTL.css */"),
			getPath: sinon.stub().returns("/resources/sap/ui/test/themes/base/library-RTL.css")
		},
		"library-parameters.json": {
			getBuffer: sinon.stub().resolves("/* library-parameters.json */"),
			getPath: sinon.stub().returns("/resources/sap/ui/test/themes/base/library-parameters.json")
		},

		// CSS Variables result
		"css_variables.source.less": {
			getBuffer: sinon.stub().resolves(`/* css_variables.source.less */`),
			getPath: sinon.stub().returns("/resources/sap/ui/test/themes/base/css_variables.source.less")
		},
		"css_variables.css": {
			getBuffer: sinon.stub().resolves(`/* css_variables.css */`),
			getPath: sinon.stub().returns("/resources/sap/ui/test/themes/base/css_variables.css")
		},
		"library_skeleton.css": {
			getBuffer: sinon.stub().resolves(`/* library_skeleton.css */`),
			getPath: sinon.stub().returns("/resources/sap/ui/test/themes/base/library_skeleton.css")
		},
		"library_skeleton-RTL.css": {
			getBuffer: sinon.stub().resolves(`/* library_skeleton-RTL.css */`),
			getPath: sinon.stub().returns("/resources/sap/ui/test/themes/base/library_skeleton-RTL.css")
		}
	};
};

const stubThemeBuild = function(resources) {
	const build = sinon.stub(ThemeBuilder.prototype, "build");
	build.rejects(new Error("File not found!"));
	build.withArgs([resources["library.source.less"]], {}).resolves([
		resources["library.css"],
		resources["library-RTL.css"],
		resources["library-parameters.json"]
	]);
	build.withArgs([resources["library.source.less"]], {cssVariables: true}).resolves([
		resources["library.css"],
		resources["library-RTL.css"],
		resources["library-parameters.json"],
		resources["css_variables.source.less"],
		resources["css_variables.css"],
		resources["library_skeleton.css"],
		resources["library_skeleton-RTL.css"]
	]);
	return build;
};

const verifyThemeRequest = function(t, filename) {
	const resources = createResources();

	stubThemeBuild(resources);

	const {middleware, byPath} = t.context;
	byPath.withArgs("/resources/sap/ui/test/themes/base/library.source.less")
		.resolves(resources["library.source.less"]);

	const req = {
		url: "/resources/sap/ui/test/themes/base/" + filename,
		headers: {}
	};

	return new Promise((resolve, reject) => {
		const res = {
			setHeader: sinon.stub(),
			getHeader: sinon.stub(),
			end: function(responseText) {
				t.is(responseText, `/* ${filename} */`);
				if (filename.endsWith(".css")) {
					t.deepEqual(res.setHeader.getCall(0).args, ["Content-Type", "text/css; charset=UTF-8"]);
				} else if (filename.endsWith(".less")) {
					t.deepEqual(res.setHeader.getCall(0).args, ["Content-Type", "text/less; charset=UTF-8"]);
				} else if (filename.endsWith(".json")) {
					t.deepEqual(res.setHeader.getCall(0).args, ["Content-Type", "application/json; charset=UTF-8"]);
				} else {
					t.fail("Invalid file extension provided to 'verifyThemeRequest'");
				}
				resolve();
			}
		};

		middleware(req, res, failOnNext(t, reject));
	});
};

test.beforeEach(async (t) => {
	t.context.etag = sinon.stub();
	t.context.fresh = sinon.stub();

	t.context.serveThemes = await esmock("../../../../lib/middleware/serveThemes.js", {
		"etag": t.context.etag,
		"fresh": t.context.fresh
	});

	const resources = {
		all: {
			byPath: sinon.stub()
		}
	};
	t.context.byPath = resources.all.byPath;

	t.context.middleware = t.context.serveThemes({
		middlewareUtil: new MiddlewareUtil(),
		resources
	});
});

test.afterEach.always((t) => {
	sinon.restore();
});

test.serial("Serving library.css", (t) => {
	return verifyThemeRequest(t, "library.css");
});

test.serial("Serving library-RTL.css", (t) => {
	return verifyThemeRequest(t, "library-RTL.css");
});

test.serial("Serving library-parameters.json", (t) => {
	return verifyThemeRequest(t, "library-parameters.json");
});

test.serial("Serving css_variables.source.less", (t) => {
	return verifyThemeRequest(t, "css_variables.source.less");
});

test.serial("Serving css_variables.css", (t) => {
	return verifyThemeRequest(t, "css_variables.css");
});

test.serial("Serving library_skeleton.css", (t) => {
	return verifyThemeRequest(t, "library_skeleton.css");
});

test.serial("Serving library_skeleton-RTL.css", (t) => {
	return verifyThemeRequest(t, "library_skeleton-RTL.css");
});

test.serial("Clear cache to rebuild themes when CSS Variables file is requested", (t) => {
	const resources = createResources();

	const build = stubThemeBuild(resources);
	const clearCache = sinon.stub(ThemeBuilder.prototype, "clearCache");

	const {middleware, byPath} = t.context;
	byPath.withArgs("/resources/sap/ui/test/themes/base/library.source.less")
		.resolves(resources["library.source.less"]);

	return new Promise((resolve, reject) => {
		function firstRequest() {
			const req = {
				url: "/resources/sap/ui/test/themes/base/library.css",
				headers: {}
			};

			const res = {
				setHeader: sinon.stub(),
				getHeader: sinon.stub(),
				end: function() {
					t.deepEqual(build.getCall(0).args, [[resources["library.source.less"]], {}],
						"Build should be called without options");

					t.false(clearCache.called, "Clear cache should not be called");

					// Trigger next request
					secondRequest();
				}
			};

			middleware(req, res, failOnNext(t));
		}

		function secondRequest() {
			const req = {
				url: "/resources/sap/ui/test/themes/base/css_variables.css",
				headers: {}
			};

			const res = {
				setHeader: sinon.stub(),
				getHeader: sinon.stub(),
				end: function() {
					t.deepEqual(build.getCall(1).args, [[resources["library.source.less"]], {cssVariables: true}],
						"Build should be called with cssVariables option");

					t.true(clearCache.called, "Clear cache should be called");

					resolve();
				}
			};

			middleware(req, res, failOnNext(t, reject));
		}

		firstRequest();
	});
});

test.serial("Clear cache only once after enabling CSS Variables", (t) => {
	const resources = createResources();

	const build = stubThemeBuild(resources);
	const clearCache = sinon.stub(ThemeBuilder.prototype, "clearCache");

	const {middleware, byPath} = t.context;
	byPath.withArgs("/resources/sap/ui/test/themes/base/library.source.less")
		.resolves(resources["library.source.less"]);

	return new Promise((resolve, reject) => {
		function firstRequest() {
			const req = {
				url: "/resources/sap/ui/test/themes/base/css_variables.css",
				headers: {}
			};

			const res = {
				setHeader: sinon.stub(),
				getHeader: sinon.stub(),
				end: function() {
					t.deepEqual(build.getCall(0).args, [[resources["library.source.less"]], {cssVariables: true}],
						"Build should be called with cssVariables option");

					t.true(clearCache.calledOnce, "Clear cache should be called once");

					// Trigger next request
					secondRequest();
				}
			};

			middleware(req, res, failOnNext(t, reject));
		}

		function secondRequest() {
			const req = {
				url: "/resources/sap/ui/test/themes/base/library_skeleton.css",
				headers: {}
			};

			const res = {
				setHeader: sinon.stub(),
				getHeader: sinon.stub(),
				end: function() {
					t.deepEqual(build.getCall(1).args, [[resources["library.source.less"]], {cssVariables: true}],
						"Build should be called with cssVariables option");

					t.true(clearCache.calledOnce, "Clear cache should still only be called once");

					resolve();
				}
			};

			middleware(req, res, failOnNext(t, reject));
		}

		firstRequest();
	});
});

test.serial("Do not handle non-theme requests", (t) => {
	const {middleware} = t.context;

	const req = {
		url: "/resources/sap/ui/test/test.js"
	};

	const res = {};

	return new Promise((resolve) => {
		middleware(req, res, function() {
			t.pass("Next middleware is called for non-theme requests");
			resolve();
		});
	});
});

test.serial("Do not handle requests without an existing library.source.less file", (t) => {
	const resources = createResources();

	stubThemeBuild(resources);

	const {middleware, byPath} = t.context;
	byPath.withArgs("/resources/sap/ui/test/themes/base/library.source.less").resolves(null);

	const req = {
		url: "/resources/sap/ui/test/themes/base/library.css",
		headers: {}
	};

	const res = {};

	return new Promise((resolve) => {
		middleware(req, res, function() {
			t.pass("Next middleware is called when no library.source.less file is found");
			resolve();
		});
	});
});

test.serial("Only send 304 response in case the client has cached the response already", (t) => {
	const {middleware, byPath, etag, fresh} = t.context;

	const ETag = `"fake-etag"`;

	etag.returns(ETag);

	fresh.callsFake(function(reqHeaders, resHeaders) {
		t.deepEqual(reqHeaders, {
			"If-None-Match": ETag
		});
		t.deepEqual(resHeaders, {
			"etag": ETag
		});
		return true;
	});

	const resources = createResources();

	stubThemeBuild(resources);

	byPath.withArgs("/resources/sap/ui/test/themes/base/library.source.less")
		.resolves(resources["library.source.less"]);

	const req = {
		url: "/resources/sap/ui/test/themes/base/library.css",
		headers: {
			"If-None-Match": ETag
		}
	};

	return new Promise((resolve, reject) => {
		const res = {
			setHeader: sinon.stub(),
			getHeader: sinon.stub().withArgs("ETag").returns(ETag),
			end: function(responseText) {
				t.is(responseText, undefined);
				t.is(res.statusCode, 304);
				t.deepEqual(res.setHeader.getCall(1).args, ["ETag", ETag]);
				resolve();
			}
		};

		middleware(req, res, failOnNext(t, reject));
	});
});

// This could only happen when the theme build processor does not return an expected resource
test.serial("Error handling: Request resource that ThemeBuild doesn't return", (t) => {
	const resources = createResources();

	// Adopt path of library.css so that it can't be found from the theme build results
	resources["library.css"].getPath.returns("/foo.js");

	stubThemeBuild(resources);

	const {middleware, byPath} = t.context;
	byPath.withArgs("/resources/sap/ui/test/themes/base/library.source.less")
		.resolves(resources["library.source.less"]);

	const req = {
		url: "/resources/sap/ui/test/themes/base/library.css",
		headers: {}
	};

	const res = {};

	return new Promise((resolve, reject) => {
		middleware(req, res, function(err) {
			t.is(err.message,
				`Theme Build did not return requested file "/resources/sap/ui/test/themes/base/library.css"`);
			resolve();
		});
	});
});

test.serial("Error handling: Unexpected exception within middleware should call next with error", (t) => {
	const error = new Error("Unexpected Error");

	const {middleware, byPath} = t.context;
	byPath.rejects(error);

	const req = {
		url: "/resources/sap/ui/test/themes/base/library.css",
		headers: {}
	};

	const res = {};

	return new Promise((resolve, reject) => {
		middleware(req, res, function(err) {
			t.is(err, error);
			resolve();
		});
	});
});

test.serial("Multiple parallel requests to the same path should only result in one theme build", async (t) => {
	const resources = createResources();

	const build = stubThemeBuild(resources);

	const {middleware, byPath} = t.context;
	byPath.withArgs("/resources/sap/ui/test/themes/base/library.source.less")
		.resolves(resources["library.source.less"]);
	byPath.withArgs("/resources/sap/ui/test2/themes/base/library.source.less")
		.resolves(resources["library.source.less"]);

	function request(url) {
		return new Promise((resolve, reject) => {
			const req = {
				url,
				headers: {}
			};

			const res = {
				setHeader: sinon.stub(),
				getHeader: sinon.stub(),
				end: resolve
			};

			middleware(req, res, reject);
		});
	}

	await Promise.all([
		request("/resources/sap/ui/test/themes/base/library.css"),
		request("/resources/sap/ui/test/themes/base/library.css"),
		request("/resources/sap/ui/test/themes/base/library.css"),

		request("/resources/sap/ui/test2/themes/base/library.css"),
		request("/resources/sap/ui/test2/themes/base/library.css")
	]);
	// Should only build once per url
	t.is(build.callCount, 2, "Build should be called 2 times");


	// After all requests have finished, the build should be started again when another request comes in
	await Promise.all([
		request("/resources/sap/ui/test/themes/base/library.css"),
		request("/resources/sap/ui/test/themes/base/library.css"),
		request("/resources/sap/ui/test/themes/base/library.css"),

		request("/resources/sap/ui/test2/themes/base/library.css"),
		request("/resources/sap/ui/test2/themes/base/library.css")
	]);
	// Should only build once per url
	t.is(build.callCount, 4, "Build should be called 4 times");
});
