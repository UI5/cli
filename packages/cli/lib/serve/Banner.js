import process from "node:process";
import {createLogUpdate} from "log-update";
import sliceAnsi from "slice-ansi";
import chalk from "chalk";
import Logger from "@ui5/logger/Logger";
import {createInitialState, STATES} from "./state.js";
import {renderHeader, renderStatusLine} from "./render.js";

// Mirror the level prefixes used by @ui5/logger's default ConsoleWriter so
// scrolled-back log lines look identical whether or not the banner is active.
const LEVEL_PREFIX = {
	warn: chalk.yellow("warn"),
	error: chalk.bgRed.white("error"),
};

// Spinner tick interval while in `building` state.
const BUILDING_TICK_MS = 120;

// Decode the tail of `stream.write(chunk[, encoding][, callback])`. `encoding`
// falls back to "utf8" (Node's default) when not supplied.
function parseWriteArgs(encodingOrCallback, maybeCallback) {
	if (typeof encodingOrCallback === "function") {
		return {encoding: "utf8", callback: encodingOrCallback};
	}
	return {
		encoding: typeof encodingOrCallback === "string" ? encodingOrCallback : "utf8",
		callback: typeof maybeCallback === "function" ? maybeCallback : undefined,
	};
}

/**
 * Live banner for `ui5 serve`. Owns process.stdout while active.
 *
 * Subscribes to the @ui5/logger event surface (ui5.log, ui5.build-metadata,
 * ui5.build-status, ui5.project-build-status, ui5.serve-status, ui5.log.stop-console)
 * and renders a header + status line as a single live region. As more data
 * becomes known (project resolved, server bound), the header is repainted
 * in place — sections that aren't known yet show dim placeholders.
 *
 * The actual terminal bookkeeping (wrap-aware erase of the previous frame,
 * cursor hide/show, screen-row vs. logical-line accounting) is delegated to
 * the `log-update` package, which counts screen rows after wrap rather than
 * logical lines — important when warnings exceed the terminal width.
 *
 * Lifecycle: {@link Banner.observe} paints the skeleton immediately (brand
 * only, placeholders for the rest) and attaches the event listeners. Use it
 * as soon as `ui5 serve` decides it wants a banner — well before the project
 * graph is built — so the user sees feedback right away. Section setters
 * ({@link Banner#setProject}, {@link Banner#setUrls}) then update individual
 * header sections and repaint in place.
 */
class Banner {
	#stdout;
	#stopped = false;
	#state;
	#layout = {projectNameWidth: 0, taskNameWidth: 0};
	#tickTimer = null;
	#columns;
	// Map of build-status: track which project index is next.
	#projectOrder = [];
	// `log-update` instance bound to `#stdout`. Owns the live region: every
	// `#render()` call hands it the full multi-line frame and it diffs against
	// the previous one, erasing wrap-correctly.
	#logUpdate;

	// True while a live-region render (or explicit persist/done) is in flight,
	// so #interceptWrite lets log-update's own bytes through to the real
	// stream. Any *other* write hits the interception path.
	#renderingLiveRegion = false;
	// Per-stream interception bookkeeping. Keyed by "stdout"/"stderr", each
	// entry holds the saved original write method (or `null` when this stream
	// is not being intercepted) and any partial (non-newline-terminated) bytes
	// that arrived without a newline yet.
	#streams = {
		stdout: {orig: null, partial: ""},
		stderr: {orig: null, partial: ""},
	};

	// Bound listeners so we can `process.off` them on stop().
	#onLog;
	#onBuildMetadata;
	#onBuildStatus;
	#onProjectBuildStatus;
	#onServeStatus;
	#onStopConsole;
	#onResize;

	/**
	 * Paint the banner skeleton immediately (with placeholders for any
	 * unknown sections) and attach the event listeners. Subsequent section
	 * setters refine the skeleton in place.
	 *
	 * @param {object} [opts]
	 * @param {WriteStream} [opts.stdout]
	 * @param {object} [opts.brand]        { name, version } — usually known up front
	 * @param {boolean} [opts.acceptRemoteConnections] known up front from argv
	 * @param {number} [opts.networkAddressCount] how many network URLs setUrls()
	 *     will later supply — used so the initial placeholder reserves the
	 *     correct number of lines and the live region doesn't re-flow.
	 * @param {boolean} [opts.interceptProcessWrites=true] wrap
	 *     `process.stdout.write` / `process.stderr.write` so raw writes from
	 *     custom tasks or third-party libraries are re-routed through
	 *     {@link Banner#logAbove} instead of corrupting the live region.
	 *     Tests that supply a stub `stdout` opt out of this by default —
	 *     interception activates only when `opts.stdout` is unset or is the
	 *     real `process.stdout`.
	 * @returns {Banner}
	 */
	static observe(opts = {}) {
		const banner = new Banner(opts);
		if (opts.brand) {
			banner.#state.brand = opts.brand;
		}
		if ("acceptRemoteConnections" in opts) {
			banner.#state.acceptRemoteConnections = !!opts.acceptRemoteConnections;
		}
		if (typeof opts.networkAddressCount === "number") {
			banner.#state.networkAddressCount = opts.networkAddressCount;
		}
		banner.#attachListeners();
		banner.#logUpdate = createLogUpdate(banner.#stdout);
		banner.#render();
		banner.#scheduleTick();
		const wantsIntercept = opts.interceptProcessWrites !== false &&
			banner.#stdout === process.stdout;
		if (wantsIntercept) {
			banner.#installWriteInterceptors();
		}
		return banner;
	}

	constructor({stdout = process.stdout} = {}) {
		this.#stdout = stdout;
		this.#state = createInitialState();
		this.#columns = stdout.columns;
	}

	/**
	 * Update the project + framework section and repaint. Pass `framework`
	 * as `null` (or omit) for projects without a framework dependency.
	 *
	 * @param {object} info { name, type, version, framework? }
	 */
	setProject(info) {
		this.#state.project = {
			name: info.name,
			type: info.type,
			version: info.version,
		};
		this.#state.framework = info.framework || null;
		this.#render();
	}

	/**
	 * Update the URLs section (local + optional network) and repaint.
	 *
	 * @param {object} info
	 * @param {string} info.local
	 * @param {string[]} [info.network]
	 */
	setUrls(info) {
		this.#state.urls = {
			local: info.local,
			network: info.network,
		};
		this.#render();
	}

	// Compose the full live region as a single string: header lines + blank
	// separator + status line. `log-update` handles wrapping and erase of the
	// previous frame, so we just hand it the full text.
	#composeLiveRegion() {
		const headerLines = renderHeader({
			brand: this.#state.brand,
			urls: this.#state.urls,
			acceptRemoteConnections: this.#state.acceptRemoteConnections,
			networkAddressCount: this.#state.networkAddressCount,
			project: this.#state.project,
			framework: this.#state.framework,
		});
		// `log-update` wraps long lines onto additional rows; the status line is
		// designed to fit on a single row, so clip it to the terminal width here.
		// `this.#columns` is undefined when stdout isn't a TTY — sliceAnsi treats
		// that as "no limit" and returns the line unchanged.
		const statusLine = sliceAnsi(
			renderStatusLine(this.#state, this.#layout), 0, this.#columns);
		return [...headerLines, "", statusLine].join("\n");
	}

	#render() {
		if (this.#stopped) {
			return;
		}
		this.#withRenderingGuard(() => this.#logUpdate(this.#composeLiveRegion()));
	}

	/**
	 * Write a log line ABOVE the live region so it persists in scrollback.
	 *
	 * Delegates to `log-update`'s `persist()` (which erases the live region,
	 * writes the line in its place, and accounts for wrapped lines correctly)
	 * followed by a fresh render of the live region below it. Pass a string
	 * with embedded newlines to persist multiple lines in a single frame —
	 * cheaper than N separate `logAbove` calls when bursts arrive.
	 *
	 * @param {string} line The log line to write above the live region.
	 */
	logAbove(line) {
		if (this.#stopped) {
			this.#stdout.write(line + "\n");
			return;
		}
		// `persist` writes `line` where the live region currently sits and
		// resets log-update's internal frame state. The follow-up render
		// re-creates the live region right below it.
		this.#withRenderingGuard(() => {
			this.#logUpdate.persist(line);
			this.#logUpdate(this.#composeLiveRegion());
		});
	}

	stop() {
		if (this.#stopped) {
			return;
		}
		this.#stopped = true;
		this.#clearTick();
		this.#detachListeners();
		// Flush any partial (non-newline-terminated) buffered writes before
		// we tear down the live region, then restore the process.* originals.
		// Flushing first while the live region is still on-screen keeps the
		// trailing fragment above the final frame instead of after it.
		this.#flushPartialBuffers();
		this.#uninstallWriteInterceptors();
		// `done` restores the cursor (which log-update hid on first render)
		// and resets state. End on a clean newline so the prompt lands
		// below the final frame.
		this.#withRenderingGuard(() => this.#logUpdate?.done());
		this.#stdout.write("\n");
	}

	// Run `fn` with the re-render flag set so log-update's own writes to
	// the intercepted process streams pass through untouched. Any nested
	// stdout/stderr write inside `fn` will bypass the line-buffering path.
	#withRenderingGuard(fn) {
		this.#renderingLiveRegion = true;
		try {
			return fn();
		} finally {
			this.#renderingLiveRegion = false;
		}
	}

	// ---- Event subscriptions --------------------------------------------------

	#attachListeners() {
		this.#onLog = (evt) => this.#handleLog(evt);
		this.#onBuildMetadata = (evt) => this.#handleBuildMetadata(evt);
		this.#onBuildStatus = (evt) => this.#handleBuildStatus(evt);
		this.#onProjectBuildStatus = (evt) => this.#handleProjectBuildStatus(evt);
		this.#onServeStatus = (evt) => this.#handleServeStatus(evt);
		this.#onStopConsole = () => this.stop();
		this.#onResize = () => this.#handleResize();

		process.on("ui5.log", this.#onLog);
		process.on("ui5.build-metadata", this.#onBuildMetadata);
		process.on("ui5.build-status", this.#onBuildStatus);
		process.on("ui5.project-build-status", this.#onProjectBuildStatus);
		process.on("ui5.serve-status", this.#onServeStatus);
		process.on("ui5.log.stop-console", this.#onStopConsole);
		if (typeof this.#stdout.on === "function") {
			this.#stdout.on("resize", this.#onResize);
		}
	}

	#detachListeners() {
		process.off("ui5.log", this.#onLog);
		process.off("ui5.build-metadata", this.#onBuildMetadata);
		process.off("ui5.build-status", this.#onBuildStatus);
		process.off("ui5.project-build-status", this.#onProjectBuildStatus);
		process.off("ui5.serve-status", this.#onServeStatus);
		process.off("ui5.log.stop-console", this.#onStopConsole);
		if (typeof this.#stdout.off === "function") {
			this.#stdout.off("resize", this.#onResize);
		}
	}

	#handleLog({level, message, moduleName}) {
		// The banner curates `info` away (the status line already represents
		// the build's state). Verbose / perf / silly users hit the fallback
		// path before the banner ever activates. Warnings and errors persist —
		// but only if the configured log level lets them through. The standard
		// ConsoleWriter does this filtering implicitly via its `#writeMessage`;
		// the banner acts as its own writer here, so it has to check too.
		if (level !== "warn" && level !== "error") {
			return;
		}
		if (!Logger.isLevelEnabled(level)) {
			return;
		}
		const levelPrefix = LEVEL_PREFIX[level];
		const formatted = moduleName ?
			`${levelPrefix} ${chalk.blue(moduleName)} ${message}` :
			`${levelPrefix} ${message}`;
		this.logAbove(formatted);
	}

	#handleBuildMetadata({projectsToBuild}) {
		this.#projectOrder = Array.from(projectsToBuild);
		this.#state.totalProjects = this.#projectOrder.length;
		this.#state.currentProjectIndex = 0;
		this.#state.currentProjectName = "";
		this.#state.currentTaskName = "";
		this.#layout.projectNameWidth = this.#projectOrder.reduce(
			(max, name) => Math.max(max, name.length), 0);
		this.#render();
	}

	#handleBuildStatus({projectName, status}) {
		if (status === "project-build-start" || status === "project-build-skip") {
			const idx = this.#projectOrder.indexOf(projectName);
			this.#state.currentProjectIndex = idx >= 0 ?
				idx + 1 :
				this.#state.currentProjectIndex + 1;
			this.#state.currentProjectName = projectName;
			this.#state.currentTaskName = "";
			this.#render();
		}
	}

	#handleProjectBuildStatus({taskName, status}) {
		if (status === "task-start") {
			this.#state.currentTaskName = taskName;
			// Task names aren't known up front; widen the column the first time
			// we see a longer one so subsequent renders don't reflow.
			if (taskName.length > this.#layout.taskNameWidth) {
				this.#layout.taskNameWidth = taskName.length;
			}
			this.#render();
		}
	}

	#handleServeStatus(evt) {
		switch (evt.status) {
		case "serve-ready":
			this.#transitionTo(STATES.READY);
			break;
		case "serve-stale":
			this.#state.changedProjects = evt.changedProjects || [];
			this.#transitionTo(STATES.STALE);
			break;
		case "serve-building":
			this.#state.currentProjectIndex = 0;
			this.#state.currentProjectName = "";
			this.#state.currentTaskName = "";
			this.#state.spinFrame = 0;
			this.#transitionTo(STATES.BUILDING);
			break;
		case "serve-build-done":
			this.#state.lastBuildHrtime = Array.isArray(evt.hrtime) ? evt.hrtime : null;
			this.#transitionTo(STATES.READY);
			break;
		case "serve-error":
			this.#state.errorMessage = evt.error?.message || String(evt.error);
			this.#transitionTo(STATES.ERROR);
			// Don't echo the error via logAbove — BuildServer already logs
			// the same message at `error` level (which #handleLog scrolls
			// above the banner), and the yargs fail-handler renders the full
			// stack trace once the handler promise rejects. A third copy here
			// would just be noise.
			break;
		}
	}

	#handleResize() {
		this.#columns = this.#stdout.columns;
		this.#render();
	}

	#transitionTo(newState) {
		if (this.#state.state === newState) {
			this.#render();
			return;
		}
		this.#state.state = newState;
		this.#state.spinFrame = 0;
		this.#clearTick();
		this.#scheduleTick();
		this.#render();
	}

	#scheduleTick() {
		if (this.#stopped) {
			return;
		}
		if (this.#state.state !== STATES.BUILDING) {
			return;
		}
		this.#tickTimer = setInterval(() => {
			this.#state.spinFrame++;
			this.#render();
		}, BUILDING_TICK_MS);
		// Don't keep the event loop alive purely for the banner spinner.
		if (typeof this.#tickTimer.unref === "function") {
			this.#tickTimer.unref();
		}
	}

	#clearTick() {
		if (this.#tickTimer) {
			clearInterval(this.#tickTimer);
			this.#tickTimer = null;
		}
	}

	// ---- process.stdout / process.stderr interception -------------------------
	// Custom tasks and third-party libraries sometimes bypass @ui5/logger and
	// write straight to the process streams. Any such write between banner
	// frames throws off log-update's line-count accounting (it counts only the
	// bytes it emitted itself) and the next render corrupts — typically by
	// duplicating the header. To keep the live region intact we replace
	// process.stdout.write / process.stderr.write while the banner is active
	// and route incoming bytes through logAbove() line by line. log-update's
	// own writes bypass the interception via the #renderingLiveRegion flag.

	#installWriteInterceptors() {
		for (const which of ["stdout", "stderr"]) {
			const entry = this.#streams[which];
			entry.orig = process[which].write;
			process[which].write = this.#makeInterceptor(process[which], entry.orig, which);
		}
	}

	#uninstallWriteInterceptors() {
		for (const which of ["stdout", "stderr"]) {
			const entry = this.#streams[which];
			if (entry.orig) {
				process[which].write = entry.orig;
				entry.orig = null;
			}
		}
	}

	#makeInterceptor(stream, original, which) {
		// The returned function mirrors WriteStream#write's overloads:
		//   write(chunk[, encoding][, callback]) -> boolean
		return (chunk, encodingOrCallback, maybeCallback) => {
			// Re-entrant writes (log-update painting the live region, or
			// stop-time flushes / `done()`) must pass through untouched —
			// otherwise the very act of rendering would recurse into
			// logAbove.
			if (this.#renderingLiveRegion || this.#stopped) {
				// Forward the argument list as-is so the real write() sees
				// the same overload the caller intended.
				return original.call(stream, chunk, encodingOrCallback, maybeCallback);
			}
			const {encoding, callback} = parseWriteArgs(encodingOrCallback, maybeCallback);
			// Buffer/Uint8Array both expose toString(encoding); avoid the
			// extra Buffer.from() copy when chunk is already a Buffer.
			const text = typeof chunk === "string" ?
				chunk :
				(Buffer.isBuffer(chunk) ? chunk.toString(encoding) : Buffer.from(chunk).toString(encoding));
			this.#absorbInterceptedText(text, which);
			// Node's write() invokes the callback once the chunk has drained.
			// Our sink is synchronous, but the callback contract still needs
			// an async tick so callers don't see it fire mid-write.
			if (callback) {
				process.nextTick(callback);
			}
			// Return `true` to signal no backpressure — the intercepted bytes
			// have been fully consumed by logAbove().
			return true;
		};
	}

	// Buffer intercepted bytes per stream, emitting completed lines via
	// logAbove() in a single batched call. Partial (non-newline-terminated)
	// tail bytes stay buffered until either the next chunk completes the
	// line or stop() flushes them.
	#absorbInterceptedText(text, which) {
		const entry = this.#streams[which];
		const combined = entry.partial + text;
		const lastNewline = combined.lastIndexOf("\n");
		if (lastNewline === -1) {
			entry.partial = combined;
			return;
		}
		entry.partial = combined.slice(lastNewline + 1);
		// Persist the whole run of completed lines in one frame rather than
		// one persist+render per line — a rapid burst of output would
		// otherwise trigger N re-renders.
		this.logAbove(combined.slice(0, lastNewline));
	}

	#flushPartialBuffers() {
		for (const which of ["stdout", "stderr"]) {
			const entry = this.#streams[which];
			if (entry.partial) {
				const line = entry.partial;
				entry.partial = "";
				this.logAbove(line);
			}
		}
	}

	// ---- Test helpers ---------------------------------------------------------

	/* istanbul ignore next */
	_getStateForTest() {
		return this.#state;
	}
}

export default Banner;
