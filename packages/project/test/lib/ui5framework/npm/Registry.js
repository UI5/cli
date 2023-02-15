import test from "ava";
import sinonGlobal from "sinon";
import esmock from "esmock";

test.beforeEach(async (t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();

	t.context.pacote = {
		packument: sinon.stub(),
		manifest: sinon.stub(),
		extract: sinon.stub(),
	};

	t.context.libnpmconfigReadToJSON = sinon.stub();
	t.context.libnpmconfig = {
		read: sinon.stub().returns({
			toJSON: t.context.libnpmconfigReadToJSON
		})
	};

	t.context.Registry = await esmock.p("../../../../lib/ui5Framework/npm/Registry.js", {
		"pacote": {
			default: t.context.pacote
		},
		"libnpmconfig": t.context.libnpmconfig
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
	const {Registry, libnpmconfig, libnpmconfigReadToJSON} = t.context;

	const registry = new Registry({
		cwd: "cwd",
		cacheDir: "cacheDir"
	});

	const npmConfig = {
		"fake": "config"
	};

	libnpmconfigReadToJSON.returns(npmConfig);

	const pacoteOptions = await registry._getPacoteOptions();

	t.is(libnpmconfigReadToJSON.callCount, 1);
	t.is(libnpmconfig.read.callCount, 1);
	t.deepEqual(libnpmconfig.read.getCall(0).args, [{
		cache: "cacheDir",
		agent: false
	}, {
		cwd: "cwd"
	}]);

	t.is(pacoteOptions, npmConfig);

	const cachedPacoteOptions = await registry._getPacoteOptions();

	t.is(libnpmconfigReadToJSON.callCount, 1);
	t.is(libnpmconfig.read.callCount, 1);

	t.is(cachedPacoteOptions, npmConfig);
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
