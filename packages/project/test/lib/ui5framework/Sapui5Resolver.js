const test = require("ava");
const sinon = require("sinon");
const path = require("path");

const Sapui5Resolver = require("../../../lib/ui5Framework/Sapui5Resolver");

test.serial("Sapui5Resolver: loadDistMetadata loads metadata once from @sapui5/distribution-metadata package", async (t) => {
	const resolver = new Sapui5Resolver({
		cwd: "/test-project/",
		version: "1.75.0"
	});

	const getTargetDirForPackage = sinon.stub(resolver._installer, "_getTargetDirForPackage");
	getTargetDirForPackage.callsFake(({pkgName, version}) => {
		throw new Error(`_getTargetDirForPackage stub called with unknown arguments pkgName: ${pkgName}, version: ${version}}`);
	});
	getTargetDirForPackage.withArgs({
		pkgName: "@sapui5/distribution-metadata",
		version: "1.75.0"
	}).returns(path.join("/path", "to", "distribution-metadata", "1.75.0"));
	const installPackage = sinon.stub(resolver._installer, "installPackage");
	installPackage.withArgs({
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
	sinon.stub(resolver._installer, "readJson")
		.callThrough()
		.withArgs(path.join("/path", "to", "distribution-metadata", "1.75.0", "metadata.json"))
		.resolves(expectedMetadata);

	let distMetadata = await resolver.loadDistMetadata();
	t.is(installPackage.callCount, 1, "Distribution metadata package should be installed once");
	t.deepEqual(distMetadata, expectedMetadata,
		"loadDistMetadata should resolve with expected metadata");

	// Calling loadDistMetadata again should not load package again
	distMetadata = await resolver.loadDistMetadata();

	t.is(installPackage.callCount, 1, "Distribution metadata package should still be installed once");
	t.deepEqual(distMetadata, expectedMetadata,
		"Metadata should still be the expected metadata after calling loadDistMetadata again");
});

test("Sapui5Resolver: handleLibrary", async (t) => {
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

	const installPackage = sinon.stub(resolver._installer, "installPackage");
	installPackage
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
