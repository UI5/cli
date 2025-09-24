import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import path from "node:path";
import fs from "graceful-fs";
import {fileURLToPath} from "node:url";

let testRunnerMiddleware;
const baseResourcePath = fileURLToPath(new URL("../../../../lib/middleware/testRunner", import.meta.url));

test.beforeEach(async (t) => {
	t.context.readFileStub = sinon.stub(fs, "readFile").yieldsAsync(null, "👮");

	// Re-require to ensure that mocked modules are used
	testRunnerMiddleware = await esmock("../../../../lib/middleware/testRunner.js");
});

test.afterEach.always(() => {
	sinon.restore();
});

function callMiddleware(reqPath) {
	const middleware = testRunnerMiddleware({resources: {}});
	return new Promise((resolve, reject) => {
		const req = {
			url: `http://localhost${reqPath}`
		};
		const res = {
			setHeader: function() {},
			writeHead: function(status, contentType) {},
			end: function(content) {
				resolve(content);
			},
		};
		const next = function(err) {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		};
		middleware(req, res, next);
	});
}

test.serial("Serve testrunner.html", async (t) => {
	const content1 = await callMiddleware("/test-resources/sap/ui/qunit/testrunner.html");

	// call a second time to test caching
	const content2 = await callMiddleware("/test-resources/sap/ui/qunit/testrunner.html");

	t.is(t.context.readFileStub.callCount, 1, "fs.readFile got called once");
	t.is(t.context.readFileStub.getCall(0).args[0], path.join(baseResourcePath, "testrunner.html"),
		"fs.readFile got called with expected path");
	t.deepEqual(t.context.readFileStub.getCall(0).args[1], {encoding: "utf8"},
		"fs.readFile got called with expected options");

	t.is(content1, "👮", "Correct content served");
	t.is(content2, "👮", "Correct content served from cache");
});

test.serial("Serve testrunner.css", async (t) => {
	const content1 = await callMiddleware("/test-resources/sap/ui/qunit/testrunner.css");

	// call a second time to test caching
	const content2 = await callMiddleware("/test-resources/sap/ui/qunit/testrunner.css");

	t.is(t.context.readFileStub.callCount, 1, "fs.readFile got called once");
	t.is(t.context.readFileStub.getCall(0).args[0], path.join(baseResourcePath, "testrunner.css"),
		"fs.readFile got called with expected path");
	t.deepEqual(t.context.readFileStub.getCall(0).args[1], {encoding: "utf8"},
		"fs.readFile got called with expected options");

	t.is(content1, "👮", "Correct content served");
	t.is(content2, "👮", "Correct content served from cache");
});

test.serial("Serve TestRunner.js", async (t) => {
	const content1 = await callMiddleware("/test-resources/sap/ui/qunit/TestRunner.js");

	// call a second time to test caching
	const content2 = await callMiddleware("/test-resources/sap/ui/qunit/TestRunner.js");

	t.is(t.context.readFileStub.callCount, 1, "fs.readFile got called once");
	t.is(t.context.readFileStub.getCall(0).args[0], path.join(baseResourcePath, "TestRunner.js"),
		"fs.readFile got called with expected path");
	t.deepEqual(t.context.readFileStub.getCall(0).args[1], {encoding: "utf8"},
		"fs.readFile got called with expected options");

	t.is(content1, "👮", "Correct content served");
	t.is(content2, "👮", "Correct content served from cache");
});

test.serial("Request path variations that should work", async (t) => {
	// Additional path segment at beginning
	const content1 = await callMiddleware("/pony/test-resources/sap/ui/qunit/testrunner.html");

	t.is(content1, "👮", "Correct content served");
});

test.serial("Request path variations that should *not* work", async (t) => {
	// Uppercase path segments
	const content1 = await callMiddleware("/test-resources/sap/ui/QUNIT/testrunner.html");

	// Missing "test-resources" segment
	const content2 = await callMiddleware("/sap/ui/qunit/testrunner.html");

	// Incorrect case of file name
	const content3 = await callMiddleware("/test-resources/sap/ui/qunit/TESTRUNNER.HTML");
	const content4 = await callMiddleware("/test-resources/sap/ui/qunit/testrunner.js"); // Should be TestRunner.js

	t.is(content1, undefined, "Request is not handled by middleware (next() called with undefined)");
	t.is(content2, undefined, "Request is not handled by middleware (next() called with undefined)");
	t.is(content3, undefined, "Request is not handled by middleware (next() called with undefined)");
	t.is(content4, undefined, "Request is not handled by middleware (next() called with undefined)");
});

test.serial("Error should be thrown correctly", async (t) => {
	t.context.readFileStub.yieldsAsync(new Error("My Error"));
	const error = await t.throwsAsync(callMiddleware("/test-resources/sap/ui/qunit/testrunner.html"));
	t.is(error.message, "My Error");
});
