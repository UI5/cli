const {test} = require("ava");
const nonReadRequestsMiddleware = require("../../../../lib/middleware/nonReadRequests");

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

	middleware({method: "GET", path: "somePath"}, res, next);
	middleware({method: "HEAD", path: "somePath"}, res, next);
	middleware({method: "OPTIONS", path: "somePath"}, res, next);
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
			status: function(status) {
				t.deepEqual(status, 404, "Status should be 404");
				return {
					end: function(message) {
						t.deepEqual(message, "Cannot " + method + " somePath", "Finished with error message.");
					}
				};
			}
		};

		middleware({method: method, path: "somePath"}, res, next);
	});
});
