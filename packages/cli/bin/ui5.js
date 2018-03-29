#!/usr/bin/env node
const cli = require("yargs");

// CLI modules
cli.commandDir("../lib/cli/commands");

// Format terminal output to full available width
cli.wrap(cli.terminalWidth());

// yargs registers a get method on the argv property.
// The property needs to be accessed to initialize everything.
cli.argv;
