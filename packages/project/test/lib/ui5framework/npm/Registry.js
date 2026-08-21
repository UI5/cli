import test from "ava";
import sinonGlobal from "sinon";
import esmock from "esmock";

test.beforeEach(async (t) => {
	const sinon = (t.context.sinon = sinonGlobal.createSandbox());

	t.context.pacote = {
		packument: sinon.stub(),
		manifest: sinon.stub(),
		extract: sinon.stub(),
	};

	class Config {
		constructor(...args) {
			t.context.npmConfigConstructor(...args);
		}

		static get typeDefs() {
			return {path: "string"};
		}

		async load() {}

		get flat() {
			return {};
		}
	}

	t.context.npmConfigConstructor = sinon.stub();
	t.context.npmConfigFlat = sinon.stub(Config.prototype, "flat");
	t.context.Registry = await esmock.p("../../../../lib/ui5Framework/npm/Registry.js", {
		"pacote": {
			"default": t.context.pacote
		},
		"@npmcli/config": {
			"default": Config
		},
		"@npmcli/config/lib/definitions/index.js": {
			default: {
				flatten: "flatten",
				definitions: "definitions",
				shorthands: "shorthands",
				defaults: "defaults",
			}
		}
	});
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
	esmock.purge(t.context.Registry);
});

test.serial("Constructor", (t) => {
	const {Registry} = t.context;

	const registry = new Registry({
		cwd: "cwd",
		cacheDir: "cacheDir"
	});

	t.true(registry instanceof Registry);
});

test.serial("_getPacoteOptions", async (t) => {
	const {Registry, npmConfigFlat, npmConfigConstructor} = t.context;

	const registry = new Registry({
		cwd: "cwd",
		cacheDir: "cacheDir"
	});

	const npmConfig = {
		"fake": "config"
	};

	const expectedPacoteOptions = {
		fake: "config",
		cache: "cacheDir"
	};
	npmConfigFlat.value(npmConfig);

	const pacoteOptions = await registry._getPacoteOptions();

	t.is(npmConfigConstructor.callCount, 1);
	t.deepEqual(npmConfigConstructor.firstCall.firstArg, {
		cwd: "cwd",
		npmPath: "cwd",
		flatten: "flatten",
		definitions: "definitions",
		shorthands: "shorthands",
		defaults: "defaults",
		argv: [],
	});

	t.deepEqual(pacoteOptions, expectedPacoteOptions);
});

// This test uses the real @npmcli/config (not the mock from beforeEach) to verify that UI5 CLI args present in
// process.argv do not leak into the resolved npm configuration. @npmcli/config reads process.argv by default and
// parses recognized npm options from it (see loadCLI() in @npmcli/config); a UI5 CLI arg that happens to be a valid
// npm option would otherwise override the actual npm config.
test.serial("_getPacoteOptions does not read npm config from process.argv (real @npmcli/config)", async (t) => {
	const RealRegistry = (await import("../../../../lib/ui5Framework/npm/Registry.js")).default;

	const registry = new RealRegistry({
		cwd: process.cwd(),
		cacheDir: "cacheDir"
	});

	// --registry is a genuine npm config option. If @npmcli/config read process.argv, this would end up as the
	// resolved registry instead of the npm default.
	const spoofedRegistry = "https://___ui5-cli-arg___/";
	const originalArgv = process.argv;
	process.argv = [process.execPath, "ui5", "build", `--registry=${spoofedRegistry}`];
	let pacoteOptions;
	try {
		pacoteOptions = await registry._getPacoteOptions();
	} finally {
		process.argv = originalArgv;
	}

	t.not(pacoteOptions.registry, spoofedRegistry,
		"The registry from process.argv must not leak into the npm configuration");
});

test.serial("_getPacoteOptions (proxy config set)", async (t) => {
	const {Registry, npmConfigFlat, npmConfigConstructor} = t.context;

	const registry = new Registry({
		cwd: "cwd",
		cacheDir: "cacheDir"
	});

	const npmConfig = {
		"proxy": "http://localhost:9999"
	};

	const expectedPacoteOptions = {
		proxy: "http://localhost:9999",
		cache: "cacheDir"
	};

	npmConfigFlat.value(npmConfig);

	const pacoteOptions = await registry._getPacoteOptions();

	t.is(npmConfigConstructor.callCount, 1);

	t.deepEqual(pacoteOptions, expectedPacoteOptions);
});

test.serial("_getPacoteOptions (https-proxy config set)", async (t) => {
	const {Registry, npmConfigFlat, npmConfigConstructor} = t.context;

	const registry = new Registry({
		cwd: "cwd",
		cacheDir: "cacheDir"
	});

	const npmConfig = {
		"httpsProxy": "http://localhost:9999"
	};

	const expectedPacoteOptions = {
		httpsProxy: "http://localhost:9999",
		cache: "cacheDir"
	};

	npmConfigFlat.value(npmConfig);

	const pacoteOptions = await registry._getPacoteOptions();

	t.is(npmConfigConstructor.callCount, 1);

	t.deepEqual(pacoteOptions, expectedPacoteOptions);
});

test.serial("_getPacote", async (t) => {
	const {Registry, sinon} = t.context;

	const registry = new Registry({
		cwd: "cwd",
		cacheDir: "cacheDir"
	});

	const expectedPacoteOptions = {"fake": "options"};

	sinon.stub(registry, "_getPacoteOptions").resolves(expectedPacoteOptions);

	const {pacote, pacoteOptions} = await registry._getPacote();

	t.is(pacote, t.context.pacote);
	t.is(pacoteOptions, expectedPacoteOptions);
});

test.serial("_getPacote caching", async (t) => {
	const {Registry, sinon} = t.context;

	const registry = new Registry({
		cwd: "cwd",
		cacheDir: "cacheDir"
	});

	const expectedPacoteOptions = {"fake": "options"};

	const getPacoteOptionsStub = sinon.stub(registry, "_getPacoteOptions").resolves(expectedPacoteOptions);

	const {pacote, pacoteOptions} = await registry._getPacote();

	t.is(pacote, t.context.pacote);
	t.is(pacoteOptions, expectedPacoteOptions);

	await registry._getPacote();
	await registry._getPacote();

	t.is(getPacoteOptionsStub.callCount, 1, "_getPacoteOptions got called once");
});
