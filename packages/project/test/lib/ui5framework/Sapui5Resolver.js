const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");
const path = require("path");
const os = require("os");

let Sapui5Resolver;

test.beforeEach((t) => {
	t.context.InstallerStub = sinon.stub();
	t.context.fetchPackageVersionsStub = sinon.stub();
	t.context.installPackageStub = sinon.stub();
	t.context.getTargetDirForPackageStub = sinon.stub();
	t.context.readJsonStub = sinon.stub();
	t.context.InstallerStub.callsFake(() => {
		return {
			fetchPackageVersions: t.context.fetchPackageVersionsStub,
			installPackage: t.context.installPackageStub,
			getTargetDirForPackage: t.context.getTargetDirForPackageStub,
			readJson: t.context.readJsonStub
		};
	});

	mock("../../../lib/ui5Framework/npm/Installer", t.context.InstallerStub);

	Sapui5Resolver = mock.reRequire("../../../lib/ui5Framework/Sapui5Resolver");
});

test.afterEach.always(() => {
	sinon.restore();
	mock.stopAll();
});

test.serial(
	"Sapui5Resolver: loadDistMetadata loads metadata once from @sapui5/distribution-metadata package", async (t) => {
		const resolver = new Sapui5Resolver({
			cwd: "/test-project/",
			version: "1.75.0"
		});

		t.context.getTargetDirForPackageStub.callsFake(({pkgName, version}) => {
			throw new Error(
				`getTargetDirForPackage stub called with unknown arguments pkgName: ${pkgName}, version: ${version}}`);
		}).withArgs({
			pkgName: "@sapui5/distribution-metadata",
			version: "1.75.0"
		}).returns(path.join("/path", "to", "distribution-metadata", "1.75.0"));
		t.context.installPackageStub.withArgs({
			pkgName: "@sapui5/distribution-metadata",
			version: "1.75.0"
		}).resolves({pkgPath: path.join("/path", "to", "distribution-metadata", "1.75.0")});

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

test.serial("Sapui5Resolver: handleLibrary", async (t) => {
	const resolver = new Sapui5Resolver({
		cwd: "/test-project/",
		version: "1.75.0"
	});

	const loadDistMetadataStub = sinon.stub(resolver, "loadDistMetadata");
	loadDistMetadataStub.resolves({
		libraries: {
			"sap.ui.lib1": {
				"npmPackageName": "@openui5/sap.ui.lib1",
				"version": "1.75.0",
				"dependencies": [],
				"optionalDependencies": []
			}
		}
	});

	t.context.installPackageStub
		.callsFake(async ({pkgName, version}) => {
			throw new Error(`Unknown install call: ${pkgName}@${version}`);
		})
		.withArgs({pkgName: "@openui5/sap.ui.lib1", version: "1.75.0"}).resolves({pkgPath: "/foo/sap.ui.lib1"});


	const promises = await resolver.handleLibrary("sap.ui.lib1");

	t.true(promises.metadata instanceof Promise, "Metadata promise should be returned");
	t.true(promises.install instanceof Promise, "Install promise should be returned");

	const metadata = await promises.metadata;
	t.deepEqual(metadata, {
		"id": "@openui5/sap.ui.lib1",
		"version": "1.75.0",
		"dependencies": [],
		"optionalDependencies": []
	}, "Expected library metadata should be returned");

	t.deepEqual(await promises.install, {pkgPath: "/foo/sap.ui.lib1"}, "Install should resolve with expected object");
	t.is(loadDistMetadataStub.callCount, 1, "loadDistMetadata should be called once");
});

test.serial("Sapui5Resolver: Static fetchAllVersions", async (t) => {
	const expectedVersions = ["1.75.0", "1.75.1", "1.76.0"];
	const options = {
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	};

	t.context.fetchPackageVersionsStub.returns(expectedVersions);

	const versions = await Sapui5Resolver.fetchAllVersions(options);

	t.deepEqual(versions, expectedVersions, "Fetched versions should be correct");

	t.is(t.context.fetchPackageVersionsStub.callCount, 1, "fetchPackageVersions should be called once");
	t.deepEqual(t.context.fetchPackageVersionsStub.getCall(0).args, [{pkgName: "@sapui5/distribution-metadata"}],
		"fetchPackageVersions should be called with expected arguments");

	t.is(t.context.InstallerStub.callCount, 1, "Installer should be called once");
	t.true(t.context.InstallerStub.calledWithNew(), "Installer should be called with new");
	t.deepEqual(t.context.InstallerStub.getCall(0).args, [{
		cwd: path.resolve("/cwd"),
		ui5HomeDir: path.resolve("/ui5HomeDir")
	}], "Installer should be called with expected arguments");
});

test.serial("Sapui5Resolver: Static fetchAllVersions without options", async (t) => {
	const expectedVersions = ["1.75.0", "1.75.1", "1.76.0"];

	t.context.fetchPackageVersionsStub.returns(expectedVersions);

	const versions = await Sapui5Resolver.fetchAllVersions();

	t.deepEqual(versions, expectedVersions, "Fetched versions should be correct");

	t.is(t.context.fetchPackageVersionsStub.callCount, 1, "fetchPackageVersions should be called once");
	t.deepEqual(t.context.fetchPackageVersionsStub.getCall(0).args, [{pkgName: "@sapui5/distribution-metadata"}],
		"fetchPackageVersions should be called with expected arguments");

	t.is(t.context.InstallerStub.callCount, 1, "Installer should be called once");
	t.true(t.context.InstallerStub.calledWithNew(), "Installer should be called with new");
	t.deepEqual(t.context.InstallerStub.getCall(0).args, [{
		cwd: process.cwd(),
		ui5HomeDir: path.join(os.homedir(), ".ui5")
	}], "Installer should be called with expected arguments");
});

test.serial(
	"Sapui5Resolver: getLibraryMetadata should use Openui5Resolver for @openui5/ modules in 1.77.x", async (t) => {
		const resolver = new Sapui5Resolver({
			cwd: "/test-project/",
			version: "1.77.7"
		});

		const openui5LibraryMetadata = {
			"id": "@openui5/sap.ui.lib3",
			"version": "1.77.4",
			"dependencies": [
				"@openui5/sap.ui.lib1"
			],
			"optionalDependencies": [
				"@openui5/sap.ui.lib2"
			]
		};
		const expectedMetadata = {
			"npmPackageName": "@openui5/sap.ui.lib3",
			"version": "1.77.4",
			"dependencies": [
				"@openui5/sap.ui.lib1"
			],
			"optionalDependencies": [
				"@openui5/sap.ui.lib2"
			]
		};

		const Openui5Resolver = require("../../../lib/ui5Framework/Openui5Resolver");
		const openui5GetLibraryMetadataStub = sinon.stub(Openui5Resolver.prototype, "getLibraryMetadata");
		openui5GetLibraryMetadataStub.resolves(openui5LibraryMetadata);

		const loadDistMetadataStub = sinon.stub(resolver, "loadDistMetadata");
		loadDistMetadataStub.resolves({
			libraries: {
				"sap.ui.lib1": {
					"npmPackageName": "@openui5/sap.ui.lib1",
					"version": "1.77.4",
					"dependencies": [],
					"optionalDependencies": []
				}
			}
		});

		const metadata = await resolver.getLibraryMetadata("sap.ui.lib1");
		t.deepEqual(metadata, expectedMetadata, "Metadata should be equal to expected OpenUI5 metadata");

		t.is(openui5GetLibraryMetadataStub.callCount, 1, "Openui5Resolver#getLibraryMetadata should be called once");
		t.deepEqual(openui5GetLibraryMetadataStub.getCall(0).args, ["sap.ui.lib1"],
			"Openui5Resolver#getLibraryMetadata should be called with library name");
		t.is(openui5GetLibraryMetadataStub.getCall(0).thisValue._version, "1.77.4",
			"Openui5Resolver should be created with @openui5 library version");
	});
