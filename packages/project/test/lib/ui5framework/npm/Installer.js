const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");
const path = require("path");
const fs = require("graceful-fs");

const lockfile = require("lockfile");

let Installer;

test.beforeEach((t) => {
	t.context.mkdirpStub = sinon.stub().resolves();
	mock("mkdirp", t.context.mkdirpStub);

	t.context.rimrafStub = sinon.stub().yieldsAsync();
	mock("rimraf", t.context.rimrafStub);

	t.context.lockStub = sinon.stub(lockfile, "lock");
	t.context.unlockStub = sinon.stub(lockfile, "unlock");
	t.context.renameStub = sinon.stub(fs, "rename").yieldsAsync();
	t.context.statStub = sinon.stub(fs, "stat").callThrough();

	// Re-require to ensure that mocked modules are used
	Installer = mock.reRequire("../../../../lib/ui5Framework/npm/Installer");
});

test.afterEach.always(() => {
	sinon.restore();
	mock.stopAll();
});

test.serial("Installer: constructor", (t) => {
	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/"
	});
	t.true(installer instanceof Installer, "Constructor returns instance of class");
	t.is(installer._packagesDir, path.join("/ui5Home/", "framework", "packages"));
	t.is(installer._lockDir, path.join("/ui5Home/", "framework", "locks"));
	t.is(installer._stagingDir, path.join("/ui5Home/", "framework", "staging"));
});

test.serial("Installer: constructor requires 'cwd'", (t) => {
	t.throws(() => {
		new Installer({});
	}, {message: `Installer: Missing parameter "cwd"`});
});

test.serial("Installer: constructor requires 'ui5HomeDir'", (t) => {
	t.throws(() => {
		new Installer({
			cwd: "/cwd/"
		});
	}, {message: `Installer: Missing parameter "ui5HomeDir"`});
});

test.serial("Installer: fetchPackageVersions", async (t) => {
	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/"
	});

	const registry = installer.getRegistry();
	const requestPackagePackumentStub = sinon.stub(registry, "requestPackagePackument")
		.resolves({
			versions: {
				"1.0.0": {},
				"2.0.0": {},
				"3.0.0": {}
			}
		});

	const packageVersions = await installer.fetchPackageVersions({pkgName: "@openui5/sap.ui.lib1"});

	t.deepEqual(packageVersions, ["1.0.0", "2.0.0", "3.0.0"], "Should resolve with expected versions");

	t.is(requestPackagePackumentStub.callCount, 1, "requestPackagePackument should be called once");
	t.deepEqual(requestPackagePackumentStub.getCall(0).args, ["@openui5/sap.ui.lib1"],
		"requestPackagePackument should be called with pkgName");
});

test.serial("Installer: _getLockPath", async (t) => {
	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/"
	});

	const lockPath = installer._getLockPath({
		pkgName: "@openui5/sap.ui.lib1",
		version: "1.2.3"
	});

	t.is(lockPath, path.join("/ui5Home/", "framework", "locks", "package-@openui5-sap.ui.lib1@1.2.3.lock"));
});

test.serial("Installer: fetchPackageManifest (without existing package.json)", async (t) => {
	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/"
	});

	const mockedManifest = {
		name: "myPackage",
		dependencies: {
			"foo": "1.2.3"
		},
		devDependencies: {
			"bar": "4.5.6"
		},
		foo: "bar"
	};

	const expectedManifest = {
		name: "myPackage",
		dependencies: {
			"foo": "1.2.3"
		},
		devDependencies: {
			"bar": "4.5.6"
		}
	};

	const registry = installer.getRegistry();
	const requestPackageManifestStub = sinon.stub(registry, "requestPackageManifest")
		.callsFake((pkgName, version) => {
			throw new Error(
				"_cachedRegistry.requestPackageManifest stub called with unknown arguments " +
				`pkgName: ${pkgName}, version: ${version}}`
			);
		})
		.withArgs("myPackage", "1.2.3").resolves(mockedManifest);

	const readJsonStub = sinon.stub(installer, "readJson")
		.callsFake((path) => {
			throw new Error(
				`readJson stub called with unknown path: ${path}`
			);
		})
		.withArgs(path.join("/path", "to", "myPackage", "1.2.3", "package.json"))
		.callsFake(async (path) => {
			const error = new Error(`ENOENT: no such file or directory, open '${path}'`);
			error.code = "ENOENT";
			throw error;
		});

	const getTargetDirForPackageStub = sinon.stub(installer, "_getTargetDirForPackage")
		.callsFake(({pkgName, version}) => {
			throw new Error(
				`_getTargetDirForPackage stub called with unknown arguments pkgName: ${pkgName}, version: ${version}}`
			);
		})
		.withArgs({
			pkgName: "myPackage",
			version: "1.2.3"
		}).returns(path.join("/path", "to", "myPackage", "1.2.3"));

	const manifest = await installer.fetchPackageManifest({pkgName: "myPackage", version: "1.2.3"});

	t.deepEqual(manifest, expectedManifest, "Should return expected manifest object");
	t.is(getTargetDirForPackageStub.callCount, 1, "_getTargetDirForPackage should be called once");
	t.is(readJsonStub.callCount, 1, "readJson should be called once");
	t.is(requestPackageManifestStub.callCount, 1, "requestPackageManifest should be called once");
});

test.serial("Installer: fetchPackageManifest (with existing package.json)", async (t) => {
	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/"
	});

	const mockedManifest = {
		name: "myPackage",
		dependencies: {
			"foo": "1.2.3"
		},
		devDependencies: {
			"bar": "4.5.6"
		},
		foo: "bar"
	};

	const expectedManifest = {
		name: "myPackage",
		dependencies: {
			"foo": "1.2.3"
		},
		devDependencies: {
			"bar": "4.5.6"
		}
	};

	const registry = installer.getRegistry();
	const requestPackageManifestStub = sinon.stub(registry, "requestPackageManifest")
		.rejects(new Error("Unexpected call"));

	const readJsonStub = sinon.stub(installer, "readJson")
		.callsFake((path) => {
			throw new Error(
				`readJson stub called with unknown path: ${path}`
			);
		})
		.withArgs(path.join("/path", "to", "myPackage", "1.2.3", "package.json"))
		.resolves(mockedManifest);

	const getTargetDirForPackageStub = sinon.stub(installer, "_getTargetDirForPackage")
		.callsFake(({pkgName, version}) => {
			throw new Error(
				`_getTargetDirForPackage stub called with unknown arguments pkgName: ${pkgName}, version: ${version}}`
			);
		})
		.withArgs({
			pkgName: "myPackage",
			version: "1.2.3"
		}).returns(path.join("/path", "to", "myPackage", "1.2.3"));

	const manifest = await installer.fetchPackageManifest({pkgName: "myPackage", version: "1.2.3"});

	t.deepEqual(manifest, expectedManifest, "Should return expected manifest object");
	t.is(getTargetDirForPackageStub.callCount, 1, "_getTargetDirForPackage should be called once");
	t.is(readJsonStub.callCount, 1, "readJson should be called once");
	t.is(requestPackageManifestStub.callCount, 0, "requestPackageManifest should not be called");
});

test.serial("Installer: fetchPackageManifest (readJson throws error)", async (t) => {
	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/"
	});

	const registry = installer.getRegistry();
	const requestPackageManifestStub = sinon.stub(registry, "requestPackageManifest")
		.rejects(new Error("Unexpected call"));

	const readJsonStub = sinon.stub(installer, "readJson")
		.rejects(new Error("Error from readJson"));

	const getTargetDirForPackageStub = sinon.stub(installer, "_getTargetDirForPackage")
		.callsFake(({pkgName, version}) => {
			throw new Error(
				`_getTargetDirForPackage stub called with unknown arguments pkgName: ${pkgName}, version: ${version}}`
			);
		})
		.withArgs({
			pkgName: "myPackage",
			version: "1.2.3"
		}).returns(path.join("/path", "to", "myPackage", "1.2.3"));

	await t.throwsAsync(async () => {
		await installer.fetchPackageManifest({pkgName: "myPackage", version: "1.2.3"});
	}, {message: "Error from readJson"});

	t.is(getTargetDirForPackageStub.callCount, 1, "_getTargetDirForPackage should be called once");
	t.is(readJsonStub.callCount, 1, "readJson should be called once");
	t.is(requestPackageManifestStub.callCount, 0, "requestPackageManifest should not be called");
});

test.serial("Installer: _synchronize", async (t) => {
	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/"
	});

	t.context.lockStub.yieldsAsync();
	t.context.unlockStub.yieldsAsync();

	const getLockPathStub = sinon.stub(installer, "_getLockPath").returns("/locks/lockfile.lock");

	const callback = sinon.stub().resolves();

	await installer._synchronize({
		pkgName: "@openui5/sap.ui.lib1",
		version: "1.2.3"
	}, callback);

	t.is(getLockPathStub.callCount, 1, "_getLockPath should be called once");
	t.deepEqual(getLockPathStub.getCall(0).args, [{pkgName: "@openui5/sap.ui.lib1", version: "1.2.3"}],
		"_getLockPath should be called with expected args");

	t.is(t.context.mkdirpStub.callCount, 1, "_mkdirp should be called once");
	t.deepEqual(t.context.mkdirpStub.getCall(0).args, [path.join("/ui5Home/", "framework", "locks")],
		"_mkdirp should be called with expected args");

	t.is(t.context.lockStub.callCount, 1, "lock should be called once");
	t.deepEqual(t.context.lockStub.getCall(0).args[0], "/locks/lockfile.lock",
		"lock should be called with expected path");
	t.deepEqual(t.context.lockStub.getCall(0).args[1], {wait: 10000, stale: 60000, retries: 10},
		"lock should be called with expected options");

	t.is(t.context.unlockStub.callCount, 1, "unlock should be called once");
	t.deepEqual(t.context.unlockStub.getCall(0).args[0], "/locks/lockfile.lock",
		"unlock should be called with expected path");

	t.is(callback.callCount, 1, "callback should be called once");

	t.true(t.context.lockStub.calledBefore(callback), "Lock should be called before invoking the callback");
	t.true(t.context.unlockStub.calledAfter(callback), "Unlock should be called after invoking the callback");
});

test.serial("Installer: _synchronize should unlock when callback promise has resolved", async (t) => {
	t.plan(4);

	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/"
	});

	t.context.lockStub.yieldsAsync();
	t.context.unlockStub.yieldsAsync();

	sinon.stub(installer, "_getLockPath").returns("/locks/lockfile.lock");

	const callback = sinon.stub().callsFake(() => {
		t.is(t.context.lockStub.callCount, 1, "lock should have been called when the callback is invoked");
		return Promise.resolve().then(() => {
			t.is(t.context.unlockStub.callCount, 0,
				"unlock should not be called when the callback did not fully resolve, yet");
		});
	});

	await installer._synchronize({
		pkgName: "@openui5/sap.ui.lib1",
		version: "1.2.3"
	}, callback);

	t.is(callback.callCount, 1, "callback should be called once");
	t.is(t.context.unlockStub.callCount, 1, "unlock should be called after _synchronize has resolved");
});

test.serial("Installer: _synchronize should throw when locking fails", async (t) => {
	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/"
	});

	t.context.lockStub.yieldsAsync(new Error("Locking error"));

	sinon.stub(installer, "_getLockPath").returns("/locks/lockfile.lock");

	const callback = sinon.stub();

	await t.throwsAsync(async () => {
		await installer._synchronize({
			pkgName: "@openui5/sap.ui.lib1",
			version: "1.2.3"
		}, callback);
	}, {message: "Locking error"});

	t.is(callback.callCount, 0, "callback should not be called");
	t.is(t.context.unlockStub.callCount, 0, "unlock should not be called");
});

test.serial("Installer: _synchronize should still unlock when callback throws an error", async (t) => {
	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/"
	});

	t.context.lockStub.yieldsAsync();
	t.context.unlockStub.yieldsAsync();

	sinon.stub(installer, "_getLockPath").returns("/locks/lockfile.lock");

	const callback = sinon.stub().throws(new Error("Callback throws error"));

	await t.throwsAsync(async () => {
		await installer._synchronize({
			pkgName: "@openui5/sap.ui.lib1",
			version: "1.2.3"
		}, callback);
	}, {message: "Callback throws error"});

	t.is(callback.callCount, 1, "callback should be called once");
	t.is(t.context.lockStub.callCount, 1, "lock should be called once");
	t.is(t.context.unlockStub.callCount, 1, "unlock should be called once");
});

test.serial("Installer: _synchronize should still unlock when callback rejects with error", async (t) => {
	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/"
	});

	t.context.lockStub.yieldsAsync();
	t.context.unlockStub.yieldsAsync();

	sinon.stub(installer, "_getLockPath").returns("/locks/lockfile.lock");

	const callback = sinon.stub().rejects(new Error("Callback rejects with error"));

	await t.throwsAsync(async () => {
		await installer._synchronize({
			pkgName: "@openui5/sap.ui.lib1",
			version: "1.2.3"
		}, callback);
	}, {message: "Callback rejects with error"});

	t.is(callback.callCount, 1, "callback should be called once");
	t.is(t.context.lockStub.callCount, 1, "lock should be called once");
	t.is(t.context.unlockStub.callCount, 1, "unlock should be called once");
});

test.serial("Installer: installPackage with new package", async (t) => {
	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/"
	});

	t.context.lockStub.yieldsAsync();
	t.context.unlockStub.yieldsAsync();

	const targetDir = path.join("my", "package", "dir");
	const getTargetDirForPackageStub = sinon.stub(installer, "_getTargetDirForPackage")
		.returns(targetDir);

	const packageJsonExistsStub = sinon.stub(installer, "_packageJsonExists").resolves(false);
	const synchronizeSpy = sinon.spy(installer, "_synchronize");

	const getStagingDirForPackageStub = sinon.stub(installer, "_getStagingDirForPackage")
		.returns("staging-dir-path");
	const pathExistsStub = sinon.stub(installer, "_pathExists").resolves(false);

	const registry = installer.getRegistry();
	const extractPackageStub = sinon.stub(registry, "extractPackage").resolves();

	const res = await installer.installPackage({
		pkgName: "myPackage",
		version: "1.2.3"
	});

	t.deepEqual(res, {
		pkgPath: targetDir
	}, "Should return correct values");

	t.is(getTargetDirForPackageStub.callCount, 1, "_getTargetDirForPackage should be called once");
	t.deepEqual(getTargetDirForPackageStub.getCall(0).args[0], {
		pkgName: "myPackage",
		version: "1.2.3"
	}, "_getTargetDirForPackage should be called with the correct arguments");

	t.is(packageJsonExistsStub.callCount, 2, "_packageJsonExists should be called twice");
	t.is(packageJsonExistsStub.getCall(0).args[0], targetDir,
		"_packageJsonExists should be called with the correct arguments on first call");
	t.is(packageJsonExistsStub.getCall(1).args[0], targetDir,
		"_packageJsonExists should be called with the correct arguments on second call");

	t.is(synchronizeSpy.callCount, 1, "_synchronize should be called once");
	t.deepEqual(synchronizeSpy.getCall(0).args[0], {
		pkgName: "myPackage",
		version: "1.2.3"
	}, "_synchronize should be called with the correct first argument");
	t.is(t.context.lockStub.callCount, 1, "lock should be called once");
	t.is(t.context.unlockStub.callCount, 1, "unlock should be called once");

	t.is(getStagingDirForPackageStub.callCount, 1, "_getStagingDirForPackage should be called once");
	t.deepEqual(getStagingDirForPackageStub.getCall(0).args[0], {
		pkgName: "myPackage",
		version: "1.2.3"
	}, "_getStagingDirForPackage should be called with the correct arguments");

	t.is(pathExistsStub.callCount, 2, "_pathExists should be called twice");
	t.is(pathExistsStub.getCall(0).args[0], "staging-dir-path",
		"_packageJsonExists should be called with the correct arguments");
	t.is(pathExistsStub.getCall(1).args[0], targetDir,
		"_packageJsonExists should be called with the correct arguments");
	t.is(t.context.rimrafStub.callCount, 0, "rimraf should never be called");

	t.is(extractPackageStub.callCount, 1, "_extractPackage should be called once");

	t.is(t.context.mkdirpStub.callCount, 2, "mkdirp should be called twice");
	t.is(t.context.mkdirpStub.getCall(0).args[0], path.join("/", "ui5Home", "framework", "locks"),
		"mkdirp should be called with the correct arguments on first call");
	t.is(t.context.mkdirpStub.getCall(1).args[0], path.join("my", "package"),
		"mkdirp should be called with the correct arguments on second call");

	t.is(t.context.renameStub.callCount, 1, "fs.rename should be called once");
	t.is(t.context.renameStub.getCall(0).args[0], "staging-dir-path",
		"fs.rename should be called with the correct first argument");
	t.is(t.context.renameStub.getCall(0).args[1], targetDir,
		"fs.rename should be called with the correct second argument");
});

test.serial("Installer: installPackage with already installed package", async (t) => {
	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/"
	});

	t.context.lockStub.yieldsAsync();
	t.context.unlockStub.yieldsAsync();

	const getTargetDirForPackageStub = sinon.stub(installer, "_getTargetDirForPackage")
		.returns("package-dir-path");

	const packageJsonExistsStub = sinon.stub(installer, "_packageJsonExists").resolves(true);
	const synchronizeSpy = sinon.spy(installer, "_synchronize");

	const getStagingDirForPackageStub = sinon.stub(installer, "_getStagingDirForPackage")
		.returns("staging-dir-path");
	const pathExistsStub = sinon.stub(installer, "_pathExists").resolves(false);

	const registry = installer.getRegistry();
	const extractPackageStub = sinon.stub(registry, "extractPackage").resolves();

	const res = await installer.installPackage({
		pkgName: "myPackage",
		version: "1.2.3"
	});

	t.deepEqual(res, {
		pkgPath: "package-dir-path"
	}, "Should return correct values");

	t.is(getTargetDirForPackageStub.callCount, 1, "_getTargetDirForPackage should be called once");
	t.deepEqual(getTargetDirForPackageStub.getCall(0).args[0], {
		pkgName: "myPackage",
		version: "1.2.3"
	}, "_getTargetDirForPackage should be called with the correct arguments");

	t.is(packageJsonExistsStub.callCount, 1, "_packageJsonExists should be called once");
	t.is(packageJsonExistsStub.getCall(0).args[0], "package-dir-path",
		"_packageJsonExists should be called with the correct arguments on first call");

	t.is(synchronizeSpy.callCount, 0, "_synchronize should never be called");
	t.is(t.context.lockStub.callCount, 0, "lock should never be called");
	t.is(t.context.unlockStub.callCount, 0, "unlock should never be called");
	t.is(getStagingDirForPackageStub.callCount, 0, "_getStagingDirForPackage should never be called");
	t.is(pathExistsStub.callCount, 0, "_pathExists should never be called");
	t.is(t.context.rimrafStub.callCount, 0, "rimraf should never be called");
	t.is(extractPackageStub.callCount, 0, "_extractPackage should never be called");
	t.is(t.context.mkdirpStub.callCount, 0, "mkdirp should never be called");
	t.is(t.context.renameStub.callCount, 0, "fs.rename should never be called");
});

test.serial("Installer: installPackage with install already in progress", async (t) => {
	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/"
	});

	t.context.lockStub.yieldsAsync();
	t.context.unlockStub.yieldsAsync();

	const getTargetDirForPackageStub = sinon.stub(installer, "_getTargetDirForPackage")
		.returns("package-dir-path");

	const packageJsonExistsStub = sinon.stub(installer, "_packageJsonExists")
		.onFirstCall().resolves(false)
		.onSecondCall().resolves(true); // After lock got acquired, package has been installed

	const synchronizeSpy = sinon.spy(installer, "_synchronize");

	const getStagingDirForPackageStub = sinon.stub(installer, "_getStagingDirForPackage")
		.returns("staging-dir-path");
	const pathExistsStub = sinon.stub(installer, "_pathExists").resolves(false);

	const registry = installer.getRegistry();
	const extractPackageStub = sinon.stub(registry, "extractPackage").resolves();

	await installer.installPackage({
		pkgName: "myPackage",
		version: "1.2.3"
	});

	t.is(getTargetDirForPackageStub.callCount, 1, "_getTargetDirForPackage should be called once");
	t.deepEqual(getTargetDirForPackageStub.getCall(0).args[0], {
		pkgName: "myPackage",
		version: "1.2.3"
	}, "_getTargetDirForPackage should be called with the correct arguments");

	t.is(packageJsonExistsStub.callCount, 2, "_packageJsonExists should be called twice");
	t.is(packageJsonExistsStub.getCall(0).args[0], "package-dir-path",
		"_packageJsonExists should be called with the correct arguments on first call");
	t.is(packageJsonExistsStub.getCall(1).args[0], "package-dir-path",
		"_packageJsonExists should be called with the correct arguments on second call");

	t.is(synchronizeSpy.callCount, 1, "_synchronize should be called once");
	t.deepEqual(synchronizeSpy.getCall(0).args[0], {
		pkgName: "myPackage",
		version: "1.2.3"
	}, "_synchronize should be called with the correct first argument");
	t.is(t.context.lockStub.callCount, 1, "lock should be called once");
	t.is(t.context.unlockStub.callCount, 1, "unlock should be called once");

	t.is(t.context.rimrafStub.callCount, 0, "rimraf should never be called");

	t.is(t.context.mkdirpStub.callCount, 1, "mkdirp should be called once");
	t.is(t.context.mkdirpStub.getCall(0).args[0], path.join("/", "ui5Home", "framework", "locks"),
		"mkdirp should be called with the correct arguments");

	t.is(getStagingDirForPackageStub.callCount, 0, "_getStagingDirForPackage should never be called");
	t.is(pathExistsStub.callCount, 0, "_pathExists should never be called");
	t.is(extractPackageStub.callCount, 0, "_extractPackage should never be called");
	t.is(t.context.renameStub.callCount, 0, "fs.rename should never be called");
});

test.serial("Installer: installPackage with new package and existing target and staging", async (t) => {
	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/"
	});

	t.context.lockStub.yieldsAsync();
	t.context.unlockStub.yieldsAsync();

	const targetDir = path.join("my", "package", "dir");
	const getTargetDirForPackageStub = sinon.stub(installer, "_getTargetDirForPackage")
		.returns(targetDir);

	const packageJsonExistsStub = sinon.stub(installer, "_packageJsonExists").resolves(false);
	const synchronizeSpy = sinon.spy(installer, "_synchronize");

	const getStagingDirForPackageStub = sinon.stub(installer, "_getStagingDirForPackage")
		.returns("staging-dir-path");
	const pathExistsStub = sinon.stub(installer, "_pathExists").resolves(true); // Staging dir exists

	const registry = installer.getRegistry();
	const extractPackageStub = sinon.stub(registry, "extractPackage").resolves();

	const res = await installer.installPackage({
		pkgName: "myPackage",
		version: "1.2.3"
	});

	t.deepEqual(res, {
		pkgPath: targetDir
	}, "Should return correct values");

	t.is(getTargetDirForPackageStub.callCount, 1, "_getTargetDirForPackage should be called once");
	t.deepEqual(getTargetDirForPackageStub.getCall(0).args[0], {
		pkgName: "myPackage",
		version: "1.2.3"
	}, "_getTargetDirForPackage should be called with the correct arguments");

	t.is(packageJsonExistsStub.callCount, 2, "_packageJsonExists should be called twice");
	t.is(packageJsonExistsStub.getCall(0).args[0], targetDir,
		"_packageJsonExists should be called with the correct arguments on first call");
	t.is(packageJsonExistsStub.getCall(1).args[0], targetDir,
		"_packageJsonExists should be called with the correct arguments on second call");

	t.is(synchronizeSpy.callCount, 1, "_synchronize should be called once");
	t.deepEqual(synchronizeSpy.getCall(0).args[0], {
		pkgName: "myPackage",
		version: "1.2.3"
	}, "_synchronize should be called with the correct first argument");
	t.is(t.context.lockStub.callCount, 1, "lock should be called once");
	t.is(t.context.unlockStub.callCount, 1, "unlock should be called once");

	t.is(getStagingDirForPackageStub.callCount, 1, "_getStagingDirForPackage should be called once");
	t.deepEqual(getStagingDirForPackageStub.getCall(0).args[0], {
		pkgName: "myPackage",
		version: "1.2.3"
	}, "_getStagingDirForPackage should be called with the correct arguments");

	t.is(pathExistsStub.callCount, 2, "_pathExists should be called twice");
	t.is(pathExistsStub.getCall(0).args[0], "staging-dir-path",
		"_packageJsonExists should be called with the correct arguments");
	t.is(pathExistsStub.getCall(1).args[0], targetDir,
		"_packageJsonExists should be called with the correct arguments");

	t.is(t.context.rimrafStub.callCount, 2, "rimraf should be called twice");
	t.is(t.context.rimrafStub.getCall(0).args[0], "staging-dir-path",
		"rimraf should be called with the correct arguments");
	t.is(t.context.rimrafStub.getCall(1).args[0], targetDir,
		"rimraf should be called with the correct arguments");

	t.is(extractPackageStub.callCount, 1, "_extractPackage should be called once");

	t.is(t.context.mkdirpStub.callCount, 2, "mkdirp should be called twice");
	t.is(t.context.mkdirpStub.getCall(0).args[0], path.join("/", "ui5Home", "framework", "locks"),
		"mkdirp should be called with the correct arguments on first call");
	t.is(t.context.mkdirpStub.getCall(1).args[0], path.join("my", "package"),
		"mkdirp should be called with the correct arguments on second call");

	t.is(t.context.renameStub.callCount, 1, "fs.rename should be called once");
	t.is(t.context.renameStub.getCall(0).args[0], "staging-dir-path",
		"fs.rename should be called with the correct first argument");
	t.is(t.context.renameStub.getCall(0).args[1], targetDir,
		"fs.rename should be called with the correct second argument");
});

test.serial("Installer: _pathExists - exists", async (t) => {
	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/"
	});

	const res = await installer._pathExists(__dirname);

	t.is(res, true, "Path should exist");
	t.is(t.context.statStub.getCall(0).args[0], __dirname,
		"fs.stat should be called with correct arguments");
});

test.serial("Installer: _pathExists - does not exist", async (t) => {
	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/"
	});

	const notFoundError = new Error("Not found");
	notFoundError.code = "ENOENT";
	t.context.statStub.yieldsAsync(notFoundError);

	const res = await installer._pathExists("my-path");

	t.is(res, false, "Path should not exist");
	t.is(t.context.statStub.getCall(0).args[0], "my-path",
		"fs.stat should be called with correct arguments");
});

test.serial("Installer: _pathExists - re-throws unexpected errors", async (t) => {
	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/"
	});

	const notFoundError = new Error("Pony Error");
	notFoundError.code = "PONY";
	t.context.statStub.yieldsAsync(notFoundError);

	const err = await t.throwsAsync(installer._pathExists("my-path"));

	t.is(err, notFoundError, "Should throw with expected exception");
	t.is(t.context.statStub.getCall(0).args[0], "my-path",
		"fs.stat should be called with correct arguments");
});
