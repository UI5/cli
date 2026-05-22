import chalk from "chalk";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import baseMiddleware from "../middlewares/base.js";
import Configuration from "@ui5/project/config/Configuration";
import {cleanCache} from "@ui5/project/cache/CacheCleanup";

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
			builder: noop,
			middlewares: [baseMiddleware],
		})
		.example("$0 cache clean",
			"Remove all cached UI5 data");
};

function noop() {}

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

async function handleCache() {
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

	const result = await cleanCache({ui5DataDir});

	if (result.totalCount === 0) {
		process.stderr.write("Nothing to clean\n");
		return;
	}

	for (const entry of result.entries) {
		const sizeStr = entry.size > 0 ? ` (${formatSize(entry.size)})` : "";
		process.stderr.write(`Removed ${chalk.bold(entry.path)}${sizeStr}\n`);
	}

	process.stderr.write(
		`\nCleaned ${result.totalCount} ${result.totalCount === 1 ? "entry" : "entries"}` +
		(result.totalSize > 0 ? `, freed ${formatSize(result.totalSize)}` : "") + "\n"
	);
}

export default cacheCommand;
