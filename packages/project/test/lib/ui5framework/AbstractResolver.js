import test from "ava";
import sinon from "sinon";
import path from "node:path";
import os from "node:os";
import {fileURLToPath} from "node:url";
import {readFile} from "node:fs/promises";
import esmock from "esmock";

test.beforeEach(async (t) => {
	t.context.osHomeDirStub = sinon.stub().callsFake(() => os.homedir());
	t.context.AbstractResolver = await esmock.p("../../../lib/ui5Framework/AbstractResolver.js", {
		"node:os": {
			homedir: t.context.osHomeDirStub
		}
	});

	class MyResolver extends t.context.AbstractResolver {
		static async fetchAllVersions() {}
	}

	t.context.MyResolver = MyResolver;
});

test.afterEach.always((t) => {
	delete process.env.UI5_PROJECT_USE_FRAMEWORK_SOURCES;
	esmock.purge(t.context.AbstractResolver);
	sinon.restore();
});

test("AbstractResolver: abstract constructor should throw", async (t) => {
	const {AbstractResolver} = t.context;
	await t.throwsAsync(async () => {
		new AbstractResolver({
			cwd: "/test-project/",
			version: "1.75.0"
		});
	}, {message: `Class 'AbstractResolver' is abstract`});
});

test("AbstractResolver: constructor", (t) => {
	const {MyResolver, AbstractResolver} = t.context;
	const providedLibraryMetadata = {"test": "data"};
	const resolver = new MyResolver({
		cwd: "/test-project/",
		version: "1.75.0",
		providedLibraryMetadata,
		sources: true
	});
	t.true(resolver instanceof MyResolver, "Constructor returns instance of sub-class");
	t.true(resolver instanceof AbstractResolver, "Constructor returns instance of abstract class");
	t.is(resolver._version, "1.75.0");
	t.true(resolver._sources, "Correct value for 'sources' flag");
});

test("AbstractResolver: constructor overwrites sources with env variable", (t) => {
	const {MyResolver, AbstractResolver} = t.context;

	process.env.UI5_PROJECT_USE_FRAMEWORK_SOURCES = true;
	const resolver = new MyResolver({
		cwd: "/test-project/",
		version: "1.75.0",
		sources: false // Environment variable overrules parameter
	});
	t.true(resolver instanceof MyResolver, "Constructor returns instance of sub-class");
	t.true(resolver instanceof AbstractResolver, "Constructor returns instance of abstract class");
	t.is(resolver._version, "1.75.0");
	t.true(resolver._sources, "Correct value for 'sources' flag");
});

test("AbstractResolver: constructor without version", (t) => {
	const {MyResolver} = t.context;
	const resolver = new MyResolver({
		cwd: "/test-project/"
	});
	t.is(resolver._version, undefined);
});

test("AbstractResolver: Set absolute 'cwd'", (t) => {
	const {MyResolver} = t.context;
	const resolver = new MyResolver({
		version: "1.75.0",
		cwd: "/my-cwd"
	});
	t.is(resolver._cwd, path.resolve("/my-cwd"), "Should be resolved 'cwd'");
});

test("AbstractResolver: Set relative 'cwd'", (t) => {
	const {MyResolver} = t.context;
	const resolver = new MyResolver({
		version: "1.75.0",
		cwd: "./my-cwd"
	});
	t.is(resolver._cwd, path.resolve("./my-cwd"), "Should be resolved 'cwd'");
});

test("AbstractResolver: Defaults 'cwd' to process.cwd()", (t) => {
	const {MyResolver} = t.context;
	const resolver = new MyResolver({
		version: "1.75.0",
		ui5HomeDir: "/ui5home"
	});
	t.is(resolver._cwd, process.cwd(), "Should default to process.cwd()");
});

test("AbstractResolver: Set absolute 'ui5HomeDir'", (t) => {
	const {MyResolver} = t.context;
	const resolver = new MyResolver({
		version: "1.75.0",
		ui5HomeDir: "/my-ui5HomeDir"
	});
	t.is(resolver._ui5HomeDir, path.resolve("/my-ui5HomeDir"), "Should be resolved 'ui5HomeDir'");
});

test("AbstractResolver: Set relative 'ui5HomeDir'", (t) => {
	const {MyResolver} = t.context;
	const resolver = new MyResolver({
		version: "1.75.0",
		ui5HomeDir: "./my-ui5HomeDir"
	});
	t.is(resolver._ui5HomeDir, path.resolve("./my-ui5HomeDir"), "Should be resolved 'ui5HomeDir'");
});

test("AbstractResolver: 'ui5HomeDir' overriden os.homedir()", (t) => {
	const {MyResolver, osHomeDirStub} = t.context;

	osHomeDirStub.returns("./");

	const resolver = new MyResolver({
		version: "1.75.0"
	});
	t.is(resolver._ui5HomeDir, path.resolve("./.ui5"), "Should be resolved 'ui5HomeDir'");
});

test("AbstractResolver: Defaults 'ui5HomeDir' to ~/.ui5", (t) => {
	const {MyResolver} = t.context;
	const resolver = new MyResolver({
		version: "1.75.0",
		cwd: "/test-project/"
	});
	t.is(resolver._ui5HomeDir, path.join(os.homedir(), ".ui5"), "Should default to ~/.ui5");
});

test("AbstractResolver: getLibraryMetadata should throw an Error when not implemented", async (t) => {
	const {MyResolver} = t.context;
	await t.throwsAsync(async () => {
		const resolver = new MyResolver({
			cwd: "/test-project/",
			version: "1.75.0"
		});
		await resolver.getLibraryMetadata();
	}, {message: `AbstractResolver: getLibraryMetadata must be implemented!`});
});

test("AbstractResolver: handleLibrary should throw an Error when not implemented", async (t) => {
	const {MyResolver} = t.context;
	await t.throwsAsync(async () => {
		const resolver = new MyResolver({
			cwd: "/test-project/",
			version: "1.75.0"
		});
		await resolver.handleLibrary();
	}, {message: `AbstractResolver: handleLibrary must be implemented!`});
});

test("AbstractResolver: install", async (t) => {
	const {MyResolver} = t.context;
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

	const result = await resolver.install(["sap.ui.lib1", "sap.ui.lib2", "sap.ui.lib4"]);

	t.is(handleLibraryStub.callCount, 4, "Each library should be handled once");
	t.deepEqual(result, {
		libraryMetadata: {
			"sap.ui.lib1": {
				dependencies: [],
				npmPackageName: "@openui5/sap.ui.lib1",
				optionalDependencies: [],
				path: "/foo/sap.ui.lib1",
				version: "1.75.0",
			},
			"sap.ui.lib2": {
				dependencies: [
					"sap.ui.lib3",
				],
				npmPackageName: "@openui5/sap.ui.lib2",
				optionalDependencies: [],
				path: "/foo/sap.ui.lib2",
				version: "1.75.0",
			},
			"sap.ui.lib3": {
				dependencies: [],
				npmPackageName: "@openui5/sap.ui.lib3",
				optionalDependencies: [
					"sap.ui.lib4",
				],
				path: "/foo/sap.ui.lib3",
				version: "1.75.0",
			},
			"sap.ui.lib4": {
				dependencies: [
					"sap.ui.lib1",
				],
				npmPackageName: "@openui5/sap.ui.lib4",
				optionalDependencies: [],
				path: "/foo/sap.ui.lib4",
				version: "1.75.0",
			},
		}
	});
});

test("AbstractResolver: install (with providedLibraryMetadata)", async (t) => {
	const {MyResolver} = t.context;
	const resolver = new MyResolver({
		cwd: "/test-project/",
		version: "1.75.0",
		providedLibraryMetadata: {
			"sap.ui.lib1": {
				"npmPackageName": "@openui5/sap.ui.lib1",
				"version": "1.75.0-workspace",
				"dependencies": [
					"sap.ui.lib3"
				],
				"optionalDependencies": [],
				"path": "/workspace/sap.ui.lib1"
			},
			"sap.ui.lib4": {
				"npmPackageName": "@openui5/sap.ui.lib4",
				"version": "1.75.0-workspace",
				"dependencies": [
					"sap.ui.lib5"
				],
				"optionalDependencies": [],
				"path": "/workspace/sap.ui.lib4"
			},
			"sap.ui.lib5": {
				"npmPackageName": "@openui5/sap.ui.lib5",
				"version": "1.75.0-workspace",
				"dependencies": [],
				"optionalDependencies": [],
				"path": "/workspace/sap.ui.lib5"
			},
		}
	});

	const metadata = {
		libraries: {
			"sap.ui.lib2": {
				"npmPackageName": "@openui5/sap.ui.lib2",
				"version": "1.75.0",
				"dependencies": [],
				"optionalDependencies": []
			},
			"sap.ui.lib3": {
				"npmPackageName": "@openui5/sap.ui.lib3",
				"version": "1.75.0",
				"dependencies": [
					"sap.ui.lib4"
				],
				"optionalDependencies": []
			},
		}
	};

	const handleLibraryStub = sinon.stub(resolver, "handleLibrary");
	handleLibraryStub
		.callsFake(async (libraryName) => {
			throw new Error(`Unknown handleLibrary call: ${libraryName}`);
		})
		.withArgs("sap.ui.lib2").resolves({
			metadata: Promise.resolve(metadata.libraries["sap.ui.lib2"]),
			install: Promise.resolve({pkgPath: "/foo/sap.ui.lib2"})
		})
		.withArgs("sap.ui.lib3").resolves({
			metadata: Promise.resolve(metadata.libraries["sap.ui.lib3"]),
			install: Promise.resolve({pkgPath: "/foo/sap.ui.lib3"})
		});

	const result = await resolver.install(["sap.ui.lib1", "sap.ui.lib2"]);

	t.is(handleLibraryStub.callCount, 2, "Each library not part of providedLibraryMetadata should be handled once");
	t.deepEqual(result, {
		libraryMetadata: {
			"sap.ui.lib1": {
				dependencies: ["sap.ui.lib3"],
				npmPackageName: "@openui5/sap.ui.lib1",
				optionalDependencies: [],
				path: "/workspace/sap.ui.lib1",
				version: "1.75.0-workspace",
			},
			"sap.ui.lib2": {
				dependencies: [],
				npmPackageName: "@openui5/sap.ui.lib2",
				optionalDependencies: [],
				path: "/foo/sap.ui.lib2",
				version: "1.75.0",
			},
			"sap.ui.lib3": {
				dependencies: ["sap.ui.lib4",],
				npmPackageName: "@openui5/sap.ui.lib3",
				optionalDependencies: [],
				path: "/foo/sap.ui.lib3",
				version: "1.75.0",
			},
			"sap.ui.lib4": {
				dependencies: [
					"sap.ui.lib5",
				],
				npmPackageName: "@openui5/sap.ui.lib4",
				optionalDependencies: [],
				path: "/workspace/sap.ui.lib4",
				version: "1.75.0-workspace",
			},
			"sap.ui.lib5": {
				dependencies: [],
				npmPackageName: "@openui5/sap.ui.lib5",
				optionalDependencies: [],
				path: "/workspace/sap.ui.lib5",
				version: "1.75.0-workspace",
			},
		}
	});
});

test("AbstractResolver: install error handling (rejection of metadata/install)", async (t) => {
	const {MyResolver} = t.context;
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
	}, {message: `Resolution of framework libraries failed with errors:
  1. Failed to resolve library sap.ui.lib1: Error installing sap.ui.lib1
  2. Failed to resolve library sap.ui.lib2: Error installing sap.ui.lib2`});

	t.is(handleLibraryStub.callCount, 2, "Each library should be handled once");
});

test("AbstractResolver: install error handling (rejection of dependency metadata/install)", async (t) => {
	const {MyResolver} = t.context;
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
	}, {message: `Failed to resolve library sap.ui.lib2: Error installing sap.ui.lib2`});

	t.is(handleLibraryStub.callCount, 2, "Each library should be handled once");
});

test("AbstractResolver: install error handling (rejection of dependency install)", async (t) => {
	const {MyResolver} = t.context;
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
	}, {message: `Failed to resolve library sap.ui.lib3: Error installing sap.ui.lib3`});

	t.is(handleLibraryStub.callCount, 3, "Each library should be handled once");
});

test("AbstractResolver: install error handling (handleLibrary throws error)", async (t) => {
	const {MyResolver} = t.context;
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
	}, {message: `Resolution of framework libraries failed with errors:
  1. Failed to resolve library sap.ui.lib1: Error within handleLibrary: sap.ui.lib1
  2. Failed to resolve library sap.ui.lib2: Error within handleLibrary: sap.ui.lib2`});

	t.is(handleLibraryStub.callCount, 2, "Each library should be handled once");
});

test("AbstractResolver: install error handling " +
"(no version, no providedLibraryMetadata)", async (t) => {
	const {MyResolver} = t.context;
	const resolver = new MyResolver({
		cwd: "/test-project/",
	});

	const handleLibraryStub = sinon.stub(resolver, "handleLibrary");

	await t.throwsAsync(resolver.install(["sap.ui.lib1", "sap.ui.lib2"]), {
		message: `Resolution of framework libraries failed with errors:
  1. Failed to resolve library sap.ui.lib1: Unable to install library sap.ui.lib1. No framework version provided.
  2. Failed to resolve library sap.ui.lib2: Unable to install library sap.ui.lib2. No framework version provided.`
	});

	t.is(handleLibraryStub.callCount, 0, "Handle library should not be called when no version is available");
});

test("AbstractResolver: install error handling " +
"(no version, one lib not part of providedLibraryMetadata)", async (t) => {
	const {MyResolver} = t.context;
	const resolver = new MyResolver({
		cwd: "/test-project/",
		providedLibraryMetadata: {
			"sap.ui.lib1": {
				"npmPackageName": "@openui5/sap.ui.lib1",
				"version": "1.75.0-SNAPSHOT",
				"dependencies": [],
				"optionalDependencies": []
			}
		}
	});

	const handleLibraryStub = sinon.stub(resolver, "handleLibrary");

	await t.throwsAsync(resolver.install(["sap.ui.lib1", "sap.ui.lib2"]), {
		message:
			"Failed to resolve library sap.ui.lib2:" +
			" Unable to install library sap.ui.lib2. No framework version provided.",
	});

	t.is(handleLibraryStub.callCount, 0, "Handle library should not be called when no version is available");
});

test("AbstractResolver: static fetchAllVersions should throw an Error when not implemented", async (t) => {
	const {AbstractResolver} = t.context;
	await t.throwsAsync(async () => {
		await AbstractResolver.fetchAllVersions();
	}, {message: `AbstractResolver: static fetchAllVersions must be implemented!`});
});

test.serial("AbstractResolver: Static resolveVersion resolves 'latest'", async (t) => {
	const {MyResolver} = t.context;
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

test.serial("AbstractResolver: Static resolveVersion resolves 'MAJOR'", async (t) => {
	const {MyResolver} = t.context;
	const fetchAllVersionsStub = sinon.stub(MyResolver, "fetchAllVersions")
		.returns(["1.75.0", "1.75.1", "1.76.0"]);

	const version = await MyResolver.resolveVersion("1", {
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

test.serial("AbstractResolver: Static resolveVersion resolves 'MAJOR-prerelease'", async (t) => {
	const {MyResolver} = t.context;
	const fetchAllVersionsStub = sinon.stub(MyResolver, "fetchAllVersions")
		.returns(["1.76.0", "1.77.0", "1.77.0-SNAPSHOT", "1.78.0", "1.79.0-SNAPSHOT"]);

	const version = await MyResolver.resolveVersion("1-SNAPSHOT", {
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	});

	t.is(version, "1.79.0-SNAPSHOT", "Resolved version should be correct");

	t.is(fetchAllVersionsStub.callCount, 1, "fetchAllVersions should be called once");
	t.deepEqual(fetchAllVersionsStub.getCall(0).args, [{
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	}], "fetchAllVersions should be called with expected arguments");
});

test.serial("AbstractResolver: Static resolveVersion resolves 'MAJOR.MINOR'", async (t) => {
	const {MyResolver} = t.context;
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

test.serial("AbstractResolver: Static resolveVersion resolves 'MAJOR.MINOR-prerelease'", async (t) => {
	const {MyResolver} = t.context;
	const fetchAllVersionsStub = sinon.stub(MyResolver, "fetchAllVersions")
		.returns(["1.76.0", "1.77.0", "1.77.0-SNAPSHOT", "1.78.0", "1.79.0-SNAPSHOT"]);

	const version = await MyResolver.resolveVersion("1.79-SNAPSHOT", {
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	});

	t.is(version, "1.79.0-SNAPSHOT", "Resolved version should be correct");

	t.is(fetchAllVersionsStub.callCount, 1, "fetchAllVersions should be called once");
	t.deepEqual(fetchAllVersionsStub.getCall(0).args, [{
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	}], "fetchAllVersions should be called with expected arguments");
});

test.serial("AbstractResolver: Static resolveVersion resolves 'MAJOR.MINOR.PATCH'", async (t) => {
	const {MyResolver} = t.context;
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

test.serial("AbstractResolver: Static resolveVersion resolves 'MAJOR.MINOR.PATCH-prerelease'", async (t) => {
	const {MyResolver} = t.context;
	const fetchAllVersionsStub = sinon.stub(MyResolver, "fetchAllVersions")
		.returns(["1.76.0", "1.77.0", "1.77.0-SNAPSHOT", "1.78.0", "1.79.0-SNAPSHOT"]);

	const version = await MyResolver.resolveVersion("1.79.0-SNAPSHOT", {
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	});

	t.is(version, "1.79.0-SNAPSHOT", "Resolved version should be correct");

	t.is(fetchAllVersionsStub.callCount, 1, "fetchAllVersions should be called once");
	t.deepEqual(fetchAllVersionsStub.getCall(0).args, [{
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	}], "fetchAllVersions should be called with expected arguments");
});

test.serial("AbstractResolver: Static resolveVersion does not include prereleases for 'latest' version", async (t) => {
	const {MyResolver} = t.context;
	const fetchAllVersionsStub = sinon.stub(MyResolver, "fetchAllVersions")
		.returns(["1.76.0", "1.77.0", "1.78.0", "1.79.0-SNAPSHOT"]);

	const version = await MyResolver.resolveVersion("latest", {
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	});

	t.is(version, "1.78.0", "Resolved version should be correct");

	t.is(fetchAllVersionsStub.callCount, 1, "fetchAllVersions should be called once");
	t.deepEqual(fetchAllVersionsStub.getCall(0).args, [{
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	}], "fetchAllVersions should be called with expected arguments");
});

test.serial("AbstractResolver: Static resolveVersion resolves 'latest-snapshot'", async (t) => {
	const {MyResolver} = t.context;
	const fetchAllVersionsStub = sinon.stub(MyResolver, "fetchAllVersions")
		.returns(["1.75.0-SNAPSHOT", "1.75.1-SNAPSHOT", "1.76.0-SNAPSHOT", "1.76.1-SNAPSHOT"]);

	const version = await MyResolver.resolveVersion("latest-snapshot", {
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	});

	t.is(version, "1.76.1-SNAPSHOT", "Resolved version should be correct");

	t.is(fetchAllVersionsStub.callCount, 1, "fetchAllVersions should be called once");
	t.deepEqual(fetchAllVersionsStub.getCall(0).args, [{
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	}], "fetchAllVersions should be called with expected arguments");
});

test.serial("AbstractResolver: Static resolveVersion resolves 'MAJOR.MINOR-SNAPSHOT'", async (t) => {
	const {MyResolver} = t.context;
	const fetchAllVersionsStub = sinon.stub(MyResolver, "fetchAllVersions")
		.returns(["1.75.0-SNAPSHOT", "1.75.1-SNAPSHOT", "1.76.0-SNAPSHOT", "1.76.1-SNAPSHOT"]);

	const version = await MyResolver.resolveVersion("1.75-SNAPSHOT", {
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	});

	t.is(version, "1.75.1-SNAPSHOT", "Resolved version should be correct");

	t.is(fetchAllVersionsStub.callCount, 1, "fetchAllVersions should be called once");
	t.deepEqual(fetchAllVersionsStub.getCall(0).args, [{
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	}], "fetchAllVersions should be called with expected arguments");
});

test.serial("AbstractResolver: Static resolveVersion resolves 'MAJOR.MINOR.PATCH-SNAPSHOT'", async (t) => {
	const {MyResolver} = t.context;
	const fetchAllVersionsStub = sinon.stub(MyResolver, "fetchAllVersions")
		.returns(["1.75.0-SNAPSHOT", "1.75.1-SNAPSHOT", "1.76.0-SNAPSHOT", "1.76.1-SNAPSHOT"]);

	const version = await MyResolver.resolveVersion("1.75.0-SNAPSHOT", {
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	});

	t.is(version, "1.75.0-SNAPSHOT", "Resolved version should be correct");

	t.is(fetchAllVersionsStub.callCount, 1, "fetchAllVersions should be called once");
	t.deepEqual(fetchAllVersionsStub.getCall(0).args, [{
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	}], "fetchAllVersions should be called with expected arguments");
});

test.serial("AbstractResolver: Static resolveVersion includes non-prereleases for 'latest-snapshot'", async (t) => {
	// Realistically this should never happen, since the Sapui5MavenSnapshotResolver would never return
	// non-snapshot versions. This test therefore simply illustrates the current behavior for this theoretic case
	const {MyResolver} = t.context;
	const fetchAllVersionsStub = sinon.stub(MyResolver, "fetchAllVersions")
		.returns(["1.76.0", "1.77.0", "1.78.0", "1.79.0-SNAPSHOT", "1.79.1"]);

	const version = await MyResolver.resolveVersion("latest-snapshot", {
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	});

	t.is(version, "1.79.1", "Resolved version should be correct");

	t.is(fetchAllVersionsStub.callCount, 1, "fetchAllVersions should be called once");
	t.deepEqual(fetchAllVersionsStub.getCall(0).args, [{
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	}], "fetchAllVersions should be called with expected arguments");
});

test.serial("AbstractResolver: Static resolveVersion without options", async (t) => {
	const {MyResolver} = t.context;
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
	const {MyResolver} = t.context;
	const fetchAllVersionsStub = sinon.stub(MyResolver, "fetchAllVersions");

	const error = await t.throwsAsync(MyResolver.resolveVersion("lts", {
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	}));

	t.is(error.message, `Framework version specifier "lts" is incorrect or not supported`);

	t.is(fetchAllVersionsStub.callCount, 0, "fetchAllVersions should not be called");
});

test.serial("AbstractResolver: Static resolveVersion throws error for '1.x'", async (t) => {
	const {MyResolver} = t.context;
	const fetchAllVersionsStub = sinon.stub(MyResolver, "fetchAllVersions");

	const error = await t.throwsAsync(MyResolver.resolveVersion("1.x", {
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	}));

	t.is(error.message, `Framework version specifier "1.x" is incorrect or not supported`);

	t.is(fetchAllVersionsStub.callCount, 0, "fetchAllVersions should not be called");
});

test.serial("AbstractResolver: Static resolveVersion throws error for '1.75.x'", async (t) => {
	const {MyResolver} = t.context;
	const fetchAllVersionsStub = sinon.stub(MyResolver, "fetchAllVersions");

	const error = await t.throwsAsync(MyResolver.resolveVersion("1.75.x", {
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	}));

	t.is(error.message, `Framework version specifier "1.75.x" is incorrect or not supported`);

	t.is(fetchAllVersionsStub.callCount, 0, "fetchAllVersions should not be called");
});

test.serial("AbstractResolver: Static resolveVersion throws error for '^1.75.0'", async (t) => {
	const {MyResolver} = t.context;
	const fetchAllVersionsStub = sinon.stub(MyResolver, "fetchAllVersions");

	const error = await t.throwsAsync(MyResolver.resolveVersion("^1.75.0", {
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	}));

	t.is(error.message, `Framework version specifier "^1.75.0" is incorrect or not supported`);

	t.is(fetchAllVersionsStub.callCount, 0, "fetchAllVersions should not be called");
});

test.serial("AbstractResolver: Static resolveVersion throws error for '~1.75.0'", async (t) => {
	const {MyResolver} = t.context;
	const fetchAllVersionsStub = sinon.stub(MyResolver, "fetchAllVersions");

	const error = await t.throwsAsync(MyResolver.resolveVersion("~1.75.0", {
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	}));

	t.is(error.message, `Framework version specifier "~1.75.0" is incorrect or not supported`);

	t.is(fetchAllVersionsStub.callCount, 0, "fetchAllVersions should not be called");
});

test.serial("AbstractResolver: Static resolveVersion throws error for version not found", async (t) => {
	const {MyResolver} = t.context;
	sinon.stub(MyResolver, "fetchAllVersions")
		.returns(["1.75.0", "1.75.1", "1.76.0"]);

	const error = await t.throwsAsync(MyResolver.resolveVersion("1.74.0", {
		cwd: "/cwd",
		ui5HomeDir: "/ui5HomeDir"
	}));

	t.is(error.message, `Could not resolve framework version 1.74.0. ` +
		`Make sure the version is valid and available in the configured registry.`);
});

test.serial(
	"AbstractResolver: Static resolveVersion throws error for version lower than lowest OpenUI5 version", async (t) => {
		const {AbstractResolver} = t.context;
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
		const {AbstractResolver} = t.context;
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

test.serial(
	"AbstractResolver: Static resolveVersion throws error when latest OpenUI5 version cannot be found", async (t) => {
		const {AbstractResolver} = t.context;
		class Openui5Resolver extends AbstractResolver {
			static async fetchAllVersions() {}
		}

		sinon.stub(Openui5Resolver, "fetchAllVersions")
			.returns([]);

		const error = await t.throwsAsync(Openui5Resolver.resolveVersion("latest", {
			cwd: "/cwd",
			ui5HomeDir: "/ui5HomeDir"
		}));

		t.is(error.message, `Could not resolve framework version latest. ` +
			`Make sure the version is valid and available in the configured registry.`);
	});

test.serial(
	"AbstractResolver: Static resolveVersion throws error when latest SAPUI5 version cannot be found", async (t) => {
		const {AbstractResolver} = t.context;
		class Sapui5Resolver extends AbstractResolver {
			static async fetchAllVersions() {}
		}

		sinon.stub(Sapui5Resolver, "fetchAllVersions")
			.returns([]);

		const error = await t.throwsAsync(Sapui5Resolver.resolveVersion("latest", {
			cwd: "/cwd",
			ui5HomeDir: "/ui5HomeDir"
		}));

		t.is(error.message, `Could not resolve framework version latest. ` +
			`Make sure the version is valid and available in the configured registry.`);
	});

test.serial(
	"AbstractResolver: Static resolveVersion throws error when OpenUI5 version range cannot be resolved", async (t) => {
		const {AbstractResolver} = t.context;
		class Openui5Resolver extends AbstractResolver {
			static async fetchAllVersions() {}
		}

		sinon.stub(Openui5Resolver, "fetchAllVersions")
			.returns([]);

		const error = await t.throwsAsync(Openui5Resolver.resolveVersion("1.99", {
			cwd: "/cwd",
			ui5HomeDir: "/ui5HomeDir"
		}));

		t.is(error.message, `Could not resolve framework version 1.99. ` +
			`Make sure the version is valid and available in the configured registry.`);
	});

test.serial(
	"AbstractResolver: Static resolveVersion throws error when SAPUI5 version range cannot be resolved", async (t) => {
		const {AbstractResolver} = t.context;
		class Sapui5Resolver extends AbstractResolver {
			static async fetchAllVersions() {}
		}

		sinon.stub(Sapui5Resolver, "fetchAllVersions")
			.returns([]);

		const error = await t.throwsAsync(Sapui5Resolver.resolveVersion("1.99", {
			cwd: "/cwd",
			ui5HomeDir: "/ui5HomeDir"
		}));

		t.is(error.message, `Could not resolve framework version 1.99. ` +
			`Make sure the version is valid and available in the configured registry.`);
	});

test.serial("AbstractResolver: SEMVER_VERSION_REGEXP should be aligned with JSON schema", async (t) => {
	const {AbstractResolver} = t.context;

	const projectSchema = JSON.parse(
		await readFile(fileURLToPath(
			new URL("../../../lib/validation/schema/specVersion/kind/project.json", import.meta.url)
		), {encoding: "utf-8"})
	);
	const schemaPattern = projectSchema.definitions.framework.properties.version.pattern;
	t.is(schemaPattern, AbstractResolver._SEMVER_VERSION_REGEXP.source);
});
