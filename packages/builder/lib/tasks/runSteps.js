import AbstractReaderWriter from "@ui5/fs/AbstractReaderWriter";
import {assertDistinctWrite, flushWriteBuffer} from "@ui5/fs/internal/stepWriteBuffer";

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

	/**
	 * @param {@ui5/fs/AbstractReaderWriter} workspace Underlying workspace
	 * @param {Map<string, object>} buffer Shared write buffer, keyed by resource path
	 * @param {number} index Key position, used to flush in key order and detect same-path writes
	 */
	constructor(workspace, buffer, index) {
		super(typeof workspace.getName === "function" ? workspace.getName() : "workspace");
		this.#workspace = workspace;
		this.#buffer = buffer;
		this.#index = index;
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
		assertDistinctWrite(this.#buffer, key, this.#index);
		this.#buffer.set(key, {resource, args, index: this.#index});
	}
}

/**
 * Runs a step-based task's steps without a build cache.
 *
 * A step-based task default-exports a factory <code>build(options) => Step[]</code>. This runner is the
 * no-cache counterpart to the cached step runner in <code>@ui5/project</code> (which
 * <code>@ui5/builder</code> cannot import, the dependency direction being
 * <code>@ui5/cli -> @ui5/project -> @ui5/builder</code>): it runs every step in order, fans out every
 * map step's <code>keys</code> set, threads <code>needs</code> returns in memory, and buffers a
 * concurrent map step's writes so they flush in key order. It replaces the per-task batch fallback tasks
 * used to hand-write for standalone (direct or programmatic) invocation of <code>@ui5/builder</code>.
 *
 * Delta selection, CAS-backed returns, tag replay and signature computation are cache concerns and are
 * absent here; every step runs.
 *
 * @public
 * @module @ui5/builder/tasks/runSteps
 * @param {Function} build Task factory <code>build(options) => Step[]</code>
 * @param {object} parameters
 * @param {@ui5/fs/DuplexCollection} parameters.workspace Workspace to read and write files
 * @param {@ui5/fs/AbstractReader} [parameters.dependencies] Reader to read dependency files
 * @param {@ui5/builder/tasks/TaskUtil|object} [parameters.taskUtil] TaskUtil, passed through to each step
 * @param {object} [parameters.options] Task options, passed to the factory and each step
 * @returns {Promise<undefined>} Resolves once all steps have run and their writes are flushed
 */
export default async function runSteps(build, {workspace, dependencies, taskUtil, options} = {}) {
	const steps = await build(options);
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
				step.each(key, {...context, workspace: new BufferedWriter(workspace, buffer, index)})));
			await flushWriteBuffer(buffer, workspace);
			returns.set(step.name, results);
		}
	}
}
