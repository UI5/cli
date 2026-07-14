# Lessons Learned — `ui5 cache clean`

This document captures what was learned building the "Clean cache command" so each topic can be broken down and decided individually later.

What started as a simple `rm -rf ~/.ui5/framework` replacement grew into a cross-package concurrency, lifecycle, and refactoring problem. The scope creep is the central lesson — every "simple deletion" of a shared resource pulls in coordination with every process that reads or writes it.

---

## 1. General locking and locks concept

### 1.1 Sync vs async lock

**Current state:** The codebase uses mostly the async variant from [`packages/project/lib/utils/lock.js`](../packages/project/lib/utils/lock.js):

**Why sync was needed in the first place:** There are places where async
acquire is simply not possible: constructors, synchronous methods, etc. 
The strong side of having a synchronous lock mechanism is that it also
locks the main thread, so there is no possibility for any race conditions.

**The hard problem with `lockSync`:** The `lockfile` library itself makes the limitation explicit — if you pass `opts.wait` or `opts.retryWait` to `lockSync`, it throws:

```
'opts.wait not supported sync for obvious reasons'
```

This means a sync lock **cannot wait** for a contended lock to become free. It either acquires immediately or throws. The only mitigation is `opts.retries` (fixed-count retries, each blocking the event loop). This works only when:
- The lock path is unique per process (no realistic contention), or
- A brief blocking retry loop is acceptable.

`ProjectGraph` uses a unique path per-process-per-instance (`graph-{pid}-{randomHex}.lock`), so contention is impossible and `retries` is not needed. But this constraint is fragile — it relies on the path being unique rather than on a genuine no-contention guarantee.

**Async `lock()` advantages that sync lacks:**
- `opts.wait` — polls for up to N ms before giving up, without blocking the event loop.
- `opts.retryWait` — configurable delay between retries.
- Non-blocking: other async tasks can continue while waiting.

**Lesson:** Sync locks are error-prone by design — they block the event loop and cannot wait for contention to resolve. They should only be used in narrow cases where the lock path is guaranteed unique (no contention possible) and the call site is genuinely sync-only with no path to async.

### 1.2 Where to lock

**What we did:** The lock scope moved several times during the PR:
- First only around per-package **downloads**.
- Then discovered a second window: the **install** phase (copying files into the cache) was unprotected.
- Then extended to cover the **whole `ProjectGraph` lifecycle** (construction → build/serve → destroy), because the graph holds live references to framework paths *after* download completes.

The final answer: the graph is the coordination unit. `_preventCacheClean()` is called from `enrichProjectGraph` (framework resolution) and again from `build()`/`serve()` — guarded by an idempotency check so only one lock exists per instance.

**Lesson:** "Where to lock" is really "what is the unit of work that holds the resource?" We kept finding new windows because we were thinking in terms of individual operations (download, install) rather than the lifetime of the consumer (the graph). The right question is *"who is using the files, and for how long?"* — not *"which function deletes/writes them?"*

**Open question:** Granularity of the lock! Wouldn't it be easier to simply lock the command in `@ui5/cli` i.e. `cache clean`? But what about if some process uses the `@ui5/project`'s API standalone in parallel? This way we lock the command, but not the API itself. The answer can be found when we agree on the Lesson above.

### 1.3 How to lock

**What we did:** Chose the `lockfile` npm package (file-based advisory locks in `~/.ui5/locks/`) over an in-process mutex, because coordination must span **separate OS processes** (`ui5 build`, `ui5 serve`, `ui5 cache clean`, and external `@ui5/*` API consumers), not just async tasks in one process.

Key mechanics we had to get right:
- **Staleness** (`LOCK_STALE_MS = 60000`): a crashed process must not deadlock everyone forever. `hasActiveLocks` treats older-than-stale locks as dead and garbage-collects them.
- **mtime refresh** (`LOCK_REFRESH_INTERVAL_MS = LOCK_STALE_MS * 0.6`): a long-running server would otherwise look "stale" after 60s and get its lock stolen. An interval refreshes the mtime; `interval.unref()` so it doesn't keep the process alive.
- **Acquire-then-check ordering** (TOCTOU): the cache clean must acquire its cleanup lock *first*, then check `hasActiveLocks`, so a concurrently starting installer is guaranteed to see one of the two locks.

**Lesson:** File-based cross-process locking has a surprising number of correctness traps (staleness vs. refresh vs. the check/acquire order). A from-scratch concept should treat these as first-class requirements.

### 1.4 How to release to prevent deadlocks

Lock release must be guaranteed regardless of how control exits a protected section. Multiple safety layers are needed because a stranded lock is worse than no lock:

- **Make release idempotent** — the release function should be safe to call multiple times (e.g. from both an explicit early-exit path and a `finally` block). Without idempotency, double-release either throws or corrupts state.
- **Always use `try/finally`** — any exception, early return, or branch that bypasses an explicit `release()` call is a latent deadlock. The `finally` block is the only reliable guarantee.
- **Await async work inside the lock** — if the protected section is async, the `finally` must not run until the work resolves. `return callback()` inside a `try/finally` releases the lock immediately when the Promise is returned, before it settles. The correct form is `return await callback()`.
- **Explicit release + automatic backstop** — graceful shutdown calls `release()` explicitly. Abnormal termination (signals, crashes) is covered by the `lockfile` library's signal-exit handler, which removes all known locks on process exit. Neither alone is sufficient.

**Lesson:** Deadlock prevention is layered: idempotent release + `try/finally` + `await` discipline + signal-exit backstop. Each layer covers a failure mode the others miss. The `await` mistake in particular is subtle — a single dropped keyword looks harmless but silently allows concurrent access to the protected resource.

**Lifecycle / cleanup ownership of `ProjectGraph`.** JS has no destructor; the graph relies on an explicit `destroy()` plus `lockfile`'s signal-exit backstop. `BuildServer` and CLI commands (`tree.js`, `build.js`) must remember to call `destroy()`. This "who calls destroy, and when" question is a real design gap that spans the whole `ProjectGraph` public API — arguably bigger than the locking topic itself.

---

## 2. Performance & UX

### 2.1 What information to display to the end user

**What we did — and reversed twice:**
- v1: show **byte size** of the cache. For big caches it might take significant amount of time to compute the size. Native OS variants are also slow and for different platforms there are different tools.
- v2: show **file count** — still slow (traversal of ~2M files) and "2 million files" is meaningless to a user.
- v3 (final): show **"X versions of Y libraries"** — a shallow directory traversal (project → library → version), fast and meaningful.

We also added: a pre-confirmation summary, a `--yes` flag and a post-clean success line.

**Lesson:** "How much will this free?" is expensive to answer accurately and not even what the user cares about. The useful signal was *what* is being removed (libraries/versions), not *how many bytes*. We spent significant effort computing a number we ultimately threw away. **Decide the UX metric before implementing the measurement.**

### 2.2 What, where, and how to purge data

Three distinct storage layers each needed a different purge strategy:

- **Memory** — `cacache`'s in-process memoization. Cleared via `clearMemoized()` (global, synchronous) before the rename.
- **DB** — the SQLite build cache (`buildCache/v0_7/cache.db`). Cleaned via `clearAllRecords()` inside a transaction. Crucially, we made it **version-aware**: only the current `CACHE_VERSION` is purged, because we cannot know the schema of a future cache version ("wipe everything" is not robust across schema versions). The DB *file* is intentionally kept; only records are deleted.
- **File system** — the `framework/` directory. We adopted an **atomic-rename-then-delete** strategy: rename `framework/` → `.framework_to_delete_<hash>/` (one fast syscall, makes the path disappear instantly), release the lock, then delete the staging dir outside the lock. This minimizes lock-hold time and lets a concurrent build see the path as simply absent.

The rename strategy introduced a new concept: **orphaned staging dirs** (a clean interrupted after rename but before delete). We added `cleanAdditional()` to sweep these up independently — they're safe to remove any time, outside the lock.

**Lesson:** Three storage backends = three purge semantics. The atomic rename was the key insight for the file system (short lock, no corruption), but it *created* a new failure mode (orphans) that needed its own cleanup path. Every optimization added a corner. The DB version-awareness is a genuinely important correctness constraint that should survive into any future concept.

---

## 3. Refactoring

### 3.1 DRY — installers: consolidate locking

**What we did:** `AbstractInstaller` (base for npm + maven installers) now imports the shared lock utilities instead of promisifying `lockfile` inline per call. `_synchronize` centralizes: acquire → check-for-cleanup → run callback → release.

**Open item flagged during review:** The `framework/` directory name is still hardcoded in each installer rather than abstracted in `AbstractInstaller`. The clean concern and the install concern both know about `framework/` independently. The proposed direction: abstract the `framework/` location and the locking into `AbstractInstaller`, then have the cache cleaner reuse that knowledge — so there's one source of truth for "where framework files live and how they're locked."

**Lesson:** The installers and the cleaner are two sides of the same resource but evolved in different namespaces (`ui5Framework/` vs the CLI command). They share path + lock knowledge but not code.

### 3.2 Resolution of UI5 data dir

**What we did:** Introduced [`resolveUi5DataDir()`](../packages/project/lib/utils/dataDir.js) as the single resolver (env var → config → `~/.ui5` default, always returns an absolute path). Removed a duplicate `getUi5DataDir` from `packages/cli/lib/framework/utils.js`.

**Still inconsistent (flagged):** Resolution still happens **in-place** in a few spots. The Resolvers/Installers (e.g. `Openui5Resolver`) keep a fallback `ui5DataDir || path.join(os.homedir(), ".ui5")` because they're publicly exported and can be called without a pre-resolved dir. So there isn't *one* resolution path — there's a util plus defensive fallbacks at the public API boundary.

**Lesson:** "One utility" isn't the same as "one resolution path." Public API entry points force defensive fallbacks. A clean concept needs to decide: is `ui5DataDir` resolved once at the outermost boundary and threaded through, or resolved lazily wherever needed? We have a mix, and the mix is the problem. This also introduced backward incompatibilities.

### 3.3 Location of cached resources, locks, etc.

**What we did:** Consolidated all lock files into `~/.ui5/locks/` (previously `~/.ui5/framework/locks/`). As the lock scope grew beyond framework (to build/serve/cleanup), a framework-scoped lock dir no longer made sense.

**Lesson:** The lock directory location is a consequence of lock *scope*. When scope expanded, the location had to move. This is a symptom of the same root issue: scope kept growing, and physical layout followed reactively.

**Open question (RandomByte):** Moving all locks to `~/.ui5/locks/` creates a **compatibility concern** with previous CLI versions that still write framework-installer locks to `~/.ui5/framework/locks/`. If a user runs two CLI versions in parallel — e.g. a project pinned to an older version alongside a global newer version — the old version won't see the new locks and vice versa.

One option is to keep framework-dependency-related locks under `~/.ui5/framework/locks/` and only place new, broader-scope locks (build, serve, cache-clean) under `~/.ui5/locks/`. This would preserve backward compatibility for the installer lock path while still enabling the new coordination locks.

**Analysis of mixed-version scenarios:** The actual cross-version impact is more limited than it first appears. Locks are only meaningful when shared between cooperating processes of the *same* version. The mixed-version scenarios break down as:

- **v5 only or v4 only** — nothing breaks; everything works as expected.
- **v4 and v5 in parallel** — v5's `cache clean` is the only command that uses the new lock dir. v5's locks will not prevent v4 from downloading or installing framework resources (v4 doesn't know about `~/.ui5/locks/`). The only real clash is: running v5's `cache clean` while v4's `serve` or `build` is active. In the worst case, some framework resources are deleted mid-use and the v4 command must be re-run. 

**Remaining decision:** Is the v4+v5 concurrent-clean risk acceptable, or does it warrant keeping framework locks at their old path? The risk is bounded (a re-run is sufficient recovery), but it is user-visible.

---

## Summary

Every sub-topic in the comment traces back to one root: **deleting a shared resource forces you to model every reader and writer of that resource, across processes, for their full lifetime.** The complexity wasn't in the deletion — it was in proving nobody else is mid-flight. Restarting the concept should begin from that model (who owns the framework cache, its lock contract, and its lifecycle), and let the command, the installers, and the graph consume that one contract — rather than each discovering the coordination need independently, which is how we got here.
