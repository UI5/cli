const test = require("ava");
const sinon = require("sinon");
const path = require("path");

const AbstractResolver = require("../../../lib/ui5Framework/AbstractResolver");

class MyResolver extends AbstractResolver {
	static async fetchAllVersions() {}
}

test.afterEach.always(() => {
	sinon.restore();
});

test("AbstractResolver: abstract constructor should throw", async (t) => {
	await t.throwsAsync(async () => {
		new AbstractResolver({
			cwd: "/test-project/",
			version: "1.75.0"
		});
	}, `Class 'AbstractResolver' is abstract`);
});

test("AbstractResolver: constructor", (t) => {
	const resolver = new MyResolver({
		cwd: "/test-project/",
		version: "1.75.0"
	});
	t.true(resolver instanceof MyResolver, "Constructor returns instance of sub-class");
	t.true(resolver instanceof AbstractResolver, "Constructor returns instance of abstract class");
});

test("AbstractResolver: constructor requires 'version'", (t) => {
	t.throws(() => {
		new MyResolver({});
	}, `AbstractResolver: Missing parameter "version"`);
});

test("AbstractResolver: Set absolute 'cwd'", (t) => {
	const resolver = new MyResolver({
		version: "1.75.0",
		cwd: "/my-cwd"
	});
	t.is(resolver._cwd, path.resolve("/my-cwd"), "Should be resolved 'cwd'");
});

test("AbstractResolver: Set relative 'cwd'", (t) => {
	const resolver = new MyResolver({
		version: "1.75.0",
		cwd: "./my-cwd"
	});
	t.is(resolver._cwd, path.resolve("./my-cwd"), "Should be resolved 'cwd'");
});

test("AbstractResolver: Defaults 'cwd' to process.cwd()", (t) => {
	const resolver = new MyResolver({
		version: "1.75.0",
		ui5HomeDir: "/ui5home"
	});
	t.is(resolver._cwd, process.cwd(), "Should default to process.cwd()");
});

test("AbstractResolver: Set absolute 'ui5HomeDir'", (t) => {
	const resolver = new MyResolver({
		version: "1.75.0",
		ui5HomeDir: "/my-ui5HomeDir"
	});
	t.is(resolver._ui5HomeDir, path.resolve("/my-ui5HomeDir"), "Should be resolved 'ui5HomeDir'");
});

test("AbstractResolver: Set relative 'ui5HomeDir'", (t) => {
	const resolver = new MyResolver({
		version: "1.75.0",
		ui5HomeDir: "./my-ui5HomeDir"
	});
	t.is(resolver._ui5HomeDir, path.resolve("./my-ui5HomeDir"), "Should be resolved 'ui5HomeDir'");
});

test("AbstractResolver: Defaults 'ui5HomeDir' to ~/.ui5", (t) => {
	const resolver = new MyResolver({
		version: "1.75.0",
		cwd: "/test-project/"
	});
	t.is(resolver._ui5HomeDir, path.join(require("os").homedir(), ".ui5"), "Should default to ~/.ui5");
});

test("AbstractResolver: getLibraryMetadata should throw an Error when not implemented", async (t) => {
	await t.throwsAsync(async () => {
		const resolver = new MyResolver({
			cwd: "/test-project/",
			version: "1.75.0"
		});
		await resolver.getLibraryMetadata();
	}, `AbstractResolver: getLibraryMetadata must be implemented!`);
});

test("AbstractResolver: handleLibrary should throw an Error when not implemented", async (t) => {
	await t.throwsAsync(async () => {
		const resolver = new MyResolver({
			cwd: "/test-project/",
			version: "1.75.0"
		});
		await resolver.handleLibrary();
	}, `AbstractResolver: handleLibrary must be implemented!`);
});

test("AbstractResolver: install", async (t) => {
	const resolver = new MyResolver({
		cwd: "/test-project/",
		version: "1.75.0"
	});

	const metadata = {
		libraries: {
			"sap.ui.lib1": {
				"npmPackageName": "@openui5/sap.ui.lib1",
				"version": "1.75.0",
				"dependencies": [],
				"optionalDependencies": []
			},
			"sap.ui.lib2": {
				"npmPackageName": "@openui5/sap.ui.lib2",
				"version": "1.75.0",
				"dependencies": [
					"sap.ui.lib3"
				],
				"optionalDependencies": []
			},
			"sap.ui.lib3": {
				"npmPackageName": "@openui5/sap.ui.lib3",
				"version": "1.75.0",
				"dependencies": [],
				"optionalDependencies": [
					"sap.ui.lib4"
				]
			},
			"sap.ui.lib4": {
				"npmPackageName": "@openui5/sap.ui.lib4",
				"version": "1.75.0",
				"dependencies": [
					"sap.ui.lib1"
				],
				"optionalDependencies": []
			}
		}
	};

	const handleLibraryStub = sinon.stub(resolver, "handleLibrary");
	handleLibraryStub
		.callsFake(async (libraryName) => {
			throw new Error(`Unknown handleLibrary call: ${libraryName}`);
		})
		.withArgs("sap.ui.lib1").resolves({
			metadata: Promise.resolve(metadata.libraries["sap.ui.lib1"]),
			install: Promise.resolve({pkgPath: "/foo/sap.ui.lib1"})
		})
		.withArgs("sap.ui.lib2").resolves({
			metadata: Promise.resolve(metadata.libraries["sap.ui.lib2"]),
			install: Promise.resolve({pkgPath: "/foo/sap.ui.lib2"})
		})
		.withArgs("sap.ui.lib3").resolves({
			metadata: Promise.resolve(metadata.libraries["sap.ui.lib3"]),
			install: Promise.resolve({pkgPath: "/foo/sap.ui.lib3"})
		})
		.withArgs("sap.ui.lib4").resolves({
			metadata: Promise.resolve(metadata.libraries["sap.ui.lib4"]),
			install: Promise.resolve({pkgPath: "/foo/sap.ui.lib4"})
		});

	await resolver.install(["sap.ui.lib1", "sap.ui.lib2", "sap.ui.lib4"]);

	t.is(handleLibraryStub.callCount, 4, "Each library should be handled once");
});

test("AbstractResolver: install error handling (rejection of metadata/install)", async (t) => {
	const resolver = new MyResolver({
		cwd: "/test-project/",
		version: "1.75.0"
	});

	const handleLibraryStub = sinon.stub(resolver, "handleLibrary");
	handleLibraryStub
		.callsFake(async (libraryName) => {
			throw new Error(`Unknown handleLibrary call: ${libraryName}`);
		})
		.withArgs("sap.ui.lib1").resolves({
			metadata: Promise.reject(new Error("Error loading metadata for sap.ui.lib1")),
			install: Promise.reject(new Error("Error installing sap.ui.lib1"))
		})
		.withArgs("sap.ui.lib2").resolves({
			metadata: Promise.reject(new Error("Error loading metadata for sap.ui.lib2")),
			install: Promise.reject(new Error("Error installing sap.ui.lib2"))
		});

	await t.throwsAsync(async () => {
		await resolver.install(["sap.ui.lib1", "sap.ui.lib2"]);
	}, `Resolution of framework libraries failed with errors:
Failed to resolve library sap.ui.lib1: Error installing sap.ui.lib1
Failed to resolve library sap.ui.lib2: Error installing sap.ui.lib2`);

	t.is(handleLibraryStub.callCount, 2, "Each library should be handled once");
});

test("AbstractResolver: install error handling (rejection of dependency metadata/install)", async (t) => {
	const resolver = new MyResolver({
		cwd: "/test-project/",
		version: "1.75.0"
	});

	const handleLibraryStub = sinon.stub(resolver, "handleLibrary");
	handleLibraryStub
		.callsFake(async (libraryName) => {
			throw new Error(`Unknown handleLibrary call: ${libraryName}`);
		})
		.withArgs("sap.ui.lib1").resolves({
			metadata: Promise.resolve({
				dependencies: ["sap.ui.lib2"]
			}),
			install: Promise.resolve({pkgPath: "/foo/sap.ui.lib1"})
		})
		.withArgs("sap.ui.lib2").resolves({
			metadata: Promise.reject(new Error("Error loading metadata for sap.ui.lib2")),
			install: Promise.reject(new Error("Error installing sap.ui.lib2"))
		});

	await t.throwsAsync(async () => {
		await resolver.install(["sap.ui.lib1"]);
	}, `Resolution of framework libraries failed with errors:
Failed to resolve library sap.ui.lib2: Error installing sap.ui.lib2`);

	t.is(handleLibraryStub.callCount, 2, "Each library should be handled once");
});

test("AbstractResolver: install error handling (rejection of dependency install)", async (t) => {
	const resolver = new MyResolver({
		cwd: "/test-project/",
		version: "1.75.0"
	});

	const handleLibraryStub = sinon.stub(resolver, "handleLibrary");
	handleLibraryStub
		.callsFake(async (libraryName) => {
			throw new Error(`Unknown handleLibrary call: ${libraryName}`);
		})
		.withArgs("sap.ui.lib1").resolves({
			metadata: Promise.resolve({
				dependencies: ["sap.ui.lib2"]
			}),
			install: Promise.resolve({pkgPath: "/foo/sap.ui.lib1"})
		})
		.withArgs("sap.ui.lib2").callsFake(() => {
			return {
				metadata: Promise.resolve({
					dependencies: ["sap.ui.lib3"]
				}),
				install: Promise.resolve({pkgPath: "/foo/sap.ui.lib1"})
			};
		})
		.withArgs("sap.ui.lib3").callsFake(() => {
			return {
				metadata: Promise.resolve({
					dependencies: []
				}),
				install: Promise.reject(new Error("Error installing sap.ui.lib3"))
			};
		});

	await t.throwsAsync(async () => {
		await resolver.install(["sap.ui.lib1"]);
	}, `Resolution of framework libraries failed with errors:
Failed to resolve library sap.ui.lib3: Error installing sap.ui.lib3`);

	t.is(handleLibraryStub.callCount, 3, "Each library should be handled once");
});

test("AbstractResolver: install error handling (handleLibrary throws error)", async (t) => {
	const resolver = new MyResolver({
		cwd: "/test-project/",
		version: "1.75.0"
	});

	const handleLibraryStub = sinon.stub(resolver, "handleLibrary");
	handleLibraryStub
		.callsFake(async (libraryName) => {
			throw new Error(`Error within handleLibrary: ${libraryName}`);
		});

	await t.throwsAsync(async () => {
		await resolver.install(["sap.ui.lib1", "sap.ui.lib2"]);
	}, `Resolution of framework libraries failed with errors:
Failed to resolve library sap.ui.lib1: Error within handleLibrary: sap.ui.lib1
Failed to resolve library sap.ui.lib2: Error within handleLibrary: sap.ui.lib2`);

	t.is(handleLibraryStub.callCount, 2, "Each library should be handled once");
});

test("AbstractResolver: static fetchAllVersions should throw an Error when not implemented", async (t) => {
	await t.throwsAsync(async () => {
		await AbstractResolver.fetchAllVersions();
	}, `AbstractResolver: static fetchAllVersions must be implemented!`);
});

test.serial("AbstractResolver: Static resolveVersion resolves 'latest'", async (t) => {
	const fetchAllVersionsStub = sinon.stub(MyResolver, "fetchAllVersions")
		.returns(["1.75.0", "1.75.1", "1.76.0"]);

	const version = await MyResolver.resolveVersion("latest", {
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	});

	t.is(version, "1.76.0", "Resolved version should be correct");

	t.is(fetchAllVersionsStub.callCount, 1, "fetchAllVersions should be called once");
	t.deepEqual(fetchAllVersionsStub.getCall(0).args, [{
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	}], "fetchAllVersions should be called with expected arguments");
});

test.serial("AbstractResolver: Static resolveVersion resolves 'MAJOR.MINOR'", async (t) => {
	const fetchAllVersionsStub = sinon.stub(MyResolver, "fetchAllVersions")
		.returns(["1.75.0", "1.75.1", "1.76.0"]);

	const version = await MyResolver.resolveVersion("1.75", {
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	});

	t.is(version, "1.75.1", "Resolved version should be correct");

	t.is(fetchAllVersionsStub.callCount, 1, "fetchAllVersions should be called once");
	t.deepEqual(fetchAllVersionsStub.getCall(0).args, [{
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	}], "fetchAllVersions should be called with expected arguments");
});

test.serial("AbstractResolver: Static resolveVersion resolves 'MAJOR.MINOR.PATCH'", async (t) => {
	const fetchAllVersionsStub = sinon.stub(MyResolver, "fetchAllVersions")
		.returns(["1.75.0", "1.75.1", "1.76.0"]);

	const version = await MyResolver.resolveVersion("1.75.0", {
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	});

	t.is(version, "1.75.0", "Resolved version should be correct");

	t.is(fetchAllVersionsStub.callCount, 1, "fetchAllVersions should be called once");
	t.deepEqual(fetchAllVersionsStub.getCall(0).args, [{
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	}], "fetchAllVersions should be called with expected arguments");
});

test.serial("AbstractResolver: Static resolveVersion without options", async (t) => {
	const fetchAllVersionsStub = sinon.stub(MyResolver, "fetchAllVersions")
		.returns(["1.75.0"]);

	await MyResolver.resolveVersion("1.75.0");

	t.is(fetchAllVersionsStub.callCount, 1, "fetchAllVersions should be called once");
	t.deepEqual(fetchAllVersionsStub.getCall(0).args, [{
		cwd: undefined,
		ui5HomeDir: undefined
	}], "fetchAllVersions should be called with expected arguments");
});

test.serial("AbstractResolver: Static resolveVersion throws error for 'lts'", async (t) => {
	const fetchAllVersionsStub = sinon.stub(MyResolver, "fetchAllVersions");

	const error = await t.throwsAsync(MyResolver.resolveVersion("lts", {
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	}));

	t.is(error.message, `Framework version specifier "lts" is incorrect or not supported`);

	t.is(fetchAllVersionsStub.callCount, 0, "fetchAllVersions should not be called");
});

test.serial("AbstractResolver: Static resolveVersion throws error for '1'", async (t) => {
	const fetchAllVersionsStub = sinon.stub(MyResolver, "fetchAllVersions");

	const error = await t.throwsAsync(MyResolver.resolveVersion("1", {
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	}));

	t.is(error.message, `Framework version specifier "1" is incorrect or not supported`);

	t.is(fetchAllVersionsStub.callCount, 0, "fetchAllVersions should not be called");
});

test.serial("AbstractResolver: Static resolveVersion throws error for '1.x'", async (t) => {
	const fetchAllVersionsStub = sinon.stub(MyResolver, "fetchAllVersions");

	const error = await t.throwsAsync(MyResolver.resolveVersion("1.x", {
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	}));

	t.is(error.message, `Framework version specifier "1.x" is incorrect or not supported`);

	t.is(fetchAllVersionsStub.callCount, 0, "fetchAllVersions should not be called");
});

test.serial("AbstractResolver: Static resolveVersion throws error for '1.75.x'", async (t) => {
	const fetchAllVersionsStub = sinon.stub(MyResolver, "fetchAllVersions");

	const error = await t.throwsAsync(MyResolver.resolveVersion("1.75.x", {
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	}));

	t.is(error.message, `Framework version specifier "1.75.x" is incorrect or not supported`);

	t.is(fetchAllVersionsStub.callCount, 0, "fetchAllVersions should not be called");
});

test.serial("AbstractResolver: Static resolveVersion throws error for '^1.75.0'", async (t) => {
	const fetchAllVersionsStub = sinon.stub(MyResolver, "fetchAllVersions");

	const error = await t.throwsAsync(MyResolver.resolveVersion("^1.75.0", {
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	}));

	t.is(error.message, `Framework version specifier "^1.75.0" is incorrect or not supported`);

	t.is(fetchAllVersionsStub.callCount, 0, "fetchAllVersions should not be called");
});

test.serial("AbstractResolver: Static resolveVersion throws error for '~1.75.0'", async (t) => {
	const fetchAllVersionsStub = sinon.stub(MyResolver, "fetchAllVersions");

	const error = await t.throwsAsync(MyResolver.resolveVersion("~1.75.0", {
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	}));

	t.is(error.message, `Framework version specifier "~1.75.0" is incorrect or not supported`);

	t.is(fetchAllVersionsStub.callCount, 0, "fetchAllVersions should not be called");
});

test.serial("AbstractResolver: Static resolveVersion throws error for version not found", async (t) => {
	sinon.stub(MyResolver, "fetchAllVersions")
		.returns(["1.75.0", "1.75.1", "1.76.0"]);

	const error = await t.throwsAsync(MyResolver.resolveVersion("1.74.0", {
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	}));

	t.is(error.message, `Could not resolve framework version 1.74.0`);
});

test.serial(
	"AbstractResolver: Static resolveVersion throws error for version lower than lowest OpenUI5 version", async (t) => {
		class Openui5Resolver extends AbstractResolver {
			static async fetchAllVersions() {}
		}

		sinon.stub(Openui5Resolver, "fetchAllVersions")
			.returns(["1.75.0", "1.75.1", "1.76.0"]);

		const error = await t.throwsAsync(Openui5Resolver.resolveVersion("1.50.0", {
			cwd: "/cwd",
			ui5HomeDir: "/ui5HomeDir"
		}));

		t.is(error.message,
			`Could not resolve framework version 1.50.0. Note that OpenUI5 framework libraries can only be ` +
			`consumed by the UI5 Tooling starting with OpenUI5 v1.52.5`);
	});

test.serial(
	"AbstractResolver: Static resolveVersion throws error for version lower than lowest SAPUI5 version", async (t) => {
		class Sapui5Resolver extends AbstractResolver {
			static async fetchAllVersions() {}
		}

		sinon.stub(Sapui5Resolver, "fetchAllVersions")
			.returns(["1.76.0", "1.76.1", "1.90.0"]);

		const error = await t.throwsAsync(Sapui5Resolver.resolveVersion("1.75.0", {
			cwd: "/cwd",
			ui5HomeDir: "/ui5HomeDir"
		}));

		t.is(error.message,
			`Could not resolve framework version 1.75.0. Note that SAPUI5 framework libraries can only be ` +
			`consumed by the UI5 Tooling starting with SAPUI5 v1.76.0`);
	});
