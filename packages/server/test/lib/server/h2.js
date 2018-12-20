const {test} = require("ava");
const supertest = require("supertest");
const ui5Server = require("../../../");
const server = ui5Server.server;
const normalizer = require("@ui5/project").normalizer;
const path = require("path");

let request;
let serve;

// Start server before running tests
test.before((t) => {
	process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";

	return normalizer.generateProjectTree({
		cwd: "./test/fixtures/application.a"
	}).then((tree) => {
		const sslPath = path.join(process.cwd(), "./test/fixtures/ssl/");
		return ui5Server.sslUtil.getSslCertificate(
			path.join(sslPath, "server.key"),
			path.join(sslPath, "server.crt"),
		).then(({key, cert}) => {
			return {tree, key, cert};
		});
	}).then((result) => {
		return server.serve(result.tree, {
			port: 3366,
			h2: true,
			key: result.key,
			cert: result.cert
		});
	}).then((serveResult) => {
		request = supertest("https://localhost:3366");
		serve = serveResult;
	});
});

test.after(() => {
	return new Promise((resolve, reject) => {
		serve.close((error) => {
			if (error) {
				reject(error);
			} else {
				resolve();
			}
		});
	});
});

test("Get resource from application.a (/index.html)", (t) => {
	return request.get("/index.html").then((res) => {
		if (res.error) {
			t.fail(res.error.text);
		}
		t.deepEqual(res.statusCode, 200, "Correct HTTP status code");
		t.regex(res.headers["content-type"], /html/, "Correct content type");
		t.regex(res.text, /<title>Application A<\/title>/, "Correct response");
	});
});
