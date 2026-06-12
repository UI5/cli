import test from "ava";
import sinon from "sinon";
import esmock from "esmock";

test.afterEach.always(() => {
	sinon.restore();
});

test.serial("getPathname decodes escape sequences", async (t) => {
	const parseurlStub = sinon.stub().returns({pathname: "path%20name"});
	const getPathname = await esmock("../../../../lib/helper/getPathname.js", {
		parseurl: parseurlStub
	});
	const pathname = getPathname("req");

	t.is(parseurlStub.callCount, 1, "parseurl got called once");
	t.is(parseurlStub.getCall(0).args[0], "req", "parseurl got called with correct argument");
	t.is(pathname, "path name", "Correct pathname returned");
});
