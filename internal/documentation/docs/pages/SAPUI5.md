# Consuming SAPUI5 Libraries

::: info Info
Make sure you have installed the UI5 CLI in Version 2.0 or later: `npm install --global @ui5/cli`

The minimum version of SAPUI5 that can be consumed by UI5 CLI as described below is **1.76.0.**  
For lower versions, consider using the [CDN bootstrap](https://ui5.sap.com/#/topic/2d3eb2f322ea4a82983c1c62a33ec4ae) or a custom middleware like [ui5-middleware-simpleproxy](https://www.npmjs.com/package/ui5-middleware-simpleproxy).

:::

## Overview

SAPUI5 libraries are hosted on the public npm registry at `registry.npmjs.org`. However, you should not install them using node package managers such as npm. Let UI5 CLI handle them instead by following this guide.

::: info Note
For more background information also see the Blog Post ["UI5ers Buzz #49: The UI5 CLI and SAPUI5 – The Next Step"](https://blogs.sap.com/2020/04/01/ui5ers-buzz-49-the-ui5-tooling-and-sapui5-the-next-step/)

:::

## Usage
Since Version 2.0 of the UI5 CLI, it will automatically download all required framework dependencies of a project that have been listed in the corresponding `ui5.yaml` file. They will be cached in a `.ui5` directory located in the user's home directory. This happens transparently whenever you execute the `ui5 serve` or `ui5 build` commands.

All non-framework dependencies, such as reuse libraries or UI5 CLI extensions, still need to be maintained as npm dependencies in the projects `package.json`. At the same time, framework dependencies listed in the `ui5.yaml` should not be listed in the `package.json` as they will be ignored by the UI5 CLI.

## Configuration

Your project's `ui5.yaml` provides a configuration section dedicated to framework dependency handling.

This configuration can be maintained by editing the file, or by using the UI5 CLI:

::: details Example
Using the [UI5 CLI](./CLI.md):
```sh
ui5 use sapui5@latest
ui5 add sap.ui.core sap.m sap.ui.comp themelib_sap_fiori_3
ui5 add -D sap.ushell
```

:::

**Example ui5.yaml of an application**
```yaml
specVersion: "5.0"
type: application
metadata:
  name: some.project.name
framework:
  name: SAPUI5
  version: 1.82.0
  libraries:
    - name: sap.ui.core
    - name: sap.m
    - name: sap.ui.comp
    - name: sap.ushell
      development: true
    - name: themelib_sap_fiori_3
```

**Example ui5.yaml of a library**
```yaml
specVersion: "5.0"
type: library
metadata:
  name: some.library
framework:
  name: SAPUI5
  version: 1.82.0
  libraries:
    - name: sap.ui.core
    - name: themelib_sap_belize
      optional: true
    - name: themelib_sap_bluecrystal
      optional: true
    - name: themelib_sap_fiori_3
      optional: true
```

Please make sure that your project defines [Specification Version 2.0](./Configuration.md#specification-version-2-0) or higher.

For details please refer to the [framework configuration documentation](././Configuration.md#framework-configuratio).

## Consuming SAPUI5 Snapshots

Within SAP, in-development SAPUI5 versions can be consumed from an internal Maven registry. These snapshot versions are builds of a not-yet-released patch level that SAP does not publish to the npm registry, so UI5 CLI downloads them from the Maven registry instead. OpenUI5 has no snapshots.

A framework version that ends with `-SNAPSHOT` selects the Maven path. Everything else about the project stays the same: framework libraries remain under `framework.libraries` in `ui5.yaml`, and `ui5 serve` or `ui5 build` download the required artifacts on first use.

### Selecting a Snapshot Version

Set the version with [`ui5 use`](./CLI.md#ui5-use), or maintain it directly in `ui5.yaml`. The version accepts a concrete snapshot, a range, or a simplified short form:

```sh
ui5 use latest-snapshot          # Latest available snapshot
ui5 use 1.120-snapshot           # Latest snapshot of the 1.120.x line
ui5 use sapui5@1.120.0-SNAPSHOT  # One concrete snapshot version
```

The short forms `1-SNAPSHOT`, `1.x-SNAPSHOT`, and `1.108-SNAPSHOT` resolve to the latest matching snapshot. The resulting `ui5.yaml` holds the resolved version, for example:

```yaml
framework:
  name: SAPUI5
  version: 1.120.0-SNAPSHOT
  libraries:
    - name: sap.ui.core
    - name: sap.m
```

### Configuring the Maven Repository URL

Before the first snapshot download, UI5 CLI needs the Maven repository URL. It resolves the URL from the first source that provides one, in this order:

1. The `UI5_MAVEN_SNAPSHOT_ENDPOINT_URL` environment variable. This overrides any stored configuration and suits CI or one-off runs.
2. The `mavenSnapshotEndpointUrl` UI5 CLI configuration. Set it with `ui5 config set mavenSnapshotEndpointUrl <url>`, read it with `ui5 config get mavenSnapshotEndpointUrl`, and clear it by omitting the value. See [`ui5 config`](./CLI.md#ui5-config).
3. The `snapshot.build` repository in the Maven `~/.m2/settings.xml` file, when present. Reading `settings.xml` needs an interactive terminal, so UI5 CLI skips this source in non-interactive environments such as CI. When it does resolve a URL this way, it offers to store that URL in its configuration so later runs skip the prompt.

If none of these provide a URL, snapshot resolution fails and the released-version path is unaffected.

### Caching and Cache Modes

Downloaded artifacts are cached in the `.ui5` directory in the user's home directory, next to the npm-based framework packages. Override the location with the `ui5DataDir` configuration or the `UI5_DATA_DIR` environment variable.

Because a snapshot version points at a moving build, UI5 CLI also caches the repository metadata that maps a version to a concrete build. By default this metadata is reused for 9 hours before UI5 CLI checks the repository again. Control this with the `--snapshot-cache` option on `ui5 serve` and `ui5 build`:

- `Default`: Reuse cached metadata, revalidate against the repository after 9 hours.
- `Force`: Use the cache only, send no requests to the repository. Useful offline.
- `Off`: Ignore the cached metadata and always update from the repository.

### Resource Limits

The snapshot resolver limits metadata downloads, artifact downloads, and archive extraction. Set the environment variables below to raise a limit for a large or slow trusted registry. Each value must contain decimal digits and represent a positive safe integer. The resolver reads overrides for each operation. Invalid overrides fail with `ERR_MAVEN_INVALID_LIMIT`.

| Environment Variable | Unit and Scope | Default | Error Code |
| :--- | :--- | :--- | :--- |
| `UI5_MAVEN_MAX_METADATA_BYTES` | Bytes buffered per `maven-metadata.xml` response | `67108864` (64 MiB) | `ERR_MAVEN_METADATA_TOO_LARGE` |
| `UI5_MAVEN_MAX_ARTIFACT_BYTES` | Bytes written per artifact response | `2147483648` (2 GiB) | `ERR_MAVEN_ARTIFACT_TOO_LARGE` |
| `UI5_MAVEN_MAX_ARCHIVE_ENTRIES` | Entries per archive, including directories | `262144` | `ERR_MAVEN_ARCHIVE_TOO_MANY_ENTRIES` |
| `UI5_MAVEN_MAX_ENTRY_BYTES` | Expanded bytes per archive entry | `1073741824` (1 GiB) | `ERR_MAVEN_ENTRY_TOO_LARGE` |
| `UI5_MAVEN_MAX_EXPANDED_BYTES` | Total expanded bytes per archive | `4294967296` (4 GiB) | `ERR_MAVEN_ARCHIVE_TOO_LARGE` |
| `UI5_MAVEN_MAX_COMPRESSION_RATIO` | Expanded bytes divided by archive bytes on disk | `200` | `ERR_MAVEN_COMPRESSION_RATIO_EXCEEDED` |
| `UI5_MAVEN_FETCH_TIMEOUT` | Milliseconds per complete request | `1800000` (30 minutes) | `ERR_MAVEN_FETCH_TIMEOUT` |
| `UI5_MAVEN_MAX_EXTRACTION_TIME` | Milliseconds per archive extraction | `600000` (10 minutes) | `ERR_MAVEN_EXTRACTION_TIMEOUT` |

Download limits count response bytes as they arrive, including HTTP decompression. They apply even when `Content-Length` is missing or describes a smaller encoded body. Archive checks cover declared sizes before extraction and actual bytes during extraction. The declared-size checks include entries outside the `META-INF/` subtree selected for JAR extraction. Byte, entry-count, and compression-ratio limits accept values equal to the configured limit.

`UI5_MAVEN_FETCH_TIMEOUT` bounds elapsed time from request start through body delivery. Redirects and any fetch retries share the same deadline. A server that keeps sending small chunks still reaches this deadline. This Maven setting is independent of npm's `fetch-timeout` configuration and does not change npm downloads.

Failed downloads remove partial artifact files. Failed package installs remove staging output and the downloaded archive, then release the installation lock. A later install can download the artifact again. Limit errors name the metadata URL or artifact coordinates, the setting, and the observed value without including response bodies or file contents.

## Differences Between OpenUI5 and SAPUI5

Please refer to our documentation on the [differences between OpenUI5 and SAPUI5](./FAQ.md#whats-the-difference-between-openui5-and-sapui5)
