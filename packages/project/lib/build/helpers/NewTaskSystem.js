import {getLogger} from "@ui5/logger";
import AbstractReader from "@ui5/fs/AbstractReader";
import AbstractReaderWriter from "@ui5/fs/AbstractReaderWriter";

const log = getLogger("build:helpers:NewTaskSystem");

/**
 * Per-invocation recorder shared by the recording reader/writer wrappers below. Collects the
 * paths a single forEachResource callback invocation read and the paths it wrote. This is
 * what lets a delta build:
 *  - map a changed input resource (e.g. a `.js.map`, or a theme's `library.js` marker) back to the
 *    specific invocation that read it (via `reads`), and
 *  - drop an output an invocation previously owned but no longer produces (via `writes`), so a
 *    removed input does not leave stale output behind (resurrected from the previous stage cache).
 *
 * Project and dependency reads are kept in separate buckets so they can be folded back into the
 * task's project vs. dependency request graph independently (see ProjectBuildCache.recordTaskResult
 * and open-gaps §7): folding a dependency path into the project graph would resolve it against the
 * project reader and corrupt the signature.
 */
class InvocationRecorder {
	reads = new Set();
	dependencyReads = new Set();
	writes = new Set();

	recordProjectRead(path) {
		this.reads.add(path);
	}

	recordDependencyRead(path) {
		this.dependencyReads.add(path);
	}

	recordWrite(path) {
		this.writes.add(path);
	}
}

/**
 * Records the reads made against a plain reader (e.g. the dependencies reader) during one invocation.
 * Every read is delegated to the underlying (task-level monitored) reader, so the task's overall
 * resource requests are still captured once via that monitor; this wrapper additionally attributes
 * the reads to the current invocation.
 *
 * Extends AbstractReader so it can be composed into a ReaderCollectionPrioritized alongside the
 * recording workspace, exactly like the task builds its combo today.
 */
class InvocationRecordingReader extends AbstractReader {
	#reader;
	#recorder;

	constructor(reader, recorder) {
		super(reader.getName());
		this.#reader = reader;
		this.#recorder = recorder;
	}

	async _byGlob(virPattern, options, trace) {
		// For a glob read we can't attribute individual matched paths cheaply, so we record the
		// resolved matches after the fact.
		const resources = await this.#reader._byGlob(virPattern, options, trace);
		for (const resource of resources) {
			this.#recorder.recordDependencyRead(resource.getPath());
		}
		return resources;
	}

	async _byPath(virPath, options, trace) {
		// Record the probed path verbatim, even when it resolves to nothing: probing an absent path
		// (e.g. a theme's `library.js` marker that does not exist yet) must count as an input, so a
		// later creation of that path invalidates this invocation on a delta build.
		this.#recorder.recordDependencyRead(virPath);
		return this.#reader._byPath(virPath, options, trace);
	}
}

/**
 * Records the reads AND writes made against the task-level monitored workspace during one invocation.
 * Reads are attributed like InvocationRecordingReader; writes are attributed so a delta rerun can drop
 * outputs the invocation no longer produces. All operations delegate to the underlying workspace.
 */
class InvocationRecordingReaderWriter extends AbstractReaderWriter {
	#workspace;
	#recorder;

	constructor(workspace, recorder) {
		super(workspace.getName());
		this.#workspace = workspace;
		this.#recorder = recorder;
	}

	async _byGlob(virPattern, options, trace) {
		const resources = await this.#workspace._byGlob(virPattern, options, trace);
		for (const resource of resources) {
			this.#recorder.recordProjectRead(resource.getPath());
		}
		return resources;
	}

	async _byPath(virPath, options, trace) {
		this.#recorder.recordProjectRead(virPath);
		return this.#workspace._byPath(virPath, options, trace);
	}

	async _write(resource, options) {
		this.#recorder.recordWrite(resource.getPath());
		return this.#workspace.write(resource, options);
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
 * such as the minify `.js.map` -> `-dbg.js.map` staleness (see minify.js FIXME) and the buildThemes
 * per-theme delta gap (a marker change rebuilding ALL themes) originate.
 *
 * PARKED (not handled by this prototype, tracked as follow-ups in NewTaskSystem.open-gaps.md):
 *  - process.env and other non-resource inputs are non-deterministic and are not yet modeled as
 *    monitored/invalidating inputs.
 *  - A new processor version (terser, less-openui5, cheerio) does not yet invalidate the cache.
 *  - Full resource-tag propagation through the per-invocation layer.
 */
export default class NewTaskSystem {
	#workspace;
	#dependencies;
	#taskUtil;
	#registrations = [];

	/**
	 * @param {object} params
	 * @param {object} params.workspace Task-level monitored workspace (from createMonitor())
	 * @param {object} [params.dependencies] Task-level monitored dependencies reader (from createMonitor()),
	 *   only present for tasks that require dependencies
	 * @param {object} [params.taskUtil] TaskUtil instance
	 */
	constructor({workspace, dependencies, taskUtil}) {
		this.#workspace = workspace;
		this.#dependencies = dependencies;
		this.#taskUtil = taskUtil;
	}

	/**
	 * Registers the need to run <code>callback</code> for every resource matching <code>pattern</code>.
	 * The callback is NOT invoked here; the surrounding system decides when and with which resources.
	 *
	 * @param {string|string[]} pattern Glob pattern selecting the resources to process
	 * @param {Function} callback <code>async (resource, {workspace, dependencies, taskUtil}) => {}</code>
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
	 * @param {Map<string, object>} [previousInvocationData] Map of primary resource path ->
	 *   {reads, dependencyReads, writes} recorded during the previous run (used to select delta
	 *   invocations and to drop stale outputs)
	 * @returns {Promise<object>} <code>{invocationData, staleOutputs}</code>: the per-invocation
	 *   {reads, dependencyReads, writes} recorded during this run (to persist for the next delta
	 *   build), and the set of output paths that a rerun invocation previously owned but no longer
	 *   produced (to be dropped so they are not resurrected from the previous stage cache).
	 *
	 *   On a delta build only the re-driven invocations run, so their fresh entries are merged over
	 *   the previous run's map (current wins per primary path) rather than replacing it — subsequent
	 *   builds need the COMPLETE cross-build read set to fold reads back into the cache index (see
	 *   ProjectBuildCache.recordTaskResult and open-gaps §7). Primaries whose resource no longer
	 *   matches any registered pattern are pruned so removed inputs do not linger.
	 */
	async run(cacheInfo, previousInvocationData) {
		const invocationData = new Map();
		const staleOutputs = new Set();
		const usingDelta = !!(cacheInfo && cacheInfo.changedProjectResourcePaths);
		// On a delta build, the set of primary paths still matching any registered pattern. Used to
		// prune previous-run entries whose primary no longer exists (e.g. a theme's deleted
		// `.source.less`), while keeping entries that were simply not re-driven this build.
		const currentPrimaryPaths = usingDelta ? new Set() : null;

		for (const {pattern, callback} of this.#registrations) {
			let resources;
			if (usingDelta) {
				for (const resource of await this.#workspace.byGlob(pattern)) {
					currentPrimaryPaths.add(resource.getPath());
				}
				resources = await this.#selectDeltaResources(
					pattern, cacheInfo.changedProjectResourcePaths,
					cacheInfo.changedDependencyResourcePaths, previousInvocationData);
			} else {
				resources = await this.#workspace.byGlob(pattern);
			}

			// Invoke the callback for every selected resource in PARALLEL. This lets a task offload
			// work to workers and process several resources concurrently. Registrations are still
			// processed sequentially (the enclosing loop), but the resources of one registration are
			// not serialized against each other.
			//
			// Safety of the parallelism:
			//  - Each invocation gets its OWN InvocationRecorder plus its own recording
			//    reader/writer wrappers, so read/write attribution never bleeds between invocations.
			//  - The shared bookkeeping mutated below is collision-free: invocationData is keyed by the
			//    invocation's unique primaryPath (one entry per resource), and staleOutputs is a Set
			//    whose add() is idempotent. JS runs these synchronously between await points, so there
			//    is no torn read/write of the Map or Set.
			//  - Interactions with the workspace / dependencies / taskUtil are order-independent by
			//    design: the underlying monitored workspace only ADDS to request Sets, and each
			//    invocation writes its own output path(s). It is therefore fine for a later invocation
			//    to write before an earlier one — writes do not observe each other, and caching keys
			//    off the recorded per-invocation reads/writes, not their wall-clock order.
			await Promise.all(resources.map(async (resource) => {
				const recorder = new InvocationRecorder();
				const invocationWorkspace = new InvocationRecordingReaderWriter(this.#workspace, recorder);
				const invocationDependencies = this.#dependencies ?
					new InvocationRecordingReader(this.#dependencies, recorder) : undefined;
				await callback(resource, {
					workspace: invocationWorkspace,
					dependencies: invocationDependencies,
					taskUtil: this.#taskUtil,
				});
				const primaryPath = resource.getPath();
				invocationData.set(primaryPath, {
					reads: [...recorder.reads],
					dependencyReads: [...recorder.dependencyReads],
					writes: [...recorder.writes],
				});

				// A rerun invocation may now write fewer outputs than before. Any path it previously
				// owned but did not (re-)write this run is stale and must be dropped from the merge.
				if (usingDelta && previousInvocationData) {
					const previous = previousInvocationData.get(primaryPath);
					if (previous) {
						for (const previousWrite of previous.writes) {
							if (!recorder.writes.has(previousWrite)) {
								staleOutputs.add(previousWrite);
							}
						}
					}
				}
			}));
		}

		if (usingDelta && previousInvocationData) {
			// Fold the previous run's invocations under the current run's, so the persisted map stays
			// the complete cross-build read set. A re-driven invocation (present in invocationData)
			// wins, dropping any read/write it no longer performs; a primary that no longer matches any
			// pattern is pruned entirely.
			const merged = new Map();
			for (const [primaryPath, entry] of previousInvocationData) {
				if (invocationData.has(primaryPath) || !currentPrimaryPaths.has(primaryPath)) {
					continue;
				}
				merged.set(primaryPath, entry);
			}
			for (const [primaryPath, entry] of invocationData) {
				merged.set(primaryPath, entry);
			}
			return {invocationData: merged, staleOutputs: [...staleOutputs]};
		}
		return {invocationData, staleOutputs: [...staleOutputs]};
	}

	/**
	 * Selects which resources to (re-)process on a delta build for the given pattern.
	 *
	 * A resource is selected if it is itself among the changed paths, OR if a previous invocation
	 * processing it read one of the changed paths. Two kinds of read are matched:
	 *  - a project `read` against a changed PROJECT path (e.g. the `foo.js` invocation read
	 *    `foo.js.map`, and `foo.js.map` changed; or a theme's invocation probed its `library.js`
	 *    marker, and the marker was added/removed), and
	 *  - a `dependencyRead` against a changed DEPENDENCY path — the cross-project sibling: a theme
	 *    whose `library.source.less` `@import`s the base theme LESS of another (dependency) library
	 *    recorded that base LESS as a dependency read; when it changes, the theme must rebuild so its
	 *    compiled CSS reflects the new base (see open-gaps §7's cross-project sibling and the
	 *    BuildServer.integration.js theme.library.e `@import` test).
	 * This is the reverse mapping that fixes cross-resource staleness.
	 *
	 * @param {string|string[]} pattern Glob pattern selecting the resources to process
	 * @param {string[]} changedProjectPaths Project resource paths reported as changed
	 * @param {string[]} [changedDependencyPaths] Dependency resource paths reported as changed
	 * @param {Map<string, object>} [previousInvocationData] Map of primary resource path ->
	 *   {reads, dependencyReads, writes} recorded during the previous run. Project `reads` are matched
	 *   against the changed PROJECT paths; `dependencyReads` against the changed DEPENDENCY paths.
	 * @returns {Promise<@ui5/fs/Resource[]>} Resources to (re-)process
	 */
	async #selectDeltaResources(pattern, changedProjectPaths, changedDependencyPaths, previousInvocationData) {
		const changed = new Set(changedProjectPaths);
		const changedDependencies = new Set(changedDependencyPaths ?? []);
		const selectedPaths = new Set();

		// 1. Directly changed resources matching the pattern.
		for (const changedPath of changed) {
			selectedPaths.add(changedPath);
		}

		// 2. Resources whose previous invocation read a changed path (cross-resource dependency).
		//    Project reads match changed project paths; dependency reads match changed dependency
		//    paths (a cross-project `@import` of a dependency library's `.source.less`).
		if (previousInvocationData) {
			for (const [primaryPath, {reads, dependencyReads}] of previousInvocationData) {
				if (reads.some((readPath) => changed.has(readPath)) ||
					(dependencyReads ?? []).some((readPath) => changedDependencies.has(readPath))) {
					selectedPaths.add(primaryPath);
				}
			}
		}

		// Resolve the selected paths to actual resources, keeping only those that match the pattern
		// and still exist (a changed path may be an input like a `.map` or a marker that is not itself
		// a pattern match — byGlob below returns only what the callback should process).
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
			`from ${changed.size} changed project and ${changedDependencies.size} changed dependency path(s)`);
		return resources;
	}
}
