const {test} = require("ava");
const sinon = require("sinon");
const logger = require("@ui5/logger");

test("traceSummary", async (t) => {
	t.plan(2);

	const myLoggerInstance = logger.getLogger("resources:tracing:total");
	const loggerStub = sinon.stub(logger, "getLogger").returns(myLoggerInstance);
	const logSpy = sinon.spy(myLoggerInstance, "verbose");

	// Measure always constant time
	const hrtimeStub = sinon.stub(process, "hrtime").returns([3, 426604599]);
	const traceSummary = require("../../../lib/tracing/traceSummary");

	const expectedReport = "==========================\n[=> TRACE SUMMARY:\n" +
		"  3.43 s elapsed time \n" +
		"  1 trace calls \n" +
		"  1 glob executions\n" +
		"  1 path stats\n" +
		"  1 rl-collections involed:\n" +
		"      2x collection_two\n" +
		"======================]";

	// Add collection, byPath call and byGlob call w/o having a an active tracing started yet.
	// Those calls will not be traced.
	traceSummary.collection("collection_one");
	traceSummary.pathCall();
	traceSummary.globCall();

	// Start tracing
	traceSummary.traceStarted();

	traceSummary.collection("collection_two");

	// Add an already existing collection
	traceSummary.collection("collection_two");

	traceSummary.pathCall();
	traceSummary.globCall();

	// Print reporting and reset tracing
	return traceSummary.traceEnded().then(function() {
		t.pass("Tracing has been reported and reset");
		t.true(logSpy.calledWithExactly(expectedReport), "Correct report logged to the console");

		loggerStub.restore();
		logSpy.restore();
		hrtimeStub.restore();
	});
});
