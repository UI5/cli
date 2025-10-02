# Consuming OpenUI5 Libraries

OpenUI5 consumption with UI5 CLI is very similar to SAPUI5 consumption. Please refer to the documentation on [Consuming SAPUI5 Libraries](./SAPUI5.md) for a general description of how UI5 CLI can fetch and provide framework dependencies to your project.

Note that projects using the SAPUI5 framework can depend on projects using the OpenUI5 framework. However, OpenUI5 projects can't depend on SAPUI5 projects.

Please also refer to our documentation on the [differences between OpenUI5 and SAPUI5](./FAQ.md#whats-the-difference-between-openui5-and-sapui5).

!!! info
    The minimum OpenUI5 version that can be consumed by UI5 CLI is **1.52.5**

## Configuration
Your project's `ui5.yaml` provides a configuration section dedicated to framework dependency handling.

This configuration can be maintained by editing the file, or by using the UI5 CLI:

!!! example
      Using the [UI5 CLI](./CLI.md):
      ```sh
      ui5 use openui5@latest
      ui5 add sap.ui.core sap.m sap.ui.table themelib_sap_fiori_3
      ```

**Example ui5.yaml of an application**
```yaml
specVersion: "4.0"
type: application
metadata:
  name: some.project.name
framework:
  name: OpenUI5
  version: 1.76.0
  libraries:
    - name: sap.ui.core
    - name: sap.m
    - name: sap.ui.table
    - name: themelib_sap_fiori_3
```

**Example ui5.yaml of a library**
```yaml
specVersion: "4.0"
type: library
metadata:
  name: some.library
framework:
  name: OpenUI5
  version: 1.76.0
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

For details, please see the corresponding [framework configuration documentation](./Configuration.md#framework-configuration).

## Linking Framework Dependencies
When working on UI5 applications or libraries that use OpenUI5, you can link a local OpenUI5 repository into that project. This allows you to make changes to the project itself as well as to the OpenUI5 libraries simultaneously and test them immediately.

A detailed step-by-step guide on how to achieve such a setup with the OpenUI5 Sample App can be found [here](https://github.com/SAP/openui5-sample-app#working-with-local-dependencies).

## OpenUI5 Framework Development
Please refer to the [OpenUI5 Framework Development Documentation](https://github.com/SAP/openui5/blob/-/docs/developing.md#developing-ui5).
