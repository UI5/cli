- Start Date: 2023-11-24
- RFC PR: -
- Issue: -
- Affected components <!-- Check affected components by writing an "X" into the brackets -->
    + [ ] [ui5-builder](https://github.com/SAP/ui5-builder)
    + [ ] [ui5-server](https://github.com/SAP/ui5-server)
    + [ ] [ui5-cli](https://github.com/SAP/ui5-cli)
    + [ ] [ui5-fs](https://github.com/SAP/ui5-fs)
    + [x] [ui5-project](https://github.com/SAP/ui5-project)
    + [ ] [ui5-logger](https://github.com/SAP/ui5-logger)


# RFC 0015 Build Phases

*Note: The feature discussed in this RFC has first been proposed as part of [RFC 0012 UI5 Tooling Extension API v3](https://github.com/SAP/ui5-tooling/blob/main/rfcs/0012-UI5-Tooling-Extension-API-3.md#5-scheduling-of-extension-executions)*

## Summary

Introduce "Build Phases" to the UI5 Tooling build.

Currently the execution order of build tasks is hard-coded for each type in the respective [build definition](https://github.com/SAP/ui5-project/tree/2ec0f91c1d5d2e4afe83b509d24a16904f42dea2/lib/build/definitions). This is not very transparent for users of UI5 Tooling.

This concept introduces a generic framework to better define the order of execution for standard-, and [custom tasks](https://sap.github.io/ui5-tooling/v3/pages/extensibility/CustomTasks/).

## Motivation

For custom tasks, this concept removes the explicit dependency on standard- or other custom tasks when defining the order of execution in a UI5 project (see for example the [UI5 Tooling v3 configuration documentation](https://sap.github.io/ui5-tooling/v3/pages/extensibility/CustomTasks/#configuration)).

This explicit dependency on standard tasks lead to issues in the past. For example when UI5 Tooling v3 [removed several standard tasks](https://sap.github.io/ui5-tooling/v3/updates/migrate-v3/#removal-of-standard-tasks-and-processors), projects upgrading their UI5 Tooling dependencies had to manually choose an alternative task to reference. It was also hard to give clear advice on which task to use since it depends a lot on the nature of the custom task and it's requirements on the build resources provided by standard tasks.

This concept should also enable custom tasks to define a "default" build phase. This should make the consumption of custom tasks easier. Today, custom tasks often have to recommend the correct `beforeTask` or `afterTask` configuration which is then used as-is in many projects. By providing a default, this additional project configuration can be omitted.

### Additional Goal
*(to be investigated)*

This concept might make it possible for tasks and project builds to run semi-concurrently. For instance, certain build phases could be declared as "dependency free", meaning tasks in those phases must only process resources of the project itself and do not depend on the build result of dependencies. This would allow UI5 Tooling to executed those tasks concurrently while other projects are still being built.

Similarly, we could define that tasks in the same build phase must not depend on the result of each other, allowing for executing them concurrently as well.

The actual performance improvements from such changes should be proven first however.

## Detailed design

### Build Phases

Build Phase | Standard Tasks in that Phase | Notes
----: | ---- | ----
| | | |
_pre-build_ | *none* |
| | | |
_pre-prepare-sources_ | *none* | *No dependency access?*
**prepare-sources** | escapeNonAsciiCharacters, replaceCopyright, replaceVersion, replaceBuildtime, minify | *No dependency access?*
_post-prepare-sources_ | *none* | *No dependency access?*
| | | |
_pre-create-bundles_ | *none* |
**create-bundles** | generateFlexChangesBundle, generateManifestBundle,<br/>generateLibraryManifest, generateComponentPreload,<br/>generateLibraryPreload, generateStandaloneAppBundle |
_post-create-bundles_ | transformBootstrapHtml |
| | | |
_pre-build-themes_ | *none* |
**build-themes** | buildThemes |
_post-build-themes_ | generateThemeDesignerResources |
| | | |
_post-build_ | generateVersionInfo, generateVersionInfo, generateApiIndex, generateResourcesJson | Or rather a root-project specific phase?

The custom task configuration can reference a build phase and define whether the task should be executed at the *start* or at the *end* of a given phase. If multiple custom tasks are defined for the same execution time, the order of their definition in the project's ui5.yaml configuration is relevant.

**TODO:** Allow for concurrent execution in some phases?`

### Custom Task Configuration

**Old**

```yaml
specVersion: "3.0"
type: library
metadata:
  name: my.library
builder:
  customTasks:
    - name: render-markdown-files
      afterTask: minify # <- Explicit dependency to minify task
---
specVersion: "3.0"
kind: extension
type: task
metadata:
  name: render-markdown-files
task:
  path: lib/tasks/renderMarkdownFiles.js
```

**New**

```yaml
specVersion: "4.0"
type: library
metadata:
  name: my.library
builder:
  customTasks:
    - name: render-markdown-files
      # No scheduling configuration necessary (although possible, overwriting the task's default)
---
specVersion: "4.0"
kind: extension
type: task
metadata:
  name: render-markdown-files
task:
  path: lib/tasks/renderMarkdownFiles.js
  defaultBuildPhase: post-create-bundles # <- New default configuration
```

**TODO:** Allow for `defaultBeforeTask`/`defaultAfterTask` configuration in the custom task? This might be useful for setups where multiple custom tasks usually depend on each other, since the order of execution within a build phase depends on the order of custom task definitions in the project's configuration.

## How we teach this

**TODO**

## Drawbacks

**TODO**

## Alternatives

**TODO**

## Unresolved Questions and Bikeshedding

**TODO**
