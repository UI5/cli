---
name: incremental-build
description: >
  Work on the incremental (delta) build system in @ui5/project: build caching,
  resource indexing, hash trees, stage caching, build server, file watching,
  task execution caching, and delta builds.
when_to_use: >
  TRIGGER when: the user asks about or wants to modify code related to incremental builds,
  build caching, resource indexing, hash trees, stage caching, build server, file watching,
  task execution caching, delta builds, resource tags in build context, or any component
  listed in the Component Map in architecture.md.
  DO NOT TRIGGER when: the user is working on unrelated CLI commands, general tooling,
  or non-build features.
user-invocable: true
---

# Incremental Build Skill

You are working on the incremental (delta) build system in `@ui5/project`. Read `architecture.md` in this skill directory for the full architecture reference, including the component map, key flows, caching architecture, and data structures. Read `performance-investigation.md` for guidance on profiling builds, reading perf logs, and known performance peculiarities.

## Guidelines for Working on This Code

1. **Always read the source file before modifying it.** The Component Map in `architecture.md` tells you where each piece lives.
2. **Understand the cache flow direction.** Changes propagate: source change -> index update -> signature change -> cache miss -> task re-execution.
3. **Be careful with tag side effects.** `getTags()` is not a pure read -- it triggers lazy tag application. Avoid calling it in unexpected contexts.
4. **Respect abort signals.** Any long-running operation should check `signal?.throwIfAborted()` periodically.
5. **Test with incremental rebuilds.** A single build passing is not enough; the interesting bugs appear on the second and third builds after file changes.
6. **Watch for stale stage readers after abort.** If a build is aborted, stage writers may contain partial results that shadow source files.
7. **Signature stability matters.** Any change to how hashes are computed (e.g., adding new fields to hash input) invalidates all existing caches.
8. **SharedHashTree operations must go through TreeRegistry.** Never mutate a SharedHashTree directly; always schedule via the registry and flush.

## Known Constraints

- `StageCache` (in-memory) has no `clear()` method -- stage entries persist for the lifetime of the `ProjectBuildCache` instance
- `ProjectBuildContext` instances (including their caches) are reused across sequential builds of the same project within a session
- `resource.getTags()` has side effects: it triggers `#applyCachedResourceTags()` and creates `MonitoredResourceTagCollection` instances, which modify tag collection state. This means calling `getTags()` during hash tree operations (e.g., in `TreeRegistry.flush()`) can affect the stage pipeline state.
- `updateProjectIndices` uses `project.getReader()` (stage pipeline reader) to read resources. After an aborted build, stage writers may contain in-memory resources that shadow updated source content, causing stale reads.
- `getSourcePaths()` and `getVirtualPath()` are NOT consistent with `getSourceReader()` for all project types. Module has no `getVirtualPath()` (base class throws). ThemeLibrary's `getSourcePaths()` returns only `[src/]` and `getVirtualPath()` only maps `src/`, but `_getReader()` also includes `test/` when `_testPathExists`. Any optimization that replaces `sourceReader.byGlob()` with direct filesystem enumeration via `getSourcePaths()` + `getVirtualPath()` must handle these mismatches.
