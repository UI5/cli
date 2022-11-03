import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import {fileURLToPath} from "node:url";

test.beforeEach(async (t) => {
	t.context.updateNotifierNotify = sinon.stub();
	t.context.updateNotifier = sinon.stub().returns({
		notify: t.context.updateNotifierNotify
	}).named("updateNotifier");

	t.context.argvGetter = sinon.stub();
	t.context.yargsInstance = {
		parserConfiguration: sinon.stub(),
		version: sinon.stub(),
		scriptName: sinon.stub(),
		command: sinon.stub(),
		terminalWidth: sinon.stub().returns(123),
		wrap: sinon.stub(),
		get argv() {
			t.context.argvGetter();
			return undefined;
		}
	};

	t.context.yargs = sinon.stub().returns(t.context.yargsInstance).named("yargs");

	t.context.setVersion = sinon.stub().named("setVersion");
	t.context.cliBase = sinon.stub().named("cliBase");

	t.context.readdir = sinon.stub().resolves([
		{
			isDirectory: sinon.stub().returns(false),
			name: "build.js"
		},
		{
			isDirectory: sinon.stub().returns(false),
			name: "serve.js"
		},
		{
			// Directory should be filtered out
			isDirectory: sinon.stub().returns(true),
			name: "someDir"
		},
		{
			// Non-js files should be filtered out
			isDirectory: sinon.stub().returns(false),
			name: ".DS_Store"
		}
	]);

	t.context.cli = await esmock.p("../../../lib/cli/cli.js", {
		"update-notifier": t.context.updateNotifier,
		"yargs": t.context.yargs,
		// TODO: Somehow esmock is unable to mock this import
		// "yargs/helpers": {
		// 	hideBin: t.context.yargsHideBin
		// },
		"../../../lib/cli/version.js": {
			setVersion: t.context.setVersion
		},
		"../../../lib/cli/base.js": t.context.cliBase,
		"node:fs/promises": {
			readdir: t.context.readdir
		},
	});
});

test.afterEach.always((t) => {
	sinon.restore();
	esmock.purge(t.context.cli);
});

test.serial("CLI", async (t) => {
	const {
		cli, updateNotifier, updateNotifierNotify, argvGetter, yargsInstance, yargs,
		setVersion, cliBase
	} = t.context;

	const pkg = {
		version: "0.0.0-test"
	};

	await cli(pkg);

	t.is(updateNotifier.callCount, 1);
	t.deepEqual(updateNotifier.getCall(0).args, [{pkg, shouldNotifyInNpmScript: true, updateCheckInterval: 86400000}]);

	t.is(updateNotifierNotify.callCount, 1);
	t.deepEqual(updateNotifierNotify.getCall(0).args, []);

	t.is(yargs.callCount, 1);
	t.deepEqual(yargs.getCall(0).args, [[]]);

	t.is(yargsInstance.parserConfiguration.callCount, 1);
	t.deepEqual(yargsInstance.parserConfiguration.getCall(0).args, [{
		"parse-numbers": false
	}]);

	t.is(setVersion.callCount, 1);
	t.deepEqual(setVersion.getCall(0).args, [
		`0.0.0-test (from ${fileURLToPath(new URL("../../../bin/ui5.cjs", import.meta.url))})`
	]);

	t.is(yargsInstance.version.callCount, 1);
	t.deepEqual(yargsInstance.version.getCall(0).args, [
		`0.0.0-test (from ${fileURLToPath(new URL("../../../bin/ui5.cjs", import.meta.url))})`
	]);

	t.is(yargsInstance.scriptName.callCount, 1);
	t.deepEqual(yargsInstance.scriptName.getCall(0).args, ["ui5"]);

	t.is(cliBase.callCount, 1);
	t.deepEqual(cliBase.getCall(0).args, [yargsInstance]);

	t.is(yargsInstance.command.callCount, 2);
	t.is(yargsInstance.command.getCall(0).args.length, 1);
	t.is(yargsInstance.command.getCall(0).args[0].command, "build");
	t.is(yargsInstance.command.getCall(1).args.length, 1);
	t.is(yargsInstance.command.getCall(1).args[0].command, "serve");

	t.is(yargsInstance.terminalWidth.callCount, 1);
	t.deepEqual(yargsInstance.terminalWidth.getCall(0).args, []);

	t.is(yargsInstance.wrap.callCount, 1);
	t.deepEqual(yargsInstance.wrap.getCall(0).args, [123]);

	t.is(argvGetter.callCount, 1);
	t.deepEqual(argvGetter.getCall(0).args, []);

	sinon.assert.callOrder(
		updateNotifier,
		updateNotifierNotify,
		yargs,
		yargsInstance.parserConfiguration,
		setVersion,
		yargsInstance.version,
		yargsInstance.scriptName,
		cliBase,
		yargsInstance.command,
		yargsInstance.terminalWidth,
		yargsInstance.wrap,
		argvGetter
	);
});
