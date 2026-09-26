import AbstractReader from "@ui5/fs/AbstractReader";
import AbstractReaderWriter from "@ui5/fs/AbstractReaderWriter";
import {getLogger} from "@ui5/logger";
import MonitoredTaskUtil from "./MonitoredTaskUtil.js";

const log = getLogger("build:helpers:ProcessEach");

/**
 * A callback may return a resource or an array of resources. A resource is anything carrying the two
 * identity accessors the key logic already relies on, so the check stays consistent with {@link #keyId}.
 *
 * @param {*} value Candidate return value
 * @returns {boolean} <code>true</code> if the value is a resource
 */
function isResource(value) {
	return !!value && typeof value.getPath === "function" && typeof value.getIntegrity === "function";
}

/**
 * Names a rejected return value in an error message without assuming it is serializable.
 *
 * @param {*} value Rejected value
 * @returns {string} A short human-readable type description
 */
function describeValue(value) {
	if (value === null) {
		return "null";
	}
	if (typeof value === "object") {
		const name = value.constructor?.name;
		return name && name !== "Object" ? `a ${name}` : "a plain object";
	}
	return `a ${typeof value}`;
}

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
 * and a per-step [MonitoredTaskUtil]{@link @ui5/project/build/helpers/MonitoredTaskUtil} that record
 * what each step reads, writes, returns, reads as a non-resource input, and tags. The recording lets a
 * delta build re-run only the steps whose observed inputs changed and drop the outputs of steps that no
 * longer produce them, without any delta bookkeeping in the task itself. A step whose recorded
 * non-resource input (an env var, a dependency version) no longer resolves to its stored value re-runs;
 * a step served from cache replays its recorded tag operations so its tags reappear this build.
 *
 * A callback may return a resource or an array of resources. Returned resources are stored in the CAS,
 * so a step served from cache on a delta build has its returned resource(s) rebuilt from the CAS
 * without re-running the callback, and <code>run</code>'s result array is reassembled in key order from
 * a mix of freshly-returned and restored entries.
 *
 * A key is identified by content and identity: a resource key by its path and integrity (the path
 * distinguishes resources that share content but produce different output, the integrity makes a
 * content change a new key that cannot yield a stale hit), a string key by its value. A compound key
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
	#returnValueStore;
	#resolveInputValue;
	#applyTagOperations;
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
	 * @param {object} [parameters.returnValueStore] CAS-backed store for callback return values, with
	 *   <code>store(resources)</code> (persist content, return path-aligned descriptors) and
	 *   <code>restore(descriptor)</code> (rebuild a resource from a descriptor). Absent for standalone
	 *   use without a build cache: return values are then handed back for the current build but not
	 *   persisted, so a later delta build cannot restore a step that is served from cache.
	 * @param {function(string, string): (string|undefined)} [parameters.resolveInputValue] Re-derives the
	 *   current normalized value of a recorded non-resource input (env var, time bucket, dependency
	 *   version, ...), the same resolver the task-level input lookup uses. A cached step whose recorded
	 *   input no longer resolves to its stored value is re-run. Absent for standalone use, where no input
	 *   can be re-resolved and a step is selected on its resource reads alone.
	 * @param {function(Array<object>): void} [parameters.applyTagOperations] Replays a restored step's
	 *   recorded tag operations into the project tag collection, so a step served from cache contributes
	 *   the same tags it would have set had it run. Absent for standalone use, where tags are not persisted.
	 * @param {AbortSignal} [parameters.signal] Build abort signal, checked between steps
	 */
	constructor({
		workspace, dependencies, taskUtil, cacheInfo, previousInvocationData, returnValueStore,
		resolveInputValue, applyTagOperations, signal
	}) {
		this.#workspace = workspace;
		this.#dependencies = dependencies;
		this.#taskUtil = taskUtil;
		this.#cacheInfo = cacheInfo;
		this.#previousInvocationData = previousInvocationData;
		this.#returnValueStore = returnValueStore;
		this.#resolveInputValue = resolveInputValue;
		this.#applyTagOperations = applyTagOperations;
		this.#signal = signal;
	}

	/**
	 * Runs <code>callback</code> once per key, caching each step's result.
	 *
	 * @param {Iterable} keys Resources or strings, as for a <code>map</code>
	 * @param {Function} callback <code>async (key, {workspace, dependencies, taskUtil}) => resource(s)</code>,
	 *   where <code>taskUtil</code> is a per-step [MonitoredTaskUtil]{@link
	 *   @ui5/project/build/helpers/MonitoredTaskUtil} attributing the step's non-resource inputs and tag
	 *   operations to the step
	 * @param {boolean} [concurrent=true] Run steps concurrently (buffered writes flushed in key order)
	 *   or sequentially (writes visible to later steps immediately)
	 * @returns {Promise<Array>} Per-key results aligned to <code>keys</code> order. Each entry is what
	 *   that step returned (a resource, an array of resources, or <code>undefined</code>). A step served
	 *   from cache contributes its previous run's returned resource(s), rebuilt from the CAS.
	 */
	async run(keys, callback, concurrent = true) {
		if (this.#invocationData) {
			// A single processEach per task keeps the persisted per-key data unambiguous. Multiple
			// step groups per task can be supported later by namespacing their persisted entries.
			throw new Error("processEach may currently be called at most once per task");
		}
		if (typeof callback !== "function") {
			throw new Error("processEach: callback must be a function");
		}
		const entries = await this.#resolveEntries(keys);
		const toRun = this.#selectStepsToRun(entries);
		const toRunIndices = new Set(toRun.map((entry) => entry.index));

		const currentInvocationData = new Map();
		const results = new Array(entries.length);
		const writeBuffer = concurrent ? new Map() : null;

		// A step served from cache did not run, so its returned resource(s) are rebuilt from the CAS out
		// of the previous run's recorded return descriptors, and its recorded tag operations are replayed
		// so its tags reappear this build. Its slots are disjoint from the re-run steps below, so this can
		// happen before or after they run.
		for (const {keyId, index} of entries) {
			if (toRunIndices.has(index)) {
				continue;
			}
			const previous = this.#previousInvocationData?.get(keyId);
			results[index] = this.#restoreReturn(previous?.returns);
			this.#replayTagOperations(previous?.tagOperations);
		}

		const runStep = async ({key, keyId, index}) => {
			this.#signal?.throwIfAborted();
			const recorder = new StepRecorder();
			const workspace = new RecordingReaderWriter(this.#workspace, recorder, writeBuffer, index);
			const dependencies = this.#dependencies ?
				new RecordingReader(this.#dependencies, recorder) : undefined;
			// A per-step MonitoredTaskUtil wrapping the task-level one: reads still delegate through the
			// task-level monitor (so a full build's task-level recording stays the union that keys the
			// stage), while this wrapper additionally attributes the step's non-resource inputs and tag
			// operations to the step for per-step selection and restore.
			const taskUtil = new MonitoredTaskUtil(this.#taskUtil, {recordTagOperations: true});

			const returnValue = await callback(key, {workspace, dependencies, taskUtil});
			results[index] = returnValue;
			currentInvocationData.set(keyId, {
				reads: [...recorder.projectReads],
				dependencyReads: [...recorder.dependencyReads],
				writes: [...recorder.writes],
				inputs: taskUtil.getInputRecording(),
				tagOperations: taskUtil.getTagOperations(),
				returns: await this.#recordReturn(returnValue),
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
	 * @returns {Map<string, object>} Map of key identity to
	 *   <code>{reads, dependencyReads, writes, inputs, tagOperations, returns}</code>, where
	 *   <code>inputs</code> is the step's recorded non-resource inputs, <code>tagOperations</code> its
	 *   recorded tag operations, and <code>returns</code> the CAS descriptors for the step's returned
	 *   resource(s), or <code>null</code> if it returned nothing
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

	/**
	 * The union of every step's recorded non-resource inputs, deduped by type and name (last write wins),
	 * to fold into the task's input recording. Steps not re-run this build contribute their persisted
	 * inputs, so an input a cached step read stays folded into the re-keyed stage signature even though
	 * the task-level monitor only observed the re-run steps. Mirrors {@link #getResourceRequests}.
	 *
	 * @returns {Array<{type: string, name: string, value: string|undefined}>} Recorded input entries
	 */
	getInputRecording() {
		const merged = new Map();
		for (const data of this.#invocationData.values()) {
			for (const input of data.inputs ?? []) {
				merged.set(`${input.type}\0${input.name}`, input);
			}
		}
		return [...merged.values()];
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
			// Path and integrity together: the path distinguishes resources that share content but
			// produce different output (e.g. two libraries' identical library.source.less), while the
			// integrity makes a content change a new key, so the step re-runs and its previous output
			// is dropped rather than served stale.
			return `resource:${key.getPath()}\0${await key.getIntegrity()}`;
		}
		if (typeof key === "string") {
			return `string:${key}`;
		}
		throw new Error(
			"processEach: keys must be resources or strings. " +
			"Express a compound key as a stable string.");
	}

	/**
	 * Validates a step's return value and, when a return value store is bound, persists its content in
	 * the CAS. Only resources may be returned; anything else throws with the offending type named.
	 *
	 * @param {*} returnValue The value the callback returned
	 * @returns {Promise<object|null>} The persisted return descriptor
	 *   <code>{isArray, items: [{path, integrity, size, lastModified, inode}]}</code>, or
	 *   <code>null</code> when the step returned nothing or no store is bound to persist against
	 */
	async #recordReturn(returnValue) {
		const normalized = this.#normalizeReturn(returnValue);
		if (!normalized) {
			return null;
		}
		if (!this.#returnValueStore) {
			// Standalone use: the fresh resource(s) are handed back for this build via the results array,
			// but with no CAS to persist against there is nothing for a later build to restore.
			return null;
		}
		const items = await this.#returnValueStore.store(normalized.resources);
		return {isArray: normalized.isArray, items};
	}

	/**
	 * Rebuilds a cached step's returned resource(s) from the descriptors recorded on its previous run.
	 *
	 * @param {object|null} [returns] The recorded return descriptor, or falsy when the step returned nothing
	 * @returns {*} The single resource, the array of resources, or <code>undefined</code>
	 */
	#restoreReturn(returns) {
		if (!returns) {
			return undefined;
		}
		if (!this.#returnValueStore) {
			throw new Error(
				"processEach: cannot restore a cached step's returned resources without a return value store");
		}
		const items = returns.items.map((descriptor) => this.#returnValueStore.restore(descriptor));
		return returns.isArray ? items : items[0];
	}

	/**
	 * Classifies a return value as nothing, a single resource, or an array of resources, throwing on
	 * anything else. Keeping returns to resources keeps the storage model identical to how the build
	 * already stores content and sidesteps the identity questions arbitrary objects raise.
	 *
	 * @param {*} value The value the callback returned
	 * @returns {{isArray: boolean, resources: object[]}|null} The classified resources, or
	 *   <code>null</code> when the step returned nothing
	 */
	#normalizeReturn(value) {
		if (value === undefined || value === null) {
			return null;
		}
		if (Array.isArray(value)) {
			value.forEach((entry, i) => {
				if (!isResource(entry)) {
					throw new Error(
						`processEach: a callback may return only resources or an array of resources; ` +
						`array entry ${i} is ${describeValue(entry)}`);
				}
			});
			return {isArray: true, resources: value};
		}
		if (isResource(value)) {
			return {isArray: false, resources: [value]};
		}
		throw new Error(
			`processEach: a callback may return only resources or an array of resources; ` +
			`got ${describeValue(value)}`);
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
			if (prev.reads.some((path) => changedProject.has(path)) ||
				prev.dependencyReads.some((path) => changedDependency.has(path))) {
				return true;
			}
			// A step whose recorded non-resource input no longer resolves to its stored value must re-run,
			// so only the step that read a changed env var, rolled-over time bucket or bumped dependency
			// version re-runs. Without a resolver (standalone use) an input cannot be re-derived, so the
			// step is selected on its resource reads alone.
			if (this.#resolveInputValue && prev.inputs?.some(
				(input) => this.#resolveInputValue(input.type, input.name) !== input.value)) {
				return true;
			}
			return false;
		});
	}

	/**
	 * Replays a restored step's recorded tag operations into the project tag collection, so a step served
	 * from cache contributes the same tags it would have set had it run. <code>get</code> operations carry
	 * no persistent effect and are skipped by the applier. A no-op without an applier (standalone use) or
	 * when the step recorded no tag operations.
	 *
	 * @param {Array<object>} [tagOperations] The step's recorded tag operations
	 */
	#replayTagOperations(tagOperations) {
		if (this.#applyTagOperations && tagOperations?.length) {
			this.#applyTagOperations(tagOperations);
		}
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
