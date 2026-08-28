import chalk from "chalk";
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
