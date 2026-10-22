import module from "node:module";
import {fileURLToPath} from "node:url";
import {getLogger} from "@ui5/logger";
const log = getLogger("build:helpers:ToolDependencyRecorder");

/**
 * POC recorder for a task's external tool dependencies (CPOUI5FOUNDATION-1386).
 *
 * A build task may load an external tool to transform content (e.g. buildThemes -> less-openui5,
 * minify -> terser). The tool's version is an input to the build, but the cache never observes it, so a
 * tool change with no @ui5/builder release is a stale cache hit. This recorder observes which module
 * files a task resolves during execution via {@link module.registerHooks}, so their content can be
 * folded into the stage signature.
 *
 * The hook is installed once per thread and is a no-op unless a capture is active. {@link startCapture}
 * opens a window around a task's execution; {@link stopCapture} returns the resolved tool files observed
 * in that window. `resolve` fires on every resolution (ESM import and CommonJS require alike, and even
 * for already-cached modules), so the observation does not depend on module-cache state.
 *
 * POC scope: in-process tasks only (the hook is per-realm, so worker-thread tools are not observed yet),
 * single active capture (no concurrent-task attribution), and a lightweight package filter standing in
 * for the full import-graph barrier prune. See NOTES.md for the complete design.
 *
 * @module @ui5/project/build/helpers/ToolDependencyRecorder
 */

let hookInstalled = false;
// The Set collecting resolved file: URLs while a capture is active, or null when not capturing.
let activeCapture = null;

/**
 * Installs the resolve hook once per thread. Idempotent.
 */
function ensureHookInstalled() {
	if (hookInstalled) {
		return;
	}
	hookInstalled = true;
	module.registerHooks({
		resolve(specifier, context, nextResolve) {
			const result = nextResolve(specifier, context);
			// Only file: resolutions are tool candidates; node: builtins and other schemes are skipped.
			if (activeCapture && typeof result?.url === "string" && result.url.startsWith("file:")) {
				activeCapture.add(result.url);
			}
			return result;
		},
	});
	log.verbose("Installed module resolution hook for tool-dependency recording");
}

/**
 * Whether a resolved file URL counts as a tracked tool file.
 *
 * POC filter (stand-in for the import-graph barrier prune): the file must live under a node_modules (an
 * installed package), and must not belong to an @ui5/* package. The @ui5/* subtrees are barriers: their
 * effect on the build is already covered by the @ui5/{builder,fs,project} version fold and the resource
 * indices, so tracking them would be redundant over-capture.
 *
 * @param {string} fileUrl A file: URL
 * @returns {boolean}
 */
function isToolFile(fileUrl) {
	if (!fileUrl.includes("/node_modules/")) {
		return false;
	}
	if (fileUrl.includes("/node_modules/@ui5/")) {
		return false;
	}
	return true;
}

/**
 * Opens a capture window. Resolutions until the matching {@link stopCapture} are recorded.
 *
 * @public
 * @returns {object} An opaque handle to pass to {@link stopCapture}
 */
export function startCapture() {
	ensureHookInstalled();
	const previous = activeCapture;
	const capture = new Set();
	activeCapture = capture;
	return {previous, capture};
}

/**
 * Closes a capture window and returns the tool files observed in it, as absolute paths.
 *
 * @public
 * @param {object} handle The handle returned by {@link startCapture}
 * @returns {string[]} Sorted absolute paths of the resolved tool files
 */
export function stopCapture(handle) {
	activeCapture = handle.previous;
	const files = [];
	for (const url of handle.capture) {
		if (isToolFile(url)) {
			files.push(fileURLToPath(url));
		}
	}
	files.sort();
	return files;
}
