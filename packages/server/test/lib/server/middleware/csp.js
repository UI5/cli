const test = require("ava");
const cspMiddleware = require("../../../../lib/middleware/csp");

test("Default Settings", (t) => {
	t.plan(3 + 7); // fourth request should end in middleware and not call next!
	const middleware = cspMiddleware("sap-ui-xx-csp-policy", {});
	const res = {
		getHeader: function() {
			return undefined;
		},
		setHeader: function(header, value) {
			t.fail(`should not be called with header ${header} and value ${value}`);
		}
	};
	const next = function() {
		t.pass("Next was called.");
	};
	const noNext = function() {
		t.fail("Next should not be called");
	};

	middleware({method: "GET", url: "/test.html", headers: {}}, res, next);
	middleware({
		method: "GET",
		url: "/test.html?sap-ui-xx-csp-policy=sap-target-level-2",
		headers: {}
	}, res, next);
	middleware({method: "POST", url: "somePath", headers: {}}, res, next);
	middleware({
		method: "POST",
		url: "/dummy.csplog",
		headers: {"content-type": "application/csp-report"}
	}, res, noNext);

	// check that unsupported methods result in a call to next()
	["CONNECT", "DELETE", "HEAD", "OPTIONS", "PATCH", "PUT", "TRACE"].forEach(
		(method) => middleware({method, url: "/dummy.csplog", headers: {}}, res, next)
	);
});

test("Custom Settings", (t) => {
	const middleware = cspMiddleware("csp", {
		definedPolicies: {
			policy1: "default-src 'self';",
			policy2: "default-src http:;",
			policy3: "default-src https:;"
		},
		defaultPolicy: "policy1",
		defaultPolicyIsReportOnly: false,
		defaultPolicy2: "policy2",
		defaultPolicy2IsReportOnly: false,
		allowDynamicPolicySelection: true,
		allowDynamicPolicyDefinition: true
	});
	let expected;
	const res = {
		getHeader: function() {
			return undefined;
		},
		setHeader: function(header, value) {
			if ( header.toLowerCase() === "content-security-policy" ) {
				t.is(value, expected.shift(), "should have the expected value");
			} else {
				t.fail(`should not be called with header ${header} and value ${value}`);
			}
		}
	};
	const next = function() {
		t.pass("Next was called.");
	};

	expected = ["default-src 'self';", "default-src http:;"];
	middleware({method: "GET", url: "/test.html", headers: {}}, res, next);

	expected = ["default-src https:;", "default-src http:;"];
	middleware({method: "GET", url: "/test.html?csp=policy3", headers: {}}, res, next);

	expected = ["default-src ftp:;", "default-src http:;"];
	middleware({method: "GET", url: "/test.html?csp=default-src%20ftp:;", headers: {}}, res, next);
});

test("No Dynamic Policy Definition", (t) => {
	const middleware = cspMiddleware("csp", {
		definedPolicies: {
			policy1: "default-src 'self';",
			policy2: "default-src http:;"
		},
		defaultPolicy: "policy1",
		defaultPolicyIsReportOnly: false,
		defaultPolicy2: "policy2",
		defaultPolicy2IsReportOnly: false,
		allowDynamicPolicyDefinition: false
	});
	const res = {
		getHeader: function() {
			return undefined;
		},
		setHeader: function(header, value) {
			if ( header.toLowerCase() === "content-security-policy" ) {
				t.is(value, expected.shift(), "should have the expected value");
			} else {
				t.fail(`should not be called with header ${header} and value ${value}`);
			}
		}
	};
	const next = function() {
		t.pass("Next was called.");
	};

	const expected = ["default-src 'self';", "default-src http:;"];
	middleware({method: "GET", url: "/test.html?csp=default-src%20ftp:;", headers: {}}, res, next);
});

test("Header Manipulation", (t) => {
	const middleware = cspMiddleware("csp", {
		definedPolicies: {
			policy1: "default-src 'self';",
			policy2: "default-src http:;"
		},
		defaultPolicy: "policy1",
		defaultPolicyIsReportOnly: false,
		defaultPolicy2: "policy2",
		defaultPolicy2IsReportOnly: false
	});
	let cspHeader = "default-src: spdy:";
	const res = {
		getHeader: function() {
			return cspHeader;
		},
		setHeader: function(header, value) {
			if ( header.toLowerCase() === "content-security-policy" ) {
				cspHeader = value;
			} else {
				t.fail(`should not be called with header ${header} and value ${value}`);
			}
		}
	};
	const next = function() {};

	middleware({method: "GET", url: "/test.html", headers: {}}, res, next);
	t.deepEqual(cspHeader, ["default-src: spdy:", "default-src 'self';", "default-src http:;"]);
});
