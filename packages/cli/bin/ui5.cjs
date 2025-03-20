#!/usr/bin/env node

// NOTE: This file should be compatible to as many Node.js versions as possible
// so that the message for unsupported Node.js versions can be displayed.

const path = require("path");

const ui5 = {

	getPackageJson() {
		return require("../package.json");
	},

	checkRequirements({pkg, nodeVersion}) {
		let semver;
		try {
			semver = require("semver");
		} catch (err) {
			// SyntaxError indicates an outdated Node.js version
			if (err.name !== "SyntaxError") {
				throw err;
			}
		}
		if (
			pkg.engines && pkg.engines.node &&
		(!semver || !semver.satisfies(nodeVersion, pkg.engines.node, {includePrerelease: true}))
		) {
			process.stderr.write("==================== UNSUPPORTED NODE.JS VERSION ====================");
			process.stderr.write("\n");
			process.stderr.write("You are using an unsupported version of Node.js");
			process.stderr.write("\n");
			process.stderr.write("Detected version " + nodeVersion +
				" but " + pkg.name + " requires " + pkg.engines.node);
			process.stderr.write("\n\n");
			process.stderr.write("=> Please upgrade to a supported version of Node.js to use this tool");
			process.stderr.write("\n");
			process.stderr.write("=====================================================================");
			process.stderr.write("\n");
			return false;
		}

		if (semver && semver.prerelease(nodeVersion)) {
			process.stderr.write("====================== UNSTABLE NODE.JS VERSION =====================");
			process.stderr.write("\n");
			process.stderr.write("You are using an unstable version of Node.js");
			process.stderr.write("\n");
			process.stderr.write("Detected Node.js version " + nodeVersion);
			process.stderr.write("\n\n");
			process.stderr.write("=> Please note that an unstable version might cause unexpected");
			process.stderr.write("\n");
			process.stderr.write("   behavior. For productive use please consider using a stable");
			process.stderr.write("\n");
			process.stderr.write("   version of Node.js! For the release policy of Node.js, see");
			process.stderr.write("\n");
			process.stderr.write("   https://nodejs.org/en/about/releases");
			process.stderr.write("\n");
			process.stderr.write("=====================================================================");
			process.stderr.write("\n");
		}

		return true;
	},

	async invokeLocalInstallation(pkg) {
		if (process.env.UI5_CLI_NO_LOCAL) {
			return false;
		}
		// Prefer a local installation of @ui5/cli.
		// This will invoke the local CLI, so no further action required
		const {default: importLocal} = await import("import-local");
		let ui5Local = importLocal(path.join(__dirname, "ui5.cjs"));
		if (!ui5Local) {
			// Fallback to ui5.js (CLI version < v3)
			// NOTE: Entries within package.json "exports" are not respected on Windows,
			// so only checking for ui5.js does not work.
			ui5Local = importLocal(path.join(__dirname, "ui5.js"));
		}
		if (!ui5Local || ui5Local === module.exports) {
			// Either no local installation found or this script is the local installation
			// (invocation within ui5-cli repo)
			return false;
		}
		if (process.argv.includes("--verbose")) {
			process.stderr.write(`INFO: This project contains an individual ${pkg.name} installation which ` +
			"will be used over the global one.");
			process.stderr.write("\n");
			process.stderr.write("See https://github.com/SAP/ui5-cli#local-vs-global-installation for details.");
			process.stderr.write("\n\n");
		} else {
			process.stdout.write(`INFO: Using local ${pkg.name} installation`);
			process.stdout.write("\n\n");
		}
		return true;
	},

	async invokeCLI(pkg) {
		const {default: cli} = await import("../lib/cli/cli.js");
		await cli(pkg);
	},

	async main() {
		const pkg = ui5.getPackageJson();
		if (!ui5.checkRequirements({pkg, nodeVersion: process.version})) {
			process.exit(1);
		} else {
			const localInstallationInvoked = await ui5.invokeLocalInstallation(pkg);
			if (!localInstallationInvoked) {
				await ui5.invokeCLI(pkg);
			}
		}
	}
};

module.exports = ui5;

if (process.env.NODE_ENV !== "test" || process.env.UI5_CLI_TEST_BIN_RUN_MAIN !== "false") {
	ui5.main().catch((err) => {
		process.stderr.write("Fatal Error: Unable to initialize UI5 CLI");
		process.stderr.write("\n");
		process.stderr.write(err);
		process.exit(1);
	});
}
