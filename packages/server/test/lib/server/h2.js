import test from "ava";
import supertest from "supertest";
import {serve} from "../../../lib/server.js";
import {getSslCertificate} from "../../../lib/sslUtil.js";
import {graphFromPackageDependencies} from "@ui5/project/graph";
import path from "node:path";

let request;
let server;

// Start server before running tests
test.before(async (t) => {
	process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";

	const graph = await graphFromPackageDependencies({
		cwd: "./test/fixtures/application.a"
	});
	const sslPath = path.join(process.cwd(), "./test/fixtures/ssl/");
	const {key, cert} = await getSslCertificate(
		path.join(sslPath, "server.key"),
		path.join(sslPath, "server.crt"),
	);
	server = await serve(graph, {
		port: 3366,
		h2: true,
		key,
		cert
	});
	request = supertest("https://localhost:3366");
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

test("Get resource from application.a (/index.html)", async (t) => {
	const res = await request.get("/index.html");
	if (res.error) {
		t.fail(res.error.text);
	}
	t.is(res.statusCode, 200, "Correct HTTP status code");
	t.regex(res.headers["content-type"], /html/, "Correct content type");
	t.regex(res.text, /<title>Application A<\/title>/, "Correct response");
});
