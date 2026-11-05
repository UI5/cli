import module from "node:module";
import {fileURLToPath} from "node:url";
import {getLogger} from "@ui5/logger";
const log = getLogger("build:helpers:ToolDependencyRecorder");

/**
 * POC recorder for a task's external tool dependencies.
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
 * POC scope: single active capture (no concurrent-task attribution) and a flat `@ui5/*` package filter.
 * The hook is per-realm, so a tool loaded in a worker thread is not observed here; the worker dispatch
 * resolves such a tool's entry on the main thread, within the capture window, so it is recorded at version
 * level (entry + `package.json`).
 *
 * @module @ui5/project/build/helpers/ToolDependencyRecorder
 */

let hookInstalled = false;
// The Set collecting resolved file: URLs while a capture is active, or null when not capturing.
let activeCapture = null;

// Build plumbing the loader resolves alongside a tool but which is not a content-transform tool:
// workerpool is the worker-pool runtime. A change to it cannot alter a task's output, so tracking it would
// only cause spurious stage re-runs.
const PLUMBING_DENYLIST = ["workerpool"];

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
 * installed package), must not belong to an @ui5/* package, and must not be known build plumbing
 * ({@link PLUMBING_DENYLIST}). The @ui5/* subtrees are barriers: their effect on the build is already
 * covered by the @ui5/{builder,fs,project} version fold and the resource indices, so tracking them would
 * be redundant over-capture.
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
	if (PLUMBING_DENYLIST.some((name) => fileUrl.includes(`/node_modules/${name}/`))) {
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
 * Derives the `package.json` URL of the package a tool file belongs to.
 *
 * The resolver reads a package's `package.json` as metadata, but the tool never `import`s it, so it is
 * absent from the observed resolutions. Folding it into the tracked set anyway makes "content subsumes
 * version" literally true (a version-only bump whose shipped files are byte-identical still moves the
 * digest) and captures declared-surface changes — `dependencies` ranges, `exports`/`main` — that alter
 * resolution without changing a currently-loaded file.
 *
 * The package root is the segment after the LAST `/node_modules/` (two segments for an `@scope/name`
 * package), so a nested dependency resolves to its own `package.json`, not a hoisted copy.
 *
 * @param {string} fileUrl A file: URL under a node_modules
 * @returns {string|null} The package's `package.json` file: URL, or null if none can be derived
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
 * Closes a capture window and returns the tool files observed in it, as absolute paths. Each tracked
 * package's `package.json` is folded in alongside the observed files (see {@link packageJsonUrlOf}).
 *
 * @public
 * @param {object} handle The handle returned by {@link startCapture}
 * @returns {string[]} Sorted absolute paths of the resolved tool files
 */
export function stopCapture(handle) {
	activeCapture = handle.previous;
	const files = new Set();
	for (const url of handle.capture) {
		if (!isToolFile(url)) {
			continue;
		}
		files.add(fileURLToPath(url));
		const packageJsonUrl = packageJsonUrlOf(url);
		if (packageJsonUrl) {
			files.add(fileURLToPath(packageJsonUrl));
		}
	}
	return [...files].sort();
}

// A stage's recorded tool set, keyed by its logical stage id (taskName + step name), shared across the
// projects of one process. An in-process tool loads once per realm, and a cached require does not re-fire
// the resolve hook, so the first project of a `ui5 build --all` run captures the tool but a later project's
// identical stage captures nothing. The sticky record in BuildStageCache only spans builds of one project,
// so without this the later project records an empty set and serves the tool stale. The worker path does not
// need this (its collector accumulates at module level and returns the full set on every call).
const sharedToolFiles = new Map();

/**
 * Shares a stage's captured tool files across the projects of one process.
 *
 * Call it with the full tool set a stage captured this build, keyed by the stage's logical id. A non-empty
 * set is memoized under the key and returned unchanged; an empty set is treated as "the capture was blind
 * this project" and replaced by the set a prior project recorded for the same key (or stays empty if none).
 * The key is the same across projects for a standard task, so the recalled set belongs to the same module
 * and the same tools. It can only add a set, never shrink one, so the worst case is a spurious stage re-run.
 *
 * @public
 * @param {string} key The stage's logical id (e.g. `${taskName}\0${stepName}`)
 * @param {string[]} files The tool files the stage captured this build
 * @returns {string[]} The files to record: the captured set if non-empty, else a prior project's set
 */
export function shareToolFiles(key, files) {
	if (files.length > 0) {
		sharedToolFiles.set(key, files);
		return files;
	}
	return sharedToolFiles.get(key) ?? [];
}
