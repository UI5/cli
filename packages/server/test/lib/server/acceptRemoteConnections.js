const test = require("ava");
const supertest = require("supertest");
const ui5Server = require("../../../");
const server = ui5Server.server;
const generateProjectGraph = require("@ui5/project").generateProjectGraph.usingNodePackageDependencies;

let request;
let serve;

// Start server before running tests
test.before(async () => {
	const graph = await generateProjectGraph({
		cwd: "./test/fixtures/application.a"
	});

	serve = await server.serve(graph, {
		port: 3334,
		acceptRemoteConnections: true
	});

	request = supertest("http://127.0.0.1:3334");
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

test("Get resource from application.a (/index.html) with enabled remote connection", async (t) => {
	const res = await request.get("/index.html");
	if (res.error) {
		t.fail(res.error.text);
	}
	t.is(res.statusCode, 200, "Correct HTTP status code");
	t.regex(res.headers["content-type"], /html/, "Correct content type");
	t.regex(res.text, /<title>Application A<\/title>/, "Correct response");
});
