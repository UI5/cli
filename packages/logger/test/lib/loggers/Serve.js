import test from "ava";
import sinon from "sinon";
import ServeLogger from "../../../lib/loggers/Serve.js";

test.serial.beforeEach((t) => {
	t.context.serveLogger = new ServeLogger("my:module:name");
	t.context.logStub = sinon.stub(t.context.serveLogger, "_log");

	t.context.logHandler = sinon.stub();
	t.context.statusHandler = sinon.stub();
	process.on(ServeLogger.LOG_EVENT_NAME, t.context.logHandler);
	process.on(ServeLogger.SERVE_STATUS_EVENT_NAME, t.context.statusHandler);
	process.env.UI5_LOG_LVL = "silent"; // Should have no impact
});

test.serial.afterEach.always((t) => {
	process.off(ServeLogger.LOG_EVENT_NAME, t.context.logHandler);
	process.off(ServeLogger.SERVE_STATUS_EVENT_NAME, t.context.statusHandler);
	delete process.env.UI5_LOG_LVL;
	sinon.restore();
});

test.serial("Correct serve-status event name", (t) => {
	t.is(ServeLogger.SERVE_STATUS_EVENT_NAME, "ui5.serve-status", "Correct serve-status event name exposed");
});

test.serial("ready emits serve-ready", (t) => {
	const {serveLogger, statusHandler, logHandler, logStub} = t.context;
	serveLogger.ready();
	t.is(statusHandler.callCount, 1, "One serve-status event emitted");
	t.deepEqual(statusHandler.getCall(0).args[0], {
		level: "info",
		status: "serve-ready",
	}, "Status event has expected payload");
	t.is(logHandler.callCount, 0, "No log event emitted");
	t.is(logStub.callCount, 0, "_log was never called");
});

test.serial("stale emits serve-stale", (t) => {
	const {serveLogger, statusHandler} = t.context;
	serveLogger.stale(["project.a", "project.b"]);
	t.is(statusHandler.callCount, 1, "One serve-status event emitted");
	t.deepEqual(statusHandler.getCall(0).args[0], {
		level: "info",
		status: "serve-stale",
		changedProjects: ["project.a", "project.b"],
	}, "Status event has expected payload");
});

test.serial("stale: Missing parameter", (t) => {
	const {serveLogger} = t.context;
	t.throws(() => {
		serveLogger.stale();
	}, {
		message: "loggers/Serve#stale: Missing or incorrect changedProjects parameter",
	}, "Threw with expected error message");
});

test.serial("validating emits serve-validating", (t) => {
	const {serveLogger, statusHandler} = t.context;
	serveLogger.validating(["library.a", "library.b"]);
	t.is(statusHandler.callCount, 1, "One serve-status event emitted");
	t.deepEqual(statusHandler.getCall(0).args[0], {
		level: "info",
		status: "serve-validating",
		validatingProjects: ["library.a", "library.b"],
	}, "Status event has expected payload");
});

test.serial("validating: Missing parameter", (t) => {
	const {serveLogger} = t.context;
	t.throws(() => {
		serveLogger.validating();
	}, {
		message: "loggers/Serve#validating: Missing or incorrect validatingProjects parameter",
	}, "Threw with expected error message");
});

test.serial("building emits serve-building", (t) => {
	const {serveLogger, statusHandler} = t.context;
	serveLogger.building();
	t.is(statusHandler.callCount, 1, "One serve-status event emitted");
	t.deepEqual(statusHandler.getCall(0).args[0], {
		level: "info",
		status: "serve-building",
	}, "Status event has expected payload");
});

test.serial("buildDone emits serve-build-done", (t) => {
	const {serveLogger, statusHandler} = t.context;
	serveLogger.buildDone([2, 345000000]);
	t.is(statusHandler.callCount, 1, "One serve-status event emitted");
	t.deepEqual(statusHandler.getCall(0).args[0], {
		level: "info",
		status: "serve-build-done",
		hrtime: [2, 345000000],
	}, "Status event has expected payload");
});

test.serial("buildDone: Missing parameter", (t) => {
	const {serveLogger} = t.context;
	t.throws(() => {
		serveLogger.buildDone();
	}, {
		message: "loggers/Serve#buildDone: Missing or incorrect hrtime parameter",
	}, "Threw with expected error message");
});

test.serial("serveError emits serve-error", (t) => {
	const {serveLogger, statusHandler} = t.context;
	const err = new Error("boom");
	serveLogger.serveError(err);
	t.is(statusHandler.callCount, 1, "One serve-status event emitted");
	t.deepEqual(statusHandler.getCall(0).args[0], {
		level: "error",
		status: "serve-error",
		error: err,
	}, "Status event has expected payload");
});

test.serial("serveError: Missing parameter", (t) => {
	const {serveLogger} = t.context;
	t.throws(() => {
		serveLogger.serveError();
	}, {
		message: "loggers/Serve#serveError: Missing error parameter",
	}, "Threw with expected error message");
});

test.serial("No event listener: ready", (t) => {
	const {serveLogger, statusHandler, logHandler, logStub} = t.context;
	process.off(ServeLogger.SERVE_STATUS_EVENT_NAME, statusHandler);
	serveLogger.ready();
	t.is(logStub.callCount, 1, "_log got called once");
	t.is(logStub.getCall(0).args[0], "info", "Logged with expected log-level");
	t.is(logStub.getCall(0).args[1], "Server ready", "Logged expected message");
	t.is(logHandler.callCount, 0, "No log event emitted");
});

test.serial("No event listener: stale", (t) => {
	const {serveLogger, statusHandler, logHandler, logStub} = t.context;
	process.off(ServeLogger.SERVE_STATUS_EVENT_NAME, statusHandler);
	serveLogger.stale(["project.a", "project.b"]);
	t.is(logStub.callCount, 1, "_log got called once");
	t.is(logStub.getCall(0).args[0], "info", "Logged with expected log-level");
	t.is(logStub.getCall(0).args[1],
		"Sources changed in: project.a, project.b",
		"Logged expected message");
	t.is(logHandler.callCount, 0, "No log event emitted");
});

test.serial("No event listener: validating", (t) => {
	const {serveLogger, statusHandler, logHandler, logStub} = t.context;
	process.off(ServeLogger.SERVE_STATUS_EVENT_NAME, statusHandler);
	serveLogger.validating(["library.a", "library.b"]);
	t.is(logStub.callCount, 1, "_log got called once");
	t.is(logStub.getCall(0).args[0], "info", "Logged with expected log-level");
	t.is(logStub.getCall(0).args[1],
		"Validating caches for: library.a, library.b",
		"Logged expected message");
	t.is(logHandler.callCount, 0, "No log event emitted");
});

test.serial("No event listener: building", (t) => {
	const {serveLogger, statusHandler, logHandler, logStub} = t.context;
	process.off(ServeLogger.SERVE_STATUS_EVENT_NAME, statusHandler);
	serveLogger.building();
	t.is(logStub.callCount, 1, "_log got called once");
	t.is(logStub.getCall(0).args[0], "info", "Logged with expected log-level");
	t.is(logStub.getCall(0).args[1], "Building...", "Logged expected message");
	t.is(logHandler.callCount, 0, "No log event emitted");
});

test.serial("No event listener: buildDone", (t) => {
	const {serveLogger, statusHandler, logHandler, logStub} = t.context;
	process.off(ServeLogger.SERVE_STATUS_EVENT_NAME, statusHandler);
	serveLogger.buildDone([0, 123000000]);
	t.is(logStub.callCount, 1, "_log got called once");
	t.is(logStub.getCall(0).args[0], "info", "Logged with expected log-level");
	t.is(logStub.getCall(0).args[1], "Build finished in 123 ms", "Logged expected message");
	t.is(logHandler.callCount, 0, "No log event emitted");
});

test.serial("No event listener: buildDone formats durations >= 1s in seconds", (t) => {
	const {serveLogger, statusHandler, logHandler, logStub} = t.context;
	process.off(ServeLogger.SERVE_STATUS_EVENT_NAME, statusHandler);
	serveLogger.buildDone([2, 345000000]);
	t.is(logStub.callCount, 1, "_log got called once");
	t.is(logStub.getCall(0).args[0], "info", "Logged with expected log-level");
	t.is(logStub.getCall(0).args[1], "Build finished in 2.34 s", "Logged expected message");
	t.is(logHandler.callCount, 0, "No log event emitted");
});

test.serial("No event listener: serveError", (t) => {
	const {serveLogger, statusHandler, logHandler, logStub} = t.context;
	process.off(ServeLogger.SERVE_STATUS_EVENT_NAME, statusHandler);
	const err = new Error("boom");
	serveLogger.serveError(err);
	t.is(logStub.callCount, 1, "_log got called once");
	t.is(logStub.getCall(0).args[0], "error", "Logged with expected log-level");
	t.is(logStub.getCall(0).args[1], "Server error: boom", "Logged expected message");
	t.is(logHandler.callCount, 0, "No log event emitted");
});

test.serial("No event listener: serveError falls back to the error value when message is missing", (t) => {
	const {serveLogger, statusHandler, logHandler, logStub} = t.context;
	process.off(ServeLogger.SERVE_STATUS_EVENT_NAME, statusHandler);
	serveLogger.serveError("plain string error");
	t.is(logStub.callCount, 1, "_log got called once");
	t.is(logStub.getCall(0).args[0], "error", "Logged with expected log-level");
	t.is(logStub.getCall(0).args[1], "Server error: plain string error", "Logged expected message");
	t.is(logHandler.callCount, 0, "No log event emitted");
});
