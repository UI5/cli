import chalk from "chalk";
import path from "node:path";
import os from "node:os";
import process from "node:process";
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

	const [frameworkInfo, staleInfo, buildInfo, buildAdditionalInfo] = await Promise.all([
		FrameworkCache.getCacheInfo(ui5DataDir),
		FrameworkCache.getAdditionalCacheInfo(ui5DataDir),
		CacheManager.getCacheInfo(ui5DataDir),
		CacheManager.getAdditionalCacheInfo(ui5DataDir),
	]);

	if (!frameworkInfo && !buildInfo && staleInfo.length === 0 && buildAdditionalInfo.length === 0) {
		process.stderr.write("Nothing to clean\n");
		return;
	}

	// Compute absolute paths once — producers return relative sub-path segments
	const frameworkAbsPath = frameworkInfo ? path.join(ui5DataDir, frameworkInfo.path) : null;
	const buildAbsPath = buildInfo ? path.join(ui5DataDir, buildInfo.path) : null;
	const buildPreSize = buildInfo?.size ?? 0;
	const preCleanStaleInfo = staleInfo.map(
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
		staleInfo: preCleanStaleInfo,
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
	const staleInfoWithAbsPaths = additionalFrameworkResult.map(
		(o) => ({...o, absPath: path.join(ui5DataDir, o.path)})
	);
	const buildAdditionalResult = additionalBuildResult.map(
		(o) => ({...o, absPath: path.join(ui5DataDir, o.path)})
	);

	await displayCleanupResult({
		frameworkResult,
		buildResult,
		frameworkAbsPath,
		buildAbsPath,
		buildPreSize,
		staleInfoWithAbsPaths,
		buildAdditionalResult,
	});
}

export default cacheCommand;
