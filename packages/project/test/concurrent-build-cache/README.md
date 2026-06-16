# Concurrent build cache stress harness

Manual stress test for the SQLite build cache (`@ui5/project`) under multi-process
contention. Spawns N independent Node processes that each run a full project build
against a **shared** `cache.db`, and uses an HTTP barrier to release them all at
the SAME instant — guaranteeing they hit the SQLite writer lock concurrently
rather than relying on lucky timing.

## Why this exists

In-process `writeCache` calls cannot interleave their transactions because
`BuildCacheStorage#transaction(fn)` runs `fn` synchronously — the JS event loop
guarantees no other Promise observes the `BEGIN..COMMIT` window. Cross-process
is the only remaining contention surface, and it is bounded by SQLite's
`busy_timeout=5000`. This harness exercises that boundary on demand.

What it answers:
- Does any combination of parallel writers actually corrupt the DB? Should be
  no — WAL + locking handle that. Verified via `PRAGMA integrity_check`.
- Are the failure modes intelligible? Either every process commits successfully
  (idempotent rebuild) or some get a clean SQLITE_BUSY after 5 s.
- Are there any orphan rows after the dust settles (stage_metadata referencing
  CAS that never committed, or vice versa)?
- How much headroom does `busy_timeout=5000` give for realistic transaction
  sizes?

## Required source-tree instrumentation

The harness needs the build to pause _just before_ the DB transaction opens, so
that all peers can pile up on the writer lock simultaneously. Add this to
`packages/project/lib/build/cache/ProjectBuildCache.js`, immediately before the
`this.#cacheManager.transaction(() => { ... })` call inside `writeCache()`:

```js
if (process.env.UI5_BUILD_CACHE_BARRIER) {
    await fetch(process.env.UI5_BUILD_CACHE_BARRIER);
}
```

This is **test-only**. Strip before merging. The harness will warn if it spawns
workers without the hook present.

## Run

From the repo root:

```sh
node packages/project/test/concurrent-build-cache/run.js               # default: 4 workers, mutated content
node packages/project/test/concurrent-build-cache/run.js --workers=8   # heavier
node packages/project/test/concurrent-build-cache/run.js --extra-files=1000  # inflate cache write transaction (default 0)
node packages/project/test/concurrent-build-cache/run.js --shared      # all workers identical content (INSERT OR REPLACE on same rows)
node packages/project/test/concurrent-build-cache/run.js --mutate-during-build  # each worker mutates webapp/test.js mid-build (exercises SourceChangedDuringBuildError)
node packages/project/test/concurrent-build-cache/run.js --repeat=3     # 1 initial concurrent build + 2 cache-reuse rebuilds; cache must be byte-identical after each rebuild
node packages/project/test/concurrent-build-cache/run.js --no-barrier  # no synced release; sanity baseline
node packages/project/test/concurrent-build-cache/run.js --keep        # leave tmp + cache.db on disk
```

The harness:
1. Copies `application.a` (and its file: dependencies) into a tmp dir per run.
   With `--extra-files=N`, drops N tiny generated `.js` modules into
   `webapp/generated/` to inflate the cache write transaction so workers
   actually overlap on the writer lock (default 0). In `--mutate` mode each
   worker's `mod*.js` content is seeded with the worker id — same paths
   across workers, disjoint bytes — so every generated module becomes a
   distinct CAS row per worker. In `--shared` mode the generated content
   is identical across workers (preserving same-row contention).
2. **Default mode (`--mutate`):** gives each worker its own fixture copy and
   appends a unique line to `webapp/test.js`. Different content → different
   buildSignature → mostly-disjoint CAS rows + disjoint stage_metadata rows.
   Realistic CAS concurrency (each worker inserts new content rows; rows
   derived from unmutated files dedupe).
   **`--shared` mode:** all workers use one fixture root → identical signatures
   → all writeCache calls hit the SAME rows. Stresses INSERT OR REPLACE
   serialization on the writer lock.
   **`--mutate-during-build`:** layers on top of `--mutate`. Each worker
   schedules a timer that appends a *second* unique line to its own
   `webapp/test.js` 25–125 ms after build kickoff — so source files change
   WHILE the build is reading them. Expected outcomes per worker:
   - exit 0 (OK): the mutation landed before any source-stage hash was
     computed; build completes against the post-mutation content.
   - exit 4 (SOURCE_CHANGED): `SourceChangedDuringBuildError` was thrown;
     the build aborted cleanly without writing to the cache.
   - exit 3 (BUSY) or 1 (ERROR): same meanings as without the flag.
   Workers that exit 4 contribute zero rows; the verifier's row-count and
   per-worker-marker checks only track exit-0 workers, so atomicity and CAS
   integrity must hold across the mixed outcomes.
3. Starts an HTTP barrier server on a free port.
4. Spawns N workers, each pointed at the same `ui5DataDir`. They all build,
   hit the barrier, and get released in lockstep.
5. Collects exit codes / stderr / build durations.
6. Opens the resulting `cache.db` and verifies:
   - `PRAGMA integrity_check` and `PRAGMA foreign_key_check`
   - **Durability pragmas**: `journal_mode=wal`, `synchronous` ∈ {NORMAL, FULL}
   - **Every `content` row body actually hashes to its `integrity` key**
     (catches wrong-bytes-under-right-key — invisible to referential checks)
   - **PK uniqueness** on `content.integrity`, `stage_metadata`'s 4-tuple, and
     `result_metadata`'s 3-tuple
   - No `stage_metadata` row references a missing CAS integrity
   - No `result_metadata` row references a missing stage signature, and every
     result row carries a non-empty `stageSignatures` map (catches partial writes)
   - **Transaction atomicity**: every `(project_id, build_signature)` in
     `result_metadata` has matching `stage_metadata` rows; orphaned stage rows
     are flagged as warnings
   - **Distinct `build_signature` count matches successful workers** —
     `--mutate`: one per OK worker; `--shared`: 1 if any committed.
     Catches "worker exited 0 but its commit silently vanished".
   - **Per-worker content presence** (`--mutate` only): each OK worker's
     unique marker line in `webapp/test.js` must appear in some CAS row.
     Strictly stronger than the count check — proves no worker's bytes were lost.
   - **WAL drains cleanly** — re-open writable, run `wal_checkpoint(TRUNCATE)`,
     all three counters must be 0
   - No orphan content rows (warning only — not corruption, but unexpected
     ones may indicate aborted transactions leaking content)

Each check is reported on its own `[OK] <label>: expected X, got X` /
`[UNEXPECTED] <label>: expected X, got Y` line, and the final summary lists
every check that didn't match its expectation.

## Cache-reuse repeat (`--repeat=N`)

`--repeat=N` adds N-1 follow-up builds **after** the initial concurrent build,
against the **same** `ui5DataDir` and the **same** fixtures. The premise: once
the cache is populated, every subsequent build with unchanged sources must be
served entirely from cache and must NOT mutate any cache row.

The driver:
1. Computes a `sha256` fingerprint over every row of `content`,
   `stage_metadata`, and `result_metadata` (PK-ordered) right after the
   initial build's verifier passes.
2. Re-spawns all N workers concurrently for each repeat iteration (no
   barrier, no mid-build mutation).
3. After each repeat, recomputes the fingerprint. Any difference is reported
   as `[UNEXPECTED] cache mutated on repeat[…]` and counts toward
   `cacheMutatedOnRepeat` in the summary (fatal exit code).
4. Any worker that fails on a repeat is also unexpected — sources didn't
   change, cache is populated, the build should just succeed.

Incompatible with `--mutate-during-build` for the *first* repeat only — when
combined, mid-build mutation runs only during the initial concurrent build,
never on repeats. Workers that hit `SOURCE_CHANGED` on the initial build wrote
nothing, so the first repeat will legitimately add cache rows for the
post-mutation source content of those fixtures. The driver therefore captures
the cache fingerprint **after** repeat 1 (instead of after the initial build)
and asserts byte-stability across all subsequent repeats. Use `--repeat=3`+
to actually exercise the stability check in this mode.

## Files

- `run.js` — driver: spawns workers, runs the barrier, verifies cache.db
- `worker.js` — child process: runs one full build against the shared cache
- `verify.js` — opens cache.db, runs integrity + referential checks
