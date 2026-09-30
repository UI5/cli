import AbstractReader from "@ui5/fs/AbstractReader";
import AbstractReaderWriter from "@ui5/fs/AbstractReaderWriter";
import {getLogger} from "@ui5/logger";
import MonitoredTaskUtil from "./MonitoredTaskUtil.js";

const log = getLogger("build:helpers:StepRunner");

// Key identity of a scalar step's single implicit unit. A scalar step is a one-key group, so its
// invocation data has exactly one entry under this fixed id.
const SCALAR_KEY_ID = "scalar:0";

/**
 * A step may return a resource or an array of resources. A resource is anything carrying the two
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
 * Collects the reads and writes of a single step (a scalar step's implicit unit, or one key of a map
 * step). Project reads (workspace) and dependency reads are kept apart so they can be folded back into
 * the task's project vs. dependency request graph independently: a dependency path folded into the
 * project graph would resolve against the wrong reader and corrupt the signature.
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
	 * @param {number} stepIndex Position of this unit in the key order, used to flush buffered writes
	 *   deterministically and to detect two units writing the same path
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
			// Concurrent mode: buffer and flush in key order once all keys finish. Concurrent keys are
			// required to be independent, so two keys writing the same path is a contract violation
			// rather than a last-wins race.
			const existing = this.#writeBuffer.get(resourcePath);
			if (existing && existing.stepIndex !== this.#stepIndex) {
				throw new Error(
					`Concurrent map-step keys must not write the same resource path ${resourcePath}. ` +
					`Pass {sequential: true} if a later key must build on an earlier key's writes.`);
			}
			this.#writeBuffer.set(resourcePath, {resource, options, stepIndex: this.#stepIndex});
			return;
		}
		// Sequential mode: persist immediately so a later key reads what this key wrote.
		return this.#workspace.write(resource, options);
	}
}

/**
 * Per-task driver behind the step-factory build API. A step-based task default-exports a factory
 * <code>build(options) => Step[]</code>; the [TaskRunner]{@link @ui5/project/build/TaskRunner} calls the
 * factory, hands the resulting ordered step list to this driver, and folds the driver's outcome into the
 * task's build-cache entry.
 *
 * Two step shapes are supported:
 * <ul>
 *   <li>scalar: <code>{name, needs?, run}</code> where
 *     <code>run: async ({needs, workspace, dependencies, taskUtil, options}) => value?</code> runs once</li>
 *   <li>map: <code>{name, needs?, sequential?, keys, each}</code> where <code>keys</code> enumerates the
 *     key set and <code>each</code> runs once per key</li>
 * </ul>
 *
 * Steps run in array order via {@link #runSteps}. A scalar step is a one-key group; a map step is a
 * multi-key group. Each unit runs against per-step recording readers and a per-step
 * [MonitoredTaskUtil]{@link @ui5/project/build/helpers/MonitoredTaskUtil} that record what it reads,
 * writes, returns, reads as a non-resource input, and tags. The recording lets a delta build re-run only
 * the units whose observed inputs changed and drop the outputs of units that no longer produce them,
 * without any delta bookkeeping in the task itself. A unit whose recorded non-resource input (an env var,
 * a dependency version) no longer resolves to its stored value re-runs; a unit whose consumed
 * <code>needs</code> return changed re-runs; a unit served from cache replays its recorded tag operations
 * so its tags reappear this build.
 *
 * A step lists earlier step names in <code>needs</code>, and those steps' returns arrive as
 * <code>needs.&lt;name&gt;</code>. A step may return resources (stored in the CAS by integrity, rebuilt on a
 * cache hit) or a JSON-serializable value (persisted inline with the unit's invocation data). Either is
 * injected into a consumer via <code>needs</code>, and the return's signature folds into the consumer's
 * per-unit selection so a changed producer return re-runs the consumer.
 *
 * A key is identified by content and identity: a resource key by its path and integrity (the path
 * distinguishes resources that share content but produce different output, the integrity makes a content
 * change a new key that cannot yield a stale hit), a string key by its value. A compound key is the
 * caller's responsibility to express as a stable string.
 *
 * @private
 */
export default class StepRunner {
	#steps;
	#options;
	#workspace;
	#dependencies;
	#taskUtil;
	#cacheInfo;
	#previousInvocationData;
	#returnValueStore;
	#resolveInputValue;
	#applyTagOperations;
	#signal;

	// Populated by runSteps()/run(), keyed by step (group) name: each step's complete per-key invocation
	// data to persist. Stale outputs are derived across all of them on demand.
	#invocationData = new Map();
	// Per-step run bookkeeping (the step's previous data, the keys freshly run this build, and the keys
	// present this build). getStaleOutputs() folds across every step so a path one step stopped producing
	// but another step now produces is not falsely dropped.
	#groupRuns = new Map();
	// Each step's return value and return signature, filled as steps run so a later step's needs can pull
	// them. Only populated on the factory (runSteps) path.
	#returns = new Map();
	#returnSignatures = new Map();

	/**
	 * @param {object} parameters
	 * @param {object[]} [parameters.steps] Ordered step list from the task factory (factory path)
	 * @param {object} [parameters.options] Task options, passed through to each step's context
	 * @param {@ui5/fs/AbstractReaderWriter} parameters.workspace Task-level monitored workspace
	 * @param {@ui5/fs/AbstractReader} [parameters.dependencies] Task-level monitored dependencies reader
	 * @param {object} parameters.taskUtil TaskUtil interface passed through to each step
	 * @param {object} [parameters.cacheInfo] Delta info for a differential build, or falsy for a full build
	 * @param {Map<string, Map<string, object>>} [parameters.previousInvocationData] Per-step, per-key
	 *   invocation data recorded during the previous run of this task, keyed by step name
	 * @param {object} [parameters.returnValueStore] CAS-backed store for resource return values, with
	 *   <code>store(resources)</code> (persist content, return path-aligned descriptors) and
	 *   <code>restore(descriptor)</code> (rebuild a resource from a descriptor). Absent for standalone
	 *   use without a build cache: resource returns are then handed back for the current build but not
	 *   persisted, so a later delta build cannot restore a unit that is served from cache. Serializable
	 *   returns persist inline and need no store.
	 * @param {function(string, string): (string|undefined)} [parameters.resolveInputValue] Re-derives the
	 *   current normalized value of a recorded non-resource input (env var, time bucket, dependency
	 *   version, ...), the same resolver the task-level input lookup uses. A cached unit whose recorded
	 *   input no longer resolves to its stored value is re-run. Absent for standalone use, where no input
	 *   can be re-resolved and a unit is selected on its resource reads alone.
	 * @param {function(Array<object>): void} [parameters.applyTagOperations] Replays a restored unit's
	 *   recorded tag operations into the project tag collection, so a unit served from cache contributes
	 *   the same tags it would have set had it run. Absent for standalone use, where tags are not persisted.
	 * @param {AbortSignal} [parameters.signal] Build abort signal, checked between units
	 */
	constructor({
		steps, options, workspace, dependencies, taskUtil, cacheInfo, previousInvocationData, returnValueStore,
		resolveInputValue, applyTagOperations, signal
	}) {
		this.#steps = steps;
		this.#options = options;
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
	 * Runs the step list in array order, caching each unit's result.
	 *
	 * A scalar step runs its <code>run</code> once; a map step enumerates keys via <code>keys</code> then
	 * runs <code>each</code> per key. Before a step runs, a <code>needs</code> object is assembled from the
	 * returns of the earlier steps it names and passed in the step context. Each step's return is recorded
	 * so later steps can consume it.
	 *
	 * @returns {Promise<void>}
	 */
	async runSteps() {
		const seen = new Set();
		for (const step of this.#steps) {
			this.#signal?.throwIfAborted();
			this.#validateStep(step, seen);
			seen.add(step.name);

			const needs = this.#buildNeeds(step.needs);
			const needsSignatures = this.#collectNeedsSignatures(step.needs);

			const isScalar = typeof step.run === "function";
			let entries;
			let callback;
			let options;
			if (isScalar) {
				// A scalar step is a single implicit unit; writes persist immediately (sequential) so the
				// step reads back its own writes and later steps see them.
				entries = [{key: undefined, index: 0, keyId: SCALAR_KEY_ID}];
				callback = (key, ctx) => step.run(ctx);
				options = {sequential: true};
			} else {
				entries = await this.#enumerateKeys(step, needs);
				callback = (key, ctx) => step.each(key, ctx);
				options = step.sequential ? {sequential: true} : undefined;
			}

			const results = await this.#runGroup(step.name, entries, options, callback, {needs, needsSignatures});
			this.#returns.set(step.name, isScalar ? results[0] : results);
			this.#returnSignatures.set(step.name,
				this.#computeStepReturnSignature(step.name, entries, isScalar));
		}
	}

	/**
	 * The complete per-step, per-key invocation data to persist for the next build.
	 *
	 * @returns {Map<string, Map<string, object>>} Map of step name to that step's per-key data, where each
	 *   entry is <code>{reads, dependencyReads, writes, inputs, needsInputs, tagOperations, returns}</code>
	 */
	getInvocationData() {
		return this.#invocationData;
	}

	/**
	 * Output paths that a unit produced on a previous build but no longer produces (a re-run unit that
	 * writes fewer paths, or a key that is gone this build). These must be dropped from the stage that is
	 * otherwise carried forward from cache, so a removed input leaves no stale output behind.
	 *
	 * Computed across every step run this build: a path a step stopped producing is stale only if no step
	 * produces it this build, so moving an output between steps does not falsely drop it.
	 *
	 * @returns {string[]} Paths to drop
	 */
	getStaleOutputs() {
		// A path re-written by any step this build is not stale, so collect the union first.
		const currentWrites = new Set();
		for (const {current} of this.#groupRuns.values()) {
			for (const data of current.values()) {
				data.writes.forEach((path) => currentWrites.add(path));
			}
		}
		const stale = new Set();
		for (const {previous, current, entries} of this.#groupRuns.values()) {
			if (!previous) {
				continue;
			}
			const currentKeyIds = new Set(entries.map((entry) => entry.keyId));
			for (const [keyId, prev] of previous) {
				const reRun = current.get(keyId);
				if (!currentKeyIds.has(keyId)) {
					// Key gone this build: every path it owned is stale.
					prev.writes.forEach((path) => stale.add(path));
				} else if (reRun) {
					// Re-run unit: any path it owned but did not re-write is stale.
					prev.writes.forEach((path) => {
						if (!reRun.writes.includes(path)) {
							stale.add(path);
						}
					});
				}
			}
		}
		for (const path of currentWrites) {
			stale.delete(path);
		}
		return [...stale];
	}

	/**
	 * The union of every step's every unit's reads, as a resource-request set to fold into the task's
	 * request index. Units not re-run this build contribute their persisted reads, so an input first seen
	 * on a delta build (a marker probe, a source map) stays tracked on the next build rather than being lost.
	 *
	 * @returns {{project: {paths: string[], patterns: string[]}, dependencies: {paths: string[], patterns: string[]}}}
	 */
	getResourceRequests() {
		const project = {paths: [], patterns: []};
		const dependencies = {paths: [], patterns: []};
		for (const groupData of this.#invocationData.values()) {
			for (const data of groupData.values()) {
				project.paths.push(...data.reads);
				dependencies.paths.push(...(data.dependencyReads ?? []));
			}
		}
		return {project, dependencies};
	}

	/**
	 * The union of every step's every unit's recorded non-resource inputs, deduped by type and name (last
	 * write wins), to fold into the task's input recording. Units not re-run this build contribute their
	 * persisted inputs, so an input a cached unit read stays folded into the re-keyed stage signature even
	 * though the task-level monitor only observed the re-run units. Mirrors {@link #getResourceRequests}.
	 *
	 * The <code>needs</code> returns a unit consumes are deliberately excluded: they drive per-unit
	 * selection only (see {@link #selectStepsToRun}) and are re-derived from producer reads/inputs that are
	 * themselves tracked, so folding an unresolvable <code>needs</code> input into the task-level signature
	 * would permanently miss the stage cache.
	 *
	 * @returns {Array<{type: string, name: string, value: string|undefined}>} Recorded input entries
	 */
	getInputRecording() {
		const merged = new Map();
		for (const groupData of this.#invocationData.values()) {
			for (const data of groupData.values()) {
				for (const input of data.inputs ?? []) {
					merged.set(`${input.type}\0${input.name}`, input);
				}
			}
		}
		return [...merged.values()];
	}

	/**
	 * Validates one step's shape and its <code>needs</code> wiring.
	 *
	 * @param {object} step Step from the factory
	 * @param {Set<string>} seen Names of the steps already processed (needs may only reference these)
	 */
	#validateStep(step, seen) {
		if (!step || typeof step !== "object") {
			throw new Error("Step factory must return an array of step objects");
		}
		if (typeof step.name !== "string" || !step.name) {
			throw new Error("Each step must have a non-empty string 'name'");
		}
		if (seen.has(step.name)) {
			throw new Error(`Duplicate step name '${step.name}'`);
		}
		const isScalar = typeof step.run === "function";
		const isMap = typeof step.keys === "function" && typeof step.each === "function";
		if (isScalar === isMap) {
			throw new Error(
				`Step '${step.name}' must be either a scalar step ({name, run}) or a ` +
				`map step ({name, keys, each})`);
		}
		if (step.needs) {
			for (const needed of step.needs) {
				if (!seen.has(needed)) {
					throw new Error(
						`Step '${step.name}' needs '${needed}', which is not an earlier step`);
				}
			}
		}
	}

	/**
	 * Assembles the <code>needs</code> object passed to a step from the recorded returns of the steps it
	 * names.
	 *
	 * @param {string[]} [names] Names of earlier steps this step needs
	 * @returns {object} <code>{[name]: return}</code>
	 */
	#buildNeeds(names) {
		const needs = {};
		if (names) {
			for (const name of names) {
				needs[name] = this.#returns.get(name);
			}
		}
		return needs;
	}

	/**
	 * The current return signatures of the steps a step needs, for per-unit delta selection.
	 *
	 * @param {string[]} [names] Names of earlier steps this step needs
	 * @returns {Map<string, string>} Producer step name to its current return signature
	 */
	#collectNeedsSignatures(names) {
		const signatures = new Map();
		if (names) {
			for (const name of names) {
				signatures.set(name, this.#returnSignatures.get(name));
			}
		}
		return signatures;
	}

	/**
	 * Runs a map step's <code>keys</code> enumerator through recording readers so its reads and inputs
	 * delegate to the task-level monitor (and thus fold into the task signature; the enumerator runs every
	 * build, so no per-key persistence is needed).
	 *
	 * @param {object} step The map step
	 * @param {object} needs The step's needs object
	 * @returns {Promise<Array<{key: *, index: number, keyId: string}>>} Resolved key entries
	 */
	async #enumerateKeys(step, needs) {
		const recorder = new StepRecorder();
		const workspace = new RecordingReaderWriter(this.#workspace, recorder, null, 0);
		const dependencies = this.#dependencies ?
			new RecordingReader(this.#dependencies, recorder) : undefined;
		const taskUtil = new MonitoredTaskUtil(this.#taskUtil, {recordTagOperations: true});
		const keys = await step.keys({needs, workspace, dependencies, taskUtil, options: this.#options});
		if (!keys) {
			return [];
		}
		return this.#resolveEntries(keys);
	}

	/**
	 * The combined return signature of a step, used by a consumer's per-unit selection to detect a changed
	 * producer return. A scalar step's signature is its single unit's return signature; a map step's is the
	 * ordered list of its units' return signatures.
	 *
	 * @param {string} group Step name
	 * @param {Array<{keyId: string}>} entries The step's key entries this build, in key order
	 * @param {boolean} isScalar Whether the step is scalar
	 * @returns {string} The step's return signature
	 */
	#computeStepReturnSignature(group, entries, isScalar) {
		const groupData = this.#invocationData.get(group);
		const signatures = entries.map(({keyId}) => this.#returnDescriptorSignature(groupData?.get(keyId)?.returns));
		return isScalar ? (signatures[0] ?? "none") : JSON.stringify(signatures);
	}

	/**
	 * A stable string signature of a recorded return descriptor.
	 *
	 * @param {object|null} [returns] Recorded return descriptor
	 * @returns {string} Signature (content integrities for resources, serialized value for a value)
	 */
	#returnDescriptorSignature(returns) {
		if (!returns) {
			return "none";
		}
		if (returns.kind === "value") {
			return `v:${JSON.stringify(returns.value)}`;
		}
		return `r:${JSON.stringify({isArray: returns.isArray, integrities: returns.items.map((x) => x.integrity)})}`;
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
			// integrity makes a content change a new key, so the unit re-runs and its previous output
			// is dropped rather than served stale.
			return `resource:${key.getPath()}\0${await key.getIntegrity()}`;
		}
		if (typeof key === "string") {
			return `string:${key}`;
		}
		throw new Error(
			"Map-step keys must be resources or strings. " +
			"Express a compound key as a stable string.");
	}

	/**
	 * Validates a unit's return value and, for a resource return, persists its content in the CAS. A
	 * serializable value is persisted inline in the invocation entry; a resource return is stored in the
	 * CAS by integrity; anything else throws.
	 *
	 * @param {*} returnValue The value the unit returned
	 * @returns {Promise<object|null>} The persisted return descriptor:
	 *   <code>{kind: "resources", isArray, items: [{path, integrity, ...}]}</code>,
	 *   <code>{kind: "value", value}</code>, or <code>null</code> when the unit returned nothing (or a
	 *   resource return has no store to persist against)
	 */
	async #recordReturn(returnValue) {
		const normalized = this.#normalizeReturn(returnValue);
		if (!normalized) {
			return null;
		}
		if (normalized.kind === "value") {
			// Serializable value: persisted inline, no CAS involved.
			return {kind: "value", value: normalized.value};
		}
		if (!this.#returnValueStore) {
			// Standalone use: the fresh resource(s) are handed back for this build via the results array,
			// but with no CAS to persist against there is nothing for a later build to restore.
			return null;
		}
		const items = await this.#returnValueStore.store(normalized.resources);
		return {kind: "resources", isArray: normalized.isArray, items};
	}

	/**
	 * Rebuilds a cached unit's return from the descriptor recorded on its previous run.
	 *
	 * @param {object|null} [returns] The recorded return descriptor, or falsy when the unit returned nothing
	 * @returns {*} The value, the single resource, the array of resources, or <code>undefined</code>
	 */
	#restoreReturn(returns) {
		if (!returns) {
			return undefined;
		}
		if (returns.kind === "value") {
			return returns.value;
		}
		if (!this.#returnValueStore) {
			throw new Error(
				"Cannot restore a cached step's returned resources without a return value store");
		}
		const items = returns.items.map((descriptor) => this.#returnValueStore.restore(descriptor));
		return returns.isArray ? items : items[0];
	}

	/**
	 * Classifies a return value as nothing, resource(s), or a serializable value, throwing on anything
	 * else (a returned array mixing resources and non-resources, or a value that is not JSON-serializable).
	 *
	 * @param {*} value The value the unit returned
	 * @returns {{kind: string, isArray?: boolean, resources?: object[], value?: *}|null} The classified
	 *   return, or <code>null</code> when the unit returned nothing
	 */
	#normalizeReturn(value) {
		if (value === undefined || value === null) {
			return null;
		}
		if (Array.isArray(value) && value.every(isResource)) {
			return {kind: "resources", isArray: true, resources: value};
		}
		if (isResource(value)) {
			return {kind: "resources", isArray: false, resources: [value]};
		}
		if (Array.isArray(value) && value.some(isResource)) {
			const i = value.findIndex((entry) => !isResource(entry));
			throw new Error(
				`A returned array must contain only resources; array entry ${i} is ${describeValue(value[i])}`);
		}
		// Serializable value: reject anything JSON cannot represent (a function, a symbol, ...).
		let serializable = true;
		try {
			serializable = JSON.stringify(value) !== undefined;
		} catch {
			serializable = false;
		}
		if (!serializable) {
			throw new Error(
				`A step may return resources or a JSON-serializable value; got ${describeValue(value)}`);
		}
		return {kind: "value", value};
	}

	#selectStepsToRun(entries, previous, needsSignatures) {
		if (!this.#cacheInfo || !previous) {
			// Full build, or a step with no previous data: run every unit.
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
			// A unit whose recorded reads intersect the changed paths must re-run: this is the reverse
			// mapping that re-runs the owner of a changed cross-resource input (a .js whose .js.map
			// changed, a theme whose gating marker was added or removed).
			if (prev.reads.some((path) => changedProject.has(path)) ||
				prev.dependencyReads.some((path) => changedDependency.has(path))) {
				return true;
			}
			// A unit whose recorded non-resource input no longer resolves to its stored value must re-run,
			// so only the unit that read a changed env var, rolled-over time bucket or bumped dependency
			// version re-runs. Without a resolver (standalone use) an input cannot be re-derived, so the
			// unit is selected on its resource reads alone.
			if (this.#resolveInputValue && prev.inputs?.some(
				(input) => this.#resolveInputValue(input.type, input.name) !== input.value)) {
				return true;
			}
			// A unit whose consumed needs return changed must re-run: the producer ran (or was restored)
			// earlier this build, so its current return signature is known. A producer that re-ran with a
			// changed return advances its signature; a restored producer keeps its previous one.
			if (needsSignatures && prev.needsInputs?.some(
				(needed) => needsSignatures.get(needed.name) !== needed.value)) {
				return true;
			}
			return false;
		});
	}

	/**
	 * Replays a restored unit's recorded tag operations into the project tag collection, so a unit served
	 * from cache contributes the same tags it would have set had it run. <code>get</code> operations carry
	 * no persistent effect and are skipped by the applier. A no-op without an applier (standalone use) or
	 * when the unit recorded no tag operations.
	 *
	 * @param {Array<object>} [tagOperations] The unit's recorded tag operations
	 */
	#replayTagOperations(tagOperations) {
		if (this.#applyTagOperations && tagOperations?.length) {
			this.#applyTagOperations(tagOperations);
		}
	}

	#mergeInvocationData(current, entries, previous) {
		if (!this.#cacheInfo || !previous) {
			return current;
		}
		// A delta build re-runs only some units, so the persisted map must stay the complete set: keep a
		// previous entry whose key is still present but was not re-run, drop keys no longer present, and
		// let a re-run entry supersede its predecessor.
		const currentKeyIds = new Set(entries.map((entry) => entry.keyId));
		const merged = new Map();
		for (const [keyId, data] of previous) {
			if (!current.has(keyId) && currentKeyIds.has(keyId)) {
				merged.set(keyId, data);
			}
		}
		for (const [keyId, data] of current) {
			merged.set(keyId, data);
		}
		return merged;
	}

	async #flushWriteBuffer(writeBuffer) {
		const buffered = [...writeBuffer.values()].sort((a, b) => a.stepIndex - b.stepIndex);
		for (const {resource, options} of buffered) {
			await this.#workspace.write(resource, options);
		}
	}

	/**
	 * Runs one step group (a scalar step's implicit unit, or a map step's keys): selects the units to run,
	 * restores the rest from cache, records each unit's reads/writes/inputs/tags/return, and merges the
	 * result into the persisted invocation data.
	 *
	 * @param {string} group Step name
	 * @param {Array<{key: *, index: number, keyId: string}>} entries Resolved key entries
	 * @param {object} [options] Optional settings ({sequential})
	 * @param {Function} callback <code>async (key, ctx) => value?</code>
	 * @param {object} context
	 * @param {object} [context.needs] The step's needs object, injected into each unit's context
	 * @param {Map<string, string>} [context.needsSignatures] Current producer return signatures, recorded
	 *   with each unit for the next build's selection
	 * @returns {Promise<Array>} Per-key results aligned to <code>entries</code> order
	 */
	async #runGroup(group, entries, options, callback, {needs, needsSignatures}) {
		const sequential = options?.sequential ?? false;
		const concurrent = !sequential;
		const previous = this.#previousInvocationData?.get(group);
		const toRun = this.#selectStepsToRun(entries, previous, needsSignatures);
		const toRunIndices = new Set(toRun.map((entry) => entry.index));

		const currentInvocationData = new Map();
		const results = new Array(entries.length);
		const writeBuffer = concurrent ? new Map() : null;
		const recordedNeeds = needsSignatures ?
			[...needsSignatures].map(([name, value]) => ({name, value})) : [];

		// A unit served from cache did not run, so its return is rebuilt from the previous run's recorded
		// descriptor, and its recorded tag operations are replayed so its tags reappear this build. Its
		// slots are disjoint from the re-run units below, so this can happen before or after they run.
		for (const {keyId, index} of entries) {
			if (toRunIndices.has(index)) {
				continue;
			}
			const prev = previous?.get(keyId);
			results[index] = this.#restoreReturn(prev?.returns);
			this.#replayTagOperations(prev?.tagOperations);
		}

		const runStep = async ({key, keyId, index}) => {
			this.#signal?.throwIfAborted();
			const recorder = new StepRecorder();
			const workspace = new RecordingReaderWriter(this.#workspace, recorder, writeBuffer, index);
			const dependencies = this.#dependencies ?
				new RecordingReader(this.#dependencies, recorder) : undefined;
			// A per-step MonitoredTaskUtil wrapping the task-level one: reads still delegate through the
			// task-level monitor (so a full build's task-level recording stays the union that keys the
			// stage), while this wrapper additionally attributes the unit's non-resource inputs and tag
			// operations to the unit for per-unit selection and restore.
			const taskUtil = new MonitoredTaskUtil(this.#taskUtil, {recordTagOperations: true});

			const returnValue = await callback(key, {workspace, dependencies, taskUtil, needs, options: this.#options});
			results[index] = returnValue;
			currentInvocationData.set(keyId, {
				reads: [...recorder.projectReads],
				dependencyReads: [...recorder.dependencyReads],
				writes: [...recorder.writes],
				inputs: taskUtil.getInputRecording(),
				needsInputs: recordedNeeds,
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

		this.#invocationData.set(group, this.#mergeInvocationData(currentInvocationData, entries, previous));
		this.#groupRuns.set(group, {previous, current: currentInvocationData, entries});

		if (log.isLevelEnabled("verbose")) {
			log.verbose(`step '${group}': ran ${toRun.length} of ${entries.length} unit(s)`);
		}
		return results;
	}
}
