import test from "ava";
import sinon from "sinon";
import MonitoredReader from "../../lib/MonitoredReader.js";

test("MonitoredReader: constructor", (t) => {
	const reader = {
		getName: sinon.stub().returns("myReader"),
		_byGlob: sinon.stub().resolves([]),
		_byPath: sinon.stub().resolves(null)
	};

	const monitoredReader = new MonitoredReader(reader);

	t.is(monitoredReader.getName(), "myReader");
});

test("MonitoredReader: _byGlob tracks patterns without resolvePattern", async (t) => {
	const reader = {
		getName: sinon.stub().returns("myReader"),
		_byGlob: sinon.stub().resolves(["resource1"])
	};
	const trace = {collection: sinon.spy()};

	const monitoredReader = new MonitoredReader(reader);
	const result = await monitoredReader._byGlob("/pattern/**", {}, trace);

	t.deepEqual(result, ["resource1"]);
	t.true(reader._byGlob.calledOnce);

	const requests = monitoredReader.getResourceRequests();
	t.deepEqual(requests.patterns, ["/pattern/**"]);
	t.deepEqual(requests.paths, []);
});

test("MonitoredReader: _byGlob tracks patterns with resolvePattern", async (t) => {
	const reader = {
		getName: sinon.stub().returns("myReader"),
		_byGlob: sinon.stub().resolves([]),
		resolvePattern: sinon.stub().returns("/resolved/**")
	};
	const trace = {collection: sinon.spy()};

	const monitoredReader = new MonitoredReader(reader);
	await monitoredReader._byGlob("/pattern/**", {}, trace);

	const requests = monitoredReader.getResourceRequests();
	t.deepEqual(requests.patterns, ["/resolved/**"]);
	t.true(reader.resolvePattern.calledWith("/pattern/**"));
});

test("MonitoredReader: _byPath tracks paths without resolvePath", async (t) => {
	const reader = {
		getName: sinon.stub().returns("myReader"),
		_byPath: sinon.stub().resolves(null)
	};
	const trace = {collection: sinon.spy()};

	const monitoredReader = new MonitoredReader(reader);
	const result = await monitoredReader._byPath("/my/path.js", {}, trace);

	t.is(result, null);
	t.true(reader._byPath.calledOnce);

	const requests = monitoredReader.getResourceRequests();
	t.deepEqual(requests.paths, ["/my/path.js"]);
	t.deepEqual(requests.patterns, []);
});

test("MonitoredReader: _byPath tracks paths with resolvePath", async (t) => {
	const reader = {
		getName: sinon.stub().returns("myReader"),
		_byPath: sinon.stub().resolves(null),
		resolvePath: sinon.stub().returns("/resolved/path.js")
	};
	const trace = {collection: sinon.spy()};

	const monitoredReader = new MonitoredReader(reader);
	await monitoredReader._byPath("/my/path.js", {}, trace);

	const requests = monitoredReader.getResourceRequests();
	t.deepEqual(requests.paths, ["/resolved/path.js"]);
	t.true(reader.resolvePath.calledWith("/my/path.js"));
});

test("MonitoredReader: _byPath with resolvePath returning null", async (t) => {
	const reader = {
		getName: sinon.stub().returns("myReader"),
		_byPath: sinon.stub().resolves(null),
		resolvePath: sinon.stub().returns(null)
	};
	const trace = {collection: sinon.spy()};

	const monitoredReader = new MonitoredReader(reader);
	await monitoredReader._byPath("/my/path.js", {}, trace);

	const requests = monitoredReader.getResourceRequests();
	t.deepEqual(requests.paths, []);
});

test("MonitoredReader: getResourceRequests seals reader", async (t) => {
	const reader = {
		getName: sinon.stub().returns("myReader"),
		_byGlob: sinon.stub().resolves([]),
		_byPath: sinon.stub().resolves(null)
	};
	const trace = {collection: sinon.spy()};

	const monitoredReader = new MonitoredReader(reader);
	monitoredReader.getResourceRequests();

	await t.throwsAsync(
		monitoredReader._byGlob("/pattern/**", {}, trace),
		{message: "Unexpected read operation after reader has been sealed"}
	);

	await t.throwsAsync(
		monitoredReader._byPath("/my/path.js", {}, trace),
		{message: "Unexpected read operation after reader has been sealed"}
	);
});
