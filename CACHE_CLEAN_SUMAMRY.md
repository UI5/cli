# Lessons Learned — `ui5 cache clean`

This document captures what was learned building the "Clean cache command" so each topic can be broken down and decided individually later.

What started as a simple `rm -rf ~/.ui5/framework` replacement grew into a cross-package concurrency, lifecycle, and refactoring problem. The scope creep is the central lesson — every "simple deletion" of a shared resource pulls in coordination with every process that reads or writes it.

---

## 1. General locking and locks concept

The complete locking design is documented in [doc-process-coordination-locks.md](./doc-process-coordination-locks.md). That document covers: why file-based locks are needed (separate OS processes), why the `lockfile` package was chosen, the two lock types (graph lock and cleanup lock), their lifecycles, staleness and mtime refresh mechanics, sync vs async acquisition trade-offs, release safety rules, and open questions around `ProjectGraph` ownership and v4 backward compatibility.

**What we struggled with and learned:**

Locking turned out to be the hardest part of this feature. We kept discovering new unprotected windows — first only downloads, then installs, then the whole graph lifetime. The core lesson was a shift in framing: **"where to lock" is really "who holds the resource, and for how long"** — not "which function writes or deletes it." Once we identified `ProjectGraph` as the right lock owner (it holds live references for its entire lifetime), the rest followed.

The other recurring challenge was getting release right. Every early-exit path and every async callback inside a protected section is a potential deadlock. We introduced a regression during the PR by dropping a single `await` keyword — `return callback()` instead of `return await callback()` — which released the lock before the async work finished. This kind of bug is silent and hard to spot in review.

The open questions that still need team decisions are in [Unresolved Questions](./doc-process-coordination-locks.md#unresolved-questions-and-bikeshedding) of the RFC.
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
