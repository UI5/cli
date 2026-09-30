# Implementation Plan: Step-Based Build Tasks (Phase A)

Self-contained plan for an implementing agent starting in a fresh session. Phase A replaces the `taskUtil.processEach` inline-callback API with a step-factory task API, on the **existing one-stage-per-task caching model**. Phase B (each step becomes its own stage) is deferred and described in `0019-implementation-phase-b.md`.

Branch: `feat/step-cache-api-redesign`. Breaking changes are fine (the incremental build feature is unreleased). Do NOT bump `CACHE_VERSION` (a constant in `packages/project/lib/build/cache/CacheManager.js`, maintained separately by the repository owner). Cache metadata shape may change freely.

## Before you start: required reading

1. Invoke the `incremental-build` skill and read its `architecture.md` in full. It is the architecture reference for the whole caching system.
2. Read these source files, which this plan modifies:
   - `packages/project/lib/build/helpers/ProcessEach.js` (the current per-step driver; you evolve this)
   - `packages/project/lib/build/TaskRunner.js` (`_addTask`, `_createCustomTaskWrapper`; the loader)
   - `packages/project/lib/build/helpers/MonitoredTaskUtil.js` (per-step input/tag monitoring)
   - `packages/project/lib/build/cache/ProjectBuildCache.js` and `BuildTaskCache.js` (persistence: the index-cache `tasks` array, `getProcessEachInvocationData`/`setProcessEachInvocationData`, `task_metadata` type `"processEach"`, `recordTaskResult` delta re-key)
   - `packages/project/lib/build/definitions/library.js` and `application.js` (standard task metadata; other definitions too)
   - `packages/project/lib/specifications/extensions/Task.js` (custom-task exports/callbacks)
   - `packages/builder/lib/tasks/taskRepository.js` (standard task loading)
   - The 8 tasks to migrate under `packages/builder/lib/tasks/`: `minify.js`, `buildThemes.js`, `generateThemeDesignerResources.js`, `enhanceManifest.js`, `escapeNonAsciiCharacters.js`, `replaceBuildtime.js`, `replaceCopyright.js`, `replaceVersion.js`
3. On `main`, `supportsDifferentialBuilds` was the flag you are restoring and renaming to `stepBased`. Inspect it with `git show 962e32afb1` and `git show 10b1548a02` (the commits that removed it on this branch) to see the exact plumbing (definition flag, custom-task callback gated at Spec 5.0, threaded into `BuildTaskCache`/`ResourceRequestManager`, persisted in the index-cache `tasks` array).

Do NOT reference the RFC document (`rfcs/0019-step-based-build-tasks.md`) in code or commit messages; it is scratch and will be deleted. Architecture changes are reflected in the `incremental-build` skill's `architecture.md`.

## The locked API

- **Task module**: a step-based task default-exports a factory `build(options) => Step[]`. A legacy task default-exports `({workspace, dependencies, taskUtil, options}) => Promise` unchanged.
- **Discriminator** `stepBased` (restored + renamed `supportsDifferentialBuilds`, opt-in polarity): absent means legacy. Standard tasks set `stepBased: true` in their build-definition entry; custom tasks declare it via the task extension, gated at Specification Version 5.0.
- **Step shapes**:
  - scalar: `{name, needs?, run}` where `run: async ({needs, workspace, dependencies, taskUtil, options}) => value?`
  - map: `{name, needs?, sequential?, keys, each}` where `keys: async ({needs, workspace, dependencies, taskUtil, options}) => keySet` and `each: async (key, {needs, workspace, dependencies, taskUtil, options}) => value?`
- **Wiring**: `needs: ["stepA", "stepB"]` lists earlier step names; their returns arrive as `needs.stepA`, `needs.stepB`. A step may reference only earlier steps (array order is a valid execution order).
- **Returns**: a step may return resources (stored in CAS by integrity, as today) or a serializable value (persisted with the step's invocation data). Either is injected into consumers via `needs.<name>`. The return signature (resource integrity, or the serialized value) folds into each consumer's tracked inputs so a changed producer return re-runs the consumer.
- **Keys**: resources (path + integrity) or strings; compound keys as stable strings. `keys` runs every build through recording readers; its reads fold into the map step's request set.
- **Execution**: steps run in array order. Map keys run concurrently by default (writes buffered, flushed in key order, same-path write throws) or `sequential: true` (writes visible to later keys immediately). Abort checked between units.
- **Factory purity contract** (documented, not enforced in Phase A): the factory body must be pure over `options`; env/graph/time are read inside a step via `taskUtil`.

## Resolved design details

- **`registerCleanupTask`** stays available on the per-step `taskUtil`. A cached step never created the resource needing cleanup, so no registration is needed that build. `buildThemes` keeps its `taskUtil.registerCleanupTask(...)` call inside the step that creates the worker pool.
- **`minify` worker toggle**: replace the direct `process.env.UI5_CLI_NO_WORKERS` read with `taskUtil.getEnv("UI5_CLI_NO_WORKERS")` inside the step, so it is a tracked input.
- **`keys` context** includes `taskUtil` (symmetry with `each`); its non-resource inputs fold into the map step like a task-level read.

## Commit sequence

Each numbered item is one or more commits directly to the branch. Keep the test suite green per commit where feasible (`npm run unit --workspace=@ui5/project` and `--workspace=@ui5/builder`). Conventional-commit subjects, sentence-case, scoped to the package.

### 1. Step runner core (`feat(project)`)

Evolve `ProcessEach.js` into a step runner (rename to `packages/project/lib/build/helpers/StepRunner.js`; rename the test `packages/project/test/lib/build/helpers/ProcessEach.js` accordingly). It takes an ordered step list plus the same bindings `ProcessEach` takes today (monitored `workspace`/`dependencies`, `cacheInfo`, previous invocation data, return-value store, `resolveInputValue`, `applyTagOperations`, `signal`) and:

- Runs scalar and map steps in array order. A scalar step is a single implicit key; a map step enumerates keys via `keys()` then runs `each` per key. Reuse the existing `StepRecorder`/`RecordingReader`/`RecordingReaderWriter` and per-step `MonitoredTaskUtil` machinery for reads, inputs, tags.
- Threads `needs`: before running a step, build a `needs` object from the recorded returns of the steps it names, and pass it in the step context. Persist each step's return.
- Supports both return kinds: keep the current CAS path for resource returns; add a serializable-value path (persist the value in the invocation entry). Record a consumer's consumed returns as tracked inputs (type e.g. `"needs"`, name = producer step) with the return signature as value, so `#selectStepsToRun` re-runs a consumer when a producer's return changed.
- Keeps delta selection, stale-output derivation, resource-request folding, and input-recording folding as today, generalized across scalar and map steps.

Split into sub-commits if large: (1a) scalar + map parity with today's groups; (1b) `needs` threading, serializable returns, consumer-input folding.

Unit-test the runner directly.

### 2. Load step-factory tasks (`feat(project)`)

- Restore and rename the discriminator as `stepBased`. Standard tasks: read `stepBased` from the build-definition entry in `_addTask`. Custom tasks: add a getter on `Task.js` (mirroring the removed `getSupportsDifferentialBuildsCallback`) and gate at Spec 5.0 in `_addCustomTask`/`_createCustomTaskWrapper`. Persist per-task step-based-ness in the index-cache `tasks` array (rename the existing `usesProcessEach` slot) and rename `task_metadata` type `"processEach"` to `"steps"` and the `ProjectBuildCache` accessors accordingly.
- In `_addTask` and `_createCustomTaskWrapper`, when a task is `stepBased`, call the factory `taskFunction(options)` to get the step list and drive the step runner with the monitored `{workspace, dependencies, taskUtil}`, then fold the runner's outcome into `recordTaskResult` exactly as the `processEach` fold does today. When not `stepBased`, the legacy path is unchanged.
- Remove the `taskUtil.processEach` binding from both paths (its callers move to the factory form in step 4; if that ordering is awkward, keep the binding until step 5 and remove it there).

### 3. Standalone step runner (`feat(builder)`)

Add an uncached runner in `@ui5/builder` (e.g. `packages/builder/lib/tasks/runSteps.js`) that, given a factory and `{workspace, dependencies, options}`, runs all steps in order, fans out every `keys` set, threads `needs` in memory, and buffers map writes in key order. Expose it so standalone callers use `runSteps(minify, {workspace, dependencies, options})` instead of `minify({...})`. Update `packages/builder/package.json` exports if needed, and update in-repo standalone call sites (notably builder task tests under `packages/builder/test/lib/tasks/`).

### 4. Migrate the 8 processEach tasks (`feat(builder)`)

Convert each to a factory `build(options) => Step[]`, delete its `if (taskUtil?.processEach) {...} else {batch}` dual path (the standalone runner from step 3 provides the no-cache path), and set `stepBased: true` on that task in every build definition that lists it (`definitions/library.js`, `application.js`, and any other definition referencing it). Batch sensibly:

- `replaceCopyright`, `replaceVersion`, `replaceBuildtime`, `escapeNonAsciiCharacters`, `enhanceManifest`: each a single map step (one key per matched resource).
- `minify`: single map step; move the worker toggle to `taskUtil.getEnv("UI5_CLI_NO_WORKERS")`.
- `buildThemes`: single map step; keep `registerCleanupTask` inside the step that creates the pool.
- `generateThemeDesignerResources`: `scan` scalar + `libraryTheming` scalar + `themes` map, wired by `needs` (see the RFC worked example for the intended shape).

Update each task's own tests.

### 5. Remove the old surface (`refactor(project)`)

Delete any remaining `taskUtil.processEach` binding, the group-based entry point, and dead dual-path scaffolding. Confirm no task or test references `processEach`.

### 6. Update the incremental-build skill (`docs`)

In `.claude/skills/incremental-build/architecture.md`: rewrite the "Per-Step Caching (processEach)" section as step-based build tasks; update the Component Map (`ProcessEach` -> the step runner, note the loader change in `TaskRunner`); update the differential-caching pattern note (participation is now the `stepBased` flag, not `processEach` usage); update the `task_metadata` type name and the index-cache `tasks` slot description; document the factory contract, the `stepBased` opt-in, and the standalone runner. No RFC references.

## Testing

- Framework: AVA with `esmock` (ESM mocking) and `sinon`. Single file: `npx ava test/lib/...` from the package dir.
- Load-bearing integration targets that must keep passing: `packages/project/test/lib/build/ProjectBuilder.caching.integration.js` (minify source-map delta, buildThemes "adding a library") and `BuildServer.integration.js`. The buildThemes "removing a library" case may still be `test.serial.failing` (a parked removal-delta gap, see the `processeach-feature-state` memory); confirm its status rather than assuming.
- Add unit tests for the step runner covering: scalar and map steps, `needs` threading, both return kinds, delta selection (changed read, changed non-resource input, changed `needs` return, new/removed key), concurrent vs `sequential` writes, and stale-output dropping.

## Definition of done

The 8 tasks build through the factory API with no dual path; per-step delta caching works for all of them (verified by the integration tests above on second/third builds after file changes); standalone `@ui5/builder` task invocation works through the step runner; legacy (non-`stepBased`) tasks are unaffected; the `incremental-build` skill reflects the new design; `npm test` passes.
