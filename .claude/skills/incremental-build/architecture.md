# Incremental Build Architecture

## High-Level Overview

The incremental build system enables fast development feedback loops by:
1. Building projects **lazily** -- only when their output is requested
2. **Caching** task results keyed by content hashes of input resources
3. **Skipping** tasks whose inputs haven't changed since the last build
4. Running **differential** (delta) builds that only process changed resources
5. **Watching** source files and automatically rebuilding on changes

```
                     +----------------+
  Resource Request > | BuildServer    | --- file watcher ---> invalidate + abort
                     +-------+--------+
                             | enqueue project
                             v
                     +----------------+
                     | ProjectBuilder | --- for each project in dependency order
                     +-------+--------+
                             |
                +------------+------------+
                v            v            v
         +-----------+ +----------+ +-------------------+
         |BuildContext| |TaskRunner| |ProjectBuildCache  |
         +-----------+ +----------+ +-------------------+
```

## Component Map

Use this table to locate source files. ALWAYS read the relevant source file before making changes.

| Component | Location | Role |
|-----------|----------|------|
| `BuildServer` | `lib/build/BuildServer.js` | Development server, file watching, build orchestration |
| `BuildReader` | `lib/build/BuildReader.js` | Reader exposed by BuildServer; routes resource requests to per-project readers via namespace map |
| `ProjectBuilder` | `lib/build/ProjectBuilder.js` | Builds projects in dependency order |
| `BuildContext` | `lib/build/helpers/BuildContext.js` | Global build config, project context cache |
| `getBuildSignature` | `lib/build/helpers/getBuildSignature.js` | Build signature computation: `BUILD_SIG_VERSION` + build config + project config |
| `ProjectBuildContext` | `lib/build/helpers/ProjectBuildContext.js` | Per-project bridge between builder, tasks, and cache |
| `WatchHandler` | `lib/build/helpers/WatchHandler.js` | chokidar-based source path watcher; emits change events to BuildServer |
| `TaskRunner` | `lib/build/TaskRunner.js` | Task composition, execution loop, abort handling |
| `Cache` enum | `lib/build/cache/Cache.js` | Cache mode constants: `Default`, `Force`, `ReadOnly`, `Off` (CLI `--cache` option) |
| `ProjectBuildCache` | `lib/build/cache/ProjectBuildCache.js` | Cache orchestration per project: index management, stage lookup, result recording |
| `BuildTaskCache` | `lib/build/cache/BuildTaskCache.js` | Per-task resource request tracking and index management |
| `StageCache` | `lib/build/cache/StageCache.js` | In-memory cache of stage results keyed by signature |
| `BuildCacheStorage` | `lib/build/cache/BuildCacheStorage.js` | Unified SQLite storage for content (CAS) and metadata |
| `CacheManager` | `lib/build/cache/CacheManager.js` | Persistent cache I/O, delegates to BuildCacheStorage; singleton per cache directory |
| `ResourceRequestManager` | `lib/build/cache/ResourceRequestManager.js` | Request graph, resource index updates, signature computation |
| `ResourceRequestGraph` | `lib/build/cache/ResourceRequestGraph.js` | DAG of request sets with delta encoding and best-parent optimization |
| `ResourceIndex` | `lib/build/cache/index/ResourceIndex.js` | Wrapper around hash trees with delta detection |
| `HashTree` | `lib/build/cache/index/HashTree.js` | Directory-based Merkle tree for resource hashing |
| `SharedHashTree` | `lib/build/cache/index/SharedHashTree.js` | HashTree with structural sharing via TreeRegistry |
| `TreeRegistry` | `lib/build/cache/index/TreeRegistry.js` | Batch update coordinator for shared trees |
| `TreeNode` | `lib/build/cache/index/TreeNode.js` | Merkle tree node (resource or directory) |
| `ProjectResources` | `lib/resources/ProjectResources.js` | Stage management, readers/writers, tag collections |
| `Stage` | `lib/resources/Stage.js` | Per-build-stage container holding either a live writer (during execution) or a cached writer + cached tag operations (when restored from cache) -- never both |
| `MonitoredResourceTagCollection` | In `@ui5/fs` (separate repo) | Proxy tracking tag operations during task execution |
| `ResourceTagCollection` | In `@ui5/fs` (separate repo) | Base storage for resource tags |
| `Resource` | In `@ui5/fs` (separate repo) | `getTags()` delegates to project's tag collection |

## Key Flows

### Build Request Flow

```
reader.byPath("/test.js")
  -> BuildServer checks ProjectBuildStatus
  -> If not fresh: #enqueueBuild(projectName)
  -> Debounced (10ms): #processBuildRequests()
  -> Batch all pending projects
  -> projectBuilder.build({projects, signal})
  -> On success: setReader(project.getReader({style: "runtime"}))
  -> Resolve queued reader promises
```

### File Watch and Abort

When a source file changes:
1. `WatchHandler` emits change event with project name and resource path
2. `_projectResourceChanged()` queues the change and calls `ProjectBuildStatus.invalidate()` on the affected project and all its dependents
3. `invalidate()` triggers the project's `AbortController`, which aborts the running build via `AbortSignal`
4. The build loop catches `AbortBuildError` and re-enqueues projects that aren't fresh
5. Queued resource changes are flushed via `#flushResourceChanges()` before the next build starts

### State Machine (per project)

```
INITIAL -> (first build requested, invalidate()) -> INVALIDATED -> (build completes, setReader()) -> FRESH
                                                                                                       |
                                                                                            (file change detected)
                                                                                                       v
                                                                                                  INVALIDATED
                                                                                                  (abort + re-enqueue)
```

Note: There is no separate `BUILDING` state; `INVALIDATED` covers both "needs build" and "building in progress". The abort controller on `ProjectBuildStatus` cancels the running build on re-invalidation.

## Caching Architecture

### Cache Layers

```
+-----------------------------------------------------------------+
|                  In-Memory (StageCache)                          |  <- Fast, per-session
|  signature -> {stage, writtenPaths, projectTagOps, buildTagOps}  |
+-----------------------------------------------------------------+
|                Persistent (CacheManager + BuildCacheStorage)     |  <- Across sessions
|  <ui5DataDir>/buildCache/<CACHE_VERSION>/cache.db (SQLite, WAL)  |
|    content        (CAS: integrity -> gzip-compressed BLOB)       |
|    index_cache    (resource index trees, by kind="source")       |
|    stage_metadata (cached stage results, by stage signature)     |
|    task_metadata  (resource requests per task, by type)          |
|    result_metadata(per-build result metadata)                    |
+-----------------------------------------------------------------+
```

`<ui5DataDir>` defaults to `~/.ui5/` and can be overridden via `UI5_DATA_DIR` env var, the `ui5DataDir` configuration option, or the `--ui5-data-dir` CLI option. `<CACHE_VERSION>` is a constant in `CacheManager.js` (`CACHE_VERSION`) bumped on breaking schema changes; old versioned directories are simply ignored.

### Signatures

The cache uses content-based signatures at multiple levels:

| Level | What it captures | Where computed |
|-------|-----------------|----------------|
| **Build signature** | `BUILD_SIG_VERSION` + build config via `getBaseSignature()`, per-project via `getProjectSignature()` (base + projectId + project config). Task-provided signatures planned but not yet integrated. | `getBuildSignature.js`, `ProjectBuildContext.create()` |
| **Source signature** | Merkle root of all source resources | `ResourceIndex` (source index) |
| **Task stage signature** | `projectIndexSignature-dependencyIndexSignature` | `ProjectBuildCache.prepareTaskExecutionAndValidateCache()` |
| **Result signature** | Combined source signature + last task stage signature | `ProjectBuildCache.#getResultStageSignature()` |

### Source File CAS Storage (Frozen Sources)

To prevent race conditions where a dependency's source files change between project builds in a multi-project build, untransformed source files are stored in CAS after each build completes:

1. `#freezeUntransformedSources()` identifies source files not overlaid by any build task
2. Stores them in CAS and persists metadata as a stage cache entry keyed by the source index signature
3. Creates a CAS-backed reader and sets it via `ProjectResources.setFrozenSourceReader()`
4. On subsequent builds where the result cache is valid, `#restoreFrozenSources()` loads metadata from cache and recreates the CAS-backed reader without rebuilding

At build completion, `#revalidateSourceIndex()` re-reads all source files and compares them against the source index. If any file was modified during the build, an error is thrown and the cache is not stored, preventing inconsistent results. In watch mode this triggers a rebuild.

### First Build (no cache)

```
#initSourceIndex()
  -> No index cache on disk
  -> Create fresh ResourceIndex from all source resources
  -> #combinedIndexState = INITIAL

validateCache({prepareForBuild: true})
  -> State is INITIAL -> return false (no cache to validate)

For each task:
  prepareTaskExecutionAndValidateCache(taskName)
    -> No task cache exists (#taskCache empty)
    -> return false (task must execute)

  [task executes]

  recordTaskResult(taskName, workspace, dependencies, cacheInfo)
    -> Records resource requests -> creates hash trees (ResourceRequestManager.addRequests)
    -> Creates BuildTaskCache with request patterns and indices
    -> Reads stage writer for produced resources
    -> Gets tag operations from MonitoredResourceTagCollection
    -> Computes stage signature
    -> Stores in StageCache (in-memory) via stageCache.addSignature()

allTasksCompleted()
  -> Sets #combinedIndexState = FRESH
  -> Computes result signature
  -> Resets #writtenResultResourcePaths
```

### Subsequent Build (with cache)

```
projectSourcesChanged(changedPaths) / dependencyResourcesChanged(changedPaths)
  -> Records changed paths
  -> Sets #combinedIndexState = REQUIRES_UPDATE

validateCache({prepareForBuild: true})
  -> State is REQUIRES_UPDATE
  -> #flushPendingChanges():
      #updateSourceIndex(changedPaths) -> reads resources from source reader
        -> upserts into source ResourceIndex
        -> Adds changed paths to #writtenResultResourcePaths
      Updates dependency indices for all task caches
  -> #findResultCache() -> checks if overall result is still valid
  -> If result cache valid: return true (skip entire project build)

For each task:
  prepareTaskExecutionAndValidateCache(taskName)
    -> Task cache EXISTS (from previous build's recordTaskResult)
    -> updateProjectIndices(reader, writtenResultResourcePaths)
        -> ResourceRequestManager.updateIndices():
            Match changed paths against request graph
            Read resources from reader
            Upsert into task hash trees (via TreeRegistry.flush for shared trees)
    -> Compute stage signatures from updated hash trees
    -> #findStageCache(stageName, stageSignatures)
        1. Check in-memory StageCache first
        2. Fall back to persistent cache (CacheManager)
    -> If found: apply cached stage, return true (skip task)
    -> If not found: try delta signatures (previous signature -> new signature)
        -> If delta found: return {cacheInfo} for differential execution
        -> If nothing found: return false (full execution)
```

## Resource Indexing (Merkle Trees)

### HashTree

A directory-based Merkle tree where:
- **Leaf nodes** (resources): hash = `SHA-256(resource:{name}:{integrity}[:tags(...)])`
- **Directory nodes**: hash = `SHA-256(sorted child hashes concatenated)`
- **Root hash** = tree signature (used as cache key)

Each resource node stores: `name`, `integrity`, `lastModified`, `size`, `inode`, `tags`

Key operations:
- `upsertResources(resources, timestamp)`: Insert or update resources, recompute affected hashes
- `removeResources(paths)`: Remove resources, recompute affected hashes
- `_computeHash(node)`: Recursive hash computation

The `isResourceUnchanged` utility (`utils.js`) determines if a resource is "unchanged" using a tiered comparison (cheapest first):

1. Compare `size` -- if different, changed (definite signal; mtime preservation via `cp -p`/`tar -x`/atomic rename does not imply unchanged content)
2. Compare `inode` -- if different, the file was replaced; fall through to integrity check rather than rejecting outright (content may still be identical)
3. If `lastModified` matches cached value AND differs from `indexTimestamp` AND inode matches: unchanged (fast path)
4. If `lastModified` equals `indexTimestamp`: racy-git edge case -- file may have changed during indexing, fall through to integrity check
5. Compare `integrity` hash -- expensive, last resort

`inode` is optional on both sides (virtual resources, older caches without inode); the inode check is skipped when either side is undefined.

### SharedHashTree and TreeRegistry

Tasks make multiple resource requests (e.g., `byGlob("/**/*.js")`, `byPath("/manifest.json")`). Each request set gets its own hash tree, but they share common subtrees via `SharedHashTree`.

```
Task reads:
  byGlob("/**/*.js")  -> RequestSet A -> SharedHashTree A (all JS files)
  byPath("/test.js")   -> RequestSet B -> SharedHashTree B (derived from A, adds test.js)
```

**TreeRegistry** coordinates batch updates across all shared trees:
1. Changes scheduled via `scheduleUpsert()` / `scheduleRemoval()`
2. `flush()` applies all pending operations atomically
3. Shared nodes modified once, changes propagate to all trees referencing them

### ResourceRequestManager

Manages the request graph for a task -- delegates to `ResourceRequestGraph` for DAG storage of request sets with delta encoding. Each graph node stores only the requests added relative to its parent, and `addRequestSet()` automatically finds the best parent (largest subset) to minimize delta size.

At runtime, each materialized request set references a `SharedHashTree` representing the resources currently matching that set.

- `addRequests(recording, reader)`: Records path/glob requests, creates or reuses a request set in the graph, builds a resource index (SharedHashTree), returns signature
- `updateIndices(reader, changedPaths)`: Traverses graph breadth-first, matches changed paths against request patterns per node, batch-fetches resources, upserts into affected resource indices via TreeRegistry
- `getIndexSignatures()`: Returns current signatures for all request sets
- `getDeltas()`: Returns map of original -> new signature for changed request sets

## Resource Tags

### Tag Types

| Tag | Scope | Persists across builds | Example |
|-----|-------|----------------------|---------|
| `ui5:IsDebugVariant` | Project | Yes | Set by minify task on `-dbg.js` files |
| `ui5:HasDebugVariant` | Project | Yes | Set by minify task on original `.js` files |
| `ui5:OmitFromBuildResult` | Build | No (cleared after each build) | Exclude resources from output |
| `ui5:IsBundle` | Build | No | Mark bundled resources |

### Tag Flow Through Stages

```
initStages([stage1, stage2, ...])
  -> Creates Stage objects with empty writers and no cached tag ops

useStage(stageId)
  -> Sets #currentStageReadIndex = stageIdx - 1
  -> Resets monitored tag collections

#applyCachedResourceTags()  [called lazily from getResourceTagCollection()]
  -> Imports cached tag operations from stages[#lastTagCacheImportIndex+1 .. #currentStageReadIndex]
  -> Advances #lastTagCacheImportIndex

getResourceTagCollection(resource, tag)
  -> Calls #applyCachedResourceTags()
  -> Creates MonitoredResourceTagCollection wrapping the live collection
  -> MonitoredResourceTagCollection clones the collection at creation time
    (so getAllTagsForResource returns INPUT state, before task modifies)

resource.getTags()
  -> Calls project.getResourceTagCollection(this).getAllTagsForResource(this)
  -> Returns tags as {key: value} object or null
```

### Tags in Hash Trees

Resource hashes incorporate tags when present:
```
hashInput = `resource:${name}:${integrity}`
if (tags && Object.keys(tags).length > 0) {
    hashInput += `:tags(${sortedTagString})`
}
```

This ensures that tag-only changes (e.g., a resource gaining `IsDebugVariant` after the minify task runs) invalidate the cache signature for downstream tasks.

## Stage Pipeline

Each task has its own **stage** with a writer. Resources written by a task go into that stage's writer.

### Reader Construction

`ProjectResources.getReader()` creates a prioritized reader stack:
1. Current stage writer (highest priority)
2. Previous stage writers (in reverse order)
3. Frozen source reader (CAS-backed, if set)
4. Source reader (lowest priority, reads from filesystem)

This means a task sees the cumulative output of all previous tasks, with its own writes taking highest priority. The frozen source reader ensures downstream consumers read an immutable CAS snapshot rather than the live filesystem.

### Stage Cache

When a task is skipped (cache hit), its cached stage is restored:
```javascript
project.getProjectResources().setStage(stageName, stageCache.stage,
    stageCache.projectTagOperations, stageCache.buildTagOperations);
```

## Persistent Cache Format

### On Disk (CacheManager)

```
<ui5DataDir>/buildCache/<CACHE_VERSION>/
+-- cache.db                       # Single SQLite database (WAL mode)
    Tables:
    - content(integrity TEXT PK, data BLOB)                                  # CAS: gzip above ~128 bytes
    - index_cache(project_id, build_signature, kind, data)                   # kind: "source"
    - stage_metadata(project_id, build_signature, stage_id, stage_signature, data)
    - task_metadata(project_id, build_signature, task_name, type, data)      # type: "project" | "dependencies"
    - result_metadata(project_id, build_signature, stage_signature, data)
```

Note: Both CAS content and metadata BLOBs are gzip-compressed via thresholds (`CONTENT_COMPRESSION_THRESHOLD` ~128 bytes for content, `METADATA_COMPRESSION_THRESHOLD` ~4 KB for metadata). Below the thresholds, payloads are stored uncompressed; readers detect the gzip magic bytes on the way back out. `CACHE_VERSION` (a constant in `CacheManager.js`) is bumped on incompatible schema changes; obsolete versioned directories are not migrated, so the next build simply rebuilds the cache.

#### Index Cache Contents

The index cache (one row per `(project_id, build_signature, kind="source")`) contains:
- `indexTimestamp`: creation timestamp (used for racy-git detection)
- `root`: serialized Merkle tree (TreeNode hierarchy)
- `tasks`: array of `[taskName, supportsDifferentialBuilds ? 1 : 0]` recording the task execution order and differential build capability

#### Stage Metadata Format

Stage metadata stored on disk includes:
- `resourceMetadata`: resource paths mapped to `{integrity, lastModified, size, inode}`
- `resourceMapping` (optional, for WriterCollection stages): virtual path prefixes mapped to indices in the `resourceMetadata` array, supporting project types where multiple virtual paths map to the same physical path
- `projectTagOperations` / `buildTagOperations`: tag operations to apply when restoring the cached stage

## Key Architectural Patterns

1. **Lazy building**: Projects built on-demand when readers are requested
2. **Request batching**: Multiple pending build requests processed in single batch (10ms debounce)
3. **Abort/retry**: File changes abort running builds; projects re-queued automatically
4. **Structural sharing**: Derived hash trees share unchanged subtrees, reducing memory
5. **Content-addressed storage**: Resources deduplicated via integrity hashes in custom CAS (synchronous path resolution, gzip-compressed)
6. **Differential caching**: Tasks track resource requests; delta builds only re-process changed resources
7. **Tag propagation**: Resource tags flow through stages via cached tag operations, included in hash signatures
8. **Two-tier cache**: Fast in-memory StageCache + persistent filesystem cache via CacheManager
9. **Two-phase invalidation**: Changes queued via `projectSourcesChanged()` / `dependencyResourcesChanged()` (state -> `REQUIRES_UPDATE`), applied only during `#flushPendingChanges()` at next build start. "Definitely invalidated" only after content comparison confirms actual differences.
10. **Source index revalidation**: At build completion, `#revalidateSourceIndex()` re-reads source files and compares against the source index. If any file changed during the build, an error is thrown and the cache is not stored.
11. **Frozen sources**: Untransformed source files stored in CAS after build, providing immutable snapshots for downstream dependency consumers (prevents filesystem race conditions)
