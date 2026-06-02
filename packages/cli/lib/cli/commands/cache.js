import chalk from "chalk";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import baseMiddleware from "../middlewares/base.js";
import Configuration from "@ui5/project/config/Configuration";
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

async function handleCache(argv) {
	// Resolve UI5 data directory
	let ui5DataDir = process.env.UI5_DATA_DIR;
	if (!ui5DataDir) {
		const config = await Configuration.fromFile();
		ui5DataDir = config.getUi5DataDir();
	}
	if (ui5DataDir) {
		ui5DataDir = path.resolve(process.cwd(), ui5DataDir);
	} else {
		ui5DataDir = path.join(os.homedir(), ".ui5");
	}

	// Abort early if a framework operation is holding a lock — before prompting the user
	if (await frameworkCache.isFrameworkLocked(ui5DataDir)) {
		process.stderr.write(
			`${chalk.red("Error:")} Framework cache is currently locked by an active operation. ` +
			"Please wait for it to finish and try again.\n"
		);
		process.exitCode = 1;
		return;
	}

	// Check what items exist before cleaning (orchestrate both domains)
	const items = [];
	const frameworkInfo = await frameworkCache.getCacheInfo(ui5DataDir);
	if (frameworkInfo) {
		items.push(frameworkInfo);
	}
	const buildInfo = await CacheManager.getCacheInfo(ui5DataDir);
	if (buildInfo) {
		items.push(buildInfo);
	}

	if (items.length === 0) {
		process.stderr.write("Nothing to clean\n");
		return;
	}

	// Display items that will be removed
	process.stderr.write(chalk.bold("\nThe following items from cache will be removed:\n"));
	let totalSize = 0;
	for (const item of items) {
		totalSize += item.size;
		const sizeStr = item.size > 0 ? ` (${formatSize(item.size)})` : "";
		process.stderr.write(`  ${chalk.yellow("•")} ${item.path}${sizeStr}\n`);
	}
	process.stderr.write(chalk.bold(`\nTotal: ${formatSize(totalSize)}\n\n`));

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
	const removed = [];
	const frameworkResult = await frameworkCache.cleanCache(ui5DataDir);
	if (frameworkResult) {
		removed.push(frameworkResult);
	}
	const buildResult = await CacheManager.cleanCache(ui5DataDir);
	if (buildResult) {
		removed.push(buildResult);
	}

	process.stderr.write("\n");
	for (const entry of removed) {
		const sizeStr = entry.size > 0 ? ` (${formatSize(entry.size)})` : "";
		process.stderr.write(`${chalk.green("✓")} Removed ${chalk.bold(entry.path)}${sizeStr}\n`);
	}

	const totalRemoved = removed.reduce((sum, entry) => sum + entry.size, 0);
	process.stderr.write(
		`\n${chalk.green("Success:")} Cleaned ${removed.length} ${removed.length === 1 ? "entry" : "entries"}` +
		(totalRemoved > 0 ? `, freed ${formatSize(totalRemoved)}` : "") + "\n"
	);
}

export default cacheCommand;
