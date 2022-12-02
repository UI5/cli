import path from "node:path";
import fs from "node:fs";
import test from "ava";
import sinon from "sinon";
import {promisify} from "node:util";
const stat = promisify(fs.stat);
import _rimraf from "rimraf";
const rimraf = promisify(_rimraf);
import esmock from "esmock";

function fileExists(filePath) {
	return stat(filePath).then(() => true, (err) => {
		if (err.code === "ENOENT") { // "File or directory does not exist"
			return false;
		} else {
			throw err;
		}
	});
}

test.beforeEach(async (t) => {
	t.context.yesno = sinon.stub();
	t.context.devcertSanscache = sinon.stub();
	t.context.mkdir = sinon.stub().resolves();

	t.context.createSslUtilMock = async (mockMkdir = false) => {
		const mocks = {
			"yesno": t.context.yesno,
			"devcert-sanscache": t.context.devcertSanscache
		};
		if (mockMkdir) {
			mocks["node:fs/promises"] = {
				mkdir: t.context.mkdir
			};
		}
		t.context.sslUtil = await esmock.p("../../../lib/sslUtil.js", mocks);
		return t.context.sslUtil;
	};
});

test.afterEach.always((t) => {
	esmock.purge(t.context.sslUtil);
});

test("Get existing certificate", async (t) => {
	const sslUtil = await esmock("../../../lib/sslUtil.js");

	const sslPath = path.join(process.cwd(), "./test/fixtures/ssl/");
	const result = await sslUtil.getSslCertificate(
		path.join(sslPath, "dummy.key"),
		path.join(sslPath, "dummy.crt"),
	);
	t.is(result.key.toString(), "dummy-key-file", "Key exists");
	t.is(result.cert.toString(), "dummy-crt-file", "Cert exists");
});

test.serial("Create new certificate and install it", async (t) => {
	const {createSslUtilMock, yesno, devcertSanscache} = t.context;
	const sslUtil = await createSslUtilMock();

	t.plan(6);

	const sslKey = "abcd";
	const sslCert = "defg";

	yesno.callsFake(async function(options) {
		t.deepEqual(options, {
			question: "No SSL certificates found. " +
				"Do you want to create new SSL certificates and install them locally? (yes)",
			defaultValue: true
		}, "Pass options to yesno");

		return true;
	});

	devcertSanscache.callsFake(function(name) {
		t.is(name, "UI5Tooling", "Create certificate for UI5Tooling.");
		return Promise.resolve({
			key: sslKey,
			cert: sslCert
		});
	});

	const sslPath = path.join(process.cwd(), "./test/tmp/ssl/");
	await rimraf(sslPath); // Ensure that tmp directory doesn't exist

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
});

test.serial("Create new certificate and do not install it", async (t) => {
	const {createSslUtilMock, yesno} = t.context;
	const sslUtil = await createSslUtilMock();

	t.plan(2);

	yesno.callsFake(async function(options) {
		t.deepEqual(options, {
			question: "No SSL certificates found. " +
				"Do you want to create new SSL certificates and install them locally? (yes)",
			defaultValue: true
		}, "Pass options to yesno");

		return false;
	});

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
	});
});

test.serial("Create new certificate not succeeded", async (t) => {
	const {createSslUtilMock, yesno, devcertSanscache, mkdir} = t.context;
	const sslUtil = await createSslUtilMock(true);

	t.plan(6);

	yesno.callsFake(async function(options) {
		t.deepEqual(options, {
			question: "No SSL certificates found. " +
				"Do you want to create new SSL certificates and install them locally? (yes)",
			defaultValue: true
		}, "Pass options to yesno");

		return true;
	});

	devcertSanscache.callsFake(async function(name) {
		t.is(name, "UI5Tooling", "Create certificate for UI5Tooling.");
		return {
			key: "aaa",
			cert: "bbb"
		};
	});
	mkdir.callsFake(async function(dirName) {
		t.pass("mkdir mock reached.");

		throw new Error("some error");
	});

	const sslPath = path.join(process.cwd(), "./test/tmp/ssl/");
	const sslPathKey = path.join(sslPath, "someOtherServer3.key");
	const sslPathCert = path.join(sslPath, "someOtherServer3.crt");
	const err = await t.throwsAsync(sslUtil.getSslCertificate(sslPathKey, sslPathCert));
	t.is(err.message, "some error", "Correct error thrown");
});

