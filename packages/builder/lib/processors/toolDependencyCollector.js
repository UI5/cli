import module from "node:module";
import {fileURLToPath} from "node:url";

/**
 * Worker-side collector for a task's external tool dependencies (CPOUI5FOUNDATION-1386).
 *
 * The main-thread {@link @ui5/project/build/helpers/ToolDependencyRecorder} is blind to modules a build
 * task loads inside a worker thread, because `module.registerHooks` is per-realm. This collector is the
 * worker-realm counterpart: it installs the resolve hook inside the worker and accumulates the resolved
 * tool files, so the worker can return them to the main thread alongside its build result.
 *
 * It lives in `@ui5/builder` (not `@ui5/project`) because the workers do, and `@ui5/builder` cannot import
 * `@ui5/project`. The filter below mirrors the project recorder's `isToolFile` / `packageJsonUrlOf`;
 * duplicated across the package boundary intentionally (the authoritative barrier prune consolidates later).
 *
 * Capture-once-per-worker: the accumulated set is module-level, so it survives across `exec` calls. A
 * `workerpool` worker is reused across projects, and a repeat `import` of an already-loaded tool does not
 * re-fire the resolve hook — so the worker captures a tool on its first load and returns that same set on
 * every later call, giving every project/stage the full set.
 *
 * @module @ui5/builder/processors/toolDependencyCollector
 */

const toolFiles = new Set();
let hookInstalled = false;

// Build plumbing the loader resolves alongside the tool but which is not a content-transform tool:
// workerpool is the worker-pool runtime that hosts this very worker. A change to it cannot alter a task's
// output, so tracking it would only cause spurious stage re-runs. The @ui5/* packages are excluded for the
// same reason (barriers — already covered by the folded @ui5/* versions and the resource indices).
const PLUMBING_DENYLIST = ["workerpool"];

/**
 * Whether a resolved file URL counts as a tracked tool file: it must live under a node_modules (an
 * installed package), not belong to an @ui5/* package, and not be known build plumbing
 * ({@link PLUMBING_DENYLIST}).
 *
 * @param {string} fileUrl A file: URL
 * @returns {boolean}
 */
function isToolFile(fileUrl) {
	if (!fileUrl.includes("/node_modules/") || fileUrl.includes("/node_modules/@ui5/")) {
		return false;
	}
	return !PLUMBING_DENYLIST.some((name) => fileUrl.includes(`/node_modules/${name}/`));
}

/**
 * Derives the package.json URL of the package a tool file belongs to. The resolver reads package.json as
 * metadata but the tool never imports it, so folding it in makes a version-only bump observable. The
 * package root is the segment after the LAST /node_modules/ (two segments for an @scope/name package).
 *
 * @param {string} fileUrl A file: URL under a node_modules
 * @returns {string|null}
 */
function packageJsonUrlOf(fileUrl) {
	const marker = "/node_modules/";
	const markerStart = fileUrl.lastIndexOf(marker);
	if (markerStart === -1) {
		return null;
	}
	const afterMarker = markerStart + marker.length;
	const segments = fileUrl.slice(afterMarker).split("/");
	const packageSegmentCount = segments[0].startsWith("@") ? 2 : 1;
	if (segments.length < packageSegmentCount) {
		return null;
	}
	const packagePath = segments.slice(0, packageSegmentCount).join("/");
	return `${fileUrl.slice(0, afterMarker)}${packagePath}/package.json`;
}

/**
 * Installs the resolve hook once per worker realm. Call this only inside a worker (from the
 * `!workerpool.isMainThread` block), never on the main thread — importing this module from the main
 * thread for its exports must stay side-effect-free.
 *
 * @public
 */
export function installToolDependencyHook() {
	if (hookInstalled) {
		return;
	}
	hookInstalled = true;
	module.registerHooks({
		resolve(specifier, context, nextResolve) {
			const result = nextResolve(specifier, context);
			const url = result?.url;
			if (typeof url === "string" && url.startsWith("file:") && isToolFile(url)) {
				toolFiles.add(fileURLToPath(url));
				const packageJsonUrl = packageJsonUrlOf(url);
				if (packageJsonUrl) {
					toolFiles.add(fileURLToPath(packageJsonUrl));
				}
			}
			return result;
		},
	});
}

/**
 * Returns the tool files accumulated in this worker realm so far, as sorted absolute paths.
 *
 * @public
 * @returns {string[]}
 */
export function collectToolDependencies() {
	return [...toolFiles].sort();
}
