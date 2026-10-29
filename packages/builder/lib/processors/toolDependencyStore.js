/**
 * Main-thread hand-off store for tool dependencies observed inside build workers
 * (CPOUI5FOUNDATION-1386).
 *
 * A worker returns the tool files it loaded alongside its build result (see
 * {@link @ui5/builder/processors/toolDependencyCollector}). The main-thread processor dispatch forwards
 * them here via {@link add}; `@ui5/project`'s step/task runner imports this module and {@link drain}s it
 * right after a stage's execution, folding the worker-observed files into that stage's `tool-content`
 * signature. `@ui5/project` can import `@ui5/builder` (not the reverse), so the shared point lives here.
 *
 * Attribution is by time window: a stage awaits its worker `exec` calls, so the files added during that
 * window belong to that stage. Projects build sequentially, so windows do not overlap across projects.
 *
 * @module @ui5/builder/processors/toolDependencyStore
 */

const observedToolFiles = new Set();

/**
 * Records tool files a worker reported for the stage currently executing.
 *
 * @public
 * @param {string[]} [paths] Absolute tool file paths returned by a worker
 */
export function add(paths) {
	if (!paths) {
		return;
	}
	for (const path of paths) {
		observedToolFiles.add(path);
	}
}

/**
 * Returns and clears the accumulated tool files, so the next stage starts from an empty window.
 *
 * @public
 * @returns {string[]} The accumulated absolute tool file paths
 */
export function drain() {
	const paths = [...observedToolFiles];
	observedToolFiles.clear();
	return paths;
}
