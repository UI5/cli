import AbstractReader from "@ui5/fs/AbstractReader";
import AbstractReaderWriter from "@ui5/fs/AbstractReaderWriter";
import {getLogger} from "@ui5/logger";

const log = getLogger("build:helpers:ProcessEach");

/**
 * Collects the reads and writes of a single processEach step. Project reads (workspace) and
 * dependency reads are kept apart so they can be folded back into the task's project vs. dependency
 * request graph independently: a dependency path folded into the project graph would resolve against
 * the wrong reader and corrupt the signature.
 */
class StepRecorder {
	projectReads = new Set();
	dependencyReads = new Set();
	writes = new Set();
}

/**
 * Records the reads a step makes against the dependencies reader. Every read is delegated to the
 * task-level (already monitored) reader, so the task's overall requests are still captured once via
 * that monitor; this wrapper additionally attributes the read to the current step.
 */
class RecordingReader extends AbstractReader {
	#reader;
	#recorder;

	constructor(reader, recorder) {
		super(reader.getName());
		this.#reader = reader;
		this.#recorder = recorder;
	}

	async _byGlob(virPattern, options) {
		const resources = await this.#reader.byGlob(virPattern, options);
		for (const resource of resources) {
			this.#recorder.dependencyReads.add(resource.getPath());
		}
		return resources;
	}

	async _byPath(virPath, options) {
		// Record the probed path verbatim, even when it resolves to nothing: probing an absent path
		// (e.g. a theme's not-yet-existing library marker) is an input, so a later creation of that
		// path must re-run this step on a delta build.
		this.#recorder.dependencyReads.add(virPath);
		return this.#reader.byPath(virPath, options);
	}
}

/**
 * Records the reads and writes a step makes against the workspace. Reads are attributed like
 * {@link RecordingReader}. Writes are attributed so a delta re-run can drop outputs a step no longer
 * produces, and are either persisted immediately (sequential mode) or buffered for an ordered flush
 * (concurrent mode).
 */
class RecordingReaderWriter extends AbstractReaderWriter {
	#workspace;
	#recorder;
	#writeBuffer;
	#stepIndex;

	/**
	 * @param {@ui5/fs/AbstractReaderWriter} workspace Task-level monitored workspace
	 * @param {StepRecorder} recorder Recorder for this step
	 * @param {Map<string, object>|null} writeBuffer Shared buffer for concurrent writes, or
	 *   <code>null</code> to write through immediately (sequential mode)
	 * @param {number} stepIndex Position of this step in the key order, used to flush buffered writes
	 *   deterministically and to detect two steps writing the same path
	 */
	constructor(workspace, recorder, writeBuffer, stepIndex) {
		super(workspace.getName());
		this.#workspace = workspace;
		this.#recorder = recorder;
		this.#writeBuffer = writeBuffer;
		this.#stepIndex = stepIndex;
	}

	async _byGlob(virPattern, options) {
		const resources = await this.#workspace.byGlob(virPattern, options);
		for (const resource of resources) {
			this.#recorder.projectReads.add(resource.getPath());
		}
		return resources;
	}

	async _byPath(virPath, options) {
		this.#recorder.projectReads.add(virPath);
		return this.#workspace.byPath(virPath, options);
	}

	async _write(resource, options) {
		const resourcePath = resource.getPath();
		this.#recorder.writes.add(resourcePath);
		if (this.#writeBuffer) {
			// Concurrent mode: buffer and flush in key order once all steps finish. Concurrent steps
			// are required to be independent, so two steps writing the same path is a contract
			// violation rather than a last-wins race.
			const existing = this.#writeBuffer.get(resourcePath);
			if (existing && existing.stepIndex !== this.#stepIndex) {
				throw new Error(
					`processEach: concurrent steps must not write the same resource path ${resourcePath}. ` +
					`Pass concurrent=false if a later step must build on an earlier step's writes.`);
			}
			this.#writeBuffer.set(resourcePath, {resource, options, stepIndex: this.#stepIndex});
			return;
		}
		// Sequential mode: persist immediately so a later step reads what this step wrote.
		return this.#workspace.write(resource, options);
	}
}

/**
 * Per-task driver behind <code>taskUtil.processEach(keys, callback, concurrent)</code>.
 *
 * A task iterates a set of keys, running <code>callback</code> once per key against per-step readers
 * that record what each step reads, writes, and (later) returns. The recording lets a delta build
 * re-run only the steps whose observed inputs changed and drop the outputs of steps that no longer
 * produce them, without any delta bookkeeping in the task itself.
 *
 * A key is identified by content: a resource key by its integrity (never its path, so a content
 * change is a different key and cannot yield a stale hit), a string key by its value. A compound key
 * is the caller's responsibility to express as a stable string.
 *
 * @private
 */
export default class ProcessEach {
	#workspace;
	#dependencies;
	#taskUtil;
	#cacheInfo;
	#previousInvocationData;
	#signal;

	// Populated by run(): the complete per-key invocation data to persist, and the output paths that
	// are no longer produced and must be dropped from the carried-forward stage.
	#invocationData;
	#staleOutputs = [];

	/**
	 * @param {object} parameters
	 * @param {@ui5/fs/AbstractReaderWriter} parameters.workspace Task-level monitored workspace
	 * @param {@ui5/fs/AbstractReader} [parameters.dependencies] Task-level monitored dependencies reader
	 * @param {object} parameters.taskUtil TaskUtil interface passed through to each step's callback
	 * @param {object} [parameters.cacheInfo] Delta info for a differential build, or falsy for a full build
	 * @param {Map<string, object>} [parameters.previousInvocationData] Per-key invocation data recorded
	 *   during the previous run of this task
	 * @param {AbortSignal} [parameters.signal] Build abort signal, checked between steps
	 */
	constructor({workspace, dependencies, taskUtil, cacheInfo, previousInvocationData, signal}) {
		this.#workspace = workspace;
		this.#dependencies = dependencies;
		this.#taskUtil = taskUtil;
		this.#cacheInfo = cacheInfo;
		this.#previousInvocationData = previousInvocationData;
		this.#signal = signal;
	}

	/**
	 * Runs <code>callback</code> once per key, caching each step's result.
	 *
	 * @param {Iterable} keys Resources or strings, as for a <code>map</code>
	 * @param {Function} callback <code>async (key, {workspace, dependencies, taskUtil}) => resource(s)</code>
	 * @param {boolean} [concurrent=true] Run steps concurrently (buffered writes flushed in key order)
	 *   or sequentially (writes visible to later steps immediately)
	 * @returns {Promise<Array>} Per-key results aligned to <code>keys</code> order
	 */
	async run(keys, callback, concurrent = true) {
		if (typeof callback !== "function") {
			throw new Error("processEach: callback must be a function");
		}
		const entries = await this.#resolveEntries(keys);
		const toRun = this.#selectStepsToRun(entries);

		const currentInvocationData = new Map();
		const results = new Array(entries.length);
		const writeBuffer = concurrent ? new Map() : null;

		const runStep = async ({key, keyId, index}) => {
			this.#signal?.throwIfAborted();
			const recorder = new StepRecorder();
			const workspace = new RecordingReaderWriter(this.#workspace, recorder, writeBuffer, index);
			const dependencies = this.#dependencies ?
				new RecordingReader(this.#dependencies, recorder) : undefined;

			results[index] = await callback(key, {workspace, dependencies, taskUtil: this.#taskUtil});
			currentInvocationData.set(keyId, {
				reads: [...recorder.projectReads],
				dependencyReads: [...recorder.dependencyReads],
				writes: [...recorder.writes],
			});
		};

		if (concurrent) {
			await Promise.all(toRun.map(runStep));
			await this.#flushWriteBuffer(writeBuffer);
		} else {
			for (const entry of toRun) {
				await runStep(entry);
			}
		}

		this.#invocationData = this.#mergeInvocationData(currentInvocationData, entries);
		this.#staleOutputs = this.#computeStaleOutputs(currentInvocationData, entries);

		if (log.isLevelEnabled("verbose")) {
			log.verbose(
				`Ran ${toRun.length} of ${entries.length} step(s); ` +
				`${this.#staleOutputs.length} stale output(s) to drop`);
		}
		return results;
	}

	/**
	 * The complete per-key invocation data to persist for the next build.
	 *
	 * @returns {Map<string, object>} Map of key identity to <code>{reads, dependencyReads, writes}</code>
	 */
	getInvocationData() {
		return this.#invocationData;
	}

	/**
	 * Output paths that a step produced on a previous build but no longer produces (a re-run step that
	 * writes fewer paths, or a key that is gone this build). These must be dropped from the stage that
	 * is otherwise carried forward from cache, so a removed input leaves no stale output behind.
	 *
	 * @returns {string[]} Paths to drop
	 */
	getStaleOutputs() {
		return this.#staleOutputs;
	}

	/**
	 * The union of every step's reads, as a resource-request set to fold into the task's request index.
	 * Steps not re-run this build contribute their persisted reads, so an input first seen on a delta
	 * build (a marker probe, a source map) stays tracked on the next build rather than being lost.
	 *
	 * @returns {{project: {paths: string[], patterns: string[]}, dependencies: {paths: string[], patterns: string[]}}}
	 */
	getResourceRequests() {
		const project = {paths: [], patterns: []};
		const dependencies = {paths: [], patterns: []};
		for (const data of this.#invocationData.values()) {
			project.paths.push(...data.reads);
			dependencies.paths.push(...(data.dependencyReads ?? []));
		}
		return {project, dependencies};
	}

	async #resolveEntries(keys) {
		return Promise.all([...keys].map(async (key, index) => ({
			key,
			index,
			keyId: await this.#keyId(key),
		})));
	}

	async #keyId(key) {
		if (key && typeof key.getIntegrity === "function") {
			return `resource:${await key.getIntegrity()}`;
		}
		if (typeof key === "string") {
			return `string:${key}`;
		}
		throw new Error(
			"processEach: keys must be resources or strings. " +
			"Express a compound key as a stable string.");
	}

	#selectStepsToRun(entries) {
		const previous = this.#previousInvocationData;
		if (!this.#cacheInfo || !previous) {
			// Full build: run every step.
			return entries;
		}
		const changedProject = new Set(this.#cacheInfo.changedProjectResourcePaths ?? []);
		const changedDependency = new Set(this.#cacheInfo.changedDependencyResourcePaths ?? []);
		return entries.filter(({keyId}) => {
			const prev = previous.get(keyId);
			if (!prev) {
				// New key (a new string key, or a resource whose changed content yields a new integrity).
				return true;
			}
			// A step whose recorded reads intersect the changed paths must re-run: this is the reverse
			// mapping that re-runs the owner of a changed cross-resource input (a .js whose .js.map
			// changed, a theme whose gating marker was added or removed).
			return prev.reads.some((path) => changedProject.has(path)) ||
				prev.dependencyReads.some((path) => changedDependency.has(path));
		});
	}

	#mergeInvocationData(current, entries) {
		if (!this.#cacheInfo || !this.#previousInvocationData) {
			return current;
		}
		// A delta build re-runs only some steps, so the persisted map must stay the complete set: keep a
		// previous entry whose key is still present but was not re-run, drop keys no longer present, and
		// let a re-run entry supersede its predecessor.
		const currentKeyIds = new Set(entries.map((entry) => entry.keyId));
		const merged = new Map();
		for (const [keyId, data] of this.#previousInvocationData) {
			if (!current.has(keyId) && currentKeyIds.has(keyId)) {
				merged.set(keyId, data);
			}
		}
		for (const [keyId, data] of current) {
			merged.set(keyId, data);
		}
		return merged;
	}

	#computeStaleOutputs(current, entries) {
		if (!this.#previousInvocationData) {
			return [];
		}
		const currentKeyIds = new Set(entries.map((entry) => entry.keyId));
		const stale = new Set();
		for (const [keyId, prev] of this.#previousInvocationData) {
			const reRun = current.get(keyId);
			if (!currentKeyIds.has(keyId)) {
				// Key gone this build: every path it owned is stale.
				prev.writes.forEach((path) => stale.add(path));
			} else if (reRun) {
				// Re-run step: any path it owned but did not re-write is stale.
				prev.writes.forEach((path) => {
					if (!reRun.writes.includes(path)) {
						stale.add(path);
					}
				});
			}
		}
		// A path re-written by any step this build is not stale.
		for (const data of current.values()) {
			data.writes.forEach((path) => stale.delete(path));
		}
		return [...stale];
	}

	async #flushWriteBuffer(writeBuffer) {
		const buffered = [...writeBuffer.values()].sort((a, b) => a.stepIndex - b.stepIndex);
		for (const {resource, options} of buffered) {
			await this.#workspace.write(resource, options);
		}
	}
}
