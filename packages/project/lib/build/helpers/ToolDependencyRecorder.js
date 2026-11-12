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
 * POC scope: single active capture (no concurrent-task attribution) and a package-name filter that
 * excludes the UI5 tooling packages ({@link isToolFile}).
 * The hook is per-realm, so a tool loaded in a worker thread is not observed here; the worker dispatch
 * resolves such a tool's entry on the main thread, within the capture window, so it is recorded at version
 * level (entry + `package.json`).
 *
 * @module @ui5/project/build/helpers/ToolDependencyRecorder
 */

let hookInstalled = false;
// The Set collecting resolved file: URLs while a capture is active, or null when not capturing.
let activeCapture = null;

// UI5 tooling packages whose versions are already folded into the build signature (a change inside one
// ships as a release that bumps its version and invalidates the cache), or that cannot affect build output
// at all (logger). Re-tracking their files as tool content would be redundant, so they are excluded.
// Matched against the file's OWNING package name, so an @ui5-scoped application dependency a task bundles
// (e.g. @ui5/webcomponents via ui5-tooling-modules) is NOT excluded and is tracked like any other package.
const UI5_TOOLING_BARRIER = new Set(["@ui5/builder", "@ui5/fs", "@ui5/project", "@ui5/logger"]);

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
 * The owning package name of a file: URL under a node_modules: the segment after the LAST `/node_modules/`
 * (two segments for an `@scope/name` package), or null when the URL is not under a node_modules.
 *
 * Using the LAST `/node_modules/` means the name is the package that actually ships the file, so a tool
 * nested under a tooling package (e.g. `.../@ui5/builder/node_modules/terser/...`) is attributed to
 * `terser`, not `@ui5/builder`, and stays tracked.
 *
 * @param {string} fileUrl A file: URL
 * @returns {string|null} The owning package name, or null
 */
function packageNameOf(fileUrl) {
	const marker = "/node_modules/";
	const markerStart = fileUrl.lastIndexOf(marker);
	if (markerStart === -1) {
		return null;
	}
	const segments = fileUrl.slice(markerStart + marker.length).split("/");
	const packageSegmentCount = segments[0].startsWith("@") ? 2 : 1;
	if (segments.length < packageSegmentCount) {
		return null;
	}
	return segments.slice(0, packageSegmentCount).join("/");
}

/**
 * Whether a resolved file URL counts as a tracked tool file.
 *
 * The file must live under a node_modules (an installed package), and its owning package must not be a UI5
 * tooling package already covered by the build signature ({@link UI5_TOOLING_BARRIER}). Only the UI5
 * *tooling* packages are barriers: a dependency in the `@ui5` scope that a task bundles (e.g.
 * `@ui5/webcomponents`) is tracked like any other package, so a version or entry change to it still moves
 * the stage's tool-content digest.
 *
 * @param {string} fileUrl A file: URL
 * @returns {boolean}
 */
export function isToolFile(fileUrl) {
	const packageName = packageNameOf(fileUrl);
	if (!packageName) {
		return false;
	}
	return !UI5_TOOLING_BARRIER.has(packageName);
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
 * Keyed on the owning package (the LAST `/node_modules/` segment, via {@link packageNameOf}), so a nested
 * dependency resolves to its own `package.json`, not a hoisted copy.
 *
 * @param {string} fileUrl A file: URL under a node_modules
 * @returns {string|null} The package's `package.json` file: URL, or null if none can be derived
 */
function packageJsonUrlOf(fileUrl) {
	const marker = "/node_modules/";
	const markerStart = fileUrl.lastIndexOf(marker);
	const packageName = packageNameOf(fileUrl);
	if (markerStart === -1 || !packageName) {
		return null;
	}
	const afterMarker = markerStart + marker.length;
	return `${fileUrl.slice(0, afterMarker)}${packageName}/package.json`;
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
