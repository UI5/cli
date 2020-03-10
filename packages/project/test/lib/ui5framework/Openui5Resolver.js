const test = require("ava");
const sinon = require("sinon");

const Openui5Resolver = require("../../../lib/ui5Framework/Openui5Resolver");

test("Openui5Resolver: _getNpmPackageName", (t) => {
	t.is(Openui5Resolver._getNpmPackageName("foo"), "@openui5/foo");
});

test("Openui5Resolver: _getLibaryName", (t) => {
	t.is(Openui5Resolver._getLibaryName("@openui5/foo"), "foo");
	t.is(Openui5Resolver._getLibaryName("@something/else"), "@something/else");
});

test("Openui5Resolver: _getLibraryMetadata", async (t) => {
	const resolver = new Openui5Resolver({
		cwd: "/test-project/",
		version: "1.75.0"
	});

	const fetchPackageManifest = sinon.stub(resolver._installer, "fetchPackageManifest");
	fetchPackageManifest
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
		const pLibraryMetadata = resolver._getLibraryMetadata(libraryName);
		const pLibraryMetadata2 = resolver._getLibraryMetadata(libraryName);

		const libraryMetadata = await pLibraryMetadata;
		t.deepEqual(libraryMetadata, expectedMetadata,
			libraryName + ": First call should resolve with expected metadata");
		const libraryMetadata2 = await pLibraryMetadata2;
		t.deepEqual(libraryMetadata2, expectedMetadata,
			libraryName + ": Second call should also resolve with expected metadata");

		const libraryMetadata3 = await resolver._getLibraryMetadata(libraryName);

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

	t.is(fetchPackageManifest.callCount, 2, "fetchPackageManifest should be called twice");
});

test("Openui5Resolver: handleLibrary", async (t) => {
	const resolver = new Openui5Resolver({
		cwd: "/test-project/",
		version: "1.75.0"
	});

	const getLibraryMetadataStub = sinon.stub(resolver, "_getLibraryMetadata");
	getLibraryMetadataStub
		.callsFake(async (libraryName) => {
			throw new Error("_getLibraryMetadata stub called with unknown libraryName: " + libraryName);
		})
		.withArgs("sap.ui.lib1").resolves({
			"id": "@openui5/sap.ui.lib1",
			"version": "1.75.0",
			"dependencies": [],
			"optionalDependencies": []
		});

	const _installPackage = sinon.stub(resolver._installer, "installPackage");
	_installPackage
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
