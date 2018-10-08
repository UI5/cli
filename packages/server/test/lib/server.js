const {test} = require("ava");
const supertest = require("supertest");
const ui5Server = require("../../");
const server = ui5Server.server;
const normalizer = require("@ui5/project").normalizer;
const http = require("http");

let request;
let serve;

// Start server before running tests
test.before((t) => {
	return normalizer.generateProjectTree({
		cwd: "./test/fixtures/application.a"
	}).then((tree) => {
		return server.serve(tree, {
			port: 3333
		}).then((serveResult) => {
			request = supertest("http://localhost:3333");
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

test("Get resource from library.a (/resources/library/a/.library)", (t) => {
	return request.get("/resources/library/a/.library").then((res) => {
		if (res.error) {
			t.fail(res.error.text);
		}
		t.deepEqual(res.statusCode, 200, "Correct HTTP status code");
	});
});

test("Get resource from library.b (/resources/library/b/.library)", (t) => {
	return request.get("/resources/library/b/.library").then((res) => {
		if (res.error) {
			t.fail(res.error.text);
		}
		t.deepEqual(res.statusCode, 200, "Correct HTTP status code");
	});
});

test("Get resource from library.c (/resources/library/c/.library)", (t) => {
	return request.get("/resources/library/c/.library").then((res) => {
		if (res.error) {
			t.fail(res.error.text);
		}
		t.deepEqual(res.statusCode, 200, "Correct HTTP status code");
	});
});

test("Get resource from library.d (/resources/library/d/.library)", (t) => {
	return request.get("/resources/library/d/.library").then((res) => {
		if (res.error) {
			t.fail(res.error.text);
		}
		t.deepEqual(res.statusCode, 200, "Correct HTTP status code");
	});
});

test("Get app_pages from discovery middleware (/discovery/app_pages)", (t) => {
	return request.get("/discovery/app_pages").then((res) => {
		if (res.error) {
			t.fail(res.error.text);
		}
		t.deepEqual(res.statusCode, 200, "Correct HTTP status code");
		t.deepEqual(res.body, {
			"app_pages": [
				{
					"entry": "index.html"
				}
			]
		}, "Correct response");
	});
});

test("Get all_libs from discovery middleware (/discovery/all_libs)", (t) => {
	return request.get("/discovery/all_libs").then((res) => {
		if (res.error) {
			t.fail(res.error.text);
		}
		t.deepEqual(res.statusCode, 200, "Correct HTTP status code");
		t.deepEqual(res.body, {
			"all_libs": [
				{
					"entry": "library/a"
				},
				{
					"entry": "library/b"
				},
				{
					"entry": "library/c"
				},
				{
					"entry": "library/d"
				}
			]
		}, "Correct response");
	});
});

test("Get all_tests from discovery middleware (/discovery/all_tests)", (t) => {
	return request.get("/discovery/all_tests").then((res) => {
		if (res.error) {
			t.fail(res.error.text);
		}
		t.deepEqual(res.statusCode, 200, "Correct HTTP status code");
		t.deepEqual(res.body, {
			"all_tests": [
				{
					"lib": "library.a",
					"name": "Test.html",
					"url": "../library/a/Test.html"
				},
				{
					"lib": "library.b",
					"name": "Test.html",
					"url": "../library/b/Test.html"
				},
				{
					"lib": "library.d",
					"name": "Test.html",
					"url": "../library/d/Test.html"
				}
			]
		}, "Correct response");
	});
});

test("Get sap-ui-version.json from versionInfo middleware (/resources/sap-ui-version.json)", (t) => {
	return request.get("/resources/sap-ui-version.json").then((res) => {
		if (res.error) {
			t.fail(res.error.text);
		}
		t.deepEqual(res.statusCode, 200, "Correct HTTP status code");

		const buildTimestamp = res.body.buildTimestamp;
		t.deepEqual(res.body, {
			"name": "application.a",
			"version": "1.0.0",
			"buildTimestamp": buildTimestamp,
			"scmRevision": "",
			"libraries": [
				{
					name: "library.a",
					version: "1.0.0",
					buildTimestamp,
					scmRevision: ""
				},
				{
					name: "library.b",
					version: "1.0.0",
					buildTimestamp,
					scmRevision: ""
				},
				{
					name: "library.c",
					version: "1.0.0",
					buildTimestamp,
					scmRevision: ""
				},
				{
					name: "library.d",
					version: "1.0.0",
					buildTimestamp,
					scmRevision: ""
				}
			]
		}, "Correct response");
	});
});

test("Get library.css from theme middleware (/resources/library/a/themes/base/library.css)", (t) => {
	return request.get("/resources/library/a/themes/base/library.css").then((res) => {
		if (res.error) {
			t.fail(res.error.text);
		}
		t.deepEqual(res.statusCode, 200, "Correct HTTP status code");
		t.regex(res.headers["content-type"], /css/, "Correct content type");
		t.deepEqual(res.text, `.library-a-foo {
  color: #fafad2;
  padding: 1px 2px 3px 4px;
}

/* Inline theming parameters */
#sap-ui-theme-library\\.a { background-image: url('data:text/plain;utf-8,%7B%22libraryAColor1%22:%22#fafad2%22%7D'); }
`, "Correct response");
	});
});

test("Get library-RTL.css from theme middleware (/resources/library/a/themes/base/library-RTL.css)", (t) => {
	return request.get("/resources/library/a/themes/base/library-RTL.css").then((res) => {
		if (res.error) {
			t.fail(res.error.text);
		}
		t.deepEqual(res.statusCode, 200, "Correct HTTP status code");
		t.regex(res.headers["content-type"], /css/, "Correct content type");
		t.deepEqual(res.text, `.library-a-foo {
  color: #fafad2;
  padding: 1px 4px 3px 2px;
}

/* Inline theming parameters */
#sap-ui-theme-library\\.a { background-image: url('data:text/plain;utf-8,%7B%22libraryAColor1%22:%22#fafad2%22%7D'); }
`, "Correct response");
	});
});

test("Get library-parameters.json from theme middleware (/resources/library/a/themes/base/library-parameters.json)", (t) => {
	return request.get("/resources/library/a/themes/base/library-parameters.json").then((res) => {
		if (res.error) {
			t.fail(res.error.text);
		}
		t.deepEqual(res.statusCode, 200, "Correct HTTP status code");
		t.regex(res.headers["content-type"], /json/, "Correct content type");
		t.deepEqual(res.body, {
			libraryAColor1: "#fafad2"
		}, "Correct response");
	});
});

test("Stop server", (t) => {
	let port = 3350;
	let request = supertest(`http://localhost:${port}`);
	return normalizer.generateProjectTree({
		cwd: "./test/fixtures/application.a"
	}).then((tree) => {
		return server.serve(tree, {
			port: port
		});
	}).then((serveResult) => {
		return request.get("/resources/library/a/themes/base/library-parameters.json").then((res) => {
			if (res.error) {
				t.fail(res.error.text);
			}
			t.deepEqual(res.statusCode, 200, "Correct HTTP status code");
			return serveResult;
		});
	}).then((serveResult) => {
		return new Promise((resolve, reject) => {
			serveResult.close((error) => {
				if (error) {
					reject(error);
				} else {
					t.pass("Server closing");
					resolve();
				}
			});
		});
	}).then(() => {
		return request.get("/resources/library/a/themes/base/library-parameters.json").then(() => {
			t.fail("Server was not closed!");
		}).catch(() => {
			t.pass("Server was closed properly.");
		});
	});
});

test("Start server - Port is already taken and an error occurs", (t) => {
	let port = 3360;
	const nodeServer = http.createServer((req, res) => {
		res.end();
	});
	return new Promise((resolve) => {
		nodeServer.on("listening", () => {
			resolve();
		});
		nodeServer.listen(port);
	}).then(() => {
		return normalizer.generateProjectTree({
			cwd: "./test/fixtures/application.a"
		}).then((tree) => {
			return server.serve(tree, {
				port: port
			});
		}).catch((error) => {
			nodeServer.close();
			t.is(
				error,
				"Port 3360 already in use.",
				"Server could not start, port is already taken and no other port is used."
			);
		});
	});
});

test("Start server together with node server - Port is already taken and the next one is used", (t) => {
	let port = 3370;
	let nextFoundPort = 3371;
	const nodeServer = http.createServer((req, res) => {
		res.end();
	});
	return new Promise((resolve) => {
		nodeServer.on("listening", () => {
			resolve();
		});
		nodeServer.listen(port);
	}).then(() => {
		return normalizer.generateProjectTree({
			cwd: "./test/fixtures/application.a"
		}).then((tree) => {
			return server.serve(tree, {
				port: port,
				changePortIfInUse: true
			}).then((serveResult) => {
				t.deepEqual(serveResult.port, nextFoundPort, "Resolves with correct port");
				let request = supertest(`http://localhost:${nextFoundPort}`);
				return request.get("/index.html").then((res) => {
					if (res.error) {
						t.fail(res.error.text);
					}
					t.deepEqual(res.statusCode, 200, "Correct HTTP status code");
					nodeServer.close();
					serveResult.close();
				});
			});
		});
	}).catch((error) => {
		t.fail(error);
	});
});

test("Start server twice - Port is already taken and the next one is used", (t) => {
	let port = 3380;
	let nextFoundPort = 3381;
	return normalizer.generateProjectTree({
		cwd: "./test/fixtures/application.a"
	}).then((tree) => {
		return server.serve(tree, {
			port: port,
			changePortIfInUse: true
		});
	}).then((serveResult1) => {
		t.deepEqual(serveResult1.port, port, "Resolves with correct port");
		return normalizer.generateProjectTree({
			cwd: "./test/fixtures/application.a"
		}).then((tree) =>{
			return server.serve(tree, {
				port: port,
				changePortIfInUse: true
			}).then((serveResult2) => {
				t.deepEqual(serveResult2.port, nextFoundPort, "Resolves with correct port");
				let request = supertest(`http://localhost:${nextFoundPort}`);
				return request.get("/index.html").then((res) => {
					if (res.error) {
						t.fail(res.error.text);
					}
					t.deepEqual(res.statusCode, 200, "Correct HTTP status code");
					serveResult1.close();
					serveResult2.close();
				});
			});
		});
	}).catch((error) => {
		t.fail(error);
	});
});

test("CSP", (t) => {
	return Promise.all([
		request.get("/index.html?sap-ui-xx-csp-policy=sap-target-level-1").then((res) => {
			t.truthy(res.headers["content-security-policy"], "response should have csp header");
			t.regex(res.headers["content-security-policy"], /script-src\s+'self'\s+'unsafe-eval'\s*;/,
				"policy should should have the expected content");
			t.is(res.headers["content-security-policy-report-only"], undefined,
				"response must not have csp report-only header");
		}),
		request.get("/index.html?sap-ui-xx-csp-policy=sap-target-level-1:report-only").then((res) => {
			t.is(res.headers["content-security-policy"], undefined, "response must not have csp header");
			t.truthy(res.headers["content-security-policy-report-only"],
				"response should have report-only csp header");
			t.regex(res.headers["content-security-policy-report-only"], /script-src\s+'self'\s+'unsafe-eval'\s*;/,
				"policy should should have the expected content");
		}),
		request.get("/index.html?sap-ui-xx-csp-policy=sap-target-level-2").then((res) => {
			t.truthy(res.headers["content-security-policy"], "response should have csp header");
			t.regex(res.headers["content-security-policy"], /script-src\s+'self'\s*;/,
				"policy should should have the expected content");
			t.is(res.headers["content-security-policy-report-only"], undefined,
				"response must not have csp report-only header");
		}),
		request.get("/index.html?sap-ui-xx-csp-policy=sap-target-level-2:report-only").then((res) => {
			t.is(res.headers["content-security-policy"], undefined, "response must not have csp header");
			t.truthy(res.headers["content-security-policy-report-only"],
				"response should have report-only csp header");
			t.regex(res.headers["content-security-policy-report-only"], /script-src\s+'self'\s*;/,
				"policy should should have the expected content");
		}),
		request.get("/index.html?sap-ui-xx-csp-policy=default-src%20'self';").then((res) => {
			t.truthy(res.headers["content-security-policy"], "response should have csp header");
			t.regex(res.headers["content-security-policy"], /default-src\s+'self'\s*;/,
				"policy should should have the expected content");
			t.is(res.headers["content-security-policy-report-only"], undefined,
				"response must not have csp report-only header");
		}),
		request.get("/index.html?sap-ui-xx-csp-policy=default-src%20'self';:report-only").then((res) => {
			t.is(res.headers["content-security-policy"], undefined, "response must not have csp header");
			t.truthy(res.headers["content-security-policy-report-only"],
				"response should have report-only csp header");
			t.regex(res.headers["content-security-policy-report-only"], /default-src\s+'self'\s*;/,
				"policy should should have the expected content");
		})
	]);
});

test("Get index of resources", (t) => {
	return Promise.all([
		request.get("").then((res) => {
			t.deepEqual(res.statusCode, 200, "Correct HTTP status code");
			t.is(res.headers["content-type"], "text/html", "Correct content type");
			t.is(/<title>(.*)<\/title>/i.exec(res.text)[1], "Index of /", "Found correct title");
			t.deepEqual(res.text.match(/<td/g).length, 24, "Found correct amount of <td> elements");
		}),
		request.get("/resources").then((res) => {
			t.deepEqual(res.statusCode, 200, "Correct HTTP status code");
			t.is(res.headers["content-type"], "text/html", "Correct content type");
			t.is(/<title>(.*)<\/title>/i.exec(res.text)[1], "Index of /resources", "Found correct title");
			t.deepEqual(res.text.match(/<td/g).length, 6, "Found correct amount of <td> elements");
		}),
		request.get("/resources/").then((res) => {
			t.deepEqual(res.statusCode, 200, "Correct HTTP status code");
			t.is(res.headers["content-type"], "text/html", "Correct content type");
			t.is(/<title>(.*)<\/title>/i.exec(res.text)[1], "Index of /resources/", "Found correct title");
			t.deepEqual(res.text.match(/<td/g).length, 6, "Found correct amount of <td> elements");
		}),
		request.get("/not-existing-folder").then((res) => {
			t.deepEqual(res.statusCode, 404, "Correct HTTP status code");
			t.is(res.headers["content-type"], "text/html; charset=utf-8", "Correct content type");
			t.is(/<title>(.*)<\/title>/i.exec(res.text)[1], "Error", "Found correct title");
			t.deepEqual(res.text.match(/<pre/g).length, 1, "Found correct amount of <pre> elements");
		})
	]);
});
