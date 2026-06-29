import chalk from "chalk";
import path from "node:path";
import process from "node:process";
import baseMiddleware from "../middlewares/base.js";
import {resolveUi5DataDir} from "@ui5/project/utils/dataDir";
import {acquireLock, CLEANUP_LOCK_NAME, getLockDir, hasActiveLocks} from "@ui5/project/utils/lock";
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

/**
 * Display information about the cached data that will be removed,
 * including the absolute paths and details about the framework and build caches,
 * and any orphaned staging directories from previously interrupted clean operations.
 *
 * @param {object} data
 * @param {object|null} data.frameworkInfo
 * @param {object|null} data.buildInfo
 * @param {string|null} data.frameworkAbsPath
 * @param {string|null} data.buildAbsPath
 * @param {number} data.buildPreSize
 * @param {Array<{absPath: string, libraryCount: number, versionCount: number}>} data.orphanedInfo
 */
async function displayCacheInfo({
	frameworkInfo,
	buildInfo,
	frameworkAbsPath,
	buildAbsPath,
	buildPreSize,
	orphanedInfo,
}) {
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
	if (orphanedInfo && orphanedInfo.length > 0) {
		process.stderr.write(
			`  ${chalk.yellow("•")} ${chalk.bold("Orphaned framework data")}` +
			`   (incomplete previous clean — ` +
			`${orphanedInfo.length} director${orphanedInfo.length === 1 ? "y" : "ies"})\n`
		);
		for (const orphan of orphanedInfo) {
			const detail = formatFrameworkStats(orphan.libraryCount, orphan.versionCount);
			process.stderr.write(`      ${chalk.dim(orphan.absPath)}   (${detail})\n`);
		}
	}
	process.stderr.write("\n");
}

/**
 * Display the result of the cache cleanup operation,
 * including which caches were removed and their details,
 * and any orphaned staging directories that were also cleaned up.
 *
 * @param {object} data
 * @param {object|null} data.frameworkResult
 * @param {object|null} data.buildResult
 * @param {string|null} data.frameworkAbsPath
 * @param {string|null} data.buildAbsPath
 * @param {number} data.buildPreSize
 * @param {Array<{absPath: string, libraryCount: number, versionCount: number}>} data.orphanedInfoWithAbsPaths
 */
async function displayCleanupResult({
	frameworkResult,
	buildResult,
	frameworkAbsPath,
	buildAbsPath,
	buildPreSize,
	orphanedInfoWithAbsPaths,
}) {
	process.stderr.write("\n");
	if (frameworkResult && frameworkAbsPath) {
		const detail = formatFrameworkStats(
			frameworkResult.libraryCount,
			frameworkResult.versionCount,
		);
		process.stderr.write(
			`${chalk.green("✓")} Removed ${chalk.bold(LABEL_FRAMEWORK)}` +
				`   (${frameworkAbsPath} · ${detail})\n`,
		);
	}
	if (orphanedInfoWithAbsPaths && orphanedInfoWithAbsPaths.length > 0) {
		process.stderr.write(
			`${chalk.green("✓")} Removed ${chalk.bold("Orphaned framework data")}` +
			`   (${orphanedInfoWithAbsPaths.length}` +
			` director${orphanedInfoWithAbsPaths.length === 1 ? "y" : "ies"})\n`
		);
		for (const orphan of orphanedInfoWithAbsPaths) {
			const detail = formatFrameworkStats(orphan.libraryCount, orphan.versionCount);
			process.stderr.write(`    ${chalk.dim(orphan.absPath)}   (${detail})\n`);
		}
	}
	if (buildResult) {
		// Use pre-clean size so the number matches what was shown before confirmation
		const detail = buildPreSize > 0 ? formatSize(buildPreSize) : "";
		process.stderr.write(
			`${chalk.green("✓")} Removed ${chalk.bold(LABEL_BUILD)}` +
				`   (${buildAbsPath}${detail ? ` · ${detail}` : ""})\n`,
		);
	}

	// Success summary
	const cleaned = [];
	if (frameworkResult) {
		cleaned.push(LABEL_FRAMEWORK);
	}
	if (orphanedInfoWithAbsPaths && orphanedInfoWithAbsPaths.length > 0) {
		cleaned.push("Orphaned framework data");
	}
	if (buildResult) {
		cleaned.push(LABEL_BUILD);
	}
	process.stderr.write(
		`\n${chalk.green("Success:")} Cleaned ${cleaned.join(" and ")}\n`,
	);
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
	const {default: yesno} = await import("yesno");
	return yesno({
		question: "Do you want to continue? (y/N)",
		defaultValue: false
	});
}

async function handleCache(argv) {
	const ui5DataDir = await resolveUi5DataDir();
	const lockDir = getLockDir(ui5DataDir);
	const lockPath = path.join(lockDir, CLEANUP_LOCK_NAME);

	// Acquire first, then check — ensures concurrent framework operations will see
	// the cleanup lock and abort before the actual cleanup.
	const releaseCleanupLock = await acquireLock(lockPath);

	try {
		// Abort early if a lock is active — before prompting the user.
		if (await hasActiveLocks(ui5DataDir, {exclude: CLEANUP_LOCK_NAME})) {
			process.stderr.write(
				`${chalk.red("Error:")} A UI5 server or build process is currently running. ` +
				"Cannot clean the cache while it is in use. " +
				"Please stop all running 'ui5 serve' or wait for 'ui5 build' processes to finish.\n"
			);
			process.exitCode = 1;
			return;
		}

		process.stderr.write(`Checking cache at ${chalk.bold(ui5DataDir)} …\n`);

		const [frameworkInfo, buildInfo, orphanedInfo] = await Promise.all([
			frameworkCache.getCacheInfo(ui5DataDir),
			CacheManager.getCacheInfo(ui5DataDir),
			frameworkCache.getOrphanedInfo(ui5DataDir),
		]);

		if (!frameworkInfo && !buildInfo && orphanedInfo.length === 0) {
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

		await displayCacheInfo({
			frameworkInfo,
			buildInfo,
			frameworkAbsPath,
			buildAbsPath,
			buildPreSize,
			orphanedInfo: preCleanOrphanedInfo,
		});

		const confirmed = await getConfirmation(argv);
		if (!confirmed) {
			process.stderr.write("Cancelled\n");
			return;
		}

		const [frameworkResult, buildResult] = await Promise.all([
			frameworkCache.cleanCache(ui5DataDir),
			CacheManager.cleanCache(ui5DataDir),
		]);

		// Release the lock. Critical sections are done.
		// The finally block will call releaseCleanupLock() again, which is a no-op (idempotent).
		releaseCleanupLock();

		// Clean additional resources that are safe to run outside the lock.
		// For the framework cache this handles orphaned staging dirs from previous
		// interrupted cleans. These are fully independent of any active operation.
		const [additionalFrameworkResult] = await Promise.all([
			frameworkCache.cleanAdditional(ui5DataDir),
			// The same interface. No-op
			CacheManager.cleanAdditional(ui5DataDir),
		]);
		const orphanedInfoWithAbsPaths = additionalFrameworkResult.map(
			(o) => ({...o, absPath: path.join(ui5DataDir, o.path)})
		);

		await displayCleanupResult({
			frameworkResult,
			buildResult,
			frameworkAbsPath,
			buildAbsPath,
			buildPreSize,
			orphanedInfoWithAbsPaths,
		});
	} finally {
		releaseCleanupLock();
	}
}

export default cacheCommand;
