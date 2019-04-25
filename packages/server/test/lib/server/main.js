const {test} = require("ava");
const supertest = require("supertest");
const ui5Server = require("../../../");
const server = ui5Server.server;
const normalizer = require("@ui5/project").normalizer;

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

test("Get resource from application.a (/i18n/i18n.properties) with correct charset 'ISO-8859-1'", (t) => {
	return request.get("/i18n/i18n.properties").then((res) => {
		if (res.error) {
			t.fail(res.error.text);
		}
		t.deepEqual(res.statusCode, 200, "Correct HTTP status code");
		t.deepEqual(res.headers["content-type"], "text/plain; charset=ISO-8859-1", "Correct content type and charset");
		t.deepEqual(res.text, "showHelloButtonText=Say Hello!", "Correct response");
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
#sap-ui-theme-library\\.a{background-image:url('data:text/plain;utf-8,%7B%22libraryAColor1%22%3A%22%23fafad2%22%7D')}
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
#sap-ui-theme-library\\.a{background-image:url('data:text/plain;utf-8,%7B%22libraryAColor1%22%3A%22%23fafad2%22%7D')}
`, "Correct response");
	});
});

test("Get library-parameters.json from theme middleware (/resources/library/a/themes/base/library-parameters.json)",
	(t) => {
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
	const port = 3350;
	const request = supertest(`http://localhost:${port}`);
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

test("CSP (defaults)", (t) => {
	return Promise.all([
		request.get("/index.html").then((res) => {
			t.is(res.headers["content-security-policy"], undefined,
				"response must not have enforcing csp header");
			t.is(res.headers["content-security-policy-report-only"], undefined,
				"response must not have report-only csp header");
		}),
		request.get("/index.html?sap-ui-xx-csp-policy=sap-target-level-1").then((res) => {
			t.truthy(res.headers["content-security-policy"], "response should have enforcing csp header");
			t.regex(res.headers["content-security-policy"], /script-src\s+'self'\s+'unsafe-eval'\s*;/,
				"header should should have the expected content");
			t.is(res.headers["content-security-policy-report-only"], undefined,
				"response must not have report-only csp header");
		}),
		request.get("/index.html?sap-ui-xx-csp-policy=sap-target-level-1:report-only").then((res) => {
			t.is(res.headers["content-security-policy"], undefined,
				"response must not have enforcing csp header");
			t.truthy(res.headers["content-security-policy-report-only"],
				"response should have report-only csp header");
			t.regex(res.headers["content-security-policy-report-only"], /script-src\s+'self'\s+'unsafe-eval'\s*;/,
				"header should should have the expected content");
		}),
		request.get("/index.html?sap-ui-xx-csp-policy=sap-target-level-2").then((res) => {
			t.truthy(res.headers["content-security-policy"], "response should have enforcing csp header");
			t.regex(res.headers["content-security-policy"], /script-src\s+'self'\s*;/,
				"header should should have the expected content");
			t.is(res.headers["content-security-policy-report-only"], undefined,
				"response must not have report-only csp header");
		}),
		request.get("/index.html?sap-ui-xx-csp-policy=sap-target-level-2:report-only").then((res) => {
			t.is(res.headers["content-security-policy"], undefined,
				"response must not have enforcing csp header");
			t.truthy(res.headers["content-security-policy-report-only"],
				"response should have report-only csp header");
			t.regex(res.headers["content-security-policy-report-only"], /script-src\s+'self'\s*;/,
				"header should have the expected content");
		}),
		request.get("/index.html?sap-ui-xx-csp-policy=default-src%20http%3a;").then((res) => {
			t.truthy(res.headers["content-security-policy"], "response should have enforcing csp header");
			t.regex(res.headers["content-security-policy"], /default-src\s+http:\s*;/,
				"header should contain the configured policy");
			t.is(res.headers["content-security-policy-report-only"], undefined,
				"response must not have report-only csp header");
		}),
		request.get("/index.html?sap-ui-xx-csp-policy=default-src%20http%3a;:report-only").then((res) => {
			t.is(res.headers["content-security-policy"], undefined,
				"response must not have enforcing csp header");
			t.truthy(res.headers["content-security-policy-report-only"],
				"response should have report-only csp header");
			t.regex(res.headers["content-security-policy-report-only"], /default-src\s+http:\s*;/,
				"header should contain the configured policy");
		}),
		request.get("/index.html?sap-ui-xx-csp-policy=default-src%20http%3a;:ro").then((res) => {
			t.is(res.headers["content-security-policy"], undefined,
				"response must not have enforcing csp header");
			t.truthy(res.headers["content-security-policy-report-only"],
				"response should have report-only csp header");
			t.regex(res.headers["content-security-policy-report-only"], /default-src\s+http:\s*;/,
				"header should contain the configured policy");
		})
	]);
});

/*
 * Note: the 'sendSapPolicies' configuration sends two 'content-security-policy-report-only' headers.
 * The response object of supertest joins the values of the two headers in a single string, which makes
 * assertions below a bit harder to understand (two checks with different regex on the same header)
 */
test("CSP (sap policies)", (t) => {
	const port = 3400;
	const request = supertest(`http://localhost:${port}`);
	let localServeResult;
	return normalizer.generateProjectTree({
		cwd: "./test/fixtures/application.a"
	}).then((tree) => {
		return server.serve(tree, {
			port,
			sendSAPTargetCSP: true
		});
	}).then((serveResult) => {
		localServeResult = serveResult;
		return Promise.all([
			request.get("/index.html").then((res) => {
				t.is(res.headers["content-security-policy"], undefined, "response must not have enforcing csp header");
				t.truthy(res.headers["content-security-policy-report-only"],
					"response should have report-only csp header");
				t.regex(res.headers["content-security-policy-report-only"], /script-src\s+'self'\s+'unsafe-eval'\s*;/,
					"header should contain the 1st default policy");
				t.regex(res.headers["content-security-policy-report-only"], /script-src\s+'self'\s*;/,
					"header should contain the 2nd default policy");
			}),
			request.get("/index.html?sap-ui-xx-csp-policy=sap-target-level-1").then((res) => {
				t.truthy(res.headers["content-security-policy"], "response should have enforcing csp header");
				t.regex(res.headers["content-security-policy"], /script-src\s+'self'\s+'unsafe-eval'\s*;/,
					"header should should have the expected content");
				t.truthy(res.headers["content-security-policy-report-only"],
					"response should have report-only csp header");
				t.regex(res.headers["content-security-policy-report-only"], /script-src\s+'self'\s*;/,
					"header should contain the 2nd default policy");
			}),
			request.get("/index.html?sap-ui-xx-csp-policy=sap-target-level-1:report-only").then((res) => {
				t.is(res.headers["content-security-policy"], undefined, "response must not have enforcing csp header");
				t.truthy(res.headers["content-security-policy-report-only"],
					"response should have report-only csp header");
				t.regex(res.headers["content-security-policy-report-only"], /script-src\s+'self'\s+'unsafe-eval'\s*;/,
					"header should should have the expected content");
				t.regex(res.headers["content-security-policy-report-only"], /script-src\s+'self'\s*;/,
					"header should contain the 2nd default policy");
			}),
			request.get("/index.html?sap-ui-xx-csp-policy=sap-target-level-2").then((res) => {
				t.truthy(res.headers["content-security-policy"], "response should have enforcing csp header");
				t.regex(res.headers["content-security-policy"], /script-src\s+'self'\s*;/,
					"header should should have the expected content");
				t.regex(res.headers["content-security-policy-report-only"], /script-src\s+'self'\s*;/,
					"header should contain the 2nd default policy");
			}),
			request.get("/index.html?sap-ui-xx-csp-policy=sap-target-level-2:report-only").then((res) => {
				t.is(res.headers["content-security-policy"], undefined, "response must not have enforcing csp header");
				t.truthy(res.headers["content-security-policy-report-only"],
					"response should have report-only csp header");
				t.regex(res.headers["content-security-policy-report-only"], /script-src\s+'self'\s*;/,
					"header should have the expected content");
			}),
			request.get("/index.html?sap-ui-xx-csp-policy=default-src%20http%3a;").then((res) => {
				t.truthy(res.headers["content-security-policy"], "response should have enforcing csp header");
				t.regex(res.headers["content-security-policy"], /default-src\s+http:\s*;/,
					"header should contain the configured policy");
				t.regex(res.headers["content-security-policy-report-only"], /script-src\s+'self'\s*;/,
					"header should contain the 2nd default policy");
			}),
			request.get("/index.html?sap-ui-xx-csp-policy=default-src%20http%3a;:report-only").then((res) => {
				t.is(res.headers["content-security-policy"], undefined,
					"response must not have enforcing csp header");
				t.truthy(res.headers["content-security-policy-report-only"],
					"response should have report-only csp header");
				t.regex(res.headers["content-security-policy-report-only"], /default-src\s+http:\s*;/,
					"header should contain the configured policy");
				t.regex(res.headers["content-security-policy-report-only"], /default-src\s+'self'\s*;/,
					"header should contain the 2nd default policy");
			}),
			request.get("/index.html?sap-ui-xx-csp-policy=default-src%20http%3a;:ro").then((res) => {
				t.is(res.headers["content-security-policy"], undefined,
					"response must not have enforcing csp header");
				t.truthy(res.headers["content-security-policy-report-only"],
					"response should have report-only csp header");
				t.regex(res.headers["content-security-policy-report-only"], /default-src\s+http:\s*;/,
					"header should contain the configured policy");
				t.regex(res.headers["content-security-policy-report-only"], /default-src\s+'self'\s*;/,
					"header should contain the 2nd default policy");
			})
		]);
	}).then(() => {
		return new Promise((resolve, reject) => {
			localServeResult.close((error) => {
				if (error) {
					reject(error);
				} else {
					t.pass("Server closing");
					resolve();
				}
			});
		});
	});
});

test("Get index of resources", (t) => {
	return Promise.all([
		request.get("").then((res) => {
			t.deepEqual(res.statusCode, 200, "Correct HTTP status code");
			t.is(res.headers["content-type"], "text/html", "Correct content type");
			t.is(/<title>(.*)<\/title>/i.exec(res.text)[1], "Index of /", "Found correct title");
			t.deepEqual(res.text.match(/<td/g).length, 30, "Found correct amount of <td> elements");
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
