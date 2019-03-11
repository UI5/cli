const {test} = require("ava");
const sinon = require("sinon");
const build = require("../../../../lib/cli/commands/build");
const normalizer = require("@ui5/project").normalizer;
const builder = require("@ui5/builder").builder;
const logger = require("@ui5/logger");
let normalizerStub = null;
let builderStub = null;

const args = {
	_: [],
	dest: "./dist",
	loglevel: "info",
	t8r: "npm",
	translator: "npm"
};
const defaultBuilderArgs = {
	tree: {
		metadata: {
			name: "Sample"
		}
	},
	destPath: "./dist",
	buildDependencies: undefined,
	dev: false,
	selfContained: false,
	jsdoc: false,
	devExcludeProject: undefined,
	includedTasks: undefined,
	excludedTasks: undefined
};

test.beforeEach((t) => {
	normalizerStub = sinon.stub(normalizer, "generateProjectTree");
	builderStub = sinon.stub(builder, "build").returns(Promise.resolve());
	sinon.stub(logger, "setShowProgress");
});

test.afterEach.always((t) => {
	sinon.restore();
});

test.serial("ui5 build (default) ", async (t) => {
	normalizerStub.resolves({
		metadata:
		{
			name: "Sample"
		}
	});
	args._ = ["build"];
	await build.handler(args);
	t.deepEqual(builderStub.getCall(0).args[0], defaultBuilderArgs, "default build triggered with expected arguments");
});

test.serial("ui5 build dev", async (t) => {
	normalizerStub.resolves({
		metadata:
		{
			name: "Sample"
		}
	});
	args._ = ["build", "dev"];
	await build.handler(args);
	t.deepEqual(
		builderStub.getCall(0).args[0],
		Object.assign({}, defaultBuilderArgs, {dev: true}),
		"Dev build called with expected arguments"
	);
});

test.serial("ui5 build self-contained", async (t) => {
	normalizerStub.resolves({
		metadata:
		{
			name: "Sample"
		}
	});
	args._ = ["build", "self-contained"];
	await build.handler(args);
	t.deepEqual(
		builderStub.getCall(0).args[0],
		Object.assign({}, defaultBuilderArgs, {selfContained: true}),
		"Self-contained build called with expected arguments"
	);
});

test.serial("ui5 build jsdoc", async (t) => {
	normalizerStub.resolves({
		metadata:
		{
			name: "Sample"
		}
	});
	args._ = ["build", "jsdoc"];
	await build.handler(args);
	t.deepEqual(
		builderStub.getCall(0).args[0],
		Object.assign({}, defaultBuilderArgs, {jsdoc: true}),
		"JSDoc build called with expected arguments"
	);
});
