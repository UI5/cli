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
