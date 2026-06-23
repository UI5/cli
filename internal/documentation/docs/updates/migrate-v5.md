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

- **@ui5/server: Live Reload is enabled by default for `ui5 serve`**

- **@ui5/server: Standard middleware `serveThemes` and `testRunner` have been removed**

## Node.js and npm Version Support

This release requires **Node.js version v22.20.0 and higher or v24.0.0 and higher (v23 is not supported)** as well as npm v8 or higher.
Support for older Node.js releases has been dropped; their use will cause an error.

## Specification Versions Support

UI5 CLI 5.x introduces **Specification Version 5.0**, which enables the new Component Type and brings improved project structure conventions.

Projects using older **Specification Versions** are expected to be **fully compatible with UI5 CLI v5**.

## Build Cache

UI5 CLI v5 introduces **builds with caching** for both the `ui5 build` and `ui5 serve` commands. This fundamental architectural change significantly improves build performance by reusing cached results from previous builds. It also simplifies development with the server by making most custom middleware obsolete.

### What Changed

**Previous Behavior (v4 and earlier):**
- Every source change resulted in a full rebuild of all projects
- Every build re-executed all tasks
- No caching between builds or server sessions
- Custom middleware was required for special actions

**New Behavior (v5):**
- Only relevant projects are rebuilt
- Only modified resources and affected tasks are re-processed
- Some custom middleware is now obsolete as it can be replaced with build tasks

### Impact on Your Workflow

- **First build**: Probably slightly slower as the cache is populated with all build outputs
- **Subsequent builds**: Significantly faster — only modified resources and affected tasks are reprocessed
- **Quick iterations**: Changes to individual files typically rebuild very quickly
- **Cross-session**: Caches are used between server restarts and build runs

### For `ui5 build`

When `ui5 build` is executed, build caches are automatically serialized and reused when available.

::: tip Tip for Single Builds (e.g. CI/CD)
If you plan to execute a build only once (for example during a CI run), consider using `--cache "Off"` (see [Build Cache Control](../pages/Builder.md#build-cache-control)) to skip cache serialization.
:::

### For `ui5 serve`

The UI5 Server now performs a build of the project. When started with `ui5 serve`, a similar build to `ui5 build` is executed containing standard and custom tasks (see [exceptions](../pages/Server.md#standard-tasks)).

During a server session, source changes are automatically monitored. When a request is made, the server detects this, tries to use caches, and only rebuilds when none are available. For more information, see [Watch Mode Behavior](../pages/Server.md#watch-mode-behavior).

::: tip Review custom middleware
Due to **build tasks now being executed in server sessions**, custom middleware becomes obsolete if a corresponding task can perform the same actions (for example, Typescript transpilation). However, custom middleware for non-build purposes, such as proxies, are not affected by this and are still a valid use case.
:::

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

## Live Reload

UI5 CLI v5 introduces a built-in [Live Reload](../pages/Server.md#livereload) feature for the development server. When running `ui5 serve`, the browser automatically reloads whenever project sources change. Live Reload is implemented via a WebSocket connection.

Live Reload is **enabled by default**. It can be controlled via:

- The new `--live-reload` CLI flag for `ui5 serve` (defaults to `true`). Pass `--no-live-reload` to disable it.
- The new `server.settings.liveReload` configuration option in `ui5.yaml`. This setting is only available with [Specification Version 5.0](../pages/Configuration#specification-version-5-0) and higher.

::: warning Custom Live Reload Middleware
If your project uses a custom middleware that provides live reload functionality (e.g. [@sap-ux/reload-middleware](https://www.npmjs.com/package/@sap-ux/reload-middleware) or [ui5-middleware-livereload](https://www.npmjs.com/package/ui5-middleware-livereload)), the page may refresh more often than necessary when combined with the built-in feature. When upgrading, either remove the custom middleware or disable the built-in Live Reload via the `--no-live-reload` CLI flag or the `server.settings.liveReload` configuration option.
:::

## Removal of Standard Server Middleware

The following middleware has been removed from the [standard middlewares list](../pages/Server.md#standard-middleware):

* `serveThemes` — The `buildThemes` build task now handles theme compilation (LESS to CSS). Because server sessions now also perform builds, this task runs during a server start instead of on demand during runtime. The resulting CSS files are served by the `serveResources` middleware. This change improves performance through build-time compilation and caching while maintaining the same functionality.
* `testRunner` — The UI5 QUnit TestRunner resources (`testrunner.html`, `testrunner.css`, `TestRunner.js`) are now provided by the UI5 framework (`sap.ui.core`) and served via the `serveResources` middleware. All supported UI5 releases ship the relevant testrunner resources, so the dedicated middleware is no longer needed.

**Backward Compatibility:**
If your project or any custom middleware references a removed middleware via `beforeMiddleware` or `afterMiddleware`, UI5 CLI keeps a no-op placeholder in the middleware execution order at the original slot. The custom middleware is executed in the same position as before and a deprecation warning is logged.

**What Changed:**
- Theme CSS files (`library.css`, `library-RTL.css`, etc.) are now **pre-built**
- Theme files are served via `serveResources` instead of being compiled on demand
- TestRunner resources are served via `serveResources` from the UI5 framework instead of being shipped with UI5 CLI

**Recommended Action:**
Update your `ui5.yaml` configuration to reference an existing middleware instead.

| Removed Middleware | Replacement Behavior | Recommended `afterMiddleware` |
| ------------------ | -------------------- | ----------------------------- |
| `serveThemes`      | CSS files pre-built by `buildThemes` task and served via `serveResources` | `serveResources` |
| `testRunner`       | TestRunner resources served via `serveResources` from the UI5 framework | `serveResources` |

## Learn More

- [Project: Type `component`](../pages/Project#component)
- [Configuration: Specification Version 5.0](../pages/Configuration#specification-version-5-0)
- [RFC 0018: Component Type](https://github.com/UI5/cli/blob/-/rfcs/0018-component-type.md)
