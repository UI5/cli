# @ui5/fs Architecture Reference

## Component Map

| Component | File | Purpose |
|-----------|------|---------|
| **AbstractReader** | `lib/AbstractReader.js` | Abstract base for all readers. Defines `byPath()`, `byGlob()` |
| **AbstractReaderWriter** | `lib/AbstractReaderWriter.js` | Extends AbstractReader with `write()` |
| **Resource** | `lib/Resource.js` | Core file representation: content + metadata |
| **ResourceFacade** | `lib/ResourceFacade.js` | Wraps Resource with remapped virtual path |
| **ResourceTagCollection** | `lib/ResourceTagCollection.js` | Tag storage and validation (`"namespace:Name"`) |
| **MonitoredResourceTagCollection** | `lib/MonitoredResourceTagCollection.js` | Wraps ResourceTagCollection with access tracking |
| **MonitoredReader** | `lib/MonitoredReader.js` | Wraps reader with access tracking (seals after use) |
| **MonitoredReaderWriter** | `lib/MonitoredReaderWriter.js` | Wraps reader/writer with access tracking |
| **ReaderCollection** | `lib/ReaderCollection.js` | Parallel multi-reader aggregation |
| **ReaderCollectionPrioritized** | `lib/ReaderCollectionPrioritized.js` | Sequential prioritized multi-reader |
| **DuplexCollection** | `lib/DuplexCollection.js` | Combined reader + writer (writer shadows reader) |
| **WriterCollection** | `lib/WriterCollection.js` | Path-prefix-routed multi-writer |
| **FileSystem adapter** | `lib/adapters/FileSystem.js` | Real filesystem adapter (globby, graceful-fs) |
| **Memory adapter** | `lib/adapters/Memory.js` | In-memory virtual adapter (micromatch) |
| **AbstractAdapter** | `lib/adapters/AbstractAdapter.js` | Base adapter: virBasePath, excludes, path normalization |
| **Filter reader** | `lib/readers/Filter.js` | Callback-based resource filtering |
| **Link reader** | `lib/readers/Link.js` | Virtual path remapping (returns ResourceFacade) |
| **Proxy reader** | `lib/readers/Proxy.js` | Custom getResource/listResourcePaths callbacks |
| **resourceFactory** | `lib/resourceFactory.js` | Factory functions for all components |
| **fsInterface** | `lib/fsInterface.js` | Node.js fs-compatible wrapper over readers |
| **Trace** | `lib/tracing/Trace.js` | Performance tracing (active at log level "silly") |
| **traceSummary** | `lib/tracing/traceSummary.js` | Aggregates trace reports |

## Class Hierarchy

```
AbstractReader
├── AbstractReaderWriter
│   ├── AbstractAdapter
│   │   ├── adapters/FileSystem
│   │   └── adapters/Memory
│   ├── DuplexCollection
│   ├── WriterCollection
│   └── MonitoredReaderWriter
├── ReaderCollection
├── ReaderCollectionPrioritized
├── readers/Filter
├── readers/Link
├── readers/Proxy
└── MonitoredReader

Resource          (standalone)
ResourceFacade    (wraps Resource)
ResourceTagCollection (standalone)
MonitoredResourceTagCollection (wraps ResourceTagCollection)
```

## Resource Content Model

### Content Types (internal state machine)

```
FACTORY ──getBuffer()/getString()/getStreamAsync()──> BUFFER
BUFFER  ──setStream()──> STREAM
STREAM  ──getBuffer()/getString()──> BUFFER  (consumes stream)
BUFFER  ──setBuffer()/setString()──> BUFFER
*       ──modifyStream()──> IN_TRANSFORMATION ──callback done──> BUFFER
*       ──write({drain:true})──> DRAINED_STREAM
```

- **FACTORY**: Lazy — content created on demand via `createBuffer`/`createStream` factories
- **BUFFER**: Content fully materialized in memory
- **STREAM**: Readable stream (single-consume; converted to BUFFER on read)
- **DRAINED_STREAM**: Content was released after write; further reads throw
- **IN_TRANSFORMATION**: Locked during `modifyStream()` callback

### Content Creation (mutually exclusive parameters)

```javascript
new Resource({
  path: "/resources/my/File.js",    // Required, absolute POSIX
  buffer: Buffer.from("..."),       // OR
  string: "...",                    // OR
  stream: readableStream,           // OR
  createBuffer: async () => buf,    // OR
  createStream: async () => stream  // (factories for lazy loading)
});
```

### Content Access

| Method | Returns | Notes |
|--------|---------|-------|
| `getBuffer()` | `Promise<Buffer>` | Materializes content if needed |
| `getString()` | `Promise<string>` | UTF-8 decoded buffer |
| `getStreamAsync()` | `Promise<stream.Readable>` | Preferred over deprecated `getStream()` |
| `getStream()` | `stream.Readable` | **Deprecated** — sync, logs warning once |
| `setBuffer(buf)` | — | Marks resource as modified |
| `setString(str)` | — | Marks resource as modified |
| `setStream(stream\|fn)` | — | Accepts stream or factory function |
| `modifyStream(cb)` | `Promise` | Acquires mutex; `cb(stream) => stream\|Buffer` |

### Metadata

| Method | Returns | Notes |
|--------|---------|-------|
| `getPath()` | `string` | Absolute POSIX virtual path |
| `setPath(path)` | — | Updates path (throws on ResourceFacade) |
| `getOriginalPath()` | `string` | For ResourceFacade: underlying path |
| `getName()` | `string` | Basename of path |
| `isDirectory()` | `boolean` | — |
| `getLastModified()` | `number` | ms since epoch |
| `getInode()` | `number` | Filesystem inode |
| `getSize()` | `Promise<number>` | Byte size (triggers content load) |
| `hasSize()` | `boolean` | True if size known without content load |
| `getIntegrity()` | `Promise<string>` | SHA-256 via ssri (triggers content load) |
| `isModified()` | `boolean` | True if content changed since creation |
| `getProject()` | `object` | Associated @ui5/project |
| `getSourceMetadata()` | `object` | `{adapter, fsPath, contentModified}` |
| `clone()` | `Promise<Resource>` | Independent deep copy |
| `getTags()` | `ResourceTagCollection` | Tag operations for this resource |
| `pushCollection(name)` | — | Track retrieval collection (tracing) |

## Adapter Internals

### AbstractAdapter

Base class for FileSystem and Memory adapters. Extends `AbstractReaderWriter`.

**Constructor params:** `{name, virBasePath, excludes, project}`

**Key internal methods:**
- `_isPathHandled(virPath)` — checks if path falls under `virBasePath`
- `_isPathExcluded(virPath)` — checks if path matches exclude patterns
- `_resolveVirtualPathToBase(virPath, writeMode)` — strips `virBasePath` prefix, returns relative path
- `_normalizePattern(virPattern)` — makes glob patterns relative to adapter base
- `_createResource(params)` — creates Resource with project and source metadata injected

### FileSystem Adapter

Maps a `virBasePath` to a `fsBasePath` on the real filesystem.

**Additional constructor params:** `{fsBasePath, useGitignore}`

**Glob:** Uses `globby` with `gitignore` support. Glob patterns are resolved relative to `fsBasePath`.

**Content loading:** Uses factory functions for lazy loading:
```javascript
createStream: () => createReadStream(fsPath)
createBuffer: () => readFile(fsPath)
```

**Write optimization:**
1. Unmodified resource with same source adapter → `fs.copyFile` (fast path)
2. Source path === target path and content unmodified → skip write entirely
3. Source path === target path but content modified → read to buffer first (avoids read-during-write)
4. Otherwise → pipe stream to write stream

**Read-only:** When `write({readOnly: true})`, sets `chmod 0o444` after writing.

### Memory Adapter

Virtual in-memory storage. No filesystem access.

**Internal data structures:**
- `_virFiles` — Map of virtual path → Resource
- `_virDirs` — Map of virtual path → Resource (directory entries)

**Glob:** Uses `micromatch` against keys of `_virFiles`/`_virDirs`.

**Write:** Clones resource, auto-creates parent directory hierarchy entries.

**Read:** Returns clones of stored resources (never the originals).

## Collection Patterns

### ReaderCollection (parallel)

```javascript
// byGlob: Promise.all across all readers, concat results
// byPath: Promise.all, return first non-null
```

Use when sources are independent and results should be aggregated.

### ReaderCollectionPrioritized (sequential priority)

```javascript
// byGlob: runs all readers, deduplicates by path (first reader wins)
// byPath: tries readers in order, returns first match
```

Use when one source should shadow another (e.g., local overrides).

### DuplexCollection (reader + writer)

Internally creates `ReaderCollectionPrioritized([writer, reader])`:
- Reads check writer first (written resources shadow originals)
- Writes go to the writer adapter

**Primary use case:** Build workspace — write intermediate results to memory, which then take priority over source files on read.

### WriterCollection (path-routed writes)

Routes `write()` calls based on longest-matching path prefix:
```javascript
new WriterCollection({
  writerMapping: {
    "/":                     defaultWriter,
    "/resources/my-lib/":    libWriter,      // matches /resources/my-lib/**
  }
});
```

For reading, creates an internal `ReaderCollection` from all unique writers.

## Specialized Readers

### Filter

Wraps a reader with a predicate callback:
```javascript
new Filter({
  reader: sourceReader,
  callback: (resource) => !resource.getPath().endsWith(".map")
});
```
- `byGlob()` filters results after reader returns them
- `byPath()` returns null if callback rejects the resource

### Link

Remaps virtual paths between `linkPath` and `targetPath`:
```javascript
new Link({
  reader: sourceReader,
  pathMapping: { linkPath: "/app", targetPath: "/resources/my-app/" }
});
```
- Returns `ResourceFacade` instances with remapped paths
- `byPath("/app/Component.js")` → reads `/resources/my-app/Component.js` from source reader
- `byGlob("/app/**")` → resolves patterns against target path, returns facades

### Proxy

Generic callback-based reader for custom resource sources:
```javascript
new Proxy({
  name: "my-proxy",
  getResource: async (virPath) => resource,
  listResourcePaths: async () => ["/path/a.js", "/path/b.js"]
});
```

## resourceFactory API

The primary entry point for creating @ui5/fs components.

| Function | Returns | Purpose |
|----------|---------|---------|
| `createAdapter({name, virBasePath, fsBasePath?, ...})` | FileSystem or Memory adapter | FileSystem if `fsBasePath` given, else Memory |
| `createReader({fsBasePath, virBasePath, ...})` | ReaderCollection | FS adapter wrapped in ReaderCollection |
| `createReaderCollection({name, readers})` | ReaderCollection | Parallel collection |
| `createReaderCollectionPrioritized({name, readers})` | ReaderCollectionPrioritized | Priority collection |
| `createWriterCollection({name, writerMapping})` | WriterCollection | Path-routed writer |
| `createWorkspace({reader, writer?, virBasePath?, name?})` | DuplexCollection | Build workspace pattern |
| `createResource(params)` | Resource | Resource instance |
| `createFilterReader({reader, callback})` | Filter | Filtered reader |
| `createLinkReader({reader, pathMapping})` | Link | Path-remapping reader |
| `createFlatReader({name, reader, namespace})` | Link | Shorthand: maps `/` → `/resources/<namespace>/` |
| `createProxy({name, getResource, listResourcePaths})` | Proxy | Custom source reader |
| `createMonitor(readerWriter)` | MonitoredReaderWriter | Access-tracking wrapper |
| `prefixGlobPattern(virPattern, virBaseDir)` | string | Prepend base directory to glob pattern |

## Monitoring System

Used by the incremental build system to track what resources were accessed during a build task.

### MonitoredReader / MonitoredReaderWriter

Wraps a reader/writer and records all `byPath()`, `byGlob()`, and `write()` calls.

```javascript
const monitored = createMonitor(adapter);
// ... perform operations ...
const requests = monitored.getResourceRequests();
// { paths: ["/resources/a.js"], patterns: ["**/*.xml"] }
```

After sealing, further access throws an error.

### MonitoredResourceTagCollection

Wraps `ResourceTagCollection` and tracks all `setTag()`, `getTag()`, `clearTag()` calls.

```javascript
const operations = monitoredTags.getTagOperations();
// Map { "/resources/a.js" => { "build:IsDebug": true } }
```

## Tag System

Tags follow the format `"namespace:Name"`:
- **Namespace**: lowercase alphanumeric, starts with letter (e.g., `build`, `theme`)
- **Name**: PascalCase alphanumeric (e.g., `IsDebugVariant`, `IsPartOfBuild`)
- **Values**: `string | number | boolean` (default: `true`)

Tags are stored per-resource-path in `ResourceTagCollection._pathTags`.

Allowed tags/namespaces are validated on `setTag()`. Tags can be initialized from a serialized object via the `tags` constructor parameter.

## Public Exports

```javascript
import AbstractReader from "@ui5/fs/AbstractReader";
import AbstractReaderWriter from "@ui5/fs/AbstractReaderWriter";
import DuplexCollection from "@ui5/fs/DuplexCollection";
import ReaderCollection from "@ui5/fs/ReaderCollection";
import ReaderCollectionPrioritized from "@ui5/fs/ReaderCollectionPrioritized";
import Resource from "@ui5/fs/Resource";
import fsInterface from "@ui5/fs/fsInterface";
import {createAdapter, createResource, ...} from "@ui5/fs/resourceFactory";
import FileSystem from "@ui5/fs/adapters/FileSystem";
import Memory from "@ui5/fs/adapters/Memory";
import Filter from "@ui5/fs/readers/Filter";
import Link from "@ui5/fs/readers/Link";
import Proxy from "@ui5/fs/readers/Proxy";

// Internal (not part of public API contract):
import ResourceTagCollection from "@ui5/fs/internal/ResourceTagCollection";
import MonitoredResourceTagCollection from "@ui5/fs/internal/MonitoredResourceTagCollection";
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `@ui5/logger` | Logging (`getLogger("fs:Resource")`, etc.) |
| `async-mutex` | Mutex for concurrent content access in Resource |
| `clone` | Deep cloning resources in Memory adapter |
| `globby` | File globbing in FileSystem adapter |
| `graceful-fs` | Robust fs operations in FileSystem adapter |
| `micromatch` | Pattern matching in Memory adapter |
| `minimatch` | Glob parsing in resourceFactory |
| `ssri` | SHA-256 integrity hashing in Resource |
| `pretty-hrtime` | Human-readable time in Trace |
| `random-int` | Result order randomization in AbstractReader |

## Test Structure

Tests mirror the lib structure under `packages/fs/test/lib/`:

```
test/
├── lib/
│   ├── AbstractReader.js
│   ├── AbstractReaderWriter.js
│   ├── Resource.js
│   ├── ResourceFacade.js
│   ├── ResourceTagCollection.js
│   ├── MonitoredReader.js
│   ├── MonitoredReaderWriter.js
│   ├── MonitoredResourceTagCollection.js
│   ├── ReaderCollection.js
│   ├── ReaderCollectionPrioritized.js
│   ├── DuplexCollection.js
│   ├── WriterCollection.js
│   ├── fsInterface.js
│   ├── resourceFactory.js
│   ├── adapters/
│   │   ├── AbstractAdapter.js
│   │   ├── FileSystem.js
│   │   ├── FileSystem_write.js
│   │   └── Memory.js
│   ├── readers/
│   │   ├── Filter.js
│   │   ├── Link.js
│   │   └── Proxy.js
│   └── tracing/
│       └── Trace.js
└── fixtures/
    └── ...
```

Framework: AVA with `esmock` for ESM module mocking and `sinon` for stubs/spies.
