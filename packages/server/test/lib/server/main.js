const test = require("ava");
const supertest = require("supertest");
const ui5Server = require("../../../");
const server = ui5Server.server;
const generateProjectGraph = require("@ui5/project").generateProjectGraph.usingNodePackageDependencies;

let request;
let serve;

// Start server before running tests
test.before(async (t) => {
	const graph = await generateProjectGraph({
		cwd: "./test/fixtures/application.a"
	});

	serve = await server.serve(graph, {
		port: 3333
	});
	request = supertest("http://localhost:3333");
});

test.after.always(() => {
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

test("Get resource from application.a (/index.html)", async (t) => {
	const res = await request.get("/index.html");
	if (res.error) {
		throw new Error(res.error);
	}
	t.is(res.statusCode, 200, "Correct HTTP status code");
	t.regex(res.headers["content-type"], /html/, "Correct content type");
	t.regex(res.text, /<title>Application A<\/title>/, "Correct response");
});


test("Get resource from application.a with not replaced version placeholder(/versionTest.html)", async (t) => {
	const res = await request.get("/versionTest.html");
	if (res.error) {
		throw new Error(res.error);
	}
	t.is(res.statusCode, 200, "Correct HTTP status code");
	t.regex(res.headers["content-type"], /html/, "Correct content type");
	t.regex(res.text, /<title>Not replaced: \${version}<\/title>/, "Correct response");
});

test("Get resource from application.a with replaced version placeholder (/versionTest.js)", async (t) => {
	const res = await request.get("/versionTest.js");
	if (res.error) {
		throw new Error(res.error);
	}
	t.is(res.statusCode, 200, "Correct HTTP status code");
	t.regex(res.headers["content-type"], /application\/javascript/, "Correct content type");
	t.is(res.text, "console.log(`1.0.0`);\n", "Correct response");
});

test("Get resource from application.a (/i18n/i18n.properties) with correct content-type", async (t) => {
	const res = await request.get("/i18n/i18n.properties");
	if (res.error) {
		throw new Error(res.error.text);
	}
	t.is(res.statusCode, 200, "Correct HTTP status code");
	t.is(res.headers["content-type"], "application/octet-stream", "Correct content type");
	t.is(res.body.toString(), "showHelloButtonText=Say Hello!", "Correct response");
});

test("Get resource from application.a (/i18n/i18n_de.properties) with correct content-type'", async (t) => {
	const res = await request.get("/i18n/i18n_de.properties").responseType("arraybuffer");
	if (res.error) {
		throw new Error(res.error);
	}
	t.is(res.statusCode, 200, "Correct HTTP status code");
	t.is(res.headers["content-type"], "application/octet-stream",
		"Correct content type");
	t.is(res.body.toString(), "showHelloButtonText=Say \\u00e4!", "Correct response");
	// Because it took so long to figure this out I keep the below line. It is equivalent to the "is" above
	// t.is(res.body.toString("latin1"),
	// 	Buffer.from("showHelloButtonText=Say \u00e4!", "latin1").toString("latin1"),
	// 	"Correct response");
});

test("Get resource from library.a (/resources/library/a/.library)", async (t) => {
	const res = await request.get("/resources/library/a/.library");
	if (res.error) {
		throw new Error(res.error);
	}
	t.is(res.statusCode, 200, "Correct HTTP status code");
});

test("Get resource from library.b (/resources/library/b/.library)", async (t) => {
	const res = await request.get("/resources/library/b/.library");
	if (res.error) {
		throw new Error(res.error);
	}
	t.is(res.statusCode, 200, "Correct HTTP status code");
});

test("Get resource from library.c (/resources/library/c/.library)", async (t) => {
	const res = await request.get("/resources/library/c/.library");
	if (res.error) {
		throw new Error(res.error);
	}
	t.is(res.statusCode, 200, "Correct HTTP status code");
});

test("Get resource from library.d (/resources/library/d/.library)", async (t) => {
	const res = await request.get("/resources/library/d/.library");
	if (res.error) {
		throw new Error(res.error);
	}
	t.is(res.statusCode, 200, "Correct HTTP status code");
});

test("Get app_pages from discovery middleware (/discovery/app_pages)", async (t) => {
	const res = await request.get("/discovery/app_pages");
	if (res.error) {
		throw new Error(res.error);
	}
	t.is(res.statusCode, 200, "Correct HTTP status code");
	t.deepEqual(res.body, {
		"app_pages": [
			{
				"entry": "index.html"
			},
			{
				"entry": "versionTest.html"
			}
		]
	}, "Correct response");
});

test("Get all_libs from discovery middleware (/discovery/all_libs)", async (t) => {
	const res = await request.get("/discovery/all_libs");
	if (res.error) {
		throw new Error(res.error);
	}
	t.is(res.statusCode, 200, "Correct HTTP status code");
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

test("Get all_tests from discovery middleware (/discovery/all_tests)", async (t) => {
	const res = await request.get("/discovery/all_tests");
	if (res.error) {
		throw new Error(res.error);
	}
	t.is(res.statusCode, 200, "Correct HTTP status code");
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

test("Get sap-ui-version.json from versionInfo middleware (/resources/sap-ui-version.json)", async (t) => {
	const res = await request.get("/resources/sap-ui-version.json");
	if (res.error) {
		throw new Error(res.error);
	}
	t.is(res.statusCode, 200, "Correct HTTP status code");

	const buildTimestamp = res.body.buildTimestamp;
	t.deepEqual(res.body, {
		"name": "application.a",
		"version": "1.0.0",
		"buildTimestamp": buildTimestamp,
		"scmRevision": "",
		"libraries": [
			{
				name: "library.a",
				manifestHints: {
					dependencies: {
						libs: {
							"library.d": {}
						}
					}
				},
				version: "1.0.0",
				buildTimestamp,
				scmRevision: ""
			},
			{
				name: "library.b",
				manifestHints: {
					dependencies: {
						libs: {
							"library.d": {}
						}
					}
				},
				version: "1.0.0",
				buildTimestamp,
				scmRevision: ""
			},
			{
				name: "library.c",
				manifestHints: {
					dependencies: {
						libs: {
							"library.d": {}
						}
					}
				},
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

test("Get library.css from theme middleware (/resources/library/a/themes/base/library.css)", async (t) => {
	const res = await request.get("/resources/library/a/themes/base/library.css");
	if (res.error) {
		throw new Error(res.error);
	}
	t.is(res.statusCode, 200, "Correct HTTP status code");
	t.regex(res.headers["content-type"], /css/, "Correct content type");
	t.is(res.text, `.library-a-foo {
  color: #fafad2;
  padding: 1px 2px 3px 4px;
}

/* Inline theming parameters */
#sap-ui-theme-library\\.a{background-image:url('data:text/plain;utf-8,%7B%22libraryAColor1%22%3A%22%23fafad2%22%7D')}
`, "Correct response");
});

test("Get library-RTL.css from theme middleware (/resources/library/a/themes/base/library-RTL.css)", async (t) => {
	const res = await request.get("/resources/library/a/themes/base/library-RTL.css");
	if (res.error) {
		throw new Error(res.error);
	}
	t.is(res.statusCode, 200, "Correct HTTP status code");
	t.regex(res.headers["content-type"], /css/, "Correct content type");
	t.is(res.text, `.library-a-foo {
  color: #fafad2;
  padding: 1px 4px 3px 2px;
}

/* Inline theming parameters */
#sap-ui-theme-library\\.a{background-image:url('data:text/plain;utf-8,%7B%22libraryAColor1%22%3A%22%23fafad2%22%7D')}
`, "Correct response");
});

test("Get library-parameters.json from theme middleware (/resources/library/a/themes/base/library-parameters.json)",
	async (t) => {
		const res = await request.get("/resources/library/a/themes/base/library-parameters.json");
		if (res.error) {
			throw new Error(res.error);
		}
		t.is(res.statusCode, 200, "Correct HTTP status code");
		t.regex(res.headers["content-type"], /json/, "Correct content type");
		t.deepEqual(res.body, {
			libraryAColor1: "#fafad2"
		}, "Correct response");
	});

test("Get css_variables.source.less from theme middleware (/resources/library/a/themes/base/css_variables.source.less)",
	async (t) => {
		const res = await request.get("/resources/library/a/themes/base/css_variables.source.less");
		if (res.error) {
			throw new Error(res.error);
		}
		t.is(res.statusCode, 200, "Correct HTTP status code");
		t.regex(res.headers["content-type"], /less/, "Correct content type");
		t.is(res.text, `@libraryAColor1: #fafad2;

:root {
--libraryAColor1: @libraryAColor1;
}
`, "Correct response");
	});

test("Get css_variables.css from theme middleware (/resources/library/a/themes/base/css_variables.css)", async (t) => {
	const res = await request.get("/resources/library/a/themes/base/css_variables.css");
	if (res.error) {
		throw new Error(res.error);
	}
	t.is(res.statusCode, 200, "Correct HTTP status code");
	t.regex(res.headers["content-type"], /css/, "Correct content type");
	t.is(res.text, `:root {
  --libraryAColor1: #fafad2;
}

/* Inline theming parameters */
#sap-ui-theme-library\\.a{background-image:url('data:text/plain;utf-8,%7B%22libraryAColor1%22%3A%22%23fafad2%22%7D')}
`, "Correct response");
});

test("Get library_skeleton.css from theme middleware (/resources/library/a/themes/base/library_skeleton.css)",
	async (t) => {
		const res = await request.get("/resources/library/a/themes/base/library_skeleton.css");
		if (res.error) {
			throw new Error(res.error);
		}
		t.is(res.statusCode, 200, "Correct HTTP status code");
		t.regex(res.headers["content-type"], /css/, "Correct content type");
		t.is(res.text, `.library-a-foo {
  color: var(--libraryAColor1);
  padding: 1px 2px 3px 4px;
}
`, "Correct response");
	});

test("Get library_skeleton-RTL.css from theme middleware (/resources/library/a/themes/base/library_skeleton-RTL.css)",
	async (t) => {
		const res = await request.get("/resources/library/a/themes/base/library_skeleton-RTL.css");
		if (res.error) {
			throw new Error(res.error);
		}
		t.is(res.statusCode, 200, "Correct HTTP status code");
		t.regex(res.headers["content-type"], /css/, "Correct content type");
		t.is(res.text, `.library-a-foo {
  color: var(--libraryAColor1);
  padding: 1px 4px 3px 2px;
}
`, "Correct response");
	});

test("Stop server", async (t) => {
	const port = 3350;
	const request = supertest(`http://localhost:${port}`);

	const graph = await generateProjectGraph({
		cwd: "./test/fixtures/application.a"
	});

	const serveResult = await server.serve(graph, {
		port: port
	});

	const res = await request.get("/resources/library/a/themes/base/library-parameters.json");

	if (res.error) {
		throw new Error(res.error);
	}
	t.is(res.statusCode, 200, "Correct HTTP status code");

	await new Promise((resolve, reject) => {
		serveResult.close((error) => {
			if (error) {
				reject(error);
			} else {
				t.pass("Server closing");
				resolve();
			}
		});
	});

	try {
		await request.get("/resources/library/a/themes/base/library-parameters.json");
		t.fail("Server was not closed!");
	} catch {
		t.pass("Server was closed properly.");
	}
});

test("CSP (defaults)", async (t) => {
	await Promise.all([
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
test("CSP (sap policies)", async (t) => {
	const port = 3400;
	const request = supertest(`http://localhost:${port}`);

	const graph = await generateProjectGraph({
		cwd: "./test/fixtures/application.a"
	});

	const serveResult = await server.serve(graph, {
		port,
		sendSAPTargetCSP: true,
		simpleIndex: false
	});

	const [result1, result2, result3, result4, result5, result6, result7, result8] = await Promise.all([
		request.get("/index.html"),
		request.get("/index.html?sap-ui-xx-csp-policy=sap-target-level-1"),
		request.get("/index.html?sap-ui-xx-csp-policy=sap-target-level-1:report-only"),
		request.get("/index.html?sap-ui-xx-csp-policy=sap-target-level-2"),
		request.get("/index.html?sap-ui-xx-csp-policy=sap-target-level-2:report-only"),
		request.get("/index.html?sap-ui-xx-csp-policy=default-src%20http%3a;"),
		request.get("/index.html?sap-ui-xx-csp-policy=default-src%20http%3a;:report-only"),
		request.get("/index.html?sap-ui-xx-csp-policy=default-src%20http%3a;:ro")
	]);

	t.is(result1.headers["content-security-policy"], undefined, "response must not have enforcing csp header");
	t.truthy(result1.headers["content-security-policy-report-only"],
		"response should have report-only csp header");
	t.regex(result1.headers["content-security-policy-report-only"], /script-src\s+'self'\s+'unsafe-eval'\s*;/,
		"header should contain the 1st default policy");
	t.regex(result1.headers["content-security-policy-report-only"], /script-src\s+'self'\s*;/,
		"header should contain the 2nd default policy");

	t.truthy(result2.headers["content-security-policy"], "response should have enforcing csp header");
	t.regex(result2.headers["content-security-policy"], /script-src\s+'self'\s+'unsafe-eval'\s*;/,
		"header should should have the expected content");
	t.truthy(result2.headers["content-security-policy-report-only"],
		"response should have report-only csp header");
	t.regex(result2.headers["content-security-policy-report-only"], /script-src\s+'self'\s*;/,
		"header should contain the 2nd default policy");

	t.is(result3.headers["content-security-policy"], undefined, "response must not have enforcing csp header");
	t.truthy(result3.headers["content-security-policy-report-only"],
		"response should have report-only csp header");
	t.regex(result3.headers["content-security-policy-report-only"], /script-src\s+'self'\s+'unsafe-eval'\s*;/,
		"header should should have the expected content");
	t.regex(result3.headers["content-security-policy-report-only"], /script-src\s+'self'\s*;/,
		"header should contain the 2nd default policy");

	t.truthy(result4.headers["content-security-policy"], "response should have enforcing csp header");
	t.regex(result4.headers["content-security-policy"], /script-src\s+'self'\s*;/,
		"header should should have the expected content");
	t.regex(result4.headers["content-security-policy-report-only"], /script-src\s+'self'\s*;/,
		"header should contain the 2nd default policy");

	t.is(result5.headers["content-security-policy"], undefined, "response must not have enforcing csp header");
	t.truthy(result5.headers["content-security-policy-report-only"],
		"response should have report-only csp header");
	t.regex(result5.headers["content-security-policy-report-only"], /script-src\s+'self'\s*;/,
		"header should have the expected content");

	t.truthy(result6.headers["content-security-policy"], "response should have enforcing csp header");
	t.regex(result6.headers["content-security-policy"], /default-src\s+http:\s*;/,
		"header should contain the configured policy");
	t.regex(result6.headers["content-security-policy-report-only"], /script-src\s+'self'\s*;/,
		"header should contain the 2nd default policy");

	t.is(result7.headers["content-security-policy"], undefined,
		"response must not have enforcing csp header");
	t.truthy(result7.headers["content-security-policy-report-only"],
		"response should have report-only csp header");
	t.regex(result7.headers["content-security-policy-report-only"], /default-src\s+http:\s*;/,
		"header should contain the configured policy");
	t.regex(result7.headers["content-security-policy-report-only"], /default-src\s+'self'\s*;/,
		"header should contain the 2nd default policy");

	t.is(result8.headers["content-security-policy"], undefined,
		"response must not have enforcing csp header");
	t.truthy(result8.headers["content-security-policy-report-only"],
		"response should have report-only csp header");
	t.regex(result8.headers["content-security-policy-report-only"], /default-src\s+http:\s*;/,
		"header should contain the configured policy");
	t.regex(result8.headers["content-security-policy-report-only"], /default-src\s+'self'\s*;/,
		"header should contain the 2nd default policy");

	await new Promise((resolve, reject) => {
		serveResult.close((error) => {
			if (error) {
				reject(error);
			} else {
				t.pass("Server closing");
				resolve();
			}
		});
	});
});

test("CSP serveCSPReports", async (t) => {
	const port = 3450;
	const request = supertest(`http://localhost:${port}`);

	const graph = await generateProjectGraph({
		cwd: "./test/fixtures/application.a"
	});

	const serveResult = await server.serve(graph, {
		port,
		serveCSPReports: true,
		simpleIndex: false
	});

	const cspReport = {
		"csp-report": {
			"document-uri": "https://otherserver:8080/index.html",
			"referrer": "",
			"violated-directive": "script-src-elem",
			"effective-directive": "script-src-elem",
			"original-policy": "default-src 'self' myserver:443; report-uri /report-csp-violation",
			"disposition": "report",
			"blocked-uri": "inline",
			"line-number": 17,
			"source-file": "https://otherserver:8080/index.html",
			"status-code": 0,
			"script-sample": ""
		}
	};

	await request.post("/.ui5/csp/report.csplog")
		.set("Content-Type", "application/csp-report")
	// to allow setting the content type the argument for sending must be a string
		.send(JSON.stringify(cspReport))
		.expect(200);

	const res = await request.get("/.ui5/csp/csp-reports.json");

	t.true(typeof res.body === "object", "the body is an object");
	t.true(Array.isArray(res.body["csp-reports"]), "csp-reports is an array");
	t.is(res.body["csp-reports"].length, 1, "one csp report in result");

	await new Promise((resolve, reject) => {
		serveResult.close((error) => {
			if (error) {
				reject(error);
			} else {
				t.pass("Server closing");
				resolve();
			}
		});
	});
});

test("CSP with ignore paths", async (t) => {
	const port = 3500;
	const request = supertest(`http://localhost:${port}`);

	const graph = await generateProjectGraph({
		cwd: "./test/fixtures/application.a"
	});

	const serveResult = await server.serve(graph, {
		port,
		serveCSPReports: true,
		sendSAPTargetCSP: true,
		simpleIndex: false
	});
	const testrunnerRequest1 = request.get("/test-resources/sap/ui/qunit/testrunner.html")
		.expect(200);
	const testrunnerRequest2 = request.get("/index.html")
		.set("Referer", `http://localhost:${port}/test-resources/sap/ui/qunit/testrunner.html`)
		.expect(200);
	const testrunnerRequest3 = request.get("/index.html")
		.expect(200);
	const [response1, response2, response3] = await Promise.all([
		testrunnerRequest1, testrunnerRequest2, testrunnerRequest3
	]);
	t.falsy(response1.headers["content-security-policy-report-only"], "url match");
	t.falsy(response2.headers["content-security-policy-report-only"], "referer match");
	t.truthy(response3.headers["content-security-policy-report-only"], "no match");

	// close connection
	await new Promise((resolve, reject) => {
		serveResult.close((error) => {
			if (error) {
				reject(error);
			} else {
				t.pass("Server closing");
				resolve();
			}
		});
	});
});

test("Get index of resources", async (t) => {
	await Promise.all([
		request.get("").then((res) => {
			t.is(res.statusCode, 200, "Correct HTTP status code");
			t.is(res.headers["content-type"], "text/html; charset=utf-8", "Correct content type");
			t.is(/<title>(.*)<\/title>/i.exec(res.text)[1], "Index of /", "Found correct title");
			t.is(res.text.match(/<li/g).length, 9, "Found correct amount of <li> elements");
		}),
		request.get("/resources").then((res) => {
			t.is(res.statusCode, 200, "Correct HTTP status code");
			t.is(res.headers["content-type"], "text/html; charset=utf-8", "Correct content type");
			t.is(/<title>(.*)<\/title>/i.exec(res.text)[1], "Index of /resources", "Found correct title");
			t.is(res.text.match(/<li/g).length, 2, "Found correct amount of <li> elements");
		}),
		request.get("/resources/").then((res) => {
			t.is(res.statusCode, 200, "Correct HTTP status code");
			t.is(res.headers["content-type"], "text/html; charset=utf-8", "Correct content type");
			t.is(/<title>(.*)<\/title>/i.exec(res.text)[1], "Index of /resources/", "Found correct title");
			t.is(res.text.match(/<li/g).length, 2, "Found correct amount of <li> elements");
		}),
		request.get("/not-existing-folder").then((res) => {
			t.is(res.statusCode, 404, "Correct HTTP status code");
			t.is(res.headers["content-type"], "text/html; charset=utf-8", "Correct content type");
			t.is(/<title>(.*)<\/title>/i.exec(res.text)[1], "Error", "Found correct title");
			t.is(res.text.match(/<pre/g).length, 1, "Found correct amount of <pre> elements");
		})
	]);
});
