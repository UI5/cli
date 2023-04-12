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
			console.log("==================== UNSUPPORTED NODE.JS VERSION ====================");
			console.log("You are using an unsupported version of Node.js");
			console.log("Detected version " + nodeVersion + " but " + pkg.name + " requires " + pkg.engines.node);
			console.log("");
			console.log("=> Please upgrade to a supported version of Node.js to use this tool");
			console.log("=====================================================================");
			return false;
		}

		if (semver && semver.prerelease(nodeVersion)) {
			console.log("====================== UNSTABLE NODE.JS VERSION =====================");
			console.log("You are using an unstable version of Node.js");
			console.log("Detected Node.js version " + nodeVersion);
			console.log("");
			console.log("=> Please note that an unstable version might cause unexpected");
			console.log("   behavior. For productive use please consider using a stable");
			console.log("   version of Node.js! For the release policy of Node.js, see");
			console.log("   https://nodejs.org/en/about/releases");
			console.log("=====================================================================");
		}

		return true;
	},

	async invokeLocalInstallation(pkg) {
		if (process.env.UI5_CLI_NO_LOCAL) {
			return false;
		}
		// Prefer a local installation of @ui5/cli.
		// This will invoke the local CLI, so no further action required
		// NOTE: Using ui5.js, NOT ui5.cjs to also support CLI versions < v3.
		//       Starting with v3, both extensions can be used (see package.json "exports").
		const {default: importLocal} = await import("import-local");
		const ui5Local = importLocal(path.join(__dirname, "ui5.js"));
		if (!ui5Local || ui5Local === module.exports) {
			// Either no local installation found or this script is the local installation
			// (invocation within ui5-cli repo)
			return false;
		}
		if (process.argv.includes("--verbose")) {
			console.info(`INFO: This project contains an individual ${pkg.name} installation which ` +
			"will be used over the global one.");
			console.info("See https://github.com/SAP/ui5-cli#local-vs-global-installation for details.");
			console.info("");
		} else {
			console.info(`INFO: Using local ${pkg.name} installation`);
			console.info("");
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
		console.log("Fatal Error: Unable to initialize UI5 CLI");
		console.log(err);
		process.exit(1);
	});
}
