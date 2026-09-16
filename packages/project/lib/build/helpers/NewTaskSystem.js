import {getLogger} from "@ui5/logger";

const log = getLogger("build:helpers:NewTaskSystem");

/**
 * Per-invocation recording wrapper around the task-level monitored workspace.
 *
 * Every read/write is delegated to the underlying (task-level) monitored workspace, so the task's
 * overall resource requests are still captured once via that monitor's getResourceRequests(). In
 * addition, this wrapper records the paths/patterns THIS particular callback invocation read, which
 * is what lets a delta build map a changed input resource (e.g. a `.js.map`) back to the specific
 * forEachResource callback invocation that read it (e.g. the one processing the owning `.js`).
 */
class InvocationRecordingWorkspace {
	#workspace;
	#readPaths = new Set();

	constructor(workspace) {
		this.#workspace = workspace;
	}

	getReadPaths() {
		return this.#readPaths;
	}

	async byPath(virPath, options) {
		this.#readPaths.add(this.#resolve(virPath));
		return this.#workspace.byPath(virPath, options);
	}

	async byGlob(virPattern, options) {
		// For a glob read we can't attribute individual matched paths cheaply, so we record the
		// resolved matches after the fact.
		const resources = await this.#workspace.byGlob(virPattern, options);
		for (const resource of resources) {
			this.#readPaths.add(resource.getPath());
		}
		return resources;
	}

	async write(resource, options) {
		return this.#workspace.write(resource, options);
	}

	#resolve(virPath) {
		if (this.#workspace.resolvePath) {
			return this.#workspace.resolvePath(virPath) ?? virPath;
		}
		return virPath;
	}
}

/**
 * Adapter implementing the declarative "new task system" API.
 *
 * A new-system task's default export runs once and only REGISTERS its intent via forEachResource().
 * It does not process anything itself. After registration completes, the adapter drives the callbacks:
 *
 * - Full build: invoke the callback for every resource matching the pattern.
 * - Delta build: invoke the callback only for the resources affected by the changed input paths,
 *   using the per-invocation read attribution recorded during the previous run to map a changed
 *   input path back to the invocation(s) that read it.
 *
 * This removes all incremental/delta bookkeeping from the task itself, which is where staleness bugs
 * such as the minify `.js.map` -> `-dbg.js.map` staleness (see minify.js FIXME) originate.
 *
 * PARKED (not handled by this prototype, tracked as follow-ups):
 *  - process.env and other non-resource inputs are non-deterministic and are not yet modeled as
 *    monitored/invalidating inputs.
 *  - A new terser (or other processor) version does not yet invalidate the cache.
 *  - Full resource-tag propagation through the per-invocation layer.
 */
export default class NewTaskSystem {
	#workspace;
	#taskUtil;
	#registrations = [];

	/**
	 * @param {object} params
	 * @param {object} params.workspace Task-level monitored workspace (from createMonitor())
	 * @param {object} [params.taskUtil] TaskUtil instance
	 */
	constructor({workspace, taskUtil}) {
		this.#workspace = workspace;
		this.#taskUtil = taskUtil;
	}

	/**
	 * Registers the need to run <code>callback</code> for every resource matching <code>pattern</code>.
	 * The callback is NOT invoked here; the surrounding system decides when and with which resources.
	 *
	 * @param {string|string[]} pattern Glob pattern selecting the resources to process
	 * @param {Function} callback <code>async (resource, {workspace, taskUtil}) => {}</code>
	 */
	forEachResource(pattern, callback) {
		this.#registrations.push({pattern, callback});
	}

	/**
	 * Drives all registered callbacks. Called by the TaskRunner after the task's default export
	 * has returned (registration complete).
	 *
	 * @param {object} [cacheInfo] Falsy for a full build; the delta object
	 *   ({changedProjectResourcePaths, ...}) for a differential build
	 * @param {Map<string, string[]>} [previousInvocationReads] Map of primary resource path ->
	 *   read paths recorded during the previous run (used to select delta invocations)
	 * @returns {Promise<Map<string, string[]>>} Map of primary resource path -> read paths recorded
	 *   during this run, to be persisted for the next delta build
	 */
	async run(cacheInfo, previousInvocationReads) {
		const invocationReads = new Map();
		const usingDelta = !!(cacheInfo && cacheInfo.changedProjectResourcePaths);

		for (const {pattern, callback} of this.#registrations) {
			let resources;
			if (usingDelta) {
				resources = await this.#selectDeltaResources(
					pattern, cacheInfo.changedProjectResourcePaths, previousInvocationReads);
			} else {
				resources = await this.#workspace.byGlob(pattern);
			}

			for (const resource of resources) {
				const invocationWorkspace = new InvocationRecordingWorkspace(this.#workspace);
				await callback(resource, {
					workspace: invocationWorkspace,
					taskUtil: this.#taskUtil,
				});
				invocationReads.set(resource.getPath(), [...invocationWorkspace.getReadPaths()]);
			}
		}
		return invocationReads;
	}

	/**
	 * Selects which resources to (re-)process on a delta build for the given pattern.
	 *
	 * A resource is selected if it is itself among the changed paths, OR if a previous invocation
	 * processing it read one of the changed paths (e.g. the `foo.js` invocation read `foo.js.map`,
	 * and `foo.js.map` changed). This is the reverse mapping that fixes the source-map staleness.
	 *
	 * @param {string|string[]} pattern Glob pattern selecting the resources to process
	 * @param {string[]} changedPaths Resource paths reported as changed since the cached signature
	 * @param {Map<string, string[]>} [previousInvocationReads] Map of primary resource path ->
	 *   read paths recorded during the previous run
	 * @returns {Promise<@ui5/fs/Resource[]>} Resources to (re-)process
	 */
	async #selectDeltaResources(pattern, changedPaths, previousInvocationReads) {
		const changed = new Set(changedPaths);
		const selectedPaths = new Set();

		// 1. Directly changed resources matching the pattern.
		for (const changedPath of changed) {
			selectedPaths.add(changedPath);
		}

		// 2. Resources whose previous invocation read a changed path (cross-resource dependency).
		if (previousInvocationReads) {
			for (const [primaryPath, readPaths] of previousInvocationReads) {
				if (readPaths.some((readPath) => changed.has(readPath))) {
					selectedPaths.add(primaryPath);
				}
			}
		}

		// Resolve the selected paths to actual resources, keeping only those that match the pattern
		// and still exist (a changed path may be an input like a `.map` that is not itself a
		// pattern match — byPath below returns it, but the callback only processes what it globs).
		const matching = await this.#workspace.byGlob(pattern);
		const matchingByPath = new Map(matching.map((r) => [r.getPath(), r]));
		const resources = [];
		for (const path of selectedPaths) {
			const resource = matchingByPath.get(path);
			if (resource) {
				resources.push(resource);
			}
		}
		log.verbose(
			`Delta selection for pattern ${JSON.stringify(pattern)}: ${resources.length} resource(s) ` +
			`from ${changed.size} changed path(s)`);
		return resources;
	}
}
