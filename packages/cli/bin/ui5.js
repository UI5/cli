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

const updateNotifier = require("update-notifier");
const cli = require("yargs");

updateNotifier({
	pkg,
	updateCheckInterval: 1000 * 60 * 60 * 24, // 1 day
	shouldNotifyInNpmScript: true
}).notify();

// CLI modules
cli.commandDir("../lib/cli/commands");

// Format terminal output to full available width
cli.wrap(cli.terminalWidth());

// yargs registers a get method on the argv property.
// The property needs to be accessed to initialize everything.
cli.argv;
