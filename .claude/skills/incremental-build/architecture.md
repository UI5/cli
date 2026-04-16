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
| `ProjectBuilder` | `lib/build/ProjectBuilder.js` | Builds projects in dependency order |
| `BuildContext` | `lib/build/helpers/BuildContext.js` | Global build config, project context cache |
| `ProjectBuildContext` | `lib/build/helpers/ProjectBuildContext.js` | Per-project bridge between builder, tasks, and cache |
| `TaskRunner` | `lib/build/TaskRunner.js` | Task composition, execution loop, abort handling |
| `ProjectBuildCache` | `lib/build/cache/ProjectBuildCache.js` | Cache orchestration per project: index management, stage lookup, result recording |
| `BuildTaskCache` | `lib/build/cache/BuildTaskCache.js` | Per-task resource request tracking and index management |
| `StageCache` | `lib/build/cache/StageCache.js` | In-memory cache of stage results keyed by signature |
| `CacheManager` | `lib/build/cache/CacheManager.js` | Persistent cache I/O (filesystem) |
| `ResourceRequestManager` | `lib/build/cache/ResourceRequestManager.js` | Request graph, resource index updates, signature computation |
| `ResourceIndex` | `lib/build/cache/index/ResourceIndex.js` | Wrapper around hash trees with delta detection |
| `HashTree` | `lib/build/cache/index/HashTree.js` | Directory-based Merkle tree for resource hashing |
| `SharedHashTree` | `lib/build/cache/index/SharedHashTree.js` | HashTree with structural sharing via TreeRegistry |
| `TreeRegistry` | `lib/build/cache/index/TreeRegistry.js` | Batch update coordinator for shared trees |
| `TreeNode` | `lib/build/cache/index/TreeNode.js` | Merkle tree node (resource or directory) |
| `ProjectResources` | `lib/resources/ProjectResources.js` | Stage management, readers/writers, tag collections |
| `Stage` | `lib/resources/Stage.js` | Writer + cached tag operations per build stage |
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
INITIAL -> (first build requested) -> BUILDING -> (build completes) -> FRESH
                                        |
                               (file change detected)
                                        |
                                        v
                                   INVALIDATED -> (re-enqueue) -> BUILDING
```

## Caching Architecture

### Cache Layers

```
+---------------------------------------------+
|          In-Memory (StageCache)              |  <- Fast, per-session
|  signature -> {stage, writtenPaths, tagOps}  |
+---------------------------------------------+
|        Persistent (CacheManager)             |  <- Across sessions
|  ~/.ui5/buildCache/v0_2/                     |
|    cas/           (content-addressable, gz)  |
|    stageMetadata/ (stage results by sig)     |
|    taskMetadata/  (resource requests)        |
|    resultMetadata/(build result metadata)    |
|    index/         (resource index trees)     |
|    buildManifests/(project build metadata)   |
+---------------------------------------------+
```

### Signatures

The cache uses content-based signatures at multiple levels:

| Level | What it captures | Where computed |
|-------|-----------------|----------------|
| **Build signature** | Build config hash (selfContained, cssVariables, etc.) + project config | `ProjectBuildContext.create()` |
| **Source signature** | Merkle root of all source resources | `ResourceIndex` (source index) |
| **Task stage signature** | `projectIndexSignature-dependencyIndexSignature` | `ProjectBuildCache.prepareTaskExecutionAndValidateCache()` |
| **Result signature** | Combined source signature + last task stage signature | `ProjectBuildCache.#getResultStageSignature()` |

### First Build (no cache)

```
#initSourceIndex()
  -> No index cache on disk
  -> Create fresh ResourceIndex from all source resources
  -> #combinedIndexState = INITIAL

prepareProjectBuildAndValidateCache()
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

prepareProjectBuildAndValidateCache()
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

The `matchResourceMetadataStrict` utility determines if a resource is "unchanged" by comparing `lastModified` timestamps, `size`, and `integrity`. Unchanged resources are skipped during upsert for efficiency.

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

Manages the request graph -- a DAG of request sets with associated resource indices:
- `addRequests(recording, reader)`: Records path/glob requests, creates hash tree, returns signature
- `updateIndices(reader, changedPaths)`: Matches changed paths against request patterns, upserts into affected trees
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
3. Source reader (lowest priority, reads from filesystem)

This means a task sees the cumulative output of all previous tasks, with its own writes taking highest priority.

### Stage Cache

When a task is skipped (cache hit), its cached stage is restored:
```javascript
project.getProjectResources().setStage(stageName, stageCache.stage,
    stageCache.projectTagOperations, stageCache.buildTagOperations);
```

## Persistent Cache Format

### On Disk (CacheManager)

```
~/.ui5/buildCache/v0_2/
+-- cas/                          # Content-addressable storage (cacache, gzip)
|   +-- content-v2/
|       +-- sha256/...            # Resources stored by integrity hash
+-- buildManifests/
|   +-- {projectId}/
|       +-- {buildSignature}.json
+-- stageMetadata/
|   +-- {projectId}/
|       +-- {buildSignature}/
|           +-- {stageName}/
|               +-- {stageSignature}.json.gz
+-- taskMetadata/
|   +-- {projectId}/
|       +-- {buildSignature}/
|           +-- {taskName}/
|               +-- {type}.json.gz       # type = "project" | "dependency"
+-- resultMetadata/
|   +-- {projectId}/
|       +-- {buildSignature}/
|           +-- {resultSignature}.json
+-- index/
    +-- {projectId}/
        +-- {buildSignature}/
            +-- {kind}.json.gz           # kind = "source" | "result"
```

## Key Architectural Patterns

1. **Lazy building**: Projects built on-demand when readers are requested
2. **Request batching**: Multiple pending build requests processed in single batch (10ms debounce)
3. **Abort/retry**: File changes abort running builds; projects re-queued automatically
4. **Structural sharing**: Derived hash trees share unchanged subtrees, reducing memory
5. **Content-addressed storage**: Resources deduplicated via integrity hashes in cacache
6. **Differential caching**: Tasks track resource requests; delta builds only re-process changed resources
7. **Tag propagation**: Resource tags flow through stages via cached tag operations, included in hash signatures
8. **Two-tier cache**: Fast in-memory StageCache + persistent filesystem cache via CacheManager
