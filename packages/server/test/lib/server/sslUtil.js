const path = require("path");
const fs = require("fs");
const {test} = require("ava");
const sinon = require("sinon");
const {promisify} = require("util");
const stat = promisify(fs.stat);
const prompt = require("prompt");
const mock = require("mock-require");
const sslUtil = require("../../../").sslUtil;

function fileExists(filePath) {
	return stat(filePath).then(() => true, (err) => {
		if (err.code === "ENOENT") { // "File or directory does not exist"
			return false;
		} else {
			throw err;
		}
	});
}

test("Get existing certificate", (t) => {
	t.plan(2);
	const sslPath = path.join(process.cwd(), "./test/fixtures/ssl/");
	const result = sslUtil.getSslCertificate(
		path.join(sslPath, "dummy.key"),
		path.join(sslPath, "dummy.crt"),
	);
	return result.then((res) => {
		t.deepEqual(res.key.toString(), "dummy-key-file", "Key exists");
		t.deepEqual(res.cert.toString(), "dummy-crt-file", "Cert exists");
	});
});

test.serial("Create new certificate and install it", (t) => {
	t.plan(5);
	const sslKey = "abcd";
	const sslCert = "defg";
	const promptStartStub = sinon.stub(prompt, "start").callsFake(function() {});
	const promptGetStub = sinon.stub(prompt, "get").callsFake(function(property, callback) {
		return callback(null, {yesno: "yes"});
	});

	mock("devcert-sanscache", function(name) {
		t.deepEqual(name, "ui5-tooling", "Create certificate for ui5-tooling.");
		return Promise.resolve({
			key: sslKey,
			cert: sslCert
		});
	});

	mock.reRequire("devcert-sanscache");
	const sslUtil = mock.reRequire("../../../lib/sslUtil");
	const sslPath = path.join(process.cwd(), "./test/tmp/ssl/");
	const sslPathKey = path.join(sslPath, "someOtherServer1.key");
	const sslPathCert = path.join(sslPath, "someOtherServer1.crt");
	const result = sslUtil.getSslCertificate(sslPathKey, sslPathCert);
	return result.then((res) => {
		t.deepEqual(res.key, sslKey, "Key should be returned");
		t.deepEqual(res.cert, sslCert, "Cert should be returned");
	}).then(() => {
		return Promise.all([
			fileExists(sslPathKey),
			fileExists(sslPathCert)
		]);
	}).then((fileExistsResult) => {
		t.deepEqual(fileExistsResult[0], true, "Key was created.");
		t.deepEqual(fileExistsResult[1], true, "Cert was created.");
		promptStartStub.restore();
		promptGetStub.restore();
		mock.stop("devcert-sanscache");
	});
});

test.serial("Create new certificate and do not install it", (t) => {
	t.plan(1);
	const promptStartStub = sinon.stub(prompt, "start").callsFake(function() {});
	const promptGetStub = sinon.stub(prompt, "get").callsFake(function(property, callback) {
		return callback(null, {yesno: "no"});
	});

	const sslPath = path.join(process.cwd(), "./test/tmp/ssl/");
	const sslPathKey = path.join(sslPath, "someOtherServer2.key");
	const sslPathCert = path.join(sslPath, "someOtherServer2.crt");
	const result = sslUtil.getSslCertificate(sslPathKey, sslPathCert);
	return result.catch((error) => {
		t.deepEqual(
			error,
			"Certificate installation aborted! Please install the SSL certificate manually.",
			"Certificate install aborted."
		);
		promptStartStub.restore();
		promptGetStub.restore();
	});
});

test.serial("Create new certificate not succeeded", (t) => {
	t.plan(5);

	const promptStartStub = sinon.stub(prompt, "start").callsFake(function() {});
	const promptGetStub = sinon.stub(prompt, "get").callsFake(function(property, callback) {
		return callback(null, {yesno: "yes"});
	});
	const consoleSpyLog = sinon.spy(console, "log");
	const consoleSpyError = sinon.spy(console, "error");

	mock("devcert-sanscache", function(name) {
		t.deepEqual(name, "ui5-tooling", "Create certificate for ui5-tooling.");
		return Promise.resolve({
			key: "aaa",
			cert: "bbb"
		});
	});

	mock("make-dir", function(dirName) {
		t.pass("make-dir mock reached.");

		return Promise.reject("some error");
	});

	mock.reRequire("devcert-sanscache");
	mock.reRequire("make-dir");
	const sslUtil = mock.reRequire("../../../lib/sslUtil");

	const sslPath = path.join(process.cwd(), "./test/tmp/ssl/");
	const sslPathKey = path.join(sslPath, "someOtherServer3.key");
	const sslPathCert = path.join(sslPath, "someOtherServer3.crt");
	const result = sslUtil.getSslCertificate(sslPathKey, sslPathCert);
	return result.then(() => {
		t.true(consoleSpyLog.calledWith("Could not create certificate"), "Info was logged.");
		t.true(consoleSpyError.calledWith("some error"), "Error was logged.");
		promptStartStub.restore();
		promptGetStub.restore();
		consoleSpyLog.restore();
		consoleSpyError.restore();
		mock.stop("devcert-sanscache");
		mock.stop("make-dir");
	});
});

