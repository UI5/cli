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
| `getBuildSignature` | `lib/build/helpers/getBuildSignature.js` | Build signature computation: `BUILD_SIG_VERSION` + build config + project config |
| `ProjectBuildContext` | `lib/build/helpers/ProjectBuildContext.js` | Per-project bridge between builder, tasks, and cache |
| `WatchHandler` | `lib/build/helpers/WatchHandler.js` | `@parcel/watcher`-based source path watcher; emits `change` events to BuildServer. The watcher coalesces its own events with a 50 ms min / 500 ms max wait, so a continuous operation is delivered as batches up to 500 ms apart. Survives a `git checkout` moving source paths: drops events whose path no longer maps (`getVirtualPath` throws) and skips a path that vanished before `subscribe` resolved, instead of escalating to a fatal error. The `DefinitionWatcher` then re-inits over the new graph |
| `DefinitionWatcher` | `lib/build/helpers/DefinitionWatcher.js` | `@parcel/watcher`-based watcher for project-definition files (`ui5.yaml` / `--config`, `package.json`, workspace config, static dependency-definition file). Emits `definitionChanging` (leading) and `definitionChanged` (trailing, coalesced) to drive a full serving-stack re-init. Owned by `@ui5/server`'s `ServeSupervisor`, not the BuildServer; exported via the `@ui5/project/build/helpers/DefinitionWatcher` subpath |
| `RecoveryBudget` | `lib/build/helpers/RecoveryBudget.js` | Sliding-window loop protection for watcher recovery (`WATCHER_RECOVERY_MAX_ATTEMPTS` = 5 within `WATCHER_RECOVERY_WINDOW_MS` = 60000). One instance per watcher, so a fault in one does not consume the other's budget |
| `watchSettle` | `lib/build/helpers/watchSettle.js` | Single source of `WATCHER_BURST_SETTLE_MS` = 550 ms, shared by every `@parcel/watcher` consumer (sized above the watcher's 500 ms coalescing cap) |
| `drainSubscriptions` | `lib/build/helpers/watchSubscriptions.js` | Unsubscribes a list of subscriptions in parallel (`Promise.allSettled`), returns the failures. Used by both watchers' `destroy()` and BuildServer's recovery re-subscribe |
| `TaskRunner` | `lib/build/TaskRunner.js` | Task composition, execution loop, abort handling |
| `Cache` enum | `lib/build/cache/Cache.js` | Cache mode constants: `Default`, `Force`, `ReadOnly`, `Off` (CLI `--cache` option) |
| `ProjectBuildCache` | `lib/build/cache/ProjectBuildCache.js` | Cache orchestration per project: index management, stage lookup, result recording |
| `BuildTaskCache` | `lib/build/cache/BuildTaskCache.js` | Per-task resource request tracking and index management |
| `StageCache` | `lib/build/cache/StageCache.js` | In-memory cache of stage results keyed by signature |
| `BuildCacheStorage` | `lib/build/cache/BuildCacheStorage.js` | Unified SQLite storage for content (CAS) and metadata |
| `CacheManager` | `lib/build/cache/CacheManager.js` | Persistent cache I/O, delegates to BuildCacheStorage; singleton per cache directory |
| `ResourceRequestManager` | `lib/build/cache/ResourceRequestManager.js` | Request graph, resource index updates, signature computation |
| `ResourceRequestGraph` | `lib/build/cache/ResourceRequestGraph.js` | DAG of request sets with delta encoding and best-parent optimization |
| `ResourceIndex` | `lib/build/cache/index/ResourceIndex.js` | Wrapper around hash trees with delta detection |
| `HashTree` | `lib/build/cache/index/HashTree.js` | Directory-based Merkle tree for resource hashing |
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

`BuildServer.create()` awaits `WatchHandler` readiness before enqueueing initial builds. This closes a race — most visible on Windows' `ReadDirectoryChangesW` backend — where source changes made immediately after `graph.serve()` resolves would otherwise be missed.

### Build Request Flow

```
reader.byPath("/test.js")
  -> BuildServer #getReaderForProject(projectName)
      -> If ProjectBuildStatus.isFresh(): return cached reader
      -> If getError() returns a captured error: throw it (ERRORED gate,
         see "Error gating" below)
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
5. The build loop catches `AbortBuildError` and re-enqueues projects that aren't fresh. Two branches defer their restart instead of firing on the request debounce: the source-change-aborted build, and a build that *failed* while sources were still changing (the transient branch, `signal.aborted || #resourceChangeQueue.size > 0`). The restart waits `ABORTED_BUILD_RESTART_SETTLE_MS` (= `WATCHER_BURST_SETTLE_MS` = 550 ms) of quiet, reset by each further change, so a multi-batch burst collapses into one rebuild against the settled tree. The deferral arms the queue timer and sets `#pendingDeferredRestart`. Both branches report `SETTLING` for the window (they no longer park the banner on `building` or flip it to `error`). A genuine, non-transient failure still latches ERRORED.

   While `#pendingDeferredRestart` holds, a reader request does *not* supersede the window: `#enqueueBuild` queues the project and returns without re-arming, and the request resolves when the deferred rebuild runs. Pulling the restart forward would build into a still-arriving burst; resetting it per request would let live-reload traffic defer the rebuild indefinitely. Only source changes reset the window.
6. The first speculative build after a source change from a quiet state is held for a short first-build window (`FIRST_BUILD_SETTLE_MS` = 100 ms, also reported as `SETTLING`) rather than the snappy debounce — this absorbs an editor's own multi-file save fan-out (100 ms sits far below the watcher's 500 ms coalescing cap, roughly at its 50 ms floor) so a save-all doesn't fire a build into a half-written tree. It applies only to a build that is already pending (a reader request queued but not yet started); laziness is preserved — with nothing queued, a change still waits for a reader request. On its own it does not cover a multi-second `git checkout`; full coverage of that comes from the transient-failure deferral above.
7. Queued resource changes are flushed via `#flushResourceChanges()` before the next build starts (must happen before `projectBuilder.build`)

The server also emits a `sourcesChanged` event to drive live-reload notifications. Emission is **leading-edge**: the first change of a quiet period notifies immediately (a lone edit reaches clients at the watcher's own ~50 ms latency floor with no debounce added), and a trailing settle window (`SOURCES_CHANGED_SETTLE_MS` = `WATCHER_BURST_SETTLE_MS` = 550 ms, above the watcher's 500 ms cap) coalesces the remainder of a burst into one further emit. Because emission is leading-edge, the window size does not affect single-edit latency: it only controls burst coalescing.

The three source-watcher settle windows (`SOURCES_CHANGED_SETTLE_MS`, `ABORTED_BUILD_RESTART_SETTLE_MS`, and the DefinitionWatcher's `DEFINITION_CHANGED_SETTLE_MS`) all resolve to `WATCHER_BURST_SETTLE_MS` in `watchSettle.js`, sized above `@parcel/watcher`'s 500 ms `MAX_WAIT_TIME` so each batch resets the window rather than terminating it. `FIRST_BUILD_SETTLE_MS` (100 ms) is deliberately separate: it absorbs an editor's save fan-out, not a multi-batch operation.

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

Two independent `@parcel/watcher` consumers feed different pipelines:

- **Source watcher** (`WatchHandler`, owned by the `BuildServer`): watches source paths, emits `change` events that drive incremental rebuilds *inside* the BuildServer (the File Watch and Abort flow above).
- **Definition watcher** (`DefinitionWatcher`, owned by `@ui5/server`'s `ServeSupervisor`): watches project-definition files, drives a full re-init of the serving stack *above* the BuildServer. A definition change (topology, config) requires re-resolving the graph, which no incremental rebuild can do, so it re-creates the graph + Express app + BuildServer behind the stable `http.Server`.

The split is why the source watcher tolerates a `git checkout` moving paths under it: the definition watcher owns the re-init that re-targets it at the new graph, so the source watcher only has to survive the churn.

Both watchers share `RecoveryBudget` (loop protection, one budget each), `drainSubscriptions` (parallel unsubscribe), and `WATCHER_BURST_SETTLE_MS`.

### DefinitionWatcher

`DefinitionWatcher extends EventEmitter`, modeled on `WatchHandler`. Documented here because it shares the watch helpers and settle discipline, though it is owned by `@ui5/server`.

- **Watch set** (`#resolveWatchSet`): traverses `graph.traverseBreadthFirst()` collecting each `project.getRootPath()`. Per project it watches `package.json` always, plus `ui5.yaml` (except the root when a custom `rootConfigPath` (`--config`) is given, which is watched instead and may live outside the root). Adds `workspaceConfigPath` (default `ui5-workspace.yaml` at cwd) when set, and `dependencyDefinitionPath` in `--dependency-definition` mode, where that file is itself a topology definition.
- **Include-based model**: subscribes to each distinct directory (deduplicated across projects); the callback drops every event whose resolved path is not in `#watchedFiles`. The `node_modules`/`.git` ignore globs only reduce OS-level watch load; correctness comes from the include set.
- **Events**:
  - `definitionChanging` on the leading edge (first watched event), used to placeholder the project version during re-resolution.
  - `definitionChanged` on the trailing edge after `DEFINITION_CHANGED_SETTLE_MS` (= `WATCHER_BURST_SETTLE_MS`), coalescing a `git checkout` burst into a single re-init. Trailing-only: re-creating the stack on the first byte of a checkout would be wasted.
- **Recovery** (`#recoverWatcher`): mirrors `BuildServer.#recoverWatcher`. A synchronous re-entrancy guard collapses parcel's per-path error storm into one recovery, `RecoveryBudget` caps attempts, exhaustion escalates to a terminal `error`. The include set is unchanged; only OS-level handles are renewed.
- **`destroy()`**: idempotent (drains `#subscriptions` to `[]` first), aggregates unsubscribe failures into an `AggregateError` emitted as `error`.

The supervisor owns the watcher because it outlives individual BuildServer instances (destroyed on every swap) and is re-targeted over the new graph after each swap. See `@ui5/server`'s `ServeSupervisor` for the re-init/swap wiring.

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
|    task_metadata  (resource requests per task, by type)          |
|    result_metadata(per-build result metadata)                    |
+-----------------------------------------------------------------+
```

`<ui5DataDir>` defaults to `~/.ui5/` and can be overridden via `UI5_DATA_DIR` env var, the `ui5DataDir` configuration option, or the `--ui5-data-dir` CLI option. `<CACHE_VERSION>` is a constant in `CacheManager.js` (`CACHE_VERSION`) bumped on breaking schema changes; old versioned directories are simply ignored.

### Signatures

The cache uses content-based signatures at multiple levels:

| Level | What it captures | Where computed |
|-------|-----------------|----------------|
| **Build signature** | `BUILD_SIG_VERSION` + build config via `getBaseSignature()`, per-project via `getProjectSignature()` (base + projectId + project config). Task-provided signatures planned but not yet integrated. | `getBuildSignature.js`, `ProjectBuildContext.create()` |
| **Source signature** | Merkle root of all source resources | `ResourceIndex` (source index) |
| **Task stage signature** | `projectIndexSignature-dependencyIndexSignature` | `ProjectBuildCache.prepareTaskExecutionAndValidateCache()` |
| **Result signature** | Combined source signature + last task stage signature | `ProjectBuildCache.#getResultStageSignature()` |

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
  prepareTaskExecutionAndValidateCache(taskName)
    -> No task cache exists (#taskCache empty)
    -> return false (task must execute)

  [task executes]

  recordTaskResult(taskName, workspace, dependencies, cacheInfo)
    -> Records resource requests -> creates hash trees (ResourceRequestManager.addRequests)
    -> Creates BuildTaskCache with request patterns and indices
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
  prepareTaskExecutionAndValidateCache(taskName)
    -> Task cache EXISTS (from previous build's recordTaskResult)
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

- `addRequests(recording, reader)`: Records path/glob requests, creates or reuses a request set in the graph, builds a resource index (SharedHashTree), returns signature
- `updateIndices(reader, changedPaths)`: Traverses graph breadth-first, matches changed paths against request patterns per node, batch-fetches resources, upserts into affected resource indices via TreeRegistry
- `getIndexSignatures()`: Returns current signatures for all request sets
- `getDeltas()`: Returns map of original -> new signature for changed request sets

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

Each task has its own **stage** with a writer. Resources written by a task go into that stage's writer.

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

## Persistent Cache Format

### On Disk (CacheManager)

```
<ui5DataDir>/buildCache/<CACHE_VERSION>/
+-- cache.db                       # Single SQLite database (WAL mode)
    Tables:
    - content(integrity TEXT PK, data BLOB)                                  # CAS: gzip above ~128 bytes
    - index_cache(project_id, build_signature, kind, data)                   # kind: "source"
    - stage_metadata(project_id, build_signature, stage_id, stage_signature, data)
    - task_metadata(project_id, build_signature, task_name, type, data)      # type: "project" | "dependencies"
    - result_metadata(project_id, build_signature, stage_signature, data)
```

Note: Both CAS content and metadata BLOBs are gzip-compressed via thresholds (`CONTENT_COMPRESSION_THRESHOLD` ~128 bytes for content, `METADATA_COMPRESSION_THRESHOLD` ~4 KB for metadata). Below the thresholds, payloads are stored uncompressed; readers detect the gzip magic bytes on the way back out. `CACHE_VERSION` (a constant in `CacheManager.js`) is bumped on incompatible schema changes; obsolete versioned directories are not migrated, so the next build simply rebuilds the cache.

#### Index Cache Contents

The index cache (one row per `(project_id, build_signature, kind="source")`) contains:
- `indexTimestamp`: creation timestamp (used for racy-git detection)
- `root`: serialized Merkle tree (TreeNode hierarchy)
- `tasks`: array of `[taskName, supportsDifferentialBuilds ? 1 : 0]` recording the task execution order and differential build capability

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
6. **Differential caching**: Tasks track resource requests; delta builds only re-process changed resources
7. **Tag propagation**: Resource tags flow through stages via cached tag operations, included in hash signatures
8. **Two-tier cache**: Fast in-memory StageCache + persistent filesystem cache via CacheManager
9. **Two-phase invalidation**: Changes queued via `projectSourcesChanged()` / `dependencyResourcesChanged()` (state -> `REQUIRES_UPDATE`), applied only during `#flushPendingChanges()` at next build start. "Definitely invalidated" only after content comparison confirms actual differences.
10. **Source index revalidation**: At build completion, `#revalidateSourceIndex()` re-reads source files and compares against the source index. If any file changed during the build, an error is thrown and the cache is not stored.
11. **Frozen sources**: Untransformed source files stored in CAS after build, providing immutable snapshots for downstream dependency consumers (prevents filesystem race conditions)
