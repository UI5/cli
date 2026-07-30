import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import path from "node:path";

let waitForProjectGraphSettled;
let subscribeStub;
let findExistingDirStub;

const fixturePath = (p) => path.resolve(p);

test.before(async () => {
	subscribeStub = sinon.stub();
	findExistingDirStub = sinon.stub();
	({waitForProjectGraphSettled} = await esmock("../../../lib/graph/projectGraphSettleWatcher.js", {
		"../../../lib/utils/fsHelper.js": {
			findExistingDir: findExistingDirStub
		},
		"@parcel/watcher": {
			default: {
				subscribe: subscribeStub
			}
		}
	}));
});

test.afterEach.always(() => {
	sinon.restore();
	subscribeStub.reset();
	findExistingDirStub.reset();
});

function createMockSubscription() {
	return {
		unsubscribe: sinon.stub().resolves()
	};
}

function createGraph(projects) {
	return {
		traverseBreadthFirst: async (cb) => {
			for (const p of projects) {
				await cb({project: {getRootPath: () => p.rootPath}});
			}
		}
	};
}

function markExistingDirs(dirs) {
	const existingDirs = new Set(dirs.map((dir) => path.resolve(dir)));
	// Reproduce findExistingDir's walk-up: return the nearest existing ancestor of the queried dir.
	findExistingDirStub.callsFake(async (dir) => {
		let current = path.resolve(dir);
		while (!existingDirs.has(current)) {
			const parent = path.dirname(current);
			if (parent === current) {
				return current;
			}
			current = parent;
		}
		return current;
	});
}

async function waitForSubscriptions(count, clock) {
	for (let i = 0; i < 10; i++) {
		if (subscribeStub.callCount >= count) {
			return;
		}
		if (clock) {
			await clock.tickAsync(0);
		} else {
			await Promise.resolve();
		}
	}
}

test.serial("waitForProjectGraphSettled: subscribes pruned project roots without node_modules ignore", async (t) => {
	const subscriptions = [];
	subscribeStub.callsFake(async () => {
		const subscription = createMockSubscription();
		subscriptions.push(subscription);
		return subscription;
	});
	const appRoot = fixturePath("/repo/app");
	const nestedDepRoot = fixturePath("/repo/app/node_modules/@scope/lib");
	const externalDepRoot = fixturePath("/external/lib");
	const graph = createGraph([
		{rootPath: appRoot},
		{rootPath: nestedDepRoot},
		{rootPath: externalDepRoot},
	]);
	markExistingDirs([appRoot, nestedDepRoot, externalDepRoot]);
	const clock = sinon.useFakeTimers();

	const wait = waitForProjectGraphSettled(graph, {settleMs: 550});
	await waitForSubscriptions(2, clock);

	const dirs = subscribeStub.getCalls().map((c) => c.args[0]).sort();
	t.deepEqual(dirs, [appRoot, externalDepRoot].sort(),
		"nested roots are covered by an already selected parent root");
	for (const call of subscribeStub.getCalls()) {
		t.deepEqual(call.args[2].ignore, ["**/.git/**"], "the recovery watcher observes node_modules");
	}

	await clock.tickAsync(550);
	await wait;
	t.true(subscriptions.every((subscription) => subscription.unsubscribe.calledOnce),
		"subscriptions are torn down after settling");
	clock.restore();
});

test.serial("waitForProjectGraphSettled: observes last-good roots missing from the candidate graph", async (t) => {
	const subscription = createMockSubscription();
	let callback;
	subscribeStub.callsFake(async (_dir, cb) => {
		callback = cb;
		return subscription;
	});
	const testsuiteRoot = fixturePath("/repo/src/testsuite");
	const themeRoot = fixturePath("/repo/src/themelib_sap_horizon");
	const srcRoot = fixturePath("/repo/src");
	const candidateGraph = createGraph([{rootPath: testsuiteRoot}]);
	const lastGoodGraph = createGraph([{rootPath: testsuiteRoot}, {rootPath: themeRoot}]);
	markExistingDirs([srcRoot, testsuiteRoot]);
	const clock = sinon.useFakeTimers();
	let resolved = false;

	const wait = waitForProjectGraphSettled([candidateGraph, lastGoodGraph], {settleMs: 550}).then(() => {
		resolved = true;
	});
	await waitForSubscriptions(1, clock);

	t.is(subscribeStub.firstCall.args[0], srcRoot,
		"the missing last-good project root is covered by its nearest existing ancestor");

	await clock.tickAsync(500);
	callback(null, [{type: "create", path: path.join(themeRoot, "src", "sap_horizon_dark", "library.less")}]);

	await clock.tickAsync(100);
	t.false(resolved, "the restored last-good root reset the timer before the original window fired");

	await clock.tickAsync(450);
	await wait;
	t.true(resolved, "settled after the restored root quieted");
	clock.restore();
});

// An edge case the settler does not cover on its own: if the target branch adds a project that was
// unknown to both the last-good graph and the early candidate graph, recovery must observe it once
// it surfaces. The settler only watches the roots it is handed, so this guarantee lives one level up
// in the Supervisor's recovery convergence loop, which re-resolves until the root set stops growing
// and feeds each expanded graph back to the settler. See the Supervisor test "degraded recovery
// observes a target-only root across convergence iterations".

test.serial("waitForProjectGraphSettled: file events reset the quiet window", async (t) => {
	const subscription = createMockSubscription();
	let callback;
	subscribeStub.callsFake(async (_dir, cb) => {
		callback = cb;
		return subscription;
	});
	const appRoot = fixturePath("/repo/app");
	const graph = createGraph([{rootPath: appRoot}]);
	markExistingDirs([appRoot]);
	const clock = sinon.useFakeTimers();
	let resolved = false;

	const wait = waitForProjectGraphSettled(graph, {settleMs: 550}).then(() => {
		resolved = true;
	});
	await waitForSubscriptions(1, clock);

	await clock.tickAsync(500);
	callback(null, [{type: "create", path: path.join(appRoot, "node_modules/@scope/lib/src/file.js")}]);

	await clock.tickAsync(100);
	t.false(resolved, "the event reset the timer before the original window fired");

	await clock.tickAsync(449);
	t.false(resolved, "still waiting for the full quiet window after the event");

	await clock.tickAsync(1);
	await wait;
	t.true(resolved, "settled after the extended quiet window elapsed");
	t.true(subscription.unsubscribe.calledOnce, "subscription is torn down after settling");
	clock.restore();
});

test.serial("waitForProjectGraphSettled: watcher errors reject and tear down subscriptions", async (t) => {
	const subscription = createMockSubscription();
	let callback;
	subscribeStub.callsFake(async (_dir, cb) => {
		callback = cb;
		return subscription;
	});
	const graph = createGraph([{rootPath: fixturePath("/repo/app")}]);
	markExistingDirs([fixturePath("/repo/app")]);
	const wait = waitForProjectGraphSettled(graph, {settleMs: 550});
	await waitForSubscriptions(1);

	const err = new Error("watcher failed");
	callback(err);

	const thrown = await t.throwsAsync(wait);
	t.is(thrown, err);
	t.true(subscription.unsubscribe.calledOnce, "subscription is torn down after the watcher error");
});
