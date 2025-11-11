# UI5 Project

The [UI5 Project](https://github.com/SAP/ui5-project) module provides functionality to build a UI5 project. Also see [Development Overview: Project Dependencies](./Overview.md#project-dependencies).

<script setup>
import VPButton from "vitepress/dist/client/theme-default/components/VPButton.vue"
</script>

## Types
Types define how a project can be configured and how it is built. A type orchestrates a set of tasks and defines the order in which they get applied during build phase. Furthermore, it takes care of formatting and validating the project-specific configuration.

Also see [UI5 Project: Configuration](./Configuration.md#general-configuration)

### component
*Available since [Specification Version 5.0](./Configuration.md#specification-version-50)*

Projects of type `component` are your typical component-like UI5 applications. These will usually run in container-like root application, such as the Fiori Launchpad (FLP) Sandbox, along with other UI5 applications.

In order to allow multiple component projects to coexist in the same environment, the projects are served under their namespace. For example: `/resources/my/bookstore/admin`. Opposing to `application`-type projects which act as root projects and are therefore served without a namespace, at `/`.

By default, component projects use the same directory structure as library projects. This means there are `src` and `test` directories in the root. The integrated server will use both directories, however when building the project, the `test` directory will be ignored since it should not be deployed to production environments. Both directories may contain a flat-, _or_ a namespace structure. In case of a flat structure, the project namespace will be derived from the `"sap.app".id` property in the `manifest.json`.

A component project must contain both, a `Component.js` and a `manifest.json` file.

Unlike `application`-type projects, component projects usually do not have dedicated `index.html` files in their regular resources (`src/`). They can still be run standalone though. For instance via a dedicated HTML file located in their test-resources, or by declaring a development-dependency to an application-type project which is capable of serving the component (such as the FLP Sandbox).

Component projects supports all [output-styles](./CLI.md#ui5-build) that are currently supported by library projects, allowing a deployment where the namespace may be omitted from the final directory structure (output-style `flat`).

### application
Projects of type `application` are typically the main or root project. In a projects dependency tree, there should only be one project of type `application`. If additional ones are found, those further away from the root are ignored.

The source directory of an application (typically named `webapp`) is mapped to the virtual root path `/`.

An applications source directory may or may not contain a `Component.js` file. If it does, it must also contain a `manifest.json` file. If there is a `Component.js` file, an optimized `Component-preload.js` file will be generated during the build.

### library
UI5 libraries are often referred to as reuse-, custom- or [control libraries](https://github.com/SAP/openui5/blob/-/docs/controllibraries.md). They are a key component in sharing code across multiple projects in UI5.

A project of type `library` must have a source directory (typically named `src`). It may also feature a "test" directory. These directories are mapped to the virtual directories `/resources` for the sources and `/test-resources` for the test resources.

These directories should contain a directory structure representing the namespace of the library (e.g. `src/my/first/library`) to prevent name clashes between the resources of different libraries.

### theme-library
*Available since [Specification Version 1.1](./Configuration.md#specification-version-11)*

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
| **component** | |
| `Default` | Root project is written `Namespace`-style. ^1^ |
| `Flat` | Root project is written `Flat`-style (without its namespace, logging warnings for resources outside of it). ^1^ |
| `Namespace` | Same as `Default`. |
| **library** | |
| `Default` | Root project is written `Namespace`-style. ^1^ |
| `Flat` | Root project is written `Flat`-style (without its namespace, logging warnings for resources outside of it). ^1^ |
| `Namespace` | Same as `Default`. |
| **theme-library** | |
| `Default` | Root project is written in the style of the sources (multiple namespaces). ^1^ |
| `Flat` | **Unsupported** ^2^ |
| `Namespace` | **Unsupported** ^2^ |
| **module** | |
| `Default` | Root project is written with the [configured paths](https://ui5.github.io/cli/v5/pages/Configuration/#available-path-mappings). ^1^ |
| `Flat` | **Unsupported** ^3^  |
| `Namespace` | **Unsupported**  ^3^ |

^1^ The Output Style is only applied to the root project's output folder structure. Any dependencies included in the build would retain their `Default` output style.  
^2^ Theme libraries in most cases have more than one namespace.  
^3^ Modules have explicit path mappings configured and no namespace concept.  


<div style="margin: 1rem 0;">
  <VPButton class="no-decoration" text="📚 API Reference" href="https://ui5.github.io/cli/v5/api/@ui5_project_build_ProjectBuilder.html"/>
</div>

<style>
.no-decoration {
    text-decoration: inherit;
}
</style>
