# Troubleshooting
## UI5 Server
### Chrome Redirects HTTP URLs to HTTPS (`ERR_SSL_PROTOCOL_ERROR`)
An HTTPS server or proxy that was previously running on a domain (e.g. `localhost`), might have set an HSTS header, enforcing Chrome to always use HTTPS for this domain. See https://www.chromium.org/hsts. This makes it impossible to connect to an HTTP-only server running on the same domain.

#### Resolution
You need to delete the HSTS mapping in [chrome://net-internals/#hsts](chrome://net-internals/#hsts) by entering the domain name (e.g. `localhost`) and pressing "delete".

## Issues Not Listed Here
Please follow our [Contribution Guidelines](https://github.com/UI5/cli/blob/main/CONTRIBUTING.md#report-an-issue) on how to report an issue.

## UI5 Project
### `~/.ui5` Taking too Much Disk Space

UI5 CLI stores several kinds of data under your user's home directory in `~/.ui5/`:

| Directory | Contents | Safe to delete? |
| ---- | ---- | ---- |
| `~/.ui5/framework/` | Downloaded UI5 framework dependencies (one copy per version) | Yes — re-downloaded on next invocation |
| `~/.ui5/buildCache/` | Build cache used by `ui5 build` and `ui5 serve` (see [Build Cache Control](./Builder.md#build-cache-control)) | Yes — rebuilt on next `ui5 build` / `ui5 serve` |
| `~/.ui5/server/` | Locally generated SSL certificate and private key for HTTPS mode | Yes — regenerated on next HTTPS server start; the new certificate must be re-trusted |

#### Resolution

Use the dedicated cache clean command, which removes all cached data:

```sh
ui5 cache clean
```

For a detailed preview and grouped cleanup summary, use the `--verbose` flag:

```sh
ui5 cache clean --verbose
```

To skip the confirmation prompt (for example in CI environments), use the `--force` flag.
In non-verbose mode with `--force`, the command runs completely silent:

```sh
ui5 cache clean --force
```

The command removes the following cached data:
- **UI5 Framework packages** — downloaded UI5 library files (`~/.ui5/framework/`)
- **Build cache** — build data (`~/.ui5/buildCache/`)

If a previous `ui5 cache clean` was interrupted (for example, because the process was killed or the system crashed), the command also detects and removes any leftover data from that interrupted operation. This data is listed as separate entries:
- **Stale UI5 Framework packages** — incomplete framework directories left over from a previously interrupted cleanup (`~/.ui5/_framework_to_delete_*/`)
- **Stale build cache** — freed database pages not yet reclaimed during a previously interrupted cleanup

Any required framework dependencies will be re-downloaded during the next UI5 CLI invocation.

::: info
If you have configured a custom data directory via `UI5_DATA_DIR` or `ui5 config set ui5DataDir`, the `ui5 cache clean` command will clean up that location instead of the default `~/.ui5/`. See [Changing UI5 CLI's Data Directory](#changing-ui5-cli-s-data-directory).
:::

::: warning
Only remove these directories, or run `ui5 cache clean`, when no UI5 CLI process and no `@ui5/*` API consumer is actively running. Running `ui5 cache clean` while `ui5 build` or `ui5 serve` is in progress can break the running process and lead to failed or inconsistent results.
:::

## Environment Variables
### Changing the Log Level

In CI environments or in a combination with other tools, the usage of [UI5 CLI's `--log-level`](https://ui5.github.io/cli/v5/pages/CLI/#common-options) command parameter might be inconvenient and even impossible.

#### Resolution

Replace UI5 CLI's `--log-level` option with the `UI5_LOG_LVL` environment variable.

Example:

`UI5_LOG_LVL=silly ui5 build`

On Windows:

`set UI5_LOG_LVL=silly ui5 build`

Cross Environment via [cross-env](https://www.npmjs.com/package/cross-env):

`cross-env UI5_LOG_LVL=silly ui5 build`

UI5 + Karma:

`cross-env UI5_LOG_LVL=verbose npm run karma`


::: warning
The combination of the `UI5_LOG_LVL` environment variable with the `--log-level` CLI parameter might lead to unexpected results; they should be used interchangeably but not together. The CLI parameter takes precedence over the `UI5_LOG_LVL` environment variable.

:::

### Disabling Interactive `ui5 serve` Output

When `ui5 serve` runs in an interactive terminal, it can render a live status banner instead of plain log output.

#### Resolution

Set the `UI5_CLI_NO_INTERACTIVE` environment variable to any value to force plain output.

Unix:
```sh
UI5_CLI_NO_INTERACTIVE=1 ui5 serve
```

Windows:
```sh
set UI5_CLI_NO_INTERACTIVE=1 ui5 serve
```

Cross Environment via [cross-env](https://www.npmjs.com/package/cross-env):

```sh
cross-env UI5_CLI_NO_INTERACTIVE=1 ui5 serve
```

### File Changes Not Picked up in a Container

When `ui5 serve` runs a build internally, it watches the project's files and rebuilds on change. On a bind-mounted volume inside a container, file system events are often only reported for the container's own writes, but not for writes made to the same volume from outside the container. If you edit files on the host and no rebuild or live reload happens inside the container (commonly observed with Podman), the "native" file watcher of the UI5 CLI is not receiving those events.

For this reason, UI5 CLI attempts to detect a container environment and automatically switch to a "polling" file watcher. That detection is a heuristic and can be wrong in some environments.

If you encounter this problem in your container-based development setup, try setting the `UI5_WATCH_MODE` environment variable to `polling` to force the polling watcher, or to `native` to force the native watcher.

::: info
Polling reads the watched files on an interval, so it reports changes regardless of where they originate, at the cost of more CPU than the event-based native watcher. Use it only when the native watcher fails to detect your file changes.
:::

### Changing UI5 CLI's Data Directory

UI5 CLI's data directory is by default at `~/.ui5`. It's the place where the framework artifacts are stored.
In some cases and environments this is not a convenient location and the user needs to provide a better one.

The path to it can either be provided via environment variable or permanently set in the configuration.

::: info
Paths are resolved relative to the current root project path (i.e. where the package.json is located).

:::

#### Environment variable  `UI5_DATA_DIR`

Unix:
```sh
UI5_DATA_DIR=/my/custom/location/.ui5 ui5 build
```

Windows:
```sh
set UI5_DATA_DIR="C:\\my\\custom\\location\\.ui5" ui5 build
```

#### Configuration `ui5DataDir`

Configure a custom directory:
```sh
ui5 config set ui5DataDir /my/custom/location/.ui5
```

Unset the configuration to switch back to the default directory:
```sh
ui5 config set ui5DataDir
```
