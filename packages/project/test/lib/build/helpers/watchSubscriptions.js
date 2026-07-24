import test from "ava";
import sinon from "sinon";
import {drainSubscriptions} from "../../../../lib/build/helpers/watchSubscriptions.js";

test("drainSubscriptions: unsubscribes every subscription and returns no failures on success", async (t) => {
	const subs = [
		{unsubscribe: sinon.stub().resolves()},
		{unsubscribe: sinon.stub().resolves()},
	];

	const failures = await drainSubscriptions(subs);

	t.deepEqual(failures, [], "no failures when all unsubscribe cleanly");
	t.true(subs[0].unsubscribe.calledOnce);
	t.true(subs[1].unsubscribe.calledOnce);
});

test("drainSubscriptions: unsubscribes all in parallel even when some reject, collecting the reasons",
	async (t) => {
		const errA = new Error("unsub A failed");
		const errC = new Error("unsub C failed");
		const subs = [
			{unsubscribe: sinon.stub().rejects(errA)},
			{unsubscribe: sinon.stub().resolves()},
			{unsubscribe: sinon.stub().rejects(errC)},
		];

		const failures = await drainSubscriptions(subs);

		t.deepEqual(failures, [errA, errC], "returns the reasons of the rejected unsubscribes only");
		t.true(subs[1].unsubscribe.calledOnce, "a rejecting sibling does not prevent the others");
	});

test("drainSubscriptions: an empty list resolves to no failures", async (t) => {
	t.deepEqual(await drainSubscriptions([]), []);
});
