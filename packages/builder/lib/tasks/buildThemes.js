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
 * @public
 * @module @ui5/builder/tasks/buildThemes
 */
/**
 * Task to build a library theme.
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
 * @param {boolean} [parameters.options.cssVariables=false]
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
export default async function({
	workspace, dependencies, taskUtil,
	options: {
		projectName, inputPattern, librariesPattern, themesPattern, compress,
		cssVariables
	}
}) {
	const combo = new ReaderCollectionPrioritized({
		name: `theme - prioritize workspace over dependencies: ${projectName}`,
		readers: [workspace, dependencies]
	});

	compress = compress === undefined ? true : compress;

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

	let processedResources;
	const useWorkers = !!taskUtil;
	if (useWorkers) {
		const threadMessageHandler = new FsMainThreadInterface(fsInterface(combo));

		processedResources = await Promise.all(themeResources.map(async (themeRes) => {
			const {port1, port2} = new MessageChannel();
			threadMessageHandler.startCommunication(port1);

			const result = await buildThemeInWorker(taskUtil, {
				fsInterfacePort: port2,
				themeResources: await serializeResources([themeRes]),
				options: {
					compress,
					cssVariables: !!cssVariables,
				},
			}, [port2]);

			threadMessageHandler.endCommunication(port1);

			return result;
		}))
			.then((resources) => Array.prototype.concat.apply([], resources))
			.then(deserializeResources);

		threadMessageHandler.cleanup();
	} else {
		// Do not use workerpool
		const themeBuilder = (await import("../processors/themeBuilder.js")).default;

		processedResources = await themeBuilder({
			resources: themeResources,
			fs: fsInterface(combo),
			options: {
				compress,
				cssVariables: !!cssVariables,
			}
		});
	}

	await Promise.all(processedResources.map((resource) => {
		return workspace.write(resource);
	}));
}
