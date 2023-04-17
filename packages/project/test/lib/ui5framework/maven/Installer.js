import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import path from "node:path";
import fs from "graceful-fs";
import {rimraf} from "rimraf";

test.beforeEach(async (t) => {
	t.context.mkdirpStub = sinon.stub().resolves();
	t.context.rimrafStub = sinon.stub().resolves();
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
	t.context.promisifyStub.withArgs(rimraf).callsFake(() => t.context.rimrafStub);

	t.context.lockStub = sinon.stub();
	t.context.unlockStub = sinon.stub();
	t.context.zipStub = class StreamZipStub {
		extract = sinon.stub().resolves();
		close = sinon.stub().resolves();
	};

	t.context.AbstractInstaller = await esmock.p("../../../../lib/ui5Framework/AbstractInstaller.js", {
		"../../../../lib/utils/fs.js": {
			mkdirp: t.context.mkdirpStub
		},
		"lockfile": {
			lock: t.context.lockStub,
			unlock: t.context.unlockStub
		}
	});

	t.context.Installer = await esmock.p("../../../../lib/ui5Framework/maven/Installer.js", {
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

test.serial("Installer: constructor", (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/",
		snapshotEndpointUrlCb: () => {}
	});
	t.true(installer instanceof Installer, "Constructor returns instance of class");
	t.is(installer._artifactsDir, path.join("/ui5Home/", "framework", "artifacts"));
	t.is(installer._packagesDir, path.join("/ui5Home/", "framework", "packages"));
	t.is(installer._lockDir, path.join("/ui5Home/", "framework", "locks"));
	t.is(installer._stagingDir, path.join("/ui5Home/", "framework", "staging"));
	t.is(installer._metadataDir, path.join("/ui5Home/", "framework", "metadata"));
});

test.serial("Installer: constructor requires 'ui5HomeDir'", (t) => {
	const {Installer} = t.context;

	t.throws(() => {
		new Installer({
			cwd: "/cwd/"
		});
	}, {message: `Installer: Missing parameter "ui5HomeDir"`});
});

test.serial("Installer: constructor requires 'snapshotEndpointUrlCb' or ENV variable", (t) => {
	const {Installer} = t.context;

	t.throws(() => {
		new Installer({
			cwd: "/cwd/",
			ui5HomeDir: "/ui5Home"
		});
	}, {message: `Installer: Missing Snapshot-Endpoint URL callback parameter`});
});

test.serial("Installer: fetchPackageVersions", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/",
		snapshotEndpointUrlCb: () => Promise.resolve("endpoint-url")
	});

	const registry = await installer.getRegistry();
	const requestMavenMetadataStub = sinon.stub(registry, "requestMavenMetadata")
		.resolves({
			versioning: {
				versions: {
					version: ["1.0.0", "2.0.0", "2.0.0-SNAPSHOT", "3.0.0", "5.0.0-SNAPSHOT"]
				}
			}
		});

	const packageVersions = await installer.fetchPackageVersions({groupId: "ui5.corp", artifactId: "great-thing"});

	t.deepEqual(packageVersions, ["2.0.0-SNAPSHOT", "5.0.0-SNAPSHOT"], "Should resolve with expected versions");

	t.is(requestMavenMetadataStub.callCount, 1, "requestPackagePackument should be called once");
	t.deepEqual(requestMavenMetadataStub.getCall(0).args[0], {groupId: "ui5.corp", artifactId: "great-thing"},
		"requestMavenMetadata was called with correct arguments");
});

test.serial("Installer: fetchPackageVersions throws", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/",
		snapshotEndpointUrlCb: () => Promise.resolve("endpoint-url")
	});

	const registry = await installer.getRegistry();
	sinon.stub(registry, "requestMavenMetadata").resolves({});

	await t.throwsAsync(
		installer.fetchPackageVersions({
			groupId: "ui5.corp",
			artifactId: "great-thing",
		}),
		{message: "Missing Maven metadata for artifact ui5.corp:great-thing"}
	);
});

test.serial("Installer: _getLockPath", (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/",
		snapshotEndpointUrlCb: () => {}
	});

	const lockPath = installer._getLockPath("package-@openui5/sap.ui.lib1@1.2.3-SNAPSHOT");

	t.is(lockPath, path.join("/ui5Home/", "framework", "locks", "package-@openui5-sap.ui.lib1@1.2.3-SNAPSHOT.lock"));
});

test.serial("Installer: readJson", async (t) => {
	const jsonStub = {json: "response"};
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/",
		snapshotEndpointUrlCb: () => {}
	});

	t.context.readFileStub.resolves(JSON.stringify(jsonStub));

	const jsonResponse = await installer.readJson("package-@openui5/sap.ui.lib1@1.2.3-SNAPSHOT");

	t.deepEqual(jsonResponse, jsonStub);
});

test.serial("Installer: installPackage", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/",
		snapshotEndpointUrlCb: () => {}
	});

	sinon.stub(installer, "_fetchArtifactMetadata").resolves({revision: "1.22"});
	sinon.stub(installer, "_pathExists").resolves(false);
	sinon.stub(installer, "_synchronize").callsFake( async (pckg, callback) => await callback());
	sinon.stub(installer, "installArtifact").resolves({
		artifactPath: "/ui5Home/framework/artifacts/com_sap_ui5_dist-sapui5-sdk-dist/1.22/npm-sources.zip",
		removeArtifact: sinon.stub().resolves()
	});

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
				path.join("/ui5Home/", "framework", "packages", "@sapui5", "distribution-metadata", "1.22")},
		"Install the correct package"
	);
});

test.serial("Installer: installArtifact", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/",
		snapshotEndpointUrlCb: () => {}
	});

	sinon.stub(installer, "_fetchArtifactMetadata").resolves({revision: "1.22"});
	sinon.stub(installer, "_pathExists").resolves(false);
	sinon.stub(installer, "_synchronize").callsFake( async (pckg, callback) => await callback());
	sinon.stub(installer, "getRegistry").callsFake(() => {
		return {
			requestArtifact: sinon.stub().resolves()
		};
	});

	const installedArtifact = await installer.installArtifact({
		groupId: "com.sap.ui5.dist",
		artifactId: "sapui5-sdk-dist",
		version: "1.75.0",
		extension: "jar",
	});

	t.is(
		installedArtifact.artifactPath,
		path.join("/ui5Home/", "framework", "artifacts", "com_sap_ui5_dist-sapui5-sdk-dist", "1.22.jar"),
		"artifactPath correctly resolved"
	);

	t.is(
		typeof installedArtifact.removeArtifact,
		"function",
		"removeArtifact method"
	);
});

test.serial("Installer: _fetchArtifactMetadata", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/",
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
	sinon.stub(installer, "_getRemoteArtifactMetadata").resolves({revision: "1.22", lastUpdate: 0});
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
	t.is(artifactMetadata.revision, "1.22", "Proper metadata: revision");
});

test.serial("Installer: _fetchArtifactMetadata throws", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/",
		snapshotEndpointUrlCb: () => {},
		cacheMode: "force"
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

test.serial("Installer: _getRemoteArtifactMetadata", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/",
		snapshotEndpointUrlCb: () => Promise.resolve("endpoint-url")
	});

	const registry = await installer.getRegistry();
	const requestMavenMetadataStub = sinon.stub(registry, "requestMavenMetadata")
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

	t.is(requestMavenMetadataStub.callCount, 1, "requestPackagePackument should be called once");
	t.deepEqual(requestMavenMetadataStub.getCall(0).args[0],
		{groupId: "com.sap.ui5.dist", artifactId: "sapui5-sdk-dist", version: "1.75.0"},
		"requestMavenMetadata was called with correct arguments");
});

test.serial("Installer: _getRemoteArtifactMetadata throws", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/",
		snapshotEndpointUrlCb: () => Promise.resolve("endpoint-url")
	});

	const registry = await installer.getRegistry();
	sinon.stub(registry, "requestMavenMetadata").resolves({});

	await t.throwsAsync(installer._getRemoteArtifactMetadata({
		groupId: "com.sap.ui5.dist",
		artifactId: "sapui5-sdk-dist",
		version: "1.75.0",
		extension: "jar",
	}), {message: "Missing Maven snapshot metadata for artifact com.sap.ui5.dist:sapui5-sdk-dist:1.75.0"});
});

test.serial("Installer: _getRemoteArtifactMetadata throws missing deployment metadata", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/",
		snapshotEndpointUrlCb: () => Promise.resolve("endpoint-url")
	});

	const registry = await installer.getRegistry();
	sinon.stub(registry, "requestMavenMetadata")
		.resolves({
			versioning: {
				snapshotVersions: {
					snapshotVersion: [{"value": "5.0.0-SNAPSHOT"}]
				}
			}
		});


	await t.throwsAsync(installer._getRemoteArtifactMetadata({
		groupId: "com.sap.ui5.dist",
		artifactId: "sapui5-sdk-dist",
		version: "1.75.0",
		extension: "jar",
	}), {message: "Could not find deployment undefined.jar for artifact " +
	"com.sap.ui5.dist:sapui5-sdk-dist:1.75.0 in snapshot metadata:\n[{\"value\":\"5.0.0-SNAPSHOT\"}]"});
});

test.serial("Installer: _getLocalArtifactMetadata", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/",
		snapshotEndpointUrlCb: () => {}
	});

	sinon.stub(installer, "readJson").resolves({foo: "bar"});
	const localArtifactMetadata = await installer._getLocalArtifactMetadata();

	t.deepEqual(localArtifactMetadata, {foo: "bar"}, "Returns the correct metadata");
});

test.serial("Installer: _getLocalArtifactMetadata file not found", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/",
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

test.serial("Installer: _getLocalArtifactMetadata throws", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/",
		snapshotEndpointUrlCb: () => {}
	});

	sinon.stub(installer, "readJson").throws(() => {
		throw new Error("Error message");
	});

	await t.throwsAsync(installer._getLocalArtifactMetadata(), {
		message: "Error message",
	});
});


test.serial("Installer: _writeLocalArtifactMetadata", async (t) => {
	const {Installer, writeFileStub} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/",
		snapshotEndpointUrlCb: () => {}
	});

	// const writeJsonStub = sinon.stub(installer, "_writeJson").resolves("/path/to/file");
	writeFileStub.resolves("/path/to/file");

	const fsWriteRsource = await installer._writeLocalArtifactMetadata("Id", {foo: "bar"});

	t.is(fsWriteRsource, "/path/to/file");
	t.is(writeFileStub.callCount, 1, "_writeJson called");
	t.deepEqual(
		writeFileStub.args,
		[[path.join("/ui5Home/", "framework", "metadata", "Id.json"), "{\"foo\":\"bar\"}"]],
		"_writeJson called with correct arguments"
	);
});

test.serial("Installer: _removeStaleRevisions", async (t) => {
	const {Installer, rmStub} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/",
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

test.serial("Installer: _pathExists", async (t) => {
	const {Installer, statStub} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/",
		snapshotEndpointUrlCb: () => {}
	});

	statStub.resolves("/target/path/");
	const pathExists = await installer._pathExists();

	t.is(pathExists, true, "Resolves the target path");
});

test.serial("Installer: _pathExists file not found", async (t) => {
	const {Installer, statStub} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/",
		snapshotEndpointUrlCb: () => {}
	});

	statStub.throws({code: "ENOENT"});
	const pathExists = await installer._pathExists();

	t.is(pathExists, false, "Target path is not resolved");
});

test.serial("Installer: _pathExists throws", async (t) => {
	const {Installer, statStub} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/",
		snapshotEndpointUrlCb: () => {}
	});

	statStub.throws(() => {
		throw new Error("Error message");
	});

	await t.throwsAsync(installer._pathExists(), {
		message: "Error message",
	});
});
