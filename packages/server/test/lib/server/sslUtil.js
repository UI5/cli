const path = require("path");
const fs = require("fs");
const test = require("ava");
const {promisify} = require("util");
const stat = promisify(fs.stat);
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

test("Get existing certificate", async (t) => {
	t.plan(2);
	const sslPath = path.join(process.cwd(), "./test/fixtures/ssl/");
	const result = await sslUtil.getSslCertificate(
		path.join(sslPath, "dummy.key"),
		path.join(sslPath, "dummy.crt"),
	);
	t.is(result.key.toString(), "dummy-key-file", "Key exists");
	t.is(result.cert.toString(), "dummy-crt-file", "Cert exists");
});

test.serial("Create new certificate and install it", async (t) => {
	t.plan(6);
	const sslKey = "abcd";
	const sslCert = "defg";

	mock("yesno", async function(options) {
		t.deepEqual(options, {
			question: "No SSL certificates found. " +
				"Do you want to create new SSL certificates and install them locally? (yes)",
			defaultValue: true
		}, "Pass options to yesno");

		return true;
	});

	mock("devcert-sanscache", function(name) {
		t.is(name, "UI5Tooling", "Create certificate for UI5Tooling.");
		return Promise.resolve({
			key: sslKey,
			cert: sslCert
		});
	});

	mock.reRequire("yesno");
	mock.reRequire("devcert-sanscache");

	const sslUtil = mock.reRequire("../../../lib/sslUtil");
	const sslPath = path.join(process.cwd(), "./test/tmp/ssl/");
	const sslPathKey = path.join(sslPath, "someOtherServer1.key");
	const sslPathCert = path.join(sslPath, "someOtherServer1.crt");
	const result = await sslUtil.getSslCertificate(sslPathKey, sslPathCert);
	t.deepEqual(result.key, sslKey, "Key should be returned");
	t.deepEqual(result.cert, sslCert, "Cert should be returned");

	const fileExistsResult = await Promise.all([
		fileExists(sslPathKey),
		fileExists(sslPathCert)
	]);

	t.is(fileExistsResult[0], true, "Key was created.");
	t.is(fileExistsResult[1], true, "Cert was created.");
	mock.stop("yesno");
	mock.stop("devcert-sanscache");
});

test.serial("Create new certificate and do not install it", (t) => {
	t.plan(2);

	mock("yesno", async function(options) {
		t.deepEqual(options, {
			question: "No SSL certificates found. " +
				"Do you want to create new SSL certificates and install them locally? (yes)",
			defaultValue: true
		}, "Pass options to yesno");

		return false;
	});

	mock.reRequire("yesno");

	const sslPath = path.join(process.cwd(), "./test/tmp/ssl/");
	const sslPathKey = path.join(sslPath, "someOtherServer2.key");
	const sslPathCert = path.join(sslPath, "someOtherServer2.crt");
	const result = sslUtil.getSslCertificate(sslPathKey, sslPathCert);
	return result.catch((error) => {
		t.is(
			error.message,
			"Certificate installation aborted! Please install the SSL certificate manually.",
			"Certificate install aborted."
		);
		mock.stop("yesno");
	});
});

test.serial("Create new certificate not succeeded", async (t) => {
	t.plan(6);

	mock("yesno", async function(options) {
		t.deepEqual(options, {
			question: "No SSL certificates found. " +
				"Do you want to create new SSL certificates and install them locally? (yes)",
			defaultValue: true
		}, "Pass options to yesno");

		return true;
	});

	mock("devcert-sanscache", function(name) {
		t.is(name, "UI5Tooling", "Create certificate for UI5Tooling.");
		return Promise.resolve({
			key: "aaa",
			cert: "bbb"
		});
	});
	mock("make-dir", function(dirName) {
		t.pass("make-dir mock reached.");

		return Promise.reject(new Error("some error"));
	});

	mock.reRequire("yesno");
	mock.reRequire("devcert-sanscache");
	mock.reRequire("make-dir");

	const sslUtil = mock.reRequire("../../../lib/sslUtil");

	const sslPath = path.join(process.cwd(), "./test/tmp/ssl/");
	const sslPathKey = path.join(sslPath, "someOtherServer3.key");
	const sslPathCert = path.join(sslPath, "someOtherServer3.crt");
	const err = await t.throwsAsync(sslUtil.getSslCertificate(sslPathKey, sslPathCert));
	t.is(err.message, "some error", "Correct error thrown");
	mock.stop("yesno");
	mock.stop("devcert-sanscache");
	mock.stop("make-dir");
});

