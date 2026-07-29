import chalk from "chalk";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import {isLogLevelEnabled} from "@ui5/logger";
import baseMiddleware from "../middlewares/base.js";
import Configuration from "@ui5/project/config/Configuration";
import FrameworkCache from "@ui5/project/internal/ui5Framework/cache";
import CacheManager from "@ui5/project/internal/build/cache/CacheManager";
import {
	CACHE_CLEAN_HELP_USAGE,
	displayCacheCleanWarning,
	displayCacheInfo,
	displayCleanupResult,
} from "./helpers/cacheOutput.js";

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
					.option("force", {
						alias: "f",
						describe: "Skip the confirmation prompt, e.g. for use in CI pipelines",
						default: false,
						type: "boolean",
					})
					.example("$0 cache clean",
						"Remove all cached UI5 data after confirmation")
					.example("$0 cache clean --force",
						"Remove all cached UI5 data without confirmation (e.g. in CI scenarios)")
					.example("UI5_DATA_DIR=/custom/path $0 cache clean",
						"Remove cached data from a non-default UI5 data directory");
			},
			middlewares: [baseMiddleware],
		});
};
/**
 * Prompt the user for confirmation before proceeding with cache cleanup.
 *
 * @param {Yargs.Arguments} argv
 * @returns {Promise<boolean>} Confirmation result
 */
async function getConfirmation(argv) {
	if (argv.force) {
		return true;
	}
	displayCacheCleanWarning();
	const {default: yesno} = await import("yesno");
	return yesno({
		question: "Proceed with cache cleanup? (y/N)",
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

function withAbsPath(entries, ui5DataDir) {
	return entries.map((entry) => {
		return {...entry, absPath: getAbsPath(ui5DataDir, entry)};
	});
}

function getAbsPath(ui5DataDir, cacheEntry) {
	if (!cacheEntry?.path) {
		return null;
	}
	return path.join(ui5DataDir, cacheEntry.path);
}

async function handleCache(argv) {
	const ui5DataDir = await resolveCacheUi5DataDir();
	const isVerbose = isLogLevelEnabled("verbose");

	if (isVerbose) {
		// logger.verbose pollutes output with framework noise.
		process.stderr.write(`Checking cache at ${chalk.bold(ui5DataDir)} …\n`);
	}

	const [frameworkInfo, buildInfo] = await Promise.all([
		FrameworkCache.getCacheInfo(ui5DataDir),
		CacheManager.getCacheInfo(ui5DataDir),
	]);

	const hasActiveCache = Boolean(frameworkInfo || buildInfo);
	let staleInfo = [];
	let buildStaleInfo = [];

	if (isVerbose || !hasActiveCache) {
		[staleInfo, buildStaleInfo] = await Promise.all([
			FrameworkCache.getAdditionalCacheInfo(ui5DataDir),
			CacheManager.getAdditionalCacheInfo(ui5DataDir),
		]);
	}

	const hasStaleCache = staleInfo.length > 0 || buildStaleInfo.length > 0;

	if (!hasActiveCache && !hasStaleCache) {
		if (isVerbose) {
			process.stderr.write(`\n${chalk.italic("Nothing to clean")}\n\n`);
		}
		return;
	}

	if (isVerbose) {
		await displayCacheInfo({
			frameworkInfo,
			buildInfo,
			frameworkAbsPath: getAbsPath(ui5DataDir, frameworkInfo),
			buildAbsPath: getAbsPath(ui5DataDir, buildInfo),
			buildPreSize: buildInfo?.size ?? 0,
			staleInfo: withAbsPath(staleInfo, ui5DataDir),
			buildAdditionalInfo: withAbsPath(buildStaleInfo, ui5DataDir),
		});
	}

	const confirmed = await getConfirmation(argv);
	if (!confirmed) {
		if (isVerbose) {
			process.stderr.write(`\n${chalk.italic("Cancelled")}\n\n`);
		}
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

	if (isVerbose) {
		const cleanedStaleFramework = staleInfo.length > 0 ? withAbsPath(additionalFrameworkResult, ui5DataDir) : [];
		const cleanedStaleBuild = buildStaleInfo.length > 0 ? withAbsPath(additionalBuildResult, ui5DataDir) : [];
		const frameworkResultAbsPath = getAbsPath(ui5DataDir, frameworkResult) || getAbsPath(ui5DataDir, frameworkInfo);
		const buildResultAbsPath = getAbsPath(ui5DataDir, buildResult) || getAbsPath(ui5DataDir, buildInfo);
		await displayCleanupResult({
			frameworkResult,
			buildResult,
			frameworkAbsPath: frameworkResultAbsPath,
			buildAbsPath: buildResultAbsPath,
			buildPreSize: buildInfo?.size ?? buildResult?.size ?? 0,
			staleInfoWithAbsPaths: cleanedStaleFramework,
			buildAdditionalResult: cleanedStaleBuild,
		});
	}
}

export default cacheCommand;
