import chalk from "chalk";
import path from "node:path";
import process from "node:process";
import {isLogLevelEnabled} from "@ui5/logger";
import baseMiddleware from "../middlewares/base.js";
import {applyProjectConfigOptions, applyWorkspaceOptions} from "../options.js";
import {getUi5DataDirOrDefault, formatPath} from "../../dataDir.js";
import {
	CACHE_CLEAN_HELP_USAGE,
	displayCacheCleanWarning,
	displayCacheInfo,
	displayCleanupResult,
	displayProjectCacheInfo,
	displayProjectCleanupResult,
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
				applyProjectConfigOptions(yargs);
				applyWorkspaceOptions(yargs);
				return yargs
					.usage(CACHE_CLEAN_HELP_USAGE)
					.option("force", {
						alias: "f",
						describe: "Skip the confirmation prompt, e.g. for use in CI pipelines",
						default: false,
						type: "boolean",
					})
					.option("project", {
						alias: "p",
						describe: "Remove only the build cache of a single project, leaving other " +
							"projects' build cache and the downloaded framework packages intact. " +
							"Without a value, targets the project in the current directory. Pass a " +
							"project id (e.g. --project sap.ui.core) to target a specific project",
						type: "string",
					})
					.example("$0 cache clean",
						"Remove all cached UI5 data after confirmation")
					.example("$0 cache clean --force",
						"Remove all cached UI5 data without confirmation (e.g. in CI scenarios)")
					.example("$0 cache clean --project",
						"Remove only the build cache of the project in the current directory")
					.example("$0 cache clean --project @openui5/sap.ui.core",
						"Remove only the build cache of the project 'sap.ui.core'")
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
 * @param {string} [question] Confirmation prompt text
 * @returns {Promise<boolean>} Confirmation result
 */
async function getConfirmation(argv, question = "Proceed with cache cleanup? (y/N)") {
	if (argv.force) {
		return true;
	}
	displayCacheCleanWarning();
	const {default: yesno} = await import("yesno");
	return yesno({
		question,
		defaultValue: false
	});
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
	if (argv.project !== undefined) {
		return handleProjectCache(argv);
	}
	// Lazy loading to prevent unnecessary imports when the command is not executed
	const [{default: FrameworkCache}, {default: CacheManager}] = await Promise.all([
		import("@ui5/project/internal/ui5Framework/cache"),
		import("@ui5/project/internal/build/cache/CacheManager"),
	]);

	const ui5DataDir = await getUi5DataDirOrDefault({cwd: process.cwd()});
	const isVerbose = isLogLevelEnabled("verbose");

	if (isVerbose) {
		// logger.verbose pollutes output with framework noise.
		process.stderr.write(`Checking cache at ${chalk.bold(formatPath(ui5DataDir))} …\n`);
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
			process.stderr.write(`${chalk.italic("Nothing to clean")}\n`);
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
			process.stderr.write(`${chalk.italic("Cancelled")}\n`);
		}
		return;
	}

	if (isVerbose) {
		// Get fresh build stale info to distinguish
		// between active and stale build cache after cleanup.
		buildStaleInfo = await CacheManager.getAdditionalCacheInfo(ui5DataDir);
	}

	const [frameworkCleanupResult, buildCleanupResult] = await Promise.all([
		FrameworkCache.cleanCache(ui5DataDir),
		CacheManager.cleanCache(ui5DataDir),
	]);

	const [additionalFrameworkCleanupResult, buildStaleCleanupResult] = await Promise.all([
		FrameworkCache.cleanAdditional(ui5DataDir),
		CacheManager.cleanAdditional(ui5DataDir),
	]);

	if (isVerbose) {
		const staleBuildCleanupResult = buildStaleInfo?.length > 0 ?
			buildStaleCleanupResult : [];
		const cleanedStaleFramework = withAbsPath(additionalFrameworkCleanupResult, ui5DataDir);
		const cleanedStaleBuild = withAbsPath(staleBuildCleanupResult, ui5DataDir);
		const frameworkResultAbsPath = getAbsPath(ui5DataDir, frameworkCleanupResult);
		const buildResultAbsPath = getAbsPath(ui5DataDir, buildCleanupResult);
		await displayCleanupResult({
			frameworkResult: frameworkCleanupResult,
			buildResult: buildCleanupResult,
			frameworkAbsPath: frameworkResultAbsPath,
			buildAbsPath: buildResultAbsPath,
			buildSize: buildCleanupResult?.size ?? 0,
			staleInfoWithAbsPaths: cleanedStaleFramework,
			buildAdditionalResult: cleanedStaleBuild,
		});
	}
}

/**
 * Resolves the project graph for the current directory and returns the root project's id,
 * which is the key used for its entries in the build cache.
 *
 * Framework dependencies are not resolved: the root project id is its package name and does
 * not depend on the framework version, so resolving the framework would only add network
 * access and a failure surface to a command meant to leave framework packages untouched.
 *
 * @param {Yargs.Arguments} argv
 * @returns {Promise<string>} Root project id
 */
async function getRootProjectId(argv) {
	const {graphFromStaticFile, graphFromPackageDependencies} = await import("@ui5/project/graph");
	let graph;
	if (argv.dependencyDefinition) {
		graph = await graphFromStaticFile({
			filePath: argv.dependencyDefinition,
			rootConfigPath: argv.config,
			resolveFrameworkDependencies: false,
		});
	} else {
		graph = await graphFromPackageDependencies({
			rootConfigPath: argv.config,
			workspaceConfigPath: argv.workspaceConfig,
			workspaceName: argv.workspace === false ? null : argv.workspace,
			resolveFrameworkDependencies: false,
		});
	}
	return graph.getRoot().getId();
}

/**
 * Removes the build cache of a single project, leaving other projects' build cache and the
 * framework cache intact.
 *
 * A project id passed via --project is used directly. Without one, the root project id of the
 * current directory is resolved from the project graph the same way 'ui5 build' does.
 *
 * @param {Yargs.Arguments} argv
 */
async function handleProjectCache(argv) {
	const {default: CacheManager} = await import("@ui5/project/internal/build/cache/CacheManager");

	const projectId = argv.project || await getRootProjectId(argv);
	const ui5DataDir = await getUi5DataDirOrDefault({cwd: process.cwd()});
	const isVerbose = isLogLevelEnabled("verbose");

	if (isVerbose) {
		process.stderr.write(
			`Checking build cache for project ${chalk.bold(projectId)} at ${chalk.bold(formatPath(ui5DataDir))} …\n`
		);
	}

	const info = await CacheManager.getProjectCacheInfo(ui5DataDir, projectId);
	if (!info) {
		if (isVerbose) {
			process.stderr.write(`${chalk.italic("Nothing to clean")}\n`);
		}
		return;
	}

	if (isVerbose) {
		displayProjectCacheInfo({projectId, absPath: getAbsPath(ui5DataDir, info)});
	}

	const confirmed = await getConfirmation(argv, `Delete build cache for '${projectId}'? (y/N)`);
	if (!confirmed) {
		if (isVerbose) {
			process.stderr.write(`${chalk.italic("Cancelled")}\n`);
		}
		return;
	}

	const result = await CacheManager.cleanProject(ui5DataDir, projectId);

	if (isVerbose) {
		displayProjectCleanupResult({
			projectId,
			absPath: getAbsPath(ui5DataDir, result),
			deletedEntries: result?.deletedEntries ?? 0,
		});
	}
}

export default cacheCommand;
