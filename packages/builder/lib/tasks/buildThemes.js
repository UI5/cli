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
 * A step-based task: the default export is a factory returning one map step with a key per theme's
 * <code>library.source.less</code>. A step probes only the gating marker and imports of its own theme,
 * so a delta build rebuilds only the affected theme and leaves the others served from cache. Standalone
 * invocation runs every theme through @ui5/builder's runSteps.
 *
 * @public
 * @function default
 * @static
 *
 * @param {object} options Options
 * @param {string} options.projectName Project name
 * @param {string} options.inputPattern Search pattern for *.less files to be built
 * @param {string} [options.librariesPattern] Search pattern for .library files
 * @param {string} [options.themesPattern] Search pattern for sap.ui.core theme folders
 * @param {boolean} [options.compress=true]
 * @returns {object[]} The task's build steps
 */
export default function build({projectName, inputPattern, librariesPattern, themesPattern, compress}) {
	compress = compress === undefined ? true : compress;

	return [{
		name: "buildThemes",
		// One key per theme's library.source.less, so a delta build rebuilds only the affected theme.
		keys: async ({workspace}) => workspace.byGlob(inputPattern),
		each: async (themeResource, {workspace, dependencies, taskUtil}) => {
			// Prioritize workspace over dependencies. Reads through this combo are attributed to this step,
			// so the marker probe and import resolution become tracked inputs of this specific theme.
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
		},
	}];
}
