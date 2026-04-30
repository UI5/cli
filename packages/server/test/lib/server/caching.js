import test from "ava";
import supertest from "supertest";
import {graphFromPackageDependencies} from "@ui5/project/graph";
import {serve} from "../../../lib/server.js";

let request;
let server;

// Start server before running tests
test.before(async () => {
	const graph = await graphFromPackageDependencies({
		cwd: "./test/fixtures/application.a"
	});

	server = await serve(graph, {
		port: 3350
	});
	request = supertest("http://localhost:3350");
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

test("serveResources: ETag caching", async (t) => {
	const response = await request.get("/index.html");
	if (response.error) {
		throw new Error(response.error);
	}
	t.is(response.statusCode, 200, "Correct HTTP status code");
	t.truthy(response.headers.etag, "Response has ETag header");

	const cachedResponse = await request.get("/index.html").set({"If-None-Match": response.headers.etag});
	t.is(cachedResponse.statusCode, 304, "Returns 304 when ETag matches");
});

test("serveResources: Different resources have different ETags", async (t) => {
	const response1 = await request.get("/index.html");
	const response2 = await request.get("/versionTest.js");

	t.truthy(response1.headers.etag, "First response has ETag");
	t.truthy(response2.headers.etag, "Second response has ETag");
	t.not(response1.headers.etag, response2.headers.etag, "Different resources have different ETags");
});

test("serveResources: Mismatched ETag returns fresh response", async (t) => {
	const response = await request.get("/index.html");
	t.is(response.statusCode, 200);

	const freshResponse = await request.get("/index.html").set({"If-None-Match": "\"stale-etag\""});
	t.is(freshResponse.statusCode, 200, "Returns 200 when ETag does not match");
	t.truthy(freshResponse.text, "Response body is included");
});
