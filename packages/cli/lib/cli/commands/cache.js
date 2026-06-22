import chalk from "chalk";
import path from "node:path";
import process from "node:process";
import baseMiddleware from "../middlewares/base.js";
import {resolveUi5DataDir} from "@ui5/project/utils/dataDir";
import {getLockDir, hasActiveLocks} from "@ui5/project/utils/lock";
import * as frameworkCache from "@ui5/project/ui5Framework/cache";
import CacheManager from "@ui5/project/build/cache/CacheManager";

const cacheCommand = {
	command: "cache",
	describe: "Manage the UI5 CLI cache (downloaded framework packages and build data)",
	middlewares: [baseMiddleware],
	handler: handleCache
};

cacheCommand.builder = function(cli) {
	return cli
		.demandCommand(1, "Command required. Available command is 'clean'")
		.command("clean", "Remove all cached UI5 data", {
			handler: handleCache,
			builder: function(yargs) {
				return yargs
					.option("yes", {
						alias: "y",
						describe: "Skip the confirmation prompt, e.g. for use in CI pipelines",
						default: false,
						type: "boolean",
					})
					.example("$0 cache clean",
						"Remove all cached UI5 data after confirming the prompt")
					.example("$0 cache clean --yes",
						"Remove all cached UI5 data without confirmation (e.g. in CI)")
					.example("UI5_DATA_DIR=/custom/path $0 cache clean",
						"Remove cached data from a non-default UI5 data directory")
					.epilogue(
						"The cache is stored in the UI5 data directory (default: ~/.ui5).\n" +
						"Override the location with the UI5_DATA_DIR environment variable or\n" +
						"the 'ui5DataDir' configuration option (see 'ui5 config --help').\n\n" +
						"Two cache types are removed:\n" +
						"  UI5 Framework packages  Downloaded UI5 library files " +
							"(~/.ui5/framework/)\n" +
						"  Build cache (DB)        build data " +
							"(~/.ui5/buildCache/)"
					);
			},
			middlewares: [baseMiddleware],
		});
};

const LABEL_FRAMEWORK = "UI5 Framework packages";
const LABEL_BUILD = "Build cache (DB)";
// Pad labels to equal width for two-column alignment
const LABEL_WIDTH = Math.max(LABEL_FRAMEWORK.length, LABEL_BUILD.length);

/**
 * Format a byte size as a human-readable string.
 *
 * @param {number} bytes Size in bytes
 * @returns {string} Formatted size string
 */
function formatSize(bytes) {
	if (bytes < 1024) {
		return `${bytes} B`;
	} else if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	} else if (bytes < 1024 * 1024 * 1024) {
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Format framework cache stats as a human-readable detail string.
 * E.g. "1,189 versions of 155 libraries" or "1 version of 1 library".
 *
 * @param {number} libraryCount
 * @param {number} versionCount
 * @returns {string}
 */
function formatFrameworkStats(libraryCount, versionCount) {
	const v = `${versionCount.toLocaleString("en-US")} ${versionCount === 1 ? "version" : "versions"}`;
	const l = `${libraryCount.toLocaleString("en-US")} ${libraryCount === 1 ? "library" : "libraries"}`;
	return `${v} of ${l}`;
}

/**
 * Pad a label to the shared column width.
 *
 * @param {string} label
 * @returns {string}
 */
function padLabel(label) {
	return label.padEnd(LABEL_WIDTH);
}

async function handleCache(argv) {
	// Resolve UI5 data directory — uses the same resolution chain as ui5 build/serve:
	// UI5_DATA_DIR env var → ui5DataDir config (~/.ui5rc) → default ~/.ui5
	// Relative paths are resolved against process.cwd() (project root when invoked from the project).
	const ui5DataDir = await resolveUi5DataDir();

	// Abort early if a lock is active — before prompting the user
	if (await hasActiveLocks(getLockDir(ui5DataDir))) {
		process.stderr.write(
			`${chalk.red("Error:")} A UI5 server or build process is currently running. ` +
			"Cannot clean the cache while it is in use. " +
			"Please stop all running 'ui5 serve' or wait for 'ui5 build' processes to finish.\n"
		);
		process.exitCode = 1;
		return;
	}

	// Inform the user immediately — getPackageStats may take a moment on a large cache
	process.stderr.write(`Checking cache at ${chalk.bold(ui5DataDir)} …\n`);

	// Check what items exist before cleaning (orchestrate both domains)
	const frameworkInfo = await frameworkCache.getCacheInfo(ui5DataDir);
	const buildInfo = await CacheManager.getCacheInfo(ui5DataDir);

	if (!frameworkInfo && !buildInfo) {
		process.stderr.write("Nothing to clean\n");
		return;
	}

	// Compute absolute paths once — producers return relative sub-path segments
	const frameworkAbsPath = frameworkInfo ? path.join(ui5DataDir, frameworkInfo.path) : null;
	const buildAbsPath = buildInfo ? path.join(ui5DataDir, buildInfo.path) : null;

	// Capture build size now — reused for the ✓ line to avoid a before/after mismatch
	// (getDatabaseSize ≠ VACUUM-freed bytes returned by clearAllRecords)
	const buildPreSize = buildInfo?.size ?? 0;

	// Display items that will be removed
	process.stderr.write(chalk.bold("\nThe following cached data will be removed:\n\n"));
	if (frameworkInfo) {
		const detail = formatFrameworkStats(frameworkInfo.libraryCount, frameworkInfo.versionCount);
		process.stderr.write(
			`  ${chalk.yellow("•")} ${padLabel(LABEL_FRAMEWORK)}   ${frameworkAbsPath}   (${detail})\n`
		);
	}
	if (buildInfo) {
		const detail = buildPreSize > 0 ? formatSize(buildPreSize) : "";
		process.stderr.write(
			`  ${chalk.yellow("•")} ${padLabel(LABEL_BUILD)}   ${buildAbsPath}   (${detail})\n`
		);
	}
	process.stderr.write("\n");

	// Ask for confirmation (skip with --yes)
	if (!argv.yes) {
		const {default: yesno} = await import("yesno");
		const confirmed = await yesno({
			question: "Do you want to continue? (y/N)",
			defaultValue: false
		});
		if (!confirmed) {
			process.stderr.write("Cancelled\n");
			return;
		}
	}

	// Perform the actual cleanup (orchestrate both domains)
	const frameworkResult = await frameworkCache.cleanCache(ui5DataDir);
	const buildResult = await CacheManager.cleanCache(ui5DataDir);

	process.stderr.write("\n");
	if (frameworkResult) {
		const detail = formatFrameworkStats(frameworkResult.libraryCount, frameworkResult.versionCount);
		process.stderr.write(
			`${chalk.green("✓")} Removed ${chalk.bold(LABEL_FRAMEWORK)}` +
			`   (${frameworkAbsPath} · ${detail})\n`
		);
	}
	if (buildResult) {
		// Use pre-clean size so the number matches what was shown before confirmation
		const detail = buildPreSize > 0 ? formatSize(buildPreSize) : "";
		process.stderr.write(
			`${chalk.green("✓")} Removed ${chalk.bold(LABEL_BUILD)}` +
			`   (${buildAbsPath}${detail ? ` · ${detail}` : ""})\n`
		);
	}

	// Success summary
	const cleaned = [];
	if (frameworkResult) {
		cleaned.push(LABEL_FRAMEWORK);
	}
	if (buildResult) {
		cleaned.push(LABEL_BUILD);
	}
	process.stderr.write(`\n${chalk.green("Success:")} Cleaned ${cleaned.join(" and ")}\n`);
}

export default cacheCommand;
