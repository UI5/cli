---
name: ui5-fs
description: >
  Work on the @ui5/fs package: the virtual file system abstraction layer providing
  Resource, Adapters (FileSystem, Memory), Reader Collections (ReaderCollection,
  ReaderCollectionPrioritized, DuplexCollection, WriterCollection), specialized readers
  (Filter, Link, Proxy), resource tagging, monitoring, and the resourceFactory API.
when_to_use: >
  TRIGGER when: the user asks about or wants to modify code related to @ui5/fs,
  the virtual file system, resources, adapters, reader collections, writer collections,
  DuplexCollection, resourceFactory, ResourceTagCollection, MonitoredReader, fsInterface,
  ResourceFacade, or any file within packages/fs/.
  DO NOT TRIGGER when: the user is working on builder tasks/processors, CLI commands,
  server middleware, or project graph resolution that does not touch the FS layer.
user-invocable: true
---

# @ui5/fs Skill

You are working on the `@ui5/fs` package — the virtual file system abstraction layer for UI5 CLI. Read `architecture.md` in this skill directory for the full architecture reference, including the class hierarchy, API surface, adapter internals, and collection patterns.

## Package Location

Source: `packages/fs/lib/`
Tests: `packages/fs/test/lib/`
Fixtures: `packages/fs/test/fixtures/`

## Guidelines for Working on This Code

1. **Always read the source file before modifying it.** The Component Map in `architecture.md` tells you where each piece lives.
2. **Understand the content type state machine.** Resources have internal content types (BUFFER, STREAM, FACTORY, DRAINED_STREAM, IN_TRANSFORMATION) with strict transitions. Never bypass `modifyStream()` for content transformations — it handles mutex locking and state management.
3. **Respect the mutex.** Resource content access is protected by `async-mutex`. Concurrent `getBuffer()` / `getString()` calls are safe, but `modifyStream()` acquires an exclusive lock. Never hold a reference to content across an `await` that could trigger a transformation.
4. **Virtual paths are POSIX-absolute.** All virtual paths must be absolute POSIX paths (start with `/`). Base paths must end with `/`. Adapters normalize patterns relative to their `virBasePath`.
5. **Content parameters are mutually exclusive.** When creating a Resource, only one of `buffer`, `string`, `stream`, `createStream`, or `createBuffer` can be provided. The `createBuffer`/`createStream` factories enable lazy loading.
6. **byGlob randomizes result order.** `AbstractReader.byGlob()` intentionally shuffles results to prevent consumers from relying on ordering. Do not assume or depend on glob result order.
7. **Clone semantics matter.** Resources are cloned on retrieval from adapters. `resource.clone()` creates an independent copy including content. When modifying resources from collections, understand whether you're working on the original or a clone.
8. **ResourceFacade is immutable.** `ResourceFacade.setPath()` throws. The facade wraps a resource with a different virtual path (used by Link reader). Use `getOriginalPath()` to get the underlying path.
9. **Tag format is strict.** Tags follow the pattern `"namespace:Name"` — namespace is lowercase alphanumeric, name is PascalCase. Tags are validated on set. Use `ResourceTagCollection` or `MonitoredResourceTagCollection` for tag operations.
10. **Test with both FileSystem and Memory adapters.** Behavior can differ between adapters (e.g., FileSystem uses `globby` while Memory uses `micromatch`; FileSystem has lazy content loading via factories, Memory clones on read).

## Known Constraints

- `Resource.getStream()` is deprecated — use `getStreamAsync()` or `getBuffer()` / `getString()` instead. The deprecation warning is only logged once per process.
- `Resource.getStatInfo()` is deprecated — use `getLastModified()`, `getSize()`, `getInode()` instead.
- FileSystem adapter's `write()` uses `fs.copyFile` for unmodified resources (optimization). It also detects same-source-same-target writes and skips them, but switches to buffer-based writes if the content was modified (to avoid stream read-during-write conflicts).
- Memory adapter auto-creates virtual directory entries in its hierarchy on `write()`.
- `WriterCollection` matches the **longest prefix** (greedy match) when routing writes to writers.
- `DuplexCollection` uses an internal `ReaderCollectionPrioritized` with the writer first, so written resources shadow the reader's resources.
- `fsInterface` provides a Node.js `fs`-compatible wrapper but only implements `readFile`, `stat`, and `readdir`. `mkdir` is a no-op.
- `Resource.getIntegrity()` computes SHA-256 via `ssri` — this triggers full content loading if not already loaded.
- Monitored readers/writers (`MonitoredReader`, `MonitoredReaderWriter`) prevent reads/writes after being sealed. They track all access patterns for build caching analysis.

## Running Tests

```bash
# All tests
npm run unit --workspace=@ui5/fs

# Single file
cd packages/fs && npx ava test/lib/Resource.js

# Verbose with logging
npm run unit-verbose --workspace=@ui5/fs

# Coverage
npm run coverage --workspace=@ui5/fs
```
