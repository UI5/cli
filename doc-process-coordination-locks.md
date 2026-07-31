- Start Date: 2026-07-16
- RFC PR: [#1394](https://github.com/UI5/cli/pull/1394)
- Issue: -
- Affected components <!-- Check affected components by writing an "X" into the brackets -->
    + [ ] [ui5-builder](./packages/builder)
    + [x] [ui5-server](./packages/server)
    + [x] [ui5-cli](./packages/cli)
    + [ ] [ui5-fs](./packages/fs)
    + [x] [ui5-project](./packages/project)
    + [ ] [ui5-logger](./packages/logger)


# RFC 0019 Process-Coordination Locks

## Summary

Introduce a shared, file-based advisory locking mechanism across `@ui5/project` and `@ui5/cli` so that `ui5 cache clean` can safely delete framework packages and build cache data without corrupting concurrent `ui5 build`, `ui5 serve`, or programmatic `@ui5/*` API consumers.

## Motivation

`ui5 cache clean` deletes files inside `~/.ui5/` that may be actively used by other running UI5 CLI processes. Without coordination, a cache clean can:

- Delete framework packages while a concurrent `ui5 build` is installing or reading them, causing `ENOENT` errors mid-build.
- Clear the SQLite build-cache database while a running `ui5 serve` holds it open, corrupting its WAL state.
- Race against a concurrent installer, resulting in a partially-installed framework directory.

UI5 CLI processes are **separate OS processes**, not async tasks within one Node.js event loop. An in-process mutex is therefore insufficient. Cross-process coordination requires file-based advisory locks that survive across PIDs and are visible in the filesystem.

## Detailed design

### Lock directory

All process-coordination lock files live in a single shared directory:

```
~/.ui5/locks/
```

This location is configurable via `UI5_DATA_DIR` / `ui5 config set ui5DataDir` — the lock directory is always `path.join(ui5DataDir, "locks")`.

Lock files are created with the `lockfile` npm package, which provides POSIX-compatible exclusive file creation and a signal-exit handler that removes all known locks on process exit.

### Why `lockfile`

The `lockfile` package was already used by the framework installers (`AbstractInstaller`) for per-package installation locks before this RFC. Reusing it for the new process-coordination locks keeps the dependency footprint flat and ensures consistent behavior across all locking in the codebase.

Key properties that make it suitable:

- **Staleness support** — every lock carries a `stale` threshold; locks older than the threshold are treated as dead (left by a crashed process) and can be cleaned up without manual intervention.
- **Signal-exit integration** — the package registers handlers for `SIGINT`, `SIGTERM`, and `exit` that synchronously remove all locks it knows about, providing automatic cleanup on both graceful shutdown and unexpected termination.
- **Sync and async variants** — `lockfile.lock` (async) and `lockfile.lockSync` (sync) share the same staleness semantics, making them interchangeable from a correctness perspective while allowing each call site to pick the variant that fits its execution context.

### Lock types

Two categories of lock are used:

| Lock | File pattern | Held by | Checked by |
|---|---|---|---|
| Graph lock | `graph-{pid}-{randomHex}.lock` | `ProjectGraph` instance (for its full lifetime) | `ui5 cache clean` before deletion |
| Cleanup lock | `cache-cleanup.lock` | `ui5 cache clean` | Framework installer (`AbstractInstaller`) before package operations |

### Graph lock lifecycle

`ProjectGraph._preventCacheClean()` acquires a graph lock so that `ui5 cache clean` can detect any active build or serve process. The lock:

- Is acquired asynchronously via `acquireLock` (unique path, no contention possible).
- Refreshes its mtime every `LOCK_REFRESH_INTERVAL_MS = LOCK_STALE_MS * 0.6` so it does not appear stale during long-running operations.
- Is released in `ProjectGraph.destroy()`, which must be called explicitly by callers when the graph is no longer needed.
- Is automatically removed on abnormal process exit by the `lockfile` signal-exit handler.

The lock path encodes the PID and a random hex suffix (`graph-{pid}-{randomHex}.lock`) to guarantee uniqueness across concurrent instances.

#### Why `ProjectGraph` is the lock owner

During the development of `ui5 cache clean`, a key design question was: where exactly should the lock be acquired? Candidates considered included the CLI command itself, individual install methods, individual build or serve methods, and specific cached resources.

The eventual answer: **the `ProjectGraph` instance is the correct lock owner**, because the graph holds live references to cached resources for its entire lifetime — not just during downloads or builds. Once a graph is constructed, it references framework package paths that must not be deleted until the graph is destroyed. The invariant is simple: *while a `ProjectGraph` is alive, `cache clean` must not proceed*.

#### What "alive" means for `ProjectGraph`

In the context of the UI5 CLI, a graph's lifetime matches a command invocation:

- `ui5 build` — graph lives for the duration of the build.
- `ui5 serve` — graph lives for the lifetime of the dev server.
- `ui5 tree` — graph lives while the dependency tree is computed and printed.

In all these cases, the CLI command is the obvious caller of `destroy()` at the end of the operation.

#### Complexity with programmatic API usage

`ProjectGraph` is a public export of `@ui5/project`. Developers can construct and use graphs directly without going through the CLI. This raises questions that are not fully resolved by the current implementation:

- A graph used as an API may **live longer than necessary** if the consumer does not call `destroy()`.
- The responsibility for calling `destroy()` falls on the API consumer, but there is no enforced contract. The current implementation relies on documentation and the `lockfile` signal-exit backstop.

These questions are captured in the Unresolved Questions section.

### Cleanup lock lifecycle

`ui5 cache clean` acquires `cache-cleanup.lock` before any deletion:

1. Acquire `cache-cleanup.lock` (async, no wait — if already held, the command was invoked twice concurrently).
2. Scan `~/.ui5/locks/` for any graph lock (excluding `cache-cleanup.lock` itself). If any non-stale graph lock exists, abort with a user-visible error.
3. Perform deletion (atomic rename of `framework/` + SQLite `clearAllRecords()`).
4. Release `cache-cleanup.lock`.

The framework installer (`AbstractInstaller._synchronize`) checks for `cache-cleanup.lock` after acquiring its own per-package lock. If the cleanup lock is active, the install is aborted with a clear error message.

### Staleness

Locks older than `LOCK_STALE_MS = 60000` ms are treated as dead (from a crashed process) and garbage-collected by `hasActiveLocks`. The mtime-refresh interval (`LOCK_REFRESH_INTERVAL_MS = LOCK_STALE_MS * 0.6 = 36000` ms) ensures a live lock is always refreshed before it appears stale.

### Sync vs async acquisition

Two variants are provided in `packages/project/lib/utils/lock.js`:

**Async (preferred):**

`acquireLock(lockPath, {wait, retries})` — asynchronous; non-blocking; supports `opts.wait` (poll up to N ms before giving up) and `opts.retryWait` (delay between retries). Multiple concurrent callers can queue without blocking the event loop. This is the correct choice for all code that can be async — in particular, for operations where lock contention is possible (e.g. multiple concurrent package downloads).

**Sync (only when async is impossible):**

`acquireLockSync(lockPath, {retries})` — synchronous; blocks the event loop for the duration of the acquisition. Its key benefit is that it makes lock acquisition atomic from the perspective of the current thread — no other JS code can run between the call and the return. This is the only viable option when:

- The call site is inside a **constructor** (JS constructors cannot be `async`).
- The call site is inside a **synchronous method** with no path to `async`.

The critical limitation of `lockSync` is that it **cannot wait** for a contended lock. The underlying `lockfile` library throws if `opts.wait` or `opts.retryWait` are passed to `lockSync`:

```
'opts.wait not supported sync for obvious reasons'
```

It either acquires immediately or throws. The only mitigation is `opts.retries` (a fixed-count retry loop, each blocking the event loop). This is acceptable only when the lock path is guaranteed unique per process (no realistic contention), such as a path encoding `{pid}-{randomHex}`.

### Release safety

Lock release must be guaranteed regardless of how control exits a protected section:

- The release function is **idempotent** — safe to call multiple times from both an explicit path and a `finally` block.
- All protected sections use `try { ... } finally { release(); }`.
- Async callbacks inside a lock must be `await`ed: `return await callback()`, not `return callback()`. Without `await`, the `finally` fires before the async work completes, releasing the lock prematurely.
- Abnormal termination is covered by the `lockfile` signal-exit handler.

### `hasActiveLocks` utility

```js
hasActiveLocks(ui5DataDir, {include?, exclude?})
```

Scans `~/.ui5/locks/` for non-stale lock files. The `include` and `exclude` options allow filtering by filename (e.g. exclude the caller's own lock when checking for others). Stale lock files are garbage-collected as a side effect.

## How we teach this

- The lock contract is documented in JSDoc on `ProjectGraph`, `_preventCacheClean()`, `acquireLockSync`, `acquireLock`, and `AbstractInstaller._synchronize`.
- Callers of `ProjectGraph` that build or serve (CLI commands, `BuildServer`) must call `graph.destroy()` when the graph is no longer needed to release the lock.
- The `ui5 cache clean` command displays a clear error when an active lock is detected, telling the user to stop running processes first.

## Drawbacks

- Adds a new runtime dependency (`lockfile`) and a new `~/.ui5/locks/` directory in the user's data dir.
- `ProjectGraph.destroy()` must be called explicitly. JS has no destructor; forgetting to call it leaks the lock until process exit (covered by the signal-exit backstop, but not ideal for long-lived processes).
- `ui5 cache clean` cannot protect against a build that started but has not yet reached `_preventCacheClean()` — there is a narrow startup window (~200–400 ms) where the race can be lost. The build recovers gracefully by re-downloading, but the user sees an unexpected full re-download.

## Alternatives

**In-process mutex:** Does not work — `ui5 build` and `ui5 cache clean` are separate OS processes.

**Single cleanup lock in the CLI command only:** Protects the clean operation but does not prevent an installer from running into a half-deleted `framework/` directory.

**No locking — atomic rename only:** The atomic rename of `framework/` prevents corruption of files already opened, but does not prevent a concurrent installer from writing into the newly-absent path between the rename and the installer's own lock acquisition.

**Keep framework locks at `~/.ui5/framework/locks/`:** Preserves backward compatibility with v4 (which writes installer locks there). A mixed v4+v5 scenario means v5's `cache clean` cannot see v4's installer locks — the worst case is a re-run of the v4 command. This is an open decision; see Unresolved Questions.

## Unresolved Questions and Bikeshedding

*This section should be removed (i.e. resolved) before merging*

1. **Lock granularity:** Should the lock live at the CLI command layer (`@ui5/cli`) or inside `@ui5/project`? Locking only in the CLI command misses programmatic API consumers; locking inside `@ui5/project` adds complexity to the library. The current design locks at the `ProjectGraph` level inside `@ui5/project`.

2. **Lock directory location — v4 compatibility:** v4 writes framework installer locks to `~/.ui5/framework/locks/`. v5 moved them to `~/.ui5/locks/`. The two versions are invisible to each other. Should v5 keep framework-installer locks at the old path for backward compatibility, placing only the new broader-scope locks (build, serve, cache-clean) in `~/.ui5/locks/`?

3. **`ProjectGraph` lock ownership for API consumers:** `ProjectGraph` is a public export. When a developer uses it directly (not via the CLI), who is responsible for acquiring and releasing the lock? Should `@ui5/project` always lock — even for read-only graph traversal — or should locking be opt-in? Should the library enforce explicit `destroy()` calls rather than relying on the signal-exit backstop? The current implementation locks unconditionally and documents the `destroy()` contract, but does not enforce it.

