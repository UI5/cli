import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import path from "node:path";

const __dirname = import.meta.dirname;

test.beforeEach(async (t) => {
	t.context.mkdirpStub = sinon.stub().resolves();
	t.context.rmrfStub = sinon.stub().resolves();

	t.context.lockStub = sinon.stub();
	t.context.unlockStub = sinon.stub();
	t.context.renameStub = sinon.stub().yieldsAsync();
	t.context.statStub = sinon.stub().yieldsAsync();

	t.context.AbstractResolver = await esmock.p("../../../../lib/ui5Framework/AbstractInstaller.js", {
		"../../../../lib/utils/fs.js": {
			mkdirp: t.context.mkdirpStub,
			rmrf: t.context.rmrfStub
		},
		"lockfile": {
			lock: t.context.lockStub,
			unlock: t.context.unlockStub
		}
	});
	t.context.Installer = await esmock.p("../../../../lib/ui5Framework/npm/Installer.js", {
		"../../../../lib/ui5Framework/AbstractInstaller.js": t.context.AbstractResolver,
		"../../../../lib/utils/fs.js": {
			mkdirp: t.context.mkdirpStub,
			rmrf: t.context.rmrfStub
		},
		"graceful-fs": {
			rename: t.context.renameStub,
			stat: t.context.statStub
		}
	});
});

test.afterEach.always((t) => {
	sinon.restore();
	esmock.purge(t.context.AbstractResolver);
	esmock.purge(t.context.Installer);
});

test.serial("Installer: constructor", (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/"
	});
	t.true(installer instanceof Installer, "Constructor returns instance of class");
	t.is(installer._packagesDir, path.join("/ui5Data/", "framework", "packages"));
	t.is(installer._lockDir, path.join("/ui5Data/", "framework", "locks"));
	t.is(installer._stagingDir, path.join("/ui5Data/", "framework", "staging"));
});

test.serial("Installer: constructor requires 'cwd'", (t) => {
	const {Installer} = t.context;

	t.throws(() => {
		new Installer({
			ui5DataDir: "/ui5Data/"
		});
	}, {message: `Installer: Missing parameter "cwd"`});
});

test.serial("Installer: constructor requires 'ui5DataDir'", (t) => {
	const {Installer} = t.context;

	t.throws(() => {
		new Installer({
			cwd: "/cwd/"
		});
	}, {message: `Installer: Missing parameter "ui5DataDir"`});
});

test.serial("Installer: fetchPackageVersions", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/"
	});

	const registry = installer.getRegistry();
	const requestPackagePackumentStub = sinon.stub().resolves({
		versions: {
			"1.0.0": {},
			"2.0.0": {},
			"3.0.0": {},
		},
	});
	sinon
		.stub(registry, "_getPacote")
		.resolves({
			pacote: {
				packument: requestPackagePackumentStub
			},
			pacoteOptions: {},
		});

	const packageVersions = await installer.fetchPackageVersions({pkgName: "@openui5/sap.ui.lib1"});

	t.deepEqual(packageVersions, ["1.0.0", "2.0.0", "3.0.0"], "Should resolve with expected versions");

	t.is(requestPackagePackumentStub.callCount, 1, "requestPackagePackument should be called once");
	t.is(requestPackagePackumentStub.getCall(0).args[0], "@openui5/sap.ui.lib1",
		"requestPackagePackument should be called with pkgName");
});

test.serial("Installer: _getLockPath", (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/"
	});

	const lockPath = installer._getLockPath("lo/ck-n@me");

	t.is(lockPath, path.join("/ui5Data/", "framework", "locks", "lo-ck-n@me.lock"));
});

test.serial("Installer: _getLockPath with illegal characters", (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/"
	});

	t.throws(() => installer._getLockPath("lock.näme"), {
		message: "Illegal file name: lock.näme"
	});
	t.throws(() => installer._getLockPath(".lock.name"), {
		message: "Illegal file name: .lock.name"
	});
});

test.serial("Installer: fetchPackageManifest (without existing package.json)", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/"
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
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/"
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
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/"
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
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/"
	});

	t.context.lockStub.yieldsAsync();
	t.context.unlockStub.yieldsAsync();

	const getLockPathStub = sinon.stub(installer, "_getLockPath").returns("/locks/lockfile.lock");

	const callback = sinon.stub().resolves();

	await installer._synchronize("lock/name", callback);

	t.is(getLockPathStub.callCount, 1, "_getLockPath should be called once");
	t.is(getLockPathStub.getCall(0).args[0], "lock/name",
		"_getLockPath should be called with expected args");

	t.is(t.context.mkdirpStub.callCount, 1, "_mkdirp should be called once");
	t.deepEqual(t.context.mkdirpStub.getCall(0).args, [path.join("/ui5Data/", "framework", "locks")],
		"_mkdirp should be called with expected args");

	t.is(t.context.lockStub.callCount, 1, "lock should be called once");
	t.is(t.context.lockStub.getCall(0).args[0], "/locks/lockfile.lock",
		"lock should be called with expected path");
	t.deepEqual(t.context.lockStub.getCall(0).args[1], {wait: 10000, stale: 60000, retries: 10},
		"lock should be called with expected options");

	t.is(t.context.unlockStub.callCount, 1, "unlock should be called once");
	t.is(t.context.unlockStub.getCall(0).args[0], "/locks/lockfile.lock",
		"unlock should be called with expected path");

	t.is(callback.callCount, 1, "callback should be called once");

	t.true(t.context.lockStub.calledBefore(callback), "Lock should be called before invoking the callback");
	t.true(t.context.unlockStub.calledAfter(callback), "Unlock should be called after invoking the callback");
});

test.serial("Installer: _synchronize should unlock when callback promise has resolved", async (t) => {
	const {Installer} = t.context;

	t.plan(4);

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/"
	});

	t.context.lockStub.yieldsAsync();
	t.context.unlockStub.yieldsAsync();

	sinon.stub(installer, "_getLockPath").returns("/locks/lockfile.lock");

	const callback = sinon.stub().callsFake(async () => {
		t.is(t.context.lockStub.callCount, 1, "lock should have been called when the callback is invoked");
		await Promise.resolve();
		t.is(t.context.unlockStub.callCount, 0,
			"unlock should not be called when the callback did not fully resolve, yet");
	});

	await installer._synchronize("lock/name", callback);

	t.is(callback.callCount, 1, "callback should be called once");
	t.is(t.context.unlockStub.callCount, 1, "unlock should be called after _synchronize has resolved");
});

test.serial("Installer: _synchronize should throw when locking fails", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/"
	});

	t.context.lockStub.yieldsAsync(new Error("Locking error"));

	sinon.stub(installer, "_getLockPath").returns("/locks/lockfile.lock");

	const callback = sinon.stub();

	await t.throwsAsync(async () => {
		await installer._synchronize("lock/name", callback);
	}, {message: "Locking error"});

	t.is(callback.callCount, 0, "callback should not be called");
	t.is(t.context.unlockStub.callCount, 0, "unlock should not be called");
});

test.serial("Installer: _synchronize should still unlock when callback throws an error", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/"
	});

	t.context.lockStub.yieldsAsync();
	t.context.unlockStub.yieldsAsync();

	sinon.stub(installer, "_getLockPath").returns("/locks/lockfile.lock");

	const callback = sinon.stub().throws(new Error("Callback throws error"));

	await t.throwsAsync(async () => {
		await installer._synchronize("lock/name", callback);
	}, {message: "Callback throws error"});

	t.is(callback.callCount, 1, "callback should be called once");
	t.is(t.context.lockStub.callCount, 1, "lock should be called once");
	t.is(t.context.unlockStub.callCount, 1, "unlock should be called once");
});

test.serial("Installer: _synchronize should still unlock when callback rejects with error", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/"
	});

	t.context.lockStub.yieldsAsync();
	t.context.unlockStub.yieldsAsync();

	sinon.stub(installer, "_getLockPath").returns("/locks/lockfile.lock");

	const callback = sinon.stub().rejects(new Error("Callback rejects with error"));

	await t.throwsAsync(async () => {
		await installer._synchronize("lock/name", callback);
	}, {message: "Callback rejects with error"});

	t.is(callback.callCount, 1, "callback should be called once");
	t.is(t.context.lockStub.callCount, 1, "lock should be called once");
	t.is(t.context.unlockStub.callCount, 1, "unlock should be called once");
});

test.serial("Installer: installPackage with new package", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/"
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
	t.is(synchronizeSpy.getCall(0).args[0], "package-myPackage@1.2.3",
		"_synchronize should be called with the correct first argument");
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
	t.is(t.context.rmrfStub.callCount, 0, "rmrf should never be called");

	t.is(extractPackageStub.callCount, 1, "_extractPackage should be called once");

	t.is(t.context.mkdirpStub.callCount, 2, "mkdirp should be called twice");
	t.is(t.context.mkdirpStub.getCall(0).args[0], path.join("/", "ui5Data", "framework", "locks"),
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
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/"
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
	t.is(t.context.rmrfStub.callCount, 0, "rmrf should never be called");
	t.is(extractPackageStub.callCount, 0, "_extractPackage should never be called");
	t.is(t.context.mkdirpStub.callCount, 0, "mkdirp should never be called");
	t.is(t.context.renameStub.callCount, 0, "fs.rename should never be called");
});

test.serial("Installer: installPackage with install already in progress", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/"
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
	t.is(synchronizeSpy.getCall(0).args[0], "package-myPackage@1.2.3",
		"_synchronize should be called with the correct first argument");
	t.is(t.context.lockStub.callCount, 1, "lock should be called once");
	t.is(t.context.unlockStub.callCount, 1, "unlock should be called once");

	t.is(t.context.rmrfStub.callCount, 0, "rmrf should never be called");

	t.is(t.context.mkdirpStub.callCount, 1, "mkdirp should be called once");
	t.is(t.context.mkdirpStub.getCall(0).args[0], path.join("/", "ui5Data", "framework", "locks"),
		"mkdirp should be called with the correct arguments");

	t.is(getStagingDirForPackageStub.callCount, 0, "_getStagingDirForPackage should never be called");
	t.is(pathExistsStub.callCount, 0, "_pathExists should never be called");
	t.is(extractPackageStub.callCount, 0, "_extractPackage should never be called");
	t.is(t.context.renameStub.callCount, 0, "fs.rename should never be called");
});

test.serial("Installer: installPackage with new package and existing target and staging", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/"
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
	t.is(synchronizeSpy.getCall(0).args[0], "package-myPackage@1.2.3",
		"_synchronize should be called with the correct first argument");
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

	t.is(t.context.rmrfStub.callCount, 2, "rmrf should be called twice");
	t.is(t.context.rmrfStub.getCall(0).args[0], "staging-dir-path",
		"rmrf should be called with the correct arguments");
	t.is(t.context.rmrfStub.getCall(1).args[0], targetDir,
		"rmrf should be called with the correct arguments");

	t.is(extractPackageStub.callCount, 1, "_extractPackage should be called once");

	t.is(t.context.mkdirpStub.callCount, 2, "mkdirp should be called twice");
	t.is(t.context.mkdirpStub.getCall(0).args[0], path.join("/", "ui5Data", "framework", "locks"),
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
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/"
	});

	const res = await installer._pathExists(__dirname);

	t.is(res, true, "Path should exist");
	t.is(t.context.statStub.getCall(0).args[0], __dirname,
		"fs.stat should be called with correct arguments");
});

test.serial("Installer: _pathExists - does not exist", async (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/"
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
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/"
	});

	const notFoundError = new Error("Pony Error");
	notFoundError.code = "PONY";
	t.context.statStub.yieldsAsync(notFoundError);

	const err = await t.throwsAsync(installer._pathExists("my-path"));

	t.is(err, notFoundError, "Should throw with expected exception");
	t.is(t.context.statStub.getCall(0).args[0], "my-path",
		"fs.stat should be called with correct arguments");
});


test.serial("Installer: Registry throws", (t) => {
	const {Installer} = t.context;

	const installer = new Installer({
		cwd: "/cwd/",
		ui5DataDir: "/ui5Data/"
	});

	installer._cwd = null;
	t.throws(() => installer.getRegistry(), {
		message: "Registry: Missing parameter \"cwd\"",
	}, "Registry requires cwd");

	installer._cwd = "/cwd/";
	installer._caCacheDir = null;
	t.throws(() => installer.getRegistry(), {
		message: "Registry: Missing parameter \"cacheDir\"",
	}, "Registry requires cahceDir");
});
