import path from "node:path";
import fs from "node:fs";
import test from "ava";
import sinon from "sinon";
import {promisify} from "node:util";
const stat = promisify(fs.stat);
import {rimraf} from "rimraf";
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
	t.context.devcertSanscache = sinon.stub();
	t.context.mkdir = sinon.stub().resolves();

	t.context.createSslUtilMock = async (mockMkdir = false) => {
		const mocks = {
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
	if (t.context.sslUtil) {
		esmock.purge(t.context.sslUtil);
	}
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

test("Get existing certificate with outdated permissions triggers chmod error handling", async (t) => {
	const constants = await import("node:fs").then((m) => m.constants);
	const chmodStub = sinon.stub().rejects(new Error("chmod failed"));
	const statStub = sinon.stub().resolves({
		mode: constants.S_IRUSR | constants.S_IWUSR,
	});
	const readFileStub = sinon.stub().resolves(Buffer.from("file-content"));

	const sslUtil = await esmock("../../../lib/sslUtil.js", {
		"node:fs/promises": {
			stat: statStub,
			readFile: readFileStub,
			writeFile: sinon.stub(),
			mkdir: sinon.stub(),
			chmod: chmodStub,
			constants,
		}
	});

	const result = await sslUtil.getSslCertificate("/fake/path.key", "/fake/path.crt");
	t.is(result.key.toString(), "file-content", "Key is returned despite chmod error");
	t.is(result.cert.toString(), "file-content", "Cert is returned despite chmod error");
	t.true(chmodStub.calledTwice, "chmod was called for both key and cert");
});

test("Get missing certificate throws SslCertificateNotFoundError", async (t) => {
	const sslUtil = await esmock("../../../lib/sslUtil.js");

	const keyPath = "/does/not/exist/server.key";
	const certPath = "/does/not/exist/server.crt";
	const err = await t.throwsAsync(sslUtil.getSslCertificate(keyPath, certPath), {
		instanceOf: sslUtil.SslCertificateNotFoundError
	});
	t.is(err.code, "SSL_CERTIFICATE_NOT_FOUND", "Error carries a recognizable code");
	t.is(err.keyPath, keyPath, "Error exposes the key path");
	t.is(err.certPath, certPath, "Error exposes the cert path");
});

test("Get certificate with empty key or cert file throws SslCertificateNotFoundError", async (t) => {
	const constants = await import("node:fs").then((m) => m.constants);
	const statStub = sinon.stub().resolves({mode: constants.S_IRUSR});
	// A leftover file from an interrupted write reads as a truthy but zero-length Buffer
	const readFileStub = sinon.stub();
	readFileStub.withArgs("/fake/path.key").resolves(Buffer.alloc(0));
	readFileStub.withArgs("/fake/path.crt").resolves(Buffer.from("cert-content"));

	const sslUtil = await esmock("../../../lib/sslUtil.js", {
		"node:fs/promises": {
			stat: statStub,
			readFile: readFileStub,
			writeFile: sinon.stub(),
			mkdir: sinon.stub(),
			chmod: sinon.stub().resolves(),
			constants,
		}
	});

	await t.throwsAsync(sslUtil.getSslCertificate("/fake/path.key", "/fake/path.crt"), {
		instanceOf: sslUtil.SslCertificateNotFoundError
	}, "An empty key file is treated as missing");
});

test.serial("Generate new certificate and install it", async (t) => {
	const {createSslUtilMock, devcertSanscache} = t.context;
	const sslUtil = await createSslUtilMock();

	t.plan(5);

	const sslKey = "abcd";
	const sslCert = "defg";

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
	const result = await sslUtil.generateSslCertificate(sslPathKey, sslPathCert);
	t.deepEqual(result.key, sslKey, "Key should be returned");
	t.deepEqual(result.cert, sslCert, "Cert should be returned");

	const fileExistsResult = await Promise.all([
		fileExists(sslPathKey),
		fileExists(sslPathCert)
	]);

	t.is(fileExistsResult[0], true, "Key was created.");
	t.is(fileExistsResult[1], true, "Cert was created.");
});

test.serial("Generate new certificate overwrites an existing read-only certificate", async (t) => {
	const {createSslUtilMock, devcertSanscache} = t.context;
	const sslUtil = await createSslUtilMock();

	devcertSanscache.resolves({key: "new-key", cert: "new-cert"});

	const sslPath = path.join(process.cwd(), "./test/tmp/ssl/");
	const sslPathKey = path.join(sslPath, "existingServer.key");
	const sslPathCert = path.join(sslPath, "existingServer.crt");

	// Simulate a certificate from a previous run: written with read-only permissions (0o400),
	// which would otherwise cause EACCES when opened for writing.
	await promisify(fs.mkdir)(sslPath, {recursive: true});
	await promisify(fs.writeFile)(sslPathKey, "old-key", {mode: 0o400});
	await promisify(fs.writeFile)(sslPathCert, "old-cert", {mode: 0o400});

	await t.notThrowsAsync(sslUtil.generateSslCertificate(sslPathKey, sslPathCert),
		"Regeneration succeeds despite read-only existing files");

	const readFile = promisify(fs.readFile);
	t.is((await readFile(sslPathKey)).toString(), "new-key", "Key was overwritten");
	t.is((await readFile(sslPathCert)).toString(), "new-cert", "Cert was overwritten");
});

test.serial("Generate new certificate reports the written paths", async (t) => {
	const {createSslUtilMock, devcertSanscache} = t.context;
	const sslUtil = await createSslUtilMock();

	devcertSanscache.resolves({key: "k", cert: "c"});

	const sslPath = path.join(process.cwd(), "./test/tmp/ssl/");
	const sslPathKey = path.join(sslPath, "someOtherServer4.key");
	const sslPathCert = path.join(sslPath, "someOtherServer4.crt");
	const result = await sslUtil.generateSslCertificate(sslPathKey, sslPathCert);

	t.is(result.keyPath, sslPathKey, "Returned key path matches");
	t.is(result.certPath, sslPathCert, "Returned cert path matches");
});

test.serial("Generate new certificate not succeeded", async (t) => {
	const {createSslUtilMock, devcertSanscache, mkdir} = t.context;
	const sslUtil = await createSslUtilMock(true);

	devcertSanscache.resolves({
		key: "aaa",
		cert: "bbb"
	});
	mkdir.rejects(new Error("some error"));

	const sslPath = path.join(process.cwd(), "./test/tmp/ssl/");
	const sslPathKey = path.join(sslPath, "someOtherServer3.key");
	const sslPathCert = path.join(sslPath, "someOtherServer3.crt");
	const err = await t.throwsAsync(sslUtil.generateSslCertificate(sslPathKey, sslPathCert));
	t.is(err.message, "some error", "Correct error thrown");
	t.is(devcertSanscache.firstCall.args[0], "UI5Tooling", "Certificate created for UI5Tooling");
	t.true(mkdir.called, "mkdir was attempted");
});
