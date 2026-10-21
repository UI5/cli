import AbstractReaderWriter from "@ui5/fs/AbstractReaderWriter";
import {assertDistinctWrite, flushWriteBuffer, getInputName} from "@ui5/fs/internal/stepWriteBuffer";

/**
 * Buffers the writes of one concurrent map-step key and delegates reads to the underlying workspace, so
 * a map step's writes can be flushed in key order after all keys finish. Mirrors the cached step runner's
 * write buffering (minus the cache recording), including the same-path guard that keeps concurrent keys
 * independent. The same-path guard, its error message and the key-order flush are shared with the cached
 * runner through <code>@ui5/fs/internal/stepWriteBuffer</code> so the two cannot drift.
 */
class BufferedWriter extends AbstractReaderWriter {
	#workspace;
	#buffer;
	#index;
	#inputName;
	#stepName;
	#taskName;

	/**
	 * @param {@ui5/fs/AbstractReaderWriter} workspace Underlying workspace
	 * @param {Map<string, object>} buffer Shared write buffer, keyed by resource path
	 * @param {number} index Key position, used to flush in key order and detect same-path writes
	 * @param {string|undefined} inputName String map key or resource path, if available
	 * @param {string} stepName Name of the map step
	 * @param {string|undefined} taskName Name of the task, if available
	 */
	constructor(workspace, buffer, index, inputName, stepName, taskName) {
		super(typeof workspace.getName === "function" ? workspace.getName() : "workspace");
		this.#workspace = workspace;
		this.#buffer = buffer;
		this.#index = index;
		this.#inputName = inputName;
		this.#stepName = stepName;
		this.#taskName = taskName;
	}

	_byGlob(virPattern, options) {
		return this.#workspace.byGlob(virPattern, options);
	}

	_byPath(virPath, options) {
		return this.#workspace.byPath(virPath, options);
	}

	// Overrides the public write (rather than _write, unlike @ui5/project's RecordingReaderWriter) so the
	// caller's exact arguments are preserved: the base class would default options to an object, which the
	// key-order flush would then re-pass. The buffered entry stores those raw arguments as args, which
	// flushWriteBuffer replays via write(resource, ...args).
	async write(resource, ...args) {
		// Real resources are keyed and deduplicated by their virtual path; a value without getPath
		// (a test fake) is keyed by identity so it still buffers and flushes in insertion order.
		const key = typeof resource.getPath === "function" ? resource.getPath() : resource;
		assertDistinctWrite(this.#buffer, key, this.#index, this.#inputName, this.#stepName, this.#taskName);
		this.#buffer.set(key, {resource, args, index: this.#index, inputName: this.#inputName});
	}
}

/**
 * Runs a step-based task's steps without a build cache.
 *
 * A step-based task default-exports a factory <code>defineTask(options) => descriptor</code> whose descriptor
 * carries a <code>steps</code> array. This runner is the no-cache counterpart to the cached step runner in
 * <code>@ui5/project</code> (which <code>@ui5/builder</code> cannot import, the dependency direction being
 * <code>@ui5/cli -> @ui5/project -> @ui5/builder</code>): it runs every step in order, fans out every
 * map step's <code>keys</code> set, threads <code>needs</code> returns in memory, and buffers a
 * concurrent map step's writes so they flush in key order. It replaces the per-task batch fallback tasks
 * used to hand-write for standalone (direct or programmatic) invocation of <code>@ui5/builder</code>.
 *
 * Delta selection, CAS-backed returns, tag replay and signature computation are cache concerns and are
 * absent here; every step runs.
 *
 * @public
 * @module @ui5/builder/tasks/runTask
 */

/**
 * The descriptor a task factory returns from its default export, from
 * [Specification Version](https://ui5.github.io/cli/stable/pages/Configuration/#specification-versions) 5.0.
 * It carries the whole task in one object: the task body, its optional callbacks, and an optional declared
 * Specification Version.
 *
 * The factory must stay pure and cheap. UI5 CLI calls it once per build, early also for the build signature,
 * so it must not read or write resources, and it must not import heavy processors. The work happens in the
 * <code>task</code> body or in the step callbacks.
 *
 * @public
 * @typedef {object} TaskDescriptor
 * @property {object[]} [steps] The build steps of a cache-aware, step-based task. Give exactly one of
 *   <code>steps</code> or <code>task</code>. A step is a scalar step <code>{name, needs?, run}</code> or a
 *   map step <code>{name, needs?, sequential?, keys, each}</code>; the build cache re-runs only the steps,
 *   and within a map step only the keys, whose inputs changed.
 * @property {Function} [task] The task body <code>async (parameters) => Promise&lt;undefined&gt;</code> of a
 *   traditional task. Give exactly one of <code>steps</code> or <code>task</code>.
 * @property {boolean} [requiresDependencies=false] Whether the task needs access to the resources of the
 *   project's dependencies. When <code>false</code>, the <code>dependencies</code> reader is not provided.
 * @property {Function} [determineRequiredDependencies] Optional callback that reduces the set of dependencies
 *   made available through the <code>dependencies</code> reader.
 * @property {Function} [determineBuildSignature] Optional callback that contributes to the project's build
 *   signature, so a change outside the project's own resources can invalidate the task's cached output.
 * @property {string} [specVersion] Optional Specification Version. When set, it must be equal to the task
 *   extension's configured Specification Version.
 */

/**
 * Runs a step-based task's steps without a build cache.
 *
 * @public
 * @function default
 * @static
 * @param {Function} defineTask Task factory <code>defineTask(options) => descriptor</code> whose descriptor
 *   carries a <code>steps</code> array
 * @param {object} parameters
 * @param {@ui5/fs/DuplexCollection} parameters.workspace Workspace to read and write files
 * @param {@ui5/fs/AbstractReader} [parameters.dependencies] Reader to read dependency files
 * @param {@ui5/builder/tasks/TaskUtil|object} [parameters.taskUtil] TaskUtil, passed through to each step
 * @param {object} [parameters.options] Task options, passed to the factory and each step
 * @returns {Promise<undefined>} Resolves once all steps have run and their writes are flushed
 */
export default async function runTask(defineTask, {workspace, dependencies, taskUtil, options} = {}) {
	const {steps} = await defineTask(options);
	if (!steps) {
		throw new Error(
			"runTask requires a step-based task whose factory returns a descriptor with a 'steps' array");
	}
	// Each step's return, so a later step's needs can consume it. A scalar step's return is its single
	// value; a map step's is the array of its per-key returns in key order.
	const returns = new Map();

	for (const step of steps) {
		const needs = {};
		if (step.needs) {
			for (const name of step.needs) {
				needs[name] = returns.get(name);
			}
		}
		// Shared by the step's keys enumerator and all of its units, so frozen like in the cached step
		// runner: a unit assigning to needs.<producer> would otherwise leak into its siblings. The freeze
		// is shallow, since a producer may return resources whose own state must stay writable.
		Object.freeze(needs);
		const context = {needs, workspace, dependencies, taskUtil, options};

		if (typeof step.run === "function") {
			// Scalar step: run once, writes go straight to the workspace so a later step sees them.
			returns.set(step.name, await step.run(context));
			continue;
		}

		// Map step: enumerate keys, then run each key.
		const keys = [...((await step.keys(context)) ?? [])];
		if (step.sequential) {
			// Writes persist immediately, so a later key reads what an earlier key wrote.
			const results = [];
			for (const key of keys) {
				results.push(await step.each(key, context));
			}
			returns.set(step.name, results);
		} else {
			// Concurrent keys: buffer writes and flush them in key order once all keys finish.
			const buffer = new Map();
			const results = await Promise.all(keys.map((key, index) =>
				step.each(key, {
					...context,
					workspace: new BufferedWriter(
						workspace, buffer, index, getInputName(key), step.name, options?.taskName),
				})));
			await flushWriteBuffer(buffer, workspace);
			returns.set(step.name, results);
		}
	}
}
