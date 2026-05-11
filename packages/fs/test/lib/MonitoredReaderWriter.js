import test from "ava";
import sinon from "sinon";
import MonitoredReaderWriter from "../../lib/MonitoredReaderWriter.js";

test("MonitoredReaderWriter: constructor", (t) => {
	const readerWriter = {
		getName: sinon.stub().returns("myReaderWriter"),
		_byGlob: sinon.stub().resolves([]),
		_byPath: sinon.stub().resolves(null),
		write: sinon.stub().resolves()
	};

	const monitored = new MonitoredReaderWriter(readerWriter);

	t.is(monitored.getName(), "myReaderWriter");
});

test("MonitoredReaderWriter: _byGlob tracks patterns without resolvePattern", async (t) => {
	const readerWriter = {
		getName: sinon.stub().returns("myReaderWriter"),
		_byGlob: sinon.stub().resolves(["resource1"])
	};
	const trace = {collection: sinon.spy()};

	const monitored = new MonitoredReaderWriter(readerWriter);
	const result = await monitored._byGlob("/pattern/**", {}, trace);

	t.deepEqual(result, ["resource1"]);

	const requests = monitored.getResourceRequests();
	t.true(requests.patterns instanceof Set);
	t.true(requests.patterns.has("/pattern/**"));
	t.is(requests.paths.size, 0);
});

test("MonitoredReaderWriter: _byGlob tracks patterns with resolvePattern", async (t) => {
	const readerWriter = {
		getName: sinon.stub().returns("myReaderWriter"),
		_byGlob: sinon.stub().resolves([]),
		resolvePattern: sinon.stub().returns("/resolved/**")
	};
	const trace = {collection: sinon.spy()};

	const monitored = new MonitoredReaderWriter(readerWriter);
	await monitored._byGlob("/pattern/**", {}, trace);

	const requests = monitored.getResourceRequests();
	t.true(requests.patterns.has("/resolved/**"));
	t.true(readerWriter.resolvePattern.calledWith("/pattern/**"));
});

test("MonitoredReaderWriter: _byPath tracks paths without resolvePath", async (t) => {
	const readerWriter = {
		getName: sinon.stub().returns("myReaderWriter"),
		_byPath: sinon.stub().resolves(null)
	};
	const trace = {collection: sinon.spy()};

	const monitored = new MonitoredReaderWriter(readerWriter);
	const result = await monitored._byPath("/my/path.js", {}, trace);

	t.is(result, null);

	const requests = monitored.getResourceRequests();
	t.true(requests.paths.has("/my/path.js"));
	t.is(requests.patterns.size, 0);
});

test("MonitoredReaderWriter: _byPath tracks paths with resolvePath", async (t) => {
	const readerWriter = {
		getName: sinon.stub().returns("myReaderWriter"),
		_byPath: sinon.stub().resolves(null),
		resolvePath: sinon.stub().returns("/resolved/path.js")
	};
	const trace = {collection: sinon.spy()};

	const monitored = new MonitoredReaderWriter(readerWriter);
	await monitored._byPath("/my/path.js", {}, trace);

	const requests = monitored.getResourceRequests();
	t.true(requests.paths.has("/resolved/path.js"));
});

test("MonitoredReaderWriter: _byPath with resolvePath returning null", async (t) => {
	const readerWriter = {
		getName: sinon.stub().returns("myReaderWriter"),
		_byPath: sinon.stub().resolves(null),
		resolvePath: sinon.stub().returns(null)
	};
	const trace = {collection: sinon.spy()};

	const monitored = new MonitoredReaderWriter(readerWriter);
	await monitored._byPath("/my/path.js", {}, trace);

	const requests = monitored.getResourceRequests();
	t.is(requests.paths.size, 0);
});

test("MonitoredReaderWriter: _write delegates to wrapped writer", async (t) => {
	const readerWriter = {
		getName: sinon.stub().returns("myReaderWriter"),
		write: sinon.stub().resolves()
	};

	const monitored = new MonitoredReaderWriter(readerWriter);
	const resource = {path: "/test.js"};
	const options = {drain: true};
	await monitored._write(resource, options);

	t.true(readerWriter.write.calledOnce);
	t.true(readerWriter.write.calledWith(resource, options));
});

test("MonitoredReaderWriter: getResourceRequests seals reader", async (t) => {
	const readerWriter = {
		getName: sinon.stub().returns("myReaderWriter"),
		_byGlob: sinon.stub().resolves([]),
		_byPath: sinon.stub().resolves(null)
	};
	const trace = {collection: sinon.spy()};

	const monitored = new MonitoredReaderWriter(readerWriter);
	monitored.getResourceRequests();

	await t.throwsAsync(
		monitored._byGlob("/pattern/**", {}, trace),
		{message: "Unexpected read operation after reader has been sealed"}
	);

	await t.throwsAsync(
		monitored._byPath("/my/path.js", {}, trace),
		{message: "Unexpected read operation after reader has been sealed"}
	);
});
