import chalk from "chalk";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import baseMiddleware from "../middlewares/base.js";
import Configuration from "@ui5/project/config/Configuration";
import FrameworkCache from "@ui5/project/ui5Framework/cache";
import CacheManager from "@ui5/project/build/cache/CacheManager";

const LABEL_FRAMEWORK = "UI5 Framework packages";
const LABEL_BUILD = "Build cache (Db)";
const LABEL_ORPHANED_FRAMEWORK = "Orphaned UI5 Framework packages";
const LABEL_ORPHANED_BUILD = "Orphaned build cache (Db)";
const CACHE_CLEAN_WARNING =
	"Only run ui5 cache clean when no UI5 CLI process and no @ui5/* API consumer is actively running.";
const CACHE_CLEAN_WARNING_IMPACT =
	"Running ui5 cache clean while ui5 build or ui5 serve is in progress can break the running process " +
	"and lead to failed or inconsistent results.";
const CACHE_CLEAN_HELP_USAGE =
	`WARNING: ${CACHE_CLEAN_WARNING}\n${CACHE_CLEAN_WARNING_IMPACT}\n\nUsage: ui5 cache clean [options]`;
// Pad main labels to equal width for two-column alignment (orphaned labels are bold headers, not padded)
const LABEL_WIDTH = Math.max(LABEL_FRAMEWORK.length, LABEL_BUILD.length);

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
					.usage(CACHE_CLEAN_HELP_USAGE)
					.option("yes", {
						alias: "y",
						describe: "Skip the confirmation prompt, e.g. for use in CI pipelines",
						default: false,
						type: "boolean",
					})
					.example("$0 cache clean",
						"Remove all cached UI5 data after confirmation")
					.example("$0 cache clean --yes",
						"Remove all cached UI5 data without confirmation (e.g. in CI scenarios)")
					.example("UI5_DATA_DIR=/custom/path $0 cache clean",
						"Remove cached data from a non-default UI5 data directory");
			},
			middlewares: [baseMiddleware],
		});
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

function displayCacheCleanWarning() {
	process.stderr.write(`${chalk.bold.yellow("Warning:")} ${chalk.italic(CACHE_CLEAN_WARNING)}\n`);
	process.stderr.write(`${chalk.italic(CACHE_CLEAN_WARNING_IMPACT)}\n\n`);
}

/**
 * Display information about the cached data that will be removed,
 * including the absolute paths and details about the framework and build caches.
 * Orphaned entries (from previously interrupted cleans) are shown as separate
 * items only when present.
 *
 * @param {object} data
 * @param {object|null} data.frameworkInfo
 * @param {object|null} data.buildInfo
 * @param {string|null} data.frameworkAbsPath
 * @param {string|null} data.buildAbsPath
 * @param {number} data.buildPreSize
 * @param {Array<{absPath: string, libraryCount: number, versionCount: number}>} data.orphanedInfo
 * @param {Array<{absPath: string, size: number}>} data.buildAdditionalInfo
 */
async function displayCacheInfo({
	frameworkInfo,
	buildInfo,
	frameworkAbsPath,
	buildAbsPath,
	buildPreSize,
	orphanedInfo,
	buildAdditionalInfo,
}) {
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
			`  ${chalk.yellow("•")} ${padLabel(LABEL_BUILD)}   ${buildAbsPath}${detail ? `   (${detail})` : ""}\n`
		);
	}
	if (orphanedInfo?.length > 0) {
		process.stderr.write(
			`  ${chalk.yellow("•")} ${chalk.bold(LABEL_ORPHANED_FRAMEWORK)}\n`
		);
		for (const orphan of orphanedInfo) {
			const detail = formatFrameworkStats(orphan.libraryCount, orphan.versionCount);
			process.stderr.write(`      ${chalk.dim(orphan.absPath)}   (${detail})\n`);
		}
	}
	if (buildAdditionalInfo?.length > 0) {
		process.stderr.write(
			`  ${chalk.yellow("•")} ${chalk.bold(LABEL_ORPHANED_BUILD)}\n`
		);
		for (const entry of buildAdditionalInfo) {
			const detail = entry.size > 0 ? formatSize(entry.size) : "";
			process.stderr.write(`      ${chalk.dim(entry.absPath)}${detail ? `   (${detail})` : ""}\n`);
		}
	}
	process.stderr.write("\n");
}

/**
 * Display the result of the cache cleanup operation.
 * Orphaned entries are shown as separate items only when present.
 *
 * @param {object} data
 * @param {{libraryCount: number, versionCount: number}|null} data.frameworkResult
 * @param {object|null} data.buildResult
 * @param {string|null} data.frameworkAbsPath
 * @param {string|null} data.buildAbsPath
 * @param {number} data.buildPreSize
 * @param {Array<{absPath: string, libraryCount: number, versionCount: number}>} data.orphanedInfoWithAbsPaths
 * @param {Array<{absPath: string, size: number}>} data.buildAdditionalResult
 */
async function displayCleanupResult({
	frameworkResult,
	buildResult,
	frameworkAbsPath,
	buildAbsPath,
	buildPreSize,
	orphanedInfoWithAbsPaths,
	buildAdditionalResult,
}) {
	process.stderr.write("\n");
	if (frameworkResult && frameworkAbsPath) {
		const detail = formatFrameworkStats(frameworkResult.libraryCount, frameworkResult.versionCount);
		process.stderr.write(
			`${chalk.green("✓")} Removed ${chalk.bold(LABEL_FRAMEWORK)}` +
			`   (${frameworkAbsPath} · ${detail})\n`
		);
	}
	if (buildResult) {
		const detail = buildPreSize > 0 ? formatSize(buildPreSize) : "";
		process.stderr.write(
			`${chalk.green("✓")} Removed ${chalk.bold(LABEL_BUILD)}` +
			`   (${buildAbsPath}${detail ? ` · ${detail}` : ""})\n`
		);
	}
	if (orphanedInfoWithAbsPaths?.length > 0) {
		process.stderr.write(`${chalk.green("✓")} Removed ${chalk.bold(LABEL_ORPHANED_FRAMEWORK)}\n`);
		for (const orphan of orphanedInfoWithAbsPaths) {
			const detail = formatFrameworkStats(orphan.libraryCount, orphan.versionCount);
			process.stderr.write(`    ${chalk.dim(orphan.absPath)}   (${detail})\n`);
		}
	}
	if (buildAdditionalResult?.length > 0) {
		process.stderr.write(`${chalk.green("✓")} Removed ${chalk.bold(LABEL_ORPHANED_BUILD)}\n`);
		for (const entry of buildAdditionalResult) {
			const detail = entry.size > 0 ? formatSize(entry.size) : "";
			process.stderr.write(`    ${chalk.dim(entry.absPath)}${detail ? `   (freed ${detail})` : ""}\n`);
		}
	}

	// Success summary
	const cleaned = [];
	if (frameworkResult) {
		cleaned.push(LABEL_FRAMEWORK);
	}
	if (buildResult) {
		cleaned.push(LABEL_BUILD);
	}
	if (orphanedInfoWithAbsPaths?.length > 0) {
		cleaned.push(LABEL_ORPHANED_FRAMEWORK);
	}
	if (buildAdditionalResult?.length > 0) {
		cleaned.push(LABEL_ORPHANED_BUILD);
	}
	process.stderr.write(`\n${chalk.green("Success:")} Cleaned ${cleaned.join(" and ")}\n`);
}

/**
 * Prompt the user for confirmation before proceeding with cache cleanup.
 *
 * @param {Yargs.Arguments} argv
 * @returns {Promise<boolean>} Confirmation result
 */
async function getConfirmation(argv) {
	if (argv.yes) {
		return true;
	}
	displayCacheCleanWarning();
	const {default: yesno} = await import("yesno");
	return yesno({
		question: "Do you want to continue? (y/N)",
		defaultValue: false
	});
}

async function resolveCacheUi5DataDir() {
	// TODO: Consolidate ui5DataDir resolution once PR #1456 follow-up cleanup is done.
	// Keep behavior aligned with existing main-branch resolution order.
	let ui5DataDir = process.env.UI5_DATA_DIR;
	if (!ui5DataDir) {
		const config = await Configuration.fromFile();
		ui5DataDir = config.getUi5DataDir();
	}
	if (ui5DataDir) {
		return path.resolve(process.cwd(), ui5DataDir);
	}
	return path.join(os.homedir(), ".ui5");
}

async function handleCache(argv) {
	const ui5DataDir = await resolveCacheUi5DataDir();

	process.stderr.write(`Checking cache at ${chalk.bold(ui5DataDir)} …\n`);

	const [frameworkInfo, orphanedInfo, buildInfo, buildAdditionalInfo] = await Promise.all([
		FrameworkCache.getCacheInfo(ui5DataDir),
		FrameworkCache.getAdditionalCacheInfo(ui5DataDir),
		CacheManager.getCacheInfo(ui5DataDir),
		CacheManager.getAdditionalCacheInfo(ui5DataDir),
	]);

	if (!frameworkInfo && !buildInfo && orphanedInfo.length === 0 && buildAdditionalInfo.length === 0) {
		process.stderr.write("Nothing to clean\n");
		return;
	}

	// Compute absolute paths once — producers return relative sub-path segments
	const frameworkAbsPath = frameworkInfo ? path.join(ui5DataDir, frameworkInfo.path) : null;
	const buildAbsPath = buildInfo ? path.join(ui5DataDir, buildInfo.path) : null;
	const buildPreSize = buildInfo?.size ?? 0;
	const preCleanOrphanedInfo = orphanedInfo.map(
		(o) => ({...o, absPath: path.join(ui5DataDir, o.path)})
	);
	const preCleanBuildAdditionalInfo = buildAdditionalInfo.map(
		(o) => ({...o, absPath: path.join(ui5DataDir, o.path)})
	);

	await displayCacheInfo({
		frameworkInfo,
		buildInfo,
		frameworkAbsPath,
		buildAbsPath,
		buildPreSize,
		orphanedInfo: preCleanOrphanedInfo,
		buildAdditionalInfo: preCleanBuildAdditionalInfo,
	});

	const confirmed = await getConfirmation(argv);
	if (!confirmed) {
		process.stderr.write("Cancelled\n");
		return;
	}

	const [frameworkResult, buildResult] = await Promise.all([
		FrameworkCache.cleanCache(ui5DataDir),
		CacheManager.cleanCache(ui5DataDir),
	]);

	const [additionalFrameworkResult, additionalBuildResult] = await Promise.all([
		FrameworkCache.cleanAdditional(ui5DataDir),
		CacheManager.cleanAdditional(ui5DataDir),
	]);
	const orphanedInfoWithAbsPaths = additionalFrameworkResult.map(
		(o) => ({...o, absPath: path.join(ui5DataDir, o.path)})
	);
	const buildAdditionalResult = preCleanBuildAdditionalInfo.length > 0 ?
		additionalBuildResult.map((o) => ({...o, absPath: path.join(ui5DataDir, o.path)})) :
		[];

	await displayCleanupResult({
		frameworkResult,
		buildResult,
		frameworkAbsPath,
		buildAbsPath,
		buildPreSize,
		orphanedInfoWithAbsPaths,
		buildAdditionalResult,
	});
}

export default cacheCommand;
