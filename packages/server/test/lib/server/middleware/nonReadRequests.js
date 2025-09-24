import test from "ava";
import nonReadRequestsMiddleware from "../../../../lib/middleware/nonReadRequests.js";

test("Read requests", (t) => {
	t.plan(3);
	const middleware = nonReadRequestsMiddleware();
	const res = {
		status: function(status) {
			t.fail("should not be called with status " + status);
		}
	};
	const next = function() {
		t.pass("Next was called.");
	};

	middleware({method: "GET", url: "/somePath"}, res, next);
	middleware({method: "HEAD", url: "/somePath"}, res, next);
	middleware({method: "OPTIONS", url: "/somePath"}, res, next);
});

test("Non read requests results in status 404 and an error message", (t) => {
	t.plan(6);
	const middleware = nonReadRequestsMiddleware();
	const next = function() {
		t.pass("Next was called.");
	};

	let res;
	const methods = ["POST", "PUT", "DELETE"];
	methods.forEach(function(method) {
		res = {
			statusCode: 200,
			end: function(message) {
				t.is(res.statusCode, 404, "Status should be 404");
				t.deepEqual(message, "Cannot " + method + " /somePath", "Finished with error message.");
			}
		};

		middleware({method: method, url: "/somePath"}, res, next);
	});
});
