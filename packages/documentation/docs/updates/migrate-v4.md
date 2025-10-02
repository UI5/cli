# Migrate to v4

!!! tip "New Release"
    **UI5 CLI 4.0 has been released on July 24, 2024 🎉**

    Install the latest version in your projects via: `npm i --save-dev @ui5/cli@latest`  
    And update your global install via `npm i --global @ui5/cli@latest`

    And find the announcement blog post here: **[SAP Community: UI5 CLI 4.0](https://community.sap.com/t5/technology-blogs-by-sap/ui5-tooling-4-0/ba-p/13769578)**

## UI5 2.x Compatibility

*Also see the blog post [SAP Community: Introducing OpenUI5 2.x](https://community.sap.com/t5/open-source-blogs/introducing-openui5-2-x/ba-p/13580633)*

UI5 CLI 4.0 is required for building UI5 2.x projects. The UI5 2.x framework libraries define Specification Version 4.0 and therefore can't be built using older UI5 CLI versions.

For applications and libraries running with UI5 2.x, the use of Specification Version 4.0 is not enforced. It is highly recommended, however, since only then UI5 CLI will ensure UI5 2.x compatibility of the generated bundles.

## Node.js and npm Version Support

This release requires **Node.js version v20.11.0 and higher or v22.0.0 and higher (v21 is not supported)** as well as npm v8 or higher.
Support for older Node.js releases has been dropped; their use will cause an error.

## Specification Versions Support

As with UI5 CLI 3.x, all projects with Specification Versions 2.0 and higher are supported.

If a legacy specification version is detected, an automatic migration is attempted.
Old projects might therefore still work, unless they have a non-standard configuration in their ui5.yaml.

## Changes for Projects

!!! success "No changes for Specification Versions 2.x and 3.x"
    Projects defining **Specification Version 2.x or 3.x** are expected to be **fully compatible with UI5 CLI v4**

    The following does not apply to them.

For projects defining the latest **Specification Version 4.0 or higher**, the following changes apply:

* **Breaking Change:** Bundling of JavaScript modules requiring "top level scope" as a string is terminated. 
    
    In UI5 2.x, the feature of evaluating modules from a string is expected to be removed. Therefore, when using the latest Specification Version, UI5 CLI will **omit affected module from the bundle and log an error message instead.**

    For more details, see [Builder: JavaScript Files Requiring Top Level Scope](../pages/Builder.md#javascript-files-requiring-top-level-scope).

* **Breaking Change:** New `async` option for the `require` sections of bundle definitions.
    
    This option defaults to `true` for Specification Version 4.0 and higher, **which can influence the loading behavior of your project**. Require sections are now expressed using `sap.ui.require` instead of `sap.ui.requireSync`. The latter is not available in UI5 2.x.

    Note that the same default applies for all standard bundles as well, like the component- or library preloads as well as self-contained bundles.

    See [Configuration: `bundleDefinition.sections`](../pages/Configuration.md#properties) for more on the new `async` option.

* **Breaking Change:** Removal of the `usePredefineCalls` [bundle option](../pages/Configuration.md#properties). UI5 CLI v4 will _always_ use `sap.ui.predefine` calls in bundles, making this option obsolete.
    
    **We do not expect any negative impact** on projects due to this change, therefore it is active independently of the Specification Version. However, when upgrading to Specification Version 4.0 you might need to remove the property if you have it in your ui5.yaml configuration.

You can find a summary of the above at [Configuration: Specification Version 4.0](../pages/Configuration.md#specification-version-40).

## Migrate Your Code

When using the Node.js API of UI5 CLI, or when integrating it into other tools, the following changes might be relevant to you:

### Changes to @ui5/cli

Occurrences of `console.log` in the code base are replaced with `process.stderr`.
Аny scripts that capture the output from `console.log` need to be adjusted to rely on `process.stderr`.

### Changes to @ui5/fs

Non-public `DuplexCollection#byGlobSource` API has been removed.

### Changes to @ui5/builder

- **Bundling**: The `usePredefineCalls` option has been removed. Bundling now enforces the use of `sap.ui.predefine` instead of function wrappers.  

- **Task API**: The `namespace` option has been renamed to `projectNamespace`. For more information, check the documentation for [CustomTasks API](../pages/extensibility/CustomTasks.md#task-implementation)  

- **New Option**: Added a new `async` option for `builder.bundles.bundleDefinition.section`.

!!! example
    ```yaml
    builder:
      bundles:
        - bundleDefinition:
            name: "app.js"
            sections:
              - mode: require
                filters:
                  - some/app/Component.js
                resolve: true
                sort: true
                async: true
    ```

### Changes to @ui5/project

- **Default Workspace Name**: The default `workspaceName` is now `"default"` for API usage.

!!! example
    ```js
    import {graphFromPackageDependencies} from "@ui5/project/graph";
	
	graphFromPackageDependencies({
		/* workspaceName: "default" */
	});
    ```

- **Directory Naming**: The `ui5HomeDir` has been renamed to `ui5DataDir` in APIs.

!!! example
    ```js
    import Resolver from "@ui5/project/ui5Framework/Openui5Resolver";

    await Resolver.resolveVersion("1.120.15", {
        ui5DataDir: "~/.ui5",
        cwd: process.cwd()
    });
    ```

- **Dependencies**: The `@ui5/builder` is now an optional dependency to the `@ui5/project`

Consumers of the Node.js API that make use of the `ProjectGraph#build` method need to declare a dependency to `@ui5/builder` in their respective `package.json`. The package manager should ensure that the version fulfills the range specified in the `package.json` of `@ui5/project`.

## Troubleshooting

### App Stops Working With UI5 1.71

This might be caused by a mismatch of your project's manifest version and your UI5 version.

UI5 CLI v4 enhances the manifest.json with information about the `supportedLocales` (also see [Builder: Generation of Supported Locales](../pages/Builder.md#generation-of-supported-locales)). In UI5 1.71 this configuration is not supported and leads to an ambiguous error message `TypeError: invalid input` and a failure to process the manifest file.

UI5 CLI uses the manifest's `_version` property to decide whether the `supportedLocales` can be generated. For UI5 1.71, only versions up to `1.17.0` are supported. See [UI5 Demo Kit: Descriptor for Applications, Components, and Libraries (manifest.json)](https://sdk.openui5.org/#/topic/be0cf40f61184b358b5faedaec98b2da) for a mapping per manifest version.

To resolve this issue, adjust the manifest version according to the UI5 version you are using.

*This issue was first raised here: [UI5 CLI #988](https://github.com/UI5/cli/issues/988)*
