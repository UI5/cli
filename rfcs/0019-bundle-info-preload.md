- Start Date: 2025-11-17
- RFC PR: [#1194](https://github.com/UI5/cli/pull/1194)
- Issue: -
- Affected components <!-- Check affected components by writing an "X" into the brackets -->
    + [x] [ui5-builder](./packages/builder)
    + [ ] [ui5-server](./packages/server)
    + [ ] [ui5-cli](./packages/cli)
    + [ ] [ui5-fs](./packages/fs)
    + [ ] [ui5-project](./packages/project)
    + [ ] [ui5-logger](./packages/logger)


# RFC 0019 Bundle Info Preload

## Summary

This RFC proposes a new bundling approach for UI5 libraries called "Bundle-Info Preload". Instead of a single monolithic `library-preload.js`, each library will be split into two bundles:

1. `library-preload.js`: A small initial bundle containing the `library.js`, its direct dependencies, as well as "bundle-info" describing the content of the second bundle
2. `_library-content.js`: A larger secondary bundle containing the remaining modules of the library.

This allows the UI5 runtime to always load the small `library-preload.js` for all declared library dependencies, including those marked as "lazy". The larger `_library-content.js` is only loaded on-demand when a module from within it is actually requested. This new mechanism eliminates the need for application developers to manually trigger the loading of lazy dependencies.

## Motivation

Currently, UI5 applications often declare library dependencies as "lazy" in their `manifest.json` to improve initial loading times. However, this requires developers to explicitly load these libraries using `sap/ui/core/Lib#load("sap.m")` (or the deprecated variant `sap.ui.getCore().loadLibrary("sap.m")`) before any of their modules can be used. This is a manual and error-prone process.

By splitting the library preload, the essential part of a library can be loaded eagerly without a significant performance penalty. The UI5 loader can then automatically fetch the larger part of the library when it's first needed.

This leads to the following benefits:
- **Simplified Application Development:** Developers no longer need to manually manage the loading of lazy library dependencies.
- **Improved Performance:** The large content bundle is only requested if the library is actually used, improving startup performance for applications with many optional dependencies.
- **Efficient Parallel Loading:** This concept fits well with the "manifest-first" loading strategy, enabling more efficient and parallel loading of dependencies.

## Detailed design

The implementation of "Bundle-Info Preload" shall be handled by the UI5 CLI, specifically in the `ui5-builder` package.

### Bundling Process

For any given UI5 library, the build process shall generate two bundles instead of one:

1. **`library-preload.js`**: This bundle shall contain:
    * The library's `library.js` file.
    * All transitive dependencies of `library.js` that are part of the same library.
    * A "bundle-info" section. This metadata informs the UI5 loader about which modules are contained in the second bundle.
2. **`_library-content.js`**: This bundle shall contain all other productive JavaScript modules of the library that are not included in the `library-preload.js`. The leading underscore in the name indicates that this file is intended for framework internal use. Application developers should not expect the existence of this file and should not reference it directly.

A future UI5 CLI major release shall make this new bundling the default behavior for all UI5 libraries, regardless of the UI5 version they are built for. Existing custom bundle definitions for `library-preload.js` will be respected and will overrule this default behavior.

### Manifest Flag

To allow the UI5 runtime to identify libraries built with this new approach, the UI5 CLI will add a new attribute to the library's `manifest.json` file:

```json
{
    "sap.ui5": {
        "library": {
            "bundleVersion": 2
        }
    }
}
```

The presence of `"bundleVersion": 2` signals to the UI5 runtime that the library uses the "Bundle-Info Preload" format. The runtime can then safely and efficiently load the `library-preload.js` bundles for any lazy dependencies. If this flag is absent, the runtime can assume a legacy bundling format and issue a warning or error, as it expects all libraries for UI5 2.0+ to be built with a compatible UI5 CLI version.

Note that this manifest attribute will only be added in a later manifest version. Therefore, the UI5 CLI must also adapt the manifest version accordingly when building libraries.

### Planned Runtime Behavior

In a future UI5 framework release the following behavior might be implemented:

1. The application's `manifest.json` is loaded first.
2. The UI5 runtime analyzes the library dependencies.
3. For every library dependency (eager or lazy), it requests the corresponding `library-preload.js` file.
4. When application code requests a module from a library for the first time, the UI5 loader checks the bundle-info from the already loaded `library-preload.js`.
5. If the module is located in the secondary bundle, the loader requests the `_library-content.js` file and then provides the requested module. Subsequent requests for modules from that bundle are served directly from the loaded bundle similar to the "legacy" `library-preload.js`.

### Handling `manifest.json` in `library-preload.js`

To support manifest-first loading in modern UI5 versions, the `manifest.json` of a library will **not** be included in its `library-preload.js` when building for UI5 2.0 and higher. For older UI5 1.x versions, the `manifest.json` will still be included to ensure compatibility, as these versions do not support manifest-first loading for libraries.

UI5 CLI shall attempt to detect the target UI5 version based on the version of the project's `sap.ui.core` dependency. If no such dependency is present, it should fallback to include the `manifest.json`, since this will only create little overhead and ensures compatibility with older UI5 versions.

## How we teach this

The "Bundle-Info Preload" feature is designed to work transparently for most developers. The primary audience for this change is UI5 framework developers and library developers that work with custom bundle definitions.

**Terminology:**
- **Initial/Primary Bundle:** The new, smaller `library-preload.js`.
- **Content/Secondary Bundle:** The `_library-content.js` file.

**Documentation:**
- The UI5 CLI documentation for the `build` command should be updated to explain the new default bundling strategy.

## Drawbacks

UI5 releases prior to version 1.74 do not provide all required UI5 loader features, making the new bundling incompatible with these versions. Developers still targeting older releases (such as 1.71) will need to stick with an older release of UI5 CLI where the new bundling is not used.

Similarly, the addition of the manifest flag requires the use of a specific manifest version which might not be supported by older UI5 releases. However, due to lack of validation of the manifest version in older UI5 releases, this is not expected to cause practical issues.

Another drawback is the introduction of an additional request for the `_library-content.js` file. However, this request only occurs if the library is actually used, and it happens in parallel with other requests. For libraries that are declared but never used, this approach saves bandwidth by not loading the large content bundle at all. For eagerly used libraries, the performance impact is expected to be negligible and outweighed by the benefits of parallel loading and simplified development.

There is also a minor risk of confusion if developers are not aware of the new bundling and are surprised by the presence of the `_library-content.js` file. Clear documentation will be key to mitigating this.

## Alternatives

1. Keep the status quo: Continue to require manual loading of lazy dependencies. This does not solve the underlying usability problem.
2. Configuration Flag: Introduce a `ui5.yaml` configuration flag to enable or disable this feature. This would add unnecessary complexity. We are currently not aware of any significant drawbacks to using this new bundling with older UI5 versions (1.74 and later, see above), making a flag mostly redundant.
3. Different Heuristics: Use other heuristics, like the project's `specVersion` or `manifest.json` version, to decide which bundling to apply. These are not reliable indicators of the target UI5 runtime version and would lead to a more complex and less predictable system. Always applying the new bundling is simpler and more robust.

## Unresolved Questions and Bikeshedding

*This section should be removed (i.e. resolved) before merging*

The core concepts seem to be well-defined. The main points for final confirmation are:
- Final confirmation from colleagues on the name and location of the manifest flag (`"sap.ui5".library.bundleVersion`)
