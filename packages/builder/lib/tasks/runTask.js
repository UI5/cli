import AbstractReaderWriter from "@ui5/fs/AbstractReaderWriter";
import {assertDistinctWrite, flushWriteBuffer, getInputName} from "@ui5/fs/internal/stepWriteBuffer";

/**
 * Names a rejected value in an error message without assuming that it is serializable.
 *
 * @param {*} value Rejected value
 * @returns {string} A short type description
 */
function describeValue(value) {
	if (value === null) {
		return "null";
	}
	if (value === undefined) {
		return "undefined";
	}
	if (typeof value === "object") {
		const name = value.constructor?.name;
		return name && name !== "Object" ? `a ${name}` : "a plain object";
	}
	return `a ${typeof value}`;
}

/**
 * Validates a step-based task's complete step list before any step runs.
 *
 * @param {*} steps The declared steps
 * @param {object} [parameters]
 * @param {string} [parameters.taskName] The task name, if available
 * @throws {Error} If the step list or a step declaration is invalid
 */
function validateSteps(steps, {taskName} = {}) {
	const where = taskName ? ` for task '${taskName}'` : "";
	if (!Array.isArray(steps)) {
		throw new Error(
			`Step factory${where} must return an array of step objects, got ${describeValue(steps)}`);
	}
	const seen = new Set();
	for (let i = 0; i < steps.length; i++) {
		const step = steps[i];
		if (!step || typeof step !== "object") {
			throw new Error(`Step at index ${i}${where} must be an object, got ${describeValue(step)}`);
		}
		if (typeof step.name !== "string" || !step.name) {
			throw new Error(`Step at index ${i}${where} must have a non-empty string 'name'`);
		}
		if (seen.has(step.name)) {
			throw new Error(`Duplicate step name '${step.name}'${where}`);
		}
		const isScalar = typeof step.run === "function";
		const hasKeys = typeof step.keys === "function";
		const hasEach = typeof step.each === "function";
		const isMap = hasKeys && hasEach;
		if (!isScalar && (hasKeys !== hasEach)) {
			throw new Error(`Map step '${step.name}' must define both 'keys' and 'each' functions`);
		}
		if (isScalar === isMap) {
			throw new Error(
				`Step '${step.name}' must be either a scalar step ({name, run}) or a ` +
					`map step ({name, keys, each})`);
		}
		if (step.needs !== undefined) {
			if (!Array.isArray(step.needs)) {
				throw new Error(
					`Step '${step.name}' 'needs' must be an array of earlier step names, ` +
						`got ${describeValue(step.needs)}`);
			}
			for (let j = 0; j < step.needs.length; j++) {
				const needed = step.needs[j];
				if (typeof needed !== "string") {
					throw new Error(
						`Step '${step.name}' 'needs' entries must be strings; ` +
							`entry ${j} is ${describeValue(needed)}`);
				}
				if (!seen.has(needed)) {
					throw new Error(
						`Step '${step.name}' needs '${needed}', which is not an earlier step`);
				}
			}
		}
		seen.add(step.name);
	}
}

/**
 * Validates the task descriptor before the runner uses it.
 *
 * @param {*} descriptor The value returned by the task factory
 * @param {object} [parameters]
 * @param {string} [parameters.taskName] The task name, if available
 * @throws {Error} If the descriptor is invalid
 */
function validateDescriptor(descriptor, {taskName} = {}) {
	const where = taskName ? ` for task '${taskName}'` : "";
	if (!descriptor || typeof descriptor !== "object") {
		throw new Error(
			`Task factory${where} must return a descriptor object, got ${describeValue(descriptor)}`);
	}
	const hasSteps = descriptor.steps !== undefined;
	const hasTask = descriptor.task !== undefined;
	if (hasSteps === hasTask) {
		throw new Error(`Task descriptor${where} must define exactly one of 'steps' or 'task'`);
	}
	if (hasSteps) {
		validateSteps(descriptor.steps, {taskName});
	}
	if (hasTask && typeof descriptor.task !== "function") {
		throw new Error(
			`Task descriptor${where} 'task' must be a function, got ${describeValue(descriptor.task)}`);
	}
	for (const callback of [
		"determineRequiredDependencies", "determineBuildSignature", "determineExpectedOutput",
	]) {
		if (descriptor[callback] !== undefined && typeof descriptor[callback] !== "function") {
			throw new Error(
				`Task descriptor${where} '${callback}' must be a function, ` +
					`got ${describeValue(descriptor[callback])}`);
		}
	}
	if (descriptor.specVersion !== undefined && typeof descriptor.specVersion !== "string") {
		throw new Error(
			`Task descriptor${where} 'specVersion' must be a string, ` +
				`got ${describeValue(descriptor.specVersion)}`);
	}
}

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
 * Runs a UI5 Builder task without a build cache.
 *
 * A task default-exports a factory <code>defineTask(options) => descriptor</code>. A traditional descriptor's
 * <code>task</code> function runs directly. For a descriptor with a <code>steps</code> array, this runner is the
 * no-cache counterpart to the cached step runner in <code>@ui5/project</code> (which <code>@ui5/builder</code>
 * cannot import, the dependency direction being <code>@ui5/cli -> @ui5/project -> @ui5/builder</code>): it runs
 * every step in order, fans out every map step's <code>keys</code> set, threads <code>needs</code> returns in memory,
 * and buffers a concurrent map step's writes so they flush in key order. It replaces the per-task batch fallback
 * tasks used to hand-write for standalone (direct or programmatic) invocation of <code>@ui5/builder</code>.
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
 * @property {Function} [determineExpectedOutput] Optional callback that declares the task's expected output.
 * @property {string} [specVersion] Optional Specification Version. When set, it must be equal to the task
 *   extension's configured Specification Version.
 */

/**
 * Runs a UI5 Builder task without a build cache.
 *
 * @public
 * @function default
 * @static
 * @param {Function} defineTask Task factory <code>defineTask(options) => descriptor</code>
 * @param {object} parameters
 * @param {@ui5/fs/DuplexCollection} parameters.workspace Workspace to read and write files
 * @param {@ui5/fs/AbstractReader} [parameters.dependencies] Reader to read dependency files
 * @param {@ui5/builder/tasks/TaskUtil|object} [parameters.taskUtil] TaskUtil, passed to the task body or each step
 * @param {object} [parameters.options] Task options, passed to the factory, task body, or each step
 * @returns {Promise<undefined>} Resolves once the task has run and all writes are complete
 */
export default async function runTask(defineTask, {workspace, dependencies, taskUtil, options} = {}) {
	const descriptor = await defineTask(options);
	validateDescriptor(descriptor, {taskName: options?.taskName});
	const {steps, task} = descriptor;
	if (typeof task === "function") {
		await task({workspace, dependencies, taskUtil, options});
		return;
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
