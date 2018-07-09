#!/usr/bin/env node
const updateNotifier = require("update-notifier");
const cli = require("yargs");
const pkg = require("../package.json");

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
