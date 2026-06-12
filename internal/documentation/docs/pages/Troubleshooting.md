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

There are possibly many versions of UI5 framework dependencies installed on your system, taking a large amount of disk space.

#### Resolution

Use the dedicated cache clean command, which safely removes all cached data:

```sh
ui5 cache clean
```

This will display the cache location, the amount of data that will be removed, and ask for confirmation before proceeding. To skip the confirmation prompt (e.g. in CI environments), use the `--yes` flag:

```sh
ui5 cache clean --yes
```

The command removes two types of cached data:
- **UI5 Framework packages** — downloaded UI5 library files (`~/.ui5/framework/`)
- **Build cache (DB)** — build data (`~/.ui5/buildCache/`)

Any missing framework dependencies will be downloaded again during the next UI5 CLI invocation.

::: info
If you have configured a custom data directory via `UI5_DATA_DIR` or `ui5DataDir`, the cache will be cleaned from that location instead of `~/.ui5`. See [Changing UI5 CLI's Data Directory](#changing-ui5-clis-data-directory) below.
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
