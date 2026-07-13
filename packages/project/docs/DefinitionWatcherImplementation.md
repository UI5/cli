# Implementation Plan: DefinitionWatcher

- Status: Draft / for discussion
- Affected components: `@ui5/project` (new `lib/build/helpers/DefinitionWatcher.js`), `@ui5/server`
  (`lib/ServeSupervisor.js`)
- Depends on: the `ServeSupervisor` re-init machinery (shipped in
  `feat(server): Re-create the serving stack on definition changes`)

## Context

`ServeSupervisor.reinitialize()` re-creates the whole serving stack (graph + Express app + BuildServer)
behind a stable `http.Server`, and is already correct and tested. What is missing is the **trigger**: today
`reinitialize()` is only callable programmatically, so a `git checkout` or a hand-edit of `ui5.yaml` still
does not refresh a running server.

This iteration adds the `DefinitionWatcher` — a watcher, separate from the source `WatchHandler`, that
subscribes to the project-definition files and calls `supervisor.reinitialize()` when one changes. The two
watchers feed deliberately different pipelines: source events drive incremental rebuilds inside the
`BuildServer`; definition events drive a full re-init above it.

**Decisions (settled):**
- **Placement:** `@ui5/project`, as a build helper (`lib/build/helpers/DefinitionWatcher.js`), exported via
  a new package subpath the way `build/cache/Cache` is. `@ui5/project` already depends on `@parcel/watcher`
  and owns the config-path resolution logic; `@ui5/server` already depends on `@ui5/project`, so the
  supervisor can import it. No new dependency, no duplicated config-path knowledge.
- **Mechanism:** `@parcel/watcher` subscribed to each project's **root directory** with ignore globs,
  filtering change events down to the definition filenames. One watch technology across the codebase; reuses
  `WatchHandler`'s recovery and settle discipline rather than introducing a parallel `fs.watch` code path.

## What is a definition file

Per the scoping in the concept work, the watch targets are:

| File | Location | Discovery |
|------|----------|-----------|
| `ui5.yaml` (or the `--config` path for the root) | each project root | `project.getRootPath()` + config filename |
| `package.json` | each project root | `project.getRootPath()` |
| `ui5-workspace.yaml` | cwd (root project) | `workspaceConfigPath`, default `ui5-workspace.yaml` |

`getRootPath()` (`Specification.js:242`) returns each project's on-disk path — the directory to subscribe.
Per-project config filename is `ui5.yaml` by default; only the **root** may carry a custom `--config` path
(`rootConfigPath`, resolved in `graph.js` via `utils.resolveConfigPath`). The root's custom config path and
the workspace config path are not derivable from the graph alone, so they must be threaded in (see
"Parameters" below).

Lockfiles (`package-lock.json` &c.) are **out of scope** for this iteration: they churn alongside
`node_modules`, and a dependency bump that matters also moves `package.json`.

## Design overview

```
ServeSupervisor.create()                 @ui5/project
  after the initial stack is built ─────▶ DefinitionWatcher.create({graph, rootConfigPath,
                                             workspaceConfigPath})
                                              │  subscribe @parcel/watcher to each project root,
                                              │  ignore node_modules/dest/.git, filter to defn files
                                              ▼
  supervisor.#onDefinitionChanged() ◀──── emits "definitionChanged" (settled, coalesced)
        │
        ▼
  supervisor.reinitialize()  ── build-new-then-swap (already implemented)
        │
        └─ after a successful swap: DefinitionWatcher is re-targeted to the NEW graph
           (project set / paths may have changed), watching the new roots
```

The watcher is **owned by the supervisor**, not by the `BuildServer`: it must outlive individual
`BuildServer` instances (which are destroyed on every swap) and it must be re-targeted after each swap
because the new graph may add/remove projects or move their roots.

## Changes

### 1. `packages/project/lib/build/helpers/DefinitionWatcher.js` (new)

`class DefinitionWatcher extends EventEmitter`, modeled on `WatchHandler.js`:

- **`static async create({graph, rootConfigPath, workspaceConfigPath})`** — resolve the watch set, subscribe,
  await readiness, return the watcher. Mirrors `BuildServer.create` awaiting `WatchHandler` readiness so a
  change immediately after startup is not missed.
- **Resolve the watch set:**
  - Traverse `graph.traverseBreadthFirst()` collecting each `project.getRootPath()`.
  - Map each root to the set of definition filenames to react to: `package.json` always; `ui5.yaml` for
    every project **except** the root when `rootConfigPath` names a custom file — in that case watch the
    resolved `rootConfigPath` instead (it may live outside the root, so subscribe its containing directory).
  - Add `workspaceConfigPath` (resolved against cwd; default `ui5-workspace.yaml`) when workspace resolution
    is active.
  - De-duplicate directories: several projects can share a root's parent, and monorepo layouts put many
    `package.json` files under one tree. Subscribe each **distinct** directory once; keep a
    directory → {absolute definition file paths} map for filtering.
- **Subscribe** (per distinct directory), following `WatchHandler._watchProject`:
  ```js
  const subscription = await parcelWatcher.subscribe(dir, (err, events) => { ... }, {
      ignore: ["**/node_modules/**", "**/.git/**", destPath && `${destPath}/**`].filter(Boolean)
  });
  ```
  `@parcel/watcher` subscribes to directories, so the ignore globs keep `node_modules`/build output from
  flooding the callback. **Note:** `dest` is a build concept; for `serve` there is no dest on disk, but the
  ignore list should still exclude common output dirs defensively. The change handler then filters:
  `if (!this.#watchedFiles.has(event.path)) return;` before emitting.
- **Emit `"definitionChanged"`** (not `"change"`, to distinguish from `WatchHandler`) with
  `{eventType, filePath}` after the **settle** window (below).
- **Settle / coalesce.** A `git checkout` writes `ui5.yaml` + `package.json` + sources within one operation;
  the settle window collapses that burst into **one** re-init. Reuse the discipline already tuned for
  sources: a trailing settle timer reset on each further event, sized **≥ `@parcel/watcher`'s 500 ms
  `MAX_WAIT_TIME` coalescing cap** so a multi-batch operation collapses. `BuildServer` already uses 550 ms
  (`ABORTED_BUILD_RESTART_SETTLE_MS` / `SOURCES_CHANGED_SETTLE_MS`); adopt the same constant. Unlike the
  live-reload emit, re-init has no need for a leading edge — trailing-only is correct (never re-init on the
  first byte of a checkout).
- **`error` recovery.** Mirror `BuildServer.#recoverWatcher`: on a watcher `error`, tear down and
  re-subscribe with loop protection (`WATCHER_RECOVERY_MAX_ATTEMPTS` = 5 within
  `WATCHER_RECOVERY_WINDOW_MS` = 60000). Share the constants' intent; whether to share a single escalation
  budget with the source watcher is an open question (below).
- **`async destroy()`** — drain `#subscriptions` (set to `[]` first so a second destroy is a no-op),
  `Promise.allSettled` the `unsubscribe()` calls, aggregate failures into an `AggregateError` emitted as
  `"error"`. Identical to `WatchHandler.destroy`.

### 2. `packages/project/package.json`

Add a subpath export alongside `./build/cache/Cache`:
`"./build/helpers/DefinitionWatcher": "./lib/build/helpers/DefinitionWatcher.js"`.

### 3. `packages/server/lib/ServeSupervisor.js`

Wire the watcher into the supervisor lifecycle:

- **Thread parameters.** `create()` / the config needs `rootConfigPath` and `workspaceConfigPath` so the
  watcher can locate a custom root config and the workspace file. These originate in `argv` and must be
  passed through `serve()` into the supervisor config. The `graphFactory` closure already captures them; add
  them as explicit config fields (`rootConfigPath`, `workspaceConfigPath`) rather than reaching into the
  closure.
- **Start the watcher after the initial bind** (in `#init`, after `announceListening`): only when a
  `graphFactory` is present (no factory → re-init is a no-op → a watcher would be pointless). Guard behind a
  config flag if a "no-watch" mode is wanted (e.g. tests): default on for `serve`.
  ```js
  if (this.#graphFactory) {
      this.#definitionWatcher = await DefinitionWatcher.create({
          graph, rootConfigPath, workspaceConfigPath
      });
      this.#definitionWatcher.on("definitionChanged", () => this.reinitialize());
      this.#definitionWatcher.on("error", (err) => log.warn(`Definition watcher error: ${err.message}`));
  }
  ```
- **Re-target after a successful swap.** In `#swap()`, after adopting `newStack`, destroy the old watcher and
  create a fresh one over `newGraph` (project set/paths may have changed). The new watcher must be built from
  the same `newGraph` the new stack serves:
  ```js
  // after this.#relayFrom(newStack.buildServer) and before/after destroying oldStack.buildServer
  const oldWatcher = this.#definitionWatcher;
  this.#definitionWatcher = await DefinitionWatcher.create({graph: newGraph, rootConfigPath, workspaceConfigPath});
  this.#definitionWatcher.on("definitionChanged", () => this.reinitialize());
  this.#definitionWatcher.on("error", (err) => log.warn(...));
  await oldWatcher?.destroy();
  ```
  A watcher-create failure during swap must not crash the swap — route it like a build failure (keep serving,
  log). **Open question:** the `newGraph` is currently built inside `#swap` via `graphFactory`; passing it to
  the watcher is a small refactor to keep the reference.
- **Re-entrancy.** `reinitialize()` already collapses overlapping calls into one trailing pass. A definition
  change that fires while a re-init is in flight therefore coalesces correctly — but confirm the watcher's own
  settle window plus the re-init guard don't double-fire. The settle window should absorb the checkout burst
  before the first `reinitialize()` is even called.
- **`destroy()`** — add `await this.#definitionWatcher?.destroy()` to the teardown, before/after the
  BuildServer destroy. Order it so a definition event cannot arrive mid-teardown and start a re-init after
  `#destroyed` is set (the `reinitialize()` guard already no-ops when `#destroyed`, so this is belt-and-braces).

### 4. `packages/server/lib/server.js` and `packages/cli/lib/cli/commands/serve.js`

- `server.js`: add `rootConfigPath` / `workspaceConfigPath` to the config object passed to
  `ServeSupervisor.create` (additive; existing callers omit them → watcher still works for default layouts,
  degrades to watching `ui5.yaml`/`package.json` at project roots).
- `serve.js`: pass `argv.config` as `rootConfigPath` and `argv.workspaceConfig` (default `ui5-workspace.yaml`)
  as `workspaceConfigPath` into `serverConfig`. These already feed `buildGraph`; now they also feed the
  watcher.

## Interaction with `--dependency-definition` (static graphs)

When the graph is built from `graphFromStaticFile` (`argv.dependencyDefinition`), the static dependency file
**itself** becomes a definition-watch target: editing it changes topology exactly like `package.json` does.
Add the resolved `dependencyDefinition` path to the watch set when present. This is a small addition to the
watch-set resolution (a single extra file at cwd) and keeps the static-graph mode consistent with the
package-dependencies mode.

## Tests

- **`packages/project/test/lib/build/helpers/DefinitionWatcher.js`** (new; AVA + esmock + sinon, mocking
  `@parcel/watcher`):
  1. **Watch-set resolution** — a fake graph with a root + two dependencies yields subscriptions to the
     distinct roots; the filter map contains each `ui5.yaml` and `package.json`; a custom `rootConfigPath`
     replaces the root's `ui5.yaml` and subscribes its containing directory; `ui5-workspace.yaml` is included
     when `workspaceConfigPath` is set; `dependencyDefinition` is included when provided.
  2. **Filtering** — an event for a non-definition file (a source file, a `node_modules` path) does not emit;
     an event for a watched `ui5.yaml` does.
  3. **Settle/coalesce** — a burst of events (checkout: `ui5.yaml` + `package.json` + a source) within the
     window emits `definitionChanged` exactly once; a later event after the window emits again.
  4. **Error recovery** — a watcher `error` tears down and re-subscribes; loop protection stops after N
     attempts inside the window.
  5. **destroy** — unsubscribes all, is idempotent, aggregates unsubscribe failures into `error`.
- **`packages/server/test/lib/server/ServeSupervisor.js`** (extend):
  - Watcher is created on `create()` only when a `graphFactory` is present; a `definitionChanged` event
    triggers `reinitialize()`; the watcher is re-targeted to the new graph after a swap (assert the old
    watcher is destroyed and a new one created over `newGraph`); `destroy()` tears the watcher down. Mock
    `DefinitionWatcher` via esmock so these stay unit-level.
- **`packages/server/test/lib/server/reinitialize.js`** (extend, integration): with a real graph, write a
  change to the fixture's `ui5.yaml` and assert the server re-inits and continues serving on the same port.
  Guard against fixture mutation leaking across tests (copy the fixture to `test/tmp` first, or restore the
  file in `afterEach.always`).

## Verification

- **Unit:** `npm run unit --workspace=@ui5/project` and `npm run unit --workspace=@ui5/server`
  (single file: `npx ava test/lib/build/helpers/DefinitionWatcher.js` from `packages/project`).
- **Lint:** `npm run lint --workspace=@ui5/project --workspace=@ui5/server --workspace=@ui5/cli`.
- **End-to-end (manual, `/run`):** `ui5 serve` in a sample app, then:
  (a) edit `ui5.yaml` (a `customMiddleware` entry and a build/task option) → the served result reflects the
      new config, live-reload clients reload, the port is unchanged;
  (b) `git checkout` a branch that moves `ui5.yaml` + `package.json` + sources → exactly **one** re-init
      fires (settle window collapses the burst), not one per file;
  (c) a deliberately broken `ui5.yaml` → the last-good app keeps serving (build-new-then-swap), and a
      subsequent valid edit swaps in cleanly;
  (d) `--dependency-definition` mode: edit the static file → re-init fires.

## Open questions

- **Watcher escalation budget.** Share a single recovery loop-protection budget with the source `WatchHandler`,
  or keep the `DefinitionWatcher`'s own? Separate budgets are simpler to reason about; a shared budget better
  models "the filesystem is misbehaving" as one condition.
- **Ignore-glob completeness.** `@parcel/watcher` root-directory subscription needs correct ignores. `serve`
  has no on-disk dest, but a project's configured build output dir (if it exists on disk from a prior `ui5
  build`) should be ignored to avoid re-init storms. Derive the ignore set from project config, or use a
  fixed list (`node_modules`, `.git`, `dist`, common output names)?
- **Re-target timing in `#swap`.** Building the new watcher over `newGraph` requires holding the `newGraph`
  reference through the swap; confirm the cleanest insertion point relative to the existing
  `oldStack.buildServer.destroy()`.
- **Debounce vs. in-flight re-init.** Verify the watcher settle window + `reinitialize()`'s trailing-pass
  guard compose without a redundant second re-init when edits continue during a swap.
