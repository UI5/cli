# Migrate to v1

v1.0.0 is the first stable release of the UI5 CLI. There are only a few notable changes to the 0.x alpha version.

## Breaking changes

**ui5-builder: Add transformation of apps index.html in self-contained build ([SAP/ui5-builder#137](https://github.com/SAP/ui5-builder/pull/137))**

When running a self-contained build on an application project, the
index.html will be transformed by adopting the UI5 bootstrap script tag
to load the custom bundle file instead.

**ui5-project: normalizer: Rename optional parameter "translator" ([SAP/ui5-project#96](https://github.com/SAP/ui5-project/pull/96))**

Renamed parameter "translator" of functions generateDependencyTree and generateProjectTree to "translatorName"

**ui5-fs: Remove top-level access to adapters ([SAP/ui5-fs#69](https://github.com/SAP/ui5-fs/pull/69))**

Adapters "AbstractAdapter", "FileSystem" and "Memory" used to be accessible via the top-level export of index.js  
Example:
```js
require("@ui5/project").FileSystem
```

This is no longer possible. Adapters are now grouped in the top-level object "adapters" and can be accessed from there  
Example:
```js
require("@ui5/project").adapters.FileSystem
```

## How to upgrade

### Global installation

To upgrade your global installation, just run the installation command again, which will upgrade to the latest version.

```
npm install --global @ui5/cli
```

**Note:** Your local CLI installation will still be preferred, so you need to make sure to upgrade it as well (see [Local vs. Global installation](https://github.com/SAP/ui5-cli#local-vs-global-installation)).

### Local installation

To upgrade the CLI installation within a project you need to run the following command.

```
npm install @ui5/cli@^1
```

### ui5.yaml

#### `specVersion: "1.0"`

We have introduced the [specification version `1.0`](../pages/Configuration.md#specification-version-10).
New features will only be available for projects with specVersion `1.0` or newer.  
The specVersion `0.1` will be compatible with the UI5 CLI v1.0.0, but we still recommend to adopt your projects.

```yaml
specVersion: "1.0"
metadata:
  name: <project-name>
type: <project-type>
```
