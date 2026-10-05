# Incremental Build Architecture

## High-Level Overview

The incremental build system enables fast development feedback loops by:
1. Building projects **lazily** -- only when their output is requested
2. **Caching** task results keyed by content hashes of input resources
3. **Skipping** tasks whose inputs haven't changed since the last build
4. Running **differential** (delta) builds that only process changed resources
5. **Watching** source files and automatically rebuilding on changes

```
                     +----------------+
  Resource Request > | BuildServer    | --- file watcher ---> invalidate + abort
                     +-------+--------+
                             | enqueue project
                             v
                     +----------------+
                     | ProjectBuilder | --- for each project in dependency order
                     +-------+--------+
                             |
                +------------+------------+
                v            v            v
         +-----------+ +----------+ +-------------------+
         |BuildContext| |TaskRunner| |ProjectBuildCache  |
         +-----------+ +----------+ +-------------------+
```

## Component Map

Use this table to locate source files. ALWAYS read the relevant source file before making changes.

| Component | Location | Role |
|-----------|----------|------|
| `BuildServer` | `lib/build/BuildServer.js` | Development server, file watching, build orchestration. Also defines `ProjectBuildStatus` (per-project state machine, reader-request queue, error latching) and the outer `SERVER_STATES` reconciler |
| `BuildReader` | `lib/build/BuildReader.js` | Reader exposed by BuildServer; routes resource requests to per-project readers via namespace map |
| `ProjectBuilder` | `lib/build/ProjectBuilder.js` | Builds projects in dependency order |
| `BuildContext` | `lib/build/helpers/BuildContext.js` | Global build config, project context cache |
| `getBuildSignature` | `lib/build/helpers/getBuildSignature.js` | Build signature computation: `BUILD_SIG_VERSION` + build config, combined with aggregated task signatures, project id + config, the `@ui5/project` version, and `@ui5/builder`/`@ui5/fs` versions |
| `ProjectBuildContext` | `lib/build/helpers/ProjectBuildContext.js` | Per-project bridge between builder, tasks, and cache. Also hosts `resolveInputValue(type, name)`, the lookup-side counterpart to input recording: it re-derives a recorded non-resource input's current value from `process.env`, the project graph, and the build run's shared timestamp (`getBuildTime()`, see "Non-Resource Task Inputs") (passed into `ProjectBuildCache` so a cache lookup reflects the current environment and graph) |
| `MonitoredTaskUtil` | `lib/build/helpers/MonitoredTaskUtil.js` | Per-task wrapper around the `TaskUtil` (or its spec-version interface) handed to a task, analogous to `MonitoredReader`. A Proxy that preserves the wrapped shape and records the non-resource inputs the task reads (`getEnv`, `isRootProject`, `getDependencies`, and the tracked `getProject(name).get*` accessors); `getInputRecording()` drains the recording for the TaskRunner. It also wraps every `getProject(name).getReader()` result in a `MonitoredReader` and records the resources read through it, split into a project bucket and a dependencies bucket; `getResourceRequests()` drains both for the TaskRunner to merge into the workspace and dependency resource requests. Reads made outside a task (build orchestration holding the raw TaskUtil) are not monitored |
| `WatchHandler` | `lib/build/helpers/WatchHandler.js` | Source path watcher (subscribes via the `fileWatcher` facade, so it runs on the native or polling backend); emits `change` events to BuildServer. The watcher coalesces its own events with a 50 ms min / 500 ms max wait, so a continuous operation is delivered as batches up to 500 ms apart. Survives a `git checkout` moving source paths: drops events whose path no longer maps (`getVirtualPath` throws) and skips a path that vanished before `subscribe` resolved. The `ProjectDefinitionWatcher` then re-inits over the new graph |
| `ProjectDefinitionWatcher` | `lib/graph/ProjectDefinitionWatcher.js` | Watcher (via the `fileWatcher` facade) for project-definition files (`ui5.yaml` / `--config`, `package.json`, workspace config, static dependency-definition file). Emits `definitionChanging` (leading) and `definitionChanged` (trailing, coalesced) to drive a full serving-stack re-init. A watched definition-file event starts the burst; while the burst is open, every delivered event below the subscribed definition directories resets the settle timer. Project roots below `node_modules` are watched without the `node_modules` ignore so their own definition files remain observable. Owned by `@ui5/server`'s `Supervisor`, not the BuildServer; exported via the internal `@ui5/project/internal/graph/ProjectDefinitionWatcher` subpath, which also re-exports `waitForProjectGraphSettled` and `RecoveryBudget` so the whole live re-resolution feature is reachable through one internal entry point |
| `projectGraphSettleWatcher` | `lib/graph/projectGraphSettleWatcher.js` | Short-lived acceptance gate (via the `fileWatcher` facade) for degraded server recovery. Given one or more resolved graphs, watches the union of their project roots without a `node_modules` ignore and resolves once those roots have settled for `WATCHER_BURST_SETTLE_MS`. Missing roots are watched at their nearest existing ancestor so a project that is still being restored is observable. `Supervisor` drives it inside a convergence loop (`#convergeRecoveryGraph`), feeding it each re-resolved graph plus the last-good graph so a root that only the target branch introduces is observed once it surfaces in a resolve |
| `RecoveryBudget` | `lib/build/helpers/RecoveryBudget.js` | Sliding-window loop protection for watcher recovery (`WATCHER_RECOVERY_MAX_ATTEMPTS` = 5 within `WATCHER_RECOVERY_WINDOW_MS` = 60000). One instance per watcher, so a fault in one does not consume the other's budget |
| `watchSettle` | `lib/build/helpers/watchSettle.js` | Single source of `WATCHER_BURST_SETTLE_MS` = 550 ms, shared by every `@parcel/watcher` consumer (sized above the watcher's 500 ms coalescing cap) |
| `drainSubscriptions` | `lib/build/helpers/watchSubscriptions.js` | Unsubscribes a list of subscriptions in parallel (`Promise.allSettled`), returns the failures. Used by both watchers' `destroy()` and BuildServer's recovery re-subscribe |
| `fileWatcher` | `lib/build/helpers/fileWatcher.js` | Watcher-backend facade. Exposes a `subscribe()` matching `@parcel/watcher`'s contract and picks a backend once per process: `UI5_WATCH_MODE=polling\|native` forces the choice, otherwise it auto-detects containers (`/.dockerenv`, `/run/.containerenv`, PID 1 cgroup) and uses polling there. Also falls back to polling if the native `@parcel/watcher` binding cannot load. `UI5_WATCH_MODE=off` disables watching entirely: `subscribe()` returns an inert subscription (callback never invoked, `unsubscribe` a no-op) so no backend loads, for CI and other environments where sources do not change while the server runs. The memoized decision is a mode string exposed via `shouldUsePolling()` and `isWatchingDisabled()`. All three watchers subscribe through this facade rather than importing `@parcel/watcher` directly |
| `pollingWatcher` | `lib/build/helpers/pollingWatcher.js` | Pure-JS polling backend. Walks the tree and diffs an `{mtimeMs, size}` snapshot every 250 ms (`DEFAULT_POLL_INTERVAL_MS`), emitting the same `{type, path}` events as the native backend. Needed on bind-mounted container volumes where inotify misses writes made from outside the container |
| `TaskRunner` | `lib/build/TaskRunner.js` | Task composition, execution loop, abort handling. Hands every task a plain `MonitoredTaskUtil`; for a step-based task it calls the task's step factory (once at plan time to discover step names for `setTasks`, once to run), drives the `StepRunner` over the returned steps with per-stage hooks (`#createStepStageHooks`: `prepareStage`/`getPreviousInvocationData`/`createStageContext`/`recordStage`), and reports the task skipped/executed from the runner's `anyStepExecuted`. A legacy task runs a plain body with no step runner |
| `StepRunner` | `lib/build/helpers/StepRunner.js` | Per-task driver behind the step-factory build API, driving **one pipeline stage per step** (Phase B). Runs scalar and map steps in array order; per step it calls `prepareStage` (switch + cache verdict), runs/restores the step's units against a fresh per-stage recording context and per-step `MonitoredTaskUtil`, threads `needs` returns between steps, folds the stage's own keys' reads/inputs (`#foldStageKeys`, including cached keys) and derives the stage's stale outputs (`#computeStaleOutputs`), then calls `recordStage`. No cross-step fold. See "Step-Based Build Tasks" |
| `Cache` enum | `lib/build/cache/Cache.js` | Cache mode constants: `Default`, `Force`, `ReadOnly`, `Off` (CLI `--cache` option) |
| `ProjectBuildCache` | `lib/build/cache/ProjectBuildCache.js` | Cache orchestration per project: index management, stage lookup, result recording. The unit of caching is a **stage**: `#stageCaches` is keyed by stage id (a legacy task's `task/{taskName}`, or a step-based task's `task/{taskName}::step/{stepName}` per step); `prepareStageExecutionAndValidateCache(taskName, stepName?)` and `recordStageResult({taskName, …, stepName?})` operate per stage; `setTasks([{taskName, stepNames?}])` creates one stage per step |
| `BuildStageCache` | `lib/build/cache/BuildStageCache.js` | Per-stage resource request tracking and index management (one instance per stage, keyed in `ProjectBuildCache` by stage id). Also holds the stage's `TaskInputSet` (non-resource inputs) and exposes `getInputSignature(resolveValue)` |
| `StageCache` | `lib/build/cache/StageCache.js` | In-memory cache of stage results keyed by signature |
| `BuildCacheStorage` | `lib/build/cache/BuildCacheStorage.js` | Unified SQLite storage for content (CAS) and metadata |
| `CacheManager` | `lib/build/cache/CacheManager.js` | Persistent cache I/O, delegates to BuildCacheStorage; singleton per cache directory. No automatic eviction/GC; `cleanCache()` -> `dropAllRecords()` (a full wipe backing `ui5 cache clean`) is the only cleanup, with the on-disk `VACUUM` deferred to the next run via a pending marker |
| `ResourceRequestManager` | `lib/build/cache/ResourceRequestManager.js` | Request graph, resource index updates, signature computation |
| `ResourceRequestGraph` | `lib/build/cache/ResourceRequestGraph.js` | DAG of request sets with delta encoding and best-parent optimization |
| `ResourceIndex` | `lib/build/cache/index/ResourceIndex.js` | Wrapper around hash trees with delta detection |
| `HashTree` | `lib/build/cache/index/HashTree.js` | Directory-based Merkle tree for resource hashing |
| `TaskInputSet` | `lib/build/cache/index/TaskInputSet.js` | Flat set of a task's non-resource inputs (env vars, tracked TaskUtil reads), hashed into one signature folded into the task's project-component signature. A sibling of `HashTree` (shares the `version`/`toCacheObject`/`fromCache` conventions) but deliberately not a Merkle tree: inputs are few, unordered, and non-hierarchical. Persists only entry type/name; values are re-read on lookup. Exports `normalizeInputValue`, the shared record/lookup value normalizer |
| `SharedHashTree` | `lib/build/cache/index/SharedHashTree.js` | HashTree with structural sharing via TreeRegistry |
| `TreeRegistry` | `lib/build/cache/index/TreeRegistry.js` | Batch update coordinator for shared trees |
| `TreeNode` | `lib/build/cache/index/TreeNode.js` | Merkle tree node (resource or directory) |
| `ProjectResources` | `lib/resources/ProjectResources.js` | Stage management, readers/writers, tag collections |
| `Stage` | `lib/resources/Stage.js` | Per-build-stage container holding either a live writer (during execution) or a cached writer + cached tag operations (when restored from cache) -- never both |
| `MonitoredResourceTagCollection` | In `@ui5/fs` (separate repo) | Proxy tracking tag operations during task execution |
| `ResourceTagCollection` | In `@ui5/fs` (separate repo) | Base storage for resource tags |
| `Resource` | In `@ui5/fs` (separate repo) | `getTags()` delegates to project's tag collection |

## Key Flows

### Startup

`BuildServer.create()` awaits `WatchHandler` readiness before enqueueing initial builds. The ordering matters because the `ReadDirectoryChangesW` backend on Windows can drop changes that land between `graph.serve()` resolving and the watcher subscribing.

### Build Request Flow

```
reader.byPath("/test.js")
  -> BuildServer #getReaderForProject(projectName)
      -> If ProjectBuildStatus.isFresh(): return cached reader
      -> If getError() returns a captured error: throw it (ERRORED gate,
         see "Error gating" below)
      -> If #suspendError is set: throw it (reader-suspend gate,
         see "Reader suspend" below)
      -> Queue {resolve, reject} on the status via addReaderRequest()
      -> If isValidating(): wait on the running validation pass
      -> Otherwise #enqueueBuild(projectName)
  -> Debounced (`BUILD_REQUEST_DEBOUNCE_MS` = 10ms): #processBuildRequests()
      -> Any in-flight background validation is aborted first
         (#stopActiveValidation)
  -> Batch all pending projects; markBuilding() on each
  -> projectBuilder.build({projects, signal})
  -> On success: setReader(project.getReader({style: "runtime"})) — this
     also drains the queued reader requests
  -> On non-abort failure: rejectReaderRequests(err) latches ERRORED
  -> On abort or concurrent source change: re-queue affected projects,
     leave reader queue intact so they resolve on the retry
```

### File Watch and Abort

When a source file changes:
1. `WatchHandler` emits change event with project name, resource path, and event type
2. `_projectResourceChanged()` walks `traverseDependents()` and calls `ProjectBuildStatus.invalidate({reason, fileAddedOrRemoved})` on the affected project and every dependent. Change is queued in `#resourceChangeQueue`
3. `invalidate()` clears any latched error (lifting the ERRORED gate), aborts the running build via `AbortSignal`, and rotates the `AbortController`
4. `fileAddedOrRemoved=true` (create/delete events) additionally evicts the cached reader on the status. Pure modifies keep the reader so callers already holding its promise still resolve
5. The build loop catches `AbortBuildError` and re-enqueues projects that aren't fresh. Two branches defer their restart instead of firing on the request debounce: the source-change-aborted build, and a build that *failed* while sources were still changing (the transient branch, `signal.aborted || #resourceChangeQueue.size > 0`). The restart waits `ABORTED_BUILD_RESTART_SETTLE_MS` (= `WATCHER_BURST_SETTLE_MS` = 550 ms) of quiet, reset by each further change, so a multi-batch burst collapses into one rebuild against the settled tree. The deferral arms the queue timer and sets `#pendingDeferredRestart`. Both branches report `SETTLING` for the window. A genuine, non-transient failure still latches ERRORED.

   While `#pendingDeferredRestart` holds, a reader request does *not* supersede the window: `#enqueueBuild` queues the project and returns without re-arming, and the request resolves when the deferred rebuild runs. Pulling the restart forward would build into a still-arriving burst; resetting it per request would let live-reload traffic defer the rebuild indefinitely. Only source changes reset the window.
6. The first speculative build after a source change from a quiet state is held for a short first-build window (`FIRST_BUILD_SETTLE_MS` = 100 ms, also reported as `SETTLING`) rather than the snappy debounce — this absorbs an editor's own multi-file save fan-out (100 ms sits far below the watcher's 500 ms coalescing cap, roughly at its 50 ms floor) so a save-all doesn't fire a build into a half-written tree. It applies only to a build that is already pending (a reader request queued but not yet started); laziness is preserved — with nothing queued, a change still waits for a reader request. On its own it does not cover a multi-second `git checkout`; full coverage of that comes from the transient-failure deferral above.
7. Queued resource changes are flushed via `#flushResourceChanges()` before the next build starts (must happen before `projectBuilder.build`)

The server also emits a `sourcesChanged` event to drive live-reload notifications. Emission is **leading-edge**: the first change of a quiet period notifies immediately (a lone edit reaches clients at the watcher's own ~50 ms latency floor with no debounce added), and a trailing settle window (`SOURCES_CHANGED_SETTLE_MS` = `WATCHER_BURST_SETTLE_MS` = 550 ms, above the watcher's 500 ms cap) coalesces the remainder of a burst into one further emit. Because emission is leading-edge, the window size does not affect single-edit latency: it only controls burst coalescing.

The three source-watcher settle windows (`SOURCES_CHANGED_SETTLE_MS`, `ABORTED_BUILD_RESTART_SETTLE_MS`, and the ProjectDefinitionWatcher's `DEFINITION_CHANGED_SETTLE_MS`) all resolve to `WATCHER_BURST_SETTLE_MS` in `watchSettle.js`, sized above `@parcel/watcher`'s 500 ms `MAX_WAIT_TIME` so each batch resets the window rather than terminating it. `FIRST_BUILD_SETTLE_MS` (100 ms) is deliberately separate: it absorbs an editor's save fan-out, not a multi-batch operation.

### State Machine (per project)

`ProjectBuildStatus` (defined at the bottom of `BuildServer.js`) has six states:

```
                     +------------------------------------------+
                     |                                          |
                     v                                          |
  INITIAL --(reader request)--> INVALIDATED --(markBuilding)--> BUILDING
     |                              ^                              |
     |                              |                              | setReader()
     |  (background validation)     |                              v
     |     markValidating()         |                            FRESH
     v                              |                              |
  VALIDATING ---(cache stale,       |                              |
     |          releaseValidating)  |     (file change +           |
     |          -----> INITIAL      |      invalidate())           |
     |                              +------------------------------+
     |  (cache fresh, setReader)                                   |
     +--> FRESH                                                    |
                                                                   |
                                        (build fails, non-transient)
                                                                   v
                                                                ERRORED
                                                                   |
                                                            (any invalidation
                                                             clears #lastError)
                                                                   v
                                                              INVALIDATED
```

- **INITIAL** — never built; eligible for background cache validation.
- **INVALIDATED** — needs a build. Set by `invalidate()` (source change, dependency change) and by the first reader request from INITIAL.
- **VALIDATING** — a background pass is checking cache validity for this project. Reader requests skip `#enqueueBuild` and wait on the pass. Only reachable from INITIAL via `markValidating()`.
- **BUILDING** — a real build cycle owns the project. Reached unconditionally from any prior state via `markBuilding()` (the caller has already claimed it from `#pendingBuildRequest`).
- **FRESH** — reader available. Set by `setReader()`, which only accepts BUILDING or VALIDATING as prior states — a late-arriving reader for a project re-invalidated mid-build is dropped.
- **ERRORED** — last build failed with a non-transient error. Held until an invalidation lifts the gate. See below.

### Error gating

Deterministic builds don't recover without an input change, so `rejectReaderRequests(err)` latches the project into ERRORED and captures the error on `#lastError`. Subsequent reader requests short-circuit via `getError()` and throw the captured error immediately — no rebuild loop against a broken tree. Any `invalidate()` (direct source change or a change in a transitive dependency) clears `#lastError` before flipping the state, so the next request enqueues a fresh build.

Abort errors and errors during concurrent source changes are treated as transient: the reader queue is left intact and the affected projects are re-queued. The user sees a warn-level log, not a rejection.

### Reader suspend

`suspendReaders(error)` / `resumeReaders()` are a request-serving gate the owning `@ui5/server` `Supervisor` drives on a definition change, orthogonal to the per-project state machine. On the `definitionChanging` leading edge the Supervisor suspends the current BuildServer: `rejectQueuedReaders(error)` rejects every parked reader request now, and `#suspendError` makes new requests fast-reject at the `#getReaderForProject` gate (after the `isFresh()` short-circuit, so already-built resources keep serving). Without this, requests would park on a build that the checkout's concurrent source burst keeps aborting, hanging out the whole `git checkout`.

Unlike the ERRORED gate, this leaves `#state`, `#lastError`, and the cached reader untouched: the project is fine, its definition is just being re-resolved, so the server rebuilds normally once resumed without an ERRORED gate to lift. `invalidate()` from a concurrent source change does not clear it. The `error` must be an `Error` (the gate engages on its truthiness and the value is thrown to the middleware error handler); the Supervisor owns the HTTP-facing wording. `resumeReaders()` is idempotent and is lifted on both swap outcomes (see `@ui5/server`'s `Supervisor`).

### Build suspend

`suspendBuilds(reason)` stops the build loop, a separate gate the Supervisor engages next to `suspendReaders` on the `definitionChanging` leading edge. `suspendReaders` alone does not stop building: the checkout's concurrent source burst keeps aborting and re-arming builds on the outgoing BuildServer via the `#pendingDeferredRestart` -> `#triggerRequestQueue` self-loop, so the outgoing builder runs at the same time as the incoming stack's initial build against the same refcounted `CacheManager`. That contention corrupts the shared cache (a read fails once the outgoing stack's `destroy()` finalizes the SQLite handle the incoming stack is still reading) and interleaves both builders' build-progress events on the shared `process` feed.

`suspendBuilds` sets the one-way `#buildLoopSuspended` flag (checked in the `#triggerRequestQueue` and `#scheduleBackgroundValidation` guards), aborts the in-flight build via `ProjectBuildStatus.abortBuild` (which, unlike `invalidate()`, does not rotate the abort controller, change per-project state, or drop cached readers), cancels the queue timer and `#pendingDeferredRestart`, and stops any background validation pass. Already-built resources keep serving. The flag has no resume: `destroy()` is the only thing that clears it (`#destroyed` supersedes it in every scheduling guard). This is deliberate: a clean swap destroys the outgoing stack, and a failed re-resolve keeps it serving already-built resources while degraded without rebuilding off the wrong branch's sources, so the loop must stay off until teardown either way.

### Server lifecycle state

BuildServer also maintains an outer state machine over all projects, mutated exclusively through `#setState` and emitted to the `ServeLogger`:

```
IDLE --(source change / reader request)--> STALE --(#triggerRequestQueue)--> BUILDING
  ^                                            ^                                |
  |                                            |                                v
  |                        SETTLING <----------+------(abort / transient        |
  |                           |    (rebuild deferred    failure mid-cycle)------+
  |                           |     until quiet)                                |
  |                           +--(settle window elapses)--------------------> BUILDING
  |                                                                            |
  +---------- VALIDATING <--(post-build, INITIAL projects remain)-------------+
  |               |                                                            |
  |               +--(cache hit for all)-----------------------------------> IDLE
  |               |
  |               +--(cache miss, still non-FRESH) -----------------------> STALE
  |
  any --(unrecoverable failure)--> ERROR --(any invalidation)--> STALE
```

- `#reconcileServerState({mayValidate})` is the single point of truth for terminal transitions at the end of a build cycle or validation pass. It picks IDLE / STALE / VALIDATING based on `#getStaleProjectNames()`, `#activeBuild`, `#pendingBuildRequest`, and the `mayValidate` flag. It bails on `SETTLING` (as it does on `ERROR`) so the deferred-restart timer owns the SETTLING → BUILDING transition.
- **SETTLING** means "changes seen, a rebuild is pending, holding until changes go quiet." It sits between STALE and BUILDING and is entered from three deferral sites, all reporting `serve-settling`: the post-abort restart, the failure-with-pending-changes (transient) path, and a source change re-timing an already-pending build to the first-build window. No build is active while in SETTLING (`#activeBuild === null`); the armed timer moves it to BUILDING when the settle window elapses. BUILDING → SETTLING skips the `buildDone` emission — no successful cycle closed (mirrors BUILDING → ERROR).
- A genuine, non-transient build failure (no pending changes, signal not aborted) still goes to ERROR — the distinction is the `signal.aborted || #resourceChangeQueue.size > 0` predicate.
- Errored projects are NOT counted as "stale" — their rebuild is gated on input change, so surfacing them under STALE would understate the situation.
- BUILDING → ERROR skips the `buildDone` emission so consumers don't see a successful cycle close before the error.

### Background cache validation

After a build cycle ends with some projects still in INITIAL (e.g. dependencies never requested yet), `#scheduleBackgroundValidation` picks them up and calls `projectBuilder.validateCaches()` in a fire-and-forget pass:

1. `willValidate(projectName)` claims the project via `markValidating()` — a no-op if the state moved on.
2. Per project, `validateCaches` invokes the callback with `usesCache`:
   - `usesCache=true` → `setReader()` promotes the project to FRESH without executing any tasks.
   - `usesCache=false` → `releaseValidating()` reverts VALIDATING → INITIAL. If reader requests are queued, `onBuildRequired` fires `#enqueueBuild` so the waiting callers eventually resolve.
3. A source change during the pass aborts the composite signal (validation abort + per-project abort) and cancels validation for the affected projects.
4. The `finally` clause guarantees no project is left stuck in VALIDATING regardless of how the pass ended.

A build request preempts an in-flight pass: `#triggerRequestQueue` awaits `#stopActiveValidation` before claiming the builder's `buildIsRunning` lock. The pass's `finally` re-invokes `#reconcileServerState({mayValidate: false})` — `mayValidate=false` prevents stack recursion into another validation pass over the projects the previous one just released.

## Two Watchers: Source vs. Definition

Two independent watcher consumers feed different pipelines. Both subscribe through the `fileWatcher` facade (native `@parcel/watcher` by default, polling backend in containers or when the native binding is unavailable, see the Component Map):

- **Source watcher** (`WatchHandler`, owned by the `BuildServer`): watches source paths, emits `change` events that drive incremental rebuilds *inside* the BuildServer (the File Watch and Abort flow above).
- **Definition watcher** (`ProjectDefinitionWatcher`, owned by `@ui5/server`'s `Supervisor`): watches project-definition files, drives a full re-init of the serving stack *above* the BuildServer. A definition change (topology, config) requires re-resolving the graph, which no incremental rebuild can do, so it re-creates the graph + Express app + BuildServer behind the stable `http.Server`.

The split is why the source watcher tolerates a `git checkout` moving paths under it: the definition watcher owns the re-init that re-targets it at the new graph, so the source watcher only has to survive the churn.

Both watchers share `RecoveryBudget` (loop protection, one budget each), `drainSubscriptions` (parallel unsubscribe), and `WATCHER_BURST_SETTLE_MS`.

### ProjectDefinitionWatcher

`ProjectDefinitionWatcher extends EventEmitter`, modeled on `WatchHandler`. Documented here because it shares the watch helpers and settle discipline, though it is owned by `@ui5/server`.

- **Watch set** (`#resolveWatchSet`): traverses `graph.traverseBreadthFirst()` collecting each `project.getRootPath()`. Per project it watches `package.json` always, plus `ui5.yaml` (except the root when a custom `rootConfigPath` (`--config`) is given, which is watched instead and may live outside the root). Adds `workspaceConfigPath` (default `ui5-workspace.yaml` at cwd) when set, and `dependencyDefinitionPath` in `--dependency-definition` mode, where that file is itself a topology definition. Each distinct definition-file directory is subscribed directly.
- **Include-based model**: only paths in `#watchedFiles` can start a definition-change burst. Once a burst has started, every delivered event below the subscribed definition directories resets the trailing settle timer. Regular project roots keep the `node_modules`/`.git` ignore globs to reduce long-lived watch load; project roots below `node_modules` omit the `node_modules` ignore so their own `ui5.yaml` and `package.json` changes remain observable. Correctness comes from the include set; broad checkout quietness after a degraded graph is handled by `projectGraphSettleWatcher`.
- **Events**:
  - `definitionChanging` on the leading edge (first watched definition event), used to placeholder the project version during re-resolution.
  - `definitionChanged` on the trailing edge after `DEFINITION_CHANGED_SETTLE_MS` (= `WATCHER_BURST_SETTLE_MS`) of quiet across delivered events below the watched roots, coalescing a `git checkout` burst into a single re-init. Trailing-only: re-creating the stack on the first byte of a checkout would be wasted.
- **Recovery** (`#recoverWatcher`): mirrors `BuildServer.#recoverWatcher`. A synchronous re-entrancy guard collapses parcel's per-path error storm into one recovery, `RecoveryBudget` caps attempts, exhaustion escalates to a terminal `error`. The include set is unchanged; only OS-level handles are renewed.
- **`destroy()`**: idempotent (drains `#subscriptions` to `[]` first), aggregates unsubscribe failures into an `AggregateError` emitted as `error`.

The supervisor owns the watcher because it outlives individual BuildServer instances (destroyed on every swap) and is re-targeted over the new graph after each swap. See `@ui5/server`'s `Supervisor` for the re-init/swap wiring.

On a failed re-resolve `Supervisor` flags the surviving stack degraded (last-good keeps serving) and self-schedules one bounded recovery after `DEFINITION_CHANGED_SETTLE_MS`. Recovery runs a convergence loop (`#convergeRecoveryGraph`): resolve the graph, compare its project-root set to the previous iteration, and re-resolve after a `projectGraphSettleWatcher` settle window until two consecutive resolves agree on the roots (a subset check, so a dependency the target branch removes still converges). Each iteration feeds the settle watcher the just-resolved graph plus the last-good graph, so a checkout that restores a project's `package.json` before its sources, or introduces a target-only dependency root neither prior graph knew, is observed for quietness once it surfaces in a resolve rather than swapped in half-restored. This subsumes the earlier transient/deterministic distinction: a checkout race and a genuinely broken branch both fail the resolve, and both are handled by looping and settling instead of string-matching the error message. `RecoveryBudget` (5 attempts / 60s) bounds the self-scheduled recoveries against a persistently broken branch; unlike the watchers, an attempt is recorded when a recovery is scheduled (not on success), so a branch that never resolves exhausts the budget and stays degraded until the next definition change. A `definitionChanging` (real user action) clears any pending recovery and resets the budget; a clean swap resets it too.

## Caching Architecture

### Cache Layers

```
+-----------------------------------------------------------------+
|                  In-Memory (StageCache)                          |  <- Fast, per-session
|  signature -> {stage, writtenPaths, projectTagOps, buildTagOps}  |
+-----------------------------------------------------------------+
|                Persistent (CacheManager + BuildCacheStorage)     |  <- Across sessions
|  <ui5DataDir>/buildCache/<CACHE_VERSION>/cache.db (SQLite, WAL)  |
|    content        (CAS: integrity -> gzip-compressed BLOB)       |
|    index_cache    (resource index trees, by kind="source")       |
|    stage_metadata (cached stage results, by stage signature)     |
|    task_metadata  (resource requests per stage, by type)         |
|    result_metadata(per-build result metadata)                    |
+-----------------------------------------------------------------+
```

`<ui5DataDir>` defaults to `~/.ui5/` and can be overridden via `UI5_DATA_DIR` env var, the `ui5DataDir` configuration option, or the `--ui5-data-dir` CLI option. `<CACHE_VERSION>` is a constant in `CacheManager.js` (`CACHE_VERSION`) bumped on breaking schema changes; old versioned directories are simply ignored.

### Signatures

The cache uses content-based signatures at multiple levels:

| Level | What it captures | Where computed |
|-------|-----------------|----------------|
| **Build signature** | `getBaseSignature()` (`BUILD_SIG_VERSION` + build config), combined by `getProjectSignature()` with the aggregated task signatures, `project.getId()`, project config, the `@ui5/project` version (`getPackageVersion("@ui5/project")`), and the effective `@ui5/builder` / `@ui5/fs` versions (`taskRepository.getVersions()`). Task signatures come from `TaskDefinitions.getBuildSignatures()`, which calls each task's `determineBuildSignature()` (falling back to a hash of the task options/configuration). | `getBuildSignature.js`, `TaskDefinitions.getBuildSignatures()`, `ProjectBuildContext.create()` |
| **Source signature** | Merkle root of all source resources | `ResourceIndex` (source index) |
| **Stage signature** | An explicit four-component tuple `projectIndexSignature-dependencyIndexSignature-inputSignature-rootSignature`, joined by `-` (each component a SHA-256 hex digest, so the separator never occurs inside a component and the split is lossless). The four dimensions (project resources, dependency resources, non-resource **input signature**, root resources) are independent slots rather than folded into two, so a delta pairs a changed project or dependency signature with the current input and root signatures with no reverse mapping. The join/split primitives live in `cache/stageSignature.js`; `BuildStageCache.getStageSignatures()` composes the exact-match candidates. One stage per step for a step-based task, one per legacy task | `ProjectBuildCache.prepareStageExecutionAndValidateCache()`, `BuildStageCache.getStageSignatures()` |
| **Result signature** | A four-component tuple `sourceSignature-combinedDependencySignature-aggregatedInputSignature-aggregatedRootSignature`. The dependency component is a cartesian product over per-stage candidate dependency signatures; the aggregated input and root signatures are single current values (constants across the product). Both the candidate list and the stored signature derive the per-stage dependency list from the single stage order (`#stageOrder`), so the store and lookup sides cover the same stages in the same order (a declared stage missing a signature throws rather than silently never matching). Grows by one factor per stage, bounded because only dependency-reading stages with a delta contribute a factor >1 | `ProjectBuildCache.#getResultStageSignature()` / `#getPossibleResultStageSignatures()` |

### Non-Resource Task Inputs

A task's output can depend on inputs that are not resources: an environment variable, or a value read through the `TaskUtil` interface (`isRootProject()`, `getDependencies()`, a dependency's version via `getProject(name).getVersion()`, `getCustomConfiguration()`, framework getters). None of these feed the resource indices or the build signature, so without tracking, changing one between builds leaves a stale cached result being served. The canonical example: `generateLibraryManifest` embeds a dependency's version as the manifest `minVersion` via `getProject(depName).getVersion()`; removing or bumping that dependency must re-run the task even though no source resource changed.

Tracking has a record side and a lookup side, mirroring the resource-request flow:

- **Record** (task executes): the TaskRunner hands the task a `MonitoredTaskUtil` instead of the raw `TaskUtil`. It is a Proxy that preserves the wrapped shape (a custom task's limited interface stays limited) and records every tracked read as `{type, name, value}`, normalizing the value via `normalizeInputValue`. `getProject(name)` returns a wrapped project whose tracked accessors record under the project's name; its `getReader()` result is wrapped in a `MonitoredReader` so the resources the task reads through it are recorded as resource requests, and, for the project being built, its `getRootReader()` result is wrapped too so reads of files outside the UI5 resource model are recorded as root requests (see the reader-monitoring note below), while untracked members (`getRootPath`, `getSpecVersion`, ...) pass straight through unrecorded. After the task, the TaskRunner drains `getInputRecording()` into `ProjectBuildCache.recordStageResult`, which builds a `TaskInputSet` and folds its signature into the task's project-component signature (`combineProjectAndInputSignature`). Only entry type/name are persisted (`task_metadata` type `"input"`), never values.
- **Lookup** (later build): `BuildStageCache.getInputSignature(resolveValue)` recomputes the input signature, re-reading each recorded input's *current* value through `ProjectBuildContext.resolveInputValue(type, name)` (which reaches `process.env` and the current project graph). A value that differs from the one baked into the cached stage signature misses the cache and re-runs the task. Record and lookup normalize through the same `normalizeInputValue`, so equal values compare equal.

Excluded from input-value tracking: mutations (`setTag`/`clearTag`, already captured as tag operations in the hash trees), constructors (`resourceFactory`), readers (`getReader`/`getRootReader`), side effects (`registerCleanupTask`), and the FS-path accessors (`getRootPath`/`getSourcePath`) whose absolute, machine-specific values would make cache entries non-portable.

The `time` input (`taskUtil.getTime(granularity)`) is quantized through `quantizeTime(granularity, date)` (`lib/build/helpers/quantizeTime.js`). Both the record side (`TaskUtil.getTime`) and the lookup side (`resolveInputValue`) pass one timestamp fixed per build run: `BuildContext` holds it and `ProjectBuilder` calls `BuildContext.refreshBuildTime()` at the start of each `#build`/`#validate`, reached via `ProjectBuildContext.getBuildTime()`. This keeps every time read within a run consistent (all projects, plus the record and lookup within that run, agree) while still advancing across runs so a rolled-over bucket misses the cache. It cannot be fixed at `BuildContext` construction: a single `BuildContext` is reused for the whole `ui5 serve` lifetime, so a frozen bucket would keep agreeing with itself and silently serve stale output (e.g. last year's copyright). The `date` argument of `quantizeTime` is mandatory to stop a caller from falling back to a fresh `new Date()`.

`taskUtil.getBuildTime()` returns that same shared per-run timestamp as a raw `Date`, but is deliberately **untracked**: `MonitoredTaskUtil` passes it through without recording an input (it is absent from `TRACKED_TASK_UTIL_METHODS`), so its value never folds into a task's cache signature. This is the opposite of the tracked, quantized `getTime`: a raw timestamp advances every build, so tracking it would miss the cache every time. A cached result keeps the timestamp it embedded rather than re-running. `replaceBuildtime` consumes it (formatting the `${buildtime}` placeholder), so a cached step keeps its previous timestamp until its resource content changes. The interface exposes `getBuildTime` to custom tasks from Specification Version 5.0.

Reads through a `getProject(name).getReader()` are not input values but resources, so they are tracked on the resource-request side instead: `MonitoredTaskUtil` wraps that reader in a `MonitoredReader` and records the reads into a project bucket (the project being built) or a dependencies bucket (any other project). `getResourceRequests()` drains both, and the TaskRunner merges each bucket into the workspace and dependency resource requests it already collects, so the read resources get content-hashed like any other request. The project being built's `getRootReader()` is wrapped too: its reads (files outside the UI5 resource model, such as a root `tsconfig.json` or packages under `node_modules`) are recorded into a root bucket, split by the `useGitignore` flag because a glob resolves differently with the flag on versus off, and resolved against a dedicated root reader rather than the dependency reader collection. Those root requests use full-refresh signatures, not differential deltas, so a changed root file re-runs the whole stage (the per-file delta tracking the project and dependency paths have is a possible future extension, deferred because the current use case tracks only a few root config files). A *dependency's* `getRootReader()` stays an unwrapped pass-through: it exposes a project root outside the reader collection those requests are later resolved against, so a request registered through it could not be content-hashed.

Contract for task authors: read an env var through `taskUtil.getEnv(name)` (not `process.env` directly), and read graph-derived values through the `taskUtil`/`getProject` interface, so the monitor observes the read. A direct `process.env` read or a value obtained outside the monitored `taskUtil` is untracked and can serve stale. Conditional reads are handled correctly as long as the branching input is itself read through `taskUtil`: the recorded set changes with the branch, and the branching input's own value invalidates the cache when it changes.

### Step-Based Build Tasks

A step-based task default-exports a factory `build(options) => Step[]` instead of a task body. The factory receives `options` only (never readers or `taskUtil`), so it cannot close over build state; every input a step reads arrives through the step's own arguments. This replaced the old differential mode where a task received `changedProjectResourcePaths` and did its own delta bookkeeping. Step-based tasks: `minify` (one map step over resources), `buildThemes` (one map step over themes), the three `replace*` tasks, `escapeNonAsciiCharacters` and `enhanceManifest` (one map step each), and `generateThemeDesignerResources` (two scalar steps plus a themes map step, wired by `needs`).

**One stage per step.** Each step is promoted to its own pipeline stage: a scalar step is a stage; a map step is a single stage carrying an internal per-key delta (keys never become stages — they are discovered at runtime by `keys()` and must stay out of the static stage set and out of the result-stage cartesian product). A step-based task therefore contributes N stages (one per step) rather than one task stage; a legacy task still contributes one stage. Stage ids are `task/{taskName}::step/{stepName}` for a step-based task's steps and `task/{taskName}` for a legacy task (or a step-based task that returns no steps). This unifies steps and stages: per-step caching runs through the same stage-cache, tag-replay, and CAS-return machinery as any stage, rather than a parallel sub-cache folded inside one task stage. The result-stage signature grows by one factor per step, but only dependency-reading steps carrying a delta contribute a factor >1, so the growth is bounded (measured at 1.00× on the realistic framework-library task set, since the scalar steps read no dependencies — see the measurement note below).

Two step shapes, run in array order by `StepRunner.runSteps()`:
- scalar `{name, needs?, run}` where `run: async ({needs, workspace, dependencies, taskUtil, options}) => value?` runs once.
- map `{name, needs?, sequential?, keys, each}` where `keys: async ({needs, workspace, dependencies, taskUtil, options}) => keySet` enumerates the key set and `each: async (key, {needs, workspace, dependencies, taskUtil, options}) => value?` runs once per key.

A scalar step is a one-key group (a single implicit unit); a map step is a multi-key group. Both go through the same per-key machinery within their stage, so delta selection, stale-output derivation, and per-stage request/input folding are uniform across shapes.

**`needs` wiring.** A step lists earlier step names in `needs`; those steps' returns arrive as `needs.<name>` in its context (both `keys` and `each` for a map step). A step may reference only earlier steps, so array order is always a valid execution order. One `needs` object is shared by a step's `keys` enumerator and all of its units, and is frozen (shallowly): a unit assigning to `needs.<name>` would otherwise leak into its siblings and into the `needsInputs` recorded for whichever unit ran next, making a delta build's per-unit selection depend on execution order. `@ui5/builder`'s standalone `runSteps` freezes it too, so a step behaves the same under both runners. Because steps share `needs` state in memory, `StepRunner` remains the per-task driver that runs all of a task's steps in order — it just drives one stage per step (see below) instead of folding them into one.

**Authoring a step-based task (the DSL).** A task module default-exports the `build(options)` factory and returns the step array. The reference shape is `generateThemeDesignerResources` (`packages/builder/lib/tasks/generateThemeDesignerResources.js`), a scalar producer feeding a scalar consumer and a map step:

```js
export default function build(options) {
	const {version} = options;
	const namespace = options.projectNamespace;
	if (namespace === "sap/ui/documentation") {
		return []; // not offered in Theme Designer, so the factory emits no steps
	}
	const pattern = namespace ?
		`/resources/${namespace}/themes/*/library.source.less` :
		`/resources/**/themes/*/library.source.less`;

	const steps = [{
		name: "scan",
		run: async ({workspace}) => ({hasThemes: (await workspace.byGlob(pattern)).length > 0}),
	}];

	if (namespace) { // only a library (which has a namespace) gets a library .theming file
		steps.push({
			name: "libraryTheming",
			needs: ["scan"],
			run: async ({needs, workspace}) => {
				// write /resources/<namespace>/.theming from needs.scan.hasThemes, namespace, version
			},
		});
	}

	steps.push({
		name: "themes",
		needs: ["scan"],
		keys: async ({needs, workspace}) => needs.scan.hasThemes ? workspace.byGlob(pattern) : [],
		each: async (librarySourceLess, {workspace, dependencies}) => {
			// build one theme's .theming and library.less
		},
	});

	return steps;
}
```

Two DSL rules make the per-step recording honest, and both are visible here. The factory is pure over `options`: it may branch on `namespace`, precompute `pattern`, and include or omit steps, all from values that are part of the build signature. And no `run`/`keys`/`each` body closes over a reader or `taskUtil`; every input arrives as a callback argument (`workspace`, `dependencies`, `taskUtil`, `needs`, `options`), so a read cannot escape the step it belongs to. A matching contract holds for writes: every write a unit makes goes through its own `workspace`, the only writable handle a step receives (the factory gets `options` only, and `taskUtil.getProject().getReader()` is read-only), so a unit's recorded `writes` are the complete set `#computeStaleOutputs` needs to drop a path the unit stops producing. A custom step that reaches a writer another way leaves that write unrecorded, and its stale output would survive a delta build.

**How these steps become stages.** The factory above produces up to three stages, one per returned step: `task/generateThemeDesignerResources::step/scan`, `.../step/libraryTheming` (present only when `namespace` is set, so the stage set follows the factory's branching and is known before execution), and `.../step/themes` (one stage carrying the per-theme key delta, since keys are discovered at runtime and never become stages). `libraryTheming` is keyed on `scan`'s return through `needs`, so it stays cached while `hasThemes` holds even as individual `library.source.less` files change; the `themes` map step regenerates only the themes whose keys changed. `TaskRunner` calls the factory once at plan time (pure over `options`) to collect the step names for `setTasks`, so `ProjectBuildCache` creates these stages in step order before the build runs.

**Returns.** A step may return resources (stored in the CAS by integrity, as before) or a JSON-serializable value (persisted inline with the unit's invocation data). Either is injected into a consumer via `needs.<name>`, and the return's signature (resource integrities, or the serialized value) folds into the consumer's per-unit selection so a changed producer return re-runs the consumer. A map producer's return signature is order-independent: it hashes a `keyId -> signature` map sorted by `keyId`, not a positional list in `keys()` order, so a key reordering that changes nothing semantically (an adapter change, filesystem ordering, a reader-collection reshuffle) does not move the signature and re-run every consumer for nothing. A step returning nothing has a `null` return descriptor. A returned value that is neither resources nor JSON-serializable throws.

**The `stepBased` opt-in.** A task is step-based only when it declares it; absent, the default export is a legacy task body and runs unchanged. A standard task sets `stepBased: true` in its build-definition entry (`definitions/*.js`), read by `_addTask`. A custom task declares a static `stepBased` export on its task module, surfaced by `Task#getStepBased` and honored from Specification Version 5.0 (`_addCustomTask` computes `specVersion.gte("5.0") && (await getStepBased()) === true`); a `stepBased` export below 5.0 is ignored and the task runs as a legacy body. There is no shape-sniffing: both legacy and factory are default-export functions, disambiguated by the flag.

**Driving one stage per step.** Before the build, `TaskRunner.runTasks` calls each step-based task's factory (pure over `options`) to discover its step names and hands `ProjectBuildCache.setTasks` a `[{taskName, stepNames?}]` list, which creates one stage per step in step order. The discovered names stay on the task, and `#assertDiscoveredStepNames` compares them against the list the execution-time factory call returns: a factory body can still read the environment or the clock untracked, so a divergence is reported where it originates and names both step lists, instead of surfacing later as `useStage` on a stage that was never created. Both calls take the same completed `options` object, which `_addTask` fills in at registration time (`projectName`, `projectNamespace`) so plan time cannot observe a less complete object than execution. For each step, the `StepRunner` drives that step's own stage via hooks the `TaskRunner` supplies (`#createStepStageHooks`): `prepareStage(stepName)` switches the project to the step's stage and returns its cache verdict (`prepareStageExecutionAndValidateCache(taskName, stepName)`); `createStageContext()` builds fresh monitored `workspace`/`dependencies` readers and a `MonitoredTaskUtil` bound to that stage (so the reads reflect the cumulative output of all earlier stages with this stage's writer on top); `recordStage(stepName, …)` records the step's stage (`recordStageResult({taskName, …, stepName})`). A fully-cached stage (`prepareStage` returns `true`) does not run: its return is rebuilt from the persisted per-key data (in key order) so later steps' `needs` resolve, and its tag operations are replayed. A `needs` return is excluded from the stage signature, so a full-hit consumer whose producer re-ran with a changed return would otherwise serve stale output. The `StepRunner` checks this on the full-hit path (`#needsReturnChanged`) and, when it fires, reopens the stage with a fresh writer and re-runs it as a full execution (`reopenStage` returns a falsy verdict, not a delta). Reopen installs a fresh empty writable stage, so pruning the re-run to only the affected units would need re-seeding it with the cached outputs first, so the whole stage re-runs instead. No shipped multi-step task pays for this: only `generateThemeDesignerResources` wires `needs`, and a changed `scan` return regenerates its themes anyway. The verdict (`true` / delta object / falsy) is read three ways in `runSteps`. An explicit verdict shape would read more clearly but is deferred, since that shape is shared with the stage-signature code. A task is reported to the `ProjectBuildLogger` as skipped (`skipTask`) when every step was served from cache, else as executed. Its skip verdict is only known once every stage has been driven, so it cannot be announced up front like a legacy task: the `StepRunner` instead calls `notifyStepExecution` from the first stage that stops being a pure cache hit, before that stage runs anything, and `TaskRunner.#createTaskExecutionReport` turns that into `startTask`. `task-start` therefore precedes the work it announces, and the matching `endTask` (with the union of the stages' written paths) follows it, so a `project-build-status` consumer sees the task running while it runs. A step-based task that returns **no** steps still has one stage (`task/{taskName}`) that is prepared and recorded (empty), so its empty result caches and a later build reports it skipped.

**Standalone (uncached) runner.** `@ui5/builder` exposes `runSteps(factory, {workspace, dependencies, taskUtil, options})` (`lib/tasks/runSteps.js`) for standalone task invocation with no build cache: it runs every step in order, fans out each `keys` set, threads `needs` in memory, and buffers map writes in key order, without delta selection, persistence, or tag replay. It is an independent implementation (it does not use the `@ui5/project` `StepRunner`); the full cached engine stays in `@ui5/project` because `@ui5/builder` cannot import it.

Per unit within a stage, the callback receives its own recording readers (`{workspace, dependencies}`) that delegate to the stage's monitored readers and additionally attribute each read to the unit, plus a per-unit `MonitoredTaskUtil` wrapping the stage's one. The per-unit monitor attributes the unit's non-resource inputs (`getEnv`, `getTime`, `getProject(name).getVersion()`, `isRootProject`, `getDependencies`) and its `getTag`/`setTag`/`clearTag` operations to the unit, while reads still delegate through the stage monitor so a full build's stage-level recording stays the union that keys the stage. Key identity (`StepRunner.#keyId`) is content-based: a resource key by its path and a content discriminator (path distinguishes resources that share content but produce different output; the discriminator makes a content change a new key, so the unit re-runs and its previous output is dropped rather than served stale), a string key by its value. Compound keys are the caller's responsibility to express as a stable string. The discriminator is **tiered like `isResourceUnchanged`** (see §"HashTree") rather than always the SSRI integrity: `lastModified` + `size` when both are statically available (`getLastModified()` returns a number and `hasSize()` is true, so no content read), falling back to the integrity when either is missing — a memory-backed or generated resource with no `lastModified`, or one whose size is not statically known. A resource restored from a stage cache carries its `integrity`, so the fallback `getIntegrity()` resolves without reading content and that path stays cheap. This avoids hashing every enumerated key's full content before delta selection; it is why `#resolveEntries` is cheap for a broad `workspace.byGlob` step (`replaceCopyright`, `replaceVersion`) on a stale-cache build (see performance-investigation.md §12). The residual staleness risk is identical to `isResourceUnchanged`'s and accepted for the same reason: a content change that preserves **both** `lastModified` and `size` keeps the same key and does not re-run the unit — a real edit moves mtime, so the gap is only for mtime-preserving replacements (`cp -p`, `tar -x`, atomic rename) that also hold size constant, and the changed-path delta does not independently cover this case because it is derived through the same tiered comparison. Because the stat tier and the integrity tier use distinct prefixes (`\0m…\0s…` vs `\0i…`), a key never aliases across the two tiers.

> This is a signature-shape change to the per-key invocation data keys, not a persisted-cache-format change requiring a `CACHE_VERSION`/`BUILD_SIG_VERSION` bump: the per-key invocation data is re-derived each build and a changed key identity simply looks like a new key (the unit re-runs), which is the correct and safe outcome. The feature is unreleased, so no backward-compat shim is added.

Execution and writes:
- `sequential: true` (always set for a scalar step) persists each unit's writes immediately, so a later unit reads what an earlier one wrote.
- The default (`sequential: false`) runs a map step's keys concurrently: writes are buffered and flushed in key order after all keys finish; two concurrent keys writing the same path throw, since concurrent keys must be independent.
- Steps run in array order, and the abort signal is checked between units; a single in-flight unit is not interrupted.

Delta selection and cache integration (per stage):
- On a delta build, a unit re-runs when its key is new, its recorded reads intersect the changed project/dependency paths (the reverse mapping that re-runs the owner of a changed cross-resource input, e.g. a `.js` whose `.js.map` changed, or a theme whose gating marker was added), one of its recorded non-resource inputs no longer resolves to its stored value (an env var flipped, a dependency version bumped, or a time bucket rolled over between runs, since the bucket derives from the run's shared `BuildContext` timestamp), or a `needs` return it consumed changed. The input is re-derived through `ProjectBuildCache.getResolveInputValue()`, the same resolver the stage-level input lookup uses; without a resolver (standalone use) a unit is selected on its resource reads alone. A scalar step's single implicit unit is the exception: it re-runs whenever its stage takes the delta path (not a full cache hit), without consulting the per-unit reads delta. A scalar step is one unit, so there is nothing finer to prune, and the reads delta cannot catch a file newly matching a glob the step evaluated: the recorder stores resolved paths, not patterns (`#foldStageKeys`), so a file that did not exist on the previous build is in no recorded read, yet the stage-level monitor did record the glob, so an added match moves the stage signature and `prepareStage` returns a delta verdict. Re-running the one unit on that verdict is what makes `generateThemeDesignerResources`'s `scan` step observe a first theme being added (map steps are already covered: `keys()` re-enumerates and a new key has no previous entry). A full stage-cache hit still keeps the scalar step cached.
- `StepRunner.#computeStaleOutputs` reports paths a unit produced before but no longer produces (a re-run unit that writes fewer paths, or a removed key). The dropped-path comparison runs over the units that actually executed this build, while the set of paths still claimed is taken from the stage's complete per-key data, so a path a cached unit owns is never dropped because a sibling key disappeared. It is scoped to the one stage (a stage owns its outputs), and the `recordStage` hook appends the stale paths to the stage's delta `changedProjectResourcePaths` so `recordStageResult`'s stage merge drops them.
- A map step's `keys` enumerator owns no key, so it runs against the stage's own context rather than a per-unit recording one: it runs whenever the stage runs, so its reads and non-resource inputs are captured by the stage's monitored readers and `MonitoredTaskUtil` and fold into the stage signature, and the tags it sets are recorded as the stage's tag operations, which a fully cached stage restores along with its writer.
- `StepRunner.#foldStageKeys` folds every one of a stage's keys' reads and non-resource inputs — including keys served from cache on a delta build, whose reads and inputs the stage-level monitor never observed — into one request set and one input set, which the `recordStage` hook merges into the stage-level monitored requests before `recordStageResult` re-keys the stage. The recorder stores resolved paths and a path is commonly read by more than one key, so `#foldStageKeys` accumulates into `Set`s (deduped per read bucket) and the `recordStage` hook's `foldReadsInto` adds only the fold paths the stage monitor did not already request; the duplicates would otherwise collapse downstream in `ResourceRequestGraph.findExactMatch` (which keys on a `Set`), but carrying them inflated the recording that graph rebuilds. Deduplication does not move the stage signature — the set of reads is unchanged, only its representation. This is the map step's internal key-delta fold (kept in Phase B); there is no cross-**step** fold — each step's stage records only its own keys. The consumed `needs` returns are deliberately excluded from this fold (tracked in the separate per-key `needsInputs` field, see below): they drive per-unit selection only and are re-derived from producer reads/inputs that are themselves tracked, so `resolveInputValue` has no resolver for them and folding one into the stage signature would permanently miss the stage cache. Omitting this per-key fold makes a stage whose keys read `taskUtil.getTime` (`replaceCopyright`, `replaceBuildtime`) fail to reconverge to a cached signature across builds, because a delta build that restores every key records no inputs at the stage level.
- A unit served from cache replays its recorded `set`/`clear` tag operations via `ProjectResources.replayTagOperations`, routed by tag to the monitored project or build tag collection and applied by path, so its tags reappear in this build's tag operations (captured by `recordStageResult` like a unit that ran). A unit whose key is gone is not replayed, so a removed unit's tags do not linger. `get` operations carry no persistent effect and are skipped.
- Per-key invocation data (`Map<keyId, {reads, dependencyReads, writes, inputs, needsInputs, tagOperations, returns}>`) is persisted as a `task_metadata` sidecar (type `"steps"`) keyed by the step's **stage id** — one step's per-key map per stage, not nested by step name — loaded lazily by `ProjectBuildCache.getStepInvocationData(stageId)`. `needsInputs` holds the consumed `needs` return signatures for per-unit selection and is intentionally kept out of the stage input fold. Because a `needs` return is excluded from the stage signature, a cached consumer's correctness rests on two checks rather than the signature: `#needsReturnChanged` on the full-hit path and the `needsInputs` comparison in `#selectStepsToRun` on the delta path. These are the only two paths that reach a cached stage through the `StepRunner`. A whole project restored from the project-level result cache skips the `StepRunner` entirely (and `ProjectBuildCache.#importStages` installs its stages blindly by signature), yet that is safe without a needs check: the result signature aggregates every stage's inputs, producer stages included, so any change that could alter a producer's return perturbs the result signature, misses the result cache, and defers to the `StepRunner` where the two checks run. The sidecar is re-serialized in `writeCache` only for a stage whose map changed this build: `setStepInvocationData` (the sole mutation path, called when a stage re-records) marks the stage; a stage that was a full cache hit loaded its map but never re-recorded, so its row is not rewritten.
- Return values are first-class: `StepRunner` stores a resource return's content in the CAS via `ProjectBuildCache.getStepReturnValueStore()` (`store` buffers the compressed content deduped against stage rows; `flush`, called by the driver once per step after its units have returned, writes that step's buffer in a single transaction) and records per-unit descriptors in the `returns` field of the invocation entry; a serializable value is recorded inline. On a delta build a unit served from cache has its return rebuilt from the CAS (or read back from the inline value), so a map step's result array is reassembled in key order from a mix of freshly-returned and restored entries and handed to consumers via `needs`. A returned resource whose path collides with a written output is stored once by integrity and rebuilt independently of that output.

Removing an input resource yields a per-unit delta: `ResourceRequestManager.getDeltas` includes removed paths in the delta's `changedPaths`, so a unit that read the removed input re-runs (or, for a gone key, drops out) and its stale output is dropped via the stale-output merge above, while the other units stay cached. Known gap (parked): a processor-library version (e.g. terser, less-openui5) is not yet a tracked per-unit input, so a task whose output depends on a processor version can serve stale until a follow-up routes that version through the per-unit `taskUtil` (open-gaps §1).

**Result-stage-signature growth (Phase B measurement).** The result-stage signature is a cartesian product over per-**stage** candidate dependency signatures (`ProjectBuildCache.#getPossibleResultStageSignatures`). Promoting each scalar step to its own stage adds a factor per stage, but a stage contributes a factor >1 only when it read dependencies AND carries a dependency delta. In the realistic framework-library task set (`minify` + `buildThemes` + `generateThemeDesignerResources`), the scalar steps (`scan`, `libraryTheming`) read no dependencies, so they add factor-1 stages; the dependency reads stay with the single `themes`/`buildThemes` map stage that owns them. Measured growth under a broad dependency change: **1.00×** (both a real-build probe over the integration corpus and a forced worst-case harness with two dependency-reading stages each carrying a 2-node delta — current product 4, projected product 4). A dependency-reading scalar step WOULD multiply the product; the realistic set avoids it.

**Stage-count cost, and why single-step tasks are not collapsed.** The design keeps one stage per step. A single-step task already is exactly one stage, so the only step-based task that adds stages is `generateThemeDesignerResources` (three steps), and it is not in the default library task set: `ui5 build` and even `ui5 build --all` across sap.m, sap.ui.core, sap.ui.layout and sap.ui.unified run **zero** multi-step tasks. A library therefore builds with step count equal to task count, the same number of stages as the pre-redesign per-task model, and the stage growth the one-stage-per-step design could cause only appears for a build that runs `generateThemeDesignerResources`. Collapsing a single-step task to one `task/{taskName}` stage is a pure stage-id rename: same stage count, same `ReaderCollectionPrioritized` depth, same result-stage cartesian product, still driven by `StepRunner` with full per-key recording, so it buys nothing measurable. Any warm or stale build-time delta against the per-task model is not a stage-count effect (per-stage `updateProjectIndices` cost is unchanged); it comes from the per-key map-step machinery on a delta build and from startup and module loading on a warm build. Measured numbers live in the benchmark results repository, not here, since they drift with the code.


### Source File CAS Storage (Frozen Sources)

To prevent race conditions where a dependency's source files change between project builds in a multi-project build, untransformed source files are stored in CAS after each build completes:

1. `#freezeUntransformedSources()` identifies source files not overlaid by any build task
2. Stores them in CAS and persists metadata as a stage cache entry keyed by the source index signature
3. Creates a CAS-backed reader and sets it via `ProjectResources.setFrozenSourceReader()`
4. On subsequent builds where the result cache is valid, `#restoreFrozenSources()` loads metadata from cache and recreates the CAS-backed reader without rebuilding

At build completion, `#revalidateSourceIndex()` re-reads all source files and compares them against the source index. If any file was modified during the build, an error is thrown and the cache is not stored, preventing inconsistent results. In watch mode this triggers a rebuild.

### First Build (no cache)

```
#initSourceIndex()
  -> No index cache on disk
  -> Create fresh ResourceIndex from all source resources
  -> #combinedIndexState = INITIAL

validateCache({prepareForBuild: true})
  -> State is INITIAL -> return false (no cache to validate)

For each task:
  prepareStageExecutionAndValidateCache(taskName)
    -> No task cache exists (#stageCaches empty)
    -> return false (task must execute)

  [task executes]

  recordStageResult(taskName, workspace, dependencies, cacheInfo)
    -> Records resource requests -> creates hash trees (ResourceRequestManager.addRequests)
    -> Creates BuildStageCache with request patterns and indices
    -> Reads stage writer for produced resources
    -> Gets tag operations from MonitoredResourceTagCollection
    -> Computes stage signature
    -> Stores in StageCache (in-memory) via stageCache.addSignature()

allTasksCompleted()
  -> Sets #combinedIndexState = FRESH
  -> Computes result signature
  -> Resets #writtenResultResourcePaths
```

### Subsequent Build (with cache)

```
projectSourcesChanged(changedPaths) / dependencyResourcesChanged(changedPaths)
  -> Records changed paths
  -> Sets #combinedIndexState = REQUIRES_UPDATE

validateCache({prepareForBuild: true})
  -> State is REQUIRES_UPDATE
  -> #flushPendingChanges():
      #updateSourceIndex(changedPaths) -> reads resources from source reader
        -> upserts into source ResourceIndex
        -> Adds changed paths to #writtenResultResourcePaths
      Updates dependency indices for all task caches
  -> #findResultCache() -> checks if overall result is still valid
  -> If result cache valid: return true (skip entire project build)

For each task:
  prepareStageExecutionAndValidateCache(taskName)
    -> Task cache EXISTS (from previous build's recordStageResult)
    -> updateProjectIndices(reader, writtenResultResourcePaths)
        -> ResourceRequestManager.updateIndices():
            Match changed paths against request graph
            Read resources from reader
            Upsert into task hash trees (via TreeRegistry.flush for shared trees)
    -> Compute stage signatures from updated hash trees
    -> #findStageCache(stageName, stageSignatures)
        1. Check in-memory StageCache first
        2. Fall back to persistent cache (CacheManager)
    -> If found: apply cached stage, return true (skip task)
    -> If not found: try delta signatures (previous signature -> new signature)
        -> If delta found: return {cacheInfo} for differential execution
        -> If nothing found: return false (full execution)
```

## Resource Indexing (Merkle Trees)

### HashTree

A directory-based Merkle tree where:
- **Leaf nodes** (resources): hash = `SHA-256(resource:{name}:{integrity}[:tags(...)])`
- **Directory nodes**: hash = `SHA-256(sorted child hashes concatenated)`
- **Root hash** = tree signature (used as cache key)

Each resource node stores: `name`, `integrity`, `lastModified`, `size`, `inode`, `tags`

Key operations:
- `upsertResources(resources, timestamp)`: Insert or update resources, recompute affected hashes
- `removeResources(paths)`: Remove resources, recompute affected hashes
- `_computeHash(node)`: Recursive hash computation

The `isResourceUnchanged` utility (`utils.js`) determines if a resource is "unchanged" using a tiered comparison (cheapest first):

1. Compare `size` -- if different, changed (definite signal; mtime preservation via `cp -p`/`tar -x`/atomic rename does not imply unchanged content)
2. Compare `inode` -- if different, the file was replaced; fall through to integrity check rather than rejecting outright (content may still be identical)
3. If `lastModified` matches cached value AND differs from `indexTimestamp` AND inode matches: unchanged (fast path)
4. If `lastModified` equals `indexTimestamp`: racy-git edge case -- file may have changed during indexing, fall through to integrity check
5. Compare `integrity` hash -- expensive, last resort

`inode` is optional on both sides (virtual resources, older caches without inode); the inode check is skipped when either side is undefined.

### SharedHashTree and TreeRegistry

Tasks make multiple resource requests (e.g., `byGlob("/**/*.js")`, `byPath("/manifest.json")`). Each request set gets its own hash tree, but they share common subtrees via `SharedHashTree`.

```
Task reads:
  byGlob("/**/*.js")  -> RequestSet A -> SharedHashTree A (all JS files)
  byPath("/test.js")   -> RequestSet B -> SharedHashTree B (derived from A, adds test.js)
```

**TreeRegistry** coordinates batch updates across all shared trees:
1. Changes scheduled via `scheduleUpsert()` / `scheduleRemoval()`
2. `flush()` applies all pending operations atomically
3. Shared nodes modified once, changes propagate to all trees referencing them

### ResourceRequestManager

Manages the request graph for a task -- delegates to `ResourceRequestGraph` for DAG storage of request sets with delta encoding. Each graph node stores only the requests added relative to its parent, and `addRequestSet()` automatically finds the best parent (largest subset) to minimize delta size.

At runtime, each materialized request set references a `SharedHashTree` representing the resources currently matching that set.

- `addRequests(recording, reader)`: Records path/glob requests, creates or reuses a request set in the graph, builds a resource index (SharedHashTree), returns signature. Reusing an existing set (an exact `findExactMatch` hit) is a no-op for persistence and leaves `hasNewOrModifiedCacheEntries()` untouched, so a stage that records the same request set every delta build (the common case for a step-based stage) does not force the whole request graph to be re-serialized; only creating a new set, or a tree update in `updateIndices` that moves a signature, marks the manager dirty
- `updateIndices(reader, changedPaths)`: Traverses graph breadth-first, matches changed paths against request patterns per node, batch-fetches resources, upserts into affected resource indices via TreeRegistry
- `getIndexSignatures()`: Returns current signatures for all request sets
- `getDeltas()`: Returns map of original -> new signature for changed request sets. Both ends are the node's exposed (composite) signature (tree hash folded with any unresolved-request keys, matching `getIndexSignatures`), so a delta on a task that probed an absent path keys on the same signature the stage was stored under. A delta is not emitted once a resource is removed from a set (the shared path cannot express a removal), so a removal falls back to a full re-execution

## Resource Tags

### Tag Types

| Tag | Scope | Persists across builds | Example |
|-----|-------|----------------------|---------|
| `ui5:IsDebugVariant` | Project | Yes | Set by minify task on `-dbg.js` files |
| `ui5:HasDebugVariant` | Project | Yes | Set by minify task on original `.js` files |
| `ui5:OmitFromBuildResult` | Build | No (cleared after each build) | Exclude resources from output |
| `ui5:IsBundle` | Build | No | Mark bundled resources |

### Tag Flow Through Stages

```
initStages([stage1, stage2, ...])
  -> Creates Stage objects with empty writers and no cached tag ops

useStage(stageId)
  -> Sets #currentStageReadIndex = stageIdx - 1
  -> Resets monitored tag collections

#applyCachedResourceTags()  [called lazily from getResourceTagCollection()]
  -> Imports cached tag operations from stages[#lastTagCacheImportIndex+1 .. #currentStageReadIndex]
  -> Advances #lastTagCacheImportIndex

getResourceTagCollection(resource, tag)
  -> Calls #applyCachedResourceTags()
  -> Creates MonitoredResourceTagCollection wrapping the live collection
  -> MonitoredResourceTagCollection clones the collection at creation time
    (so getAllTagsForResource returns INPUT state, before task modifies)

resource.getTags()
  -> Calls project.getResourceTagCollection(this).getAllTagsForResource(this)
  -> Returns tags as {key: value} object or null
```

### Tags in Hash Trees

Resource hashes incorporate tags when present:
```
hashInput = `resource:${name}:${integrity}`
if (tags && Object.keys(tags).length > 0) {
    hashInput += `:tags(${sortedTagString})`
}
```

This ensures that tag-only changes (e.g., a resource gaining `IsDebugVariant` after the minify task runs) invalidate the cache signature for downstream tasks.

## Stage Pipeline

Each stage has its own writer; resources written during that stage go into it. A legacy task is one stage; a step-based task is one stage per step (Phase B). The pipeline itself is stage-id-agnostic (`ProjectResources.initStages`/`useStage`/`setStage` take arbitrary ordered stage ids); the stage set and naming come from `ProjectBuildCache` (`task/{taskName}` or `task/{taskName}::step/{stepName}`). More stages means a deeper prioritized reader stack, so a later step reads the cumulative output of all earlier steps (and earlier tasks) exactly as a later task read all earlier tasks before.

### Reader Construction

`ProjectResources.getReader()` creates a prioritized reader stack:
1. Current stage writer (highest priority)
2. Previous stage writers (in reverse order)
3. Frozen source reader (CAS-backed, if set)
4. Source reader (lowest priority, reads from filesystem)

This means a task sees the cumulative output of all previous tasks, with its own writes taking highest priority. The frozen source reader ensures downstream consumers read an immutable CAS snapshot rather than the live filesystem.

### Stage Cache

When a task is skipped (cache hit), its cached stage is restored:
```javascript
project.getProjectResources().setStage(stageName, stageCache.stage,
    stageCache.projectTagOperations, stageCache.buildTagOperations);
```

`ProjectBuildCache` keeps the stage ids `setTasks` created in execution order (`#stageOrder`) and prefetches one stage ahead: entering a stage in `prepareStageExecutionAndValidateCache` starts the database read for the following stage, so that read overlaps the current stage's execution. A prefetched entry is keyed by the exact stage signature, so a prefetch whose signature does not match is discarded and a normal read follows. The lookahead covers legacy single stages and per-step stages alike, since both are entries in the same `#stageOrder`.

## Persistent Cache Format

### On Disk (CacheManager)

```
<ui5DataDir>/buildCache/<CACHE_VERSION>/
+-- cache.db                       # Single SQLite database (WAL mode)
    Tables:
    - content(integrity TEXT PK, data BLOB)                                  # CAS: gzip above ~128 bytes
    - index_cache(project_id, build_signature, kind, data)                   # kind: "source"
    - stage_metadata(project_id, build_signature, stage_id, stage_signature, data)
    - task_metadata(project_id, build_signature, stage_id, type, data)      # stage_id is the STAGE id (task/{taskName} or task/{taskName}::step/{stepName}); type: "project" | "dependencies" | "input" | "root" | "root-no-gitignore" | "steps"
    - result_metadata(project_id, build_signature, stage_signature, data)
```

Note: Both CAS content and metadata BLOBs are gzip-compressed via thresholds (`CONTENT_COMPRESSION_THRESHOLD` ~128 bytes for content, `METADATA_COMPRESSION_THRESHOLD` ~4 KB for metadata). Below the thresholds, payloads are stored uncompressed; readers detect the gzip magic bytes on the way back out. `CACHE_VERSION` (a constant in `CacheManager.js`) is bumped on incompatible schema changes; obsolete versioned directories are not migrated, so the next build simply rebuilds the cache.

#### Index Cache Contents

The index cache (one row per `(project_id, build_signature, kind="source")`) contains:
- `indexTimestamp`: creation timestamp (used for racy-git detection)
- `root`: serialized Merkle tree (TreeNode hierarchy)
- `tasks`: array of `[stageId, stepBased ? 1 : 0]` recording the stage execution order (one entry per stage: a legacy task's `task/{taskName}`, or a step-based task's per-step `task/{taskName}::step/{stepName}`) and whether the stage ran the step runner (step-based), which drives delta tracking. The stage id is the `task_metadata` key everything else for that stage is stored under

#### Stage Metadata Format

Stage metadata stored on disk includes:
- `resourceMetadata`: resource paths mapped to `{integrity, lastModified, size, inode}`
- `resourceMapping` (optional, for WriterCollection stages): virtual path prefixes mapped to indices in the `resourceMetadata` array, supporting project types where multiple virtual paths map to the same physical path
- `projectTagOperations` / `buildTagOperations`: tag operations to apply when restoring the cached stage

## Key Architectural Patterns

1. **Lazy building**: Projects built on-demand when readers are requested
2. **Request batching**: Multiple pending build requests processed in single batch (`BUILD_REQUEST_DEBOUNCE_MS` = 10ms debounce). A source-change-driven first build is held on `FIRST_BUILD_SETTLE_MS` = 100ms to absorb editor save fan-out; a source-change-aborted or transiently-failed build restarts on `ABORTED_BUILD_RESTART_SETTLE_MS` (= `WATCHER_BURST_SETTLE_MS` = 550ms) so a burst collapses into one rebuild. Both windows report `SETTLING`. A reader request supersedes the first-build window at the 10ms debounce, but not the deferred post-abort/transient restart (`#pendingDeferredRestart`): the queued request waits for the deferred rebuild.
3. **Abort/retry**: File changes abort running builds; projects re-queued automatically
4. **Structural sharing**: Derived hash trees share unchanged subtrees, reducing memory
5. **Content-addressed storage**: Resources deduplicated via integrity hashes in custom CAS (synchronous path resolution, gzip-compressed)
6. **Differential caching**: Stages track resource requests; delta builds only re-process changed resources. A task participates by being step-based (the `stepBased` flag, see "Step-Based Build Tasks"), which promotes each step to its own stage; this replaced the older `changedProjectResourcePaths` parameter
7. **Tag propagation**: Resource tags flow through stages via cached tag operations, included in hash signatures
8. **Two-tier cache**: Fast in-memory StageCache + persistent filesystem cache via CacheManager
9. **Two-phase invalidation**: Changes queued via `projectSourcesChanged()` / `dependencyResourcesChanged()` (state -> `REQUIRES_UPDATE`), applied only during `#flushPendingChanges()` at next build start. "Definitely invalidated" only after content comparison confirms actual differences.
10. **Source index revalidation**: At build completion, `#revalidateSourceIndex()` re-reads source files and compares against the source index. If any file changed during the build, an error is thrown and the cache is not stored.
11. **Frozen sources**: Untransformed source files stored in CAS after build, providing immutable snapshots for downstream dependency consumers (prevents filesystem race conditions)
