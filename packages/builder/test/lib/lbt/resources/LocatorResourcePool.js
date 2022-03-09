const test = require("ava");
const LocatorResourcePool = require("../../../../lib/lbt/resources/LocatorResourcePool");
const Resource = require("@ui5/fs").Resource;

test("getIgnoreMissingModules", async (t) => {
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
	return resourcePool.prepare([new Resource({path: "mypath"})]).then(() => {
		t.true(promiseResolved, "addResources promise is resolved before prepare promise is resolved");
	});
});

