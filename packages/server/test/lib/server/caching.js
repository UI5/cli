import test from "ava";
import sinonGlobal from "sinon";
import esmock from "esmock";
import supertest from "supertest";
import {graphFromPackageDependencies} from "@ui5/project/graph";

let request;
let server;

// Start server before running tests
test.before(async (t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();

	t.context.manifestEnhancer = sinon.stub();

	const {serve} = await esmock.p("../../../lib/server.js", {}, {
		"@ui5/builder/processors/manifestEnhancer": t.context.manifestEnhancer,
	});

	const graph = await graphFromPackageDependencies({
		cwd: "./test/fixtures/application.a"
	});

	t.context.applicationProject = graph.getProject("application.a");

	server = await serve(graph, {
		port: 3334
	});
	request = supertest("http://localhost:3334");
});

test.after.always(() => {
	return new Promise((resolve, reject) => {
		server.close((error) => {
			if (error) {
				reject(error);
			} else {
				resolve();
			}
		});
	});
});

test("serveResources: manifestEnhancer cache invalidation", async (t) => {
	const {manifestEnhancer} = t.context;

	manifestEnhancer.callsFake(async ({resources}) => {
		for (const resource of resources) {
			resource.setString(JSON.stringify({"mockedResponse": "v1"}));
		}
	});

	const response = await request.get("/manifest.json");
	if (response.error) {
		throw new Error(response.error);
	}
	t.is(response.statusCode, 200, "Correct HTTP status code");
	t.is(response.text, JSON.stringify({
		"mockedResponse": "v1"
	}), "Correct response");

	const cachedResponse = await request.get("/manifest.json").set({"If-None-Match": response.headers.etag});
	t.is(cachedResponse.statusCode, 304, "Correct HTTP status code");

	// Changes to the response content should invalidate the cache
	manifestEnhancer.callsFake(async ({resources}) => {
		for (const resource of resources) {
			resource.setString(JSON.stringify({"mockedResponse": "v2"}));
		}
	});

	const newResponse = await request.get("/manifest.json").set({"If-None-Match": response.headers.etag});
	t.is(newResponse.statusCode, 200, "Correct HTTP status code");
	t.is(newResponse.text, JSON.stringify({
		"mockedResponse": "v2"
	}), "Correct response");
});

test("serveResources: version placeholder cache invalidation", async (t) => {
	const {applicationProject} = t.context;

	const response = await request.get("/versionTest.js");
	if (response.error) {
		throw new Error(response.error);
	}
	t.is(response.statusCode, 200, "Correct HTTP status code");
	t.is(response.text, "console.log(`1.0.0`);\n", "Correct response");

	const cachedResponse = await request.get("/versionTest.js").set({"If-None-Match": response.headers.etag});
	t.is(cachedResponse.statusCode, 304, "Correct HTTP status code");

	// Changes to the project version should invalidate the cache
	applicationProject._version = "1.0.1-SNAPSHOT";

	const newResponse = await request.get("/versionTest.js").set({"If-None-Match": response.headers.etag});
	t.is(newResponse.statusCode, 200, "Correct HTTP status code");
	t.is(newResponse.text, "console.log(`1.0.1-SNAPSHOT`);\n", "Correct response");
	t.regex(newResponse.headers.etag, /1\.0\.1-SNAPSHOT/, "Correct updated ETag");
});
