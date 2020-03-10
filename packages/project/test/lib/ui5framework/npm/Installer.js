const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");
const path = require("path");

const lockfile = require("lockfile");

let Installer;

test.beforeEach((t) => {
	t.context.mkdirpStub = sinon.stub().resolves();
	mock("mkdirp", t.context.mkdirpStub);

	t.context.lockStub = sinon.stub(lockfile, "lock");
	t.context.unlockStub = sinon.stub(lockfile, "unlock");

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
	t.is(installer._baseDir, path.join("/ui5Home/", "framework", "packages"));
	t.is(installer._lockDir, path.join("/ui5Home/", "framework", "locks"));
});

test.serial("Installer: constructor requires 'cwd'", (t) => {
	t.throws(() => {
		new Installer({});
	}, `Installer: Missing parameter "cwd"`);
});

test.serial("Installer: constructor requires 'ui5HomeDir'", (t) => {
	t.throws(() => {
		new Installer({
			cwd: "/cwd/"
		});
	}, `Installer: Missing parameter "ui5HomeDir"`);
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

	const requestPackageManifestStub = sinon.stub(installer._registry, "requestPackageManifest")
		.callsFake((pkgName, version) => {
			throw new Error(
				"_registry.requestPackageManifest stub called with unknown arguments " +
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

	const requestPackageManifestStub = sinon.stub(installer._registry, "requestPackageManifest")
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

	const requestPackageManifestStub = sinon.stub(installer._registry, "requestPackageManifest")
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
	}, "Error from readJson");

	t.is(getTargetDirForPackageStub.callCount, 1, "_getTargetDirForPackage should be called once");
	t.is(readJsonStub.callCount, 1, "readJson should be called once");
	t.is(requestPackageManifestStub.callCount, 0, "requestPackageManifest should not be called");
});

test.serial("Installer: _synchronize", async (t) => {
	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/"
	});

	t.context.mkdirpStub.resolves();
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

	t.context.mkdirpStub.resolves();
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

	t.context.mkdirpStub.resolves();
	t.context.lockStub.yieldsAsync(new Error("Locking error"));

	sinon.stub(installer, "_getLockPath").returns("/locks/lockfile.lock");

	const callback = sinon.stub();

	await t.throwsAsync(async () => {
		await installer._synchronize({
			pkgName: "@openui5/sap.ui.lib1",
			version: "1.2.3"
		}, callback);
	}, "Locking error");

	t.is(callback.callCount, 0, "callback should not be called");
	t.is(t.context.unlockStub.callCount, 0, "unlock should not be called");
});

test.serial("Installer: _synchronize should still unlock when callback throws an error", async (t) => {
	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/"
	});

	t.context.mkdirpStub.resolves();
	t.context.lockStub.yieldsAsync();
	t.context.unlockStub.yieldsAsync();

	sinon.stub(installer, "_getLockPath").returns("/locks/lockfile.lock");

	const callback = sinon.stub().throws(new Error("Callback throws error"));

	await t.throwsAsync(async () => {
		await installer._synchronize({
			pkgName: "@openui5/sap.ui.lib1",
			version: "1.2.3"
		}, callback);
	}, "Callback throws error");

	t.is(callback.callCount, 1, "callback should be called once");
	t.is(t.context.lockStub.callCount, 1, "lock should be called once");
	t.is(t.context.unlockStub.callCount, 1, "unlock should be called once");
});

test.serial("Installer: _synchronize should still unlock when callback rejects with error", async (t) => {
	const installer = new Installer({
		cwd: "/cwd/",
		ui5HomeDir: "/ui5Home/"
	});

	t.context.mkdirpStub.resolves();
	t.context.lockStub.yieldsAsync();
	t.context.unlockStub.yieldsAsync();

	sinon.stub(installer, "_getLockPath").returns("/locks/lockfile.lock");

	const callback = sinon.stub().rejects(new Error("Callback rejects with error"));

	await t.throwsAsync(async () => {
		await installer._synchronize({
			pkgName: "@openui5/sap.ui.lib1",
			version: "1.2.3"
		}, callback);
	}, "Callback rejects with error");

	t.is(callback.callCount, 1, "callback should be called once");
	t.is(t.context.lockStub.callCount, 1, "lock should be called once");
	t.is(t.context.unlockStub.callCount, 1, "unlock should be called once");
});
