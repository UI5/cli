# Windows `0xC0000005` pinpointing kit for `reinitialize.js`

`test/lib/server/reinitialize.js` exits with `3221225477` (`0xC0000005`, an **access
violation**) on Windows. That is a native crash in the AVA worker **child process**
(AVA runs each test file in a forked process — `workerThreads: false`), not a JS-level
test failure. The two native subsystems this test drives are:

- **`@parcel/watcher`** — the source watcher (`WatchHandler`) and the definition watcher
  (`ProjectDefinitionWatcher`). On Windows it runs a background `ReadDirectoryChangesW`
  thread; a watch thread outliving `unsubscribe()` or racing process exit is a classic
  `0xC0000005` source.
- **`node:sqlite`** (`BuildCacheStorage`) — opened with `PRAGMA journal_mode=WAL` and
  `PRAGMA mmap_size=268435456`. Closing a memory-mapped WAL database, or letting the
  process exit while pages are still mapped, can access-violate on Windows.

The branch already serialized `destroy()` against the in-flight swap and cancelled the
settle timer, yet the crash persists — which points at native teardown / process exit
rather than a JS race.

Run these probes on the Windows machine (from `packages/server`) and report the exit
code of each. `echo %ERRORLEVEL%` after each in cmd, or `$LASTEXITCODE` in PowerShell.
`3221225477` = the crash; `0` = clean.

```
node test/probes/probe-sqlite.mjs           # node:sqlite open/write/close, single handle
node test/probes/probe-sqlite-reopen.mjs    # two overlapping handles on one WAL+mmap db (the swap pattern)
node test/probes/probe-parcel.mjs           # @parcel/watcher subscribe/event/unsubscribe
node test/probes/probe-serve.mjs            # full serve() -> reinitialize() -> close(), no AVA
```

`probe-serve.mjs` prints staged markers (`serving` / `reinitialized` / `closed` /
`settled`). Note the last line printed before a crash:

- crash **before** `closed` → teardown while JS still running.
- `closed` + `settled` printed, crash **after** → exit-time native handle not released.
- exit 0 → the isolated lifecycle is clean; the trigger needs the AVA worker environment.

## Which probe crashed → where it originates

| Crashes | Clean | Origin |
|---|---|---|
| `probe-sqlite` | — | `node:sqlite` close (WAL checkpoint / mmap unmap) — single handle is enough |
| `probe-sqlite-reopen` | `probe-sqlite` | overlapping handles on one WAL+mmap db (the reinitialize swap) |
| `probe-parcel` | sqlite probes | `@parcel/watcher` native teardown / watch thread vs. exit |
| `probe-serve` | all component probes | interaction only visible in the full lifecycle |
| none | all | needs the AVA worker env (supertest sockets, `--loader`, concurrent files) |

## Bisecting the AVA subtests

`reinitialize.js` has three serial subtests. Run each alone to see which crashes:

```
npx ava test/lib/server/reinitialize.js -m "reinitialize() keeps the port bound*"
npx ava test/lib/server/reinitialize.js -m "editing ui5.yaml triggers*"
npx ava test/lib/server/reinitialize.js -m "reinitialize() without a graphFactory*"
```

Delete this directory once the origin is confirmed.

## Tracing the real (flaky) test's teardown

The crash is **flaky** — the test usually passes. So the probes (deterministic) won't
reproduce it; the trigger is a timing-dependent race in native teardown/exit. To catch
*which* native step is being torn down when it does crash, there is an env-gated
synchronous tracer wired into every teardown step:

- `Supervisor.destroy` (each phase: liveReload close, httpServer close, watcher destroy,
  buildServer destroy, httpClosed)
- `BuildServer.destroy` (watchHandler destroy, validation stop, active-build await, cache close)
- `ProjectDefinitionWatcher.destroy` / `WatchHandler.destroy`
- `drainSubscriptions` (each individual `@parcel/watcher` `unsubscribe()`)
- `CacheManager.close` (refcount, last-ref) / `BuildCacheStorage.close`
  (WAL checkpoint, then `db.close()`)

Each line is written with `fs.writeSync(2, …)` so it survives a hard segfault (unbuffered),
and is stamped with `process.hrtime.bigint()` + pid to order interleaved teardown.

Run the flaky test in a loop with tracing on until it crashes, capturing stderr. AVA
wraps the worker's native crash and reports its own exit code (non-zero, not the raw
`0xC0000005`), so stop the loop on **any** non-zero exit:

```
# PowerShell (repeat until AVA fails)
$env:UI5_TEARDOWN_TRACE = "1"
for ($i=0; $i -lt 50; $i++) {
  "===== iteration $i =====" | Tee-Object -Append trace.log
  npx ava test/lib/server/reinitialize.js --serial 2>&1 | Tee-Object -Append trace.log
  if ($LASTEXITCODE -ne 0) { "FAILED on iteration $i (exit $LASTEXITCODE)"; break }
}
```

The worker's exit code (the actual `3221225477` = `0xC0000005`) is usually printed by AVA
in its failure output as part of the "exited with a non-zero exit code" line, so it lands
in `trace.log` too. Then look at the **last `[teardown …]` line** in `trace.log`: an operation with a
`start` but no matching `done` is the one that segfaulted (e.g. `db.close() start` with no
`db.close() done`, or `unsubscribe #1 start` with no `unsubscribe #1 done`). That names the
exact native call to harden.

## Findings so far (Windows)

All four component probes exit **clean** (exit 0), including `probe-serve` (the full
serve → reinitialize → close lifecycle). So the crash is **not** in any native subsystem
in isolation, nor in a single lifecycle. That narrows the trigger to what the AVA worker
adds on top: the `supertest` request sockets, the `--loader=esmock` + `--import
suppressLog` worker flags, and three serial subtests sharing one worker process.

Next probes isolate those additions (run from `packages/server`):

```
node test/probes/probe-serve-supertest.mjs   # lifecycle + real HTTP requests (socket churn)
node test/probes/probe-serve-thrice.mjs       # three serve/reinitialize/close cycles in one process
```

Then bisect the real test under the actual AVA worker (loader + suppressLog + supertest):

```
npx ava test/lib/server/reinitialize.js -m "reinitialize() keeps the port bound*"
npx ava test/lib/server/reinitialize.js -m "editing ui5.yaml triggers*"
npx ava test/lib/server/reinitialize.js -m "reinitialize() without a graphFactory*"
```

- If a probe crashes → the addition it introduces (sockets / repetition) is the trigger.
- If all probes are clean but a single `-m` subtest crashes → that subtest's specifics
  (e.g. the watcher-driven edit, or the tmp-dir copy) are the trigger under AVA.
- If only the full file crashes but each `-m` subtest is clean → cross-subtest state in
  one worker (a handle from subtest N surviving into N+1) is the trigger.
