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
 * (<code>tasks/runSteps</code>). <code>@ui5/builder</code> cannot import <code>@ui5/project</code>
 * (the dependency direction is <code>@ui5/cli -> @ui5/project -> @ui5/builder</code>), so the two runners
 * stay separate, but the same-path guard, its user-visible error message and the key-order flush live here
 * so both runners share one definition.
 *
 * The buffer is a <code>Map</code> keyed by resource path (or, for a test fake without
 * <code>getPath</code>, by identity). Each entry has the shape
 * <code>{resource, args, index}</code>: <code>resource</code> is the resource to write, <code>args</code>
 * are the trailing arguments to replay to <code>workspace.write(resource, ...args)</code>, and
 * <code>index</code> is the unit's position in the key order.
 */

/**
 * Rejects a second concurrent key writing a path another key already buffered.
 *
 * A unit writing a path it buffered itself (same <code>index</code>) is allowed, so a unit may overwrite
 * its own earlier write within one run. A different unit (different <code>index</code>) writing the same
 * path throws, because concurrent keys must be independent.
 *
 * @param {Map<string, {resource: @ui5/fs/Resource, args: object[], index: number}>} buffer Shared write
 *   buffer, keyed by resource path
 * @param {string} path Resource path being written, used as the buffer key
 * @param {number} index Position of the writing unit in the key order
 */
export function assertDistinctWrite(buffer, path, index) {
	const existing = buffer.get(path);
	if (existing && existing.index !== index) {
		throw new Error(
			`Concurrent map-step keys must not write the same resource path ${path}. ` +
			`Pass {sequential: true} if a later key must build on an earlier key's writes.`);
	}
}

/**
 * Flushes a map step's buffered writes to the workspace in key order.
 *
 * The buffered entries are replayed sorted by <code>index</code>, so the observable write sequence matches
 * the key order regardless of the order the concurrent units finished in.
 *
 * @param {Map<string, {resource: @ui5/fs/Resource, args: object[], index: number}>} buffer Shared write
 *   buffer, keyed by resource path
 * @param {@ui5/fs/AbstractReaderWriter} workspace Workspace the buffered writes are flushed to
 * @returns {Promise<undefined>} Resolves once every buffered write has been flushed
 */
export async function flushWriteBuffer(buffer, workspace) {
	const ordered = [...buffer.values()].sort((a, b) => a.index - b.index);
	for (const {resource, args} of ordered) {
		await workspace.write(resource, ...args);
	}
}
