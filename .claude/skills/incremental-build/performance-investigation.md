# Performance Investigation Guide

Reference for investigating and analyzing performance of the incremental build system.

## Test Setup

### Test library

Use sap.m from the OpenUI5 repository. It's a large library (~12,700 source resources) with 3 dependency projects (sap.ui.core, sap.ui.layout, sap.ui.unified) and 9 build tasks, making it a good stress test.

### Build command

```bash
cd ~/SAPDevelop/dev/ui5/openui5/src/sap.m
UI5_CLI_NO_LOCAL=X UI5_BUILD_NO_WRITE_DEST=X UI5_CACHE_PERF=1 ui5 build --log-level perf 2>&1
```

Flags:
- `UI5_CLI_NO_LOCAL=X` — Use the globally linked CLI (i.e., the development version)
- `UI5_BUILD_NO_WRITE_DEST=X` — Skip writing output to `./dist` (isolates cache/build overhead from disk I/O)
- `UI5_CACHE_PERF=1` — Enable low-level `matchResourceMetadataStrict` counters (see below)
- `--log-level perf` — Show all perf-level log statements

### Three build scenarios

| Scenario | How to trigger | What it tests |
|----------|---------------|---------------|
| **Cold cache** | Delete `~/.ui5/buildCache/` and run | Full build + cache creation from scratch |
| **Warm cache** | Run twice with no file changes | Cache validation + result restoration |
| **Stale cache** | Edit a file, then run | Cache invalidation + partial rebuild |

**Creating a stale cache scenario:**
Edit the first line of a JS file (which is a comment) and add a timestamp:
```bash
cd ~/SAPDevelop/dev/ui5/openui5/src/sap.m
sed -i '' "1s|.*|// Modified: $(date '+%Y-%m-%d %H:%M:%S')|" src/sap/m/Button.js
```
Then run the build command.

## Reading the Perf Log

The log follows the build lifecycle. Here is the anatomy of a stale-cache build:

### Phase 1: Source Index Initialization (parallel across all projects)

```
perf #initSourceIndex fromCacheWithDelta for project sap.m completed in 68 ms: 12677 resources, 1 changed
perf Initialized source index for project sap.m in 691 ms
```

- The first line shows the delta detection: how many resources exist and how many changed.
  A high `changed` count with few actual edits suggests a timestamp-related false positive.
- The total init time includes `byGlob("/**/*")` (stat all files), reading the cached index from disk, and delta detection. The `fromCacheWithDelta` time is a subset of the total.
- If `fromCacheWithDelta` is small relative to total, the bottleneck is in the glob (reading file metadata from disk). If `fromCacheWithDelta` is large, the bottleneck is in hashing.

### Phase 2: Per-project cache validation (sequential)

Each project goes through this sequence:

```
perf getDependenciesReader completed in 0.12 ms
perf Initialized dependency indices for project sap.ui.core in 0.63 ms
   OR
perf #flushPendingChanges updateDependencyIndices for project sap.ui.layout completed in 61 ms (3064 changed paths, 2/10 tasks, changed=true)
perf Flushed pending changes for project sap.ui.layout in 61 ms
```

- **"Initialized dependency indices"** → first-time dependency index refresh (`_refreshDependencyIndices`). Seen on the first project with dependency requests.
- **"#flushPendingChanges"** → updating existing indices with changed paths. The `N/M tasks` shows how many tasks had dependency requests vs. total. The `changed paths` count is the number of dependency resource paths propagated as potentially changed.

Then result cache validation:

```
perf #findResultCache importStages for project sap.ui.core completed in 7 ms with 10 stages
perf #findResultCache restoreFrozenSources for project sap.ui.core completed in 5 ms
perf Validated result cache for project sap.ui.core in 13 ms
```

- `importStages` — Loads cached stage readers from CAS for each task.
- `restoreFrozenSources` — Creates a CAS-backed reader for source files.
- The overall line tells you if the result cache was valid.

After validation:

```
perf prepareProjectBuildAndValidateCache for sap.ui.core completed in 34 ms (usesCache=true)
info ✔ Skipping build of library project sap.ui.core
   OR
perf prepareProjectBuildAndValidateCache for sap.m completed in 0.48 ms (usesCache=false)
info ❯ Building library project sap.m...
```

- `usesCache=true` → Project is fully served from cache, skip all tasks.
- `usesCache=false` → Project needs (re-)building, tasks will be evaluated individually.

### Phase 3: Task execution (for projects that need building)

Per-task index update:

```
perf updateIndices for task 'replaceVersion' of project 'sap.m' resource fetch completed in 3.89 ms: 0 cache hits, 783 cache misses
perf TreeRegistry.flush completed: phase1(removals)=0.00 ms, phase2(upserts)=7.13 ms, phase3(rehash)=9.56 ms | matchMetadataStrictCalls=783, matchMetadataUnchanged=782, modifiedNodesSkips=0
perf #flushTreeChanges for task 'replaceVersion' completed in 16.79 ms across 1 registries
perf Updated project indices for task replaceVersion in project sap.m in 21.71 ms
```

Key metrics:
- **cache hits / cache misses**: In the resource fetch, "cache hits" means the resource was already in the task's request index (from a previous task sharing the same tree). "Cache misses" means a new fetch was needed.
- **phase1(removals)**: Time removing deleted resources from the Merkle tree.
- **phase2(upserts)**: Time inserting/updating resources in the tree.
- **phase3(rehash)**: Time propagating hash changes up from modified leaves to root. High rehash with few changed resources indicates deep tree structure.
- **matchMetadataStrictCalls / matchMetadataUnchanged**: How many resources were compared, and how many were unchanged (short-circuited by lastModified check). If `calls >> unchanged`, many resources needed content hashing.

Then task execution or skip:

```
info ✔ Skipping task escapeNonAsciiCharacters     ← Cache hit
info ◇ Running task replaceCopyright...             ← Delta/differential run
info › Running task generateLibraryPreload...       ← Full re-execution
```

- `✔ Skipping` — exact cache match for this task's signature.
- `◇ Running` — differential execution (using `changedProjectResourcePaths`).
- `› Running` — full execution (no cache match, no delta available).

### Phase 4: Cache write

In CLI builds, cache writes are **deferred** — they run in the background after `Build succeeded` is printed and don't block process exit. In BuildServer mode, cache writes are still awaited.

```
info ProjectBuilder Build succeeded in 5.04 s
info ProjectBuilder Executing cleanup tasks...
perf Wrote build cache for project sap.m in 301 ms
```

The four sub-operations (stages, requests, sourceIndex, result) run in parallel (`Promise.all`), so wall time ≈ max of all four. When run in the background (CLI), they no longer compete with the build for I/O bandwidth and typically complete faster (~300ms vs ~1400ms when blocking).

**Important:** The source stage CAS write (`#freezeUntransformedSources`) is NOT part of Phase 4. It runs during `allTasksCompleted()` in Phase 3, before `Build succeeded` is logged. For sap.m this writes ~11,893 untransformed source resources to CAS (~250ms in the critical path). Look for the `#writeStageResources for stage source` log line — it appears before `Build succeeded`.

## UI5_CACHE_PERF Counters

Setting `UI5_CACHE_PERF=1` enables low-level counters in `utils.js` for `matchResourceMetadataStrict`:

- `calls` — Total invocations
- `shortCircuitTrue` — Fast-path returns (lastModified matches cached and ≠ indexTimestamp → file unchanged, no I/O needed)
- `sizeMismatch` — Changes detected via size check (cheap)
- `integrityFallback` — Full SHA256 content hash required (expensive)

These counters appear in the `TreeRegistry.flush` log as `matchMetadataStrictCalls` and `matchMetadataUnchanged`.

A high `integrityFallback` count means many files have the same size but different content — this is expensive and may indicate that the `lastModified` short-circuit is not working (e.g., due to timestamp resolution issues).

## Perf Log Reference

All `log.perf()` statements by source file:

| File | Log pattern | What it measures |
|------|-------------|------------------|
| `BuildContext.js` | `Parallel source index initialization completed` | Total time for parallel `initSourceIndex` across all projects |
| `BuildContext.js` | `getRequiredProjectContexts completed` | Discovery + index init for all required projects |
| `ProjectBuildContext.js` | `getDependenciesReader completed` | Creating the dependency reader for a project |
| `ProjectBuildContext.js` | `ProjectBuildCache.prepareProjectBuildAndValidateCache completed` | Full cache validation for one project |
| `ProjectBuilder.js` | `getRequiredProjectContexts completed` | Top-level timing (includes context creation) |
| `ProjectBuilder.js` | `prepareProjectBuildAndValidateCache for {project} completed` | Per-project validation with `usesCache` flag |
| `TaskRunner.js` | `Task {name} finished in {N} ms` | Individual task execution time |
| `ProjectBuildCache.js` | `#initSourceIndex fromCacheWithDelta` | Delta detection: resource count, changed count |
| `ProjectBuildCache.js` | `Initialized source index for project` | Total source index init (glob + cache read + delta) |
| `ProjectBuildCache.js` | `Initialized dependency indices` | First-time dependency index refresh |
| `ProjectBuildCache.js` | `Flushed pending changes for project` | Source + dependency index update with pending changes |
| `ProjectBuildCache.js` | `#flushPendingChanges updateSourceIndex` | Source index update only |
| `ProjectBuildCache.js` | `#flushPendingChanges updateDependencyIndices` | Dependency index update with task/path counts |
| `ProjectBuildCache.js` | `#findResultCache importStages` | Loading cached stages from CAS |
| `ProjectBuildCache.js` | `#findResultCache restoreFrozenSources` | Creating CAS-backed source reader |
| `ProjectBuildCache.js` | `Validated result cache for project` | Overall result cache validation |
| `ProjectBuildCache.js` | `Updated project indices for task` | Per-task index update during build |
| `ProjectBuildCache.js` | `Wrote build cache for project` | Cache persistence with sub-operation breakdown |
| `ResourceRequestManager.js` | `refreshIndices for task` | Full dependency index refresh |
| `ResourceRequestManager.js` | `updateIndices for task ... resource fetch` | Resource fetch phase with cache hit/miss counts |
| `ResourceRequestManager.js` | `#flushTreeChanges for task` | Merkle tree flush with registry count |
| `TreeRegistry.js` | `TreeRegistry.flush completed` | Detailed tree operation breakdown (removals/upserts/rehash) |

## Known Peculiarities

### 1. "3064 changed dependency paths" on warm cache

When a project's cache is restored from disk for the first time in a CLI invocation, `#importStages` returns ALL stage resource paths as "changed" because the in-memory stages start empty and every restored stage differs from the empty state. These paths propagate via `propagateResourceChanges` to all dependents as "changed dependency resources."

**Effect:** Projects like sap.ui.layout and sap.ui.unified show ~3064 changed dependency paths and ~60ms flush time even when nothing actually changed. This is the cost of first-time dependency index hydration and happens on every warm/stale build invocation (not in a BuildServer session where caches persist in memory).

**Key code path:** `ProjectBuildContext.js:277-280` → `propagateResourceChanges(boolOrChangedPaths)` → `BuildContext.js:189` → `traverseDependents` → `dependencyResourcesChanged` on all dependents.

### 2. Source index init dominated by byGlob, not delta detection

For sap.m: `fromCacheWithDelta` takes ~68ms but the total `Initialized source index` takes ~691ms. The remaining ~620ms is `sourceReader.byGlob("/**/*")` which stats all ~12,677 files. The delta detection itself (comparing metadata, hashing only changed files) is fast.

**Implication:** Source index init performance is I/O-bound (filesystem stat calls), not CPU-bound. Optimizations targeting hash computation won't help much; reducing the number of stat calls would.

**Validated (2026-04):** Replacing `byGlob("/**/*")` with `fs.readdir(recursive)` + per-file `fs.stat()` using lightweight proxy objects (avoiding Resource construction) was tested and produced a ~300ms *regression* for sap.m. Both approaches must stat every file; globby integrates stat into its directory walk more efficiently than a separate readdir + 12K stat calls. The only way to meaningfully reduce source index init time is to **avoid statting unchanged files entirely** (e.g., via directory mtime heuristics or filesystem change notifications).

### 3. "cache misses" in resource fetch don't mean cache corruption

In `updateIndices` logs, "cache misses" means the resource wasn't found in the task's SharedHashTree node cache (a performance optimization for avoiding redundant metadata reads). It does NOT mean the persistent cache is missing. On the first build from cache, all resources are "cache misses" because the in-memory node cache starts empty.

### 4. Task execution appears twice in the log

```
perf Build Task replaceCopyright finished in 1 ms
perf Build Task replaceCopyright finished in 8 ms
```

The first line is the task function's execution time. The second includes cache recording overhead (computing signatures, recording resource requests). This is the wall time from the TaskRunner's perspective.

### 5. writeCache sub-timings all look similar because of Promise.all

```
perf Wrote build cache ... (stages=1422 ms, requests=1427 ms, sourceIndex=1395 ms, result=1381 ms)
```

These four operations run in parallel. They share I/O bandwidth, so their individual timings overlap. The wall time is ~max of all four, not the sum. To identify the true bottleneck, you'd need to run them sequentially (temporarily modify `writeCache`).

**Note:** In CLI mode, cache writes are deferred to the background (since the `deferCacheWrites` change). The `Wrote build cache` log line appears after `Build succeeded`. The sub-timings tend to be lower (~250-300ms vs ~1400ms) because background writes don't compete with the build for I/O bandwidth.

### 6. matchMetadataUnchanged vs modifiedNodesSkips

In `TreeRegistry.flush` logs:
- `matchMetadataUnchanged` — Resources whose metadata (lastModified, size, integrity) matched the cached version. No tree modification needed.
- `modifiedNodesSkips` — Tree nodes already marked as modified by a previous flush in the same build. Skipped to avoid redundant work.

When `matchMetadataUnchanged` equals `matchMetadataStrictCalls`, ALL resources were unchanged — the flush was pure overhead.

### 7. Dependency index "changed=true" doesn't always mean task re-execution

The `changed=true` in `#flushPendingChanges updateDependencyIndices` means at least one dependency index signature changed. But the *result* cache validation (`#findResultCache`) may still find a matching cached result if the combined project+dependency signature matches a previous build.

## Investigation Workflow

1. **Establish a baseline.** Run the build 2-3 times to get stable warm-cache timings. Note the total time and per-phase breakdown.

2. **Identify the scenario.** Are you investigating warm cache (no changes), stale cache (file edit), or cold cache (no cache at all)?

3. **Find the dominant phase.** In the perf log, look for the largest times:
   - Source index init? → Check `fromCacheWithDelta` vs total to see if it's I/O or hash-bound
   - Dependency index flush? → Check "changed paths" count and "cache misses" — see Peculiarity #1
   - Task execution? → Check which tasks run and whether they support differential builds (◇ vs ›)
   - Cache write? → Check the sub-operation breakdown

4. **Drill down.** For the dominant phase:
   - Add more granular `log.perf()` statements if needed
   - Use `console.time()`/`console.timeEnd()` for quick local profiling
   - Check `matchMetadataStrictCalls` vs `matchMetadataUnchanged` to understand if resources are being unnecessarily re-hashed

5. **Validate optimization ideas.** When proposing optimizations:
   - Consider warm vs stale vs cold cache impact separately
   - Check if the optimization target already has an early-exit path (e.g., `ResourceRequestManager.updateIndices` exits early when `requestGraph.getSize() === 0`)
   - Measure with the test build before and after

6. **Watch for measurement artifacts.** The first run after a system boot or after a long idle period will be slower due to OS filesystem cache being cold. Run 2-3 times to get stable readings.
