/**
 * @module @ui5/fs/internal/stepWriteBuffer
 * @description Shared write-buffer contract for the step-based build task runners.
 *
 * A map step fans out over its keys and runs the per-key units concurrently. Concurrent units are
 * required to be independent, so their writes are buffered instead of hitting the workspace directly and
 * are flushed in key order once every unit has finished. Two concurrent keys writing the same resource
 * path is a contract violation rather than a last-wins race.
 *
 * Two runners implement this: the cache-aware runner in <code>@ui5/project</code>
 * (<code>build/helpers/StepRunner</code>) and the cache-free runner in <code>@ui5/builder</code>
 * (<code>tasks/runTask</code>). <code>@ui5/builder</code> cannot import <code>@ui5/project</code>
 * (the dependency direction is <code>@ui5/cli -> @ui5/project -> @ui5/builder</code>), so the two runners
 * stay separate, but the same-path guard, its user-visible error message and the key-order flush live here
 * so both runners share one definition.
 *
 * The buffer is a <code>Map</code> keyed by resource path (or, for a test fake without
 * <code>getPath</code>, by identity). Each entry has the shape
 * <code>{resource, args, index, inputName}</code>: <code>resource</code> is the resource to write,
 * <code>args</code> are the trailing arguments to replay to <code>workspace.write(resource, ...args)</code>,
 * <code>index</code> is the unit's position in the key order, and <code>inputName</code> is its string key or
 * map-key resource path, if available.
 */

function describeInput({index, inputName}) {
	return inputName === undefined ? `#${index + 1}` : `'${inputName}'`;
}

/**
 * Derives the <code>inputName</code> for a map key: the key itself when it is a string, or its resource
 * path when it is a resource. Any other key (for example a test fake without <code>getPath</code>) has no
 * name, so the buffer entry and the error message fall back to the positional <code>#N</code> form. Both
 * runners feed this to {@link assertDistinctWrite} and the buffer entry, so it lives here with the rest of
 * the write-buffer contract to keep the two runners from drifting.
 *
 * @param {*} value Map key of the writing unit
 * @returns {string|undefined} String key, resource path, or <code>undefined</code> if the key has no name
 */
export function getInputName(value) {
	if (typeof value === "string") {
		return value;
	}
	return value && typeof value.getPath === "function" ? value.getPath() : undefined;
}

/**
 * Rejects a second concurrent key writing a path another key already buffered.
 *
 * A unit writing a path it buffered itself (same <code>index</code>) is allowed, so a unit may overwrite
 * its own earlier write within one run. A different unit (different <code>index</code>) writing the same
 * path throws, because concurrent keys must be independent.
 *
 * @param {Map<string, {resource: @ui5/fs/Resource, args: object[], index: number,
 *   inputName: string|undefined}>} buffer Shared write buffer, keyed by resource path
 * @param {string} path Resource path being written, used as the buffer key
 * @param {number} index Position of the writing unit in the key order
 * @param {string|undefined} inputName String map key or resource path of the writing unit, if available
 * @param {string} stepName Name of the map step
 * @param {string|undefined} taskName Name of the task, if available
 */
export function assertDistinctWrite(buffer, path, index, inputName, stepName, taskName) {
	const existing = buffer.get(path);
	if (existing && existing.index !== index) {
		const taskContext = taskName ? ` in task '${taskName}'` : "";
		throw new Error(
			`Concurrent map step '${stepName}'${taskContext} tried to write '${path}' for invocations ` +
			`${describeInput(existing)} and ${describeInput({index, inputName})}. ` +
			`No two invocations may write to the same path.`);
	}
}

/**
 * Flushes a map step's buffered writes to the workspace in key order.
 *
 * The buffered entries are replayed sorted by <code>index</code>, so the observable write sequence matches
 * the key order regardless of the order the concurrent units finished in.
 *
 * @param {Map<string, {resource: @ui5/fs/Resource, args: object[], index: number,
 *   inputName: string|undefined}>} buffer Shared write buffer, keyed by resource path
 * @param {@ui5/fs/AbstractReaderWriter} workspace Workspace the buffered writes are flushed to
 * @returns {Promise<undefined>} Resolves once every buffered write has been flushed
 */
export async function flushWriteBuffer(buffer, workspace) {
	const ordered = [...buffer.values()].sort((a, b) => a.index - b.index);
	for (const {resource, args} of ordered) {
		await workspace.write(resource, ...args);
	}
}
