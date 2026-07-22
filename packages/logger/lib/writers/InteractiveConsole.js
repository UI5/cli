import process from "node:process";
import {createLogUpdate} from "log-update";
import sliceAnsi from "slice-ansi";
import Logger from "../loggers/Logger.js";
import {formatLogLine, prefixModuleName} from "./internal/format.js";
import {createHeaderState, setTool} from "./interactiveConsole/state/header.js";
import {createProjectState, setProject, enableProjectPlaceholders} from "./interactiveConsole/state/project.js";
import {createServerState, setListening, enableServerPlaceholders} from "./interactiveConsole/state/server.js";
import {
	createBuildState, beginBuild, advanceToProject, setTask, transitionTo, setError, STATES,
	SPINNING_STATES, enableBuildPlaceholders,
} from "./interactiveConsole/state/build.js";
import {
	renderHeaderRegion, renderProjectRegion, renderServerRegion, renderBuildRegion,
} from "./interactiveConsole/render.js";

// Spinner tick interval while in `building` or `validating` state.
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
 * Interactive console writer for `ui5 serve` — a live, region-based status
 * display rendered in a persistent bottom region. Owns process.stderr while
 * active. Sibling of {@link module:@ui5/logger/writers/Console|writers/Console};
 * exactly one console-writing writer may be active at a time.
 * <br><br>
 * The writer is universal: it renders whichever regions have received data.
 * No command knowledge. Regions render top-to-bottom in a fixed order —
 * header, root project, server, build status — and hidden regions collapse.
 * <br><br>
 * All state is event-driven. See the design at
 * <code>docs/interactive-console-writer.md</code> and the public event API
 * exposed by <code>@ui5/logger</code>.
 *
 * @public
 * @class
 * @alias @ui5/logger/writers/InteractiveConsole
 */
class InteractiveConsole {
	#stderr;
	#stopped = false;

	#headerState;
	#projectState;
	#serverState;
	#buildState;

	#tickTimer = null;
	#columns;
	// `log-update` instance bound to `#stderr`. Owns the live region: every
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

	#seenProjectResolved = false;

	// Bound listeners so we can `process.off` them on stop().
	#onLog;
	#onBuildMetadata;
	#onBuildStatus;
	#onProjectBuildStatus;
	#onServeStatus;
	#onToolInfo;
	#onToolMode;
	#onProjectResolved;
	#onServerListening;
	#onStopConsole;
	#onResize;

	constructor({stderr = process.stderr} = {}) {
		this.#stderr = stderr;
		this.#headerState = createHeaderState();
		this.#projectState = createProjectState();
		this.#serverState = createServerState();
		this.#buildState = createBuildState();
		this.#columns = stderr.columns;
	}

	/**
	 * Attaches all event listeners and starts writing to the output stream.
	 * Emits `ui5.log.stop-console` first so any currently-active console-
	 * writing writer detaches before this one takes over.
	 *
	 * @public
	 */
	enable() {
		process.emit("ui5.log.stop-console");
		this.#stopped = false;
		this.#attachListeners();
		if (!this.#logUpdate) {
			this.#logUpdate = createLogUpdate(this.#stderr);
		}
		const wantsIntercept = this.#stderr === process.stderr;
		if (wantsIntercept) {
			this.#installWriteInterceptors();
		}
	}

	/**
	 * Detaches all event listeners and stops writing to the output stream.
	 *
	 * @public
	 */
	disable() {
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
		this.#stderr.write("\n");
	}

	// Compose the full live region as a single string. One block per region,
	// separated by their own leading blank line. `log-update` handles wrapping
	// and erase of the previous frame, so we just hand it the full text.
	#composeLiveRegion() {
		const lines = [
			...renderHeaderRegion(this.#headerState),
			...renderProjectRegion(this.#projectState),
			...renderServerRegion(this.#serverState),
			...renderBuildRegion(this.#buildState),
		];
		if (lines.length === 0) {
			return "";
		}
		// `log-update` wraps long lines onto additional rows; the last line is
		// designed to fit on a single row when it's a status line, so clip it
		// to the terminal width. `this.#columns` is undefined when stderr isn't
		// a TTY — sliceAnsi treats that as "no limit" and returns unchanged.
		if (this.#buildState.state !== STATES.INITIAL) {
			lines[lines.length - 1] = sliceAnsi(lines[lines.length - 1], 0, this.#columns);
		}
		return lines.join("\n");
	}

	#render() {
		/* istanbul ignore if — defensive: #render is only called from event
		   handlers (detached on disable) and the tick timer (cleared on
		   disable), so this branch is unreachable in practice. */
		if (this.#stopped) {
			return;
		}
		this.#withRenderingGuard(() => {
			this.#logUpdate(this.#composeLiveRegion());
		});
	}

	/**
	 * Write a log line ABOVE the live region so it persists in scrollback.
	 *
	 * Delegates to `log-update`'s `persist()` (which erases the live region,
	 * writes the line in its place, and accounts for wrapped lines correctly)
	 * followed by a fresh render of the live region below it. Pass a string
	 * with embedded newlines to persist multiple lines in a single frame.
	 *
	 * @param {string} line The log line to write above the live region.
	 */
	logAbove(line) {
		if (this.#stopped) {
			this.#stderr.write(line + "\n");
			return;
		}
		this.#withRenderingGuard(() => {
			this.#logUpdate.persist(line);
			this.#logUpdate(this.#composeLiveRegion());
		});
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
		this.#onToolInfo = (evt) => this.#handleToolInfo(evt);
		this.#onToolMode = (evt) => this.#handleToolMode(evt);
		this.#onProjectResolved = (evt) => this.#handleProjectResolved(evt);
		this.#onServerListening = (evt) => this.#handleServerListening(evt);
		this.#onStopConsole = () => this.disable();
		this.#onResize = () => this.#handleResize();

		process.on("ui5.log", this.#onLog);
		process.on("ui5.build-metadata", this.#onBuildMetadata);
		process.on("ui5.build-status", this.#onBuildStatus);
		process.on("ui5.project-build-status", this.#onProjectBuildStatus);
		process.on("ui5.serve-status", this.#onServeStatus);
		process.on("ui5.tool-info", this.#onToolInfo);
		process.on("ui5.tool-mode", this.#onToolMode);
		process.on("ui5.project-resolved", this.#onProjectResolved);
		process.on("ui5.server-listening", this.#onServerListening);
		process.on("ui5.log.stop-console", this.#onStopConsole);
		if (typeof this.#stderr.on === "function") {
			this.#stderr.on("resize", this.#onResize);
		}
	}

	#detachListeners() {
		process.off("ui5.log", this.#onLog);
		process.off("ui5.build-metadata", this.#onBuildMetadata);
		process.off("ui5.build-status", this.#onBuildStatus);
		process.off("ui5.project-build-status", this.#onProjectBuildStatus);
		process.off("ui5.serve-status", this.#onServeStatus);
		process.off("ui5.tool-info", this.#onToolInfo);
		process.off("ui5.tool-mode", this.#onToolMode);
		process.off("ui5.project-resolved", this.#onProjectResolved);
		process.off("ui5.server-listening", this.#onServerListening);
		process.off("ui5.log.stop-console", this.#onStopConsole);
		if (typeof this.#stderr.off === "function") {
			this.#stderr.off("resize", this.#onResize);
		}
	}

	#handleLog({level, message, moduleName}) {
		if (!Logger.isLevelEnabled(level)) {
			return;
		}
		this.logAbove(formatLogLine(level, prefixModuleName(message, moduleName)));
	}

	#handleToolInfo(evt) {
		setTool(this.#headerState, evt);
		this.#render();
	}

	// Optional up-front hint from the CLI: "I'm about to run <mode>". The writer
	// pre-populates placeholders for the sections that <mode> is expected to
	// fill in, so the full frame is visible from the first paint and subsequent
	// events replace placeholders in place rather than growing the layout.
	// Currently only `mode: "serve"` is understood; unknown modes are ignored,
	// keeping the writer forgiving as new modes are added.
	#handleToolMode(evt) {
		if (evt?.mode === "serve") {
			enableProjectPlaceholders(this.#projectState);
			enableServerPlaceholders(this.#serverState, {
				acceptRemoteConnections: evt.acceptRemoteConnections,
			});
			enableBuildPlaceholders(this.#buildState);
			this.#render();
		}
	}

	#handleProjectResolved(evt) {
		if (this.#seenProjectResolved) {
			// See docs/interactive-console-writer.md § Ordering rules: the
			// writer's model is single-root-project. Two events means the
			// caller's invariant is violated and any subsequent event
			// attribution is ambiguous.
			throw new Error(
				`writers/InteractiveConsole: Received duplicate ui5.project-resolved event`);
		}
		this.#seenProjectResolved = true;
		setProject(this.#projectState, evt);
		this.#render();
	}

	#handleServerListening(evt) {
		setListening(this.#serverState, evt);
		this.#render();
	}

	#handleBuildMetadata({projectsToBuild}) {
		beginBuild(this.#buildState, projectsToBuild);
		this.#render();
	}

	#handleBuildStatus({projectName, status}) {
		if (status === "project-build-start" || status === "project-build-skip") {
			advanceToProject(this.#buildState, projectName);
			this.#render();
		}
	}

	#handleProjectBuildStatus({taskName, status}) {
		if (status === "task-start") {
			setTask(this.#buildState, taskName);
			this.#render();
		}
	}

	#handleServeStatus(evt) {
		// validatingProjects is a VALIDATING-only payload; clear it on any other
		// transition so a stale list doesn't linger in the banner state.
		if (evt.status !== "serve-validating") {
			this.#buildState.validatingProjects = [];
		}
		switch (evt.status) {
		case "serve-ready":
			this.#transitionTo(STATES.READY);
			break;
		case "serve-stale":
			this.#buildState.changedProjects = evt.changedProjects || [];
			this.#transitionTo(STATES.STALE);
			break;
		case "serve-settling":
			this.#buildState.pendingProjects = evt.pendingProjects || [];
			this.#transitionTo(STATES.SETTLING);
			break;
		case "serve-building":
			beginBuild(this.#buildState, this.#buildState.projectOrder);
			this.#transitionTo(STATES.BUILDING);
			break;
		case "serve-validating":
			this.#buildState.validatingProjects = evt.validatingProjects || [];
			this.#transitionTo(STATES.VALIDATING);
			break;
		case "serve-build-done":
			this.#buildState.lastBuildHrtime = Array.isArray(evt.hrtime) ? evt.hrtime : null;
			this.#transitionTo(STATES.READY);
			break;
		case "serve-error":
			setError(this.#buildState, evt.error?.message || String(evt.error));
			this.#clearTick();
			this.#render();
			// Don't echo the error via logAbove — BuildServer already logs
			// the same message at `error` level (which #handleLog scrolls
			// above the banner), and the yargs fail-handler renders the full
			// stack trace once the handler promise rejects. A third copy here
			// would just be noise.
			break;
		}
	}

	#handleResize() {
		this.#columns = this.#stderr.columns;
		this.#render();
	}

	#transitionTo(newState) {
		if (this.#buildState.state === newState) {
			this.#render();
			return;
		}
		transitionTo(this.#buildState, newState);
		this.#clearTick();
		this.#scheduleTick();
		this.#render();
	}

	#scheduleTick() {
		/* istanbul ignore if — defensive: #scheduleTick is only reached from
		   event handlers (detached on disable), so #stopped is always false
		   here in practice. */
		if (this.#stopped) {
			return;
		}
		if (!SPINNING_STATES.has(this.#buildState.state)) {
			return;
		}
		this.#tickTimer = setInterval(() => {
			this.#buildState.spinFrame++;
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
	// write straight to the process streams. Any such write between frames
	// throws off log-update's line-count accounting (it counts only the bytes
	// it emitted itself) and the next render corrupts — typically by
	// duplicating the header. To keep the live region intact we replace
	// process.stdout.write / process.stderr.write while the writer is active
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
			if (this.#renderingLiveRegion || this.#stopped) {
				return original.call(stream, chunk, encodingOrCallback, maybeCallback);
			}
			const {encoding, callback} = parseWriteArgs(encodingOrCallback, maybeCallback);
			const text = typeof chunk === "string" ?
				chunk :
				(Buffer.isBuffer(chunk) ? chunk.toString(encoding) : Buffer.from(chunk).toString(encoding));
			this.#absorbInterceptedText(text, which);
			if (callback) {
				process.nextTick(callback);
			}
			return true;
		};
	}

	#absorbInterceptedText(text, which) {
		const entry = this.#streams[which];
		const combined = entry.partial + text;
		const lastNewline = combined.lastIndexOf("\n");
		if (lastNewline === -1) {
			entry.partial = combined;
			return;
		}
		entry.partial = combined.slice(lastNewline + 1);
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

	/**
	 * Creates a new instance and subscribes it to all events. Any currently-
	 * active console-writing writer is displaced by the `ui5.log.stop-console`
	 * event that `enable()` emits.
	 *
	 * @public
	 */
	static init() {
		const w = new InteractiveConsole();
		w.enable();
		return w;
	}

	static stop() {
		process.emit("ui5.log.stop-console");
	}

	// ---- Test helpers ---------------------------------------------------------

	/* istanbul ignore next */
	_getStateForTest() {
		return {
			header: this.#headerState,
			project: this.#projectState,
			server: this.#serverState,
			build: this.#buildState,
		};
	}
}

// Split from the constructor so the `log-update` factory is imported lazily
// and can be swapped out by tests that pass a stubbed stderr. `createLogUpdate`
// is a synchronous factory; the async import is not warranted.
export default InteractiveConsole;
