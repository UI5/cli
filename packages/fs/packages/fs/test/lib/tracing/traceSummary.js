import test from "ava";
import sinon from "sinon";
import esmock from "esmock";

async function createMock(t, isLevelEnabled=true) {
	t.context.loggerStub = {
		silly: sinon.stub(),
		isLevelEnabled: () => {
			return isLevelEnabled;
		}
	};
	t.context.traceSummary = await esmock("../../../lib/tracing/traceSummary.js", {
		"@ui5/logger": {
			getLogger: sinon.stub().returns(t.context.loggerStub)
		}
	});
	return t.context;
}

test.afterEach.always((t) => {
	sinon.restore();
});

test.serial("traceSummary", async (t) => {
	t.plan(2);

	const {traceSummary, loggerStub} = await createMock(t);

	// Measure always constant time
	sinon.stub(process, "hrtime").returns([3, 426604599]);

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
	await traceSummary.traceEnded();

	t.is(loggerStub.silly.callCount, 1, "Logger has been called exactly once");
	t.deepEqual(loggerStub.silly.getCall(0).args[0], expectedReport, "Correct report logged to the console");
});

test.serial("traceSummary no silly logging", async (t) => {
	t.plan(1);

	const {traceSummary, loggerStub} = await createMock(t, false);

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
	await traceSummary.traceEnded();

	t.is(loggerStub.silly.callCount, 0, "Logger has not been called (due to disabled silly logging)");
});
