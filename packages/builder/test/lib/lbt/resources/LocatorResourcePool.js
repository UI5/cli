const test = require("ava");
const LocatorResourcePool = require("../../../../lib/lbt/resources/LocatorResourcePool");

test("getIgnoreMissingModules", async (t) => {
	const resourcePool = new LocatorResourcePool({ignoreMissingModules: true});
	t.true(resourcePool.getIgnoreMissingModules(), "ignoreMissingModules is true");
});

