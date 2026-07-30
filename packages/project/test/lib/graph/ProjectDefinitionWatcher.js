import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import path from "node:path";

let ProjectDefinitionWatcher;
let subscribeStub;

const fixturePath = (p) => path.resolve(p);
const fixtureFile = (root, ...segments) => path.join(fixturePath(root), ...segments);

test.before(async () => {
	subscribeStub = sinon.stub();
	ProjectDefinitionWatcher = await esmock("../../../lib/graph/ProjectDefinitionWatcher.js", {
		"@parcel/watcher": {
			default: {
				subscribe: subscribeStub
			}
		}
	});
});

test.afterEach.always(() => {
	sinon.restore();
	subscribeStub.reset();
});

function createMockSubscription() {
	return {
		unsubscribe: sinon.stub().resolves()
	};
}

// A fake graph with a root project plus the given dependency roots. Each entry is {name, rootPath}.
function createGraph(root, deps = []) {
	const projects = [root, ...deps];
	return {
		getRoot: () => ({getName: () => root.name}),
		traverseBreadthFirst: async (cb) => {
			for (const p of projects) {
				await cb({project: {getName: () => p.name, getRootPath: () => p.rootPath}});
			}
		}
	};
}

// Captures the change callback of the subscription for a given directory, keyed by the subscribe
// call's first argument.
function captureCallbacks(subscription = createMockSubscription()) {
	const callbacks = new Map();
	subscribeStub.callsFake(async (dir, cb) => {
		callbacks.set(dir, cb);
		return subscription;
	});
	return callbacks;
}

test.serial("create: subscribes each project definition directory with ui5.yaml + package.json", async (t) => {
	captureCallbacks();
	const appRoot = fixturePath("/app");
	const depARoot = fixturePath("/deps/a");
	const depBRoot = fixturePath("/deps/b");
	const graph = createGraph(
		{name: "root", rootPath: appRoot},
		[{name: "dep-a", rootPath: depARoot}, {name: "dep-b", rootPath: depBRoot}]
	);

	const watcher = await ProjectDefinitionWatcher.create({graph});

	const dirs = subscribeStub.getCalls().map((c) => c.args[0]).sort();
	t.deepEqual(dirs, [appRoot, depARoot, depBRoot].sort(), "each project root is subscribed directly");
	for (const call of subscribeStub.getCalls()) {
		t.deepEqual(call.args[2].ignore, ["**/node_modules/**", "**/.git/**"], "ignore globs passed");
	}

	await watcher.destroy();
});

test.serial("create: project roots below node_modules are watched without the node_modules ignore", async (t) => {
	captureCallbacks();
	const appRoot = fixturePath("/app");
	const depRoot = fixturePath("/app/node_modules/@scope/lib");
	const graph = createGraph(
		{name: "root", rootPath: appRoot},
		[{name: "@scope/lib", rootPath: depRoot}]
	);

	const watcher = await ProjectDefinitionWatcher.create({graph});

	const appCall = subscribeStub.getCalls().find((c) => c.args[0] === appRoot);
	const depCall = subscribeStub.getCalls().find((c) => c.args[0] === depRoot);
	t.truthy(appCall, "root project directory subscribed");
	t.truthy(depCall, "dependency project directory subscribed");
	t.deepEqual(appCall.args[2].ignore, ["**/node_modules/**", "**/.git/**"],
		"regular project roots keep the node_modules ignore");
	t.deepEqual(depCall.args[2].ignore, ["**/.git/**"],
		"project roots inside node_modules must see their own definition files");

	const emitted = [];
	watcher.on("definitionChanged", (e) => emitted.push(e));
	const clock = sinon.useFakeTimers();
	const depUi5Yaml = fixtureFile("/app/node_modules/@scope/lib", "ui5.yaml");
	depCall.args[1](null, [{type: "update", path: depUi5Yaml}]);
	clock.tick(600);
	clock.restore();
	t.deepEqual(emitted[0], {eventType: "update", filePath: depUi5Yaml},
		"dependency definition event below node_modules emits");

	await watcher.destroy();
});

test.serial("create: shared parent directory is subscribed once", async (t) => {
	captureCallbacks();
	const monoRoot = fixturePath("/mono");
	// Two projects under the same directory: only one subscription for that dir.
	const graph = createGraph(
		{name: "root", rootPath: monoRoot},
		[{name: "dep-a", rootPath: monoRoot}]
	);

	const watcher = await ProjectDefinitionWatcher.create({graph});

	t.is(subscribeStub.callCount, 1, "distinct directory subscribed once");
	t.is(subscribeStub.firstCall.args[0], monoRoot);

	await watcher.destroy();
});

test.serial("create: custom rootConfigPath replaces root ui5.yaml and subscribes its directory", async (t) => {
	captureCallbacks();
	const appRoot = fixturePath("/app");
	const configPath = fixtureFile("/configs", "custom.yaml");
	const configDir = path.dirname(configPath);
	const graph = createGraph({name: "root", rootPath: appRoot});

	const watcher = await ProjectDefinitionWatcher.create({
		graph, rootConfigPath: configPath, cwd: appRoot
	});

	const dirs = subscribeStub.getCalls().map((c) => c.args[0]).sort();
	t.deepEqual(dirs, [appRoot, configDir].sort(), "subscribes the custom config's directory too");

	const emitted = [];
	watcher.on("definitionChanged", (e) => emitted.push(e));

	const clock = sinon.useFakeTimers();
	// The root's default ui5.yaml must NOT be watched.
	const rootCb = subscribeStub.getCalls().find((c) => c.args[0] === appRoot).args[1];
	rootCb(null, [{type: "update", path: fixtureFile("/app", "ui5.yaml")}]);
	clock.tick(600);
	t.is(emitted.length, 0, "default root ui5.yaml is not watched when a custom config is set");

	// The custom config must be watched.
	const configCb = subscribeStub.getCalls().find((c) => c.args[0] === configDir).args[1];
	configCb(null, [{type: "update", path: configPath}]);
	clock.tick(600);
	clock.restore();
	t.is(emitted.length, 1, "custom config change emits");

	await watcher.destroy();
});

test.serial("create: relative rootConfigPath is resolved against cwd", async (t) => {
	captureCallbacks();
	const appRoot = fixturePath("/app");
	const customConfigPath = fixtureFile("/app", "custom", "ui5.yaml");
	const graph = createGraph({name: "root", rootPath: appRoot});

	const watcher = await ProjectDefinitionWatcher.create({
		graph, rootConfigPath: "custom/ui5.yaml", cwd: appRoot
	});

	const dirs = subscribeStub.getCalls().map((c) => c.args[0]);
	t.true(dirs.includes(appRoot), "project root subscription covers relative config below cwd");

	const emitted = [];
	watcher.on("definitionChanged", (e) => emitted.push(e));
	const clock = sinon.useFakeTimers();
	subscribeStub.firstCall.args[1](null, [{type: "update", path: customConfigPath}]);
	clock.tick(600);
	clock.restore();
	t.deepEqual(emitted[0], {eventType: "update", filePath: customConfigPath},
		"relative config resolved against cwd");

	await watcher.destroy();
});

test.serial("create: workspaceConfigPath included (default filename applied) when set", async (t) => {
	captureCallbacks();
	const graph = createGraph({name: "root", rootPath: fixturePath("/app")});
	const workspaceRoot = fixturePath("/ws");

	// null -> active, use default filename ui5-workspace.yaml at cwd.
	const watcher = await ProjectDefinitionWatcher.create({graph, workspaceConfigPath: null, cwd: workspaceRoot});

	const wsCall = subscribeStub.getCalls().find((c) => c.args[0] === workspaceRoot);
	t.truthy(wsCall, "workspace directory subscribed");

	const emitted = [];
	watcher.on("definitionChanged", (e) => emitted.push(e));
	const clock = sinon.useFakeTimers();
	wsCall.args[1](null, [{type: "create", path: fixtureFile("/ws", "ui5-workspace.yaml")}]);
	clock.tick(600);
	clock.restore();
	t.is(emitted.length, 1, "workspace config change emits");

	await watcher.destroy();
});

test.serial("create: workspaceConfigPath undefined skips the workspace file", async (t) => {
	captureCallbacks();
	const graph = createGraph({name: "root", rootPath: fixturePath("/app")});
	const workspaceRoot = fixturePath("/ws");

	const watcher = await ProjectDefinitionWatcher.create({graph, workspaceConfigPath: undefined, cwd: workspaceRoot});

	t.falsy(subscribeStub.getCalls().find((c) => c.args[0] === workspaceRoot), "workspace dir not subscribed");
	await watcher.destroy();
});

test.serial("create: dependencyDefinitionPath is watched when present", async (t) => {
	captureCallbacks();
	const appRoot = fixturePath("/app");
	const graph = createGraph({name: "root", rootPath: appRoot});

	const watcher = await ProjectDefinitionWatcher.create({
		graph, dependencyDefinitionPath: "deps.yaml", cwd: appRoot
	});

	const emitted = [];
	watcher.on("definitionChanged", (e) => emitted.push(e));
	const appCall = subscribeStub.getCalls().find((c) => c.args[0] === appRoot);
	const clock = sinon.useFakeTimers();
	appCall.args[1](null, [{type: "update", path: fixtureFile("/app", "deps.yaml")}]);
	clock.tick(600);
	clock.restore();
	t.is(emitted.length, 1, "static dependency definition change emits");

	await watcher.destroy();
});

test.serial("filtering: non-definition file events do not emit", async (t) => {
	captureCallbacks();
	const graph = createGraph({name: "root", rootPath: fixturePath("/app")});
	const watcher = await ProjectDefinitionWatcher.create({graph});
	const callback = subscribeStub.firstCall.args[1];

	const emitted = [];
	watcher.on("definitionChanged", (e) => emitted.push(e));

	const clock = sinon.useFakeTimers();
	callback(null, [
		{type: "update", path: fixtureFile("/app", "src", "main.js")},
		{type: "create", path: fixtureFile("/app", "node_modules", "foo", "package.json")}
	]);
	clock.tick(600);
	clock.restore();

	t.is(emitted.length, 0, "source file and node_modules path filtered out");
	await watcher.destroy();
});

test.serial("filtering: a watched ui5.yaml event emits", async (t) => {
	captureCallbacks();
	const graph = createGraph({name: "root", rootPath: fixturePath("/app")});
	const ui5YamlPath = fixtureFile("/app", "ui5.yaml");
	const watcher = await ProjectDefinitionWatcher.create({graph});
	const callback = subscribeStub.firstCall.args[1];

	const emitted = [];
	watcher.on("definitionChanged", (e) => emitted.push(e));

	const clock = sinon.useFakeTimers();
	callback(null, [{type: "update", path: ui5YamlPath}]);
	clock.tick(600);
	clock.restore();

	t.is(emitted.length, 1, "watched ui5.yaml emits");
	t.deepEqual(emitted[0], {eventType: "update", filePath: ui5YamlPath});
	await watcher.destroy();
});

test.serial("settle: a burst within the window emits definitionChanged exactly once", async (t) => {
	captureCallbacks();
	const graph = createGraph({name: "root", rootPath: fixturePath("/app")});
	const watcher = await ProjectDefinitionWatcher.create({graph});
	const callback = subscribeStub.firstCall.args[1];

	const emitted = [];
	watcher.on("definitionChanged", (e) => emitted.push(e));

	const clock = sinon.useFakeTimers();
	// A checkout burst: ui5.yaml + package.json + a source, spread across batches within the window.
	callback(null, [{type: "update", path: fixtureFile("/app", "ui5.yaml")}]);
	clock.tick(200);
	callback(null, [{type: "update", path: fixtureFile("/app", "package.json")}]);
	clock.tick(200);
	callback(null, [{type: "update", path: fixtureFile("/app", "src", "main.js")}]);
	clock.tick(200); // 200 < 550 from the source event that extended the active burst
	t.is(emitted.length, 0, "not yet emitted mid-burst");
	clock.tick(600); // quiet past the window
	t.is(emitted.length, 1, "collapsed to a single emit");

	// A later, separate change emits again.
	callback(null, [{type: "update", path: fixtureFile("/app", "ui5.yaml")}]);
	clock.tick(600);
	t.is(emitted.length, 2, "later change emits again");
	clock.restore();

	await watcher.destroy();
});

test.serial("settle: non-definition events extend an active definition burst", async (t) => {
	captureCallbacks();
	const graph = createGraph({name: "root", rootPath: fixturePath("/app")});
	const ui5YamlPath = fixtureFile("/app", "ui5.yaml");
	const watcher = await ProjectDefinitionWatcher.create({graph});
	const callback = subscribeStub.firstCall.args[1];

	const emitted = [];
	watcher.on("definitionChanged", (e) => emitted.push(e));

	const clock = sinon.useFakeTimers();
	callback(null, [{type: "update", path: ui5YamlPath}]);
	clock.tick(500);
	callback(null, [{type: "update", path: fixtureFile("/app", "src", "main.js")}]);

	clock.tick(100);
	t.is(emitted.length, 0, "the source event reset the timer before the original window fired");

	clock.tick(449);
	t.is(emitted.length, 0, "still waiting for the full quiet window after the source event");

	clock.tick(1);
	t.is(emitted.length, 1, "emits once the extended quiet window elapses");
	t.deepEqual(emitted[0], {eventType: "update", filePath: ui5YamlPath},
		"the payload remains the watched definition event");
	clock.restore();

	await watcher.destroy();
});

test.serial("settle: events below a nested dependency root extend an active definition burst", async (t) => {
	captureCallbacks();
	const appRoot = fixturePath("/repo/app");
	const themeRoot = fixturePath("/repo/app/node_modules/@openui5/themelib_sap_horizon");
	const graph = createGraph(
		{name: "root", rootPath: appRoot},
		[{name: "themelib_sap_horizon", rootPath: themeRoot}]
	);
	const ui5YamlPath = fixtureFile("/repo/app", "ui5.yaml");
	const watcher = await ProjectDefinitionWatcher.create({graph});

	const appCallback = subscribeStub.getCalls().find((c) => c.args[0] === appRoot).args[1];
	const themeCallback = subscribeStub.getCalls().find((c) => c.args[0] === themeRoot).args[1];
	const emitted = [];
	watcher.on("definitionChanged", (e) => emitted.push(e));

	const clock = sinon.useFakeTimers();
	appCallback(null, [{type: "update", path: ui5YamlPath}]);
	clock.tick(500);
	themeCallback(null, [{
		type: "create",
		path: fixtureFile("/repo/app/node_modules/@openui5/themelib_sap_horizon", "src", "Base.less")
	}]);

	clock.tick(100);
	t.is(emitted.length, 0, "the dependency-root event reset the timer before the original window fired");

	clock.tick(450);
	t.is(emitted.length, 1, "emits once the extended quiet window elapses");
	t.deepEqual(emitted[0], {eventType: "update", filePath: ui5YamlPath},
		"the payload remains the watched definition event");
	clock.restore();

	await watcher.destroy();
});

test.serial("leading edge: definitionChanging fires once on the first event of a burst, before definitionChanged",
	async (t) => {
		captureCallbacks();
		const graph = createGraph({name: "root", rootPath: fixturePath("/app")});
		const ui5YamlPath = fixtureFile("/app", "ui5.yaml");
		const watcher = await ProjectDefinitionWatcher.create({graph});
		const callback = subscribeStub.firstCall.args[1];

		const changing = [];
		const changed = [];
		watcher.on("definitionChanging", (e) => changing.push(e));
		watcher.on("definitionChanged", (e) => changed.push(e));

		const clock = sinon.useFakeTimers();
		// First watched event of a burst: definitionChanging fires immediately, definitionChanged does not.
		callback(null, [{type: "update", path: ui5YamlPath}]);
		t.is(changing.length, 1, "definitionChanging fires on the leading edge");
		t.deepEqual(changing[0], {eventType: "update", filePath: ui5YamlPath});
		t.is(changed.length, 0, "definitionChanged has not fired yet");

		// Further events within the window do not re-fire definitionChanging.
		clock.tick(200);
		callback(null, [{type: "update", path: fixtureFile("/app", "package.json")}]);
		t.is(changing.length, 1, "definitionChanging fires once per burst, not per event");

		// Once quiet, definitionChanged fires once.
		clock.tick(600);
		t.is(changed.length, 1, "definitionChanged fires after the settle window");

		// A separate, later burst re-triggers the leading edge.
		callback(null, [{type: "update", path: ui5YamlPath}]);
		t.is(changing.length, 2, "a new burst fires definitionChanging again");
		clock.tick(600);
		clock.restore();

		await watcher.destroy();
	});

test.serial("leading edge: a filtered (non-definition) event does not fire definitionChanging", async (t) => {
	captureCallbacks();
	const graph = createGraph({name: "root", rootPath: fixturePath("/app")});
	const watcher = await ProjectDefinitionWatcher.create({graph});
	const callback = subscribeStub.firstCall.args[1];

	const changing = [];
	watcher.on("definitionChanging", (e) => changing.push(e));

	const clock = sinon.useFakeTimers();
	callback(null, [{type: "update", path: fixtureFile("/app", "src", "main.js")}]);
	clock.tick(600);
	clock.restore();

	t.is(changing.length, 0, "a non-definition file does not fire the leading edge");
	await watcher.destroy();
});

test.serial("recovery: a watcher error tears down and re-subscribes", async (t) => {
	const sub1 = createMockSubscription();
	const sub2 = createMockSubscription();
	let cb;
	subscribeStub.onFirstCall().callsFake(async (_dir, callback) => {
		cb = callback;
		return sub1;
	});
	subscribeStub.onSecondCall().resolves(sub2);

	const graph = createGraph({name: "root", rootPath: fixturePath("/app")});
	const watcher = await ProjectDefinitionWatcher.create({graph});

	t.is(subscribeStub.callCount, 1);
	cb(new Error("watcher blew up"));
	// Let the async recovery settle.
	await new Promise((resolve) => setImmediate(resolve));

	t.true(sub1.unsubscribe.calledOnce, "old subscription torn down");
	t.is(subscribeStub.callCount, 2, "re-subscribed");

	await watcher.destroy();
});

test.serial("recovery: loop protection escalates to error after the max attempts", async (t) => {
	const subs = [];
	subscribeStub.callsFake(async () => {
		const s = createMockSubscription();
		subs.push(s);
		return s;
	});

	const graph = createGraph({name: "root", rootPath: fixturePath("/app")});
	const watcher = await ProjectDefinitionWatcher.create({graph});

	const errors = [];
	watcher.on("error", (err) => errors.push(err));

	// Drive repeated failures. Each recovery re-subscribes, exposing a fresh callback via the
	// latest subscribe call. Trigger via the callback captured at subscribe time.
	const callbacks = () => subscribeStub.getCalls().map((c) => c.args[1]);
	// 5 recoveries allowed, the 6th escalates.
	for (let i = 0; i < 6; i++) {
		const cbs = callbacks();
		cbs[cbs.length - 1](new Error(`fail ${i}`));
		await new Promise((resolve) => setImmediate(resolve));
	}

	t.is(errors.length, 1, "escalated once after exceeding the budget");
	await watcher.destroy();
});

test.serial("destroy: unsubscribes all, is idempotent", async (t) => {
	const sub = createMockSubscription();
	subscribeStub.resolves(sub);

	const graph = createGraph(
		{name: "root", rootPath: fixturePath("/app")},
		[{name: "dep", rootPath: fixturePath("/dep")}]
	);
	const watcher = await ProjectDefinitionWatcher.create({graph});

	await watcher.destroy();
	await watcher.destroy();

	t.is(sub.unsubscribe.callCount, subscribeStub.callCount,
		"each subscription unsubscribed exactly once across two destroy calls");
});

test.serial("destroy: aggregates unsubscribe failures into an error", async (t) => {
	const subA = createMockSubscription();
	const subB = createMockSubscription();
	subA.unsubscribe = sinon.stub().rejects(new Error("unsub A failed"));
	subB.unsubscribe = sinon.stub().resolves();
	subscribeStub.onFirstCall().resolves(subA);
	subscribeStub.onSecondCall().resolves(subB);

	const graph = createGraph(
		{name: "root", rootPath: fixturePath("/app")},
		[{name: "dep", rootPath: fixturePath("/dep")}]
	);
	const watcher = await ProjectDefinitionWatcher.create({graph});

	const errorSpy = sinon.spy();
	watcher.on("error", errorSpy);

	await watcher.destroy();

	t.is(errorSpy.callCount, 1, "single aggregated error emitted");
	t.true(errorSpy.firstCall.args[0] instanceof AggregateError);
	t.is(errorSpy.firstCall.args[0].errors.length, 1);
});
