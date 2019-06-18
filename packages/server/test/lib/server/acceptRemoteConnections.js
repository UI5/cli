const test = require("ava");
const supertest = require("supertest");
const ui5Server = require("../../../");
const server = ui5Server.server;
const normalizer = require("@ui5/project").normalizer;

let request;
let serve;

// Start server before running tests
test.before(() => {
	return normalizer.generateProjectTree({
		cwd: "./test/fixtures/application.a"
	}).then((tree) => {
		return server.serve(tree, {
			port: 3334,
			acceptRemoteConnections: true
		}).then((serveResult) => {
			request = supertest("http://127.0.0.1:3334");
			serve = serveResult;
		});
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

test("Get resource from application.a (/index.html) with enabled remote connection", (t) => {
	return request.get("/index.html").then((res) => {
		if (res.error) {
			t.fail(res.error.text);
		}
		t.deepEqual(res.statusCode, 200, "Correct HTTP status code");
		t.regex(res.headers["content-type"], /html/, "Correct content type");
		t.regex(res.text, /<title>Application A - Version 1.0.0<\/title>/, "Correct response");
	});
});
