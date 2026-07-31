import http from "node:http";
import path from "node:path";
import process from "node:process";
import {EventEmitter} from "node:events";
import {getLogger} from "@ui5/logger";
import ProjectDefinitionWatcher, {
	DEFINITION_CHANGED_SETTLE_MS,
	waitForProjectGraphSettled,
	RecoveryBudget,
} from "@ui5/project/internal/graph/ProjectDefinitionWatcher";
import buildApp from "./stack.js";
import attachLiveReloadServer from "../liveReload/server.js";
import {listen, addSsl, announceListening} from "./httpListener.js";

const log = getLogger("server:Supervisor");

// Upper bound on convergence-loop iterations within one recovery swap. Each iteration already paces
// itself on a graph-settle window, so this only guards against a pathological branch whose
// resolved project set keeps growing. RecoveryBudget bounds the number of recovery swaps themselves.
const RECOVERY_MAX_ITERATIONS = 10;

// Swap lifecycle states. The state decides reentrancy, terminal status, and which transitions are
// legal; it is mutated only through #setState against the table below.
// HEALTHY   - serving a stack whose graph matches disk; no swap running.
// RESOLVING - a swap is running, entered from HEALTHY (single-resolve strategy).
// DEGRADED  - last-good stack still serving after a failed re-resolve; graph no longer matches disk;
//             no swap running (a recovery timer may be pending, or the budget exhausted).
// RECOVERING - a swap is running, entered from DEGRADED (convergence strategy).
// DESTROYED - terminal.
//
// Two concerns are kept separate from this state: #reinitQueued (trailing-pass collapse) and the
// BuildServer's reader suspend (a request I/O gate that definitionChanging engages while HEALTHY or
// DEGRADED). The state describes swap control flow, not the reader gate.
const STATE = {
	HEALTHY: "HEALTHY",
	RESOLVING: "RESOLVING",
	DEGRADED: "DEGRADED",
	RECOVERING: "RECOVERING",
	DESTROYED: "DESTROYED",
};

// Allowed target states per source state. A transition absent here is a programming error. DESTROYED
// is terminal, so any transition out of it (including a re-entry into DESTROYED) is a no-op.
const ALLOWED_TRANSITIONS = {
	[STATE.HEALTHY]: new Set([STATE.RESOLVING, STATE.DESTROYED]),
	[STATE.RESOLVING]: new Set([STATE.HEALTHY, STATE.DEGRADED, STATE.DESTROYED]),
	[STATE.DEGRADED]: new Set([STATE.RECOVERING, STATE.DESTROYED]),
	[STATE.RECOVERING]: new Set([STATE.HEALTHY, STATE.DEGRADED, STATE.DESTROYED]),
	[STATE.DESTROYED]: new Set(),
};

/**
 * Owns the stable HTTP front door for a served project and re-creates the serving stack
 * (graph + Express app + BuildServer) when the project definition changes.
 *
 * The port is bound once. Every request is routed through a stable dispatcher to the
 * <em>current</em> Express app; a re-initialization swaps that app behind the dispatcher,
 * so the socket, the bound port, and connected live-reload clients survive the swap.
 *
 * Re-initialization is <strong>build-new-then-swap</strong>: the new graph is resolved and
 * the new app built before the old one is torn down. If the new definition fails to resolve
 * (e.g. an invalid <code>ui5.yaml</code>), the previous working app keeps serving.
 *
 * @private
 */
class Supervisor extends EventEmitter {
	#config;
	#graphFactory;
	#error;

	// Error payload of the last failed re-resolve, kept while the last-good stack keeps serving a
	// graph that no longer matches the definition on disk. Read live by every stack's serveBuildError
	// gate via #getDegradedError, so a stack built before the failed swap still diverts HTML
	// navigations to the error page. Cleared once a re-resolve swaps in a healthy stack.
	//
	// A payload, not the control-flow authority: #state (DEGRADED/RECOVERING) governs the lifecycle,
	// but #swap and the error gate key off this field because the superseded path returns without
	// transitioning, which would leave a state-based read undefined.
	#degradedError = null;

	#httpServer = null;
	#port = null;

	// The current serving stack: {app, buildServer, liveReloadOptions}. Reassigned on swap; the
	// dispatcher reads #stack.app on every request so a swap retargets transparently.
	#stack = null;
	#currentGraph = null;

	// Stable emitter live-reload subscribes to once; its upstream is retargeted on swap so connected
	// browsers stay connected across a re-init.
	#sourcesChangedRelay = new EventEmitter();
	#relayUnsubscribe = null;
	#liveReloadHandle = null;

	// Watches the project-definition files and drives reinitialize() on a change. Owned by the
	// supervisor (not the BuildServer) so it outlives each swapped-out stack, and re-targeted to
	// the new graph after every swap.
	#definitionWatcher = null;

	// Swap lifecycle state (see STATE / ALLOWED_TRANSITIONS). Starts HEALTHY once #init completes the
	// first build; #init failures throw to the caller before the instance is handed out.
	#state = STATE.HEALTHY;
	// Reentrancy guard for the reinitialize() trailing-pass loop. Kept explicit (not derived from
	// #state) so reentrancy safety does not depend on the failed-swap tail staying synchronous. It
	// spans the whole loop in a try/finally, so a later await added to that tail cannot open a
	// double-swap window that a state-derived guard would expose between entering DEGRADED and the
	// do-while re-check.
	#reinitInProgress = false;
	#reinitQueued = false;
	// Loop protection for self-scheduled recovery swaps. Records an attempt when a recovery is
	// scheduled (not when one succeeds), so a persistently broken branch that never resolves still
	// exhausts the budget and stops auto-retrying instead of cycling forever. Reset on each
	// definitionChanging so a fresh user action starts with a full allowance, and on each successful
	// swap so a later failure starts its own allowance.
	#recoveryBudget = new RecoveryBudget();
	// Delayed retry timer for a self-scheduled recovery after a failed swap. Cleared by any explicit
	// reinitialize() so a real definitionChanged event supersedes the timer.
	#recoveryTimer = null;
	#destroyAbortController = new AbortController();

	// Stable reference handed to every stack buildApp() builds. Closes over the supervisor instance
	// (not a per-stack value), so the surviving stack's serveBuildError reads the current
	// #degradedError on each request even though it was assembled before the failed swap.
	#getDegradedError = () => this.#degradedError;

	// Error the current BuildServer rejects held/incoming reader requests with while a definition
	// change is being re-resolved (see the definitionChanging handler). The HTTP-facing wording lives
	// here in the server layer; the BuildServer just forwards it to serveResources -> errorHandler. A
	// fresh instance per call so a captured stack trace points at the trigger.
	#buildSuspendedError() {
		const err = new Error(
			"Project definition changed - re-resolving the project graph. " +
			"This page should reload automatically once the server is ready.");
		err.code = "UI5_DEFINITION_CHANGING";
		return err;
	}

	// Moves the swap lifecycle to `next`, gated by ALLOWED_TRANSITIONS. DESTROYED is terminal, so a
	// transition out of it (including re-entry) is a silent no-op. Every other illegal edge throws: it
	// means the swap control flow reached an unexpected point.
	#setState(next) {
		if (this.#state === next) {
			return;
		}
		if (this.#state === STATE.DESTROYED) {
			return;
		}
		if (!ALLOWED_TRANSITIONS[this.#state].has(next)) {
			throw new Error(`Illegal Supervisor state transition: ${this.#state} -> ${next}`);
		}
		this.#state = next;
	}

	// Single site that lifts a reader suspend engaged by definitionChanging. Called at exactly the two
	// swap outcomes that leave a live server running: a failed swap (the surviving old stack) and a
	// successful swap (the outgoing old stack, before it is destroyed). The superseded and destroyed
	// outcomes do not resume: a superseded pass keeps readers suspended through the collapse until the
	// trailing pass settles, and a server being torn down must not admit requests. Keeping this the
	// only resume call preserves the "resumeReaders calledOnce, before destroy" contract the
	// surviving/outgoing stack relies on.
	#liftSuspend(buildServer) {
		buildServer.resumeReaders();
	}

	constructor(config, error, graphFactory) {
		super();
		this.#config = config;
		this.#error = error;
		this.#graphFactory = graphFactory;
	}

	/**
	 * Creates the supervisor, builds the initial serving stack, binds the port, and attaches
	 * the live-reload WebSocket server.
	 *
	 * @param {@ui5/project/graph/ProjectGraph} graph Initial (already resolved) project graph
	 * @param {object} config Resolved server configuration
	 * @param {Function} [error] Error callback for out-of-band BuildServer errors
	 * @param {Function} [graphFactory] Async factory returning a fresh ProjectGraph;
	 *   required for {@link Supervisor#reinitialize} to do anything
	 * @returns {Promise<Supervisor>} The listening supervisor
	 */
	static async create(graph, config, error, graphFactory) {
		const supervisor = new Supervisor(config, error, graphFactory);
		await supervisor.#init(graph);
		return supervisor;
	}

	async #init(graph) {
		const {
			port: requestedPort, changePortIfInUse = false, h2 = false, key, cert,
			acceptRemoteConnections = false, liveReload = false,
		} = this.#config;

		if (h2) {
			const nodeVersion = parseInt(process.versions.node.split(".")[0], 10);
			if (nodeVersion >= 24) {
				log.error("ERROR: With Node v24, usage of HTTP/2 is no longer supported. " +
					"Please check https://github.com/UI5/cli/issues/327 for updates.");
				process.exit(1);
			}
		}

		// Build the initial stack before binding so a construction failure surfaces to the caller.
		this.#stack = await buildApp(graph, this.#config, this.#error, this.#getDegradedError);
		this.#currentGraph = graph;

		// Stable request handler. Reads #stack.app on every request so a swap retargets
		// transparently without touching the bound socket.
		const dispatcher = (req, res) => this.#stack.app(req, res);

		let port; let server;
		try {
			const listenTarget = h2 ?
				await addSsl({app: dispatcher, key, cert}) :
				http.createServer(dispatcher);
			({port, server} = await listen(listenTarget, requestedPort, changePortIfInUse, acceptRemoteConnections));
		} catch (err) {
			// Release the BuildServer (source watcher + cache handle) before rethrowing so a
			// failed bind does not leak a running build server.
			await this.#stack.buildServer.destroy();
			throw err;
		}
		this.#httpServer = server;
		this.#port = port;

		if (liveReload) {
			// Attach once to the stable http server, subscribed to the relay rather than the
			// BuildServer directly, so connected clients persist across swaps.
			this.#liveReloadHandle = attachLiveReloadServer({
				httpServer: server,
				buildServer: this.#sourcesChangedRelay,
				token: this.#config.webSocketToken,
			});
		}
		this.#relayFrom(this.#stack.buildServer);

		// Arm the definition watcher over the initial graph, after the port is bound and the first
		// stack is live. Only meaningful with a graphFactory (no factory means reinitialize is a no-op).
		await this.#startDefinitionWatcher(graph);

		announceListening({port, h2, acceptRemoteConnections});
	}

	// Creates a definition watcher over the given graph and wires it to reinitialize(). A no-op
	// without a graphFactory, since reinitialize() cannot re-resolve the graph without one.
	async #startDefinitionWatcher(graph) {
		if (!this.#graphFactory) {
			return;
		}
		const {rootConfigPath, workspaceConfigPath, dependencyDefinitionPath, cwd} = this.#config;
		const watcher = await ProjectDefinitionWatcher.create({
			graph, rootConfigPath, workspaceConfigPath, dependencyDefinitionPath, cwd,
		});
		watcher.on("definitionChanged", () => this.reinitialize());
		// Leading edge of a definition-file burst: a re-resolve (and a likely version change) is
		// coming. Blank the interactive console's version slot so the Project region shows a
		// "resolving" placeholder until the swap's own resolve repopulates it via
		// `ui5.project-resolve-succeeded` (or a failed swap releases it; see #swap). Attached on the
		// watcher created here, so it is re-established when the watcher is re-targeted after each swap.
		//
		// Also suspend the current BuildServer's reader serving now, on the leading edge. The
		// re-resolve and its degraded gate only kick in after the watcher's trailing settle window
		// (plus the graph resolve); until then, requests would park in the BuildServer awaiting a
		// build that the checkout's concurrent source burst keeps aborting, hanging for seconds.
		// Suspending rejects those requests fast instead. Reads #stack.buildServer live, so it always
		// targets the current stack; the suspend is lifted via #liftSuspend on both #swap outcomes.
		watcher.on("definitionChanging", () => {
			// A real definition change supersedes any pending self-scheduled recovery and restores a
			// full recovery budget: the user just acted, so the next attempt should not be denied by an
			// allowance spent on the previous branch.
			this.#clearRecoveryTimer();
			this.#recoveryBudget = new RecoveryBudget();
			process.emit("ui5.project-resolve-started");
			this.#stack.buildServer.suspendReaders(this.#buildSuspendedError());
		});
		watcher.on("error", (err) => log.warn(`Definition watcher error: ${err?.message ?? err}`));
		this.#definitionWatcher = watcher;
	}

	// Forwards the current BuildServer's sourcesChanged onto the stable relay. Detaches any
	// previous subscription first so a swapped-out BuildServer stops driving live-reload.
	#relayFrom(buildServer) {
		this.#detachRelay();
		const onSourcesChanged = () => this.#sourcesChangedRelay.emit("sourcesChanged");
		buildServer.on("sourcesChanged", onSourcesChanged);
		this.#relayUnsubscribe = () => buildServer.off("sourcesChanged", onSourcesChanged);
	}

	#detachRelay() {
		if (this.#relayUnsubscribe) {
			this.#relayUnsubscribe();
			this.#relayUnsubscribe = null;
		}
	}

	/**
	 * Re-resolves the graph and re-creates the serving stack behind the stable HTTP server.
	 *
	 * Build-new-then-swap: on a resolution/build failure the previous stack keeps serving and
	 * the error is logged (never emitted as a fatal <code>"error"</code>). Overlapping calls
	 * collapse into a single trailing pass.
	 *
	 * @returns {Promise<void>} Resolves once the swap (or the no-op) completes
	 */
	async reinitialize() {
		if (this.#state === STATE.DESTROYED) {
			return;
		}
		this.#clearRecoveryTimer();
		if (!this.#graphFactory) {
			log.warn("Cannot re-initialize server: no graph factory was provided");
			return;
		}
		if (this.#reinitInProgress) {
			// Collapse overlapping requests into one trailing pass against the settled definition.
			// The version slot stays on the "resolving" placeholder (armed by definitionChanging)
			// until the trailing pass resolves and repaints it via `ui5.project-resolve-succeeded`.
			this.#reinitQueued = true;
			return;
		}
		this.#reinitInProgress = true;
		try {
			do {
				this.#reinitQueued = false;
				await this.#swap();
			} while (this.#reinitQueued && this.#state !== STATE.DESTROYED);
		} finally {
			this.#reinitInProgress = false;
		}
	}

	#clearRecoveryTimer() {
		if (this.#recoveryTimer) {
			clearTimeout(this.#recoveryTimer);
			this.#recoveryTimer = null;
		}
	}

	// Schedules one delayed recovery swap after a failed re-resolve left the stack degraded. Called
	// unconditionally from the #swap catch: a transient checkout race and a deterministic bad branch
	// look identical here (the resolve either threw or produced a graph pointing at sources still
	// landing), so recovery is attempted for both and bounded by RecoveryBudget. The attempt is
	// recorded now, not on success, so a branch that never resolves still exhausts the budget and
	// stops retrying (staying degraded until the next definitionChanging opens a fresh allowance).
	#scheduleDegradedRecovery() {
		if (this.#state === STATE.DESTROYED || !this.#recoveryBudget.withinBudget()) {
			return;
		}
		this.#recoveryBudget.recordRecovery();
		this.#recoveryTimer = setTimeout(() => {
			this.#recoveryTimer = null;
			this.reinitialize();
		}, DEFINITION_CHANGED_SETTLE_MS);
	}

	// Collects the resolved graph's project root paths as an absolute-path set, for the convergence
	// check in #convergeRecoveryGraph.
	async #graphRootPaths(graph) {
		const roots = new Set();
		await graph.traverseBreadthFirst(({project}) => {
			roots.add(path.resolve(project.getRootPath()));
		});
		return roots;
	}

	// Resolves a recovery graph, then settles and re-resolves until two consecutive resolves agree on
	// the project-root set. A single resolve can point at a half-restored project: a `git checkout` to
	// a branch with a different dependency set writes package.json, ui5.yaml, and the source tree in
	// one operation, and a large tree (or a slow FS, or an LFS smudge) arrives in more than one settle
	// window's worth of watcher batches. A single settle-then-retry would resolve against a tree quiet
	// only between waves, still missing sources or a symlink target a restored package.json points at.
	// Looping until the root set stabilizes waits out every wave. Each iteration feeds the settler the
	// just-resolved graph plus the last-good graph, so a root that only appears in the target branch
	// is watched once it surfaces and the next settle waits for its sources. Convergence is a subset
	// check, not equality: a dependency the target branch removes shrinks the root set and still
	// converges.
	//
	// Returns the converged graph, or null when superseded by a newer definitionChanged (#reinitQueued)
	// or aborted by destroy(), in which case #swap adopts nothing. Each iteration's #graphFactory()
	// call emits `ui5.project-resolve-succeeded`, so the interactive console's version slot repaints
	// once per iteration.
	async #convergeRecoveryGraph() {
		let prevRoots = null;
		let resolved;
		for (let i = 0; i < RECOVERY_MAX_ITERATIONS; i++) {
			if (this.#state === STATE.DESTROYED || this.#reinitQueued) {
				return null;
			}
			this.#destroyAbortController.signal.throwIfAborted();
			resolved = await this.#graphFactory();
			if (this.#state === STATE.DESTROYED) {
				return null;
			}
			const roots = await this.#graphRootPaths(resolved);
			if (prevRoots && roots.isSubsetOf(prevRoots)) {
				return resolved;
			}
			prevRoots = roots;
			try {
				await waitForProjectGraphSettled([resolved, this.#currentGraph], {
					settleMs: DEFINITION_CHANGED_SETTLE_MS,
					signal: this.#destroyAbortController.signal,
				});
			} catch (err) {
				if (err?.code === "ABORT_ERR") {
					return null;
				}
				throw err;
			}
		}
		return resolved;
	}

	async #swap() {
		const oldStack = this.#stack;
		// Strategy is keyed off the #degradedError payload, not #state: the superseded path below
		// returns without transitioning, so a state read there would be undefined. A degraded surviving
		// stack converges on a stable root set before building (the next resolve might still observe a
		// checkout in flight); a healthy swap (definition edit on a working project) resolves once.
		const recovering = this.#degradedError !== null;
		this.#setState(recovering ? STATE.RECOVERING : STATE.RESOLVING);
		let newStack;
		let newGraph;
		try {
			newGraph = recovering ? await this.#convergeRecoveryGraph() : await this.#graphFactory();
			if (this.#state === STATE.DESTROYED || !newGraph) {
				// Destroyed, aborted, or superseded by a newer definitionChanged: adopt nothing and stay
				// in the in-progress state (no #setState) so the trailing pass owns the next transition.
				return;
			}
			newStack = await buildApp(newGraph, this.#config, this.#error, this.#getDegradedError);
		} catch (err) {
			if (this.#state === STATE.DESTROYED) {
				return;
			}
			// Keep the last-good stack serving. A subsequent valid edit will swap cleanly.
			this.#setState(STATE.DEGRADED);
			log.error(`Failed to re-initialize server: ${err?.message ?? err}`);
			if (err?.stack) {
				log.verbose(err.stack);
			}
			// Flag the surviving stack degraded: its graph no longer matches the definition on disk.
			// Every stack's serveBuildError gate reads this via #getDegradedError, so HTML navigations
			// now divert to the error page instead of serving a stale 200 or an opaque 500.
			this.#degradedError = err;
			// The leading-edge definitionChanging suspended the old (still-serving) BuildServer's
			// readers. Now that #degradedError is set, serveBuildError diverts every incoming request
			// at the middleware, before it reaches the BuildServer, so the reader-level suspend is no
			// longer needed. Lift it so the flag is not left engaged on a server that keeps serving:
			// if the user then checks out a valid branch, its readers work normally again.
			this.#liftSuspend(oldStack.buildServer);
			// A failed resolve never emits `ui5.project-resolve-succeeded`, so the version slot would keep
			// the "resolving" placeholder indefinitely. Release it back to the last-known version
			// the old (still-serving) stack resolved. Harmless if the failure was in buildApp,
			// where the resolve already repainted the slot. The message drives the interactive
			// console's degraded status line.
			process.emit("ui5.project-resolve-failed", {message: err?.message ?? String(err)});
			// Schedule one bounded recovery attempt. A transient checkout race recovers on the retry;
			// a persistently broken branch exhausts the budget and stays degraded until the next change.
			this.#scheduleDegradedRecovery();
			return;
		}
		if (this.#state === STATE.DESTROYED) {
			// Destroyed while building: discard the new stack instead of adopting it.
			await newStack.buildServer.destroy();
			return;
		}
		// Swap: retarget the dispatcher, move live-reload to the new BuildServer, notify clients.
		this.#setState(STATE.HEALTHY);
		this.#stack = newStack;
		this.#currentGraph = newGraph;
		// The new stack resolved cleanly: clear the degraded payload a prior failed swap left behind so
		// the serveBuildError gate stops diverting once the graph matches disk again. Restore a full
		// recovery budget too: a clean swap means the branch is no longer broken, so a later failure
		// should start its own recovery allowance rather than inherit this episode's spent attempts.
		this.#degradedError = null;
		this.#recoveryBudget = new RecoveryBudget();
		this.#relayFrom(newStack.buildServer);
		this.#sourcesChangedRelay.emit("sourcesChanged");
		// Re-target the definition watcher to the new graph: the project set or their roots may
		// have changed. A create failure here must not crash the swap: keep serving and log, so the
		// old watcher keeps driving re-inits.
		const oldWatcher = this.#definitionWatcher;
		this.#definitionWatcher = null;
		try {
			await this.#startDefinitionWatcher(newGraph);
			await oldWatcher?.destroy();
		} catch (err) {
			log.warn(`Failed to re-target definition watcher: ${err?.message ?? err}`);
			// Keep the old watcher driving re-inits if the new one failed to arm.
			this.#definitionWatcher ??= oldWatcher;
		}
		// Tear down the old stack. Its BuildServer releases the source watcher and the cache
		// handle; the new BuildServer already reopened the same (refcounted) cache. Lift its reader
		// suspend first so a suspend from definitionChanging is not left engaged (defensive: destroy
		// follows immediately, but keeps the invariant that no path leaves a live server suspended).
		this.#liftSuspend(oldStack.buildServer);
		await oldStack.buildServer.destroy();
	}

	getPort() {
		return this.#port;
	}

	/**
	 * Stops the server: closes live-reload, the HTTP socket, and the current BuildServer. Teardown
	 * is tolerant: the socket is closed even if the BuildServer's destroy rejects.
	 *
	 * @param {Function} [callback] Invoked once the HTTP server has closed
	 * @returns {Promise<void>} Resolves once teardown completes
	 */
	async destroy(callback) {
		// Move to the terminal state synchronously, before the first await, so an in-flight #swap or a
		// late definitionChanged sees DESTROYED at its next guard and adopts nothing.
		this.#setState(STATE.DESTROYED);
		this.#destroyAbortController.abort();
		// Stop the definition watcher early so a late event cannot start a re-init mid-teardown.
		// The reinitialize() DESTROYED guard already no-ops such an event; this is defensive.
		const definitionWatcher = this.#definitionWatcher;
		this.#definitionWatcher = null;
		this.#liveReloadHandle?.close();
		this.#detachRelay();
		this.#httpServer?.close(callback);
		this.#clearRecoveryTimer();
		try {
			await definitionWatcher?.destroy();
		} catch (err) {
			log.verbose(`Error while destroying definition watcher: ${err?.message ?? err}`);
		}
		try {
			await this.#stack?.buildServer.destroy();
		} catch (err) {
			log.verbose(`Error while destroying BuildServer: ${err?.message ?? err}`);
		}
	}
}

export default Supervisor;
