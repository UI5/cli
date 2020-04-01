#!/usr/bin/env node

// The following block should be compatible to as many Node.js versions as possible
/* eslint-disable no-var */
var pkg = require("../package.json");
var semver = require("semver");
var nodeVersion = process.version;
/* eslint-enable no-var */
if (pkg.engines && pkg.engines.node && !semver.satisfies(nodeVersion, pkg.engines.node)) {
	console.log("==================== UNSUPPORTED NODE.JS VERSION ====================");
	console.log("You are using an unsupported version of Node.js");
	console.log("Detected version " + nodeVersion + " but " + pkg.name + " requires " + pkg.engines.node);
	console.log("");
	console.log("=> Please upgrade to a supported version of Node.js to use this tool");
	console.log("=====================================================================");
	process.exit(1);
}

// Timeout is required to log info when importing from local installation
setTimeout(() => {
	if (!process.env.UI5_CLI_NO_LOCAL) {
		const importLocal = require("import-local");
		// Prefer a local installation of @ui5/cli.
		// This will invoke the local CLI, so no further action required
		if (importLocal(__filename)) {
			if (process.argv.includes("--verbose")) {
				console.info(`INFO: This project contains an individual ${pkg.name} installation which ` +
					"will be used over the global one.");
				console.info("See https://github.com/SAP/ui5-cli#local-vs-global-installation for details.");
				console.info("");
			} else {
				console.info(`INFO: Using local ${pkg.name} installation`);
				console.info("");
			}
			return;
		}
	}

	const updateNotifier = require("update-notifier");
	const cli = require("yargs");

	updateNotifier({
		pkg,
		updateCheckInterval: 1000 * 60 * 60 * 24, // 1 day
		shouldNotifyInNpmScript: true
	}).notify();

	cli.parserConfiguration({
		"parse-numbers": false
	});

	// Explicitly set CLI version as the yargs default might
	// be wrong in case a local CLI installation is used
	// Also add CLI location
	const version = `${pkg.version} (from ${__filename})`;
	require("../lib/cli/version").set(version);
	cli.version(version);

	// Explicitly set script name to prevent windows from displaying "ui5.js"
	cli.scriptName("ui5");

	// CLI modules
	cli.commandDir("../lib/cli/commands");

	// Format terminal output to full available width
	cli.wrap(cli.terminalWidth());

	// yargs registers a get method on the argv property.
	// The property needs to be accessed to initialize everything.
	cli.argv;
}, 0);
