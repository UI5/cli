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

// Prototype task using the declarative "new task system". Instead of executing directly, this task
// registers via newTaskSystem.forEachResource(); the system decides when and with which resources to
// invoke the callback (all matching `library.source.less` on a full build, only affected ones on a
// delta build). Each invocation processes exactly ONE theme's `.source.less`.
//
// The key delta-correctness property closed here (contrast the original buildThemes.js, which has no
// differential support and rebuilds EVERY theme on any tracked-input change): each invocation probes
// the specific `library.js`/`.library` marker (and, if configured, the sap.ui.core theme folder) that
// gates ITS theme, through the per-invocation recording combo. Adding or removing such a marker is
// then attributed to exactly one theme invocation:
//  - add  -> a previously-absent marker is created; the invocation that probed it is re-run and builds
//            its theme; other themes stay served from cache.
//  - remove -> the marker is deleted; the invocation is re-run, now finds its theme unavailable, writes
//            nothing, and the outputs it previously owned are dropped (not resurrected) by the system's
//            per-invocation write tracking.
//
// Open follow-ups touching this task (process.env as a non-resource input, the less-openui5 processor
// version not invalidating the cache, resource-tag propagation through the per-invocation layer) are
// tracked in ../../../project/lib/build/helpers/NewTaskSystem.open-gaps.md
export default async function({
	newTaskSystem,
	options: {
		projectName, inputPattern, librariesPattern, themesPattern, compress,
	}
}) {
	compress = compress === undefined ? true : compress;

	newTaskSystem.forEachResource(inputPattern, async (themeRes, {workspace, dependencies, taskUtil}) => {
		// Prioritize workspace over dependencies, exactly as the original task's `combo`. Reads through
		// this combo are attributed to THIS invocation, so the marker probes below become tracked
		// inputs of this specific theme.
		const combo = new ReaderCollectionPrioritized({
			name: `theme - prioritize workspace over dependencies: ${projectName}`,
			readers: dependencies ? [workspace, dependencies] : [workspace]
		});

		if (!(await isThemeAvailable(themeRes, combo, {librariesPattern, themesPattern}))) {
			// Theme not available (its gating marker/theme folder is missing): write nothing. The
			// marker probe(s) performed in isThemeAvailable are recorded as inputs, so a later creation
			// of a marker re-runs this invocation and builds the theme.
			return;
		}

		let processedResources;
		const useWorkers = !process.env.UI5_CLI_NO_WORKERS && !!taskUtil;
		if (useWorkers) {
			const threadMessageHandler = new FsMainThreadInterface(fsInterface(combo));
			const {port1, port2} = new MessageChannel();
			threadMessageHandler.startCommunication(port1);

			const result = await buildThemeInWorker(taskUtil, {
				fsInterfacePort: port2,
				themeResources: await serializeResources([themeRes]),
				options: {
					compress,
				},
			}, [port2]);

			threadMessageHandler.endCommunication(port1);
			threadMessageHandler.cleanup();
			processedResources = await deserializeResources(result);
		} else {
			// Do not use workerpool
			const themeBuilder = (await import("../processors/themeBuilder.js")).default;

			processedResources = await themeBuilder({
				resources: [themeRes],
				fs: fsInterface(combo),
				options: {
					compress,
				}
			});
		}

		await Promise.all(processedResources.map((resource) => {
			return workspace.write(resource);
		}));
	});
}

/**
 * Determines whether a single theme (identified by its `library.source.less` resource) should be built,
 * probing the gating marker/theme folder for exactly this theme through the given (recording) combo.
 *
 * Mirrors the `isAvailable` logic of the original buildThemes.js, but reduced to one resource and using
 * targeted probes so the probed paths are recorded as inputs of the owning invocation:
 *  - `librariesPattern` (set only when the theme-library is built as a dependency): the theme is built
 *    only if a `library.js` or `.library` marker exists for the owning library namespace. We derive the
 *    library root from the `.source.less` path and probe both marker candidates via byPath, so an absent
 *    marker is still recorded (enabling add/remove deltas).
 *  - `themesPattern` (set only as a dependency): the theme is built only if the sap.ui.core theme folder
 *    of the same theme name is available.
 * When neither pattern is configured (root project build), all themes are built.
 *
 * @param {@ui5/fs/Resource} themeRes The `library.source.less` resource of the theme
 * @param {@ui5/fs/AbstractReader} combo Prioritized workspace+dependencies reader (recording)
 * @param {object} patterns
 * @param {string} [patterns.librariesPattern] Search pattern for `.library`/`library.js` markers
 * @param {string} [patterns.themesPattern] Search pattern for sap.ui.core theme folders
 * @returns {Promise<boolean>} Whether the theme should be built
 */
async function isThemeAvailable(themeRes, combo, {librariesPattern, themesPattern}) {
	const resourcePath = themeRes.getPath();
	const themeName = path.basename(path.dirname(resourcePath));

	let libraryAvailable = true;
	if (librariesPattern) {
		// Library root is the namespace directory that owns the theme, i.e. the path up to `/themes/...`.
		// E.g. `/resources/lib/two/themes/my_theme/library.source.less` -> `/resources/lib/two`.
		const themesSegmentIndex = resourcePath.lastIndexOf("/themes/");
		const libraryRoot = resourcePath.substring(0, themesSegmentIndex);
		// Probe the concrete marker candidates for this library. byPath records the probe even when the
		// marker is absent, so creating/removing it later invalidates exactly this invocation.
		const [dotLibrary, libraryJs] = await Promise.all([
			combo.byPath(`${libraryRoot}/.library`),
			combo.byPath(`${libraryRoot}/library.js`),
		]);
		libraryAvailable = !!(dotLibrary || libraryJs);
		if (!libraryAvailable && log.isLevelEnabled("verbose")) {
			log.silly(`Skipping ${resourcePath}: Library is not available`);
		}
	}

	let themeAvailable = true;
	if (themesPattern) {
		const availableThemes = (await combo.byGlob(themesPattern, {nodir: false}))
			.filter((resource) => resource.getStatInfo().isDirectory())
			.map((resource) => path.basename(resource.getPath()));
		// Mirror the original task: if no sap.ui.core theme folders are found at all, build all themes
		// (the themesPattern filter only narrows when such folders are actually present).
		if (availableThemes.length > 0) {
			themeAvailable = availableThemes.includes(themeName);
			if (!themeAvailable && log.isLevelEnabled("verbose")) {
				log.verbose(`Skipping ${resourcePath}: sap.ui.core theme '${themeName}' is not available. ` +
					"If you experience missing themes, check whether you have added the corresponding theme " +
					"library to your projects dependencies and make sure that your custom themes contain " +
					"resources for the sap.ui.core namespace.");
			}
		}
	}

	return libraryAvailable && themeAvailable;
}
