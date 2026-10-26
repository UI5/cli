import test from "ava";
import esmock from "esmock";
import fs from "node:fs/promises";
import {
	createParcelWatcherMock, createFixtureTesterFactory, registerBuildHooks
} from "./__helper__/BuildServerFixtureTester.js";
import {configureTagIsolation, assertTagTasks} from "./__helper__/tagIsolation.js";

const watcherMock = createParcelWatcherMock();
const {graphFromPackageDependencies} = await esmock.p("../../../lib/graph/graph.js", {}, {
	"@parcel/watcher": {default: watcherMock.api, ...watcherMock.api}
});
const FixtureTester = createFixtureTesterFactory("tags", {graphFromPackageDependencies, watcherMock});
registerBuildHooks(test, {watcherMock});

for (const stepBased of [false, true]) {
	test.serial(`Serving preserves tag isolation after cache restore (stepBased=${stepBased})`, async (t) => {
		const tester = t.context.fixtureTester = await FixtureTester.create(t, "application.a");
		const {triggerPath} = await configureTagIsolation(tester.fixturePath, stepBased);
		await tester.serveProject();
		const first = await tester.requestResource({resource: "/tag-report.txt"});
		t.is(await first.getString(), "input-1:trigger-1");
		await tester.teardown();

		// Change only the consumer before restoring the dependency from the persistent cache.
		await fs.writeFile(triggerPath, "trigger-2");
		await tester.serveProject();
		const second = await tester.requestResource({resource: "/tag-report.txt"});
		t.is(await second.getString(), "input-1:trigger-2");
		assertTagTasks(t, {setterSkipped: true});

		await fs.writeFile(triggerPath, "trigger-3");
		await tester.fireWatcherEvent("update", triggerPath);
		const third = await tester.requestResource({resource: "/tag-report.txt"});
		t.is(await third.getString(), "input-1:trigger-3");
		assertTagTasks(t, {setterSkipped: true});
	});
}
