import chalk from "chalk";
import path from "node:path";
import process from "node:process";
import {formatPath} from "../../../dataDir.js";

const GROUP_FRAMEWORK = "Framework";
const GROUP_BUILD = "Build";
const SECTION_ACTIVE_CACHE = "Active Cache";
const SECTION_STALE_CACHE = "Stale Cache";

const CACHE_CLEAN_WARNING =
	"Only run ui5 cache clean when no UI5 CLI process and no @ui5/* API consumer is actively running.";
const CACHE_CLEAN_WARNING_IMPACT =
	"Running ui5 cache clean while ui5 build or ui5 serve is in progress can break the running process " +
	"and lead to failed or inconsistent results.";
const PARALLEL_CLEANUP_NOTICE = "Nothing left to clean. A parallel cleanup might have happened.";

export const CACHE_CLEAN_HELP_USAGE =
	`WARNING: ${CACHE_CLEAN_WARNING}\n${CACHE_CLEAN_WARNING_IMPACT}\n\nUsage: ui5 cache clean [options]`;

const PREVIEW_MARKER = chalk.yellow("•");
const SUCCESS_MARKER = chalk.green("✓");
const ITEM_DIVIDER = chalk.dim("·");

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

function formatFrameworkStats(libraryCount, versionCount) {
	const v = `${versionCount.toLocaleString("en-US")} ${versionCount === 1 ? "version" : "versions"}`;
	const l = `${libraryCount.toLocaleString("en-US")} ${libraryCount === 1 ? "library" : "libraries"}`;
	return `${v} of ${l}`;
}

function writeSectionHeader(title) {
	process.stderr.write(`  ${chalk.bold.cyan(title)}\n`);
}

function writeCategoryHeader(title) {
	process.stderr.write(`    ${chalk.bold(title)}\n`);
}

function writePreviewItem(absPath, detail) {
	process.stderr.write(
		`      ${PREVIEW_MARKER} ${chalk.dim(formatPath(absPath))}` +
		`${detail ? ` ${ITEM_DIVIDER} ${detail}` : ""}\n`
	);
}

function writeCleanupItem(absPath, detail) {
	process.stderr.write(
		`      ${SUCCESS_MARKER} Removed ${chalk.dim(formatPath(absPath))}` +
		`${detail ? ` ${ITEM_DIVIDER} ${detail}` : ""}\n`
	);
}

function writeGroupedSections(sections, itemWriter) {
	for (let i = 0; i < sections.length; i++) {
		const section = sections[i];
		if (i > 0) {
			process.stderr.write("\n");
		}
		writeSectionHeader(section.title);
		for (let j = 0; j < section.categories.length; j++) {
			const category = section.categories[j];
			writeCategoryHeader(category.title);
			for (const item of category.items) {
				itemWriter(item);
			}
		}
	}
}

export function displayCacheCleanWarning() {
	process.stderr.write(`${chalk.bold.yellow("Warning:")} ${chalk.italic(CACHE_CLEAN_WARNING)}\n`);
	process.stderr.write(`${chalk.italic(CACHE_CLEAN_WARNING_IMPACT)}\n\n`);
}

function formatEntries(count) {
	return `${count.toLocaleString("en-US")} ${count === 1 ? "entry" : "entries"}`;
}

/**
 * Formats the age of a cache entry as a coarse relative time (e.g. "3h ago").
 *
 * The age is derived from the index_cache "source" blob's indexTimestamp. A signature
 * with stage/result rows but no source-index row (partial or legacy) has no timestamp,
 * so its age is reported as unknown.
 *
 * @param {number|null} indexTimestamp Epoch milliseconds, or null when unknown
 * @returns {string} Relative-time label
 */
function formatAge(indexTimestamp) {
	if (!indexTimestamp) {
		return "age unknown";
	}
	const ms = Date.now() - indexTimestamp;
	if (ms < 1000) {
		return "just now";
	}
	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) {
		return `${seconds}s ago`;
	}
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) {
		return `${minutes}m ago`;
	}
	const hours = Math.floor(minutes / 60);
	if (hours < 24) {
		return `${hours}h ago`;
	}
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

/**
 * Display information about the build cache entries of a single project that will be removed.
 *
 * @param {object} data
 * @param {string} data.projectId
 * @param {string} data.absPath
 */
export function displayProjectCacheInfo({projectId, absPath}) {
	process.stderr.write(
		`\n${chalk.bold(`The build cache of project ${chalk.cyan(projectId)} will be removed:`)}\n\n`
	);
	writePreviewItem(absPath);
	process.stderr.write("\n");
}

/**
 * Display the result of a project-scoped build cache cleanup.
 *
 * @param {object} data
 * @param {string} data.projectId
 * @param {string|null} data.absPath
 * @param {number} data.deletedEntries
 */
export function displayProjectCleanupResult({projectId, absPath, deletedEntries}) {
	if (!absPath) {
		process.stderr.write(`${chalk.italic(PARALLEL_CLEANUP_NOTICE)}\n`);
		return;
	}
	process.stderr.write(`\n${chalk.bold("Cleanup result:")}\n\n`);
	writeCleanupItem(absPath, formatEntries(deletedEntries));
	process.stderr.write(
		`\n${chalk.green("Success:")} Removed the build cache of project ${chalk.cyan(projectId)}\n`
	);
}

function createFrameworkItems(entries) {
	const items = [];
	for (const entry of entries) {
		const detail = formatFrameworkStats(entry.libraryCount, entry.versionCount);
		items.push({absPath: entry.absPath, detail});
	}
	return items;
}

function createBuildItems(entries, detailFormatter) {
	const items = [];
	for (const entry of entries) {
		const detail = detailFormatter(entry.size);
		items.push({absPath: entry.absPath, detail});
	}
	return items;
}

function createSections({
	activeFramework,
	activeBuild,
	staleFrameworkEntries,
	staleBuildEntries,
	staleBuildDetailFormatter,
}) {
	const sections = [];

	const activeCategories = [];
	if (activeFramework) {
		const detail = formatFrameworkStats(activeFramework.libraryCount, activeFramework.versionCount);
		activeCategories.push({
			title: GROUP_FRAMEWORK,
			items: [{absPath: activeFramework.absPath, detail}],
		});
	}
	if (activeBuild) {
		const detail = activeBuild.size > 0 ? formatSize(activeBuild.size) : "";
		activeCategories.push({
			title: GROUP_BUILD,
			items: [{absPath: activeBuild.absPath, detail}],
		});
	}
	if (activeCategories.length > 0) {
		sections.push({title: SECTION_ACTIVE_CACHE, categories: activeCategories});
	}

	const staleCategories = [];
	const staleFrameworkItems = createFrameworkItems(staleFrameworkEntries);
	if (staleFrameworkItems.length > 0) {
		staleCategories.push({title: GROUP_FRAMEWORK, items: staleFrameworkItems});
	}
	const staleBuildItems = createBuildItems(staleBuildEntries, staleBuildDetailFormatter);
	if (staleBuildItems.length > 0) {
		staleCategories.push({title: GROUP_BUILD, items: staleBuildItems});
	}
	if (staleCategories.length > 0) {
		sections.push({title: SECTION_STALE_CACHE, categories: staleCategories});
	}

	return sections;
}

/**
 * Display information about the cached data that will be removed.
 * Entries are grouped by active and stale cache data.
 *
 * @param {object} data
 * @param {object|null} data.frameworkInfo
 * @param {object|null} data.buildInfo
 * @param {string|null} data.frameworkAbsPath
 * @param {string|null} data.buildAbsPath
 * @param {number} data.buildPreSize
 * @param {Array<{absPath: string, libraryCount: number, versionCount: number}>} data.staleInfo
 * @param {Array<{absPath: string, size: number}>} data.buildAdditionalInfo
 */
export function displayCacheInfo({
	frameworkInfo,
	buildInfo,
	frameworkAbsPath,
	buildAbsPath,
	buildPreSize,
	staleInfo,
	buildAdditionalInfo,
}) {
	const sections = createSections({
		activeFramework: frameworkInfo ? {
			absPath: frameworkAbsPath,
			libraryCount: frameworkInfo.libraryCount,
			versionCount: frameworkInfo.versionCount,
		} : null,
		activeBuild: buildInfo ? {
			absPath: buildAbsPath,
			size: buildPreSize,
		} : null,
		staleFrameworkEntries: staleInfo,
		staleBuildEntries: buildAdditionalInfo,
		staleBuildDetailFormatter: (size) => size > 0 ? formatSize(size) : "",
	});

	process.stderr.write(`\n${chalk.bold("The following cached data will be removed:")}\n`);
	process.stderr.write("\n");
	writeGroupedSections(sections, ({absPath, detail}) => {
		writePreviewItem(absPath, detail);
	});
	process.stderr.write("\n");
}

/**
 * Display the result of the cache cleanup operation, grouped by active and stale cache.
 *
 * @param {object} data
 * @param {{libraryCount: number, versionCount: number}|null} data.frameworkResult
 * @param {object|null} data.buildResult
 * @param {string|null} data.frameworkAbsPath
 * @param {string|null} data.buildAbsPath
 * @param {number} data.buildSize
 * @param {Array<{absPath: string, libraryCount: number, versionCount: number}>} data.staleInfoWithAbsPaths
 * @param {Array<{absPath: string, size: number}>} data.buildAdditionalResult
 */
export function displayCleanupResult({
	frameworkResult,
	buildResult,
	frameworkAbsPath,
	buildAbsPath,
	buildSize,
	staleInfoWithAbsPaths,
	buildAdditionalResult,
}) {
	const sections = createSections({
		activeFramework: frameworkResult && frameworkAbsPath ? {
			absPath: frameworkAbsPath,
			libraryCount: frameworkResult.libraryCount,
			versionCount: frameworkResult.versionCount,
		} : null,
		activeBuild: buildResult && buildAbsPath ? {
			absPath: buildAbsPath,
			size: buildSize,
		} : null,
		staleFrameworkEntries: staleInfoWithAbsPaths,
		staleBuildEntries: buildAdditionalResult,
		staleBuildDetailFormatter: (size) => size > 0 ? `freed ${formatSize(size)}` : "",
	});

	if (sections.length === 0) {
		process.stderr.write(`${chalk.italic(PARALLEL_CLEANUP_NOTICE)}\n`);
		return;
	}

	process.stderr.write(`\n${chalk.bold("Cleanup result:")}\n`);

	process.stderr.write("\n");
	writeGroupedSections(sections, ({absPath, detail}) => {
		writeCleanupItem(absPath, detail);
	});

	const cleanedSections = sections.map((section) => {
		const categories = section.categories.map((category) => category.title).join(" and ");
		return `${section.title} (${categories})`;
	});

	process.stderr.write(`\n${chalk.green("Success:")} Cleaned ${cleanedSections.join(" and ")}\n`);
}

/**
 * Formats the details of a single build-signature entry (age, task count, stage/result counts,
 * and optionally the on-disk size).
 *
 * @param {object} entry Build-signature entry
 * @param {object} [options]
 * @param {boolean} [options.withSizes]
 * @returns {string}
 */
function formatEntryDetails(entry, {withSizes = false} = {}) {
	const taskCount = entry.tasks.length;
	const parts = [
		formatAge(entry.indexTimestamp),
		`${taskCount} ${taskCount === 1 ? "task" : "tasks"}`,
		`${entry.stageEntries.length} stage / ${entry.resultSignatures.length} result entries`,
	];
	if (withSizes && typeof entry.sizeBytes === "number") {
		parts.push(formatSize(entry.sizeBytes));
	}
	return parts.join(` ${ITEM_DIVIDER} `);
}

function writeEntryLine(entry, {tag = "", withSizes = false, withStages = false} = {}) {
	const shortSignature = chalk.cyan(entry.buildSignature.slice(0, 12));
	process.stdout.write(
		`  ${tag ? `${tag} ` : ""}${shortSignature} ${chalk.dim(formatEntryDetails(entry, {withSizes}))}\n`
	);
	if (withStages) {
		writeStageEntries(entry);
	}
}

// Lists a build signature's contained stage signatures, each drillable via 'ui5 cache inspect-stage'.
function writeStageEntries(entry) {
	const stages = [...(entry.stageEntries ?? [])].sort((a, b) => a.stageId.localeCompare(b.stageId));
	const width = stages.reduce((max, stage) => Math.max(max, stage.stageId.length), 0);
	for (const {stageId, stageSignature} of stages) {
		process.stdout.write(`    ${stageId.padEnd(width)}  ${chalk.cyan(stageSignature.slice(0, 12))}\n`);
	}
}

function writeProjectHeading(project) {
	let name = chalk.bold(project.name);
	if (project.isFramework) {
		name = chalk.blue(name);
	}
	const meta = [project.version, project.type].filter(Boolean).join(", ");
	process.stdout.write(`${name}${meta ? ` ${chalk.dim(`(${meta})`)}` : ""}\n`);
}

function writeInspectionHeader(ui5DataDir, title) {
	process.stdout.write(
		`\n${chalk.bold(title)} ${chalk.dim.italic(formatPath(path.join(ui5DataDir, "buildCache")))}\n\n`
	);
}

/**
 * Display a read-only inspection of the build cache for the current project tree on stdout.
 * Each project shows the cache entry matching its current build signature (or a "not cached"
 * note), and summarizes the other on-disk signatures. `--all` expands them; `--stale` shows
 * only the non-current ones.
 *
 * @param {object} data
 * @param {string} data.ui5DataDir Resolved absolute path to the UI5 data directory
 * @param {Array<object>} data.projects Ordered projects, each with `currentSignature`, `current`
 *   (matching entry or null) and `stale` (array of non-current entries)
 * @param {boolean} [data.showAll] Expand stale signatures instead of summarizing
 * @param {boolean} [data.staleOnly] Show only stale signatures
 * @param {boolean} [data.withSizes] Show on-disk sizes
 * @param {boolean} [data.withStages] List contained stage signatures under each entry
 */
export function displayCacheInspection({
	ui5DataDir, projects, showAll = false, staleOnly = false, withSizes = false, withStages = false,
}) {
	writeInspectionHeader(ui5DataDir, "Build cache inspection");
	const currentTag = chalk.green("current");
	const staleTag = chalk.yellow("stale");

	for (const project of projects) {
		writeProjectHeading(project);

		if (staleOnly) {
			if (!project.stale.length) {
				process.stdout.write(`  ${chalk.italic("No stale signatures")}\n`);
			} else {
				for (const entry of project.stale) {
					writeEntryLine(entry, {tag: staleTag, withSizes, withStages});
				}
			}
			continue;
		}

		if (project.current) {
			writeEntryLine(project.current, {tag: currentTag, withSizes, withStages});
		} else {
			const shortSignature = project.currentSignature ?
				chalk.cyan(project.currentSignature.slice(0, 12)) : chalk.dim("unknown");
			process.stdout.write(
				`  ${currentTag} ${shortSignature} ${chalk.dim.italic("not cached (a build would populate it)")}\n`
			);
		}

		if (project.stale.length) {
			if (showAll) {
				for (const entry of project.stale) {
					writeEntryLine(entry, {tag: staleTag, withSizes, withStages});
				}
			} else {
				const count = project.stale.length;
				process.stdout.write(
					`  ${chalk.dim(`${count} other signature${count === 1 ? "" : "s"} on disk (use --all to show)`)}\n`
				);
			}
		}
	}
	process.stdout.write("\n");
}

/**
 * Display all cached build signatures for a single project id on stdout.
 *
 * @param {object} data
 * @param {string} data.ui5DataDir
 * @param {string} data.projectId
 * @param {Array<object>} data.entries Per-signature entries
 * @param {boolean} [data.withSizes]
 * @param {boolean} [data.withStages] List contained stage signatures under each entry
 */
export function displayProjectInspection({ui5DataDir, projectId, entries, withSizes = false, withStages = false}) {
	writeInspectionHeader(ui5DataDir, `Build cache for ${projectId}`);
	if (!entries.length) {
		process.stdout.write(`  ${chalk.italic("No cache entries")}\n\n`);
		return;
	}
	for (const entry of entries) {
		writeEntryLine(entry, {withSizes, withStages});
	}
	process.stdout.write("\n");
}

function formatIntegrity(integrity) {
	if (!integrity) {
		return chalk.dim("no integrity");
	}
	return chalk.dim(integrity.length > 23 ? `${integrity.slice(0, 20)}...` : integrity);
}

/**
 * Display the cached resources of a single stage signature on stdout.
 *
 * @param {object} data
 * @param {string} data.ui5DataDir
 * @param {string} data.stageSignature
 * @param {Array<{projectId: string, buildSignature: string, stageId: string, resources: Array<object>}>}
 *   data.stageEntries Matching stage rows
 * @param {boolean} [data.withSizes]
 */
export function displayStageInspection({ui5DataDir, stageSignature, stageEntries, withSizes = false}) {
	writeInspectionHeader(ui5DataDir, `Stage ${stageSignature.slice(0, 12)}`);
	if (!stageEntries.length) {
		process.stdout.write(`  ${chalk.italic(`No cached stage found for ${stageSignature}`)}\n\n`);
		return;
	}
	for (const stage of stageEntries) {
		process.stdout.write(
			`${chalk.bold(stage.stageId)} ${chalk.dim(`(${stage.projectId} ${ITEM_DIVIDER} ` +
			`${stage.buildSignature.slice(0, 12)})`)}\n`
		);
		const resourceCount = stage.resources.length;
		process.stdout.write(
			`  ${chalk.dim(`${resourceCount} ${resourceCount === 1 ? "resource" : "resources"}`)}\n`
		);
		for (const resource of stage.resources) {
			const details = [formatIntegrity(resource.integrity)];
			if (withSizes && typeof resource.sizeBytes === "number") {
				details.push(chalk.dim(formatSize(resource.sizeBytes)));
			} else if (typeof resource.size === "number") {
				details.push(chalk.dim(formatSize(resource.size)));
			}
			process.stdout.write(`    ${resource.path} ${details.join(` ${ITEM_DIVIDER} `)}\n`);
		}
	}
	process.stdout.write("\n");
}
