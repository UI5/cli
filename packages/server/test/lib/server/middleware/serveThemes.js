const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");

const ThemeBuilder = require("@ui5/builder").processors.themeBuilder.ThemeBuilder;

const failOnNext= function(t) {
	return function(err) {
		if (err) {
			t.fail("Unexpected error passed to next function: " + err);
		} else {
			t.fail("Unexpected call of next function");
		}
		t.end();
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
		"css-variables.source.less": {
			getBuffer: sinon.stub().resolves(`/* css-variables.source.less */`),
			getPath: sinon.stub().returns("/resources/sap/ui/test/themes/base/css-variables.source.less")
		},
		"css-variables.css": {
			getBuffer: sinon.stub().resolves(`/* css-variables.css */`),
			getPath: sinon.stub().returns("/resources/sap/ui/test/themes/base/css-variables.css")
		},
		"library-skeleton.css": {
			getBuffer: sinon.stub().resolves(`/* library-skeleton.css */`),
			getPath: sinon.stub().returns("/resources/sap/ui/test/themes/base/library-skeleton.css")
		},
		"library-skeleton-RTL.css": {
			getBuffer: sinon.stub().resolves(`/* library-skeleton-RTL.css */`),
			getPath: sinon.stub().returns("/resources/sap/ui/test/themes/base/library-skeleton-RTL.css")
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
		resources["css-variables.source.less"],
		resources["css-variables.css"],
		resources["library-skeleton.css"],
		resources["library-skeleton-RTL.css"]
	]);
	return build;
};

const createMiddleware = function() {
	const resources = {
		all: {
			byPath: sinon.stub()
		}
	};
	return {
		middleware: require("../../../../lib/middleware/serveThemes")({
			resources
		}),
		byPath: resources.all.byPath
	};
};

const verifyThemeRequest = function(t, filename) {
	const resources = createResources();

	stubThemeBuild(resources);

	const {middleware, byPath} = createMiddleware();
	byPath.withArgs("/resources/sap/ui/test/themes/base/library.source.less")
		.resolves(resources["library.source.less"]);

	const req = {
		url: "/resources/sap/ui/test/themes/base/" + filename,
		headers: {}
	};

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
			t.end();
		}
	};

	middleware(req, res, failOnNext(t));
};

test.afterEach.always((t) => {
	sinon.restore();
	mock.stopAll();
	mock.reRequire("../../../../lib/middleware/serveThemes");
});

test.serial.cb("Serving library.css", (t) => {
	verifyThemeRequest(t, "library.css");
});

test.serial.cb("Serving library-RTL.css", (t) => {
	verifyThemeRequest(t, "library-RTL.css");
});

test.serial.cb("Serving library-parameters.json", (t) => {
	verifyThemeRequest(t, "library-parameters.json");
});

test.serial.cb("Serving css-variables.source.less", (t) => {
	verifyThemeRequest(t, "css-variables.source.less");
});

test.serial.cb("Serving css-variables.css", (t) => {
	verifyThemeRequest(t, "css-variables.css");
});

test.serial.cb("Serving library-skeleton.css", (t) => {
	verifyThemeRequest(t, "library-skeleton.css");
});

test.serial.cb("Serving library-skeleton-RTL.css", (t) => {
	verifyThemeRequest(t, "library-skeleton-RTL.css");
});

test.serial.cb("Clear cache to rebuild themes when CSS Variables file is requested", (t) => {
	const resources = createResources();

	const build = stubThemeBuild(resources);
	const clearCache = sinon.stub(ThemeBuilder.prototype, "clearCache");

	const {middleware, byPath} = createMiddleware();
	byPath.withArgs("/resources/sap/ui/test/themes/base/library.source.less")
		.resolves(resources["library.source.less"]);

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
			url: "/resources/sap/ui/test/themes/base/css-variables.css",
			headers: {}
		};

		const res = {
			setHeader: sinon.stub(),
			getHeader: sinon.stub(),
			end: function() {
				t.deepEqual(build.getCall(1).args, [[resources["library.source.less"]], {cssVariables: true}],
					"Build should be called with cssVariables option");

				t.true(clearCache.called, "Clear cache should be called");

				t.end();
			}
		};

		middleware(req, res, failOnNext(t));
	}

	firstRequest();
});

test.serial.cb("Clear cache only once after enabling CSS Variables", (t) => {
	const resources = createResources();

	const build = stubThemeBuild(resources);
	const clearCache = sinon.stub(ThemeBuilder.prototype, "clearCache");

	const {middleware, byPath} = createMiddleware();
	byPath.withArgs("/resources/sap/ui/test/themes/base/library.source.less")
		.resolves(resources["library.source.less"]);

	function firstRequest() {
		const req = {
			url: "/resources/sap/ui/test/themes/base/css-variables.css",
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

		middleware(req, res, failOnNext(t));
	}

	function secondRequest() {
		const req = {
			url: "/resources/sap/ui/test/themes/base/library-skeleton.css",
			headers: {}
		};

		const res = {
			setHeader: sinon.stub(),
			getHeader: sinon.stub(),
			end: function() {
				t.deepEqual(build.getCall(1).args, [[resources["library.source.less"]], {cssVariables: true}],
					"Build should be called with cssVariables option");

				t.true(clearCache.calledOnce, "Clear cache should still only be called once");

				t.end();
			}
		};

		middleware(req, res, failOnNext(t));
	}

	firstRequest();
});

test.serial.cb("Do not handle non-theme requests", (t) => {
	const {middleware} = createMiddleware();

	const req = {
		url: "/resources/sap/ui/test/test.js"
	};

	const res = {};

	middleware(req, res, function() {
		t.pass("Next middleware is called for non-theme requests");
		t.end();
	});
});

test.serial.cb("Do not handle requests without an existing library.source.less file", (t) => {
	const resources = createResources();

	stubThemeBuild(resources);

	const {middleware, byPath} = createMiddleware();
	byPath.withArgs("/resources/sap/ui/test/themes/base/library.source.less").resolves(null);

	const req = {
		url: "/resources/sap/ui/test/themes/base/library.css",
		headers: {}
	};

	const res = {};

	middleware(req, res, function() {
		t.pass("Next middleware is called when no library.source.less file is found");
		t.end();
	});
});

test.serial.cb("Only send 304 response in case the client has cached the response already", (t) => {
	const ETag = `"fake-etag"`;

	mock("etag", function() {
		return ETag;
	});
	mock("fresh", function(reqHeaders, resHeaders) {
		t.deepEqual(reqHeaders, {
			"If-None-Match": ETag
		});
		t.deepEqual(resHeaders, {
			"etag": ETag
		});
		return true;
	});
	mock.reRequire("../../../../lib/middleware/serveThemes");

	const resources = createResources();

	stubThemeBuild(resources);

	const {middleware, byPath} = createMiddleware();
	byPath.withArgs("/resources/sap/ui/test/themes/base/library.source.less")
		.resolves(resources["library.source.less"]);

	const req = {
		url: "/resources/sap/ui/test/themes/base/library.css",
		headers: {
			"If-None-Match": ETag
		}
	};

	const res = {
		setHeader: sinon.stub(),
		getHeader: sinon.stub().withArgs("ETag").returns(ETag),
		end: function(responseText) {
			t.is(responseText, undefined);
			t.is(res.statusCode, 304);
			t.deepEqual(res.setHeader.getCall(1).args, ["ETag", ETag]);
			t.end();
		}
	};

	middleware(req, res, failOnNext(t));
});

// This could only happen when the theme build processor does not return an expected resource
test.serial.cb("Error handling: Request resource that ThemeBuild doesn't return", (t) => {
	const resources = createResources();

	// Adopt path of library.css so that it can't be found from the theme build results
	resources["library.css"].getPath.returns("/foo.js");

	stubThemeBuild(resources);

	const {middleware, byPath} = createMiddleware();
	byPath.withArgs("/resources/sap/ui/test/themes/base/library.source.less")
		.resolves(resources["library.source.less"]);

	const req = {
		url: "/resources/sap/ui/test/themes/base/library.css",
		headers: {}
	};

	const res = {};

	middleware(req, res, function(err) {
		t.is(err.message, `Theme Build did not return requested file "/resources/sap/ui/test/themes/base/library.css"`);
		t.end();
	});
});

test.serial.cb("Error handling: Unexpected exception within middleware should call next with error", (t) => {
	const error = new Error("Unexpected Error");

	const {middleware, byPath} = createMiddleware();
	byPath.rejects(error);

	const req = {
		url: "/resources/sap/ui/test/themes/base/library.css",
		headers: {}
	};

	const res = {};

	middleware(req, res, function(err) {
		t.is(err, error);
		t.end();
	});
});
