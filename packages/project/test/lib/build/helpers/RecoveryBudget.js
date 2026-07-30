import test from "ava";
import sinon from "sinon";
import RecoveryBudget, {
	WATCHER_RECOVERY_MAX_ATTEMPTS, WATCHER_RECOVERY_WINDOW_MS,
} from "../../../../lib/build/helpers/RecoveryBudget.js";

test.afterEach.always(() => {
	sinon.restore();
});

test.serial("withinBudget: allows up to maxAttempts recorded recoveries, then refuses", (t) => {
	const clock = sinon.useFakeTimers();
	const budget = new RecoveryBudget(3, 1000);

	for (let i = 0; i < 3; i++) {
		t.true(budget.withinBudget(), `attempt ${i + 1} is within budget`);
		budget.recordRecovery();
	}
	t.false(budget.withinBudget(), "the attempt past maxAttempts is refused");

	clock.restore();
});

test.serial("withinBudget: recoveries older than the window no longer count", (t) => {
	const clock = sinon.useFakeTimers();
	const budget = new RecoveryBudget(2, 1000);

	budget.recordRecovery();
	budget.recordRecovery();
	t.false(budget.withinBudget(), "budget exhausted within the window");

	// Advance past the window: the earlier recoveries fall out and the budget frees up.
	clock.tick(1001);
	t.true(budget.withinBudget(), "recoveries outside the window are pruned");

	clock.restore();
});

test("defaults: constructed budget uses the exported default attempts/window", (t) => {
	const clock = sinon.useFakeTimers();
	const budget = new RecoveryBudget();

	for (let i = 0; i < WATCHER_RECOVERY_MAX_ATTEMPTS; i++) {
		t.true(budget.withinBudget());
		budget.recordRecovery();
	}
	t.false(budget.withinBudget(), "refuses past the default max attempts");

	// Still refused just inside the default window, allowed just past it.
	clock.tick(WATCHER_RECOVERY_WINDOW_MS - 1);
	t.false(budget.withinBudget());
	clock.tick(2);
	t.true(budget.withinBudget());

	clock.restore();
});
