import test from "ava";
import LocatorResourcePool from "../../../../lib/lbt/resources/LocatorResourcePool.js";
import Resource from "@ui5/fs/Resource";

test("getIgnoreMissingModules", (t) => {
	const resourcePool = new LocatorResourcePool({ignoreMissingModules: true});
	t.true(resourcePool.getIgnoreMissingModules(), "ignoreMissingModules is true");
});

test("wait for resources to finish prepare", async (t) => {
	let promiseResolved = false;
	const promise = new Promise((resolve) => {
		setTimeout(() => {
			promiseResolved = true;
			resolve();
		}, 10);
	});
	const resourcePool = new LocatorResourcePool();
	resourcePool.addResource = () => promise;
	await resourcePool.prepare([new Resource({path: "mypath"})]);
	t.true(promiseResolved, "addResources promise is resolved before prepare promise is resolved");
});

