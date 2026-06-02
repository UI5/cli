# Migrate to v5

::: tip Alpha Release Available
**UI5 CLI 5.0 Alpha is now available for testing! 🎉**

Try the alpha release in your projects via: `npm i --save-dev @ui5/cli@next`  
Or update your global install via: `npm i --global @ui5/cli@next`

**Note:** This is a pre-release version.
:::

## Breaking Changes

- **All UI5 CLI Modules require Node.js ^22.20.0 || >=24.0.0**

- **@ui5/cli: `ui5 init` defaults to Specification Version 5.0**

- **Rename: Command Option `--cache-mode` is now `--snapshot-cache`**


## Node.js and npm Version Support

This release requires **Node.js version v22.20.0 and higher or v24.0.0 and higher (v23 is not supported)** as well as npm v8 or higher.
Support for older Node.js releases has been dropped; their use will cause an error.

## Specification Versions Support

UI5 CLI 5.x introduces **Specification Version 5.0**, which enables the new Component Type and brings improved project structure conventions.

Projects using older **Specification Versions** are expected to be **fully compatible with UI5 CLI v5**.

## Incremental Build

UI5 CLI v5 introduces **incremental builds with caching** for both commands `ui5 build` and `ui5 serve`. This fundamental architectural change significantly improves build performance by reusing cached results from previous builds.

### What Changed

**Previous Behavior (v4 and earlier):**
- Every source change resulted in an entire rebuild of all projects
- Every build executed all tasks from scratch
- No caching between builds or server sessions

**New Behavior (v5):**
- Only relevant projects are rebuilt
- Only modified resources and affected tasks are reprocessed
- **For `ui5 build`**: Caches are used automatically when available
- **For `ui5 serve`**: When a source file change occured and a request was made, the server automatically detects this, tries to use caches and only rebuilds when none are available

### Impact on Your Workflow

#### Performance

- **First build**: Probably slower, as the cache is populated with all build outputs
- **Subsequent builds**: Significantly faster — only modified resources and affected tasks are reprocessed
- **Quick iterations**: Changes to individual files typically rebuild very quickly
- **Cache reuse**: Caches are used between server restarts and multiple build sessions

TODO: Include some performance stats?

### New CLI Options

#### `--cache` Option

Both `ui5 build` and `ui5 serve` now support a `--cache` option to control this build cache behavior:

| Mode | Description |
|------|-------------|
| `Default` | Use cache if available, create/update as needed (default) |
| `Force` | Only use cache; fail if unavailable or invalid |
| `ReadOnly` | Use cache but don't write to file system |
| `Off` | Disable caching and rebuild from scratch |

Example:
```sh
ui5 serve --cache ReadOnly  # Use a cache if available, rebuild if not (don't write)
ui5 serve --cache Off  # Disable build caching
ui5 build --cache Force  # Always try to use the cache and fail if not available
```

#### Watch Mode
<br>

##### ui5 serve
When using `ui5 serve`, the development server automatically:

1. **Watches source files** for changes (files in `src/`, `webapp/`, `test/`, etc.)
1. **Triggers automatic rebuilds** when changes are detected and a request is made (when Live Reload is enabled, this is automatically handled)

<br>

##### ui5 build
When using `ui5 build --watch`, the UI5 CLI also **watches source files** and **triggers automatic rebuilds** when changes are detected.

::: tip
Watch mode monitors your source files only. Changes to configuration files (`ui5.yaml`, `package.json`) or custom task implementations require a server restart (or build restart for `ui5 build`).
:::

#### Live Reload

When using `ui5 serve --live-reload` or adding `liveReload` to the ui5.yaml config (TODO: Adjust UI5 CLI - Server Config docs), the development server **notifies the browser** to reload the page automatically. In this scenario, manual refreshes to trigger a rebuild are not required.

TODO: Add bit more explanation about technical details (e.g. Websockets / SSE) once it's implemented. --> which browsers are supported?

### Cache Management

By default, the build cache is stored in `~/.ui5/buildCache/`. You can:

- **Customize the location:**
  see [Changing UI5 CLI's Data Directory](../pages/Troubleshooting.md#changing-ui5-clis-data-directory)

- **Adjust caching behavior**:
  ```sh
  ui5 build --cache Off
  ui5 serve --cache ReadOnly
  ```

- **Clear the cache:**
  ```
  TODO: Add cache clean command explanation
  ```

- **Verify the cache:**
  ```
  TODO: Add cache verify command explanation
  ```

### Migration Checklist

- **Specification Version**: Make sure to use at least **Specification Version 5.0** in your UI5 config
- **New performance expectations**: First build might be slower, but subsequent builds are much faster
- **Review custom middleware**: With this feature, tasks are executed in server sessions. For this reason, some (custom) middleware might be obsolete or cause problems (TODO: Add which specific middleware??). Projects might need to adapt their configuration

## Rename of Command Option

With UI5 CLI v5, the option `--cache-mode` (for commands `ui5 build` and `ui5 serve`) has been renamed to `--snapshot-cache`.

When legacy `--cache-mode` is used, the behavior remains the same but a deprecation warning is logged. When both `--snapshot-cache` and `--cache-mode` are used, the `--snapshot-cache` flag always gets priority.

## UI5 CLI Init Command

The `ui5 init` command now generates projects with Specification Version 5.0 by default.

## Component Type

The `component` type feature aims to introduce a new project type within the UI5 CLI ecosystem to support the development of UI5 component-like applications intended to run in container apps such as the Fiori Launchpad (FLP) Sandbox or testsuite environments.

This feature will allow developers to serve and build multiple UI5 application components concurrently, enhancing the local development environment for integration scenarios.

**Note:** A component type project must contain both a `Component.js` and a `manifest.json` file in the source directory.

More details about the Component Type can be found in the [Project: Type `component`](../pages/Project#component) documentation.

### Migrating from Application to Component Type

If you have an existing application that you'd like to migrate to the Component Type, there are several steps to follow.
The migration involves updating your project configuration and restructuring your project directories to align with the Component Type conventions.

**Main changes**:
1. Source directories `src` and `test` instead of `webapp` and `webapp/test`
1. Files are served under `/resources/<namespace>/` and `/test-resources/<namespace>/` paths (instead of `/` and `/test/`)
    - This affects (relative)-paths in HTML files, test suite configuration, and test runner setups

#### 1. Update `ui5.yaml` Configuration

Update your `ui5.yaml` file to use the Component Type and Specification Version 5.0:

```diff
- specVersion: "4.0"
- type: application
+ specVersion: "5.0"
+ type: component
  metadata:
    name: my.sample.app
```

#### 2. Restructure Project Directories

Component Type follows a standardized directory structure:

- **Move `webapp/test` to `test`** - Test folder is now at the project root level
- **Move `webapp` to `src`** - The source directory is now named `src` instead of `webapp`

::: code-group
```text [Before (Application)]
my-app/
├── ui5.yaml
├── package.json
└── webapp/
    ├── Component.js
    ├── manifest.json
    ├── index.html
    ├── controller/
    ├── view/
    └── test/
        ├── integration/
        └── unit/
```

```text [After (Component)]
my-app/
├── ui5.yaml
├── package.json
├── src/
│   ├── Component.js
│   ├── manifest.json
│   ├── controller/
│   └── view/
└── test/
    ├── index.html
    ├── integration/
    └── unit/
```
:::

#### 3. Adjust `test/index.html`

The `index.html` file is typically moved from `/webapp` to `/test` since it's primarily used for testing the component.

::: tip Note
If your application needs an HTML page for purposes other than testing, this might be an indicator that the project should continue to use the **application type** instead of migrating to the component type.
:::

Update the bootstrap script path to the correct relative location (taking the project's namespace into account) and remove the obsolete `data-sap-ui-resource-roots` configuration:

```diff
  <script
      id="sap-ui-bootstrap"
-     src="resources/sap-ui-core.js"
+     src="../../../../../resources/sap-ui-core.js"
      data-sap-ui-libs="sap.m"
      data-sap-ui-theme="sap_horizon"
-     data-sap-ui-resource-roots='{
-         "sap.ui.demo.todo": "./"
-     }'
      data-sap-ui-on-init="module:sap/ui/core/ComponentSupport"
      data-sap-ui-async="true">
  </script>
```

::: tip Alternative: Using `<base>` Tag
Instead of updating the bootstrap script path, you can add a `<base href="../../../../../">` tag in the `<head>` section of your HTML file. This allows you to keep the original path references.

**Important:** The `<base>` tag affects **all relative URLs** in the document (including images, stylesheets, links, scripts, and even in-page anchors like `#some-id`). If certain resources are not loading correctly after adding the `<base>` tag, check whether they were using relative paths that are now being resolved differently than intended.
:::

#### 4. Adjust `test/testsuite.qunit.html`

Simplify the test suite HTML by removing obsolete bootstrap attributes:

```diff
  <!DOCTYPE html>
  <html>
  <head>
      <meta charset="utf-8">
      <title>QUnit test suite for Todo App</title>
      <script
-         src="../resources/sap/ui/test/starter/createSuite.js"
+         src="../../../../../resources/sap/ui/test/starter/createSuite.js"
-         data-sap-ui-testsuite="test-resources/sap/ui/demo/todo/testsuite.qunit"
-         data-sap-ui-resource-roots='{
-             "test-resources.sap.ui.demo.todo": "./"
-         }'
     ></script>
  </head>
  <body>
  </body>
  </html>
```

**Changes:**
- Remove the `data-sap-ui-testsuite` attribute
- Remove the `data-sap-ui-resource-roots` attribute
- Update the `src` path to the correct relative location

#### 5. Adjust `test/testsuite.qunit.js`

Update the test suite configuration to remove obsolete path mappings:

```diff
  sap.ui.define(function () {
      return {
          name: "QUnit test suite for Todo App",
          defaults: {
-             page: "ui5://test-resources/sap/ui/demo/todo/Test.qunit.html?testsuite={suite}&test={name}",
              qunit: {
                  version: 2
-             },
-             loader: {
-                 paths: {
-                     "sap/ui/demo/todo": "../"
-                 }
              }
          },
          tests: {
              // ... test definitions
          }
      };
  });
```

#### 6. Delete Obsolete Test Files

Delete the custom `test/Test.qunit.html` file from your test directory. This file is no longer needed. The framework-provided test page can now be used directly.

#### 7. Update Additional Paths

Depending on your project setup, you might need to update additional paths in configuration files or test runners to reflect the new structure.
The test suite is now served under the standard `/test-resources/` path with the component's full namespace (e.g. `/test-resources/sap/ui/demo/todo/testsuite.qunit.html`).

## Removal of Standard Server Middleware

The following middleware has been removed from the [standard middlewares list](../pages/Server.md#standard-middleware):

* `serveThemes` — Theme compilation (LESS to CSS) is now handled by the `buildThemes` build task during the incremental build, rather than on demand during runtime. The resulting CSS files are served via the `serveResources` middleware. This change improves performance through build-time compilation and caching while maintaining the same functionality.

**Backward Compatibility:**
If your project or any custom middleware references a removed middleware via `beforeMiddleware` or `afterMiddleware`, UI5 CLI will automatically remap the reference to the nearest remaining middleware and log a deprecation warning. Your custom middleware will still be executed in the expected order.

**What Changed:**
- Theme CSS files (`library.css`, `library-RTL.css`, etc.) are now **pre-built** during the incremental build
- Files are served via `serveResources` instead of being compiled on demand
- The same CSS files are available at the same URLs as before

**Recommended Action:**
Update your `ui5.yaml` configuration to reference an existing middleware instead.

| Removed Middleware | Replacement Behavior | Recommended `afterMiddleware` |
| ------------------ | -------------------- | ----------------------------- |
| `serveThemes`      | CSS files pre-built by `buildThemes` task and served via `serveResources` | `testRunner` |

## Learn More

- [Project: Type `component`](../pages/Project#component)
- [Configuration: Specification Version 5.0](../pages/Configuration#specification-version-5-0)
- [RFC 0018: Component Type](https://github.com/UI5/cli/blob/-/rfcs/0018-component-type.md)
