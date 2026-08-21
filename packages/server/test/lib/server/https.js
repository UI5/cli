import test from "ava";
import supertest from "supertest";
import {serve} from "../../../lib/server.js";
import {getSslCertificate} from "../../../lib/sslUtil.js";
import {graphFromPackageDependencies} from "@ui5/project/graph";
import {isolatedUi5DataDir} from "../../utils/buildCacheIsolation.js";
import path from "node:path";
import https from "node:https";

let request;
let server;

// Start server before running tests
test.before(async (t) => {
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
		https: true,
		key,
		cert,
		ui5DataDir: isolatedUi5DataDir(t),
	});
	const agent = new https.Agent({
		ca: cert,
		rejectUnauthorized: true,
	});
	request = supertest.agent("https://localhost:3366", {httpsAgent: agent});
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
