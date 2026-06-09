import chalk from "chalk";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import baseMiddleware from "../middlewares/base.js";
import {getUi5DataDir} from "../../framework/utils.js";
import * as frameworkCache from "@ui5/project/ui5Framework/cache";
import CacheManager from "@ui5/project/build/cache/CacheManager";
import prettyHrtime from "pretty-hrtime";

const cacheCommand = {
	command: "cache",
	describe: "Manage the UI5 CLI cache (downloaded framework packages and incremental build data)",
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
						"Remove cached data from a non-default UI5 data directory");
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
 * Format a library stats detail string, e.g. "2 projects, 3 libraries, 4 versions".
 * Each word is independently singular/plural.
 *
 * @param {number} libraryCount
 * @param {number} projectCount
 * @param {number} versionCount
 * @returns {string}
 */
function formatLibraryStats(libraryCount, projectCount, versionCount) {
	const p = `${projectCount} ${projectCount === 1 ? "project" : "projects"}`;
	const l = `${libraryCount} ${libraryCount === 1 ? "library" : "libraries"}`;
	const v = `${versionCount} ${versionCount === 1 ? "version" : "versions"}`;
	return `${p}, ${l}, ${v}`;
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

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const PROGRESS_DEBOUNCE_MS = 150;
// Reserve enough columns for the fixed parts of the progress line so the path
// never causes the line to wrap on a standard 80-column terminal.
const PATH_MAX_COLS = 40;

/**
 * Build a progress handler for framework cache deletion.
 * Returns a function to pass as onProgress to cleanCache(), plus a finalise()
 * to call when deletion completes (clears the in-progress line).
 *
 * The line is written to stderr with \r so it overwrites itself on each tick,
 * producing a single updating line rather than a scrolling log.
 *
 * @param {string} label Short label shown on the progress line
 * @param {Array} startHrtime process.hrtime() snapshot taken when deletion began
 * @param {Function} prettyHrtime Formatting function from the pretty-hrtime package
 * @returns {{onProgress: function(string): void, finalise: function(): void}}
 */
function createProgressHandler(label, startHrtime, prettyHrtime) {
	let lastPrintMs = 0;
	let frameIndex = 0;
	let lastVisibleLen = 0;

	function onProgress(entryPath) {
		const now = Date.now();
		if (now - lastPrintMs < PROGRESS_DEBOUNCE_MS) return;
		lastPrintMs = now;

		const elapsed = prettyHrtime(process.hrtime(startHrtime));
		const spinner = SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length];
		frameIndex++;

		// Trim path so the whole line stays within 80 columns
		let displayPath = entryPath;
		if (displayPath.length > PATH_MAX_COLS) {
			displayPath = "…" + displayPath.slice(-(PATH_MAX_COLS - 1));
		}

		// Build visible text (no ANSI) first to get accurate length for overwrite padding
		const visibleText = `  ${spinner} ${label}   ${displayPath}   ${elapsed}`;
		// Then the styled version for actual output
		const styledText = `  ${spinner} ${label}   ${chalk.dim(displayPath)}   ${elapsed}`;

		// Pad to cover any longer previous line, then overwrite in place
		const padded = styledText + " ".repeat(Math.max(0, lastVisibleLen - visibleText.length));
		lastVisibleLen = visibleText.length;

		process.stderr.write(`\r${padded}`);
	}

	function finalise() {
		process.stderr.write(`\r${" ".repeat(lastVisibleLen)}\r`);
	}

	return {onProgress, finalise};
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
		const detail = formatLibraryStats(
			frameworkInfo.libraryCount, frameworkInfo.projectCount, frameworkInfo.versionCount);
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
	let frameworkResult;
	if (frameworkInfo) {
		const startHrtime = process.hrtime();
		const {onProgress, finalise} = createProgressHandler(LABEL_FRAMEWORK, startHrtime, prettyHrtime);
		try {
			frameworkResult = await frameworkCache.cleanCache(ui5DataDir, onProgress);
		} finally {
			finalise();
		}
	}
	const buildResult = await CacheManager.cleanCache(ui5DataDir);

	process.stderr.write("\n");
	if (frameworkResult) {
		const detail = formatLibraryStats(
			frameworkResult.libraryCount, frameworkResult.projectCount, frameworkResult.versionCount);
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
