- Start Date: 2026-09-29
- RFC PR: -
- Issue: -
- Affected components <!-- Check affected components by writing an "X" into the brackets -->
    + [X] [ui5-builder](./packages/builder)
    + [ ] [ui5-server](./packages/server)
    + [ ] [ui5-cli](./packages/cli)
    + [ ] [ui5-fs](./packages/fs)
    + [X] [ui5-project](./packages/project)
    + [ ] [ui5-logger](./packages/logger)


# Step-Based Build Tasks

## Summary

A build task exposes its work as a factory `build(options) => Step[]` instead of a single task function. Each entry in the returned array is a step: a named unit of work that reads through tracked readers, optionally writes resources, and optionally returns a value that later steps consume. The incremental build re-runs only the steps whose tracked inputs changed. The factory receives `options` but never the resource readers or `taskUtil`, so a step's inputs arrive as arguments rather than through an enclosing task closure. This removes the misuse hazard of the current `taskUtil.processEach` inline-callback API, where an input captured from the task scope escapes per-step tracking and can serve a stale result on a delta build.

## Motivation

The incremental build caches task output keyed by content hashes of a task's tracked inputs. A task participates in per-step caching today by calling `taskUtil.processEach(group, keys, callback)` with an inline callback that receives per-step recording readers. Correctness depends on the author reading only through those per-step arguments, and nothing enforces it.

The callback is a closure over the task's lexical scope, so it can also reach the task-level `workspace`/`dependencies` readers, the task-level `taskUtil`, and `process.env`. A read taken through the captured task-level reader is recorded at task level but not attributed to the specific step, so on a delta build that step is served from cache even though one of its inputs changed. `packages/builder/lib/tasks/minify.js` shows the trap: the callback shadows its `workspace`/`taskUtil` arguments to keep those reads attributed to the step, and one line later reads `!process.env.UI5_CLI_NO_WORKERS` straight off `process.env` through the closure, untracked.

Two goals follow. Per-step correctness must not rest on a naming convention: the tracked path has to be the only path a step can take to its inputs. And a custom-task author needs an incremental-caching model that is hard to get wrong, because a capture bug produces a stale build with no error. A secondary cost of the current shape is that every task carries an `if (taskUtil?.processEach) { ... } else { batch }` dual path so it still works without a build cache, duplicating the task's logic.

## Detailed design

### The step factory

A step-based task default-exports a factory:

```js
export default function build(options) { return [ /* Step */ ]; }
```

The factory is called once per task invocation with the task `options` (project name, version, patterns, and so on). It returns the ordered list of steps to run. It does not receive resource readers or `taskUtil`, so it cannot capture them. A step defined inside it closes only over `options`-derived values, which are part of the build signature and therefore safe. The factory may include or omit steps based on `options` and may precompute `options`-derived constants for its steps.

The factory body remains ordinary code, so an ambient read (`process.env`, the clock, module state) taken in the factory body still escapes tracking. The contract is that the factory must be pure over `options`, and any env, graph, or time input must be read inside a step through `taskUtil`. The factory narrows the capture surface to the readers and `taskUtil` (the resource inputs), which it never receives.

### Opting in and opting out

A legacy task default-exports a task function `({workspace, dependencies, taskUtil, options}) => Promise`. A step-based task default-exports the factory. Both are functions, so a task declares which contract it uses with a `stepBased` flag rather than by shape-sniffing the export:

- Standard tasks declare `stepBased: true` in their build-definition entry (the same place the removed `supportsDifferentialBuilds` flag lived).
- Custom tasks declare it through the task extension, available from Specification Version 5.0.

Absence means legacy, so an existing task runs unmodified. A task becomes step-based only by declaring the flag. This is the restored and renamed `supportsDifferentialBuilds` mechanism: a task that is not step-based caches at whole-task granularity as before, a step-based task caches per step.

### Step shapes

A step is one of two shapes.

A scalar step runs once and is one cache unit:

```js
{
  name,          // string, unique within the task
  needs,         // optional array of earlier step names
  run: async ({needs, workspace, dependencies, taskUtil, options}) => value?
}
```

A map step fans out over a set of keys, each key its own cache unit:

```js
{
  name,
  needs,
  sequential,    // optional, default false
  keys: async ({needs, workspace, dependencies, taskUtil, options}) => keySet,
  each: async (key, {needs, workspace, dependencies, taskUtil, options}) => value?
}
```

`minify` and `buildThemes` are each a single map step (one key per resource, one per theme). `generateThemeDesignerResources` is two scalar steps plus a map step (see the worked example).

### Wiring with `needs`

A step lists the names of earlier steps in `needs`, and those steps' return values arrive as `needs.<name>`. `needs` may reference only steps earlier in the array, so array order is a valid execution order. This expresses one producer feeding several consumers, and several producers feeding one consumer, without a separate fan-in or fan-out construct.

### Return values

A step return is either resources or a serializable value; both are supported. A returned resource (or array of resources) is stored in the content-addressed store by integrity, as today. A returned serializable value is persisted with the step's invocation data. Either way the return is injected into any consumer that names the step in `needs`, and the return's signature (a resource's integrity, or the serialized value) folds into the consumer's tracked inputs, so a changed producer return re-runs the consumer while an unchanged one leaves it cached. A step served from cache re-supplies its previous return without running.

### Keys

A map step's `keys` returns the key set: resources or strings. A resource key is identified by its path and its integrity (the path distinguishes resources that share content but produce different output, the integrity makes a content change a new key that cannot yield a stale hit). A string key is identified by its value, and a compound key is expressed as a stable string. `keys` runs on every build to enumerate the current set through recording readers, so an added or removed key adds or drops a cache unit while unchanged keys stay cached, and the enumeration's own reads are tracked.

### Execution and writes

Steps run in array order, and a later step sees an earlier step's writes through the stage reader stack, the same mechanism by which a task sees prior tasks' output today. Within a map step, `sequential: true` persists each key's writes immediately so a later key reads what an earlier key wrote; the default runs keys concurrently with writes buffered and flushed in key order, and two concurrent keys writing the same path throws. The abort signal is checked between units; a single in-flight unit is not interrupted.

### Caching model

Correctness comes from per-step and per-key recording of reads, non-resource inputs, tag operations, and returns: a unit re-runs on a delta build when a tracked read intersects the changed paths, a tracked non-resource input no longer resolves to its recorded value, a consumed `needs` return changed, or its key is new. Otherwise it is restored, with its writes carried forward, its tag operations replayed, and its return rebuilt.

This recording is independent of whether a step is its own pipeline stage. The design is delivered in two phases:

- Phase A keeps the existing one-stage-per-task model. The steps of a task fold into that single task stage, generalizing the current `processEach` per-key delta (a scalar step is a one-key group, a map step a multi-key group). This is the change that removes the misuse hazard.
- Phase B promotes each step to its own stage (a map step stays one stage with an internal key-delta), removing the per-step sub-cache as a parallel mechanism. Because steps exist only on this development branch, this shrinks the eventual diff against the released baseline. It reworks the result-stage signature, which is a cartesian product over per-stage candidate signatures, so it is prototyped and measured on its own.

### Standalone execution

When a task runs without a build cache (direct or programmatic invocation of `@ui5/builder`), a small runner in `@ui5/builder` executes the same steps uncached: it runs every step in order, fans out every `keys` set, threads `needs` returns in memory, and buffers map-step writes in key order. The cached engine (delta selection, CAS-backed returns, tag replay, signature computation) lives in `@ui5/project`, which `@ui5/builder` cannot import (the dependency direction is `@ui5/cli` -> `@ui5/project` -> `@ui5/builder`). This runner replaces the per-task batch fallback that tasks hand-write today.

### Worked example: generateThemeDesignerResources

```js
export default function build(options) {
  const {version, projectNamespace: namespace} = options;
  if (namespace === "sap/ui/documentation") return []; // not offered in Theme Designer

  const pattern = namespace
    ? `/resources/${namespace}/themes/*/library.source.less`
    : `/resources/**/themes/*/library.source.less`;

  const steps = [
    {
      name: "scan",
      run: async ({workspace}) => ({hasThemes: (await workspace.byGlob(pattern)).length > 0}),
    },
  ];

  if (namespace) {
    steps.push({
      name: "libraryTheming",
      needs: ["scan"],
      run: async ({needs, workspace}) => {
        // write /resources/<namespace>/.theming using needs.scan.hasThemes, namespace, version
      },
    });
  }

  steps.push({
    name: "themes",
    needs: ["scan"],
    keys: async ({needs, workspace}) => needs.scan.hasThemes ? workspace.byGlob(pattern) : [],
    each: async (librarySourceLess, {workspace, dependencies}) => {
      // build one theme's .theming and library.less
    },
  });

  return steps;
}
```

`libraryTheming` is keyed on `scan`'s return, so it stays cached while `hasThemes` holds even as individual `library.source.less` files change. The `themes` map step regenerates only the affected theme. No `run`, `keys`, or `each` closes over task-level readers or `taskUtil`: every input arrives as an argument.

## How we teach this

The core terms are step, scalar step, map step, factory, and `needs`. The framing is a pipeline: a task is an ordered list of steps, each step is cached on its own tracked inputs, and steps pass values forward by naming the steps they need. A map step is the shape that fans out over a set of keys.

`packages/project/docs/BuildExtensibility.md` and the custom-task authoring documentation need reworking around the factory and step shapes for Specification Version 5. The standard tasks in `@ui5/builder` are the reference implementations: `minify` and `buildThemes` as single map steps, `generateThemeDesignerResources` as a scalar-plus-map pipeline.

The migration message: below Specification Version 5 nothing changes; a task becomes step-based by declaring `stepBased`, and reading a step's inputs through its arguments is what makes the incremental cache correct. The old `taskUtil.processEach` API and the hand-written batch fallback are gone.

## Drawbacks

This is a breaking change to the task authoring contract, bounded because the incremental build feature is unreleased and legacy tasks are untouched, but still a new contract to document and teach. The standalone-task import contract also changes: a direct `import minify from "@ui5/builder/tasks/minify"` now yields a factory, so a standalone caller runs it through the `@ui5/builder` step runner.

Phase B's promotion of each step to a stage increases the number of stages at runtime (deeper reader stacks, more stage-metadata rows) and adds factors to the cartesian-product result-stage signature, which is why it is measured separately.

## Alternatives

Two API shapes were considered before the declarative named-step form. A return-threaded pipeline made each step's return the input of the next, which cannot express one producer feeding two consumers without linearizing. An imperative form gave the top-level function a step-definition function returning handles wired with a `run` call; it expresses arbitrary graphs but reintroduces a top-level function and a larger DSL. The declarative array with `needs` covers producer-to-many and fan-in with one concept and keeps the graph as data.

A non-structural alternative kept the inline-callback `processEach` and added a runtime guard: compare what the task-level monitor observed during a step against what the step attributed, or revoke the task-level readers while a step runs, and throw on a leaked read. This catches the reader leak without an API change but does not deliver the cleaner authoring model, does not remove the dual-path batch fallback, and leaves the env capture floor untouched.

Doing nothing leaves the closure hazard: per-step correctness keeps resting on the author using the per-step arguments, and a capture bug keeps producing a stale build with no error.
