# UI5 FS

The [UI5 FS](https://github.com/SAP/ui5-fs) provides a UI5-specific file system abstraction.

<script setup>
import VPButton from "vitepress/dist/client/theme-default/components/VPButton.vue"
</script>

::: tip
Browse the API reference for each FS API by navigating in the sidebar menu to **📚 API -> @ui5/fs**.
:::

## Overview

The virtual file system "UI5 FS" offers an abstraction layer from the physical file system. Among other features, it can combine a set of scattered file locations into a well-defined virtual structure.

### Resource

A [Resource](../api/@ui5_fs_Resource.html) basically represents a file. Besides providing access to the file content, it also carries metadata like the **virtual path** of the Resource.

Resources are typically created and stored in [Adapters](#adapters). Once read from a physical file system, they are typically kept in memory for further processing in other modules.

This ensures a high build performance, as physical read and write access for a high number of resources is kept to a minimum.

### Adapters

Adapters abstract access to different resource locations.

The [Memory Adapter](../api/@ui5_fs_adapters_Memory.html) represents a virtual file system which maintains respective [Resources](#resource) inside a virtual data structure.

The [File System Adapter](../api/@ui5_fs_adapters_FileSystem.html), on the other hand, has direct access to the physical file system. It maps a "virtual base path" to a given physical path.

Both adapters provide APIs to retrieve and persist [Resources](#resource), namely 

- to retrieve a single resource by its virtual path use `byPath()`,  
- to retrieve many resources based on patterns use `byGlob()`,
- to persist a single resource use `write()`.


### Reader Collections

Reader collections allow grouped access to multiple adapters, which might even be nested in other reader collections.

They implement the same API for **retrieving** resources as adapters (`byPath` and `byGlob`). Multiple flavors exist:

* [ReaderCollection](../api/@ui5_fs_ReaderCollection.html): The most basic collection. Allows parallel read access to multiple readers (i.e. adapters or collections)
* [ReaderCollectionPrioritized](../api/@ui5_fs_ReaderCollectionPrioritized.html): Contains a list of readers which are searched in-order. This allows one reader to "overlay" resources of another
* [DuplexCollection](../api/@ui5_fs_DuplexCollection.html): Contains a single reader and a single "writer". It therefore also implements the Adapter API for **persisting** resources (`write()`). When retrieving resources, the writer is prioritized over the reader
* [WriterCollection](../api/@ui5_fs_WriterCollection.html): Contains a set of writers and a mapping for each of them. When writing a resource, the writer is chosen based on the resource's virtual path.

<style>
.no-decoration {
    text-decoration: inherit;
}
</style>
