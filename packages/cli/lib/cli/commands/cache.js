import chalk from "chalk";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import baseMiddleware from "../middlewares/base.js";
import {getUi5DataDir} from "../../framework/utils.js";
import * as frameworkCache from "@ui5/project/ui5Framework/cache";
import CacheManager from "@ui5/project/build/cache/CacheManager";

const cacheCommand = {
	command: "cache",
	describe: "Manage UI5 CLI cache",
	middlewares: [baseMiddleware],
	handler: handleCache
};

cacheCommand.builder = function(cli) {
	return cli
		.demandCommand(1, "Command required. Available command is 'clean'")
		.command("clean", "Remove all cached UI5 data", {
			handler: handleCache,
			builder: function(yargs) {
				return yargs.option("yes", {
					alias: "y",
					describe: "Skip confirmation prompt (e.g. for CI)",
					default: false,
					type: "boolean",
				});
			},
			middlewares: [baseMiddleware],
		})
		.example("$0 cache clean",
			"Remove all cached UI5 data")
		.example("$0 cache clean --yes",
			"Remove all cached UI5 data without confirmation (CI mode)");
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
 * Format a count with its singular/plural word, e.g. "340 files" or "1 file".
 *
 * @param {number} count
 * @returns {string}
 */
function formatFileCount(count) {
	return `${count} ${count === 1 ? "file" : "files"}`;
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
	const ui5DataDir =
		(await getUi5DataDir({cwd: process.cwd()})) ?? path.join(os.homedir(), ".ui5");

	// Abort early if a framework operation is holding a lock — before prompting the user
	if (await frameworkCache.isFrameworkLocked(ui5DataDir)) {
		process.stderr.write(
			`${chalk.red("Error:")} Framework cache is currently locked by an active operation. ` +
			"Please wait for it to finish and try again.\n"
		);
		process.exitCode = 1;
		return;
	}

	// Inform the user immediately — getCacheInfo (especially countFiles) may take a moment
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
		const detail = formatFileCount(frameworkInfo.count);
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
		const detail = formatFileCount(frameworkResult.count);
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
