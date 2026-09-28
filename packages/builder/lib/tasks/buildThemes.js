import path from "node:path";
import fsInterface from "@ui5/fs/fsInterface";
import ReaderCollectionPrioritized from "@ui5/fs/ReaderCollectionPrioritized";
import {getLogger} from "@ui5/logger";
const log = getLogger("builder:tasks:buildThemes");
import {fileURLToPath} from "node:url";
import os from "node:os";
import workerpool from "workerpool";
import {deserializeResources, serializeResources, FsMainThreadInterface} from "../processors/themeBuilderWorker.js";
import {setTimeout as setTimeoutPromise} from "node:timers/promises";

let pool;

function getPool(taskUtil) {
	if (!pool) {
		const MIN_WORKERS = 2;
		const MAX_WORKERS = 4;
		const osCpus = os.cpus().length || 1;
		const maxWorkers = Math.max(Math.min(osCpus - 1, MAX_WORKERS), MIN_WORKERS);

		log.verbose(`Creating workerpool with up to ${maxWorkers} workers (available CPU cores: ${osCpus})`);
		const workerPath = fileURLToPath(new URL("../processors/themeBuilderWorker.js", import.meta.url));
		pool = workerpool.pool(workerPath, {
			workerType: "thread",
			maxWorkers
		});
		taskUtil.registerCleanupTask((force) => {
			const attemptPoolTermination = async () => {
				log.verbose(`Attempt to terminate the workerpool...`);

				if (!pool) {
					return;
				}

				// There are many stats that could be used, but these ones seem the most
				// convenient. When all the (available) workers are idle, then it's safe to terminate.
				let {idleWorkers, totalWorkers} = pool.stats();
				while (idleWorkers !== totalWorkers && !force) {
					await setTimeoutPromise(100); // Wait a bit workers to finish and try again

					if (!pool) { // pool might have been terminated in the meantime
						return;
					}
					({idleWorkers, totalWorkers} = pool.stats());
				}

				const poolToBeTerminated = pool;
				pool = null;
				return poolToBeTerminated.terminate(force);
			};

			return attemptPoolTermination();
		});
	}
	return pool;
}

async function buildThemeInWorker(taskUtil, options, transferList) {
	const toTransfer = transferList ? {transfer: transferList} : undefined;

	return getPool(taskUtil).exec("execThemeBuild", [options], toTransfer);
}

/**
 * Builds the given theme resources, reading imports through <code>combo</code>. Uses the theme-builder
 * worker pool when a taskUtil is available, otherwise builds inline.
 *
 * @param {@ui5/fs/Resource[]} themeResources <code>library.source.less</code> resources to build
 * @param {@ui5/fs/AbstractReader} combo Prioritized workspace+dependencies reader for import resolution
 * @param {boolean} compress Whether to compress the produced CSS
 * @param {object} [taskUtil] TaskUtil, required for worker-pool execution
 * @returns {Promise<@ui5/fs/Resource[]>} The produced theme resources
 */
async function buildThemeResources(themeResources, combo, compress, taskUtil) {
	const useWorkers = !process.env.UI5_CLI_NO_WORKERS && !!taskUtil;
	if (useWorkers) {
		const threadMessageHandler = new FsMainThreadInterface(fsInterface(combo));
		const processedResources = await Promise.all(themeResources.map(async (themeRes) => {
			const {port1, port2} = new MessageChannel();
			threadMessageHandler.startCommunication(port1);

			const result = await buildThemeInWorker(taskUtil, {
				fsInterfacePort: port2,
				themeResources: await serializeResources([themeRes]),
				options: {compress},
			}, [port2]);

			threadMessageHandler.endCommunication(port1);
			return result;
		}))
			.then((resources) => Array.prototype.concat.apply([], resources))
			.then(deserializeResources);

		threadMessageHandler.cleanup();
		return processedResources;
	}

	const themeBuilder = (await import("../processors/themeBuilder.js")).default;
	return themeBuilder({
		resources: themeResources,
		fs: fsInterface(combo),
		options: {compress},
	});
}

/**
 * Determines whether a single theme should be built, probing the gating marker and sap.ui.core theme
 * folder for exactly this theme through <code>combo</code>. Mirrors the batch <code>isAvailable</code>
 * check below, reduced to one theme and using targeted <code>byPath</code> probes so the probed paths
 * are recorded as inputs of the owning processEach step: an absent marker created later, or a present
 * marker removed, invalidates exactly this theme's step on a delta build.
 *
 * @param {@ui5/fs/Resource} themeResource The <code>library.source.less</code> resource of the theme
 * @param {@ui5/fs/AbstractReader} combo Prioritized workspace+dependencies reader (recording)
 * @param {object} patterns
 * @param {string} [patterns.librariesPattern] Marks that a <code>library.js</code>/<code>.library</code>
 *   marker gates the theme (set when the theme library is built as a dependency)
 * @param {string} [patterns.themesPattern] Search pattern for sap.ui.core theme folders
 * @returns {Promise<boolean>} Whether the theme should be built
 */
async function isThemeAvailable(themeResource, combo, {librariesPattern, themesPattern}) {
	const resourcePath = themeResource.getPath();
	const themeName = path.basename(path.dirname(resourcePath));

	let libraryAvailable = true;
	if (librariesPattern) {
		// The library root is the namespace directory owning the theme, i.e. the path up to `/themes/`.
		// Probe both marker candidates by path so an absent marker is recorded too, enabling add/remove
		// deltas to invalidate this theme.
		const libraryRoot = resourcePath.substring(0, resourcePath.lastIndexOf("/themes/"));
		const [dotLibrary, libraryJs] = await Promise.all([
			combo.byPath(`${libraryRoot}/.library`),
			combo.byPath(`${libraryRoot}/library.js`),
		]);
		libraryAvailable = !!(dotLibrary || libraryJs);
		if (!libraryAvailable) {
			log.silly(`Skipping ${resourcePath}: Library is not available`);
		}
	}

	let themeAvailable = true;
	if (themesPattern) {
		const availableThemes = (await combo.byGlob(themesPattern, {nodir: false}))
			.filter((resource) => resource.getStatInfo().isDirectory())
			.map((resource) => path.basename(resource.getPath()));
		// As in the batch check: if no sap.ui.core theme folders exist at all, build all themes; the
		// themesPattern only narrows the set when such folders are present.
		if (availableThemes.length > 0) {
			themeAvailable = availableThemes.includes(themeName);
			if (!themeAvailable) {
				log.verbose(`Skipping ${resourcePath}: sap.ui.core theme '${themeName}' is not available. ` +
					"If you experience missing themes, check whether you have added the corresponding theme " +
					"library to your projects dependencies and make sure that your custom themes contain " +
					"resources for the sap.ui.core namespace.");
			}
		}
	}

	return libraryAvailable && themeAvailable;
}

/**
 * @public
 * @module @ui5/builder/tasks/buildThemes
 */
/**
 * Task to build a library theme.
 *
 * When a build cache is available, each theme's <code>library.source.less</code> is built as its own
 * cached [processEach]{@link @ui5/project/build/helpers/TaskUtil#processEach} step. A step probes only
 * the gating marker and imports of its own theme, so a delta build rebuilds only the affected theme and
 * leaves the others served from cache. Without a build cache the task builds all available themes in one
 * batch.
 *
 * @public
 * @function default
 * @static
 *
 * @param {object} parameters Parameters
 * @param {@ui5/fs/DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {@ui5/fs/AbstractReader} parameters.dependencies Reader or Collection to read dependency files
 * @param {@ui5/builder/tasks/TaskUtil|object} [parameters.taskUtil] TaskUtil instance.
 *    Required to run buildThemes in parallel execution mode.
 * @param {object} parameters.options Options
 * @param {string} parameters.options.projectName Project name
 * @param {string} parameters.options.inputPattern Search pattern for *.less files to be built
 * @param {string} [parameters.options.librariesPattern] Search pattern for .library files
 * @param {string} [parameters.options.themesPattern] Search pattern for sap.ui.core theme folders
 * @param {boolean} [parameters.options.compress=true]
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
export default async function({
	workspace, dependencies, taskUtil,
	options: {
		projectName, inputPattern, librariesPattern, themesPattern, compress,
	}
}) {
	compress = compress === undefined ? true : compress;

	if (taskUtil?.processEach) {
		const themeResources = await workspace.byGlob(inputPattern);
		await taskUtil.processEach("themes", themeResources,
			async (themeResource, {workspace, dependencies, taskUtil}) => {
				// Prioritize workspace over dependencies, as the batch path does. Reads through this combo
				// are attributed to this step, so the marker probe and import resolution become tracked
				// inputs of this specific theme.
				const combo = new ReaderCollectionPrioritized({
					name: `theme - prioritize workspace over dependencies: ${projectName}`,
					readers: dependencies ? [workspace, dependencies] : [workspace],
				});
				if (!(await isThemeAvailable(themeResource, combo, {librariesPattern, themesPattern}))) {
					// The gating marker/theme folder is missing: write nothing. The probes above are recorded,
					// so a later marker creation re-runs this step and builds the theme.
					return;
				}
				const processedResources = await buildThemeResources([themeResource], combo, compress, taskUtil);
				await Promise.all(processedResources.map((resource) => workspace.write(resource)));
			});
		return;
	}

	// Standalone use without a build cache: build all available themes in one batch.
	const combo = new ReaderCollectionPrioritized({
		name: `theme - prioritize workspace over dependencies: ${projectName}`,
		readers: [workspace, dependencies]
	});

	const pThemeResources = workspace.byGlob(inputPattern);
	let pAvailableLibraries;
	let pAvailableThemes;
	if (librariesPattern) {
		// If a librariesPattern is given
		//	we will use it to reduce the set of libraries a theme will be built for
		pAvailableLibraries = combo.byGlob(librariesPattern);
	}
	if (themesPattern) {
		// If a themesPattern is given
		//	we will use it to reduce the set of themes that will be built
		pAvailableThemes = combo.byGlob(themesPattern, {nodir: false});
	}

	/* Don't try to build themes for libraries that are not available
	(maybe replace this with something more aware of which dependencies are optional and therefore
		legitimately missing and which not (fault case))
		*/
	let availableLibraries;
	if (pAvailableLibraries) {
		availableLibraries = [];
		(await pAvailableLibraries).forEach((resource) => {
			const library = path.dirname(resource.getPath());
			if (!availableLibraries.includes(library)) {
				availableLibraries.push(library);
			}
		});
	}
	let availableThemes;
	if (pAvailableThemes) {
		availableThemes = (await pAvailableThemes)
			.filter((resource) => resource.getStatInfo().isDirectory())
			.map((resource) => {
				return path.basename(resource.getPath());
			});
	}

	let themeResources = await pThemeResources;

	const isAvailable = function(resource) {
		let libraryAvailable = false;
		let themeAvailable = false;
		const resourcePath = resource.getPath();
		const themeName = path.basename(path.dirname(resourcePath));

		if (!availableLibraries || availableLibraries.length === 0) {
			libraryAvailable = true; // If no libraries are found, build themes for all libraries
		} else {
			for (let i = availableLibraries.length - 1; i >= 0; i--) {
				if (resourcePath.startsWith(availableLibraries[i])) {
					libraryAvailable = true;
				}
			}
		}

		if (!availableThemes || availableThemes.length === 0) {
			themeAvailable = true; // If no themes are found, build all themes
		} else {
			themeAvailable = availableThemes.includes(themeName);
		}

		if (log.isLevelEnabled("verbose")) {
			if (!libraryAvailable) {
				log.silly(`Skipping ${resourcePath}: Library is not available`);
			}
			if (!themeAvailable) {
				log.verbose(`Skipping ${resourcePath}: sap.ui.core theme '${themeName}' is not available. ` +
				"If you experience missing themes, check whether you have added the corresponding theme " +
				"library to your projects dependencies and make sure that your custom themes contain " +
				"resources for the sap.ui.core namespace.");
			}
		}

		// Only build if library and theme are available
		return libraryAvailable && themeAvailable;
	};

	if (availableLibraries || availableThemes) {
		if (log.isLevelEnabled("verbose")) {
			log.verbose("Filtering themes to be built:");
			if (availableLibraries) {
				log.verbose(`Available libraries: ${availableLibraries.join(", ")}`);
			}
			if (availableThemes) {
				log.verbose(`Available sap.ui.core themes: ${availableThemes.join(", ")}`);
			}
		}
		themeResources = themeResources.filter(isAvailable);
	}

	const processedResources = await buildThemeResources(themeResources, combo, compress, taskUtil);

	await Promise.all(processedResources.map((resource) => {
		return workspace.write(resource);
	}));
}
