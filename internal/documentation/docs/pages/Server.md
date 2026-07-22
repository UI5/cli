# UI5 Server

The [UI5 Server](https://github.com/SAP/ui5-server) module provides server capabilities for local development of UI5 projects.

<script setup>
import VPButton from "vitepress/dist/client/theme-default/components/VPButton.vue"
</script>

::: tip
Browse the API reference for each Server API by navigating in the sidebar menu to **📚 API -> @ui5/server**.
:::

::: warning Development Use Only
The UI5 Server is intended for **local development purposes only**. It must not be exposed to untrusted parties or used as a public-facing web server.

The server does **not** implement safeguards against various network-based attacks — this is by design, as it is not meant to serve production traffic.

Please be aware of the following risks when using the server:

- **Custom middleware** from third parties can execute arbitrary code on your system and may introduce additional security vulnerabilities when the server is exposed to a network.
- **Proxy middleware** configured with credentials may enable unauthorized access to the target system for other parties on the same network.
- Using `--accept-remote-connections` makes the server reachable from all hosts on your network, which significantly increases the attack surface.

:::

## Live Status Banner

When started in an interactive terminal, `ui5 serve` renders a live status banner that shows the server URLs, the root project's name/type/version, the configured UI5 framework, and a single-line status indicator that cycles between three states as you work:

- **● ready** — the server is idle; no source changes are pending and no build is in flight.
- **○ stale · files changed, rebuild on next request** — one or more watched source files changed; the next request will trigger a rebuild.
- **◐ building — *N*/*M* projects · *current project* · *current task*** — a build cycle is running. The counter, project name, and task name update in place.

The status line stays pinned at the bottom of the terminal; warnings and errors scroll above it and remain in your terminal scrollback. While the banner is active, `info`-level log messages are suppressed — the status line already shows what they would report. The header repaints in place as more information becomes known (project graph resolved, server bound), so early frames may show dim placeholders for sections that have not been populated yet.

The banner is automatically disabled and `ui5 serve` falls back to plain log output when:

- `stderr` is not a TTY (e.g. output is piped to a file or another process).
- The log level is set to `--silent`, `--perf`, `--verbose`, or `--silly` — these levels emit per-task chatter that the status line cannot represent.

In every other case (the default `info` level, `--loglevel warn`, and `--loglevel error`), the banner is active.

### Plain Output (Non-TTY)

When the banner is disabled, `ui5 serve` prints the following to `stdout` once the server is ready:

```text
Server started
URL: <url>
```

The remote-connections warning (when `--accept-remote-connections` is used) is written to `stderr`. Tools and scripts that capture the URL by parsing `ui5 serve` output should run the command in a non-TTY context (pipe, redirect, or CI environment), or pass `--verbose` to force plain output in an interactive terminal.

## Standard Middleware

::: info Removed Middleware
The `serveThemes` middleware has been removed in UI5 CLI v5. Theme compilation is now handled by the `buildThemes` build task, which pre-compiles all theme CSS files. The resulting CSS files (including `library.css`, `library-RTL.css`, `library-parameters.json`, and CSS Variables resources) are served via the `serveResources` middleware, providing the same functionality with better performance through build-time compilation and caching.

The `testRunner` middleware has also been removed in UI5 CLI v5. The QUnit TestRunner (`testrunner.html`, `testrunner.css`, `TestRunner.js`) is now provided by the UI5 framework (`sap.ui.core`) and is served via the `serveResources` middleware.

Custom middleware previously referencing `serveThemes` or `testRunner` via `beforeMiddleware` or `afterMiddleware` will continue to work with automatic remapping and a deprecation warning. See the [v5 migration guide](../updates/migrate-v5.md) for details.
:::

All available standard middleware are listed below in the order of their execution.

A project can also add custom middleware to the server by using the [Custom Server Middleware Extensibility](./extensibility/CustomServerMiddleware.md).

| Middleware | Description |
| ---- | ---- |
| `csp` | See chapter [csp](#csp) |
| `compression` | Standard [Express compression middleware](http://expressjs.com/en/resources/middleware/compression.html) |
| `cors` | Standard [Express cors middleware](http://expressjs.com/en/resources/middleware/cors.html) |
| `liveReloadClient` | See chapter [liveReload](#livereload) |
| `discovery` |  See chapter [discovery](#discovery) |
| `serveResources` | See chapter [serveResources](#serveresources) |
| `versionInfo` | See chapter [versionInfo](#versioninfo)  |
| `nonReadRequests` | See chapter [nonReadRequests](#nonreadrequests)  |
| `serveIndex` | See chapter [serveIndex](#serveindex)  |

### csp
The Content Security Policy ([CSP](https://www.w3.org/TR/CSP/)) middleware is active by default.

The header `content-security-policy` can be set by adding URL parameter `sap-ui-xx-csp-policy` to the request with the policy name as value.

To set the policy to report-only, append `:report-only` or `:ro` to the policy name.
E.g. `/index.html?sap-ui-xx-csp-policy=sap-target-level-1:report-only`

#### sendSAPTargetCSP parameter
The default CSP policies can be modified using parameter `sendSAPTargetCSP` (`--sap-csp-policies` when using the CLI).
With `sendSAPTargetCSP` set to `true` the policies `sap-target-level-1` and `sap-target-level-3` policies are activated and send as report-only.

#### Serve CSP Reports
Serving of CSP reports can be activated with parameter `serveCSPReports` (`--serve-csp-reports` when using the CLI).
With `serveCSPReports` set to `true`, the CSP reports are collected and can be downloaded from the server path `/.ui5/csp/csp-reports.json`.

### discovery

This middleware lists project files with URLs under several `/discovery` endpoints. This is exclusively used by the OpenUI5 test suite application.

### liveReload

Live reload automatically refreshes the browser whenever you change a source file in your project — no manual reload needed. This shortens the edit/test cycle during development.

#### Usage

Live reload is **enabled by default** with `ui5 serve`. Open your app in the browser, edit a source file, save — the page reloads.

To control it:

- **CLI flag**: `ui5 serve --live-reload` / `--no-live-reload`
- **Project configuration** (specVersion 5.0+): `server.settings.liveReload` in `ui5.yaml`. See [Configuration](./Configuration.md).

When the dev server is restarted, the browser automatically reconnects and reloads once the server is back. Saving multiple files at once triggers a single reload, not one per file.

#### Technical Details

The following describes how the middleware works internally. This is relevant for advanced users and custom middleware developers — not required for regular usage.

When live reload is active, the UI5 server opens a WebSocket connection that notifies the browser of source changes and triggers a page reload.

Reloads are driven by the `BuildServer`, which emits a debounced `sourcesChanged` event whenever watched source files change. A burst of changes therefore results in a single reload notification.

The `liveReloadClient` middleware serves the client script at `/.ui5/liveReload/client.js`. The script tag is automatically injected into HTML responses by the `serveResources` middleware.

To prevent intermediate proxies from idle-closing the WebSocket, the client sends a keepalive message every 30 seconds while the connection is open. The server echoes the same message back.

When the WebSocket connection is lost (e.g. because the server was restarted), the client polls the WebSocket endpoint every second and reloads the page once the server accepts connections again. While the browser tab is hidden, polling pauses until it becomes visible again.

### serveResources
This middleware resolves requests using the [ui5-fs](https://github.com/SAP/ui5-fs)-file system abstraction.

The following file content transformations are executed:

- Escaping non-ASCII characters in `.properties` translation files based on a project's [configuration](./Configuration.md#encoding-of-properties-files)
- Enhancing the `manifest.json` with supported locales determined by available `.properties` [translation files](./Builder.md#generation-of-supported-locales)

### versionInfo
Generates and serves the version info file `/resources/sap-ui-version.json`, which is required for several framework functionalities.

### nonReadRequests
Answers all non-read requests (POST, PUT, DELETE, etc.) that have not been answered by any other middleware with the 404 "Not Found" status code . This signals the client that these operations are not supported by the server.

### serveIndex
In case a directory has been requested, this middleware renders an HTML with a list of the directory's content.

## Standard Tasks
As with the UI5 Builder, a set of standard tasks is being executed during a server build. Individual tasks can be included or excluded using the respective CLI options `--include-task` and `--exclude-task`.

::: info
See [Builder Standard Tasks](./Builder.md#standard-tasks) for more explanation about each task.
:::

## Build Cache Control

The UI5 Server performs a build of the projects by utilizing **build caches**.

You can control the build cache behavior using the `--cache` option:

- `--cache Default` (default): Use the cache if available, create it if missing
- `--cache Force`: Only use the cache; fail if the cache is unavailable or invalid
- `--cache ReadOnly`: Use existing cache but don't update it (useful for CI/CD)
- `--cache Off`: Disable caching entirely and always perform a full rebuild

Example:
```sh
ui5 serve --cache Off
```
In this scenario, when a source file changes and a request comes in, the server always performs a full rebuild, even if this source version existed previously.

::: info
By default, build caches created by `ui5 build` and `ui5 serve` are **separate and cannot be mixed**. Each command executes a distinct set of tasks, resulting in separate caches tailored to its specific use case. For more details on builder caching, see the [UI5 Builder documentation](./Builder.md).
:::

### Watch Mode Behavior

Once started with `ui5 serve`, the server automatically monitors changes to the source files throughout the session. When a request arrives, it checks for cached results first and only triggers a rebuild of the respective resources and tasks if no cache is available.

- **Monitored files**: All files in your project's source directories (`src/`, `webapp/`, `test/`, etc.)
- **Not monitored**: Configuration files (`ui5.yaml`, `package.json`), custom task implementations, and dependency files

::: info
Changes to configuration files or custom tasks require a server restart to take effect.
:::

## SSL Certificates
When starting the UI5 Server in HTTPS- or HTTP/2 mode, for example by using UI5 CLI parameter `--h2`, you will be prompted for the automatic generation of a local SSL certificate if necessary.

Follow the given instructions and enter your password to install the generated certificate as trusted. You can find the generated certificate and corresponding private key under `.ui5/server` in your user's home directory.

::: tip
If Chrome unintentionally redirects an HTTP-URL to HTTPS, you need to delete the HSTS mapping in [chrome://net-internals/#hsts](chrome://net-internals/#hsts) by entering the domain name (e.g. localhost) and pressing "delete".

:::

<style>
.no-decoration {
    text-decoration: inherit;
}
</style>
