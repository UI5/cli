const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");
const path = require("path");
const os = require("os");

let Openui5Resolver;

test.beforeEach((t) => {
	t.context.InstallerStub = sinon.stub();
	t.context.fetchPackageManifestStub = sinon.stub();
	t.context.fetchPackageVersionsStub = sinon.stub();
	t.context.installPackageStub = sinon.stub();
	t.context.InstallerStub.callsFake(() => {
		return {
			fetchPackageManifest: t.context.fetchPackageManifestStub,
			fetchPackageVersions: t.context.fetchPackageVersionsStub,
			installPackage: t.context.installPackageStub
		};
	});

	mock("../../../lib/ui5Framework/npm/Installer", t.context.InstallerStub);

	Openui5Resolver = mock.reRequire("../../../lib/ui5Framework/Openui5Resolver");
});

test.afterEach.always(() => {
	sinon.restore();
	mock.stopAll();
});

test.serial("Openui5Resolver: _getNpmPackageName", (t) => {
	t.is(Openui5Resolver._getNpmPackageName("foo"), "@openui5/foo");
});

test.serial("Openui5Resolver: _getLibaryName", (t) => {
	t.is(Openui5Resolver._getLibaryName("@openui5/foo"), "foo");
	t.is(Openui5Resolver._getLibaryName("@something/else"), "@something/else");
});

test.serial("Openui5Resolver: getLibraryMetadata", async (t) => {
	const resolver = new Openui5Resolver({
		cwd: "/test-project/",
		version: "1.75.0"
	});

	t.context.fetchPackageManifestStub
		.callsFake(async ({pkgName}) => {
			throw new Error(`Unknown install call: ${pkgName}`);
		})
		.withArgs({pkgName: "@openui5/sap.ui.lib1", version: "1.75.0"}).resolves({})
		.withArgs({pkgName: "@openui5/sap.ui.lib2", version: "1.75.0"}).resolves({
			dependencies: {
				"sap.ui.lib3": "1.2.3"
			},
			devDependencies: {
				"sap.ui.lib4": "4.5.6"
			}
		});

	async function assert(libraryName, expectedMetadata) {
		const pLibraryMetadata = resolver.getLibraryMetadata(libraryName);
		const pLibraryMetadata2 = resolver.getLibraryMetadata(libraryName);

		const libraryMetadata = await pLibraryMetadata;
		t.deepEqual(libraryMetadata, expectedMetadata,
			libraryName + ": First call should resolve with expected metadata");
		const libraryMetadata2 = await pLibraryMetadata2;
		t.deepEqual(libraryMetadata2, expectedMetadata,
			libraryName + ": Second call should also resolve with expected metadata");

		const libraryMetadata3 = await resolver.getLibraryMetadata(libraryName);

		t.deepEqual(libraryMetadata3, expectedMetadata,
			libraryName + ": Third call should still return the same metadata");
	}

	await assert("sap.ui.lib1", {
		id: "@openui5/sap.ui.lib1",
		version: "1.75.0",
		dependencies: [],
		optionalDependencies: []
	});

	await assert("sap.ui.lib2", {
		id: "@openui5/sap.ui.lib2",
		version: "1.75.0",
		dependencies: [
			"sap.ui.lib3"
		],
		optionalDependencies: [
			"sap.ui.lib4"
		]
	});

	t.is(t.context.fetchPackageManifestStub.callCount, 2, "fetchPackageManifest should be called twice");
});

test.serial("Openui5Resolver: handleLibrary", async (t) => {
	const resolver = new Openui5Resolver({
		cwd: "/test-project/",
		version: "1.75.0"
	});

	const getLibraryMetadataStub = sinon.stub(resolver, "getLibraryMetadata");
	getLibraryMetadataStub
		.callsFake(async (libraryName) => {
			throw new Error("getLibraryMetadata stub called with unknown libraryName: " + libraryName);
		})
		.withArgs("sap.ui.lib1").resolves({
			"id": "@openui5/sap.ui.lib1",
			"version": "1.75.0",
			"dependencies": [],
			"optionalDependencies": []
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
});

test.serial("Openui5Resolver: Static fetchAllVersions", async (t) => {
	const expectedVersions = ["1.75.0", "1.75.1", "1.76.0"];
	const options = {
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	};

	t.context.fetchPackageVersionsStub.returns(expectedVersions);

	const versions = await Openui5Resolver.fetchAllVersions(options);

	t.deepEqual(versions, expectedVersions, "Fetched versions should be correct");

	t.is(t.context.fetchPackageVersionsStub.callCount, 1, "fetchPackageVersions should be called once");
	t.deepEqual(t.context.fetchPackageVersionsStub.getCall(0).args, [{pkgName: "@openui5/sap.ui.core"}],
		"fetchPackageVersions should be called with expected arguments");

	t.is(t.context.InstallerStub.callCount, 1, "Installer should be called once");
	t.true(t.context.InstallerStub.calledWithNew(), "Installer should be called with new");
	t.deepEqual(t.context.InstallerStub.getCall(0).args, [{
		cwd: path.resolve("/cwd"),
		ui5HomeDir: path.resolve("/ui5HomeDir")
	}], "Installer should be called with expected arguments");
});

test.serial("Openui5Resolver: Static fetchAllVersions without options", async (t) => {
	const expectedVersions = ["1.75.0", "1.75.1", "1.76.0"];

	t.context.fetchPackageVersionsStub.returns(expectedVersions);

	const versions = await Openui5Resolver.fetchAllVersions();

	t.deepEqual(versions, expectedVersions, "Fetched versions should be correct");

	t.is(t.context.fetchPackageVersionsStub.callCount, 1, "fetchPackageVersions should be called once");
	t.deepEqual(t.context.fetchPackageVersionsStub.getCall(0).args, [{pkgName: "@openui5/sap.ui.core"}],
		"fetchPackageVersions should be called with expected arguments");

	t.is(t.context.InstallerStub.callCount, 1, "Installer should be called once");
	t.true(t.context.InstallerStub.calledWithNew(), "Installer should be called with new");
	t.deepEqual(t.context.InstallerStub.getCall(0).args, [{
		cwd: process.cwd(),
		ui5HomeDir: path.join(os.homedir(), ".ui5")
	}], "Installer should be called with expected arguments");
});
