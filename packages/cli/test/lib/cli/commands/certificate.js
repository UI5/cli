import test from "ava";
import path from "node:path";
import os from "node:os";
import sinon from "sinon";
import esmock from "esmock";

function getDefaultArgv() {
	return {
		"_": ["certificate", "generate"],
		"loglevel": "info",
		"log-level": "info",
		"logLevel": "info",
		"perf": false,
		"silent": false,
		"force": false,
		"$0": "ui5"
	};
}

// Anchored outside the home directory so the plain-path assertions below are not affected by
// the ~ shortening applied to home-dir paths. See the dedicated shortening test for that behavior.
const TEST_UI5_DATA_DIR = path.join(path.resolve(path.sep), "test-ui5-home");
const TEST_KEY_PATH = path.join(TEST_UI5_DATA_DIR, "server", "server.key");
const TEST_CERT_PATH = path.join(TEST_UI5_DATA_DIR, "server", "server.crt");

test.beforeEach(async (t) => {
	t.context.argv = getDefaultArgv();

	t.context.consoleOutput = "";
	t.context.stderrWriteStub = sinon.stub(process.stderr, "write").callsFake((message) => {
		t.context.consoleOutput += message;
		return true;
	});

	// Tests rely on not having UI5_DATA_DIR defined
	t.context.originalUi5DataDirEnv = process.env.UI5_DATA_DIR;
	delete process.env.UI5_DATA_DIR;

	t.context.getUi5DataDirStub = sinon.stub().resolves(TEST_UI5_DATA_DIR);
	t.context.generateSslCertificateStub = sinon.stub().resolves({
		key: "generated-key",
		cert: "generated-cert",
		keyPath: TEST_KEY_PATH,
		certPath: TEST_CERT_PATH
	});
	// By default, no certificate exists yet
	t.context.existsStub = sinon.stub().resolves(false);

	t.context.certificate = await esmock.p("../../../../lib/cli/commands/certificate.js", {
		"@ui5/server/internal/sslUtil": {
			generateSslCertificate: t.context.generateSslCertificateStub
		}
	}, {
		"../../../../lib/dataDir.js": {
			getUi5DataDirOrDefault: t.context.getUi5DataDirStub
		},
		"../../../../lib/utils/fsHelper.js": {
			exists: t.context.existsStub
		}
	});
});

test.afterEach.always((t) => {
	sinon.restore();
	esmock.purge(t.context.certificate);
	if (typeof t.context.originalUi5DataDirEnv === "undefined") {
		delete process.env.UI5_DATA_DIR;
	} else {
		process.env.UI5_DATA_DIR = t.context.originalUi5DataDirEnv;
	}
});

test.serial("certificate command structure", (t) => {
	const {certificate} = t.context;
	t.is(certificate.command, "certificate");
	t.truthy(certificate.describe);
	t.is(typeof certificate.builder, "function");
});

test.serial("ui5 certificate generate: creates certificate in resolved data dir", async (t) => {
	const {argv, generateSslCertificateStub} = t.context;

	await runGenerate(t, argv);

	t.is(generateSslCertificateStub.callCount, 1);
	t.deepEqual(generateSslCertificateStub.getCall(0).args, [TEST_KEY_PATH, TEST_CERT_PATH]);
	t.true(t.context.consoleOutput.includes(TEST_UI5_DATA_DIR),
		"Resolved UI5 data dir is printed");
	t.true(t.context.consoleOutput.includes(TEST_KEY_PATH), "Private key path is printed");
	t.true(t.context.consoleOutput.includes(TEST_CERT_PATH), "Certificate path is printed");
});

test.serial("ui5 certificate generate: honors data dir from getUi5DataDirOrDefault", async (t) => {
	const {argv, getUi5DataDirStub, generateSslCertificateStub} = t.context;
	getUi5DataDirStub.resolves(path.resolve("custom-data-dir"));

	await runGenerate(t, argv);

	const expectedKey = path.join(path.resolve("custom-data-dir"), "server", "server.key");
	const expectedCert = path.join(path.resolve("custom-data-dir"), "server", "server.crt");
	t.deepEqual(generateSslCertificateStub.getCall(0).args, [expectedKey, expectedCert]);
});

test.serial("ui5 certificate generate: uses ~/.ui5 fallback provided by getUi5DataDirOrDefault", async (t) => {
	const {argv, getUi5DataDirStub, generateSslCertificateStub} = t.context;
	getUi5DataDirStub.resolves(path.join(os.homedir(), ".ui5"));

	await runGenerate(t, argv);

	const expectedKey = path.join(os.homedir(), ".ui5", "server", "server.key");
	const expectedCert = path.join(os.homedir(), ".ui5", "server", "server.crt");
	t.deepEqual(generateSslCertificateStub.getCall(0).args, [expectedKey, expectedCert]);
});

test.serial("ui5 certificate generate: shortens home-dir paths in output with ~", async (t) => {
	const {argv, getUi5DataDirStub, generateSslCertificateStub} = t.context;
	const dataDir = path.join(os.homedir(), ".ui5");
	const keyPath = path.join(dataDir, "server", "server.key");
	const certPath = path.join(dataDir, "server", "server.crt");
	getUi5DataDirStub.resolves(dataDir);
	generateSslCertificateStub.resolves({key: "k", cert: "c", keyPath, certPath});

	await runGenerate(t, argv);

	const shortenedDataDir = "~" + dataDir.slice(os.homedir().length);
	const shortenedKey = "~" + keyPath.slice(os.homedir().length);
	const shortenedCert = "~" + certPath.slice(os.homedir().length);
	t.true(t.context.consoleOutput.includes(shortenedDataDir), "Data dir is printed with ~");
	t.true(t.context.consoleOutput.includes(shortenedKey), "Key path is printed with ~");
	t.true(t.context.consoleOutput.includes(shortenedCert), "Certificate path is printed with ~");
	t.false(t.context.consoleOutput.includes(os.homedir()), "Full home directory is not printed");
});

test.serial("ui5 certificate generate: uses --key and --cert options", async (t) => {
	const {argv, generateSslCertificateStub} = t.context;
	argv.key = "/custom/my.key";
	argv.cert = "/custom/my.crt";

	await runGenerate(t, argv);

	t.deepEqual(generateSslCertificateStub.getCall(0).args, ["/custom/my.key", "/custom/my.crt"]);
});

test.serial("ui5 certificate generate: skips generation when certificate exists", async (t) => {
	const {argv, existsStub, generateSslCertificateStub} = t.context;
	existsStub.resolves(true); // both key and cert exist

	await runGenerate(t, argv);

	t.is(generateSslCertificateStub.callCount, 0, "Does not generate a new certificate");
	t.true(t.context.consoleOutput.includes("already exists"),
		"Reports that a certificate already exists");
	t.true(t.context.consoleOutput.includes("--force"), "Suggests --force to overwrite");
	t.true(t.context.consoleOutput.includes(TEST_KEY_PATH), "Prints existing key path");
});

test.serial("ui5 certificate generate: regenerates when only the key exists", async (t) => {
	const {argv, existsStub, generateSslCertificateStub} = t.context;
	existsStub.withArgs(TEST_KEY_PATH).resolves(true); // only the key exists

	await runGenerate(t, argv);

	// A lone key is a broken pair. Without --force the user could otherwise never complete it via
	// the plain command, so generation proceeds (writeCertificateFile overwrites the leftover key).
	t.is(generateSslCertificateStub.callCount, 1,
		"Regenerates to complete a broken pair");
	t.false(t.context.consoleOutput.includes("already exists"),
		"Does not report an existing certificate for a partial pair");
});

test.serial("ui5 certificate generate: regenerates when only the certificate exists", async (t) => {
	const {argv, existsStub, generateSslCertificateStub} = t.context;
	existsStub.withArgs(TEST_CERT_PATH).resolves(true); // only the cert exists

	await runGenerate(t, argv);

	t.is(generateSslCertificateStub.callCount, 1,
		"Regenerates to complete a broken pair");
	t.false(t.context.consoleOutput.includes("already exists"),
		"Does not report an existing certificate for a partial pair");
});

test.serial("ui5 certificate generate --force: regenerates despite existing certificate", async (t) => {
	const {argv, existsStub, generateSslCertificateStub} = t.context;
	existsStub.resolves(true); // certificate exists
	argv.force = true;

	await runGenerate(t, argv);

	t.is(generateSslCertificateStub.callCount, 1, "Generates a new certificate");
	t.deepEqual(generateSslCertificateStub.getCall(0).args, [TEST_KEY_PATH, TEST_CERT_PATH]);
});

test.serial("ui5 certificate generate: wraps errors from the existence check with context", async (t) => {
	const {argv, existsStub, generateSslCertificateStub} = t.context;
	existsStub.rejects(Object.assign(new Error("permission denied"), {code: "EACCES"}));

	const err = await t.throwsAsync(runGenerate(t, argv));
	t.true(err.message.includes("Failed to check for an existing server certificate"),
		"Error explains it originated from the existence pre-check");
	t.true(err.message.includes("permission denied"), "Error preserves the underlying message");
	t.is(err.cause.code, "EACCES", "Original error is retained as cause");
	t.is(generateSslCertificateStub.callCount, 0, "Does not attempt generation after a failed check");
});

test.serial("ui5 certificate generate: prints trust-store notice before generating", async (t) => {
	const {argv} = t.context;

	await runGenerate(t, argv);

	t.true(
		t.context.consoleOutput.includes("importing the newly created") &&
		t.context.consoleOutput.includes("operating system and browsers"),
		"Prints notice about installing the certificate into the trust store"
	);
});

/**
 * Resolves and invokes the "generate" subcommand handler by driving the command's builder
 * with a fake yargs instance that captures the registered subcommand.
 *
 * @param {object} t AVA test context
 * @param {object} argv Arguments to pass to the handler
 * @returns {Promise<void>}
 */
async function runGenerate(t, argv) {
	const {certificate} = t.context;
	let generateConfig;
	const fakeYargs = {
		demandCommand() {
			return this;
		},
		command(name, describe, config) {
			if (name === "generate") {
				generateConfig = config;
			}
			return this;
		}
	};
	certificate.builder(fakeYargs);
	t.truthy(generateConfig, "generate subcommand is registered");
	await generateConfig.handler(argv);
}
