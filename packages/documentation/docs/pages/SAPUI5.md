# Consuming SAPUI5 Libraries

!!! info
    Make sure you have installed the UI5 CLI in Version 2.0 or later: `npm install --global @ui5/cli`

    The minimum version of SAPUI5 that can be consumed by UI5 CLI as described below is **1.76.0.**  
    For lower versions, consider using the [CDN bootstrap](https://ui5.sap.com/#/topic/2d3eb2f322ea4a82983c1c62a33ec4ae) or a custom middleware like [ui5-middleware-simpleproxy](https://www.npmjs.com/package/ui5-middleware-simpleproxy).

## Overview

SAPUI5 libraries are hosted on the public npm registry at `registry.npmjs.org`. However, you should not install them using node package managers such as npm. Let UI5 CLI handle them instead by following this guide.

!!! note
    For more background information also see the Blog Post ["UI5ers Buzz #49: The UI5 CLI and SAPUI5 – The Next Step"](https://blogs.sap.com/2020/04/01/ui5ers-buzz-49-the-ui5-tooling-and-sapui5-the-next-step/)

## Usage
Since Version 2.0 of the UI5 CLI, it will automatically download all required framework dependencies of a project that have been listed in the corresponding `ui5.yaml` file. They will be cached in a `.ui5` directory located in the user's home directory. This happens transparently whenever you execute the `ui5 serve` or `ui5 build` commands.

All non-framework dependencies, such as reuse libraries or UI5 CLI extensions, still need to be maintained as npm dependencies in the projects `package.json`. At the same time, framework dependencies listed in the `ui5.yaml` should not be listed in the `package.json` as they will be ignored by the UI5 CLI.

## Configuration

Your project's `ui5.yaml` provides a configuration section dedicated to framework dependency handling.

This configuration can be maintained by editing the file, or by using the UI5 CLI:

!!! example
      Using the [UI5 CLI](./CLI.md):
      ```sh
      ui5 use sapui5@latest
      ui5 add sap.ui.core sap.m sap.ui.comp themelib_sap_fiori_3
      ui5 add -D sap.ushell
      ```

**Example ui5.yaml of an application**
```yaml
specVersion: "4.0"
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
specVersion: "4.0"
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

Please make sure that your project defines [Specification Version 2.0](./Configuration.md#specification-version-20) or higher.

For details please refer to the [framework configuration documentation](././Configuration.md#framework-configuratio).

## Differences Between OpenUI5 and SAPUI5

Please refer to our documentation on the [differences between OpenUI5 and SAPUI5](./FAQ.md##whats-the-difference-between-openui5-and-sapui5)
