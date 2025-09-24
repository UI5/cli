import yargs from "yargs";
import {hideBin} from "yargs/helpers";
import {setVersion} from "./version.js";
import base from "./base.js";
import {fileURLToPath} from "node:url";
import {readdir} from "node:fs/promises";

async function getCommands() {
	return (await readdir(new URL("./commands", import.meta.url), {withFileTypes: true}))
		.filter((e) => !e.isDirectory() && e.name.endsWith(".js"))
		.map((e) => new URL(`./commands/${e.name}`, import.meta.url));
}

export default async (pkg) => {
	// Only import update-notifier when it's not disabled
	// See https://github.com/yeoman/update-notifier/blob/3046d0f61a57f8270291b6ab271f8a12df8421a6/update-notifier.js#L57-L60
	// The "is-ci" check is not executed, but will be checked by update-notifier itself then
	const NO_UPDATE_NOTIFIER = "--no-update-notifier";
	const disableUpdateNotifier =
			"NO_UPDATE_NOTIFIER" in process.env ||
			process.env.NODE_ENV === "test" ||
			process.argv.includes(NO_UPDATE_NOTIFIER);

	if (!disableUpdateNotifier) {
		const {default: updateNotifier} = await import("update-notifier");
		updateNotifier({
			pkg,
			updateCheckInterval: 86400000, // 1 day
			shouldNotifyInNpmScript: true
		}).notify();
	}

	// Remove --no-update-notifier from argv as it's not known to yargs, but we still want to support using it
	if (process.argv.includes(NO_UPDATE_NOTIFIER)) {
		process.argv = process.argv.filter((v) => v !== NO_UPDATE_NOTIFIER);
	}

	const cli = yargs(hideBin(process.argv));
	cli.parserConfiguration({
		"parse-numbers": false
	});

	// Explicitly set CLI version as the yargs default might
	// be wrong in case a local CLI installation is used
	// Also add CLI location
	const ui5JsPath = fileURLToPath(new URL("../../bin/ui5.cjs", import.meta.url));
	const pkgVersion = `${pkg.version} (from ${ui5JsPath})`;

	setVersion(pkgVersion);
	cli.version(pkgVersion);

	// Explicitly set script name to prevent windows from displaying "ui5.js"
	cli.scriptName("ui5");

	// Setup general options and error handling
	base(cli);

	// CLI modules
	// YError: loading a directory of commands is not supported yet for ESM
	// cli.commandDir("../lib/cli/commands");
	// See https://github.com/yargs/yargs/issues/2152
	const commandModules = await getCommands();
	for (const modulePath of commandModules) {
		const {default: command} = await import(modulePath);
		cli.command(command);
	}

	// Format terminal output to full available width
	cli.wrap(cli.terminalWidth());

	// yargs registers a get method on the argv property.
	// The property needs to be accessed to initialize everything.
	cli.argv;
};
