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
 * A key is identified by content and identity: a resource key by its path and a content discriminator (the
 * path distinguishes resources that share content but produce different output, the discriminator makes a
 * content change a new key that cannot yield a stale hit), a string key by its value. The discriminator is
 * tiered like <code>isResourceUnchanged</code> (<code>lastModified</code> + <code>size</code> when
 * statically available, SSRI integrity otherwise); see {@link #keyId}. A compound key is the caller's
 * responsibility to express as a stable string.
 *
 * @private
 */
export default class StepRunner {
	#steps;
	#options;
	#prepareStage;
	#reopenStage;
	#recordStage;
	#createStageContext;
	#getPreviousInvocationData;
	#returnValueStore;
	#resolveInputValue;
	#applyTagOperations;
	#notifyStepExecution;
	#signal;

	// Each step's return value and return signature, filled as steps run so a later step's needs can pull
	// them. Only populated on the factory (runSteps) path.
	#returns = new Map();
	#returnSignatures = new Map();

	/**
	 * The StepRunner drives one pipeline stage per step: before a step it calls
	 * <code>prepareStage(step)</code> (which switches the project to the step's own stage and returns the
	 * stage's cache verdict), runs or restores the step against a fresh per-stage context, then calls
	 * <code>recordStage(step, ...)</code> to record that stage. A map step's single stage still carries an
	 * internal per-key delta; a scalar step is a one-key stage. There is no cross-step fold: each step's
	 * stage records only its own reads, inputs, and stale outputs.
	 *
	 * @param {object} parameters
	 * @param {object[]} [parameters.steps] Ordered step list from the task factory (factory path)
	 * @param {object} [parameters.options] Task options, passed through to each step's context
	 * @param {function(string): Promise<(object|boolean)>} [parameters.prepareStage] Switches the project to
	 *   the named step's stage and returns its cache verdict: <code>true</code> (fully cached, do not run),
	 *   an object (delta cacheInfo for the map step's internal key-delta), or a falsy value (run every unit).
	 *   Absent for standalone use (no cache): every unit runs.
	 * @param {function(string): Promise<(object|boolean)>} [parameters.reopenStage] Reopens the named step's
	 *   stage with a fresh live writer after a full cache hit that must be re-run (a consumed
	 *   <code>needs</code> return changed), and returns the cache verdict to run it under (a falsy value for
	 *   a full re-run). The full-hit restore had installed a read-only cached stage; re-running needs a
	 *   writable one. Absent for standalone use, where a full hit never occurs.
	 * @param {function(string, object): Promise<void>} [parameters.recordStage] Records the named step's
	 *   stage from the run outcome <code>{projectRequests, dependencyRequests, inputRecording,
	 *   rootRequests, cacheInfo, invocationData, staleOutputs}</code>. Absent for standalone use.
	 * @param {function(): {workspace, dependencies, taskUtil, monitoredTaskUtil, getResourceRequests,
	 *   getInputRecording}} parameters.createStageContext Returns a fresh per-stage context bound to the
	 *   stage the last <code>prepareStage</code> switched to: the monitored workspace/dependencies readers,
	 *   the pass-through <code>taskUtil</code> the step units wrap per key, and drains for the monitored
	 *   task-level requests and inputs. Called once per step that runs.
	 * @param {function(string): (Map<string, object>|undefined)} [parameters.getPreviousInvocationData]
	 *   Returns the named step's stage's previous per-key invocation data, or undefined on a first build.
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
	 * @param {function(boolean): void} [parameters.notifyStepExecution] Called once, before the first step
	 *   that actually executes runs anything, with whether that step's stage carries a delta verdict. The
	 *   TaskRunner reports the task started from it, so <code>task-start</code> precedes the work it
	 *   announces. Not called when every step is served from cache (the task is reported skipped instead).
	 * @param {AbortSignal} [parameters.signal] Build abort signal, checked between units
	 */
	constructor({
		steps, options, prepareStage, recordStage, createStageContext, getPreviousInvocationData,
		returnValueStore, resolveInputValue, applyTagOperations, notifyStepExecution, signal, reopenStage
	}) {
		this.#steps = steps;
		this.#options = options;
		this.#prepareStage = prepareStage;
		this.#reopenStage = reopenStage;
		this.#recordStage = recordStage;
		this.#createStageContext = createStageContext;
		this.#getPreviousInvocationData = getPreviousInvocationData;
		this.#returnValueStore = returnValueStore;
		this.#resolveInputValue = resolveInputValue;
		this.#applyTagOperations = applyTagOperations;
		this.#notifyStepExecution = notifyStepExecution;
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
		let anyStepExecuted = false;
		const writtenResourcePaths = [];

		// Marks the task as executing. Called from the one place a stage stops being a pure cache hit, so
		// the "task started" report and the anyStepExecuted verdict cannot drift apart: the TaskRunner
		// emits task-start from the notification, before the stage does any work. Only the first executing
		// stage notifies, since the later stages of one task are not separate executions to report.
		const markStageExecuting = (cacheInfo) => {
			if (!anyStepExecuted) {
				this.#notifyStepExecution?.(!!cacheInfo);
			}
			anyStepExecuted = true;
		};

		// A step-based task with no steps (e.g. replaceCopyright with no copyright configured) still has a
		// single stage that must participate in caching: prepare it, and if it is not a cache hit, record an
		// empty result so the empty stage caches and a later build reports it as skipped. Its stage id is
		// task/{taskName} (stepName undefined), matching the single stage setTasks created for it.
		if (this.#steps.length === 0) {
			if (!this.#prepareStage) {
				markStageExecuting(false);
				return {anyStepExecuted: true, writtenResourcePaths};
			}
			const cacheInfo = await this.#prepareStage(undefined);
			if (cacheInfo === true) {
				return {anyStepExecuted: false, writtenResourcePaths};
			}
			markStageExecuting(cacheInfo);
			const ctx = this.#createStageContext();
			if (this.#recordStage) {
				await this.#recordStage(undefined, {ctx, cacheInfo, invocationData: new Map(), staleOutputs: []});
			}
			return {anyStepExecuted: true, writtenResourcePaths};
		}

		for (const step of this.#steps) {
			this.#signal?.throwIfAborted();
			this.#validateStep(step, seen);
			seen.add(step.name);

			// Switch the project to this step's own stage and get its cache verdict. Standalone use (no
			// prepareStage) always runs every unit.
			let cacheInfo = this.#prepareStage ? await this.#prepareStage(step.name) : false;
			const previous = this.#getPreviousInvocationData ?
				this.#getPreviousInvocationData(step.name) : undefined;

			const needs = this.#buildNeeds(step.needs);
			const needsSignatures = this.#collectNeedsSignatures(step.needs);

			const isScalar = typeof step.run === "function";

			if (cacheInfo === true) {
				// Full stage-cache hit: the step's own stage signature matched. A consumed needs return is
				// deliberately excluded from the stage signature (see #foldStageKeys), so a full hit can
				// occur even though a producer this step needs re-ran this build with a changed return. The
				// delta path catches that via needsInputs in #selectStepsToRun, but a full hit never runs
				// #selectStepsToRun. Check it here: when a consumed return changed, reopen the stage with a
				// live writer and re-run it rather than serving stale cached output.
				if (!this.#needsReturnChanged(previous, needsSignatures)) {
					// Fully cached stage: the step does not run. Rebuild its return from the persisted
					// per-key invocation data (in key order) so later steps' needs still resolve, and replay
					// each key's tag operations so its tags reappear this build (the stage writer was already
					// restored).
					const {results, invocationData, entries} =
						this.#restoreCachedStage(previous, isScalar);
					this.#returns.set(step.name, isScalar ? results[0] : results);
					this.#returnSignatures.set(step.name,
						this.#computeStepReturnSignature(invocationData, entries, isScalar));
					continue;
				}
				log.verbose(
					`step '${step.name}': a consumed needs return changed, re-running despite a full ` +
					`stage-cache hit`);
				// Reopen the stage (fresh writer) and demote the verdict to the re-run verdict the hook
				// returns (a falsy value for a full re-run). Standalone use has no hook and no full hit.
				cacheInfo = this.#reopenStage ? await this.#reopenStage(step.name) : false;
			}

			// A step past the fully-cached short-circuit executes its stage (fresh recording), even if it
			// enumerates zero units this build (an empty map step). This is "the task ran" for reporting,
			// distinct from a stage served entirely from cache.
			markStageExecuting(cacheInfo);

			// Fresh per-stage context bound to the stage prepareStage just switched to. Created before key
			// enumeration so the keys() enumerator's reads are captured by the stage's monitored readers.
			const ctx = this.#createStageContext();

			let entries;
			let callback;
			let options;
			if (isScalar) {
				// A scalar step is a single implicit unit; writes persist immediately (sequential) so the
				// step reads back its own writes and later steps see them.
				entries = [{key: undefined, index: 0, keyId: SCALAR_KEY_ID}];
				callback = (key, unitCtx) => step.run(unitCtx);
				options = {sequential: true};
			} else {
				entries = await this.#enumerateKeys(step, needs, ctx);
				callback = (key, unitCtx) => step.each(key, unitCtx);
				options = step.sequential ? {sequential: true} : undefined;
			}

			const {results, invocationData, freshInvocationData} = await this.#runGroup(
				step.name, entries, options, callback, {needs, needsSignatures, cacheInfo, previous, ctx});

			this.#returns.set(step.name, isScalar ? results[0] : results);
			this.#returnSignatures.set(step.name,
				this.#computeStepReturnSignature(invocationData, entries, isScalar));

			// Record this step's stage. There is no cross-step fold, but the stage still folds its
			// own keys' reads and inputs — including keys restored from cache on a delta build, whose reads
			// and inputs the stage-level monitor never saw — so the stage re-keys on its complete input set.
			if (this.#recordStage) {
				const staleOutputs = this.#computeStaleOutputs(
					previous, invocationData, entries, freshInvocationData);
				const {reads, inputs} = this.#foldStageKeys(invocationData);
				const stageWritten = await this.#recordStage(step.name, {
					ctx, cacheInfo, invocationData, staleOutputs, foldedReads: reads, foldedInputs: inputs,
				});
				if (stageWritten) {
					writtenResourcePaths.push(...stageWritten);
				}
			}
		}
		return {anyStepExecuted, writtenResourcePaths};
	}

	/**
	 * Whether any of a fully-cached stage's keys consumed a <code>needs</code> return whose current
	 * signature differs from the value it recorded on its previous run. Mirrors the needs check in
	 * {@link #selectStepsToRun}, applied to the full-hit path where that selection never runs. A stage with
	 * no previous data, no <code>needs</code>, or unchanged returns reports <code>false</code>, so the
	 * full-hit fast path is preserved for the common case.
	 *
	 * @param {Map<string, object>|undefined} previous The stage's previous per-key invocation data
	 * @param {Map<string, string>} [needsSignatures] Current producer return signatures by producer name
	 * @returns {boolean} <code>true</code> if a consumed return changed
	 */
	#needsReturnChanged(previous, needsSignatures) {
		if (!previous || !needsSignatures || needsSignatures.size === 0) {
			return false;
		}
		for (const data of previous.values()) {
			if (data.needsInputs?.some(
				(needed) => needsSignatures.get(needed.name) !== needed.value)) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Rebuilds a fully-cached stage's per-key results without running the step: each key's return is
	 * restored from its persisted descriptor (in key order) and its recorded tag operations are replayed,
	 * so later steps' <code>needs</code> resolve and the cached tags reappear this build.
	 *
	 * @param {Map<string, object>|undefined} previous The stage's previous per-key invocation data
	 * @param {boolean} isScalar Whether the step is scalar
	 * @returns {{results: Array, invocationData: Map<string, object>, entries: Array<{keyId: string}>}}
	 */
	#restoreCachedStage(previous, isScalar) {
		const invocationData = previous ?? new Map();
		const entries = [...invocationData.keys()].map((keyId, index) => ({keyId, index}));
		const results = new Array(entries.length);
		for (const {keyId, index} of entries) {
			const prev = invocationData.get(keyId);
			results[index] = this.#restoreReturn(prev?.returns);
			this.#replayTagOperations(prev?.tagOperations);
		}
		return {results, invocationData, entries};
	}

	/**
	 * Output paths a stage produced on a previous build but no longer produces (a re-run unit that writes
	 * fewer paths, or a key gone this build), so they can be dropped from the carried-forward stage. Scoped
	 * to this one stage: a stage owns its outputs, so a path it stops producing is stale for it.
	 *
	 * A path is only dropped when nothing in the stage claims it this build, so the writes of every key
	 * present this build are subtracted, including those of a key served from cache (which still owns the
	 * paths it wrote on an earlier build). The re-run comparison, in contrast, runs over the units that
	 * actually executed: a cached unit's entry is carried over from <code>previous</code> unchanged, so
	 * comparing it against itself could never report a dropped path anyway.
	 *
	 * @param {Map<string, object>|undefined} previous The stage's previous per-key invocation data
	 * @param {Map<string, object>} invocationData The stage's complete per-key invocation data this build
	 *   (re-run units merged over the carried-over cached ones)
	 * @param {Array<{keyId: string}>} entries The stage's key entries this build
	 * @param {Map<string, object>} freshInvocationData The per-key data of the units that ran this build
	 * @returns {string[]} Paths to drop
	 */
	#computeStaleOutputs(previous, invocationData, entries, freshInvocationData) {
		if (!previous) {
			return [];
		}
		const currentWrites = new Set();
		for (const data of invocationData.values()) {
			data.writes.forEach((path) => currentWrites.add(path));
		}
		const currentKeyIds = new Set(entries.map((entry) => entry.keyId));
		const stale = new Set();
		for (const [keyId, prev] of previous) {
			if (!currentKeyIds.has(keyId)) {
				// Key gone this build: every path it owned is stale.
				prev.writes.forEach((path) => stale.add(path));
				continue;
			}
			const reRun = freshInvocationData.get(keyId);
			if (reRun) {
				// Re-run unit: any path it owned but did not re-write is stale.
				prev.writes.forEach((path) => {
					if (!reRun.writes.includes(path)) {
						stale.add(path);
					}
				});
			}
		}
		for (const path of currentWrites) {
			stale.delete(path);
		}
		return [...stale];
	}

	/**
	 * Folds a stage's every key's reads and non-resource inputs into one request set and one input set,
	 * from the stage's complete per-key invocation data. This includes keys served from cache on a delta
	 * build (whose reads and inputs the stage-level monitor never observed), so the stage re-keys on its
	 * full input set and a first-seen or cached-key input stays tracked. This is the map step's internal
	 * key-delta fold (kept for the map step); it does NOT fold across steps.
	 *
	 * The <code>needs</code> returns a key consumes are deliberately excluded (tracked separately in
	 * <code>needsInputs</code> for per-key selection only): they are re-derived from producer reads/inputs
	 * that are themselves tracked, so folding one into the stage signature would permanently miss the cache.
	 *
	 * The recorder stores resolved paths (not patterns), and the same path is commonly read by more than one
	 * key (a shared marker probe, a dependency a map step's keys each resolve), so the raw concatenation held
	 * one entry per read. The duplicates collapse downstream (the request graph keys on a Set), but carrying
	 * them inflates the recording the TaskRunner folds onto the stage monitor and the request-key set the
	 * request graph's exact-match lookup rebuilds, so the fold dedups per read bucket into a Set here (and
	 * the TaskRunner's <code>foldReadsInto</code> dedups again against the monitored paths). Deduplication
	 * does not move the resulting signature.
	 *
	 * @param {Map<string, object>} invocationData The stage's complete per-key invocation data
	 * @returns {{reads: {project: {paths: string[], patterns: string[]},
	 *   dependencies: {paths: string[], patterns: string[]}},
	 *   inputs: Array<{type: string, name: string, value: string|undefined}>}} Folded reads and inputs
	 */
	#foldStageKeys(invocationData) {
		const projectPaths = new Set();
		const dependencyPaths = new Set();
		const mergedInputs = new Map();
		for (const data of invocationData.values()) {
			for (const path of data.reads ?? []) {
				projectPaths.add(path);
			}
			for (const path of data.dependencyReads ?? []) {
				dependencyPaths.add(path);
			}
			for (const input of data.inputs ?? []) {
				mergedInputs.set(`${input.type}\0${input.name}`, input);
			}
		}
		return {
			reads: {
				project: {paths: [...projectPaths], patterns: []},
				dependencies: {paths: [...dependencyPaths], patterns: []},
			},
			inputs: [...mergedInputs.values()],
		};
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
	 * One object is shared by the step's <code>keys</code> enumerator and all of its units, so it is
	 * frozen: a unit assigning to <code>needs.&lt;producer&gt;</code> would otherwise leak into its
	 * siblings and into the recorded <code>needsInputs</code> of whichever unit ran next, making a delta
	 * build's per-unit selection depend on execution order. The freeze is shallow, since a producer may
	 * return resources whose own state must stay writable; a step that needs a mutable copy makes one.
	 *
	 * @param {string[]} [names] Names of earlier steps this step needs
	 * @returns {object} Frozen <code>{[name]: return}</code>
	 */
	#buildNeeds(names) {
		const needs = {};
		if (names) {
			for (const name of names) {
				needs[name] = this.#returns.get(name);
			}
		}
		return Object.freeze(needs);
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
	 * Runs a map step's <code>keys</code> enumerator against the stage's own context.
	 *
	 * The enumerator owns no key, so there is no per-key invocation entry to attribute its activity to,
	 * and none is needed: it runs whenever the stage runs, so its reads and non-resource inputs are
	 * captured by the stage's monitored readers and MonitoredTaskUtil and fold into the stage signature,
	 * and the tags it sets reach the project tag collection and are recorded as the stage's tag
	 * operations, which a fully cached stage restores along with its writer.
	 *
	 * @param {object} step The map step
	 * @param {object} needs The step's needs object
	 * @param {object} ctx The per-stage context ({workspace, dependencies, taskUtil})
	 * @returns {Promise<Array<{key: *, index: number, keyId: string}>>} Resolved key entries
	 */
	async #enumerateKeys(step, needs, ctx) {
		const keys = await step.keys({
			needs,
			workspace: ctx.workspace,
			dependencies: ctx.dependencies,
			taskUtil: ctx.taskUtil,
			options: this.#options,
		});
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
	 * @param {Map<string, object>} invocationData The step's per-key invocation data this build
	 * @param {Array<{keyId: string}>} entries The step's key entries this build, in key order
	 * @param {boolean} isScalar Whether the step is scalar
	 * @returns {string} The step's return signature
	 */
	#computeStepReturnSignature(invocationData, entries, isScalar) {
		const signatures = entries.map(
			({keyId}) => this.#returnDescriptorSignature(invocationData?.get(keyId)?.returns));
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
			// The path distinguishes resources that share content but produce different output (e.g. two
			// libraries' identical library.source.less); the trailing component makes a content change a
			// new key, so the unit re-runs and its previous output is dropped rather than served stale.
			//
			// That trailing component is tiered like isResourceUnchanged (utils.js), cheapest first, to
			// avoid hashing every key's content on every build (a stale-cache sap.m build spent ~420 ms
			// here, see performance-investigation.md §12): lastModified + size when both are statically
			// available (no content read), falling back to the SSRI integrity when either is missing (a
			// memory- or generated resource with no lastModified, or one whose size is not statically
			// known). A resource restored from a stage cache carries its integrity, so getIntegrity()
			// resolves without reading content and the fallback stays cheap for that path too.
			//
			// Residual staleness risk, identical to isResourceUnchanged's and accepted for the same
			// reason: a content change that preserves BOTH lastModified and size keeps the same key, so
			// the unit is not re-run. A real edit moves mtime; the gap is for mtime-preserving replacements
			// (cp -p, tar -x, atomic rename) that also hold size constant. The changed-path delta does not
			// cover this case either, since it is derived through the same tiered comparison.
			const lastModified = key.getLastModified?.();
			if (typeof lastModified === "number" && typeof key.hasSize === "function" && key.hasSize()) {
				return `resource:${key.getPath()}\0m${lastModified}\0s${await key.getSize()}`;
			}
			return `resource:${key.getPath()}\0i${await key.getIntegrity()}`;
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

	#selectStepsToRun(entries, previous, needsSignatures, cacheInfo) {
		if (!cacheInfo || !previous) {
			// Full build, or a step with no previous data: run every unit.
			return entries;
		}
		const changedProject = new Set(cacheInfo.changedProjectResourcePaths ?? []);
		const changedDependency = new Set(cacheInfo.changedDependencyResourcePaths ?? []);
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

	#mergeInvocationData(current, entries, previous, cacheInfo) {
		if (!cacheInfo || !previous) {
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

	async #flushWriteBuffer(writeBuffer, workspace) {
		const buffered = [...writeBuffer.values()].sort((a, b) => a.stepIndex - b.stepIndex);
		for (const {resource, options} of buffered) {
			await workspace.write(resource, options);
		}
	}

	/**
	 * Runs one step's stage (a scalar step's implicit unit, or a map step's keys): selects the units to
	 * run, restores the rest from cache, records each unit's reads/writes/inputs/tags/return, and merges
	 * the result into the stage's persisted invocation data.
	 *
	 * @param {string} group Step name
	 * @param {Array<{key: *, index: number, keyId: string}>} entries Resolved key entries
	 * @param {object} [options] Optional settings ({sequential})
	 * @param {Function} callback <code>async (key, unitCtx) => value?</code>
	 * @param {object} context
	 * @param {object} [context.needs] The step's needs object, injected into each unit's context
	 * @param {Map<string, string>} [context.needsSignatures] Current producer return signatures, recorded
	 *   with each unit for the next build's selection
	 * @param {object|boolean} [context.cacheInfo] The stage's delta cache verdict (map step internal key-delta)
	 * @param {Map<string, object>} [context.previous] The stage's previous per-key invocation data
	 * @param {object} context.ctx The per-stage context ({workspace, dependencies, taskUtil})
	 * @returns {Promise<{results: Array, invocationData: Map<string, object>,
	 *   freshInvocationData: Map<string, object>}>} Per-key results aligned to <code>entries</code> order,
	 *   the stage's complete per-key invocation data, and the subset of it recorded by the units that
	 *   actually ran this build
	 */
	async #runGroup(group, entries, options, callback, {needs, needsSignatures, cacheInfo, previous, ctx}) {
		const sequential = options?.sequential ?? false;
		const concurrent = !sequential;
		const toRun = this.#selectStepsToRun(entries, previous, needsSignatures, cacheInfo);
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
			const workspace = new RecordingReaderWriter(ctx.workspace, recorder, writeBuffer, index);
			const dependencies = ctx.dependencies ?
				new RecordingReader(ctx.dependencies, recorder) : undefined;
			// A per-unit MonitoredTaskUtil wrapping the stage's taskUtil: it attributes the unit's
			// non-resource inputs and tag operations to the unit for per-unit selection and restore, while
			// reads still delegate through the stage's monitored readers.
			const taskUtil = new MonitoredTaskUtil(ctx.taskUtil, {recordTagOperations: true});

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
			await this.#flushWriteBuffer(writeBuffer, ctx.workspace);
		} else {
			for (const entry of toRun) {
				await runStep(entry);
			}
		}

		// The return value store buffers each unit's returned content; flush this step's buffer in one
		// transaction now that every unit has recorded its return. A no-op for a step that returned
		// nothing, and for standalone use with no store.
		this.#returnValueStore?.flush?.();

		const invocationData = this.#mergeInvocationData(currentInvocationData, entries, previous, cacheInfo);

		if (log.isLevelEnabled("verbose")) {
			log.verbose(`step '${group}': ran ${toRun.length} of ${entries.length} unit(s)`);
		}
		return {results, invocationData, freshInvocationData: currentInvocationData};
	}
}


