# Migrate to v3

!!! warning "Superseded"
	**UI5 CLI 3.0 has been superseded by version 4.0. See [Migrate to v4](./migrate-v4.md).**

	Find the announcement blog post for version 3.0 here: **[SAP Community: UI5 CLI 3.0](https://blogs.sap.com/2023/02/10/ui5-tooling-3.0/)**

## Node.js and npm Version Support

**This release requires Node.js versions v16.18.0, v18.12.0 or higher as well as npm v8 or higher.**
Support for older Node.js and npm releases has been dropped and will cause an error to be shown.

## Specification Versions Support

Going forward, **only projects with Specification Versions 2.0 and higher are supported.**

In case a legacy specification version is detected, **an automatic migration is attempted.**
This means your old projects might still work. Unless they have non-standard configuration in their ui5.yaml.

## Changes for Projects

!!! info
    ✅ Projects defining **Specification Version 2.x** are expected to be **fully compatible with UI5 CLI v3**

For projects defining the latest **Specification Versions 3.0 and higher**, some changes apply:

* **Breaking Change:** The `metadata.name` property is now restricted to contain only certain characters and no uppercase letters. See [Configuration: `name`](../pages/Configuration.md#name) for details

See also [Configuration: Specification Version 3.0](../pages/Configuration.md#specification-version-30).

## Changes for Extensions

!!! info
    ✅ Custom Tasks and Custom Middleware defining **Specification Version 2.x** are expected to be **fully compatible with UI5 CLI v3**

For extensions defining the latest **Specification Versions 3.0 and higher**, some changes and improvements apply:

* **Breaking Change:** Custom Tasks need to request access to dependency resources
    * By default, resources of dependencies can't be accessed. A custom task requiring such access needs to implement a callback function with the export name `determineRequiredDependencies`. In this function it can define the scope of dependency-access. Please refer to the [Custom Task: Required Dependencies](../pages/extensibility/CustomTasks.md#required-dependencies) documentation for details
* **Breaking Change:** The `metadata.name` property is now restricted to contain only certain characters and no uppercase letters. See [Configuration: `name`](../pages/Configuration.md#name) for details
* **Features:** Enhanced TaskUtil and MiddlewareUtil API
    * For example providing access to a [project's root directory](https://ui5.github.io/cli/v3/api/@ui5_project_build_helpers_TaskUtil.html#~ProjectInterface), or [dependencies](https://ui5.github.io/cli/v3/api/@ui5_project_build_helpers_TaskUtil.html#getDependencies)
    * See also [Custom Tasks](../pages/extensibility/CustomTasks.md) and [Custom Server Middleware](../pages/extensibility/CustomServerMiddleware.md)

## Changes to Dependency Configuration

!!! info
    ✅ The **`ui5.dependencies` package.json configuration** becomes obsolete and is ignored in UI5 CLI v3.

    Configuration like the following is not needed anymore:

    ```diff title="package.json"
    {
        [...]
    -     "ui5": {
    -       "dependencies": [
    -         "my-package"
    -       ]
    -     }
        [...]
    }
    ```

    `dependencies`, `devDependencies` and `optionalDependencies` are now [automatically analyzed](https://github.com/SAP/ui5-project/blob/ff04ae4aeeb7f7d889dffd0c0e3e8774dd708c79/lib/graph/providers/NodePackageDependencies.js#L104).
    If a dependency can be configured as a UI5 project or UI5 CLI extension, it is added to the graph and its `dependencies` are analyzed.

    Note that `devDependencies` and `optionalDependencies` are ignored for all but the current root project. For projects that are intended to be consumed in other projects (for example libraries), this means that any required custom tasks must be added to `dependencies`.

## Changes to Module API

The `normalizer` and `projectTree` modules have been removed. The `builder` API has been moved from @ui5/builder to @ui5/project.

The JSON based, internal representation of a project dependency tree has been replaced with a graph. This is the result of a major refactoring of @ui5/project which lead to a series of API changes.

Also the @ui5/server API has been changed. Instead of a `tree`, it now only accepts a `graph` instance as the first parameter.

### Migrate Your Code

The UI5 CLI-related modules such as @ui5/builder, etc. have been transformed to ES Modules ("ESM"). Therefore, they no longer use a CommonJS export and cannot be included via `require`.
If your code is in CommonJS format, it needs to use dynamic imports or be converted to [ES Modules](https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c).


**Old: @ui5/project v2**

```js
const {normalizer} = require("@ui5/project");
const {builder} = require("@ui5/builder");

const tree = await normalizer.generateProjectTree({cwd: "."});

await builder.build({
    tree,
    destPath: "./dist",
    buildDependencies: true,
});
```

**New: @ui5/project v3**

=== "ESM"

    ```js
    import {graphFromPackageDependencies} from "@ui5/project/graph";

    let graph = await graphFromPackageDependencies({cwd: "."});

    await graph.build({
        destPath: "./dist",
        includedDependencies: ["*"], // Parameter "buildDependencies" has been removed
    });
    ```

=== "CommonJS"

    ```js
    // Since CommonJS does not suport top-level await, the code must be wrapped in an asynchronous function
    async function buildProject() {
	    const {graphFromPackageDependencies} = await import("@ui5/project/graph");

	    let graph = await graphFromPackageDependencies({cwd: "."});

	    await graph.build({
	        destPath: "./dist",
	        includedDependencies: ["*"], // Parameter "buildDependencies" has been removed
	    });
    }
    ```

## Changes to @ui5/cli

* The CLI option `--translator` has been removed. For static dependency resolution, use the new option `--dependency-definition` to provide a file with static dependency information.
* The `ui5 build dev` command has been removed. Use `ui5 build --exclude-task=* --include-task=replaceCopyright replaceVersion replaceBuildtime buildThemes` instead.

## JSDoc Processor Fails When JSDoc Reports an Error

The `jsdocGenerator` processor and the corresponding `generateJsdoc` task will now throw an error when JSDoc reports an error (exit code != 0). This will also fail the build when running `ui5 build jsdoc`.

## Always Building Required Dependencies

If any of a project's build tasks requires access to resources of the project's dependencies, UI5 CLI v3 will now **always build that dependency upfront**.

This ensures that tasks always access processed resources and never the raw sources of a dependency. Resulting in better reproducibility of build results and resolving common issues.

Especially for projects of type `library`, where standard tasks like [`buildThemes`](https://github.com/SAP/ui5-project/blob/b40e3f569e0f01c6dd8e72141c7ba43449812d01/lib/build/definitions/library.js#L139) always require dependency access, UI5 CLI will now always build all dependencies.

In the future, a caching mechanism should help and improve build times with this new behavior.

!!! info
    The CLI flags `-a` and `--all` are still present and now an alias for `--include-all-dependencies`. This flag (along with `--include-dependency*` and `--exclude-dependency*`) mainly controls the **build output**. Use it to define whether dependency resources should be part of the build result.

    Please also refer to the [`ui5 build` documentation](../pages/CLI.md#ui5-build).

## Removal of Standard Tasks and Processors

The following tasks have been removed:

* createDebugFiles
* generateManifestBundle
* uglify

The following processors have been removed:

* debugFileCreator
* manifestBundler
* resourceCopier
* uglifier

**Task Migration**

| UI5 CLI v2                 | UI5 CLI v3                  | Note |
| --------------------------- | --------------------------- | ------------------------- |
| createDebugFiles<br/>uglify | minify                      | The minify task is executed earlier, before the bundling process takes place. Any existing `beforeTask` or `afterTask` configuration of custom tasks might need to be adapted to cater for this change. <br>To adapt, you can use the `generateResourcesJson` task for subscription before or after the last standard task. By default, `generateResourcesJson` is disabled, but you can still subscribe to it, thereby ensuring that your custom tasks execute in the correct order. |
| generateVersionInfo         | generateVersionInfo         | The task is no longer executed by default for application projects. It can be re-enabled by using the `--include-task` parameter. |
| generateManifestBundle      | *None*                      | This task was only needed for the HTML5 repository in Cloud Foundry. Meanwhile, the HTML5 repository implemented its own mechanism, so the task is no longer needed |

**Updated list of standard tasks:**

| Task                      | Type `application` | Type `library` | Type `theme-library` |
| ------------------------- | :----------------: | :------------: | :------------------: |
| escapeNonAsciiCharacters  | *enabled*          | *enabled*      |                      |
| replaceCopyright          | *enabled*          | *enabled*      | *enabled*            |
| replaceVersion            | *enabled*          | *enabled*      | *enabled*            |
| replaceBuildtime          |                    | *enabled*      |                      |
| generateJsdoc             |                    | *disabled* ^1^ |                      |
| executeJsdocSdkTransformation |                | *disabled* ^1^ |                      |
| **ADDED:** minify         | *enabled*          | *enabled*      |                      |
| generateFlexChangesBundle | *enabled*          | *enabled*      |                      |
| **REMOVED:** ~~generateManifestBundle~~ | *~~disabled~~* | *~~disabled~~* |            |
| generateLibraryManifest   |                    | *enabled*      |                      |
| generateComponentPreload  | *enabled*          | *disabled* ^2^ |                      |
| generateLibraryPreload    |                    | *enabled*      |                      |
| generateStandaloneAppBundle | *disabled* ^3^   |                |                      |
| transformBootstrapHtml    | *disabled* ^3^     |                |                      |
| generateBundle            | *disabled* ^4^     | *disabled* ^4^ |                      |
| buildThemes               |                    | *enabled*      | *enabled*            |
| generateThemeDesignerResources |               | *disabled* ^5^ | *disabled* ^5^       |
| **REMOVED:** ~~createDebugFiles~~ | *~~enabled~~* | *~~enabled~~* |                    | 
| **REMOVED:** ~~uglify~~   | *~~enabled~~*      | *~~enabled~~*  |                      |
| generateVersionInfo       | **disabled**       |                |                      |
| generateCachebusterInfo   | *disabled*         |                |                      |
| generateApiIndex          | *disabled* ^1^     |                |                      |
| generateResourcesJson     | *disabled*         | *disabled*     | *disabled*           |

*Disabled tasks can be activated by certain build modes, the project configuration, or by using the `--include-task` [CLI parameter](../pages/CLI.md#ui5-build). See footnotes where given* 

---

^1^ Enabled in `jsdoc` build, which disables most of the other tasks  
^2^ Enabled for projects defining a [component preload configuration](../pages/Configuration.md#component-preload-generation)  
^3^ Enabled in `self-contained` build, which disables `generateComponentPreload` and `generateLibraryPreload`  
^4^ Enabled for projects defining a [bundle configuration](../pages/Configuration.md#custom-bundling)  
^5^ Can be enabled for framework projects via the `includeTask` option. For other projects, this task is skipped

## Removal of Standard Middleware

The following middleware has been removed from the [standard middlewares list](../../pages/Server/#standard-middleware):

* connectUi5Proxy

**Middleware Migration**

| UI5 CLI v2                  | UI5 CLI v3                  | Note |
| --------------------------- | --------------------------- | ------------------------- |
| connectUi5Proxy | *None* | More sophisticated proxy solutions for ui5-server are now available in the form of [custom middleware extensions from the UI5-community](https://bestofui5.org/#/packages?tokens=proxy:tag). Make sure to refactor any custom middleware that attaches to `beforeMiddleware` or `afterMiddleware` of `connectUi5Proxy` to reference some other middleware. |
