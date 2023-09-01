import test from "ava";
import sinonGlobal from "sinon";
import esmock from "esmock";
import path from "node:path";
import {fileURLToPath} from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Use path within project as mocking base directory to reduce chance of side effects
// in case mocks/stubs do not work and real fs is used
const fakeBaseDir = path.join(__dirname, "fake-tmp");

test.beforeEach(async (t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();

	process.env.UI5_MAVEN_SNAPSHOT_ENDPOINT_URL = "_SNAPSHOT_URL_";

	t.context.logStub = {
		info: sinon.stub(),
		verbose: sinon.stub(),
		silly: sinon.stub(),
		warn: sinon.stub(),
		error: sinon.stub(),
		isLevelEnabled: sinon.stub().returns(false),
		_getLogger: sinon.stub()
	};
	const ui5Logger = {
		getLogger: sinon.stub().returns(t.context.logStub)
	};

	t.context.makeFetchHappen = sinon.stub();

	t.context.gracefulFs = {
		stat: sinon.stub().yieldsAsync(),
		readFile: sinon.stub().yieldsAsync(),
		writeFile: sinon.stub().yieldsAsync(),
		rename: sinon.stub().yieldsAsync(),
		rm: sinon.stub().yieldsAsync(),
		createWriteStream: sinon.stub()
	};

	t.context.Registry = await esmock.p("../../../lib/ui5Framework/maven/Registry.js", {
		"@ui5/logger": ui5Logger,
		"graceful-fs": t.context.gracefulFs,
		"make-fetch-happen": t.context.makeFetchHappen,
	});

	const AbstractInstaller = await esmock.p("../../../lib/ui5Framework/AbstractInstaller.js", {
		"@ui5/logger": ui5Logger,
		"../../../lib/utils/fs.js": {
			mkdirp: sinon.stub().resolves()
		},
		"lockfile": {
			lock: sinon.stub().yieldsAsync(),
			unlock: sinon.stub().yieldsAsync()
		}
	});

	t.context.Installer = await esmock.p("../../../lib/ui5Framework/maven/Installer.js", {
		"@ui5/logger": ui5Logger,
		"graceful-fs": t.context.gracefulFs,
		"../../../lib/utils/fs.js": {
			mkdirp: sinon.stub().resolves()
		},
		"../../../lib/ui5Framework/maven/Registry.js": t.context.Registry,
		"../../../lib/ui5Framework/AbstractInstaller.js": AbstractInstaller
	});

	t.context.AbstractResolver = await esmock.p("../../../lib/ui5Framework/AbstractResolver.js", {
		"@ui5/logger": ui5Logger,
		"node:os": {
			homedir: sinon.stub().returns(path.join(fakeBaseDir, "homedir"))
		},
	});

	t.context.Sapui5MavenSnapshotResolver = await esmock.p("../../../lib/ui5Framework/Sapui5MavenSnapshotResolver.js", {
		"@ui5/logger": ui5Logger,
		"node:os": {
			homedir: sinon.stub().returns(path.join(fakeBaseDir, "homedir"))
		},
		"../../../lib/ui5Framework/AbstractResolver.js": t.context.AbstractResolver,
		"../../../lib/ui5Framework/maven/Installer.js": t.context.Installer
	});
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
	esmock.purge(t.context.Registry);
	esmock.purge(t.context.Installer);
	esmock.purge(t.context.AbstractResolver);
	esmock.purge(t.context.Sapui5MavenSnapshotResolver);
	delete process.env.UI5_MAVEN_SNAPSHOT_ENDPOINT_URL;
});

test.serial("resolveVersion", async (t) => {
	const {Sapui5MavenSnapshotResolver, makeFetchHappen, logStub, sinon} = t.context;

	makeFetchHappen.withArgs("_SNAPSHOT_URL_/com/sap/ui5/dist/sapui5-sdk-dist/maven-metadata.xml")
		.resolves({
			ok: true,
			buffer: sinon.stub().resolves(`
			<?xml version="1.0" encoding="UTF-8"?>
			<metadata>
			  <versioning>
				<versions>
					<version>1.120.1</version>
					<version>2.0.0-rc.1</version>
					<version>1.120.1-SNAPSHOT</version>
					<version>1.123.4-SNAPSHOT</version>
					<version>2.0.0-SNAPSHOT</version>
					<version>2.0.1-SNAPSHOT</version>
					<version>2.1.2-SNAPSHOT</version>
				</versions>
			  </versioning>
			</metadata>
			`)
		});


	// Exact SNAPSHOT versions
	t.is(await Sapui5MavenSnapshotResolver.resolveVersion("1.123.4-SNAPSHOT"), "1.123.4-SNAPSHOT");
	t.is(await Sapui5MavenSnapshotResolver.resolveVersion("2.0.1-SNAPSHOT"), "2.0.1-SNAPSHOT");

	// latest-snapshot
	t.is(await Sapui5MavenSnapshotResolver.resolveVersion("latest-snapshot"), "2.1.2-SNAPSHOT");

	// SNAPSHOT ranges
	t.is(await Sapui5MavenSnapshotResolver.resolveVersion("1-SNAPSHOT"), "1.123.4-SNAPSHOT");
	t.is(await Sapui5MavenSnapshotResolver.resolveVersion("2-SNAPSHOT"), "2.1.2-SNAPSHOT");
	t.is(await Sapui5MavenSnapshotResolver.resolveVersion("1.123-SNAPSHOT"), "1.123.4-SNAPSHOT");

	// Error cases
	await t.throwsAsync(Sapui5MavenSnapshotResolver.resolveVersion(""), {
		message: `Framework version specifier "" is incorrect or not supported`
	});
	await t.throwsAsync(Sapui5MavenSnapshotResolver.resolveVersion("tag-does-not-exist"), {
		message: `Framework version specifier "tag-does-not-exist" is incorrect or not supported`
	});
	await t.throwsAsync(Sapui5MavenSnapshotResolver.resolveVersion("invalid-tag-%20"), {
		message: `Framework version specifier "invalid-tag-%20" is incorrect or not supported`
	});

	await t.throwsAsync(Sapui5MavenSnapshotResolver.resolveVersion("1.999.9"), {
		message: `Could not resolve framework version 1.999.9. ` +
			`Make sure the version is valid and available in the configured registry.`
	});
	await t.throwsAsync(Sapui5MavenSnapshotResolver.resolveVersion("1.0.0-SNAPSHOT"), {
		message: `Could not resolve framework version 1.0.0-SNAPSHOT. ` +
			`Make sure the version is valid and available in the configured registry.`
	});
	await t.throwsAsync(Sapui5MavenSnapshotResolver.resolveVersion("3-SNAPSHOT"), {
		message: `Could not resolve framework version 3-SNAPSHOT. ` +
			`Make sure the version is valid and available in the configured registry.`
	});

	t.is(logStub.warn.callCount, 0);
	t.is(logStub.error.callCount, 0);
});
