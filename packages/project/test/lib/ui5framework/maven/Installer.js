import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import path from "node:path";
import fs from "graceful-fs";

test.beforeEach(async (t) => {
	t.context.mkdirpStub = sinon.stub().resolves();
	t.context.rmrfStub = sinon.stub().resolves();
	t.context.readFileStub = sinon.stub();
	t.context.writeFileStub = sinon.stub();
	t.context.renameStub = sinon.stub().returns();
	t.context.rmStub = sinon.stub().returns();
	t.context.statStub = sinon.stub().returns();

	t.context.promisifyStub = sinon.stub();
	t.context.promisifyStub.withArgs(fs.readFile).callsFake(() => t.context.readFileStub);
	t.context.promisifyStub.withArgs(fs.writeFile).callsFake(() => t.context.writeFileStub);
	t.context.promisifyStub.withArgs(fs.rename).callsFake(() => t.context.renameStub);
	t.context.promisifyStub.withArgs(fs.rm).callsFake(() => t.context.rmStub);
	t.context.promisifyStub.withArgs(fs.stat).callsFake(() => t.context.statStub);

	t.context.lockStub = sinon.stub();
	t.context.unlockStub = sinon.stub();
	t.context.zipStub = class StreamZipStub {
		extract = sinon.stub().resolves();
		close = sinon.stub().resolves();
	};

	t.context.registryRequestMavenMetadataStub = sinon.stub().resolves();
	t.context.registryRequestArtifactStub = sinon.stub().resolves();

	t.context.RegistryConstructorStub = sinon.stub().returns({
		requestMavenMetadata: t.context.registryRequestMavenMetadataStub,
		requestArtifact: t.context.registryRequestArtifactStub
	});

	t.context.AbstractInstaller = await esmock.p("../../../../lib/ui5Framework/AbstractInstaller.js", {
		"../../../../lib/utils/fs.js": {
			mkdirp: t.context.mkdirpStub,
			rmrf: t.context.rmrfStub
		},
		"lockfile": {
			lock: t.context.lockStub,
			unlock: t.context.unlockStub
		}
	});

	t.context.Installer = await esmock.p("../../../../lib/ui5Framework/maven/Installer.js", {
		"../../../../lib/ui5Framework/maven/Registry.js": t.context.RegistryConstructorStub,
		"../../../../lib/ui5Framework/AbstractInstaller.js": t.context.AbstractInstaller,
		"../../../../lib/utils/fs.js": {
			mkdirp: t.context.mkdirpStub
		},
		"node:util": {
			"promisify": t.context.promisifyStub,
		},
		"node-stream-zip": {
			"async": t.context.zipStub
		}
	});
});

test.afterEach.always((t) => {
	sinon.restore();
	esmock.purge(t.context.AbstractInstaller);
	esmock.purge(t.context.Installer);
});

test.serial("constructor", (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: () => {}
	});
	t.true(installer instanceof Installer, "Constructor returns instance of class");
	t.is(installer._artifactsDir, path.join("/ui5Data/", "framework", "artifacts"));
	t.is(installer._packagesDir, path.join("/ui5Data/", "framework", "packages"));
	t.is(installer._stagingDir, path.join("/ui5Data/", "framework", "staging"));
	t.is(installer._metadataDir, path.join("/ui5Data/", "framework", "metadata"));
	t.is(installer._lockDir, path.join("/ui5Data/", "framework", "locks"));
});

test.serial("constructor requires 'ui5DataDir'", (t) => {
	const {Installer} = t.context;

	t.throws(() => {
		new Installer({
			cwd: "/cwd/"
		});
	}, {message: `Installer: Missing parameter "ui5DataDir"`});
});

test.serial("constructor requires 'snapshotEndpointUrlCb'", (t) => {
	const {Installer} = t.context;

	t.throws(() => {
		new Installer({
			cwd: "/cwd/",
			ui5DataDir: "/ui5Data"
		});
	}, {message: `Installer: Missing Snapshot-Endpoint URL callback parameter`});
});

test.serial("getRegistry", async (t) => {
	const {Installer, RegistryConstructorStub} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: () => Promise.resolve("endpoint-url")
	});

	const registry1 = await installer.getRegistry();

	t.truthy(registry1, "Created registry");
	t.is(RegistryConstructorStub.callCount, 1, "Registry constructor called once");
	t.deepEqual(RegistryConstructorStub.firstCall.firstArg, {
		endpointUrl: "endpoint-url"
	}, "Registry constructor called with correct endpoint URL");

	const registry2 = await installer.getRegistry();
	t.is(registry2, registry1, "Registry instance is cached");
	t.is(RegistryConstructorStub.callCount, 1, "Registry constructor still only called once");
});

test.serial("getRegistry: Missing endpoint URL", async (t) => {
	const {Installer, RegistryConstructorStub} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: () => Promise.resolve(null)
	});

	const err = await t.throwsAsync(installer.getRegistry());
	t.is(err.message, "Installer: Missing or empty Maven repository URL for snapshot consumption. " +
		"This URL is required for consuming snapshot versions of UI5 libraries. " +
		"Please configure the correct URL using the following command: " +
		"'ui5 config set mavenSnapshotEndpointUrl <url>'",
	"Threw with expected error message");

	t.is(RegistryConstructorStub.callCount, 0, "Registry constructor did not get called");
});

test.serial("fetchPackageVersions", async (t) => {
	const {Installer, registryRequestMavenMetadataStub} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: () => Promise.resolve("endpoint-url")
	});

	registryRequestMavenMetadataStub
		.resolves({
			versioning: {
				versions: {
					version: ["1.0.0", "2.0.0", "2.0.0-SNAPSHOT", "3.0.0", "5.0.0-SNAPSHOT"]
				}
			}
		});

	const packageVersions = await installer.fetchPackageVersions({groupId: "ui5.corp", artifactId: "great-thing"});

	t.deepEqual(packageVersions, ["2.0.0-SNAPSHOT", "5.0.0-SNAPSHOT"], "Should resolve with expected versions");

	t.is(registryRequestMavenMetadataStub.callCount, 1, "requestPackagePackument should be called once");
	t.deepEqual(registryRequestMavenMetadataStub.getCall(0).args[0], {groupId: "ui5.corp", artifactId: "great-thing"},
		"requestMavenMetadata was called with correct arguments");
});

test.serial("fetchPackageVersions throws", async (t) => {
	const {Installer, registryRequestMavenMetadataStub} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: () => Promise.resolve("endpoint-url")
	});

	registryRequestMavenMetadataStub.resolves({});

	await t.throwsAsync(
		installer.fetchPackageVersions({
			groupId: "ui5.corp",
			artifactId: "great-thing",
		}),
		{message: "Missing Maven metadata for artifact ui5.corp:great-thing"}
	);
});

test.serial("_getLockPath", (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: () => {}
	});

	const lockPath = installer._getLockPath("package-@openui5/sap.ui.lib1@1.2.3-SNAPSHOT");

	t.is(lockPath, path.join("/ui5Data/", "framework", "locks", "package-@openui5-sap.ui.lib1@1.2.3-SNAPSHOT.lock"));
});

test.serial("readJson", async (t) => {
	const jsonStub = {json: "response"};
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: () => {}
	});

	t.context.readFileStub.resolves(JSON.stringify(jsonStub));

	const jsonResponse = await installer.readJson("package-@openui5/sap.ui.lib1@1.2.3-SNAPSHOT");

	t.deepEqual(jsonResponse, jsonStub);
});

test.serial("installPackage", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: () => {}
	});

	const removeArtifactStub = sinon.stub().resolves();
	const fetchArtifactMetadataStub = sinon.stub(installer, "_fetchArtifactMetadata").resolves({revision: "5"});
	sinon.stub(installer, "_pathExists").resolves(false);
	sinon.stub(installer, "_synchronize").callsFake( async (pckg, callback) => await callback());
	const installArtifactStub = sinon.stub(installer, "installArtifact").resolves({
		artifactPath: "/ui5Data/framework/artifacts/com_sap_ui5_dist-sapui5-sdk-dist/5/npm-sources.zip",
		removeArtifact: removeArtifactStub
	});

	const installedPackage = await installer.installPackage({
		pkgName: "@sapui5/distribution-metadata",
		groupId: "com.sap.ui5.dist",
		artifactId: "sapui5-sdk-dist",
		version: "1.75.0",
		classifier: "npm-sources",
		extension: "zip",
	});

	t.deepEqual(
		installedPackage,
		{pkgPath:
				path.join("/ui5Data/", "framework", "packages", "@sapui5", "distribution-metadata", "5")},
		"Install the correct package"
	);

	t.is(fetchArtifactMetadataStub.callCount, 1, "fetchArtifactMetadataStub got called once");
	t.deepEqual(fetchArtifactMetadataStub.firstCall.firstArg, {
		pkgName: "@sapui5/distribution-metadata",
		groupId: "com.sap.ui5.dist",
		artifactId: "sapui5-sdk-dist",
		version: "1.75.0",
		classifier: "npm-sources",
		extension: "zip",
	}, "fetchArtifactMetadataStub got called with expected arguments");

	t.is(installArtifactStub.callCount, 1, "installArtifact got called once");
	t.deepEqual(installArtifactStub.firstCall.firstArg, {
		revision: "5",
		groupId: "com.sap.ui5.dist",
		artifactId: "sapui5-sdk-dist",
		version: "1.75.0",
		classifier: "npm-sources",
		extension: "zip",
	}, "installArtifact got called with the expected parameters");
	t.is(removeArtifactStub.callCount, 1, "removeArtifact got called once");
});

test.serial("installPackage: No classifier", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: () => {}
	});

	const removeArtifactStub = sinon.stub().resolves();
	const fetchArtifactMetadataStub = sinon.stub(installer, "_fetchArtifactMetadata").resolves({revision: "5"});
	sinon.stub(installer, "_pathExists").resolves(false);
	sinon.stub(installer, "_synchronize").callsFake( async (pckg, callback) => await callback());
	const installArtifactStub = sinon.stub(installer, "installArtifact").resolves({
		artifactPath: "/ui5Data/framework/artifacts/com_sap_ui5_dist-sapui5-sdk-dist/5/npm-sources.zip",
		removeArtifact: removeArtifactStub
	});

	const installedPackage = await installer.installPackage({
		pkgName: "@sapui5/distribution-metadata",
		groupId: "com.sap.ui5.dist",
		artifactId: "sapui5-sdk-dist",
		version: "1.75.0",
		classifier: null,
		extension: "jar",
	});

	t.deepEqual(
		installedPackage,
		{pkgPath:
				path.join("/ui5Data/", "framework", "packages", "@sapui5", "distribution-metadata", "5")},
		"Install the correct package"
	);

	t.is(fetchArtifactMetadataStub.callCount, 1, "fetchArtifactMetadataStub got called once");
	t.deepEqual(fetchArtifactMetadataStub.firstCall.firstArg, {
		pkgName: "@sapui5/distribution-metadata",
		groupId: "com.sap.ui5.dist",
		artifactId: "sapui5-sdk-dist",
		version: "1.75.0",
		classifier: null,
		extension: "jar",
	}, "fetchArtifactMetadataStub got called with expected arguments");

	t.is(installArtifactStub.callCount, 1, "installArtifact got called once");
	t.deepEqual(installArtifactStub.firstCall.firstArg, {
		revision: "5",
		groupId: "com.sap.ui5.dist",
		artifactId: "sapui5-sdk-dist",
		version: "1.75.0",
		classifier: null,
		extension: "jar",
	}, "installArtifact got called with the expected parameters");
	t.is(removeArtifactStub.callCount, 1, "removeArtifact got called once");
});

test.serial("installPackage: Already installed", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: () => {}
	});

	sinon.stub(installer, "_fetchArtifactMetadata").resolves({revision: "5"});
	sinon.stub(installer, "_projectExists").resolves(true);
	sinon.stub(installer, "_synchronize").callsFake( async (pckg, callback) => await callback());
	const installArtifactStub = sinon.stub(installer, "installArtifact");

	const installedPackage = await installer.installPackage({
		pkgName: "@sapui5/distribution-metadata",
		groupId: "com.sap.ui5.dist",
		artifactId: "sapui5-sdk-dist",
		version: "1.75.0",
		classifier: "npm-sources",
		extension: "jar",
	});

	t.deepEqual(
		installedPackage,
		{pkgPath:
				path.join("/ui5Data/", "framework", "packages", "@sapui5", "distribution-metadata", "5")},
		"Install the correct package"
	);

	t.is(installArtifactStub.callCount, 0, "installArtifact did not get called");
});

test.serial("installPackage: Already installed only after lock acquired", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: () => {}
	});

	sinon.stub(installer, "_fetchArtifactMetadata").resolves({revision: "5"});
	sinon.stub(installer, "_projectExists")
		.onFirstCall().resolves(false)
		.onSecondCall().resolves(true);
	sinon.stub(installer, "_synchronize").callsFake( async (pckg, callback) => await callback());
	const installArtifactStub = sinon.stub(installer, "installArtifact");

	const installedPackage = await installer.installPackage({
		pkgName: "@sapui5/distribution-metadata",
		groupId: "com.sap.ui5.dist",
		artifactId: "sapui5-sdk-dist",
		version: "1.75.0",
		classifier: "npm-sources",
		extension: "jar",
	});

	t.deepEqual(
		installedPackage,
		{pkgPath:
				path.join("/ui5Data/", "framework", "packages", "@sapui5", "distribution-metadata", "5")},
		"Install the correct package"
	);

	t.is(installArtifactStub.callCount, 0, "installArtifact did not get called");
});

test.serial("installArtifact", async (t) => {
	const {Installer, rmStub, registryRequestArtifactStub} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: async () => "url"
	});

	const fetchArtifactMetadataStub = sinon.stub(installer, "_fetchArtifactMetadata").resolves({revision: "5"});
	sinon.stub(installer, "_pathExists").resolves(false);
	sinon.stub(installer, "_synchronize").callsFake( async (pckg, callback) => await callback());

	const installedArtifact = await installer.installArtifact({
		groupId: "com.sap.ui5.dist",
		artifactId: "sapui5-sdk-dist",
		version: "1.75.0",
		extension: "jar",
		classifier: null
	});

	const expectedPath = path.join("/ui5Data/", "framework", "artifacts", "com_sap_ui5_dist-sapui5-sdk-dist", "5.jar");
	t.is(
		installedArtifact.artifactPath,
		expectedPath,
		"artifactPath correctly resolved"
	);

	t.is(fetchArtifactMetadataStub.callCount, 1, "fetchArtifactMetadataStub got called once");
	t.deepEqual(fetchArtifactMetadataStub.firstCall.firstArg, {
		groupId: "com.sap.ui5.dist",
		artifactId: "sapui5-sdk-dist",
		version: "1.75.0",
		classifier: null,
		extension: "jar",
	}, "fetchArtifactMetadataStub got called with expected arguments");

	t.is(registryRequestArtifactStub.callCount, 1, "Registry#requestArtifact got called once");
	t.deepEqual(registryRequestArtifactStub.firstCall.firstArg, {
		revision: "5",
		groupId: "com.sap.ui5.dist",
		artifactId: "sapui5-sdk-dist",
		classifier: null,
		version: "1.75.0",
		extension: "jar",
	}, "Registry#requestArtifact got called with expected coordinates");
	t.is(registryRequestArtifactStub.firstCall.args[1],
		path.join("/ui5Data/", "framework", "staging", "com.sap.ui5.dist_sapui5-sdk-dist_5_jar"),
		"Registry#requestArtifact got called with expected target directory");

	t.is(
		typeof installedArtifact.removeArtifact,
		"function",
		"removeArtifact method"
	);
	rmStub.resetHistory();
	await installedArtifact.removeArtifact();
	t.is(rmStub.callCount, 1, "fs.rm got called once");
	t.is(rmStub.firstCall.firstArg, expectedPath, "fs.rm got called with expected argument");
});


test.serial("installArtifact: Target revision provided", async (t) => {
	const {Installer, rmStub, registryRequestArtifactStub} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: async () => "url"
	});

	const fetchArtifactMetadataStub = sinon.stub(installer, "_fetchArtifactMetadata").resolves({revision: "5"});
	sinon.stub(installer, "_pathExists").resolves(false);
	sinon.stub(installer, "_synchronize").callsFake( async (pckg, callback) => await callback());

	const installedArtifact = await installer.installArtifact({
		groupId: "com.sap.ui5.dist",
		artifactId: "sapui5-sdk-dist",
		version: "1.75.0",
		extension: "zip",
		classifier: "npm-sources",
		revision: "16"
	});

	const expectedPath = path.join("/ui5Data/", "framework", "artifacts",
		"com_sap_ui5_dist-sapui5-sdk-dist", "16", "npm-sources.zip");
	t.is(
		installedArtifact.artifactPath,
		expectedPath,
		"artifactPath correctly resolved"
	);

	t.is(fetchArtifactMetadataStub.callCount, 0, "fetchArtifactMetadataStub did not get called");

	t.is(registryRequestArtifactStub.callCount, 1, "Registry#requestArtifact got called once");
	t.deepEqual(registryRequestArtifactStub.firstCall.firstArg, {
		revision: "16",
		groupId: "com.sap.ui5.dist",
		artifactId: "sapui5-sdk-dist",
		classifier: "npm-sources",
		version: "1.75.0",
		extension: "zip",
	}, "Registry#requestArtifact got called with expected coordinates");
	t.is(registryRequestArtifactStub.firstCall.args[1],
		path.join("/ui5Data/", "framework", "staging", "com.sap.ui5.dist_sapui5-sdk-dist_16_npm-sources.zip"),
		"Registry#requestArtifact got called with expected target directory");

	t.is(
		typeof installedArtifact.removeArtifact,
		"function",
		"removeArtifact method"
	);
	rmStub.resetHistory();
	await installedArtifact.removeArtifact();
	t.is(rmStub.callCount, 1, "fs.rm got called once");
	t.is(rmStub.firstCall.firstArg, expectedPath, "fs.rm got called with expected argument");
});

test.serial("installArtifact: Already installed", async (t) => {
	const {Installer, rmStub, registryRequestArtifactStub} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: () => {}
	});

	sinon.stub(installer, "_fetchArtifactMetadata").resolves({revision: "5"});
	sinon.stub(installer, "_pathExists").resolves(true);
	sinon.stub(installer, "_synchronize").callsFake( async (pckg, callback) => await callback());

	const installedArtifact = await installer.installArtifact({
		groupId: "com.sap.ui5.dist",
		artifactId: "sapui5-sdk-dist",
		version: "1.75.0",
		extension: "jar",
	});

	const expectedPath = path.join("/ui5Data/", "framework", "artifacts", "com_sap_ui5_dist-sapui5-sdk-dist", "5.jar");
	t.is(
		installedArtifact.artifactPath,
		expectedPath,
		"artifactPath correctly resolved"
	);

	t.is(registryRequestArtifactStub.callCount, 0, "Registry#requestArtifact did not get called");

	t.is(
		typeof installedArtifact.removeArtifact,
		"function",
		"removeArtifact method"
	);
	rmStub.resetHistory();
	await installedArtifact.removeArtifact();
	t.is(rmStub.callCount, 1, "fs.rm got called once");
	t.is(rmStub.firstCall.firstArg, expectedPath, "fs.rm got called with expected argument");
});

test.serial("installArtifact: Already installed only after lock acquired", async (t) => {
	const {Installer, rmStub, registryRequestArtifactStub} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: () => {}
	});

	sinon.stub(installer, "_fetchArtifactMetadata").resolves({revision: "5"});
	sinon.stub(installer, "_pathExists")
		.onFirstCall().resolves(false)
		.onSecondCall().resolves(true);
	sinon.stub(installer, "_synchronize").callsFake( async (pckg, callback) => await callback());

	const installedArtifact = await installer.installArtifact({
		groupId: "com.sap.ui5.dist",
		artifactId: "sapui5-sdk-dist",
		version: "1.75.0",
		extension: "jar",
	});

	const expectedPath = path.join("/ui5Data/", "framework", "artifacts", "com_sap_ui5_dist-sapui5-sdk-dist", "5.jar");
	t.is(
		installedArtifact.artifactPath,
		expectedPath,
		"artifactPath correctly resolved"
	);

	t.is(registryRequestArtifactStub.callCount, 0, "Registry#requestArtifact did not get called");

	t.is(
		typeof installedArtifact.removeArtifact,
		"function",
		"removeArtifact method"
	);
	rmStub.resetHistory();
	await installedArtifact.removeArtifact();
	t.is(rmStub.callCount, 1, "fs.rm got called once");
	t.is(rmStub.firstCall.firstArg, expectedPath, "fs.rm got called with expected argument");
});

test.serial("_fetchArtifactMetadata", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: () => {}
	});

	sinon.stub(installer, "_synchronize").callsFake( async (pckg, callback) => await callback());
	sinon.stub(installer, "_getLocalArtifactMetadata")
		.resolves({
			lastCheck: 0,
			lastUpdate: 0,
			revision: "2",
			staleRevisions: [],
		});

	const getRemoteArtifactMetadataStub = sinon.stub(installer, "_getRemoteArtifactMetadata")
		.resolves({revision: "5", lastUpdate: 0});
	sinon.stub(installer, "_removeStaleRevisions").resolves();
	sinon.stub(installer, "_writeLocalArtifactMetadata").resolves();

	const artifactMetadata = await installer._fetchArtifactMetadata({
		groupId: "com.sap.ui5.dist",
		artifactId: "sapui5-sdk-dist",
		version: "1.75.0",
		extension: "jar",
	});

	t.truthy(artifactMetadata.lastCheck, "Proper metadata: lastCheck");
	t.is(artifactMetadata.lastUpdate, 0, "Proper metadata: lastUpdate");
	t.is(artifactMetadata.revision, "5", "Proper metadata: revision");

	t.is(getRemoteArtifactMetadataStub.callCount, 1, "getRemoteArtifactMetadata got called once");
});

test.serial("_fetchArtifactMetadata: Cached", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: () => {},
	});

	sinon.stub(installer, "_synchronize").callsFake( async (pckg, callback) => await callback());
	sinon.stub(installer, "_getLocalArtifactMetadata")
		.resolves({
			lastCheck: new Date().getTime(),
			lastUpdate: 0,
			revision: "2",
			staleRevisions: [],
		});
	const getRemoteArtifactMetadataStub = sinon.stub(installer, "_getRemoteArtifactMetadata")
		.resolves({revision: "5", lastUpdate: 0});
	sinon.stub(installer, "_removeStaleRevisions").resolves();
	sinon.stub(installer, "_writeLocalArtifactMetadata").resolves();

	const artifactMetadata = await installer._fetchArtifactMetadata({
		groupId: "com.sap.ui5.dist",
		artifactId: "sapui5-sdk-dist",
		version: "1.75.0",
		extension: "jar",
	});

	t.truthy(artifactMetadata.lastCheck, "Proper metadata: lastCheck");
	t.is(artifactMetadata.lastUpdate, 0, "Proper metadata: lastUpdate");
	t.is(artifactMetadata.revision, "2", "Proper metadata: revision");

	t.is(getRemoteArtifactMetadataStub.callCount, 0, "getRemoteArtifactMetadata did not get called");
});

test.serial("_fetchArtifactMetadata: Cache available but disabled", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: () => {},
		cacheMode: "Off"
	});

	sinon.stub(installer, "_synchronize").callsFake( async (pckg, callback) => await callback());
	sinon.stub(installer, "_getLocalArtifactMetadata")
		.resolves({
			lastCheck: new Date().getTime(),
			lastUpdate: 0,
			revision: "2",
			staleRevisions: [],
		});
	const getRemoteArtifactMetadataStub = sinon.stub(installer, "_getRemoteArtifactMetadata")
		.resolves({revision: "5", lastUpdate: 0});
	sinon.stub(installer, "_removeStaleRevisions").resolves();
	sinon.stub(installer, "_writeLocalArtifactMetadata").resolves();

	const artifactMetadata = await installer._fetchArtifactMetadata({
		groupId: "com.sap.ui5.dist",
		artifactId: "sapui5-sdk-dist",
		version: "1.75.0",
		extension: "jar",
	});

	t.truthy(artifactMetadata.lastCheck, "Proper metadata: lastCheck");
	t.is(artifactMetadata.lastUpdate, 0, "Proper metadata: lastUpdate");
	t.is(artifactMetadata.revision, "5", "Proper metadata: revision");
	t.is(getRemoteArtifactMetadataStub.callCount, 1, "getRemoteArtifactMetadata got called once");
});

test.serial("_fetchArtifactMetadata: Cache outdated but enforced", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: () => {},
		cacheMode: "Force"
	});

	sinon.stub(installer, "_synchronize").callsFake( async (pckg, callback) => await callback());
	sinon.stub(installer, "_getLocalArtifactMetadata")
		.resolves({
			lastCheck: 1, // first millisecond to indicate a cache is present but outdated
			lastUpdate: 0,
			revision: "2",
			staleRevisions: [],
		});
	const getRemoteArtifactMetadataStub = sinon.stub(installer, "_getRemoteArtifactMetadata")
		.resolves({revision: "5", lastUpdate: 0});
	sinon.stub(installer, "_removeStaleRevisions").resolves();
	sinon.stub(installer, "_writeLocalArtifactMetadata").resolves();

	const artifactMetadata = await installer._fetchArtifactMetadata({
		groupId: "com.sap.ui5.dist",
		artifactId: "sapui5-sdk-dist",
		version: "1.75.0",
		extension: "jar",
	});

	t.truthy(artifactMetadata.lastCheck, "Proper metadata: lastCheck");
	t.is(artifactMetadata.lastUpdate, 0, "Proper metadata: lastUpdate");
	t.is(artifactMetadata.revision, "2", "Proper metadata: revision");

	t.is(getRemoteArtifactMetadataStub.callCount, 0, "getRemoteArtifactMetadata did not get called");
});

test.serial("_fetchArtifactMetadata throws", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: () => {},
		cacheMode: "Force"
	});

	sinon.stub(installer, "_synchronize").callsFake( async (pckg, callback) => await callback());
	sinon.stub(installer, "_getLocalArtifactMetadata").resolves({});

	await t.throwsAsync(installer._fetchArtifactMetadata({
		groupId: "com.sap.ui5.dist",
		artifactId: "sapui5-sdk-dist",
		version: "1.75.0",
		extension: "jar",
	}), {
		message:
			"Could not find artifact com.sap.ui5.dist:sapui5-sdk-dist:1.75.0:jar in local cache",
	});
});

test.serial("_getRemoteArtifactMetadata", async (t) => {
	const {Installer, registryRequestMavenMetadataStub} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: () => Promise.resolve("endpoint-url")
	});

	registryRequestMavenMetadataStub
		.resolves({
			versioning: {
				snapshotVersions: {
					snapshotVersion: [{"extension": "jar", "updated": "20220828080910", "value": "5.0.0-SNAPSHOT"}]
				}
			}
		});

	const remoteArtifactMetadata = await installer._getRemoteArtifactMetadata({
		groupId: "com.sap.ui5.dist",
		artifactId: "sapui5-sdk-dist",
		version: "1.75.0",
		extension: "jar",
	});

	t.truthy(remoteArtifactMetadata.lastUpdate, "Proper metadata: lastUpdate");
	t.is(remoteArtifactMetadata.revision, "5.0.0-SNAPSHOT", "Proper metadata: revision");

	t.is(registryRequestMavenMetadataStub.callCount, 1, "requestPackagePackument should be called once");
	t.deepEqual(registryRequestMavenMetadataStub.getCall(0).args[0],
		{groupId: "com.sap.ui5.dist", artifactId: "sapui5-sdk-dist", version: "1.75.0"},
		"requestMavenMetadata was called with correct arguments");
});

test.serial("_getRemoteArtifactMetadata throws", async (t) => {
	const {Installer, registryRequestMavenMetadataStub} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: () => Promise.resolve("endpoint-url")
	});

	registryRequestMavenMetadataStub.resolves({});

	await t.throwsAsync(installer._getRemoteArtifactMetadata({
		groupId: "com.sap.ui5.dist",
		artifactId: "sapui5-sdk-dist",
		version: "1.75.0",
		extension: "jar",
	}), {message: "Missing Maven snapshot metadata for artifact com.sap.ui5.dist:sapui5-sdk-dist:1.75.0"});
});

test.serial("_getRemoteArtifactMetadata throws missing deployment metadata", async (t) => {
	const {Installer, registryRequestMavenMetadataStub} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: () => Promise.resolve("endpoint-url")
	});

	registryRequestMavenMetadataStub
		.resolves({
			versioning: {
				snapshotVersions: {
					snapshotVersion: [
						{"extension": "jar", "updated": "20220828080910", "value": "5.0.0-SNAPSHOT"},
						{
							"classifier": "pony-sources", "extension": "zip", "updated": "20220828080910",
							"value": "5.0.0-SNAPSHOT"
						}
					]
				}
			}
		});

	await t.throwsAsync(installer._getRemoteArtifactMetadata({
		groupId: "com.sap.ui5.dist",
		artifactId: "sapui5-sdk-dist",
		version: "1.75.0",
		extension: "zip",
		classifier: "npm-sources",
	}), {
		message: "Could not find npm-sources.zip deployment for artifact " +
		"com.sap.ui5.dist:sapui5-sdk-dist:1.75.0 in snapshot metadata:\n" +
		`[{"extension":"jar","updated":"20220828080910","value":"5.0.0-SNAPSHOT"},` +
		`{"classifier":"pony-sources","extension":"zip","updated":"20220828080910","value":"5.0.0-SNAPSHOT"}]`
	});
});

test.serial("_getLocalArtifactMetadata", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: () => {}
	});

	sinon.stub(installer, "readJson").resolves({foo: "bar"});
	const localArtifactMetadata = await installer._getLocalArtifactMetadata();

	t.deepEqual(localArtifactMetadata, {foo: "bar"}, "Returns the correct metadata");
});

test.serial("_getLocalArtifactMetadata file not found", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: () => {}
	});

	sinon.stub(installer, "readJson").throws({code: "ENOENT"});
	const localArtifactMetadata = await installer._getLocalArtifactMetadata();

	t.deepEqual(
		localArtifactMetadata,
		{lastCheck: 0, lastUpdate: 0, revision: null, staleRevisions: []},
		"Returns an 'empty' localArtifactMetadata"
	);
});

test.serial("_getLocalArtifactMetadata throws", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: () => {}
	});

	sinon.stub(installer, "readJson").throws(() => {
		throw new Error("Error message");
	});

	await t.throwsAsync(installer._getLocalArtifactMetadata(), {
		message: "Error message",
	});
});


test.serial("_writeLocalArtifactMetadata", async (t) => {
	const {Installer, writeFileStub} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: () => {}
	});

	// const writeJsonStub = sinon.stub(installer, "_writeJson").resolves("/path/to/file");
	writeFileStub.resolves("/path/to/file");

	const fsWriteRsource = await installer._writeLocalArtifactMetadata("Id", {foo: "bar"});

	t.is(fsWriteRsource, "/path/to/file");
	t.is(writeFileStub.callCount, 1, "_writeJson called");
	t.deepEqual(
		writeFileStub.args,
		[[path.join("/ui5Data/", "framework", "metadata", "Id.json"), "{\"foo\":\"bar\"}"]],
		"_writeJson called with correct arguments"
	);
});

test.serial("_removeStaleRevisions", async (t) => {
	const {Installer, rmStub} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: () => {}
	});

	const pathForArtifact = sinon.stub(installer, "_getTargetPathForArtifact")
		.onCall(0).resolves("/path/to/artifact/1")
		.onCall(1).resolves("/path/to/artifact/2");

	let metadata = {
		staleRevisions: ["1", "2", "3", "4", "5"],
	};

	await installer._removeStaleRevisions("Id", metadata, {pkgName: "myPkg"});

	t.is(metadata.staleRevisions.length, 3, "Metadata's staleRevisions cut");
	t.is(pathForArtifact.callCount, 2, "requested path for 2 artifacts");
	t.is(pathForArtifact.getCall(0).args[0].revision, "1", "Resolved revison 1");
	t.is(pathForArtifact.getCall(1).args[0].revision, "2", "Resolved revison 2");

	t.is(await rmStub.getCall(0).args[0], "/path/to/artifact/1", "Rm artifact 1");
	t.is(await rmStub.getCall(1).args[0], "/path/to/artifact/2", "Rm artifact 2");

	metadata = {
		staleRevisions: ["1"],
	};
	await installer._removeStaleRevisions("Id", metadata, {pkgName: "myPkg"});

	t.deepEqual(metadata, {staleRevisions: ["1"]}, "Stale revisions stay untouched if 1 or less");
});

test.serial("_pathExists", async (t) => {
	const {Installer, statStub} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: () => {}
	});

	statStub.resolves();
	const pathExists = await installer._pathExists("/target/path/");

	t.is(pathExists, true, "Target path exists");
	t.is(statStub.callCount, 1, "stat got called once");
	t.is(statStub.firstCall.firstArg, "/target/path/", "stat got called with expected argument");
});

test.serial("_pathExists file not found", async (t) => {
	const {Installer, statStub} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: () => {}
	});

	statStub.throws({code: "ENOENT"});
	const pathExists = await installer._pathExists("/target/path/");

	t.is(pathExists, false, "Target path does not exist");
});

test.serial("_pathExists throws", async (t) => {
	const {Installer, statStub} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: () => {}
	});

	statStub.throws(() => {
		throw new Error("Error message");
	});

	await t.throwsAsync(installer._pathExists("/target/path/"), {
		message: "Error message",
	}, "Threw with expected error message");
});

test.serial("_projectExists", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: () => {}
	});

	const pathExistsStub = sinon.stub(installer, "_pathExists").resolves(true);
	const projectExists = await installer._projectExists("/target/path/");

	t.is(projectExists, true, "Resolves the target path");
	t.is(pathExistsStub.callCount, 1, "_pathExists got called once");
	t.is(pathExistsStub.firstCall.firstArg, path.join("/target/path/package.json"),
		"_pathExists got called with expected argument");
});

test.serial("_projectExists: Does not exist", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: () => {}
	});

	const pathExistsStub = sinon.stub(installer, "_pathExists").resolves(false);
	const projectExists = await installer._projectExists("/target/path/");

	t.is(projectExists, false, "Resolves the target path");
	t.is(pathExistsStub.callCount, 1, "_pathExists got called once");
	t.is(pathExistsStub.firstCall.firstArg, path.join("/target/path/package.json"),
		"_pathExists got called with expected argument");
});

test.serial("_projectExists: Throws", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/",
		snapshotEndpointUrlCb: () => {}
	});

	const pathExistsStub = sinon.stub(installer, "_pathExists").throws(() => {
		throw new Error("Error message");
	});

	await t.throwsAsync(installer._projectExists("/target/path/"), {
		message: "Error message",
	}, "Threw with expected error message");

	t.is(pathExistsStub.callCount, 1, "_pathExists got called once");
	t.is(pathExistsStub.firstCall.firstArg, path.join("/target/path/package.json"),
		"_pathExists got called with expected argument");
});
