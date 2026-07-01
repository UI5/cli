# BuildServer error handling — follow-up plan

Iteration 1 (already applied to `BuildServer.js`) fixed the "serve crashes on any
build failure" problem by:

1. Splitting the catch block in `#processBuildRequests` into three branches:
   - **Abort** (`AbortBuildError`, `SourceChangedDuringBuildError`) — re-queue, no
     user-facing message beyond `log.info`.
   - **Transient** (any other error, but `signal.aborted || resourceChangeQueue.size > 0`) —
     silently re-queue affected projects, keep held reader requests intact, log at
     `verbose` only.
   - **Normal** — `log.error`, reject held reader requests, transition the server
     state to `ERROR` (which the banner picks up via `ServeLogger.serveError`).
2. Removing the `emit("error", err)` calls on the build-error paths (both in
   `#processBuildRequests` and `#triggerRequestQueue`). The `"error"` event stays
   reserved for genuinely fatal failures (watcher crash, cache manager blow-up),
   which still route through `packages/server/lib/server.js` → the yargs error
   callback in `packages/cli/lib/cli/commands/serve.js` and terminate the process.
3. Held reader requests during a transient failure remain queued indefinitely —
   they resolve on the next successful build. No timeout, no retry cap.

The transient detection uses concurrent-change signals only (`signal.aborted ||
#resourceChangeQueue.size > 0`). Tasks are not modified in this iteration.

Iteration 2 (also applied) adds:

- **Rebuild gating on normal errors.** `ProjectBuildStatus` gains an `ERRORED`
  state and a captured error; `#getReaderForProject` short-circuits with the
  captured error rather than re-enqueueing when the project is gated. The gate
  lifts in `invalidate()`, which `_projectResourceChanged` already calls for
  the changed project and every transitive dependent — so a change in library A
  correctly re-opens the gate for library X (which depends on A).
- **Banner state during error+retry.** `_projectResourceChanged` now transitions
  `ERROR → STALE` (in addition to `IDLE → STALE`), and `#processBuildRequests`
  transitions to `BUILDING` at the top of each while-loop iteration. Together
  these ensure the banner leaves the sticky error state as soon as new input
  arrives, and shows the building spinner while a retry runs.

## Known gaps

### 1. ~~Sticky ERROR banner when a normal error is followed by a transient retry~~

Addressed in iteration 2: `_projectResourceChanged` transitions
`ERROR → STALE` and each `#processBuildRequests` while-iteration transitions to
`BUILDING`. The banner now reflects retry progress correctly.

### 2. Task-side error classification

Iteration 1 detects transient errors by observing concurrent-change state on the
`BuildServer`. This misses transient failures where the abort signal never fired
and no change is queued yet — e.g. a task reads a file that was deleted between
`readdir` and `readFile`, and the filesystem event is still in flight.

Iteration 2 (proposed): introduce a small typed-error hierarchy in
`@ui5/project/build`:

```
BuildError (abstract)
├── BuildAbortedError            // replaces AbortBuildError
├── SourceChangedDuringBuildError (already exists in cache/)
├── TransientBuildError           // ENOENT/EBUSY/EMFILE during a task, etc.
└── TaskExecutionError            // wraps errors thrown by a task
    └── (thin wrappers per task family, optional)
```

- `ProjectBuilder.build()` wraps each task invocation. Node fs errors with codes
  in a known-transient set (`ENOENT`, `EBUSY`, `EMFILE`, `EPERM` on Windows) are
  rewrapped as `TransientBuildError`. Other task errors become `TaskExecutionError`
  carrying the task name and project.
- `BuildServer.#processBuildRequests` dispatches on the error type instead of the
  current heuristic. The concurrent-change check becomes a fallback for
  unclassified errors from third-party code paths.
- Public API: export the error classes from `@ui5/project/build` so downstream
  tooling can `instanceof`-check.

### 3. Cache manager fatal errors

`this.#projectBuilder.closeCacheManager()` is called from `destroy()` in a
`finally` block. Errors from it are silently swallowed. If the cache manager
throws during a normal build, the error currently reaches the normal-error branch
and is surfaced as a build error. Cache infrastructure failures should probably
be their own class and route to the fatal `"error"` event so the user restarts
the server cleanly.

### 4. WatchHandler errors

`#initWatcher` emits `"error"` on watcher failure. This is intentional and stays
fatal — the server cannot function without a watcher. But: the current handler
in `server.js` only logs. If watch fails partway through a session, the user
would see the error and then a server that silently stops rebuilding. Consider
either (a) triggering process exit on watcher error, or (b) attempting to
re-initialize the watcher.

### 5. Retry guard for pathological transient loops

Iteration 1 has no retry cap. A pathological repository (constantly-changing
generated files) could loop indefinitely at `verbose` level, invisible to the
user. If field reports show this, add a per-project retry counter that
promotes N consecutive transient failures to a normal error.

## Testing gaps to fill alongside iteration 2

- Unit test: normal build error keeps the server alive and does not emit
  `"error"`.
- Unit test: transient error (source change during build with a non-abort
  exception thrown by a mock task) re-queues without rejecting held reader
  requests.
- Unit test: held reader request during transient error resolves after the
  retry succeeds.
- Integration test: kill a task with a synthetic error mid-`git pull`-simulation
  (rapid file changes) and verify the banner never turns red.
