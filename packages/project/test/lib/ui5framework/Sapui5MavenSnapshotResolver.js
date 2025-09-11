import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import path from "node:path";
import os from "node:os";

test.beforeEach(async (t) => {
	t.context.InstallerStub = sinon.stub();
	t.context.fetchPackageVersionsStub = sinon.stub();
	t.context.installPackageStub = sinon.stub();
	t.context.readJsonStub = sinon.stub();
	t.context.InstallerStub.callsFake(() => {
		return {
			fetchPackageVersions: t.context.fetchPackageVersionsStub,
			installPackage: t.context.installPackageStub,
			readJson: t.context.readJsonStub
		};
	});

	process.env.UI5_MAVEN_SNAPSHOT_ENDPOINT_URL = "_SNAPSHOT_URL_";

	t.context.yesnoStub = sinon.stub();
	t.context.promisifyStub = sinon.stub();
	t.context.loggerVerbose = sinon.stub();
	t.context.loggerWarn = sinon.stub();
	t.context.loggerInfo = sinon.stub();

	t.context.Configuration = await esmock.p("../../../lib/config/Configuration.js", {});
	t.context.configFromFile = sinon.stub(t.context.Configuration, "fromFile")
		.resolves(new t.context.Configuration({}));
	t.context.configToFile = sinon.stub(t.context.Configuration, "toFile").resolves();

	t.context.Sapui5MavenSnapshotResolver = await esmock.p("../../../lib/ui5Framework/Sapui5MavenSnapshotResolver.js", {
		"../../../lib/ui5Framework/maven/Installer": t.context.InstallerStub,
		"yesno": t.context.yesnoStub,
		"node:util": {
			"promisify": t.context.promisifyStub
		},
		"@ui5/logger": {
			getLogger: () => ({
				verbose: t.context.loggerVerbose,
				warning: t.context.loggerWarn,
				info: t.context.loggerInfo,
			})
		},
		"../../../lib/config/Configuration": t.context.Configuration
	});

	t.context.originalIsTty = process.stdout.isTTY;
});

test.afterEach.always((t) => {
	process.stdout.isTTY = t.context.originalIsTty;
	delete process.env.UI5_MAVEN_SNAPSHOT_ENDPOINT_URL;
	esmock.purge(t.context.Sapui5MavenSnapshotResolver);
	sinon.restore();
});

test.serial(
	"Sapui5MavenSnapshotResolver: loadDistMetadata loads metadata "+
	"once from @sapui5/distribution-metadata package", async (t) => {
		const {Sapui5MavenSnapshotResolver} = t.context;

		const resolver = new Sapui5MavenSnapshotResolver({
			cwd: "/test-project/",
			version: "1.75.0"
		});

		const expectedMetadata = {
			libraries: {
				"sap.ui.foo": {
					"npmPackageName": "@openui5/sap.ui.foo",
					"version": "1.75.0",
					"dependencies": [],
					"optionalDependencies": []
				}
			}
		};

		t.context.installPackageStub
			.withArgs({
				pkgName: "@sapui5/distribution-metadata",
				groupId: "com.sap.ui5.dist",
				artifactId: "sapui5-sdk-dist",
				version: "1.75.0",
				classifier: "npm-sources",
				extension: "zip",
			})
			.resolves({pkgPath: "/path/to/distribution-metadata/1.75.0"});

		t.context.readJsonStub
			.withArgs(path.join("/path", "to", "distribution-metadata", "1.75.0", "metadata.json"))
			.resolves(expectedMetadata);

		let distMetadata = await resolver.loadDistMetadata();
		t.is(t.context.installPackageStub.callCount, 1, "Distribution metadata package should be installed once");
		t.deepEqual(distMetadata, expectedMetadata,
			"loadDistMetadata should resolve with expected metadata");

		// Calling loadDistMetadata again should not load package again
		distMetadata = await resolver.loadDistMetadata();

		t.is(t.context.installPackageStub.callCount, 1, "Distribution metadata package should still be installed once");
		t.deepEqual(distMetadata, expectedMetadata,
			"Metadata should still be the expected metadata after calling loadDistMetadata again");

		const libraryMetadata = await resolver.getLibraryMetadata("sap.ui.foo");
		t.deepEqual(libraryMetadata, expectedMetadata.libraries["sap.ui.foo"],
			"getLibraryMetadata returns metadata for one library");
	});

test.serial("Sapui5MavenSnapshotResolver: getLibraryMetadata throws", async (t) => {
	const {Sapui5MavenSnapshotResolver} = t.context;

	const resolver = new Sapui5MavenSnapshotResolver({
		cwd: "/test-project/",
		version: "1.75.0"
	});

	const loadDistMetadataStub = sinon.stub(resolver, "loadDistMetadata");
	loadDistMetadataStub.resolves({
		libraries: {}
	});

	await t.throwsAsync(resolver.getLibraryMetadata("sap.ui.foo"), {
		message: "Could not find library \"sap.ui.foo\"",
	});
});

test.serial("Sapui5MavenSnapshotResolver: handleLibrary", async (t) => {
	const {Sapui5MavenSnapshotResolver} = t.context;

	const resolver = new Sapui5MavenSnapshotResolver({
		cwd: "/test-project/",
		version: "1.116.0-SNAPSHOT"
	});

	const loadDistMetadataStub = sinon.stub(resolver, "loadDistMetadata");
	loadDistMetadataStub.resolves({
		libraries: {
			"sap.ui.lib1": {
				"npmPackageName": "@openui5/sap.ui.lib1",
				"version": "1.116.0-SNAPSHOT",
				"dependencies": [],
				"optionalDependencies": [],
				"gav": "x:y:z"
			}
		}
	});

	t.context.installPackageStub
		.callsFake(async ({pkgName, version}) => {
			throw new Error(`Unknown install call: ${pkgName}@${version}`);
		})
		.withArgs({
			pkgName: "@openui5/sap.ui.lib1-prebuilt",
			groupId: "x",
			artifactId: "y",
			version: "1.116.0-SNAPSHOT",
			classifier: "npm-dist",
			extension: "zip",
		})
		.resolves({pkgPath: "/foo/sap.ui.lib1"});


	const promises = await resolver.handleLibrary("sap.ui.lib1");

	t.true(promises.metadata instanceof Promise, "Metadata promise should be returned");
	t.true(promises.install instanceof Promise, "Install promise should be returned");

	const metadata = await promises.metadata;
	t.deepEqual(metadata, {
		"id": "@openui5/sap.ui.lib1-prebuilt",
		"version": "1.116.0-SNAPSHOT",
		"dependencies": [],
		"optionalDependencies": []
	}, "Expected library metadata should be returned");

	t.deepEqual(await promises.install, {pkgPath: "/foo/sap.ui.lib1"}, "Install should resolve with expected object");
	t.is(loadDistMetadataStub.callCount, 1, "loadDistMetadata should be called once");
});


test.serial("Sapui5MavenSnapshotResolver: handleLibrary - legacy version", async (t) => {
	const {Sapui5MavenSnapshotResolver} = t.context;

	const resolver = new Sapui5MavenSnapshotResolver({
		cwd: "/test-project/",
		version: "1.75.0-SNAPSHOT"
	});

	const loadDistMetadataStub = sinon.stub(resolver, "loadDistMetadata");
	loadDistMetadataStub.resolves({
		libraries: {
			"sap.ui.lib1": {
				"npmPackageName": "@openui5/sap.ui.lib1",
				"version": "1.75.0-SNAPSHOT",
				"dependencies": [],
				"optionalDependencies": [],
				"gav": "x:y:z"
			}
		}
	});

	t.context.installPackageStub
		.callsFake(async ({pkgName, version}) => {
			throw new Error(`Unknown install call: ${pkgName}@${version}`);
		})
		.withArgs({
			pkgName: "@openui5/sap.ui.lib1-prebuilt",
			groupId: "x",
			artifactId: "y",
			version: "1.75.0-SNAPSHOT",
			classifier: null,
			extension: "jar",
		})
		.resolves({pkgPath: "/foo/sap.ui.lib1"});


	const promises = await resolver.handleLibrary("sap.ui.lib1");

	t.true(promises.metadata instanceof Promise, "Metadata promise should be returned");
	t.true(promises.install instanceof Promise, "Install promise should be returned");

	const metadata = await promises.metadata;
	t.deepEqual(metadata, {
		"id": "@openui5/sap.ui.lib1-prebuilt",
		"version": "1.75.0-SNAPSHOT",
		"dependencies": [],
		"optionalDependencies": []
	}, "Expected library metadata should be returned");

	t.deepEqual(await promises.install, {pkgPath: "/foo/sap.ui.lib1"}, "Install should resolve with expected object");
	t.is(loadDistMetadataStub.callCount, 1, "loadDistMetadata should be called once");
});

test.serial("Sapui5MavenSnapshotResolver: handleLibrary - sources requested", async (t) => {
	const {Sapui5MavenSnapshotResolver} = t.context;

	const resolver = new Sapui5MavenSnapshotResolver({
		cwd: "/test-project/",
		version: "1.116.0-SNAPSHOT",
		sources: true
	});

	const loadDistMetadataStub = sinon.stub(resolver, "loadDistMetadata");
	loadDistMetadataStub.resolves({
		libraries: {
			"sap.ui.lib1": {
				"npmPackageName": "@openui5/sap.ui.lib1",
				"version": "1.116.0-SNAPSHOT",
				"dependencies": [],
				"optionalDependencies": [],
				"gav": "x:y:z"
			}
		}
	});

	t.context.installPackageStub
		.callsFake(async ({pkgName, version}) => {
			throw new Error(`Unknown install call: ${pkgName}@${version}`);
		})
		.withArgs({
			pkgName: "@openui5/sap.ui.lib1",
			groupId: "x",
			artifactId: "y",
			version: "1.116.0-SNAPSHOT",
			classifier: "npm-sources",
			extension: "zip",
		})
		.resolves({pkgPath: "/foo/sap.ui.lib1"});


	const promises = await resolver.handleLibrary("sap.ui.lib1");

	t.true(promises.metadata instanceof Promise, "Metadata promise should be returned");
	t.true(promises.install instanceof Promise, "Install promise should be returned");

	const metadata = await promises.metadata;
	t.deepEqual(metadata, {
		"id": "@openui5/sap.ui.lib1",
		"version": "1.116.0-SNAPSHOT",
		"dependencies": [],
		"optionalDependencies": []
	}, "Expected library metadata should be returned");

	t.deepEqual(await promises.install, {pkgPath: "/foo/sap.ui.lib1"}, "Install should resolve with expected object");
	t.is(loadDistMetadataStub.callCount, 1, "loadDistMetadata should be called once");
});

test.serial("Sapui5MavenSnapshotResolver: handleLibrary - sources requested with legacy version", async (t) => {
	const {Sapui5MavenSnapshotResolver} = t.context;

	const resolver = new Sapui5MavenSnapshotResolver({
		cwd: "/test-project/",
		version: "1.75.0-SNAPSHOT",
		sources: true
	});

	const loadDistMetadataStub = sinon.stub(resolver, "loadDistMetadata");
	loadDistMetadataStub.resolves({
		libraries: {
			"sap.ui.lib1": {
				"npmPackageName": "@openui5/sap.ui.lib1",
				"version": "1.75.0-SNAPSHOT",
				"dependencies": [],
				"optionalDependencies": [],
				"gav": "x:y:z"
			}
		}
	});

	t.context.installPackageStub
		.callsFake(async ({pkgName, version}) => {
			throw new Error(`Unknown install call: ${pkgName}@${version}`);
		})
		.withArgs({
			pkgName: "@openui5/sap.ui.lib1",
			groupId: "x",
			artifactId: "y",
			version: "1.75.0-SNAPSHOT",
			classifier: "npm-sources",
			extension: "zip",
		})
		.resolves({pkgPath: "/foo/sap.ui.lib1"});


	const promises = await resolver.handleLibrary("sap.ui.lib1");

	t.true(promises.metadata instanceof Promise, "Metadata promise should be returned");
	t.true(promises.install instanceof Promise, "Install promise should be returned");

	const metadata = await promises.metadata;
	t.deepEqual(metadata, {
		"id": "@openui5/sap.ui.lib1",
		"version": "1.75.0-SNAPSHOT",
		"dependencies": [],
		"optionalDependencies": []
	}, "Expected library metadata should be returned");

	t.deepEqual(await promises.install, {pkgPath: "/foo/sap.ui.lib1"}, "Install should resolve with expected object");
	t.is(loadDistMetadataStub.callCount, 1, "loadDistMetadata should be called once");
});

test.serial("Sapui5MavenSnapshotResolver: handleLibrary throws", async (t) => {
	const {Sapui5MavenSnapshotResolver} = t.context;

	const resolver = new Sapui5MavenSnapshotResolver({
		cwd: "/test-project/",
		version: "1.75.0"
	});

	sinon.stub(resolver, "getLibraryMetadata").resolves({});

	await t.throwsAsync(resolver.handleLibrary("sap.ui.lib1"), {
		message:
			"Metadata is missing GAV (group, artifact and version) information. "+
			"This might indicate an unsupported SNAPSHOT version.",
	});
});

test.serial("Sapui5MavenSnapshotResolver: Static fetchAllVersions", async (t) => {
	const {Sapui5MavenSnapshotResolver} = t.context;

	const expectedVersions = ["1.75.0-SNAPSHOT", "1.75.1-SNAPSHOT", "1.76.0-SNAPSHOT"];
	const options = {
		cwd: "/cwd",
		ui5DataDir: "/ui5DataDir"
	};

	t.context.fetchPackageVersionsStub.returns(expectedVersions);
	sinon.stub(Sapui5MavenSnapshotResolver, "_createSnapshotEndpointUrlCallback")
		.returns("snapshotEndpointUrlCallback");

	const versions = await Sapui5MavenSnapshotResolver.fetchAllVersions(options);

	t.deepEqual(versions, expectedVersions, "Fetched versions should be correct");

	t.is(t.context.fetchPackageVersionsStub.callCount, 1, "fetchPackageVersions should be called once");
	t.deepEqual(
		t.context.fetchPackageVersionsStub.getCall(0).args,
		[{artifactId: "sapui5-sdk-dist", groupId: "com.sap.ui5.dist"}],
		"fetchPackageVersions should be called with expected arguments"
	);

	t.is(t.context.InstallerStub.callCount, 1, "Installer should be called once");
	t.true(t.context.InstallerStub.calledWithNew(), "Installer should be called with new");
	t.deepEqual(t.context.InstallerStub.getCall(0).args, [{
		cwd: path.resolve("/cwd"),
		snapshotEndpointUrlCb: "snapshotEndpointUrlCallback",
		ui5DataDir: path.resolve("/ui5DataDir")
	}], "Installer should be called with expected arguments");
});

test.serial("Sapui5MavenSnapshotResolver: Static fetchAllVersions without options", async (t) => {
	const {Sapui5MavenSnapshotResolver} = t.context;

	const expectedVersions = ["1.75.0-SNAPSHOT", "1.75.1-SNAPSHOT", "1.76.0-SNAPSHOT"];

	t.context.fetchPackageVersionsStub.returns(expectedVersions);
	sinon.stub(Sapui5MavenSnapshotResolver, "_createSnapshotEndpointUrlCallback")
		.returns("snapshotEndpointUrlCallback");

	const versions = await Sapui5MavenSnapshotResolver.fetchAllVersions();

	t.deepEqual(versions, expectedVersions, "Fetched versions should be correct");

	t.is(t.context.fetchPackageVersionsStub.callCount, 1, "fetchPackageVersions should be called once");
	t.deepEqual(t.context.fetchPackageVersionsStub.getCall(0).args,
		[{artifactId: "sapui5-sdk-dist", groupId: "com.sap.ui5.dist"}],
		"fetchPackageVersions should be called with expected arguments");

	t.is(t.context.InstallerStub.callCount, 1, "Installer should be called once");
	t.true(t.context.InstallerStub.calledWithNew(), "Installer should be called with new");
	t.deepEqual(t.context.InstallerStub.getCall(0).args, [{
		cwd: process.cwd(),
		snapshotEndpointUrlCb: "snapshotEndpointUrlCallback",
		ui5DataDir: path.join(os.homedir(), ".ui5")
	}], "Installer should be called with expected arguments");
});

test.serial("_createSnapshotEndpointUrlCallback: Environment variable", async (t) => {
	const {Sapui5MavenSnapshotResolver} = t.context;
	const createSnapshotEndpointUrlCallback = Sapui5MavenSnapshotResolver._createSnapshotEndpointUrlCallback;

	const endpointCallback = await createSnapshotEndpointUrlCallback("my url");

	t.is(await endpointCallback(), "_SNAPSHOT_URL_",
		"Returned a callback resolving to value of env variable");
});

test.serial("_createSnapshotEndpointUrlCallback: Parameter", async (t) => {
	const {Sapui5MavenSnapshotResolver} = t.context;
	const createSnapshotEndpointUrlCallback = Sapui5MavenSnapshotResolver._createSnapshotEndpointUrlCallback;

	delete process.env.UI5_MAVEN_SNAPSHOT_ENDPOINT_URL; // Delete env variable for this test
	const endpointCallback = await createSnapshotEndpointUrlCallback("my url");

	t.is(await endpointCallback(), "my url",
		"Returned a callback resolving to value of env variable");
});

test.serial("_createSnapshotEndpointUrlCallback: Fallback to configuration files", async (t) => {
	const {Sapui5MavenSnapshotResolver} = t.context;
	const createSnapshotEndpointUrlCallback = Sapui5MavenSnapshotResolver._createSnapshotEndpointUrlCallback;

	delete process.env.UI5_MAVEN_SNAPSHOT_ENDPOINT_URL; // Delete env variable for this test
	const resolveUrlStub = sinon.stub(Sapui5MavenSnapshotResolver, "_resolveSnapshotEndpointUrl").resolves("🐱");

	const endpointCallback = await createSnapshotEndpointUrlCallback();

	t.is(endpointCallback, resolveUrlStub, "Returned correct callback");
	t.is(await endpointCallback(), "🐱", "Callback can be executed correctly");
});

test.serial("_resolveSnapshotEndpointUrl: From configuration", async (t) => {
	const {configFromFile, configToFile, Configuration, Sapui5MavenSnapshotResolver} = t.context;
	const resolveSnapshotEndpointUrl = Sapui5MavenSnapshotResolver._resolveSnapshotEndpointUrl;

	configFromFile.resolves(new Configuration({mavenSnapshotEndpointUrl: "config-url"}));
	const fromMavenStub = sinon.stub(Sapui5MavenSnapshotResolver, "_resolveSnapshotEndpointUrlFromMaven").resolves();

	const endpoint = await resolveSnapshotEndpointUrl();

	t.is(endpoint, "config-url", "Returned URL extracted from UI5 CLI configuration");
	t.is(configFromFile.callCount, 1, "Configuration has been read once");
	t.is(configToFile.callCount, 0, "Configuration has not been written");
	t.is(fromMavenStub.callCount, 0, "Maven configuration has not been requested");
});

test.serial("_resolveSnapshotEndpointUrl: Maven fallback with config update", async (t) => {
	const {configFromFile, configToFile, Sapui5MavenSnapshotResolver} = t.context;
	const resolveSnapshotEndpointUrl = Sapui5MavenSnapshotResolver._resolveSnapshotEndpointUrl;

	sinon.stub(Sapui5MavenSnapshotResolver, "_resolveSnapshotEndpointUrlFromMaven").resolves("maven-url");

	const endpoint = await resolveSnapshotEndpointUrl();

	t.is(endpoint, "maven-url", "Returned URL extracted from Maven settings.xml");
	t.is(configFromFile.callCount, 1, "Configuration has been read once");
	t.is(configToFile.callCount, 1, "Configuration has been written once");
	t.deepEqual(configToFile.firstCall.firstArg.toJson(), {
		mavenSnapshotEndpointUrl: "maven-url",
		ui5DataDir: undefined
	}, "Correct configuration has been written");
});

test.serial("_resolveSnapshotEndpointUrl: Maven fallback without config update", async (t) => {
	const {configFromFile, configToFile, Sapui5MavenSnapshotResolver} = t.context;
	const resolveSnapshotEndpointUrl = Sapui5MavenSnapshotResolver._resolveSnapshotEndpointUrl;

	// Resolving with null
	sinon.stub(Sapui5MavenSnapshotResolver, "_resolveSnapshotEndpointUrlFromMaven").resolves(null);

	const endpoint = await resolveSnapshotEndpointUrl();

	t.is(endpoint, null, "No URL resolved");
	t.is(configFromFile.callCount, 1, "Configuration has been read once");
	t.is(configToFile.callCount, 0, "Configuration has not been written");
});

test.serial("_resolveSnapshotEndpointUrlFromMaven", async (t) => {
	const resolveSnapshotEndpointUrl = t.context.Sapui5MavenSnapshotResolver._resolveSnapshotEndpointUrlFromMaven;
	const {promisifyStub, yesnoStub} = t.context;

	process.stdout.isTTY = true;

	const readStub = sinon.stub().resolves(`<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0"
	xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/SETTINGS/1.0.0 http://maven.apache.org/xsd/settings-1.0.0.xsd">
	  <profiles>
		<profile>
		  <id>snapshot.build</id>
		  <pluginRepositories>
			<pluginRepository>
			  <id>artifactory</id>
			  <url>/build-snapshots/</url>
			</pluginRepository>
		  </pluginRepositories>
		</profile>
	  </profiles>
	</settings>`);
	promisifyStub.callsFake(() => readStub);
	yesnoStub.resolves(true);

	const endpoint = await resolveSnapshotEndpointUrl();

	t.is(endpoint, "/build-snapshots/", "URL Extracted from settings.xml");
});

test.serial("_resolveSnapshotEndpointUrlFromMaven: No snapshot.build attribute", async (t) => {
	const resolveSnapshotEndpointUrl = t.context.Sapui5MavenSnapshotResolver._resolveSnapshotEndpointUrlFromMaven;
	const {promisifyStub, yesnoStub} = t.context;

	process.stdout.isTTY = true;

	const readStub = sinon.stub().resolves(`<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0"
	xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/SETTINGS/1.0.0 http://maven.apache.org/xsd/settings-1.0.0.xsd">
	  <profiles>
		<profile>
		  <id>deploy.build</id>
		  <pluginRepositories>
			<pluginRepository>
			  <id>artifactory</id>
			  <url>/build-snapshots/</url>
			</pluginRepository>
		  </pluginRepositories>
		</profile>
	  </profiles>
	</settings>`);
	promisifyStub.callsFake(() => readStub);
	yesnoStub.resolves(true);

	const endpoint = await resolveSnapshotEndpointUrl();

	t.is(endpoint, null, "No URL Extracted from settings.xml");
});

test.serial("_resolveSnapshotEndpointUrlFromMaven fails", async (t) => {
	const resolveSnapshotEndpointUrl = t.context.Sapui5MavenSnapshotResolver._resolveSnapshotEndpointUrlFromMaven;
	const {promisifyStub, yesnoStub, loggerVerbose, loggerWarn} = t.context;

	process.stdout.isTTY = true;

	const readStub = sinon.stub()
		.onFirstCall().throws({code: "ENOENT"})
		.onSecondCall().throws(new Error("Error"))
		.resolves(`<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0"
			xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/SETTINGS/1.0.0 http://maven.apache.org/xsd/settings-1.0.0.xsd">
			<profiles>
				<profile>
				<id>snapshot.build</id>
				<repositories>
					<repository>
					<id>artifactory</id>
					<url>/build-snapshots/</url>
					</repository>
				</repositories>
				</profile>
			</profiles>
			</settings>`);
	promisifyStub.callsFake(() => readStub);

	let endpoint;
	endpoint = await resolveSnapshotEndpointUrl(".m2/settings.xml");
	t.is(endpoint, null, "No endpoint resolved");
	t.is(
		loggerVerbose.getCall(0).args[0],
		"Attempting to resolve snapshot endpoint URL from Maven configuration file at .m2/settings.xml..."
	);
	t.is(
		loggerVerbose.getCall(1).args[0],
		`File does not exist: .m2/settings.xml`
	);

	loggerVerbose.reset();
	loggerWarn.reset();
	endpoint = await resolveSnapshotEndpointUrl("settings.xml");
	t.is(endpoint, null, "No endpoint resolved");
	t.is(
		loggerVerbose.getCall(0).args[0],
		"Attempting to resolve snapshot endpoint URL from Maven configuration file at settings.xml..."
	);
	t.is(
		loggerWarn.getCall(0).args[0],
		"Failed to read Maven configuration file from settings.xml: Error"
	);

	loggerVerbose.reset();
	loggerWarn.reset();
	yesnoStub.resolves(false);
	endpoint = await resolveSnapshotEndpointUrl();

	t.is(endpoint, null, "URL is not extracted after user rejection");
	t.is(
		loggerVerbose.getCall(1).args[0],
		"User rejected usage of the resolved URL"
	);
});

test.serial("_resolveSnapshotEndpointUrlFromMaven no TTY", async (t) => {
	const resolveSnapshotEndpointUrl = t.context.Sapui5MavenSnapshotResolver._resolveSnapshotEndpointUrlFromMaven;
	const {promisifyStub, yesnoStub} = t.context;

	process.stdout.isTTY = false;

	const readStub = sinon.stub().resolves(`<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0"
	xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/SETTINGS/1.0.0 http://maven.apache.org/xsd/settings-1.0.0.xsd">
	  <profiles>
		<profile>
		  <id>snapshot.build</id>
		  <pluginRepositories>
			<pluginRepository>
			  <id>artifactory</id>
			  <url>/build-snapshots/</url>
			</pluginRepository>
		  </pluginRepositories>
		</profile>
	  </profiles>
	</settings>`);
	promisifyStub.callsFake(() => readStub);
	yesnoStub.resolves(true);

	const endpoint = await resolveSnapshotEndpointUrl(".m2/settings.xml");

	t.is(readStub.callCount, 0, "read did not get called");
	t.is(yesnoStub.callCount, 0, "yesno did not get called");
	t.is(endpoint, null, "No URL got extracted");
});
