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

This concept adds incremental build support to UI5 CLI. It enables executing a build where only a small set of modified resources is re-processed while the rest is reused from a previous build.

## Motivation

The current build process for UI5 projects can be rather slow. For a large project, like some of the framework-internal libraries, a full build can take several minutes. On every build, usually all projects need to be processed by executing a series of build tasks. Often however, only few resources have actually changed between builds. By adding advanced caching functionality to the build process, UI5 CLI would become capable of performing incremental builds, detecting which resources changed and only processing those changes, reusing previous build results whenever possible. This is expected to speed up the build process for UI5 projects significantly.

It has also become increasingly common for UI5 projects to use [custom build tasks](https://sap.github.io/ui5-tooling/stable/pages/extensibility/CustomTasks/). Popular examples include the community-maintained custom tasks for TypeScript compilation ([`ui5-tooling-transpile`](https://github.com/ui5-community/ui5-ecosystem-showcase/tree/main/packages/ui5-tooling-transpile)), or for consuming third-party libraries ([`ui5-tooling-modules`](https://github.com/ui5-community/ui5-ecosystem-showcase/tree/main/packages/ui5-tooling-modules)).

These tasks can enhance the development experience with UI5. However, when working on projects that depend on projects using such custom tasks, it can become cumbersome to set up a good development environment. In part, this is because the current UI5 CLI development server does not execute build tasks, and instead relies on middleware (including [custom middleware](https://sap.github.io/ui5-tooling/stable/pages/extensibility/CustomServerMiddleware/)) to process resources during development. For this, only (custom) middleware defined on the current root project is used. This means that the root project often also needs to configure custom middleware *for its dependencies*, if those need any.

By enhancing the UI5 CLI server to **execute an incremental build** before starting the development server for a project, any custom tasks defined in dependencies are executed automatically, solving the above problem. The performance gain achieved through the incremental build feature enables us to replace most middleware with their task counterparts while maintaining a similar or even improved development experience.

This simplifies the configuration of UI5 projects, especially when working with multiple interdependent projects. It also simplifies the development of UI5 CLI extensions, as custom tasks can now be used in more scenarios without requiring custom middleware implementations.

## Detailed design

### Sequence Diagram

![Sequence Diagram illustrating build flow with the incremental build](./resources/0017-incremental-build/Sequence_Diagram.png)

### Current Build

The current build process executes all build tasks for the required projects one by one. Tasks read and write resources from and to a `workspace` entity, which is a representation of the virtual file system of `@ui5/fs` for the current project. A `workspace` currently consists of a single `reader` and a `writer`. While the reader is usually connected to the sources of the project, the writer is an in-memory object that collects the output of the build tasks before it is finally written to the target output directory.

With this setup, a build task can always access the result of the previous tasks, as well as the project's sources, through a single interface.

![Diagram illustrating the current build flow](./resources/0017-incremental-build/Current_Build.png)

### Incremental Build Cache

For the incremental build cache, a new entity `Build Stage Cache` shall be created, managed by a new entity `Project Build Cache`. In addition, the current concept of the project `workspace` shall be extended to allow for `stage writers`. These stages build upon each other. Essentially, instead of one writer being shared across all tasks, the build is divided into an ordered sequence of stages, each with its own writer, and each stage reads from the combined stages of the preceding ones.

The unit of caching is a **stage**. A regular task is one stage. A task that opts into partial rebuilds becomes a *step-based task* (see [Build Task API Changes](#build-task-api-changes)) and contributes one stage per step, so its steps are cached independently.

![Diagram illustrating the central build components with the Project Build Cache and Build Task Cache](./resources/0017-incremental-build/Build_Overview.png)

This shall enable the following workflow:

**1. Action: A project build is started**

*(see diagram below, "Initial Build")*

1. Task A, Task B and Task C are executed in sequence, writing their results into individual writer stages.
1. _Task outputs are written to a content-addressable store and "stage cache" metadata is serialized to disk._
1. _After the last task executed, the project's "index" is serialized to disk along with a mapping to the output file metadata. All created or modified resources are written to the content-addressable store._
1. Build finishes and the resources of all writer stages are combined with the source reader and written to the target output directory.

_The project has been built and a cache has been stored._

**2. Action: A source file is modified, a new build is started**

*(see diagram below, "Successive Build")*

1. _The cache metadata is read from disk, enabling the build to determine the relevant changes and access cached content from the content-addressable store._
	* Valid cached stages are imported into the `Project` as "stage readers"
1. The build determines which tasks need to be executed using the imported cache and information about the modified source files.
	* In this example, it is determined that Task A and Task C need to be executed since they requested the modified resource in their previous execution.
1. Task A is executed. The output is written into a **new writer** of the associated stage.
	* Task A is a step-based task, so each of its steps is cached independently. The build cache re-runs only the steps (and, within a map step, only the keys) whose inputs changed since the last build, and restores the rest from cache.
	* In this example, Task A re-runs only the step affected by the modified resource and reuses its other steps.
	* **Note: a task can't access the cached stage reader of its own stages.** A step can only access the combined resources of all previous writer stages, the same as in a regular build.
1. _New task outputs are combined with the cached outputs and the new stage metadata is serialized to disk_
1. The `Project Build Cache` determines whether the resources produced in this latest execution of Task A are relevant for Task B. If yes, the content of those resources is compared to the cached content of the resources Task B received during its last execution. In this example, the output of Task A is not relevant for Task B, so it is skipped.
1. Task C is executed (assuming that relevant resources have changed) and has access to the full stage (cache reader and new writer) of Task A, as well as the cached stage of Task B. This allows it to access all resources produced in all previous executions of Task A and Task B.
	* Task C is a regular (non-step-based) task. The output of Task C is written into a **new writer** of the associated stage.
1. _New task outputs are stored in the content-addressable store and stage metadata is serialized to disk_
1. The build finishes. The combined resources of all stages and the source reader are written to the target output directory.

![Diagram illustrating an initial and a successive build leveraging the build cache](./resources/0017-incremental-build/Build_With_Cache.png)

![Simplified Activity Diagram of the Incremental Build](./resources/0017-incremental-build/Overview_Activity_Diagram.png)

#### Project Build Cache

The `Project Build Cache` is responsible for managing the build cache of a single project. It handles the (de-)serialization of the cache to and from disk, as well as determining whether a new build of the project is required (e.g. due to the lack of an existing cache or based on source or dependency file changes).

It also manages the individual `Build Stage Cache` instances, one per stage in the build process, allowing them to track which resources have been read and written during their execution.

To detect changes in a project's sources, a [Hash Tree](#hash-tree) is used to efficiently store and compare metadata of all source files. This allows quick detection of changed source files since the last build. The root hash of this tree is referred to as the project's `source-index signature`. Together with the signatures of all relevant dependency-indices, a cache key can be generated to look up an existing result cache for the project's current state. If found, it can be used to skip the build of the project altogether.

Similarly, each stage's input resources are tracked using hash trees (one for project-internal resources and one for dependency resources). These trees include resource tags in their leaf node hashes, ensuring that tag changes are detected alongside content changes. Their root hashes, together with a signature over the stage's [non-resource inputs](#non-resource-task-inputs) (e.g. environment variables) and over any configuration files read outside the resource model, combine to form a stage cache key.

See also: [Cache Creation](#cache-creation).

#### Build Stage Cache

The `Build Stage Cache` is responsible for managing the cache information for a single stage within a project (a regular task's single stage, or one of a step-based task's per-step stages). It keeps track of which resources have been read and written by the stage during previous executions.

During a rebuild, it can use this information to determine whether the stage needs to be re-executed based on changes to the relevant input resources.

The Project Build Cache uses this information to determine whether a changed resource _potentially_ affects a given stage. This does not mean that the stage must be re-executed right away, only that it might need to be. The actual decision is deferred until the stage is about to be executed. Only at that point can the stage's input resources be compared with the cache to determine whether (and which) relevant resources have changed.

All necessary metadata stored in the `Build Stage Cache` is serialized to disk as part of the [Build Stage Metadata](#build-stage-metadata).

### Enhancements in Existing Components

#### Project

The existing `Project` class shall be extended to support the new concept of `stage writers`. Specifically, resource handling shall be extracted into a new [`Project Resources`](#project-resources) class, responsible for managing the different resource readers and writers of a project. The `Project` class will delegate all resource-related operations to this new class, including the handling of [resource tags](#resource-tags).

Previously, the `Project` class was responsible for providing the project's `workspace`, to be used by build tasks. This `workspace` consisted of a single `reader` (providing access to the project's sources) and a `writer` for storing all resources that have been newly produced or changed by the build in memory.

#### Project Resources

A new `Project Resources` class shall be created to manage the access to a project's resources and decouple this responsibility from the `Project` class. This class will be responsible for managing the different resource readers and writers of a project, including the handling of resource tags.

To support the incremental build, the `Project Resources` class shall manage multiple resource `stages`, one per stage of the build (a regular task contributes one stage, a step-based task one stage per step). Each stage holds either a `writer` or, in case the stage has been restored from cache, a `cached writer` (the latter being read-only). Additionally, each stage contains two `ResourceTagCollection` instances for managing resource tags (see [resource tags](#resource-tags)).

During the project build, and before executing a stage, the `Project Build Cache` shall set the correct stage in the `Project Resources` instance. E.g. before executing the `replaceCopyright` task, the stage is set to `task/replaceCopyright`.

Whenever progressing to a new stage, the stage is initialized with an empty writer and resource tag collection. The `Project Build Cache` can replace the writer with a `cached writer`, in case a previous execution of the task has been cached and the cache is still valid. Similarly, the resource tag collection is updated based on cached tag operations for the stage. Note that this includes clearing tags.

Once a `workspace` is requested from the `Project Resources` instance, it will internally create a [DuplexCollection](https://ui5.github.io/cli/stable/api/@ui5_fs_DuplexCollection.html) using a `reader` that combines the writers of all previous stages (as well as the project's sources), and the writer of the current stage.

When requesting the `resourceTagCollection` for a stage, the `Project Resources` instance will return a `Monitored Tag Collection` wrapper around the actual `Resource Tag Collection` of the stage. This allows tracking all tag operations performed during a task's execution and storing them in the cache (see [Monitored Tag Collection](#monitored-tag-collection)). A notable difference to the handling of resources is that the `Resource Tag Collection` is per project rather than per stage: it is populated with the tags of each stage as the build progresses. There are two such collections (see [Monitored Tag Collection](#monitored-tag-collection)): the `project` tags collection is cleared at the beginning of every build, while the `build` tags collection is cleared at the end.

Stages have an explicit order, defined during their initialization. Stages shall be named using the following schema: `<type>/<name>`, where `<type>` is the type of the stage (e.g. `task`) and `<name>` is the name of the entity creating the stage (e.g. the task name). A step-based task's per-step stages extend this with a step segment, i.e. `task/<taskName>::step/<stepName>`.

![Diagram illustrating project stages](./resources/0017-incremental-build/Project_Stages.png)

#### Monitored Reader

A `MonitoredReader` is a wrapper around a `Reader` or `Writer` instance that observes which resources are accessed during its usage. It records the requested paths as well as the glob patterns that have been used to request resources.

This information is used in the [`Resource Request Graph`](#resource-request-graph).

#### Monitored Tag Collection

During build task execution, tasks may associate resources with "tags" (key-value pairs). These tags are collected in shared `TagCollection` instances. Tags are differentiated between `build` tags and `project` tags. While `build` tags are only available during an individual project's build (i.e. they are not accessible to builds of dependent projects), `project` tags are shared across the entire build and can be accessed by all tasks of the project and its dependencies. This allows tasks to communicate information about resources to downstream tasks, even across project boundaries.

To support caching of resource tags, a `Monitored Tag Collection` wrapper is introduced, following the same pattern established by the `Monitored Reader` for tracking resource access.

It wraps a given `Resource Tag Collection` and intercepts all tag operations during a task's execution, recording which tags have been set or cleared. This allows the `Project Build Cache` to capture and persist the tags produced by each task.

Build tasks can access resource tags using the `Task Util` API, which internally retrieves the `Monitored Tag Collection` for the current stage from the current `Project` instance.

After the task completes, the `Project Build Cache` retrieves the recorded tags from the `Monitored Tag Collection` and stores them as part of the stage metadata.

Each `Project Resources` instance manages two `Resource Tag Collections`, one for `build` tags and one for `project` tags. The `build` tags collection is cleared at the end of each project build and is therefore not accessible to dependent projects.

#### Project Builder

The `Project Builder` shall be enhanced to:

1. Before building a project, allow the `Project Build Cache` to prepare the build by importing any existing cache from disk (see [Cache Import](#cache-import)) and comparing it with the current source files to determine which files have changed since the last build.
2. If a cache can be used, skip the build of a project
3. After building a project, allow the `Project Build Cache` to serialize the updated cache to disk (see [Cache Creation](#cache-creation)).

#### Task Runner

The `Task Runner` shall be enhanced to:

1. Request the build signature of any tasks implementing the `determineBuildSignature` method at the beginning of the build process (see [Build Task API Changes](#build-task-api-changes)). These signatures are then incorporated into the overall build signature of the project (see [Cache Creation](#cache-creation)).
2. For a step-based task, derive its steps once at the beginning of the build (by calling the task's factory, which is pure over its options) to register one stage per step with the `Project Build Cache`. A regular task registers a single stage.
3. Before executing each stage, allow the `Project Build Cache` to prepare the stage and determine whether it needs to be executed or can be skipped based on valid cache data.
4. Execute the stage. For a step-based task, the Task Runner drives its steps through a step runner that re-runs only the steps (and, within a map step, only the keys) whose inputs changed, restoring the rest from cache. A regular task runs its full body.
5. After a stage has been executed, allow the `Project Build Cache` to update the cache using information on which resources have been read during execution as well as its output resources.
	* The resources read by a stage are determined by providing it with `workspace` and `dependencies` reader/writer instances that have been wrapped in ["Monitored Reader"](#monitored-reader) instances. They are responsible for observing which resources are accessed during execution.
	* The `Project Build Cache` will then:
		* Update the metadata in the respective `Build Stage Cache` with the set of resources read by the stage ("resource requests"), along with the stage's [non-resource inputs](#non-resource-task-inputs)
		* Compile a new "signature" for the stage's input resources and store this, along with the project's current stage instance, in the in-memory Stage Cache of the `Project Build Cache` (mapping a stage signature to an earlier cached stage instance).
		* Using the set of changed resource paths, check which downstream stages need to be potentially invalidated (see [Cache Invalidation](#cache-invalidation))

##### Processor Return Value Convention

Resource processors invoked from a task may return `undefined` for an input resource in their result array to indicate that the resource was not modified. The task runner interprets this as "use the input resource as-is" and skips the corresponding write to the writer stage. This avoids redundant cache entries and unnecessary downstream invalidation when a processor inspects but does not change a resource.

##### Build Task API Changes

A build task can opt into partial rebuilds by becoming a **step-based task**. Instead of a single task body, such a task default-exports a factory `build(options) => Step[]` and declares a static `stepBased` flag. The factory returns an ordered list of steps that describe the work. Each step becomes its own build stage and is cached independently: on a rebuild, only the steps whose inputs changed are re-executed, and the rest are restored from cache (see [Step-Based Tasks](#step-based-tasks)).

This replaces an earlier design in which a task declared `supportsDifferentialBuilds()` and received a list of changed resource paths to process itself. Moving the delta bookkeeping into the build cache removes that burden, and its correctness pitfalls, from the task author.

Step-based tasks are available to custom tasks from Specification Version 5.0. A task opts in with a static `stepBased` export set to `true`. Absent the flag, the default export is a regular task body and runs unchanged.

A separate, independent callback lets a task contribute to the project's build signature:

* **async determineBuildSignature({log, options, taskUtil})**
	* `log`: A logger instance scoped to the task
	* `options`: Same as for the main task function. `{projectName, projectNamespace, configuration, taskName}`
	* `taskUtil`: A read-only variant of the `Task Util` API, allowing the task to inspect project state (e.g. read project configuration) before the task has run. Available to tasks with Specification Version 5.0 or higher.
	* Returns: `undefined` or an arbitrary string representing the build signature for the task. This can be used to incorporate task-specific configuration files (e.g. `tsconfig.json` for a TypeScript compilation task) into the build signature of the project, causing the cache to be invalidated if those files change. The string should not be a hash value (the build signature hash is calculated later). If `undefined` is returned, or if the method is not implemented, the task's build signature falls back to a hash of its configuration.
	* Custom tasks providing this callback must declare Specification Version 5.0 or higher.
	* This method is called once at the beginning of every build. The return value is used to calculate a unique signature for the task based on its configuration. This signature is then incorporated into the overall build signature of the project (see [Cache Creation](#cache-creation) below).
	* **To be discussed:** Whether the callback may also return a list of file paths to be watched for changes in watch mode. On change, the build signature would be recalculated and the cache invalidated if it has changed. This is distinct from the project-definition file watching that drives a graph re-resolve in `ui5 serve` (see [Reacting to Project-Definition Changes](#reacting-to-project-definition-changes)): task-specific files such as `tsconfig.json` influence the build signature rather than the graph. See also [Watch Mode: Cache Invalidation](#cache-invalidation-1).
Stale output detection is handled by the step model. When a step (or, within a map step, a key) stops producing an output it produced before, the build cache prunes that output on the rebuild: a removed input resource yields a per-key delta where the affected key re-runs with fewer outputs or drops out entirely, and the outputs it no longer produces are dropped from the stage result. This replaces an earlier `determineExpectedOutput` draft, discarded because the step model derives the dropped outputs from what each step writes, without a task having to declare its expected output.

The `determineBuildSignature` callback took some inspiration from the existing [`determineRequiredDependencies` method](https://github.com/UI5/cli/blob/main/rfcs/0012-UI5-Tooling-Extension-API-3.md#new-api-2) ([docs](https://ui5.github.io/cli/stable/pages/extensibility/CustomTasks/#required-dependencies)).

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

Read project resources through the callback's `workspace` and dependency resources through its `dependencies` instance. Write outputs through the callback's `workspace`. Read non-resource inputs through the callback's `taskUtil` instance. Access through a captured reader, another writer, `process.env`, or a direct file-system API is not recorded and can cause a stale cache result.

Keep each map key independent unless the step uses `sequential: true` for an intentional dependency between keys. Use a scalar step when the output depends on the complete input set. Keep all callbacks deterministic for the recorded inputs.

###### Example

The following task uses build options to select the text resources and control whether associated metadata is used. With `useMetadata` enabled, each map unit reads its metadata resource through its `workspace`. The runner records this read for the text-resource key, so a metadata change invalidates only the unit that depends on it.

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

A task's output can depend on inputs that are not resources: an environment variable, or a value read through the `TaskUtil` interface (e.g. a dependency's version via `getProject(name).getVersion()`, or `isRootProject()`). None of these feed the resource indices, so without tracking, changing one between builds would leave a stale cached result being served. The canonical example: the `generateLibraryManifest` task embeds a dependency's version as the manifest `minVersion`; removing or bumping that dependency must re-run the task even though no source resource changed.

To handle this, the build cache records the non-resource inputs a stage reads (as `{type, name}`, never the value) and folds a signature over their current values into the stage's cache key. On a later build, each recorded input's current value is re-read; agi value that differs from the one baked into the cached signature misses the cache and re-runs the stage.

For this tracking to work, task authors must read such values through the `taskUtil` interface (e.g. `taskUtil.getEnv(name)` rather than `process.env` directly), so that the read is observed. A value obtained outside the monitored `taskUtil` is untracked and can serve stale.

Configuration files that a task reads outside the UI5 resource model (e.g. a root `tsconfig.json` or files under `node_modules`, read via `getRootReader()`) are tracked as a separate class of input: a change to such a file re-runs the whole stage that read it (full refresh, not a per-file delta).

#### Resource Request Graph

A graph recording the request sets of a build task across multiple executions.

It optimizes storage of multiple related request sets by storing deltas rather than full copies of each unique request set. Each node stores only the requests added relative to its parent.

This is particularly efficient when request sets have significant overlap. The graph automatically finds the best parent for a new request set to minimize the delta size.

At runtime, each unique (materialized) request set references a [`Shared Hash Tree`](#shared-hash-tree) representing the resources currently matching the request set.

#### Hash Tree

By using hash trees, it is possible to efficiently store and compare metadata of a large number of resources. This is particularly useful for tracking changes in source files or task input resources.

A hash tree is a tree data structure where each leaf node represents a resource and contains its metadata (e.g. path, size, last modified time, integrity hash, and resource tags). Each non-leaf node contains a hash that is derived from the hashes of its child nodes. The root node's hash represents the overall state of all resources in the tree.

Resource tags associated with a resource are included in the leaf node's hash calculation. This ensures that any change to a resource's tags, even without a change to its content, results in a different node hash, propagating up to a different root hash. This is important because tasks may depend not only on a resource's content, but also on its tags (e.g. `ui5:HasDebugVariant` or `ui5:IsBundle`). By incorporating tags into the hash, the index signature accurately reflects the full state of the resource set, including tag information, and correctly triggers cache invalidation when tags change.

When a resource changes, only the hashes along the path from the changed leaf node to the root need to be updated. This makes it efficient to update the tree and compute a new root hash.

![Hash_Tree](./resources/0017-incremental-build/Hash_Tree.png)

The integrity hash of a source file shall be calculated based on its raw content. A SHA256 hash shall be used for this purpose. Internally, the hash shall be stored in Sub-Resource Integrity (SRI) format (`sha256-<base64>`) to allow direct use as CAS keys.

When comparing the stored metadata with a current source file, the following attributes shall be considered before computing a resource's integrity hash:
* `lastModified`: Modification time
* `size`: File size
* `inode`: Inode number

If **any** of these attributes differ, the file may be modified, and its integrity hash shall be computed to confirm the change.

Each hash tree also contains an "index timestamp", representing the last time the index has been updated from disk. This allows quick invalidation if source files have a modification time later than this timestamp.

Additionally, this timestamp shall be used to protect against race conditions such as those described in [Racy Git](https://git-scm.com/docs/racy-git), where a file could be modified so quickly (and in parallel to the creation of the index) that its timestamp doesn't change. In such cases, the modification timestamp would be equal to the index timestamp. Therefore, if a file has a modification time equal to the index timestamp, its integrity must be compared to the stored integrity to determine whether it has changed.

#### Shared Hash Tree

A `Shared Hash Tree` is a specialized form of a hash tree that allows multiple entities (e.g. different request sets) to share common subtrees. This reduces redundancy and saves storage space when many request sets have overlapping resources.

Shared Hash Trees are managed by a `Tree Registry`. Changes made to any Shared Hash Tree are queued in the Tree Registry and applied in batch when requested. This ensures consistency across all trees and optimizes performance by minimizing redundant hash calculations.

![Shared Hash Tree](./resources/0017-incremental-build/Shared_Hash_Tree.png)

### Cache Creation

The build cache shall be serialized to disk to reuse it in successive UI5 CLI executions. This is done using a single **SQLite database** (WAL mode) that stores both content-addressable resource BLOBs and all metadata in dedicated tables. The CAS table ensures that each unique file content is stored only once, reducing disk space usage and improving I/O performance. Using a single database eliminates the overhead of managing thousands of small files on disk and provides transactional consistency for cache writes. SQLite with unified content and metadata tables was chosen over a `cacache` store with file-based metadata and over LevelDB, both of which would reintroduce the many-small-files overhead or require a separate metadata store. Because writes are transactional, an interrupted build (e.g. a crashed or killed process) cannot leave a partially written entry: the incomplete transaction is rolled back, and the next build recomputes the missing result. A `ui5 cache verify` command (see [Garbage Collection](#garbage-collection)) may additionally detect corruption.

Each project build has its own global metadata cache. This allows reuse of a project's cache across multiple consuming projects. For example, the `sap.ui.core` library could be built once and the build cache can then be reused in the build of multiple applications that reference the project. A "project build" is defined by its [`build signature`](#build-signature).

#### Source File Storage in CAS

In addition to task-produced resources, **source files that are not overlayed by any build task** are also stored in the CAS when a project's build completes. These are the project's original source files that pass through the build unchanged, i.e. resources that were not written to any task's writer stage.

This is necessary because dependent projects need access to the full set of a dependency's resources (both task outputs and unmodified sources). Storing source files in the CAS ensures that dependent projects can read them from the CAS-backed readers rather than from the filesystem, guaranteeing consistency even if the original files are modified between builds (see [Race Condition Handling](#race-condition-handling)).

This specifically applies to source files that are accessible to dependent projects, i.e. resources that would be served to downstream consumers. No new storage mechanism is needed. Source files are simply additional entries in the existing CAS, keyed by their content-integrity hash.

The CAS-stored source files are tracked using a flat index of resource paths mapped to their CAS metadata (integrity hash, size, etc.), similar to the [Stage Metadata](#stage-metadata) of task outputs. This source stage index is stored as part of the [Result Metadata](#result-metadata) under the project's source-index signature. This is important because in subsequent builds where the dependency project has not been modified, the build can skip rebuilding the dependency entirely and still reference its source files from the CAS via the stored index, again eliminating the risk of race conditions without requiring a rebuild.

The cache consists of the following components:
1. A `content` table acting as the global CAS, storing resource BLOBs keyed by their SRI integrity hash.
2. Metadata tables per project build (identified by its build signature):
	* `index_cache`: Serialized [Hash Tree](#hash-tree) of all **source** files of the project, as well as a list of all stages executed during the build.
	* `stage_request_metadata`: Stores all resource requests of a stage (keyed by stage id), its recorded non-resource inputs and root-reader requests, as well as serialized [Shared Hash Trees](#shared-hash-tree) representing the input resources of the stage during its last execution.
	* `stage_metadata`: Contains the resource metadata for a given stage. The metadata can be used to access the resource content from the `content` table, allowing restoration of the output of a task or the final build result of a project (by combining multiple stages).
	* `result_metadata`: Maps a set of stage metadata that produced a final build result for a given project state (represented by the project's source index signature and the signatures of relevant dependencies).

![Cache Overview Diagram](./resources/0017-incremental-build/Cache_Overview.png)

#### Differentiation with Pre-Built Projects

A project with an incremental build cache can be seen as similar to "pre-built projects" (as introduced in RFC 0011).

However, there are major differences in how those two types of project states are handled:

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
* Projects with incremental build cache support are designed to improve the build time during a rebuild of the project. The potentially large cache is not intended to be distributed alongside the project, but rather stored locally on the developer's machine or build server.

**4. Runtime distinction**

The two states are distinguished by the presence of a `sourceMetadata` attribute in the cached data. Only a cache entry that carries `sourceMetadata` (the source index and per-task metadata described above) can drive an incremental rebuild of the project. Without it, the entry is only a build *result*: usable for building dependent projects, but not for rebuilding the project itself.

#### Build Signature

The build signature is used to distinguish different builds of the same project. It is calculated from an internal version constant (bumped whenever the cache format changes), the **build configuration**, the project's identity and configuration, the effective versions of `@ui5/builder` and `@ui5/fs` (so that a package upgrade whose task output shape changed does not silently reuse an incompatible cache), and the aggregated `determineBuildSignature` contributions of all tasks in the build.

This signature is used to determine whether an existing cache can be used in a given build execution. For example, a "jsdoc" build leads to a different build signature than a regular project build, so two independent cache entries will be created in the database.

The signature is a hash represented as a hexadecimal string.

A mechanism for custom tasks to contribute to the build signature via `determineBuildSignature()` is defined in the Task API.

### Cache Key Overview

All cache data lives in one SQLite database (see [Cache Directory Structure](#cache-directory-structure)). This section decomposes the key of every stored entity, so each table can be read on a technical level without tracing the code.

Every metadata table shares two leading key columns:

* **`project_id`**: the project's unique Specification id (`project.getId()`), scoping all of a project's rows.
* **`build_signature`**: identifies one *kind* of build of that project (decomposed below). A regular build, a `jsdoc` build, and a serve-mode build each produce a distinct build signature and therefore separate, non-colliding rows.

The following entities are stored:

| Table | Key columns | Holds |
|-------|-------------|-------|
| `content` | `integrity` | A single resource's content, gzip-compressed. The content-addressable store (CAS). |
| `index_cache` | `project_id`, `build_signature`, `kind` | The source [index](#index-cache) (hash tree + stage list). `kind` is `"source"`. |
| `stage_metadata` | `project_id`, `build_signature`, `stage_id`, `stage_signature` | One stage's output ([Stage Metadata](#stage-metadata)): resource metadata, tag operations, and (for step stages) per-key invocation data. |
| `stage_request_metadata` | `project_id`, `build_signature`, `stage_id`, `type` | One stage's recorded inputs ([Build Stage Metadata](#build-stage-metadata)): resource request graphs and non-resource inputs. `type` is one of `project`, `dependencies`, `input`, `root`, `root-no-gitignore`. |
| `result_metadata` | `project_id`, `build_signature`, `stage_signature` | The mapping from one project state to the set of stages that produced its [build result](#result-metadata). Here `stage_signature` is a *result* signature (decomposed below). |

`stage_id` is the id of a stage: `task/<taskName>` for a regular task, or `task/<taskName>::step/<stepName>` for a step-based task's step.

#### Build-Signature Composition

A single SHA-256 hex digest over, in order:

* an internal `BUILD_SIG_VERSION` constant (bumped on an incompatible cache-format change)
* the build configuration (e.g. the set of enabled tasks, the build mode)
* the aggregated `determineBuildSignature()` contributions of all tasks (each contribution falling back to a hash of the task's configuration when the callback is absent)
* the project's id (`project.getId()`) and its full configuration
* the effective versions of `@ui5/builder` and `@ui5/fs` (so a package upgrade that changes task output cannot silently reuse an incompatible cache)
* the `@ui5/project` version

#### Stage-Signature Composition

The key under which a stage's output is stored in `stage_metadata`. It is a tuple of **four independent components**, each a SHA-256 hex digest, joined with a `-` (the separator cannot occur inside a hex digest, so the split is lossless):

```
<projectIndexSignature>-<dependencyIndexSignature>-<inputSignature>-<rootSignature>
```

* **`projectIndexSignature`**: root hash of the stage's project-resource index (a [Hash Tree](#hash-tree) over the project resources the stage read, tags included). The placeholder `X` when the stage read no project resources.
* **`dependencyIndexSignature`**: root hash of the stage's dependency-resource index. The placeholder `X` when the stage read no dependency resources.
* **`inputSignature`**: hash over the stage's recorded [non-resource inputs](#non-resource-task-inputs), evaluated to their current values. A fixed empty-set digest when the stage read none.
* **`rootSignature`**: hash over the signatures of the stage's root-reader requests (configuration files outside the resource model, see [Non-Resource Task Inputs](#non-resource-task-inputs)). A fixed empty-set digest when the stage made none.

Keeping the four as separate slots lets a delta lookup pair a changed project or dependency signature with the *current* input and root signatures directly, without a reverse mapping from a combined value.

#### Result-Signature Composition

The key under which a whole build result is stored in `result_metadata`. It describes one complete project state and, like a stage signature, is a tuple of four `-`-joined components:

```
<sourceSignature>-<combinedDependencySignature>-<aggregatedInputSignature>-<aggregatedRootSignature>
```

* **`sourceSignature`**: root hash of the project's source index (all source files, see [Index Cache](#index-cache)).
* **`combinedDependencySignature`**: a hash over the per-stage dependency signatures, taken in stage order. On lookup, the candidate keys are the cartesian product of each stage's possible dependency signatures, so a stage carrying a dependency delta contributes more than one candidate.
* **`aggregatedInputSignature`**: a hash over all stages' input signatures (order-independent: the per-stage signatures are sorted before hashing).
* **`aggregatedRootSignature`**: a hash over all stages' root signatures.

Because the input and root signatures each occupy their own slot, a changed environment variable or a changed root configuration file misses the result cache and the per-project build is not skipped wholesale (the result-cache check runs before the per-stage checks).

#### Content Integrity (CAS Key)

The `content` table is keyed only by `integrity`, an SRI string (`sha256-<base64>`) over the resource's uncompressed bytes. It is global, not scoped by project or build signature, so identical content produced by any project or any build is stored once. All other tables reference content indirectly: their resource metadata records the `integrity`, and the content is read from the CAS by that key.

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

The index provides metadata for all **source** files of the project. This allows the UI5 CLI to quickly determine whether source files have changed since the last build. Its key is simply the current [build signature](#build-signature) of the project build.

The metadata is represented as a [`Hash Tree`](#hash-tree), making updates efficient and allowing the generation of a single "project-index signature" representing the current state of all indexed resources.

The index cache also contains a list of the stages executed during the build (in order), along with information on whether each stage ran the step runner. This is used to efficiently deserialize cached [Build Stage Metadata](#build-stage-metadata).

#### Index Signature

An index signature (e.g. the "source-index signature") refers to the unique root hash of one of the (shared) hash trees. It represents the current state of a given set of resources (e.g. all sources of a project, or the input resources of a build task), including their associated resource tags. Any change to any of the resources or their tags will result in a different index signature.

These signatures are used to quickly check whether a cache exists by using them as cache keys.

### Build Stage Metadata

**Example 1**

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

**Example 2 (with deltas)**

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

Stores the resource request information of a build stage, along with serialized [Shared Hash Trees](#shared-hash-tree) representing the input resources of the stage during its last execution. It is stored per stage (keyed by the stage id, e.g. `task/minify::step/minify`), and besides the resource requests it also records the stage's [non-resource inputs](#non-resource-task-inputs) and any requests made against the root reader.

The resource requests are stored in a serialized [`Resource Request Graph`](#resource-request-graph). For Shared Hash Trees, only the root tree is serialized. The additions of the derived trees are stored as "delta indices". Later, this can be used to reconstruct (and correctly derive) all Shared Hash Trees in memory.

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

Stores the metadata of all resources for a given "stage" (i.e. all resources written by a single build task). This metadata can be used to access the resource content from the content-addressable store and to restore resource tag information.

The `resourceMapping` maps virtual path prefixes to indices in the `resourceMetadata` array. This is necessary for certain UI5 project types where multiple virtual paths map to the same physical path. For example, for a project of type `application`, the root path `/` maps to the sources (i.e. the `webapp` directory), just like the namespaced path `/resources/my/app/`. Both prefixes therefore reference the same `resourceMetadata` entry (index `0` in the example above). A different prefix, such as `/` for generated root-level resources, may reference a separate entry (index `1`).

The stage metadata is keyed using the stage's cache signature, a four-component tuple decomposed in [Stage-Signature Composition](#stage-signature-composition). If a stage read no project or dependency resources, that component is replaced with an `X` placeholder; the input and root components use a fixed empty-set digest when there is nothing to hash.

For a step-based stage, the per-key invocation data (which key read what, and what it produced) is embedded in the same stage-metadata entry, so it is always keyed by the same stage signature as the output it describes.

The contained metadata represents all resources **written** by that task during its execution. It includes the `lastModified`, `size` and `integrity` of each resource. This information is required for determining whether subsequent tasks need to be re-executed. It also contains information on resource tag operations, such as setting a tag to a value or clearing a tag. These tag operations are applied when restoring a cached stage and are incorporated into the hash tree leaf nodes of downstream tasks' input resources, ensuring that tag changes are reflected in the index signatures used for cache invalidation.

**Simplified Stage Metadata**

For some project types where no path mapping is done (e.g. type `module`), the stage metadata can be simplified to just store a single `resourceMetadata` object, mapping virtual paths directly to their cache metadata, without the need for an additional `resourceMapping`:

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

In this example, the `replaceCopyright` and `replaceBuildtime` steps carry a non-empty **input** signature because they read the quantized build time through `taskUtil`, and `generateLibraryManifest` carries one because it reads a dependency's version (a non-resource input) rather than a dependency resource (so its **dependency** slot is `X`). `generateBundle` and `buildThemes` are the only stages here that read dependency resources.

Result metadata is stored under a four-component *result signature* (the source-index signature, a combined dependency signature over all stages, an aggregated input signature, and an aggregated root signature), decomposed in [Result-Signature Composition](#result-signature-composition).

The metadata then maps this key to the [Stage Metadata](#stage-metadata) of all stages that produced the final build result for this project state. This ultimately allows recreating the full build output of the project by combining those stages with the current sources. Additionally, the result metadata includes the index of [source files stored in the CAS](#source-file-storage-in-cas), enabling dependent projects to resolve these resources from the CAS even when the dependency's build is skipped entirely in subsequent builds.

### Cache Directory Structure

All cache data is stored in a single SQLite database file per cache version:

```
~/.ui5/buildCache/v0_<N>/
└── cache.db          # Single SQLite database (WAL mode)
    Tables:
    - content          # CAS: resource BLOBs keyed by integrity hash
    - index_cache      # Source/result index trees
    - stage_metadata   # Per-stage results
    - stage_request_metadata  # Per-stage resource request graphs and non-resource inputs
    - result_metadata  # Build result mappings
```

A new `buildCache` directory shall be added to the ~/.ui5/ directory. The location of this directory can be configured using the [`UI5_DATA_DIR` environment variable](https://ui5.github.io/cli/stable/pages/Troubleshooting/#environment-variable-ui5_data_dir).

Tables are configured for primary-key lookups only, and SQLite pragmas are tuned for cache-style workloads (WAL journaling, increased page size, memory-mapped reads, and a busy timeout to tolerate concurrent openers).

Content and large metadata BLOBs are gzip-compressed before storage. Tiny resources are stored uncompressed, since the gzip overhead would exceed the saving.

![Diagram illustrating the creation of a build cache](./resources/0017-incremental-build/Create_Cache.png)

### Cache Import

Before building a project, UI5 CLI shall check for an existing index cache by calculating the [build signature](#build-signature) for the current build and searching the [cache directory structure](#cache-directory-structure) for a matching index cache.

The cache is then used to:
1. Check the source files of the project against the deserialized hash tree to determine which files have changed since the last build
2. Restore `Build Stage Cache` instances using the respective [Build Stage Metadata](#build-stage-metadata) Cache
3. Provide the `Project` with readers for the cached `writer stages` (i.e. task outputs)
	* When the build process needs to access a cached resource, it can do so using those readers. Internally, resources are provided by first looking up their metadata in the corresponding [Stage Metadata](#stage-metadata) cache to find the resource content hash. Using this hash, the resource content is read from the `content` table in the database.
4. Provide dependency resource readers backed by the CAS
	* When a dependent project's build needs to access resources of a dependency, it reads from CAS-backed readers instead of filesystem readers. This includes both task outputs and unmodified source files stored in the CAS during the dependency's build (see [Source File Storage in CAS](#source-file-storage-in-cas)). This is transparent to build tasks: the reader abstraction hides whether the content comes from CAS or the filesystem.

This allows executing individual tasks and providing them with the results of all preceding tasks without the overhead of creating numerous file system readers or managing physical copies of files for each build stage.

![Diagram illustrating the import of a build cache](./resources/0017-incremental-build/Import_Cache.png)

### Cache Invalidation

The following diagram shows the process for determining whether a project needs to be (partially) rebuilt and if yes, which individual tasks need to be (re-)executed.

Note this important differentiation: A Build Stage Cache can be *potentially* or *definitely* invalidated. It is *potentially* invalidated if the corresponding stage read resources that have been modified since the last build. It is *definitely* invalidated if the content of those resources has in fact changed. By only potentially invalidating a Build Stage Cache, the current process does not have to confirm that the resources changed at this point in time. Comparing the content of resources can be deferred until the stage runs. This can save time, especially since the resource in question might be modified again before the potentially invalidated stage is executed.

If the stage ends up being executed, it might produce new resources. After the execution has finished and the new resources have been written to the writer stage, it shall be checked whether the content of those resources has in fact changed. If not, they must not lead to the invalidation of any following stages. If they have changed, the relevant Build Stage Cache instances will be notified about the changed resources and might *potentially* invalidate themselves.

Because the build cache owns the per-stage and per-key selection, a step-based task no longer filters the changed set itself. On a rebuild, the set of changed resource paths maps to the steps (and, within a map step, the keys) that read them, and only those re-run; the rest are restored from cache. A changed input whose relation to a step's output is not one-to-one (e.g. a source map referenced by a script rather than the script itself) still re-runs the step that read it, because the mapping is derived from what the step read during its previous execution, not from a coarse rule such as file extension. The author's remaining responsibility is the step contract: read and write only through the step's callback arguments (see [Step-Based Tasks](#step-based-tasks)), so that every input is observed.

After a *project* has finished building, a list of all modified resources is compiled and passed to the `Project Build Cache` instances of all dependent projects (i.e. projects that depend on the current project and therefore might use the modified resources).

### Concurrency

SQLite's WAL mode provides the necessary concurrency control at the database level: multiple readers can operate concurrently, and a single writer is serialized automatically by SQLite. No external lock files are needed for raw database I/O.

Within a single UI5 CLI process, the cache manager that owns the SQLite connection is a singleton per cache directory and shared across all consumers (e.g. multiple builds triggered by the server all use the same cache manager). The underlying database is closed only when the last consumer releases it, so that one consumer cannot prematurely close handles that another still depends on.

#### Cross-Process Build Coordination

SQLite's database-level concurrency does not, on its own, coordinate higher-level build activity across processes. Consider this scenario:

* Process 1 is building projects `a` and `b`, where `a` depends on `b`.
* Process 2 starts a build for project `c`, which also depends on `b`.

Process 2 must wait until Process 1 has finished building `b` before reading `b`'s cache. Once `b` is built, however, Process 2 should be free to read `b`'s cache and proceed with building `c` immediately, even while Process 1 is still building `a`.

To achieve this, a shared/exclusive (read/write) lock shall be acquired per **build signature**:

* A process building a project takes an **exclusive lock** on that project's build signature for the duration of the build.
* A process reading a project's cache (e.g. as a dependency, or to skip rebuilding entirely) takes a **shared lock** on the build signature for the duration of the read.

Multiple shared locks may coexist. An exclusive lock is incompatible with any other lock. In the scenario above, Process 1 releases its exclusive lock on `sig(b)` as soon as `b`'s build commits, so Process 2's pending shared-lock acquisition on `sig(b)` then succeeds even though Process 1 still holds an exclusive lock on `sig(a)`.

The locks shall be implemented as **filesystem-based locks** stored alongside the cache database (e.g. in a `locks/` subdirectory keyed by build signature), rather than as rows inside the SQLite database.

#### Determining Whether the Cache Can Be Used

When a process needs a project's cache, it follows an optimistic acquisition pattern: it first tries to take a **shared lock** and read the cache. If no valid cache entry exists under that lock, it releases the shared lock, acquires an **exclusive lock**, re-checks (another process may have built it in the meantime), and either builds the project or, if the cache now exists, downgrades to a shared lock and reads it.

### Race Condition Handling

In a multi-project build, projects are built sequentially based on their dependency order. This introduces a potential race condition: after project A finishes building, a user (or an editor's auto-save in watch mode) may modify a source file in project A before dependent project B starts or finishes building. If B were to read A's source files directly from the filesystem, it would see the modified, and therefore inconsistent, version, leading to incorrect build results.

This is resolved by storing A's source files in the CAS at the end of A's build (see [Source File Storage in CAS](#source-file-storage-in-cas)). Dependent project B reads A's resources from the CAS using the integrity hashes recorded during A's build. This guarantees that B sees exactly the state of A's sources as they were when A was built, regardless of subsequent filesystem modifications.

**Source index validation:** As an additional safeguard, a validation step is performed at the end of each project's build. The project's source index, as recorded at the start of the build, is compared against the current state of the source files on disk. If any source file has been modified during the build, the validation fails and an error is thrown. This prevents the resulting (potentially corrupt) cache from being stored and the build result from being used. In watch mode, the build server treats this error as a signal to reset the affected project's source-index state and re-enqueue it for rebuild.

**Scope:** This protection applies to **dependency resources only**. The root project's own source files are always read from the filesystem, as they represent the current input to the build. Modifications to the root project's sources during a build are handled by the [watch mode](#watch-mode), which detects the change and schedules a new build.

**Interaction with watch mode:** If a source file change in a dependency is detected during or after the current build, the watch mode will schedule a new build. The current build continues using the CAS-snapshotted version of the dependency's resources, ensuring consistency. The subsequent build will then pick up the changes and rebuild the affected projects.

### Garbage Collection

A mechanism to free unused cache resources is required. The SQLite database can grow over time as new project versions and build configurations accumulate entries.

The eviction strategy is still open. A reasonable starting point is some form of LRU eviction based on last-access timestamps or entry age, run as a non-blocking step after a successful `ui5 build` or `ui5 serve` once configured thresholds (age or size) are exceeded.

A dedicated `ui5 cache clean` command shall allow users to manually purge the cache. It shall perform a full wipe of both the build cache and the downloaded framework packages, with a `--force` flag to skip the interactive confirmation for use in CI. Selective purging by criteria such as maximum age or size is out of scope for now. A command `ui5 cache verify` may additionally be provided to check the integrity of the cache. As a fallback, users can delete the `~/.ui5/buildCache/` directory to clear the build cache.

### Watch Mode

The build API shall provide a "watch" mode that will re-trigger the build when a source file is modified. The filesystem watch operation shall use debouncing to batch rapid successive file changes (e.g. from editor auto-save or format-on-save) and avoid triggering multiple builds. The watch mode shall select the projects to watch based on which projects have been requested to be built. If a [UI5 CLI workspace](https://sap.github.io/ui5-tooling/stable/pages/Workspace/) is used, this can be fine-tuned in the workspace configuration.

The watch mode shall be used by the server to automatically rebuild projects when source files are modified and serve the updated resources. See below.

#### Cache Invalidation

The `ui5 serve` command reacts to changes in the project-definition files (`ui5.yaml`/`--config`, `package.json`, workspace config, dependency-definition file) by re-resolving the graph and re-creating the serving stack (see [Reacting to Project-Definition Changes](#reacting-to-project-definition-changes)).

**It is to be decided** whether, besides watching relevant source files, the watch mode of `ui5 build` shall likewise watch such definition files, and whether either mode shall watch further configuration files relevant for the build signature (e.g. `tsconfig.json`). A change to a build-signature contributor implies that a different cache would have to be used, which is a distinct mechanism from re-resolving the graph.

#### Error Handling

If a task execution fails in watch mode, the error shall be logged but the watch mode shall remain active in anticipation of further changes. The process shall not crash or stop. This shall be a configuration option.

If some tasks have executed successfully before the error occurred, their results shall be kept in the cache and used for subsequent builds. Only the failed task and any downstream tasks shall be re-executed on the next build.

### Server Integration

![Diagram illustrating the integration of the incremental build in the UI5 CLI server](./resources/0017-incremental-build/Server_Overview.png)

The UI5 CLI server integrates the incremental build via `BuildServer`, which pre-builds projects before serving and watches for source changes, automatically rebuilding affected projects and their dependents.

Middleware like `serveThemes` (used for compiling LESS resources to CSS) becomes obsolete, since the `buildThemes` task is executed instead.

If any project (root or dependency) defines custom tasks, those tasks are executed in the server as well. This makes it possible to easily integrate projects with custom tasks as dependencies.

Since executing a full build requires more time than the on-the-fly processing of resources currently implemented in the UI5 CLI server, expensive tasks that are not strictly required during development (e.g. minification and bundle/preload generation) are excluded by default in serve mode. Users can further customize which tasks are disabled using CLI parameters or ui5.yaml configuration. Because the set of executed tasks is part of the build configuration, which feeds the [build signature](#build-signature), serve mode and a regular build produce separate cache entries. This is an accepted trade-off rather than a mechanism that reconciles the two.

While a build is running, the server pauses responding to incoming requests for resources of projects that are currently being rebuilt. This ensures that the server does not serve outdated or partially built resources. Requests for resources of other projects that are not affected by the current build continue to be served normally.

The server emits events (`buildFinished`, `sourcesChanged`, `error`) that can be consumed by middleware or future live-reload implementations.

#### Reacting to Project-Definition Changes

Source changes are handled by rebuilding inside the `BuildServer`. Changes to the files that *define* the project graph (a project's `ui5.yaml` (or a custom `--config`), `package.json`, the workspace config, or a static dependency-definition file) cannot be handled that way: they may change the set of projects, their dependencies, or their configuration, which requires resolving a fresh project graph. A common trigger is switching Git branches.

To handle this, the server shall wrap the `BuildServer` in a `Supervisor` that owns the stable HTTP socket and re-creates the serving stack when a definition file changes:

* A `ProjectDefinitionWatcher` shall watch the definition files. It emits an early `definitionChanging` signal when a change begins, and a settled `definitionChanged` signal once the changes go quiet, so that a burst of changes (such as a branch switch writing many files) results in a single re-init rather than one per file.
* On `definitionChanged`, the `Supervisor` shall resolve a new graph and build a new serving stack (graph + Express app + `BuildServer`) before tearing down the old one. The HTTP port stays bound throughout, and requests are routed to the new stack once it is ready. Should the new graph fail to resolve or build, the previous stack keeps serving.
* On the `definitionChanging` leading edge, the current `BuildServer` shall stop answering reader requests (rejecting waiting requests and fast-failing new ones) and stop its build loop, so that requests do not hang, and the outgoing build does not keep aborting and re-arming against the shared cache, while a branch switch is still writing files. Serving resumes once the swap completes.

A failed re-resolve shall leave the server in a *degraded* state: the last-good stack stays up and keeps the port bound, but because its graph no longer matches the files on disk, every request now fails rather than being served. A browser navigation lands on an error page. Other requests get a plain error response. The interactive console reflects the degraded state. Because a branch switch may still be writing files when a re-resolve is attempted, the server shall keep retrying automatically: a fixed budget of fast attempts, then an indefinite slow poll, until a re-resolve succeeds or a new definition change supersedes it. Each attempt waits for the filesystem to settle (a broader wait than the definition watcher's burst window above: that window runs *before* the first re-resolve, whereas this one runs *after* a re-resolve has already failed and must observe project roots that a freshly-resolved graph introduces, which the current graph does not yet watch) and re-resolves until the resolved project set is stable. A subsequent successful re-resolve clears the degraded state.

This concept covers the project-definition files. Watching other files that influence the build signature (e.g. `tsconfig.json`) is a separate concern, discussed under [Watch Mode: Cache Invalidation](#cache-invalidation-1).

#### Background Cache Validation

For a project that has not yet been built in the current session, the server initially only knows the build signature, not whether a cache exists on disk, and if so, whether it is still valid against the current source state. Deferring this check until the first request against the project's readers would make the *first* request pay for cold-cache I/O, and would leave the server unable to distinguish "cache present and valid, no rebuild needed" from "cache stale, rebuild imminent" until a request happens to hit that project.

To decouple this from the request path, the `BuildServer` runs an explicit **background cache validation** pass between build cycles: after each build cycle drains, any project whose cache status is still unknown (or was invalidated during the last cycle) is walked in dependency-first order. Each project's `Project Build Cache` is asked to validate its cache against the current source state. If valid, the project is marked as up-to-date. If stale, it is queued for rebuild.

The server distinguishes these activity states, describing what the server is doing rather than whether any cache is stale:

* `IDLE`: no build active and nothing pending. The server is ready.
* `SETTLING`: a rebuild is pending but deferred until changes quiesce. No build is active yet.
* `BUILDING`: a build cycle is in flight.
* `VALIDATING`: a background validation pass is in flight. No build is currently scheduled.
* `ERROR`: the last build cycle failed.

Project staleness is orthogonal to these states and tracked per project: the server can be `IDLE` while some lazily-built projects remain stale, awaiting a reader request or the next validation pass. A source change while a project is being validated defers its rebuild (the server moves to `SETTLING`), and any reader request against a not-yet-validated project joins the current pass instead of triggering an ad-hoc rebuild. When `--cache=Force` is set, building a project whose cache is stale is an error, since Force forbids any rebuild.

#### Live Reload

The server provides live-reload functionality to inform connected browsers about changes in the build result and trigger an automatic page reload. This shortens the edit/test cycle: after saving a source file, the user does not need to manually refresh the browser to see the result.

It is implemented as follows:

* The `BuildServer` emits a debounced `sourcesChanged` event whenever watched source files change. A burst of file changes (e.g. from saving multiple files at once or from editor format-on-save) results in a single notification.
* A `liveReloadClient` middleware serves a client script at `/.ui5/liveReload/client.js`.
* The `serveResources` middleware injects a `<script>` tag referencing this client into the `<head>` of HTML responses. Injection happens as early as possible in the document so the WebSocket connection is established before any application script runs.
* A WebSocket server is attached to the HTTP server at `/.ui5/liveReload/ws`. On `sourcesChanged`, it broadcasts a `{type: "reload"}` message to all connected clients, which then reload the page.
* To prevent intermediate proxies from idle-closing the WebSocket, the client sends a `{type: "ping"}` message every 30 seconds while the connection is open. The server echoes the same message back.
* When the WebSocket connection is lost (e.g. because the server was restarted), the client polls the WebSocket endpoint every second and reloads the page once the server accepts connections again. While the browser tab is hidden, polling pauses until it becomes visible.

The WebSocket server shall be attached to the stable HTTP socket owned by the `Supervisor`, and clients shall subscribe through a relay rather than directly to the current `BuildServer`. This keeps connected browsers connected across a definition-change swap (see [Reacting to Project-Definition Changes](#reacting-to-project-definition-changes)), so that a graph re-init does not count as a lost connection: only an actual server restart triggers the reconnect path above.

##### Authorization

Browser-originated upgrades (i.e. requests that carry an `Origin` header) are gated by a per-process token to mitigate Cross-site WebSocket Hijacking. The token is generated on server startup (72 random bits, base64url-encoded) and is substituted into the served client script template. Clients pass the token as a `?token=` query parameter, and the server compares it using a constant-time comparison.

Upgrades without an `Origin` header are not gated, since they cannot originate from a browser context where the Same-Origin Policy applies. They would already have full unauthenticated HTTP access to the dev server.

Reconnect probes from stale clients (whose page was loaded before the server was restarted, and which therefore can't know the new token) use the `ui5-ping` WebSocket subprotocol. The server accepts such handshakes without a token check and immediately closes the connection without enrolling the socket, confirming "server is up" without exchanging any data.

Live reload is enabled by default for `ui5 serve`. It can be controlled via:

* The CLI flag `--live-reload` / `--no-live-reload` for `ui5 serve`.
* The project configuration setting `server.settings.liveReload` in `ui5.yaml`. This setting requires Specification Version 5.0 or higher.

The CLI flag overrides the project configuration. When neither is set, live reload defaults to `true`.

#### Embedding UI5 Middleware in an External Server

Separating middleware assembly from HTTP-listener ownership is needed for the graph swap above (the socket stays bound while the middleware stack is rebuilt behind it). The same separation shall be offered as a public `serveMiddleware()` API in `@ui5/server`, for tools that run their own HTTP server (e.g. a custom Express app or another development server).

`serveMiddleware(graph, options)` shall set up the same UI5 readers and the same standard and custom middleware chain that `ui5 serve` uses, but expose it as connect/Express-compatible middleware rather than starting a server. The caller mounts it via `app.use(middleware)` and retains ownership of the port, protocol, routing around UI5, and error handling. It shall not bind a socket, attach the live-reload WebSocket server, or install a terminal error handler. Those remain the caller's responsibility. A `close()` function shall be provided to release the underlying `BuildServer`'s watcher and cache handle on teardown.

## Integration in UI5 CLI

The `ui5 serve` command integrates the incremental build via `BuildServer`. On startup, it builds the configured projects and watches for file changes, automatically rebuilding affected projects.

The following new arguments shall be added to the `ui5 build` and `ui5 serve` commands:

* `--cache`: Controls how the build cache is used.
	* Possible modes:
		* `Default`: Use the cache if available
		* `Force`: Use the cache only. If it is incomplete or invalid, fail the build
		* `ReadOnly`: Do not create or update the cache but make use of any existing cache if available (useful for CI/CD)
		* `Off`: Do not use the cache at all
	* The previous `--cache-mode` argument, which controlled framework dependency resolution caching, has been renamed to `--snapshot-cache` to avoid the naming collision with the build cache.
* `--watch`: Enables watch mode, causing the build to be re-triggered whenever a source file or relevant configuration file changes.
	* This parameter is only relevant for the `ui5 build` command. The `ui5 serve` command always uses watch mode internally.

The following new argument shall be added to the `ui5 serve` command:

* `--live-reload` / `--no-live-reload`: Controls whether the browser automatically reloads when project sources change. Defaults to `true`. Overrides the `server.settings.liveReload` setting in the project's server configuration.

A new project configuration setting `server.settings.liveReload` is introduced for Specification Version 5.0 and higher, controlling the same behavior at the project level.

## How we teach this

This is a big change in the UI5 CLI architecture and especially impacts the way the UI5 CLI server works. By always building projects, developers might experience a slower startup time of the server. After modifying a file, it might also take longer until all processing is finished and the change is being served to the browser.

The incremental build hopefully mitigates this performance impact to some extent. The ability to disable individual tasks can further improve the performance. However, this needs to be taught to developers and sane defaults should be picked to make the experience as good as possible.

With the execution of tasks in the server, some (custom) middleware might become obsolete or even cause problems. This means that **projects might need to adapt their configuration**.

All of this should be communicated in the UI5 CLI documentation and in blog posts. A phase of pre-releases should be used to gather feedback from the community.

## Drawbacks

* For every file change, the server needs to execute a partial build. This can lead to a longer time between making a source file change and seeing the result in the browser.
	* This should be measured on different systems. The project size and the tasks involved can have a big impact on the performance.
	* The ability to disable individual tasks for the server can help to mitigate this problem.
		* Would this create a distinction between tasks that are relevant for the production build only and those relevant to the server only?
* Projects might have to adapt their configurations.
* Custom tasks might need to be adapted. Previously, they could only access the sources of a project. With this change, they will access the build result instead. Access to the sources is still possible but requires the use of a dedicated API.
* UI5 CLI standard tasks need to be adapted to use the new cache API. Especially the bundling tasks currently have no concept for partially re-creating bundles. However, this is an essential requirement to achieve fast incremental builds.
* The SQLite database can grow over time. An automatic [garbage collection](#garbage-collection) mechanism is needed for managing disk space (not yet implemented). The `ui5 cache clean` command shall only offer a full wipe, not selective eviction.

## Alternatives

An alternative to using the incremental build in the UI5 CLI server would be to apply custom middleware of dependencies.

### Server-Sent Events (SSE) instead of WebSockets for Live Reload

Server-Sent Events were considered as an alternative transport. When not used over HTTP/2, SSE is subject to a [per-browser limit of 6 open connections](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) that applies across all tabs to the same server. Since the UI5 server still defaults to HTTP/1.1 (HTTP/2 is opt-in via `--h2`), this limit is the common case. With live reload enabled, one of the 6 connections is permanently occupied by the SSE channel, leaving only 5 for resource loading and impacting performance. In the worst case, this leads to a dead-lock where SSE connections block any further requests. For example, opening the `test.html` page in OpenUI5, which resolves all QUnit testsuites via iframes, could hit this limit. WebSockets are not subject to this limit and were therefore chosen as the transport.

## Outlook and Future Ideas

* Allow tasks to store additional information in the cache.
* Track processor-library versions as step inputs: a step's output can depend on the version of a processor library (e.g. terser, less-openui5) that is not yet a tracked [non-resource input](#non-resource-task-inputs), so a step can serve stale output across a processor-library upgrade until that version is routed through the step's `taskUtil`.
* Cross-process build coordination: SQLite's database-level concurrency does not coordinate higher-level build activity. Whether to add filesystem-based shared/exclusive locks per build signature (as proposed in [Concurrency](#concurrency)) depends on how often parallel builds of the same project occur in practice.
* Add a debug command (e.g. `ui5 cache verify`) to verify the integrity of a cache by rebuilding the project and comparing the result with the cache.
