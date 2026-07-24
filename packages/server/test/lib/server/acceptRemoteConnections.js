import test from "ava";
import supertest from "supertest";
import {serve} from "../../../lib/server.js";
import {graphFromPackageDependencies} from "@ui5/project/graph";
import {isolatedUi5DataDir} from "../../utils/buildCacheIsolation.js";

let request;
let server;

// Start server before running tests
test.before(async (t) => {
	const ui5DataDir = isolatedUi5DataDir(t);
	const graph = await graphFromPackageDependencies({
		ui5DataDir,
		cwd: "./test/fixtures/application.a"
	});

	server = await serve(graph, {
		ui5DataDir,
		port: 3334,
		acceptRemoteConnections: true,
	});

	request = supertest("http://127.0.0.1:3334");
});

test.after(() => {
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

test("Get resource from application.a (/index.html) with enabled remote connection", async (t) => {
	const res = await request.get("/index.html");
	if (res.error) {
		t.fail(res.error.text);
	}
	t.is(res.statusCode, 200, "Correct HTTP status code");
	t.regex(res.headers["content-type"], /html/, "Correct content type");
	t.regex(res.text, /<title>Application A<\/title>/, "Correct response");
});
