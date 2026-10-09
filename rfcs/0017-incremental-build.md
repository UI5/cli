- Start Date: 2024-12-09
- RFC PR: [#1036](https://github.com/SAP/ui5-tooling/pull/1036)
- Issue: -
- Affected components <!-- Check affected components by writing an "X" into the brackets -->
	+ [x] [ui5-builder](https://github.com/UI5/cli/tree/main/packages/builder)
	+ [x] [ui5-server](https://github.com/UI5/cli/tree/main/packages/server)
	+ [x] [ui5-cli](https://github.com/UI5/cli/tree/main/packages/cli)
	+ [x] [ui5-fs](https://github.com/UI5/cli/tree/main/packages/fs)
	+ [x] [ui5-project](https://github.com/UI5/cli/tree/main/packages/project)
	+ [x] [ui5-logger](https://github.com/UI5/cli/tree/main/packages/logger)

# RFC 0017 Incremental Build

## Summary

UI5 CLI incremental builds re-process modified resources and reuse unchanged results from a previous build.

## Motivation

The current UI5 project build can take several minutes for a large project, such as a framework-internal library. Each build processes the required projects by running a series of tasks, even when only a few resources changed. A build cache can detect these changes, process only the affected resources, and reuse the other results. This reduces build times.

UI5 projects increasingly use [custom build tasks](https://sap.github.io/ui5-tooling/stable/pages/extensibility/CustomTasks/). Community-maintained examples include [`ui5-tooling-transpile`](https://github.com/ui5-community/ui5-ecosystem-showcase/tree/main/packages/ui5-tooling-transpile) for TypeScript compilation and [`ui5-tooling-modules`](https://github.com/ui5-community/ui5-ecosystem-showcase/tree/main/packages/ui5-tooling-modules) for third-party libraries.

Dependencies that use custom tasks make development-server setup more complex. The current UI5 CLI development server does not execute build tasks. It uses middleware, including [custom middleware](https://sap.github.io/ui5-tooling/stable/pages/extensibility/CustomServerMiddleware/), to process resources during development. The server only uses custom middleware from the root project, so the root project must also configure middleware required by its dependencies.

The UI5 CLI server can solve this configuration problem by **executing an incremental build** before it starts the development server. The build automatically executes custom tasks from dependencies. Incremental performance also lets the server replace most middleware with task counterparts while it maintains a similar or improved development experience.

The server change simplifies configuration for interdependent UI5 projects. It also lets extension authors use custom tasks in more scenarios without implementing equivalent custom middleware.

## Detailed Design

### Sequence Diagram

![Sequence Diagram illustrating build flow with the incremental build](./resources/0017-incremental-build/Sequence_Diagram.png)

### Current Build

The current build runs all tasks for each required project in sequence. Tasks read and write resources through a `workspace`, which represents the current project's `@ui5/fs` virtual file system. The `workspace` contains one `reader` and one `writer`. The reader usually provides the project sources. The in-memory writer collects task output before the build writes it to the target directory.

This workspace gives each task one interface for the project sources and the results of previous tasks.

![Diagram illustrating the current build flow](./resources/0017-incremental-build/Current_Build.png)

### Incremental Build Cache

A new `Project Build Cache` shall manage one `Build Stage Cache` for each build stage. The project `workspace` shall support `stage writers`. The build is an ordered sequence in which each stage has its own writer and reads the combined output of all preceding stages.

The unit of caching is a **stage**. A regular task is one stage. A task that opts into partial rebuilds becomes a *step-based task* (see [Build Task API Changes](#build-task-api-changes)) and contributes one stage per step, so its steps are cached independently.

![Diagram illustrating the central build components with the Project Build Cache and Build Task Cache](./resources/0017-incremental-build/Build_Overview.png)

The design shall support the following workflow:

**1. Initial Build**

*(see diagram below, "Initial Build")*

1. Task A, Task B, and Task C run in sequence and write their results to separate writer stages.
1. _The build writes task output to a content-addressable store and serializes stage-cache metadata to disk._
1. _After the last task runs, the build serializes the project's index and its output-file metadata mapping to disk. It writes all created or modified resources to the content-addressable store._
1. The build combines the resources from all writer stages with the source reader and writes them to the target output directory.

_The project has been built and a cache has been stored._

**2. Successive Build After a Source Change**

*(see diagram below, "Successive Build")*

1. _The build reads cache metadata from disk to determine the relevant changes and access cached content from the content-addressable store._
	* The build imports valid cached stages into the `Project` as "stage readers."
1. The build uses the imported cache and modified source paths to select tasks.
	* Task A and Task C run in this example because they requested the modified resource during their previous execution.
1. Task A runs and writes its output to a **new writer** for the associated stage.
	* Task A is a step-based task, so each of its steps is cached independently. The build cache re-runs only the steps (and, within a map step, only the keys) whose inputs changed since the last build, and restores the rest from cache.
	* In this example, Task A re-runs only the step affected by the modified resource and reuses its other steps.
	* **Note:** A task cannot access the cached stage reader of its own stages. A step can only access the combined resources of all previous writer stages, as in a regular build.
1. _The build combines new task output with cached output and serializes the new stage metadata to disk._
1. The `Project Build Cache` determines whether the resources produced in this latest execution of Task A are relevant for Task B. If yes, the content of those resources is compared to the cached content of the resources Task B received during its last execution. In this example, the output of Task A is not relevant for Task B, so it is skipped.
1. Task C runs if relevant resources changed. It can access the full stage for Task A (cache reader and new writer) and the cached stage for Task B. Task C therefore sees all resources produced by previous executions of Task A and Task B.
	* Task C is a regular task. It writes its output to a **new writer** for the associated stage.
1. _The build stores new task output in the content-addressable store and serializes stage metadata to disk._
1. The build writes the combined resources of all stages and the source reader to the target output directory.

![Diagram illustrating an initial and a successive build leveraging the build cache](./resources/0017-incremental-build/Build_With_Cache.png)

![Simplified Activity Diagram of the Incremental Build](./resources/0017-incremental-build/Overview_Activity_Diagram.png)

#### Project Build Cache

The `Project Build Cache` manages one project's build cache. It serializes and deserializes the cache and determines whether missing cache data or source and dependency changes require a new build.

It also manages one `Build Stage Cache` per stage. Each stage cache tracks the resources that its stage read and wrote.

A [Hash Tree](#hash-tree) stores and compares metadata for all source files. Its root hash is the project's `source-index signature`. The cache combines this signature with all relevant dependency-index signatures to look up a result for the current project state. A matching result lets the project skip its build.

Two hash trees track each stage's input resources. One contains project resources, and the other contains dependency resources. Their leaf hashes include resource tags, so tag and content changes both affect the root hashes. These roots combine with signatures for [non-resource inputs](#non-resource-task-inputs), such as environment variables, and configuration files outside the resource model to form the stage cache key.

See [Cache Creation](#cache-creation).

#### Build Stage Cache

The `Build Stage Cache` manages cache information for one project stage, either a regular task's single stage or one of a step-based task's per-step stages. It tracks the resources that the stage read and wrote during previous executions.

During a rebuild, it can use this information to determine whether the stage needs to be re-executed based on changes to the relevant input resources.

The `Project Build Cache` uses this information to determine whether a changed resource _potentially_ affects a stage. It defers the execution decision until the stage is next in the build order. At that point, the cache compares the stage's input resources and identifies the relevant changes.

All necessary metadata stored in the `Build Stage Cache` is serialized to disk as part of the [Build Stage Metadata](#build-stage-metadata).

### Enhancements in Existing Components

#### Project

The existing `Project` class shall support `stage writers`. A new [`Project Resources`](#project-resources) class shall manage the project's resource readers, writers, and [resource tags](#monitored-tag-collection). The `Project` class shall delegate all resource operations to this class.

Before stage writers, the `Project` class provided one `workspace` to build tasks. Its `reader` provided project sources, and its in-memory `writer` stored resources that the build created or changed.

#### Project Resources

The new `Project Resources` class shall separate resource access from the `Project` class. It shall manage the project's resource readers, writers, and tags.

`Project Resources` shall manage one resource `stage` per build stage. A regular task contributes one stage, and a step-based task contributes one stage per step. Each stage contains either a writable `writer` or a read-only `cached writer` restored from cache. Each stage also contains two `ResourceTagCollection` instances (see [resource tags](#monitored-tag-collection)).

Before a stage runs, the `Project Build Cache` shall select it in the `Project Resources` instance. Before `replaceCopyright` runs, for example, the cache selects `task/replaceCopyright`.

`Project Resources` shall initialize each new stage with an empty writer and resource tag collection. The `Project Build Cache` can replace the writer with a `cached writer` when a valid cache entry exists. It also applies cached tag operations, including operations that clear tags, to the resource tag collection.

When a task requests a `workspace`, `Project Resources` shall create a [DuplexCollection](https://ui5.github.io/cli/stable/api/@ui5_fs_DuplexCollection.html). Its `reader` combines the project sources and all previous stage writers. Its writer is the current stage writer.

For a stage's `resourceTagCollection` request, `Project Resources` shall return a `Monitored Tag Collection` around the stage's `Resource Tag Collection`. The wrapper records task tag operations for the cache (see [Monitored Tag Collection](#monitored-tag-collection)). Resource tag collections belong to the project, and each stage adds its tags as the build progresses. The `project` collection is cleared at the start of each build. The `build` collection is cleared at the end.

Stage initialization defines an explicit order. Stage names shall use `<type>/<name>`, where `<type>` identifies the stage type and `<name>` identifies the entity that created it. For example, a task stage uses `task/<taskName>`. A step-based task adds a step segment: `task/<taskName>::step/<stepName>`.

![Diagram illustrating project stages](./resources/0017-incremental-build/Project_Stages.png)

#### Monitored Reader

A `MonitoredReader` wraps a `Reader` or `Writer` and records requested resource paths and glob patterns.

The [`Resource Request Graph`](#resource-request-graph) stores this information.

#### Monitored Tag Collection

Tasks can associate key-value tags with resources during a build. Shared `TagCollection` instances store two tag types. `build` tags are available only during the current project's build. `project` tags are available to all tasks for the project and its dependencies, so tasks can pass resource information to downstream tasks across project boundaries.

A `Monitored Tag Collection` shall record tag access in the same way that a `Monitored Reader` records resource access.

The wrapper intercepts all task operations on a `Resource Tag Collection` and records each set or clear operation. The `Project Build Cache` then persists the tags produced by each task.

Build tasks can access resource tags using the `Task Util` API, which internally retrieves the `Monitored Tag Collection` for the current stage from the current `Project` instance.

After the task completes, the `Project Build Cache` retrieves the recorded tags from the `Monitored Tag Collection` and stores them as part of the stage metadata.

Each `Project Resources` instance manages two `Resource Tag Collections`, one for `build` tags and one for `project` tags. The `build` tags collection is cleared at the end of each project build and is therefore not accessible to dependent projects.

#### Project Builder

The `Project Builder` shall:

1. Let the `Project Build Cache` prepare the build by importing an existing cache from disk and comparing it with current source files (see [Cache Import](#cache-import)).
2. Skip a project build when the cache contains a valid result.
3. Let the `Project Build Cache` serialize the updated cache after the project build (see [Cache Creation](#cache-creation)).

#### Task Runner

The `Task Runner` shall:

1. Request the build signature from each task that implements `determineBuildSignature` at the start of the build (see [Build Task API Changes](#build-task-api-changes)). It shall incorporate these values into the project's build signature (see [Cache Creation](#cache-creation)).
2. For a step-based task, derive its steps once at the beginning of the build (by calling the task's factory, which is pure over its options) to register one stage per step with the `Project Build Cache`. A regular task registers a single stage.
3. Let the `Project Build Cache` prepare each stage and use valid cache data to determine whether the stage must run.
4. Execute the stage. For a step-based task, the Task Runner drives its steps through a step runner that re-runs only the steps (and, within a map step, only the keys) whose inputs changed, restoring the rest from cache. A regular task runs its full body.
5. Let the `Project Build Cache` update the cache with the stage's resource reads and outputs after execution.
	* `Monitored Reader` instances wrap the stage's `workspace` and `dependencies` interfaces and record resource access.
	* The `Project Build Cache` shall then:
		* Update the respective `Build Stage Cache` with the stage's resource requests and [non-resource inputs](#non-resource-task-inputs).
		* Compile a new "signature" for the stage's input resources and store this, along with the project's current stage instance, in the in-memory Stage Cache of the `Project Build Cache` (mapping a stage signature to an earlier cached stage instance).
		* Use the changed resource paths to identify downstream stages for potential invalidation (see [Cache Invalidation](#cache-invalidation)).

##### Processor Return Value Convention

Resource processors invoked from a task may return `undefined` for an input resource in their result array to indicate that the resource was not modified. The task runner interprets this as "use the input resource as-is" and skips the corresponding write to the writer stage. This avoids redundant cache entries and unnecessary downstream invalidation when a processor inspects but does not change a resource.

##### Build Task API Changes

A build task can opt into partial rebuilds by becoming a **step-based task**. A step-based task default-exports a `build(options) => Step[]` factory and declares a static `stepBased` flag. The factory returns an ordered list of steps that describe the work. Each step becomes its own build stage and is cached independently: on a rebuild, only the steps whose inputs changed are re-executed, and the rest are restored from cache (see [Step-Based Tasks](#step-based-tasks)).

The step API replaces an earlier design in which a task declared `supportsDifferentialBuilds()` and processed a list of changed resource paths. Moving delta bookkeeping into the build cache removes this work and its correctness risks from the task author.

Step-based tasks are available to custom tasks from Specification Version 5.0. A task opts in with a static `stepBased` export set to `true`. Absent the flag, the default export is a regular task body and runs unchanged.

A separate, independent callback lets a task contribute to the project's build signature:

* **async determineBuildSignature({log, options, taskUtil})**
	* `log`: A logger instance scoped to the task
	* `options`: Same as for the main task function. `{projectName, projectNamespace, configuration, taskName}`
	* `taskUtil`: A read-only variant of the `Task Util` API. It lets the task inspect project state, such as project configuration, before the task runs. Available to tasks with Specification Version 5.0 or higher.
	* Returns: `undefined` or a string that represents the task's build signature. The value can add task-specific configuration files, such as a TypeScript task's `tsconfig.json`, to the project build signature. A change to these files then invalidates the cache. The task must return the source value because the build calculates the hash later. If the callback is absent or returns `undefined`, the task's build signature falls back to a hash of its configuration.
	* Custom tasks providing this callback must declare Specification Version 5.0 or higher.
	* UI5 CLI calls this method once at the start of every build. It uses the return value and task configuration to calculate the task signature, then adds that signature to the project build signature (see [Cache Creation](#cache-creation)).
	* **To be discussed:** Whether the callback may also return file paths to watch for changes. A change would recalculate the build signature and invalidate the cache if the signature changed. Project-definition watching in `ui5 serve` has a different purpose because it re-resolves the graph (see [Reacting to Project-Definition Changes](#reacting-to-project-definition-changes)). Task-specific files such as `tsconfig.json` affect the build signature instead. See also [Watch Mode: Cache Invalidation](#cache-invalidation-1).

The step model detects stale output. When a step or map key stops producing an earlier output, the build cache removes that output during the rebuild. A removed input resource produces a per-key delta. The affected key then runs with fewer outputs or leaves the key set, and the cache drops outputs that no current key produces. Recorded writes let this model derive stale output without the task declaration required by the earlier `determineExpectedOutput` draft.

The `determineBuildSignature` callback follows the existing [`determineRequiredDependencies` method](https://github.com/UI5/cli/blob/main/rfcs/0012-UI5-Tooling-Extension-API-3.md#new-api-2) ([docs](https://ui5.github.io/cli/stable/pages/extensibility/CustomTasks/#required-dependencies)).

##### Step-Based Tasks

A step-based task decomposes its work into cacheable stages. Its default export is a factory with the signature `build(options) => Step[]` (an asynchronous factory is also supported). Each scalar or map step becomes one build stage. A map step contains a cache unit for each key, so a rebuild can restore unchanged keys while it runs the affected keys again.

Built-in tasks declare the step-based mode in their task definition. A custom task uses Specification Version 5.0 or higher and exports the static `stepBased` flag:

```js
export const stepBased = true;

export default function build(options) {
	return [/* step descriptors */];
}
```

The Task Runner calls the factory once near the start of each build, before it checks the step stages for cache hits. The factory receives only the same `{projectName, projectNamespace, configuration, taskName}` options object as a regular task. It must derive the step list from `options` without reading resources or other build state. Import expensive processors inside a step callback so a build that restores all steps does not load them.

###### Step List

The factory must return an array. An empty array is valid. The Task Runner validates the complete array before it registers any step stage:

* Every step must be an object with a non-empty `name` that is unique within the task. Keep the name stable between builds because it is part of the stage identity `task/<taskName>::step/<stepName>`.
* A scalar step defines `run`. It must not also define the complete `keys` and `each` pair.
* A map step defines both `keys` and `each`. Defining only one of these callbacks is invalid.
* The optional `needs` value must be an array of names from earlier steps. Forward references and self references are invalid.

Steps run in array order and use one of these shapes:

* **Scalar step:** `{name, needs?, run}`
* **Map step:** `{name, needs?, sequential?, keys, each}`

###### Callback Context

The runner calls the step callbacks with these signatures:

```js
run({needs, workspace, dependencies, taskUtil, options})
keys({needs, workspace, dependencies, taskUtil, options})
each(key, {needs, workspace, dependencies, taskUtil, options})
```

Each callback can return its result directly or through a promise. The context contains:

* `workspace`: The reader/writer for the current step or map key. All output writes must use this instance.
* `dependencies`: The optional dependency reader. It is available when the task requested dependency access.
* `taskUtil`: A monitored Task Util instance for the current step or map key.
* `needs`: A shallow-frozen object containing the return values requested from earlier steps. It is empty when the step declares no dependencies.
* `options`: The same options object that was passed to the factory.

A scalar step calls `run` once. Use a scalar step when one output depends on a set of inputs that cannot be processed independently. For example, a bundling step must run again when any bundle member changes.

A map step first calls `keys`. This callback returns an iterable of resources or strings. Returning `undefined`, `null`, or an empty iterable produces no map units. The runner then calls `each` once for every key. The `keys` callback must only enumerate keys. Put processing and output writes in `each` so the runner can attribute them to a cache unit.

Resource keys use the resource path and a content discriminator as their cache identity. String keys use the complete string. Encode a compound key as a stable string. A resource content change creates a new key identity, which causes the new unit to run and the old unit's outputs to be removed.

Map keys run concurrently by default. Their writes are buffered and flushed in key order after all keys finish. Concurrent keys must be independent and must not write the same resource path. Set `sequential: true` when a later key must read or replace an earlier key's output. Sequential writes reach the workspace immediately.

###### Step Dependencies and Return Values

The optional `needs` array declares data flow between steps. For example, `needs: ["scan"]` makes the return value of the earlier `scan` step available as `needs.scan` to `run`, `keys`, and `each`. Earlier-step references make cycles impossible.

A scalar callback or map unit can return one of these values:

* `undefined` or `null` for no return value
* One resource
* An array containing only resources
* A JSON-serializable value

The return value transfers data to dependent steps. It does not add a resource to the build output. A callback must write output resources to its `workspace`.

The runner stores serializable values with the step metadata and stores returned resources in the content-addressable store. A scalar step contributes its direct return value. A map step contributes an array of per-key return values in key enumeration order. The runner restores these values on a cache hit. A changed return value invalidates each consumer that lists the producer in `needs`.

###### Cache Tracking and Correctness

The build cache records reads, glob patterns, Task Util inputs, and tag operations from map-key enumeration at the step level. For each scalar or map unit, it records resource reads and writes, Task Util inputs, tag operations, consumed step returns, and the callback return value. A cache hit restores the unit's outputs, tags, and return value. A delta build runs a unit again when a recorded input changes. If a unit writes fewer paths than before, or a map key disappears, the cache removes outputs that the unit no longer produces.

Read project resources through the callback's `workspace` and dependency resources through its `dependencies` instance. Write outputs through the callback's `workspace`. Read non-resource inputs through the callback's `taskUtil` instance. Access through a captured reader, another writer, `process.env`, or a direct filesystem API is not recorded and can cause a stale cache result.

Keep each map key independent unless the step uses `sequential: true` for an intentional dependency between keys. Use a scalar step when the output depends on the complete input set. Keep all callbacks deterministic for the recorded inputs.

###### Map Step With Associated Metadata

The following task uses build options to select text resources and control metadata use. With `useMetadata` enabled, each map unit reads its metadata resource through its `workspace`. The runner records this read for the text-resource key, so a metadata change invalidates only the unit that depends on it.

```js
export default function build({
	pattern = "/**/*.txt",
	useMetadata = true
}) {
	return [{
		name: "processText",
		keys: async ({workspace}) => workspace.byGlob(pattern),
		each: async (resource, {workspace}) => {
			const metadataPath = resource.getPath().replace(/\.txt$/, ".meta.json");
			const metadataResource = useMetadata ?
				await workspace.byPath(metadataPath) : undefined;
			const metadata = metadataResource ?
				JSON.parse(await metadataResource.getString()) : {prefix: ""};

			const output = await resource.clone();
			output.setString(metadata.prefix + await resource.getString());
			await workspace.write(output);
		},
	}];
}
```

When `useMetadata` is enabled, the `workspace.byPath(metadataPath)` call is part of the unit's recorded input set even when no metadata resource exists. Changing, adding, or removing the associated `.meta.json` resource causes that unit to run again. Other text-resource units can remain cached.

###### Standalone Execution

`@ui5/builder/tasks/runSteps` runs the same factory outside the cached build:

```js
import runSteps from "@ui5/builder/tasks/runSteps";
import build from "./task.js";

await runSteps(build, {workspace, dependencies, taskUtil, options});
```

The helper preserves step order, `needs` values, map concurrency, ordered write flushing, and `sequential` behavior. It runs every step and key because standalone execution has no delta selection, cache persistence, or tag replay.

##### Non-Resource Task Inputs

A task's output can depend on non-resource inputs, such as an environment variable or a value read through `TaskUtil`. Examples include a dependency version from `getProject(name).getVersion()` and the result of `isRootProject()`. These values do not feed the resource indices, so an untracked change could serve a stale cached result. The `generateLibraryManifest` task, for example, writes a dependency version to the manifest `minVersion`. Removing or updating that dependency must run the task again even when no source resource changed.

The build cache records each non-resource input as `{type, name}` without storing the value in this list. It adds a signature over the current values to the stage cache key. On a later build, the cache reads each input again. A value that differs from the cached signature causes a cache miss and runs the stage again.

Task authors must read these values through the `taskUtil` interface so the cache can observe the read. Use `taskUtil.getEnv(name)` for environment variables. A direct `process.env` read or any value obtained outside the monitored `taskUtil` remains untracked and can serve stale output.

Configuration files that a task reads outside the UI5 resource model (e.g. a root `tsconfig.json` or files under `node_modules`, read via `getRootReader()`) are tracked as a separate class of input: a change to such a file re-runs the whole stage that read it (full refresh, not a per-file delta).

#### Resource Request Graph

The Resource Request Graph records a build stage's request sets across multiple executions.

The graph stores related request sets as deltas. Each node contains only the requests added relative to its parent.

Overlapping request sets produce small deltas. The graph selects the parent that minimizes the delta for each new request set.

At runtime, each unique (materialized) request set references a [`Shared Hash Tree`](#shared-hash-tree) representing the resources currently matching the request set.

#### Hash Tree

Hash trees efficiently store and compare metadata for many resources. The build cache uses them to track changes in source files and task inputs.

A hash tree is a tree data structure where each leaf node represents a resource and contains its metadata (e.g. path, size, last modified time, integrity hash, and resource tags). Each non-leaf node contains a hash that is derived from the hashes of its child nodes. The root node's hash represents the overall state of all resources in the tree.

Each leaf hash includes the resource tags. A tag change therefore changes the leaf hash and propagates to the root even when the resource content stays the same. Tasks can depend on tags such as `ui5:HasDebugVariant` and `ui5:IsBundle`, so the index signature must represent both content and tags.

When a resource changes, only the hashes along the path from the changed leaf node to the root need to be updated. This makes it efficient to update the tree and compute a new root hash.

![Hash_Tree](./resources/0017-incremental-build/Hash_Tree.png)

UI5 CLI shall calculate each source-file integrity from its raw content with SHA-256. It shall store the hash in Subresource Integrity (SRI) format (`sha256-<base64>`) for direct use as a CAS key.

Before computing a resource integrity hash, UI5 CLI shall compare these stored attributes with the current source file:
* `lastModified`: Modification time
* `size`: File size
* `inode`: Inode number

If **any** attribute differs, UI5 CLI shall compute the integrity hash to confirm the change.

Each hash tree also contains an "index timestamp", representing the last time the index has been updated from disk. This allows quick invalidation if source files have a modification time later than this timestamp.

The timestamp shall also protect against race conditions such as [Racy Git](https://git-scm.com/docs/racy-git). A file can change while the index is created without changing its timestamp. When a file modification time equals the index timestamp, the cache must compare its integrity with the stored integrity.

#### Shared Hash Tree

A `Shared Hash Tree` lets entities such as request sets share common subtrees. Shared subtrees reduce storage when request sets contain overlapping resources.

Shared Hash Trees are managed by a `Tree Registry`. Changes made to any Shared Hash Tree are queued in the Tree Registry and applied in batch when requested. This ensures consistency across all trees and optimizes performance by minimizing redundant hash calculations.

![Shared Hash Tree](./resources/0017-incremental-build/Shared_Hash_Tree.png)

### Cache Creation

The build cache shall use one **SQLite database** in WAL mode to persist content-addressable resource BLOBs and metadata across UI5 CLI executions. The CAS table stores each unique file content once. A single database avoids thousands of small files and gives cache writes transactional consistency. A `cacache` store would reintroduce file-based metadata, while LevelDB would require a separate metadata store. SQLite avoids both constraints. If a build stops during a transaction, SQLite rolls back the incomplete entry and the next build recomputes it. A future `ui5 cache verify` command may also detect corruption (see [Garbage Collection](#garbage-collection)).

Each project build has a global metadata cache that consuming projects can reuse. For example, UI5 CLI can build `sap.ui.core` once and reuse its cache for multiple applications. A [`build signature`](#build-signature) identifies the project build.

#### Source File Storage in CAS

When a project build completes, the CAS also stores **source files that no build task overlaid**. These original project sources passed through the build without a task writing them to a stage.

Dependent projects need both task output and unmodified sources from each dependency. CAS-backed readers provide this complete set and preserve a consistent version when original files change between builds (see [Race Condition Handling](#race-condition-handling)).

Only sources available to dependent projects need this storage. The existing CAS stores them as entries keyed by content-integrity hash.

A flat index maps CAS-stored source paths to metadata such as integrity and size, similar to task-output [Stage Metadata](#stage-metadata). The [Result Metadata](#result-metadata) stores this source-stage index under the project's source-index signature. A later build can use the index to skip an unchanged dependency and still read its sources from the CAS without a filesystem race.

The cache consists of the following components:
1. A `content` table acting as the global CAS, storing resource BLOBs keyed by their SRI integrity hash.
2. Metadata tables per project build (identified by its build signature):
	* `index_cache`: Serialized [Hash Tree](#hash-tree) of all **source** files of the project, as well as a list of all stages executed during the build.
	* `stage_request_metadata`: Stores all resource requests of a stage (keyed by stage id), its recorded non-resource inputs and root-reader requests, as well as serialized [Shared Hash Trees](#shared-hash-tree) representing the input resources of the stage during its last execution.
	* `stage_metadata`: Contains resource metadata for one stage. UI5 CLI uses the metadata to read content from the `content` table and restore task output or a final result assembled from multiple stages.
	* `result_metadata`: Maps a set of stage metadata that produced a final build result for a given project state (represented by the project's source index signature and the signatures of relevant dependencies).

![Cache Overview Diagram](./resources/0017-incremental-build/Cache_Overview.png)

#### Comparison with Pre-Built Projects

Incremental build caches and the "pre-built projects" from RFC 0011 both provide previous build results. Their timing, content, usage, and runtime behavior differ:

**1. Timing**

* For pre-built projects, the provided build manifest is taken into account immediately during the creation of the dependency graph and instantiation of the `Project` class (since it replaces the `ui5.yaml`).
* For projects with incremental build cache support, no build manifest exists. The presence and validity of a cache can only be validated at a later time during the build process, potentially only after dependencies have already been processed.

**2. Content**

* Pre-built projects only contain information about the final build result (i.e. the resources produced by the build).
	* The original source files are not part of the pre-built project.
	* All required resources are included in the pre-built project itself.
* Projects with incremental build cache support contain detailed metadata about the build process itself, including information about source files, tasks, and intermediate build stages.

**3. Usage**

* Pre-built projects are primarily used to distribute an already built state of a project, allowing consumers to skip rebuilding the project altogether. They cannot be built again. A prime example is the future distribution of pre-built UI5 framework libraries via npm packages.
* Incremental build caches improve local rebuild times and remain on the developer's machine or build server. Their potential size makes them unsuitable for distribution with a project.

**4. Runtime Distinction**

The two states are distinguished by the presence of a `sourceMetadata` attribute in the cached data. Only a cache entry that carries `sourceMetadata` (the source index and per-task metadata described above) can drive an incremental rebuild of the project. Without it, the entry is only a build *result*: usable for building dependent projects, but not for rebuilding the project itself.

#### Build Signature

The build signature distinguishes different builds of the same project. UI5 CLI calculates it from an internal cache-format version, the **build configuration**, the project's identity and configuration, the effective `@ui5/builder` and `@ui5/fs` versions, and the aggregated `determineBuildSignature` contributions from all tasks. The package versions prevent an upgrade that changes task output from reusing an incompatible cache.

UI5 CLI uses the signature to select an existing cache. A `jsdoc` build and a regular build produce different signatures and separate database entries.

The signature is a hash represented as a hexadecimal string.

A mechanism for custom tasks to contribute to the build signature via `determineBuildSignature()` is defined in the Task API.

### Cache Key Overview

All cache data lives in one SQLite database (see [Cache Directory Structure](#cache-directory-structure)). The key definitions below describe each table without requiring a code trace.

Every metadata table shares two leading key columns:

* **`project_id`**: the project's unique Specification id (`project.getId()`), scoping all of a project's rows.
* **`build_signature`**: identifies one *kind* of build of that project (decomposed below). A regular build, a `jsdoc` build, and a serve-mode build each produce a distinct build signature and therefore separate, non-colliding rows.

The database stores these entities:

| Table | Key columns | Holds |
|-------|-------------|-------|
| `content` | `integrity` | A single resource's content, gzip-compressed. The content-addressable store (CAS). |
| `index_cache` | `project_id`, `build_signature`, `kind` | The source [index](#index-cache) (hash tree + stage list). `kind` is `"source"`. |
| `stage_metadata` | `project_id`, `build_signature`, `stage_id`, `stage_signature` | One stage's output ([Stage Metadata](#stage-metadata)): resource metadata, tag operations, and (for step stages) per-key invocation data. |
| `stage_request_metadata` | `project_id`, `build_signature`, `stage_id`, `type` | One stage's recorded inputs ([Build Stage Metadata](#build-stage-metadata)): resource request graphs and non-resource inputs. `type` is one of `project`, `dependencies`, `input`, `root`, `root-no-gitignore`. |
| `result_metadata` | `project_id`, `build_signature`, `stage_signature` | The mapping from one project state to the set of stages that produced its [build result](#result-metadata). Here `stage_signature` is a *result* signature (decomposed below). |

`stage_id` is the id of a stage: `task/<taskName>` for a regular task, or `task/<taskName>::step/<stepName>` for a step-based task's step.

#### Build-Signature Composition

The build signature is one SHA-256 hex digest over these values in order:

* an internal `BUILD_SIG_VERSION` constant (bumped on an incompatible cache-format change)
* the build configuration (e.g. the set of enabled tasks, the build mode)
* the aggregated `determineBuildSignature()` contributions of all tasks (each contribution falling back to a hash of the task's configuration when the callback is absent)
* the project's id (`project.getId()`) and its full configuration
* the effective versions of `@ui5/builder` and `@ui5/fs` (so a package upgrade that changes task output cannot silently reuse an incompatible cache)
* the `@ui5/project` version

#### Stage-Signature Composition

`stage_metadata` stores stage output under a tuple of **four independent components**. Each component is a SHA-256 hex digest. A `-` joins them, and the separator cannot occur inside a hex digest, so the split is lossless:

```
<projectIndexSignature>-<dependencyIndexSignature>-<inputSignature>-<rootSignature>
```

* **`projectIndexSignature`**: root hash of the stage's project-resource index (a [Hash Tree](#hash-tree) over the project resources the stage read, tags included). The placeholder `X` when the stage read no project resources.
* **`dependencyIndexSignature`**: root hash of the stage's dependency-resource index. The placeholder `X` when the stage read no dependency resources.
* **`inputSignature`**: hash over the stage's recorded [non-resource inputs](#non-resource-task-inputs), evaluated to their current values. A fixed empty-set digest when the stage read none.
* **`rootSignature`**: hash over the signatures of the stage's root-reader requests (configuration files outside the resource model, see [Non-Resource Task Inputs](#non-resource-task-inputs)). A fixed empty-set digest when the stage made none.

Keeping the four as separate slots lets a delta lookup pair a changed project or dependency signature with the *current* input and root signatures directly, without a reverse mapping from a combined value.

#### Result-Signature Composition

`result_metadata` stores a complete project state under a tuple of four `-`-joined components:

```
<sourceSignature>-<combinedDependencySignature>-<aggregatedInputSignature>-<aggregatedRootSignature>
```

* **`sourceSignature`**: root hash of the project's source index (all source files, see [Index Cache](#index-cache)).
* **`combinedDependencySignature`**: a hash over the per-stage dependency signatures, taken in stage order. On lookup, the candidate keys are the cartesian product of each stage's possible dependency signatures, so a stage carrying a dependency delta contributes more than one candidate.
* **`aggregatedInputSignature`**: a hash over all stages' input signatures (order-independent: the per-stage signatures are sorted before hashing).
* **`aggregatedRootSignature`**: a hash over all stages' root signatures.

Separate input and root slots make an environment or root-configuration change miss the result cache. UI5 CLI then continues to the per-stage checks because the result-cache check runs first.

#### Content Integrity (CAS Key)

The `content` table uses an `integrity` SRI string (`sha256-<base64>`) over the uncompressed resource bytes as its only key. Global scope across projects and build signatures stores identical content once. Other tables reference content indirectly through the `integrity` value in their resource metadata.

### Index Cache

```jsonc
{
	"indexTimestamp": 1764688556165,
	"indexTree": { /* Serialized hash tree */ },
	"stages": [ // <-- Stage list: execution order of stages and whether each ran the step runner (1 = step-based, 0 = regular task)
		["task/replaceCopyright::step/replaceCopyright", 1],
		["task/minify::step/minify", 1],
		["task/generateComponentPreload", 0],
	]
}
```

The index provides metadata for all project **source** files. UI5 CLI uses it to detect source changes since the last build. The current project [build signature](#build-signature) is its key.

The metadata is represented as a [`Hash Tree`](#hash-tree), making updates efficient and allowing the generation of a single "project-index signature" representing the current state of all indexed resources.

The index cache also lists the stages in execution order and records whether each stage ran the step runner. UI5 CLI uses the list to deserialize cached [Build Stage Metadata](#build-stage-metadata).

#### Index Signature

An index signature, such as the `source-index signature`, is the unique root hash of a shared hash tree. It represents a resource set, including its tags. The set can contain all project sources or the input resources of one build stage. Any resource or tag change produces a different index signature.

UI5 CLI uses these signatures as cache keys for fast existence checks.

### Build Stage Metadata

**Initial Request Set**

```jsonc
{
	"requestSetGraph": {
		"nodes": [{
			"id": 1,
			"parent": null,
			"addedRequests": [
				"patterns:[\"/resources/**/*.js\",\"!**/*.support.js\"]"
			]
		}],
		"nextId": 2
	},
	"rootIndices": [{
		"nodeId": 1,
		"resourceIndex": { 
			"indexTimestamp": 1764688556165,
			"indexTree": { /* Serialized hash tree */ }
		}
	}],
	"deltaIndices": []
}
```

**Request Set With Deltas**

```jsonc
{
	"requestSetGraph": {
		"nodes": [{
			"id": 1,
			"parent": null,
			"addedRequests": [
				"patterns:[\"/resources/**/*.js\",\"!**/*.support.js\"]"
			]
		}, {
			"id": 2,
			"parent": 1,
			"addedRequests": [
				"path:/resources/project/namespace/Component.js"
			]
		}],
		"nextId": 3
	},
	"rootIndices": [{
		"nodeId": 1,
		"resourceIndex": { 
			"indexTimestamp": 1764688556165,
			"indexTree": { /* Serialized hash tree */ }
		}
	}],
	"deltaIndices": [{
		"nodeId": 2,
		"addedResourceIndex": [{
			"path": "/resources/project/namespace/Component.js",
			"lastModified": 1764688556165,
			"size": 1234,
			"inode": 5678,
			"integrity": "sha256-R70pB1+LgBnwvuxthr7afJv2eq8FBT3L4LO8tjloUX8="
		}]
	}]
}
```

Build Stage Metadata stores a stage's resource requests and serialized [Shared Hash Trees](#shared-hash-tree) for the inputs from its last execution. Each stage id, such as `task/minify::step/minify`, identifies one entry. The entry also records [non-resource inputs](#non-resource-task-inputs) and root-reader requests.

A serialized [`Resource Request Graph`](#resource-request-graph) stores the resource requests. Only the root Shared Hash Tree is serialized. Delta indices store additions for derived trees, which lets UI5 CLI reconstruct every Shared Hash Tree in memory.

### Stage Metadata

```jsonc
	"resourceMapping": {
		"/resources/project/namespace/": 0,
		"/test-resources/project/namespace/": 0,
		"/": 1
	},
	"resourceMetadata": [
		{
			// Virtual paths written by the task during execution, mapped to their cache metadata
			"/resources/project/namespace/Component.js": {
				"lastModified": 176468853453,
				"size": 4567,
				"integrity": "sha256-EvQbHDId8MgpzlgZllZv3lKvbK/h0qDHRmzeU+bxPMo="
			}
			// Virtual paths written by the task during execution, mapped to their cache metadata
			"/resources/project/namespace/Helper.js": {
				"lastModified": 1770643600860,
				"size": 473,
				"integrity": "sha256-gd33pMM2gCTxqoYxZyUYSsCKLhO+lZfFXT7MKUl7DSM="
			}
		},
		{
			// Virtual paths written by the task during execution, mapped to their cache metadata
			"/index.html": {
				"lastModified": 176468853453,
				"size": 124,
				"integrity": "sha256-R70pB1+LgBnwvuxthr7afJv2eq8FBT3L4LO8tjloUX8="
			}
		}
	],
	"projectTagOperations": {
		"/resources/project/namespace/Component.js": {
			"ui5:HasDebugVariant": true, // Set tag
		}
	},
	"buildTagOperations": {
		"/resources/project/namespace/Component.js": {
			"ui5:IsBundle": undefined, // Cleared tag
		}
	}
```

Stage Metadata describes all resources written by one stage. UI5 CLI uses it to read resource content from the content-addressable store and restore resource tags.

The `resourceMapping` maps virtual path prefixes to indices in the `resourceMetadata` array. Some UI5 project types map multiple virtual paths to the same physical path. For an `application` project, for example, the root path `/` and the namespaced path `/resources/my/app/` both map to the `webapp` sources. Both prefixes therefore reference `resourceMetadata` entry `0` in the example. A generated root-level resource can use a separate entry such as index `1`.

The stage cache signature keys the stage metadata. [Stage-Signature Composition](#stage-signature-composition) defines its four components. An `X` placeholder replaces an empty project or dependency component. Empty input and root components use a fixed empty-set digest.

A step-based stage embeds per-key invocation data in the stage-metadata entry. The output and the data that records each key's reads and writes therefore use the same stage signature.

The metadata contains every resource **written** by the stage, including its `lastModified`, `size`, and `integrity` values. Downstream stages use this information to determine whether they must run again. The metadata also records tag set and clear operations. Cache restoration applies these operations, and downstream input hash trees include the resulting tags in their leaf nodes. Tag changes therefore affect the index signatures used for invalidation.

**Simplified Stage Metadata**

Project types without path mapping, such as `module`, can store one `resourceMetadata` object that maps virtual paths directly to cache metadata. They do not need a separate `resourceMapping`:

```jsonc
	"resourceMetadata": {
		// Virtual paths written by the task during execution, mapped to their cache metadata
		"/resource/path/Example.js": {
			"lastModified": 176468853453,
			"size": 4567,
			"integrity": "sha256-EvQbHDId8MgpzlgZllZv3lKvbK/h0qDHRmzeU+bxPMo="
		}
	}
```

### Result Metadata

```jsonc
{
	// Each stage id maps to the four-component stage signature its output was stored under:
	// "<projectIndex>-<dependencyIndex>-<input>-<root>" (see "Stage-Signature Composition").
	// "X" marks a slot that read nothing. Empty input and root slots each carry an empty-set
	// digest ("b4e2d1a09f8c7d60" / "e3b0c44298fc1c14" below). Hashes are shortened for readability.
	"stageSignatures": {
		"task/escapeNonAsciiCharacters::step/escapeNonAsciiCharacters": "614d99a154560090-X-b4e2d1a09f8c7d60-e3b0c44298fc1c14",
		"task/replaceCopyright::step/replaceCopyright": "e1e95e8939eda1c4-X-7b9f0c2a1d4e5f60-e3b0c44298fc1c14",
		"task/replaceVersion::step/replaceVersion": "564593c13f783c6d-X-b4e2d1a09f8c7d60-e3b0c44298fc1c14",
		"task/replaceBuildtime::step/replaceBuildtime": "d4f21ef86ef20170-X-7b9f0c2a1d4e5f60-e3b0c44298fc1c14",
		"task/generateLibraryManifest": "5b04940ceb72b0e7-X-2c7d1a9b3e8f4056-e3b0c44298fc1c14",
		"task/enhanceManifest::step/enhanceManifest": "cf1c319946bf577d-X-b4e2d1a09f8c7d60-e3b0c44298fc1c14",
		"task/generateLibraryPreload": "dea7afdd9c4bcfd0-X-b4e2d1a09f8c7d60-e3b0c44298fc1c14",
		"task/generateBundle": "9817778bd77caa6e-82a660a818563004-b4e2d1a09f8c7d60-e3b0c44298fc1c14",
		"task/buildThemes::step/buildThemes": "c027e3e5bcb1577c-66198298279add82-b4e2d1a09f8c7d60-e3b0c44298fc1c14"
	}
}
```

In this example, the `replaceCopyright` and `replaceBuildtime` steps carry a non-empty **input** signature because they read the quantized build time through `taskUtil`. `generateLibraryManifest` also carries one because a dependency version enters as a non-resource input, which leaves its **dependency** slot as `X`. Only `generateBundle` and `buildThemes` read dependency resources.

The cache stores Result Metadata under a four-component *result signature*: the source-index signature, a combined dependency signature over all stages, an aggregated input signature, and an aggregated root signature. [Result-Signature Composition](#result-signature-composition) defines these components.

The metadata maps this key to the [Stage Metadata](#stage-metadata) for every stage in the final result. Combining those stages with the current sources recreates the complete project output. Result metadata also includes the index of [source files stored in the CAS](#source-file-storage-in-cas), so dependent projects can resolve these resources when a later build skips the dependency.

### Cache Directory Structure

Each cache version stores all data in one SQLite database file:

```
~/.ui5/buildCache/v0_<N>/
`-- cache.db          # Single SQLite database (WAL mode)
    Tables:
    |-- content          # CAS: resource BLOBs keyed by integrity hash
    |-- index_cache      # Source/result index trees
    |-- stage_metadata   # Per-stage results
    |-- stage_request_metadata  # Per-stage resource request graphs and non-resource inputs
    `-- result_metadata  # Build result mappings
```

UI5 CLI shall add a `buildCache` directory under `~/.ui5/`. The [`UI5_DATA_DIR` environment variable](https://ui5.github.io/cli/stable/pages/Troubleshooting/#environment-variable-ui5_data_dir) can configure its location.

Tables are configured for primary-key lookups only, and SQLite pragmas are tuned for cache-style workloads (WAL journaling, increased page size, memory-mapped reads, and a busy timeout to tolerate concurrent openers).

The database gzip-compresses content and large metadata BLOBs before storage. It keeps tiny resources uncompressed because gzip overhead would exceed the saving.

![Diagram illustrating the creation of a build cache](./resources/0017-incremental-build/Create_Cache.png)

### Cache Import

Before building a project, UI5 CLI shall calculate the current [build signature](#build-signature) and search the [cache directory structure](#cache-directory-structure) for a matching index cache.

The cache shall:

1. Compare the project source files with the deserialized hash tree to find changes since the last build.
2. Restore `Build Stage Cache` instances from their [Build Stage Metadata](#build-stage-metadata).
3. Give the `Project` readers for cached writer stages, which contain task output.
	* To read a cached resource, UI5 CLI looks up its content hash in [Stage Metadata](#stage-metadata) and reads that hash from the database `content` table.
4. Provide CAS-backed dependency readers.
	* A dependent build reads task output and unmodified dependency sources through CAS-backed readers (see [Source File Storage in CAS](#source-file-storage-in-cas)). The reader interface hides the storage source from build tasks.

The imported stage readers give each task the preceding task results without separate filesystem readers or physical copies for every stage.

![Diagram illustrating the import of a build cache](./resources/0017-incremental-build/Import_Cache.png)

### Cache Invalidation

The following diagram shows how UI5 CLI determines whether a project needs a partial rebuild and which tasks must run.

A `Build Stage Cache` has two invalidation states. A modified resource that the stage previously read makes the cache *potentially* invalid. A confirmed content change makes it *definitely* invalid. Potential invalidation defers the content comparison until the stage is ready to run. The resource can change again before then, so the deferred comparison can avoid unnecessary work.

After a stage runs and writes its resources, the cache shall compare their content with the previous result. Unchanged output must not invalidate downstream stages. Changed output shall notify the relevant `Build Stage Cache` instances and can make them *potentially* invalid.

The build cache owns per-stage and per-key selection, so a step-based task does not filter the changed set. Changed paths map to the steps and map keys that previously read them. The cache runs those units and restores the others. This recorded mapping also handles inputs without a one-to-one output relation, such as a source map referenced by a script. Task authors remain responsible for reading and writing only through step callback arguments so the cache observes every input (see [Step-Based Tasks](#step-based-tasks)).

After a *project* has finished building, a list of all modified resources is compiled and passed to the `Project Build Cache` instances of all dependent projects (i.e. projects that depend on the current project and therefore might use the modified resources).

### Concurrency

SQLite's WAL mode provides the necessary concurrency control at the database level: multiple readers can operate concurrently, and a single writer is serialized automatically by SQLite. No external lock files are needed for raw database I/O.

Within a single UI5 CLI process, the cache manager that owns the SQLite connection is a singleton per cache directory and shared across all consumers (e.g. multiple builds triggered by the server all use the same cache manager). The underlying database is closed only when the last consumer releases it, so that one consumer cannot prematurely close handles that another still depends on.

#### Cross-Process Build Coordination

SQLite's database-level concurrency does not, on its own, coordinate higher-level build activity across processes. Consider this scenario:

* Process 1 is building projects `a` and `b`, where `a` depends on `b`.
* Process 2 starts a build for project `c`, which also depends on `b`.

Process 2 must wait until Process 1 has finished building `b` before reading `b`'s cache. Once `b` is built, however, Process 2 should be free to read `b`'s cache and proceed with building `c` immediately, even while Process 1 is still building `a`.

A shared or exclusive lock shall coordinate each **build signature**:

* A process building a project takes an **exclusive lock** on that project's build signature for the duration of the build.
* A process reading a project's cache (e.g. as a dependency, or to skip rebuilding entirely) takes a **shared lock** on the build signature for the duration of the read.

Multiple shared locks may coexist. An exclusive lock is incompatible with any other lock. In the scenario above, Process 1 releases its exclusive lock on `sig(b)` as soon as `b`'s build commits, so Process 2's pending shared-lock acquisition on `sig(b)` then succeeds even though Process 1 still holds an exclusive lock on `sig(a)`.

The cache shall store **filesystem-based locks** beside the database in a build-signature keyed `locks/` directory. SQLite rows cannot provide the required process-level build coordination.

#### Determining Whether the Cache Can Be Used

A process first takes a **shared lock** and reads the cache. If no valid entry exists, it releases the shared lock, takes an **exclusive lock**, and checks again because another process might have completed the build. The process then builds the project or downgrades to a shared lock when the cache now exists.

### Race Condition Handling

A multi-project build processes projects in dependency order. A user or editor can modify project A after its build finishes but before dependent project B finishes. Direct filesystem reads would then give B a modified version of A that is inconsistent with A's build output.

The CAS resolves this race by storing A's source files when A's build finishes (see [Source File Storage in CAS](#source-file-storage-in-cas)). Project B reads these resources with the integrity hashes recorded during A's build. Later filesystem modifications cannot change the version that B sees.

**Source Index Validation:** At the end of each project build, UI5 CLI compares the source index recorded at build start with the current files on disk. A source change during the build fails validation. UI5 CLI then discards the inconsistent cache and build result. In watch mode, the build server resets the affected source-index state and queues the project for another build.

**Scope:** CAS snapshots protect **dependency resources only**. The root project's sources remain current build inputs and are read from the filesystem. [Watch mode](#watch-mode) detects root-source changes during a build and schedules another build.

**Interaction With Watch Mode:** A dependency source change during or after the current build schedules another build. The current build uses the consistent CAS snapshot. The next build reads the change and rebuilds affected projects.

### Garbage Collection

A mechanism to free unused cache resources is required. The SQLite database can grow over time as new project versions and build configurations accumulate entries.

**To be discussed:** The initial candidate is LRU eviction based on last-access timestamps or entry age. It would run as a non-blocking step after a successful `ui5 build` or `ui5 serve` when the cache exceeds configured age or size thresholds.

A dedicated `ui5 cache clean` command shall allow users to manually purge the cache. It shall perform a full wipe of both the build cache and the downloaded framework packages, with a `--force` flag to skip the interactive confirmation for use in CI. Selective purging by criteria such as maximum age or size is out of scope for now. A command `ui5 cache verify` may additionally be provided to check the integrity of the cache. As a fallback, users can delete the `~/.ui5/buildCache/` directory to clear the build cache.

### Watch Mode

The build API shall provide a watch mode that starts another build after a source change. The filesystem watcher shall debounce rapid changes from operations such as auto-save or format-on-save. Watch mode shall select projects from the requested build set. A [UI5 CLI workspace](https://sap.github.io/ui5-tooling/stable/pages/Workspace/) can configure this set further.

The server shall use watch mode to rebuild changed projects and serve updated resources.

#### Cache Invalidation

The `ui5 serve` command reacts to changes in the project-definition files (`ui5.yaml`/`--config`, `package.json`, workspace config, dependency-definition file) by re-resolving the graph and re-creating the serving stack (see [Reacting to Project-Definition Changes](#reacting-to-project-definition-changes)).

**To be discussed:** Whether `ui5 build --watch` shall watch project-definition files in addition to relevant sources, and whether either mode shall watch other build-signature inputs such as `tsconfig.json`. A change to a signature input selects a different cache. It does not re-resolve the project graph.

#### Error Handling

If a task fails in watch mode, UI5 CLI shall log the error and keep the watcher active for later changes. A configuration option shall control this behavior.

The cache shall keep successful task results from before the error. The next build shall run only the failed task and its downstream tasks again.

### Server Integration

![Diagram illustrating the integration of the incremental build in the UI5 CLI server](./resources/0017-incremental-build/Server_Overview.png)

The UI5 CLI server integrates the incremental build via `BuildServer`, which pre-builds projects before serving and watches for source changes, automatically rebuilding affected projects and their dependents.

The `buildThemes` task replaces middleware such as `serveThemes`, which compiles LESS resources to CSS.

The server also executes custom tasks from the root project and its dependencies. A project that uses custom tasks can therefore be consumed as a dependency without equivalent middleware in the root project.

Serve mode excludes expensive development-optional tasks, such as minification and bundle or preload generation, by default. A full build takes longer than the server's current on-demand processing. Users can disable other tasks through CLI parameters or `ui5.yaml`. The enabled task set is part of the [build signature](#build-signature), so serve mode and regular builds use separate cache entries. The duplicate entries are the accepted cost of different task sets.

While a project rebuild runs, the server pauses requests for that project's resources. This prevents outdated or partial responses. Requests for unaffected projects continue normally.

The server emits `buildFinished`, `sourcesChanged`, and `error` events for middleware and future live-reload implementations.

#### Reacting to Project-Definition Changes

Project-definition changes require a fresh graph because they can change projects, dependencies, or configuration. These files include `ui5.yaml` or a custom `--config` file, `package.json`, the workspace configuration, and static dependency definitions. A Git branch switch commonly changes several of them. Source changes need only a rebuild inside `BuildServer`.

A `Supervisor` shall own the stable HTTP socket, wrap `BuildServer`, and recreate the serving stack after a definition change:

* A `ProjectDefinitionWatcher` shall watch the definition files. It emits `definitionChanging` when a change begins and `definitionChanged` after changes settle. A burst such as a branch switch then causes one reinitialization for the complete set of changed files.
* On `definitionChanged`, the `Supervisor` shall resolve a new graph and build a new serving stack (graph + Express app + `BuildServer`) before tearing down the old one. The HTTP port stays bound throughout, and requests are routed to the new stack once it is ready. Should the new graph fail to resolve or build, the previous stack keeps serving.
* On `definitionChanging`, the current `BuildServer` shall reject waiting reader requests, fail new requests immediately, and stop its build loop. This prevents hanging requests and repeated build aborts while a branch switch writes files. Serving resumes after the swap.

A failed re-resolve shall put the server in a *degraded* state. The last-good stack keeps the port bound, but its graph no longer matches the files on disk, so every request fails. Browser navigation shows an error page, other requests receive a plain error response, and the interactive console reports the degraded state. The server shall retry automatically because a branch switch might still be writing files. It uses a fixed budget of fast attempts followed by indefinite slow polling until a re-resolve succeeds or a new definition change supersedes it. Before each attempt, the server waits for the filesystem to settle and re-resolves until the project set is stable. This wait is broader than the definition watcher's initial burst window because it must observe roots introduced by a new graph that the current graph does not watch. A successful re-resolve clears the degraded state.

This graph-reload design covers project-definition files. [Watch Mode: Cache Invalidation](#cache-invalidation-1) covers other build-signature inputs such as `tsconfig.json`.

#### Background Cache Validation

Before a project builds in the current session, the server knows its build signature. The validity of any disk cache for the current sources remains unknown. If validation waits for a reader request, the first request pays for cold-cache I/O. The server also cannot distinguish a valid cache from a pending rebuild before that request.

`BuildServer` keeps this work off the request path with a **background cache validation** pass between build cycles. After a cycle drains, it visits projects with unknown or newly invalidated cache status in dependency-first order. Each `Project Build Cache` validates its cache against current sources. A valid result marks the project current. A stale result queues a rebuild.

These activity states describe the server's current work. Project cache status remains separate:

* `IDLE`: no build active and nothing pending. The server is ready.
* `SETTLING`: a rebuild is pending but deferred until changes quiesce. No build is active yet.
* `BUILDING`: a build cycle is in flight.
* `VALIDATING`: a background validation pass is in flight. No build is currently scheduled.
* `ERROR`: the last build cycle failed.

Project staleness is orthogonal to these states and tracked per project: the server can be `IDLE` while some lazily-built projects remain stale, awaiting a reader request or the next validation pass. A source change while a project is being validated defers its rebuild and moves the server to `SETTLING`. A reader request against a project awaiting validation joins the current pass and avoids an ad-hoc rebuild. When `--cache=Force` is set, building a project whose cache is stale is an error, since Force forbids any rebuild.

#### Live Reload

The server provides live-reload functionality to inform connected browsers about changes in the build result and trigger an automatic page reload. This shortens the edit/test cycle: after saving a source file, the user does not need to manually refresh the browser to see the result.

Live reload uses these components:

* The `BuildServer` emits a debounced `sourcesChanged` event whenever watched source files change. A burst of file changes (e.g. from saving multiple files at once or from editor format-on-save) results in a single notification.
* A `liveReloadClient` middleware serves a client script at `/.ui5/liveReload/client.js`.
* The `serveResources` middleware injects a `<script>` tag referencing this client into the `<head>` of HTML responses. Injection happens as early as possible in the document so the WebSocket connection is established before any application script runs.
* A WebSocket server is attached to the HTTP server at `/.ui5/liveReload/ws`. On `sourcesChanged`, it broadcasts a `{type: "reload"}` message to all connected clients, which then reload the page.
* To prevent intermediate proxies from idle-closing the WebSocket, the client sends a `{type: "ping"}` message every 30 seconds while the connection is open. The server echoes the same message back.
* When the WebSocket connection is lost (e.g. because the server was restarted), the client polls the WebSocket endpoint every second and reloads the page once the server accepts connections again. While the browser tab is hidden, polling pauses until it becomes visible.

The `Supervisor` shall attach the WebSocket server to its stable HTTP socket. Clients shall subscribe through a relay so their connections survive a definition-change swap (see [Reacting to Project-Definition Changes](#reacting-to-project-definition-changes)). Only an HTTP server restart triggers the reconnect path.

##### Authorization

Browser-originated upgrades carry an `Origin` header and require a per-process token to mitigate cross-site WebSocket hijacking. Server startup generates a 72-bit random token, encodes it with base64url, and inserts it into the client script template. Clients pass the token in a `?token=` query parameter. The server uses a constant-time comparison.

Upgrades without an `Origin` header cannot come from a browser context governed by the Same-Origin Policy, so they do not require the token. Such clients already have unauthenticated HTTP access to the development server.

Reconnect probes from clients loaded before a server restart cannot know the new token. They use the `ui5-ping` WebSocket subprotocol. The server accepts these handshakes without a token check and closes the connection without enrolling the socket. The closed connection confirms that the server is available without exchanging data.

`ui5 serve` enables live reload by default. Users can control it with:

* The CLI flag `--live-reload` / `--no-live-reload` for `ui5 serve`.
* The project configuration setting `server.settings.liveReload` in `ui5.yaml`. This setting requires Specification Version 5.0 or higher.

The CLI flag overrides the project configuration. When neither is set, live reload defaults to `true`.

#### Embedding UI5 Middleware in an External Server

Graph swaps require middleware assembly and HTTP-listener ownership to be separate because the socket stays bound while the middleware stack is rebuilt. A public `serveMiddleware()` API in `@ui5/server` shall provide the same separation to tools that own an HTTP server, such as a custom Express application.

`serveMiddleware(graph, options)` shall expose the same UI5 readers and standard and custom middleware chain as connect/Express-compatible middleware. The caller mounts it through `app.use(middleware)` and owns the port, protocol, surrounding routes, and error handling. The caller also owns socket binding, the live-reload WebSocket server, and terminal error handling. A `close()` function shall release the underlying `BuildServer` watcher and cache handle during teardown.

## Integration in UI5 CLI

The `ui5 serve` command integrates the incremental build via `BuildServer`. On startup, it builds the configured projects and watches for file changes, automatically rebuilding affected projects.

`ui5 build` and `ui5 serve` shall add these arguments:

* `--cache`: Controls how the build cache is used.
	* Modes:
		* `Default`: Use the cache if available
		* `Force`: Use the cache only. If it is incomplete or invalid, fail the build
		* `ReadOnly`: Read an existing cache without creating or updating entries (useful for CI/CD)
		* `Off`: Do not use the cache at all
	* The previous `--cache-mode` argument, which controlled framework dependency resolution caching, has been renamed to `--snapshot-cache` to avoid the naming collision with the build cache.
* `--watch`: Enables watch mode, causing the build to be re-triggered whenever a source file or relevant configuration file changes.
	* This parameter is only relevant for the `ui5 build` command. The `ui5 serve` command always uses watch mode internally.

`ui5 serve` shall also add this argument:

* `--live-reload` / `--no-live-reload`: Controls whether the browser automatically reloads when project sources change. Defaults to `true`. Overrides the `server.settings.liveReload` setting in the project's server configuration.

A new project configuration setting `server.settings.liveReload` is introduced for Specification Version 5.0 and higher, controlling the same behavior at the project level.

## Teaching Approach

The server architecture now builds projects before serving them. Server startup and the delay between a source edit and its browser response can therefore increase.

Incremental builds and task selection reduce this cost. The documentation must explain task selection, and the default task set must give most projects acceptable development performance.

Server-side task execution can replace or conflict with existing custom middleware. **Projects might need to adapt their configuration.**

UI5 CLI documentation and blog posts should explain these changes. Pre-releases should collect community feedback before the stable release.

## Drawbacks

* For every file change, the server needs to execute a partial build. This can lead to a longer time between making a source file change and seeing the result in the browser.
	* Measurements should cover different systems because performance varies with project size and task selection.
	* The ability to disable individual tasks for the server can help to mitigate this problem.
		* **To be discussed:** Whether task configuration should distinguish production-only tasks from server-only tasks.
* Projects might have to adapt their configurations.
* Custom tasks might need to be adapted. Previously, they could only access the sources of a project. With this change, they will access the build result instead. Access to the sources is still possible but requires the use of a dedicated API.
* UI5 CLI standard tasks need to use the new cache API. Bundling tasks currently cannot recreate only part of a bundle, which limits incremental build performance.
* The SQLite database can grow over time. An automatic [garbage collection](#garbage-collection) mechanism is needed for managing disk space (not yet implemented). The `ui5 cache clean` command shall only offer a full wipe, not selective eviction.

## Alternatives

The UI5 CLI server could apply custom middleware from dependencies as an alternative to incremental builds.

### Server-Sent Events (SSE) for Live Reload

Server-Sent Events were considered as an alternative transport. Without HTTP/2, SSE has a [per-browser limit of six open connections](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) across all tabs connected to the same server. UI5 server defaults to HTTP/1.1, while HTTP/2 requires `--h2`, so most sessions have this limit. Live reload would reserve one connection for SSE and leave five for resources. SSE connections could then block further requests. For example, the OpenUI5 `test.html` page loads QUnit test suites through iframes and could reach the limit. WebSockets avoid this constraint and are the selected transport.

## Outlook and Future Ideas

* Allow tasks to store additional information in the cache.
* Track processor-library versions as step inputs: a step's output can depend on the version of a processor library (e.g. terser, less-openui5) that is not yet a tracked [non-resource input](#non-resource-task-inputs), so a step can serve stale output across a processor-library upgrade until that version is routed through the step's `taskUtil`.
* Add filesystem-based shared and exclusive locks per build signature if parallel builds of the same project occur often enough to require coordination (see [Concurrency](#concurrency)). SQLite database concurrency does not coordinate build activity.
* Add a debug command (e.g. `ui5 cache verify`) to verify the integrity of a cache by rebuilding the project and comparing the result with the cache.
