#!/usr/bin/env node

// The following block should be compatible to as many Node.js versions as possible
// so that the message for unsupported Node.js versions can be displayed
import semver from "semver";
import {readFileSync} from "fs";

const pkgJsonPath = new URL("../package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(pkgJsonPath));

const nodeVersion = process.version;
/* eslint-enable no-var */
if (
	pkg.engines && pkg.engines.node &&
	!semver.satisfies(nodeVersion, pkg.engines.node, {includePrerelease: true})
) {
	console.log("==================== UNSUPPORTED NODE.JS VERSION ====================");
	console.log("You are using an unsupported version of Node.js");
	console.log("Detected version " + nodeVersion + " but " + pkg.name + " requires " + pkg.engines.node);
	console.log("");
	console.log("=> Please upgrade to a supported version of Node.js to use this tool");
	console.log("=====================================================================");
	process.exit(1);
} else {
	if (semver.prerelease(nodeVersion)) {
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
	// Timeout is required to log info when importing from local installation
	setTimeout(async () => {
		if (!process.env.UI5_CLI_NO_LOCAL) {
			const {default: importLocal} = await import("import-local");
			// Prefer a local installation of @ui5/cli.
			// This will invoke the local CLI, so no further action required
			if (importLocal(import.meta.url)) {
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
		const {default: cli} = await import("../lib/cli/cli.js");
		await cli(pkg).catch((err) => {
			console.log("Fatal Error: Unable to initialize UI5 CLI");
			console.log(err);
			process.exit(1);
		});
	}, 0);
}
