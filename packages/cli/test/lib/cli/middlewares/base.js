import test from "ava";
import sinon from "sinon";
import esmock from "esmock";

test.beforeEach(async (t) => {
	t.context.initLogger = sinon.stub();
	t.context.baseMiddleware = await esmock("../../../../lib/cli/middlewares/base.js", {
		"../../../../lib/cli/middlewares/logger.js": {
			initLogger: t.context.initLogger
		}
	});
});

test.afterEach("Stubs Cleanup", (t) => {
	sinon.restore();
});

test.serial("uses default middleware", (t) => {
	const {baseMiddleware, initLogger} = t.context;
	baseMiddleware({loglevel: 1});
	t.is(initLogger.called, true, "Logger middleware initialized");
});
