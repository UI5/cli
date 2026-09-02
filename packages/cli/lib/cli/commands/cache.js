import chalk from "chalk";
import path from "node:path";
import process from "node:process";
import {isLogLevelEnabled} from "@ui5/logger";
import baseMiddleware from "../middlewares/base.js";
import {applyProjectConfigOptions, applyWorkspaceOptions, applyBuildOptions, dedupeArray} from "../options.js";
import {getUi5DataDirOrDefault, formatPath} from "../../dataDir.js";
import {
	CACHE_CLEAN_HELP_USAGE,
	displayCacheCleanWarning,
	displayCacheInfo,
	displayCacheInspection,
	displayProjectInspection,
	displayStageInspection,
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
		.demandCommand(1, "Command required. Available commands are 'clean', 'inspect' and 'inspect-stage'")
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
					.example("$0 cache clean --project sap.ui.core",
						"Remove only the build cache of the project 'sap.ui.core'")
					.example("UI5_DATA_DIR=/custom/path $0 cache clean",
						"Remove cached data from a non-default UI5 data directory");
			},
			middlewares: [baseMiddleware],
		})
		.command("inspect [projectId]", "Inspect the build cache of the current project and its dependencies", {
			handler: handleInspect,
			builder: function(yargs) {
				applyProjectConfigOptions(yargs);
				applyWorkspaceOptions(yargs);
				applyBuildOptions(yargs);
				return yargs
					.positional("projectId", {
						describe: "Show all cached build signatures for this project id instead of " +
							"the current dependency tree",
						type: "string",
					})
					.option("build-mode", {
						describe: "Build variant whose signature is treated as current",
						type: "string",
						default: "preload",
						choices: ["preload", "jsdoc", "self-contained"],
					})
					.option("all", {
						describe: "Show all build signatures on disk, not only the current one",
						default: false,
						type: "boolean",
					})
					.option("stale", {
						describe: "Show only stale build signatures (cleanup candidates)",
						default: false,
						type: "boolean",
					})
					.option("stages", {
						describe: "List the stage signatures contained in each build signature",
						default: false,
						type: "boolean",
					})
					.option("sizes", {
						describe: "Compute the on-disk size of cached content (slower)",
						default: false,
						type: "boolean",
					})
					.option("framework-version", {
						describe:
							"Overrides the framework version defined by the project. " +
							"Takes the same value as the version part of \"ui5 use\"",
						type: "string",
					})
					.option("snapshot-cache", {
						describe:
							"Cache mode to use when consuming SNAPSHOT versions of framework dependencies. " +
							"The 'Default' behavior is to invalidate the cache after 9 hours. 'Force' uses the " +
							"cache only and does not create any requests. 'Off' invalidates any existing cache " +
							"and updates from the repository",
						type: "string",
						defaultDescription: "Default",
						choices: ["Default", "Force", "Off"],
					})
					.option("json", {
						describe: "Output the inspection result as JSON for tooling",
						default: false,
						type: "boolean",
					})
					.coerce(["framework-version"], dedupeArray)
					.example("$0 cache inspect",
						"Show the build cache relevant to the current dependency tree")
					.example("$0 cache inspect --all",
						"Also show stale build signatures for each project")
					.example("$0 cache inspect some.project",
						"Show all cached build signatures for a single project")
					.example("$0 cache inspect --stages",
						"List the stage signatures contained in each build signature");
			},
			middlewares: [baseMiddleware],
		})
		.command("inspect-stage <signature>", "Inspect the cached resources of a single build stage", {
			handler: handleStageInspect,
			builder: function(yargs) {
				return yargs
					.positional("signature", {
						describe: "Stage signature, or a unique prefix of one, as listed by " +
							"'ui5 cache inspect --stages'",
						type: "string",
					})
					.option("sizes", {
						describe: "Compute the on-disk size of cached content (slower)",
						default: false,
						type: "boolean",
					})
					.option("json", {
						describe: "Output the inspection result as JSON for tooling",
						default: false,
						type: "boolean",
					})
					.example("$0 cache inspect-stage 26b223c2c5f1",
						"Show the cached resources of a stage; a unique signature prefix is enough")
					.example("$0 cache inspect-stage 26b223c2c5f1 --sizes",
						"Also compute the on-disk size of each cached resource");
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
 * Resolves the project graph for the current directory.
 *
 * @param {Yargs.Arguments} argv
 * @param {object} options
 * @param {boolean} options.resolveFrameworkDependencies Whether to resolve framework libraries
 * @param {string} [options.versionOverride] Framework version override
 * @param {string} [options.snapshotCache] Snapshot cache mode
 * @returns {Promise<object>} Resolved project graph
 */
async function resolveGraph(argv, {resolveFrameworkDependencies, versionOverride, snapshotCache}) {
	const {graphFromStaticFile, graphFromPackageDependencies} = await import("@ui5/project/graph");
	if (argv.dependencyDefinition) {
		return graphFromStaticFile({
			filePath: argv.dependencyDefinition,
			rootConfigPath: argv.config,
			resolveFrameworkDependencies,
			versionOverride,
			snapshotCache,
		});
	}
	return graphFromPackageDependencies({
		rootConfigPath: argv.config,
		workspaceConfigPath: argv.workspaceConfig,
		workspaceName: argv.workspace === false ? null : argv.workspace,
		resolveFrameworkDependencies,
		versionOverride,
		snapshotCache,
	});
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
	const graph = await resolveGraph(argv, {resolveFrameworkDependencies: false});
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

/**
 * Maps the inspect build options to a build config for signature computation.
 *
 * @param {Yargs.Arguments} argv
 * @returns {{selfContained: boolean, jsdoc: boolean, includedTasks: string[], excludedTasks: string[]}}
 */
function inspectBuildConfig(argv) {
	const mode = argv.buildMode ?? "preload";
	return {
		selfContained: mode === "self-contained",
		jsdoc: mode === "jsdoc",
		includedTasks: argv.includeTask ?? [],
		excludedTasks: argv.excludeTask ?? [],
	};
}

/**
 * Inspects the build cache. Read-only: no confirmation, no mutation. Dispatches to one of two
 * modes: all signatures for one project id (positional projectId) or the current dependency tree
 * (default). The single-stage drill-down is a separate command, {@link handleStageInspect}.
 *
 * @param {Yargs.Arguments} argv
 */
async function handleInspect(argv) {
	if (argv.projectId) {
		return handleProjectInspect(argv);
	}
	return handleTreeInspect(argv);
}

/**
 * Default inspect mode: resolve the full project tree (including framework libraries), compute the
 * live build signature per project, and mark the matching cache entry as current while summarizing
 * the rest.
 *
 * @param {Yargs.Arguments} argv
 */
async function handleTreeInspect(argv) {
	const [{default: CacheManager}, {getProjectBuildSignatures}] = await Promise.all([
		import("@ui5/project/internal/build/cache/CacheManager"),
		import("@ui5/project/internal/build/helpers/getProjectBuildSignatures"),
	]);

	const graph = await resolveGraph(argv, {
		resolveFrameworkDependencies: true,
		versionOverride: argv.frameworkVersion,
		snapshotCache: argv.snapshotCache ?? "Default",
	});
	const ui5DataDir = await getUi5DataDirOrDefault({cwd: process.cwd()});

	const currentSignatures = await getProjectBuildSignatures(graph, inspectBuildConfig(argv));

	const projects = [];
	await graph.traverseBreadthFirst(({project}) => {
		projects.push({
			name: project.getName(),
			id: project.getId(),
			type: project.getType(),
			isFramework: project.isFrameworkProject(),
			version: project.getVersion(),
			currentSignature: currentSignatures.get(project.getId()) ?? null,
		});
	});

	const entriesById = await CacheManager.getProjectsCacheEntries(
		ui5DataDir, projects.map((p) => p.id), {withSizes: argv.sizes});
	for (const project of projects) {
		const entries = entriesById.get(project.id) ?? [];
		project.current = entries.find((entry) => entry.buildSignature === project.currentSignature) ?? null;
		project.stale = entries.filter((entry) => entry.buildSignature !== project.currentSignature);
	}

	if (argv.json) {
		process.stdout.write(`${JSON.stringify({ui5DataDir, buildMode: argv.buildMode ?? "preload", projects})}\n`);
		return;
	}

	displayCacheInspection({
		ui5DataDir, projects,
		showAll: argv.all, staleOnly: argv.stale, withSizes: argv.sizes, withStages: argv.stages,
	});
}

/**
 * Project drill-down: list all cached build signatures for a single project id, without resolving
 * a graph or the framework.
 *
 * @param {Yargs.Arguments} argv
 */
async function handleProjectInspect(argv) {
	const {default: CacheManager} = await import("@ui5/project/internal/build/cache/CacheManager");
	const ui5DataDir = await getUi5DataDirOrDefault({cwd: process.cwd()});

	const entriesById = await CacheManager.getProjectsCacheEntries(
		ui5DataDir, [argv.projectId], {withSizes: argv.sizes});
	const entries = entriesById.get(argv.projectId) ?? [];

	if (argv.json) {
		process.stdout.write(`${JSON.stringify({ui5DataDir, projectId: argv.projectId, entries})}\n`);
		return;
	}

	displayProjectInspection({ui5DataDir, projectId: argv.projectId, entries, withSizes: argv.sizes,
		withStages: argv.stages});
}

/**
 * Stage drill-down: show the cached resources of a single stage. The signature argument is the
 * abbreviated value listed by 'ui5 cache inspect --stages'; a unique prefix resolves it.
 *
 * @param {Yargs.Arguments} argv
 */
async function handleStageInspect(argv) {
	const {default: CacheManager} = await import("@ui5/project/internal/build/cache/CacheManager");
	const ui5DataDir = await getUi5DataDirOrDefault({cwd: process.cwd()});

	const stageEntries = await CacheManager.getStageDetails(ui5DataDir, argv.signature, {withSizes: argv.sizes});

	if (argv.json) {
		process.stdout.write(`${JSON.stringify({ui5DataDir, stageSignature: argv.signature, stageEntries})}\n`);
		return;
	}

	displayStageInspection({ui5DataDir, stageSignature: argv.signature, stageEntries, withSizes: argv.sizes});
}

export default cacheCommand;
