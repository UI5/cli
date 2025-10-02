# UI5 Project

The [UI5 Project](https://github.com/SAP/ui5-project) module provides functionality to build a UI5 project. Also see [Development Overview: Project Dependencies](./Overview.md#project-dependencies).

## Types
Types define how a project can be configured and how it is built. A type orchestrates a set of tasks and defines the order in which they get applied during build phase. Furthermore, it takes care of formatting and validating the project-specific configuration.

Also see [UI5 Project: Configuration](./Configuration.md#general-configuration)

### application
Projects of type `application` are typically the main or root project. In a projects dependency tree, there should only be one project of type `application`. If multiple are found, those further away from the root are ignored.

The source directory of an application (typically named `webapp`) is mapped to the virtual root path `/`.

An applications source directory may or may not contain a `Component.js` file. If it does, it must also contain a `manifest.json` file. If there is a `Component.js` file, an optimized `Component-preload.js` file will be generated during the build.

### library
UI5 libraries are often referred to as reuse-, custom- or [control libraries](https://github.com/SAP/openui5/blob/-/docs/controllibraries.md). They are a key component in sharing code across multiple projects in UI5.

A project of type `library` must have a source directory (typically named `src`). It may also feature a "test" directory. These directories are mapped to the virtual directories `/resources` for the sources and `/test-resources` for the test resources.

These directories should contain a directory structure representing the namespace of the library (e.g. `src/my/first/library`) to prevent name clashes between the resources of different libraries.

### theme-library
*Available since [Specification Version](./Configuration.md#specification-versions) 1.1*

UI5 theme libraries provide theming resources for the controls of one or multiple libraries.

A project of type `theme-library` must have a source directory (typically named `src`). It may also feature a "test" directory. These directories are mapped to the virtual directories `/resources` for the sources and `/test-resources` for the test resources.

The source directory must contain a directory structure representing the namespaces of the libraries it provides theme resources for. For example, a theme library named `my_custom_theme`, providing resources for a library named `my.library` should have these resources in a directory path `my/library/themes/my_custom_theme/`.

### module
The `module` type is meant for usage with non-UI5 resources like third-party libraries. Their path mapping can be configured freely. During a build, their resources are copied without modifications.


## Build Output Style

The _Output Style_ offers you control over your project's build output folder. Namespaces like `sap.m` or `sap.ui.core` can be streamlined, producing a more concise and flat output. For example, a resource like `/resources/sap/m/RangeSlider.js` will be transformed into `./RangeSlider.js`. And vice versa, applications that are built by default with `Flat` output, can leverage any namespaces they might have. 

In the table below you can find the available combinations of project type & output style.

| Project Type / Requested Output Style | Resulting Style |
|---|---|
| **application** | |
| `Default` | Root project is written `Flat`-style. ^1^ |
| `Flat` | Same as `Default`. |
| `Namespace` | Root project is written `Namespace`-style (resources are prefixed with the project's namespace). ^1^ |
| **library** | |
| `Default` | Root project is written `Namespace`-style. ^1^ |
| `Flat` | Root project is written `Flat`-style (without its namespace, logging warnings for resources outside of it). ^1^ |
| `Namespace` | Same as `Default`. |
| **theme-library** | |
| `Default` | Root project is written in the style of the sources (multiple namespaces). ^1^ |
| `Flat` | **Unsupported** ^2^ |
| `Namespace` | **Unsupported** ^2^ |
| **module** | |
| `Default` | Root project is written with the [configured paths](https://ui5.github.io/cli/stable/pages/Configuration/#available-path-mappings). ^1^ |
| `Flat` | **Unsupported** ^3^  |
| `Namespace` | **Unsupported**  ^3^ |

^1^ The Output Style is only applied to the root project's output folder structure. Any dependencies included in the build would retain their `Default` output style.  
^2^ Theme libraries in most cases have more than one namespace.  
^3^ Modules have explicit path mappings configured and no namespace concept.  


[**API Reference**](https://ui5.github.io/cli/v4/api/@ui5_project_build_ProjectBuilder.html){: .md-button .sap-icon-initiative }
