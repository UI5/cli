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

> **Note:** The term `component` as used in the UI5 CLI project type differs from the `type` property in the `manifest.json` file at runtime. In most cases, a CLI project of type `component` is still a runtime "application". For details on the `type` property in `manifest.json`, refer to the [manifest documentation](https://ui5.sap.com/#/topic/be0cf40f61184b358b5faedaec98b2da.html#loiobe0cf40f61184b358b5faedaec98b2da/section_sap_app).

Projects of the `component` type are typical component-like UI5 applications. They usually run in a container-like root application, such as the SAP Fiori launchpad (FLP) sandbox, alongside other UI5 applications.

To allow multiple component projects to coexist in the same environment, each project is served under its own namespace, for example `/resources/my/bookstore/admin`. In contrast, `application`-type projects act as root projects and are served at `/`, without a namespace.

By default, component projects use the same directory structure as library projects: they include `src` and `test` directories in the root. The integrated server uses both directories. However, when you build the project, the `test` directory is ignored because it shouldn't be deployed to production environments. Both directories can have either a flat or a namespace structure. If you use a flat structure, the project namespace derives from the `"sap.app".id` property in the `manifest.json`.

A component project must contain both, a `Component.js` and a `manifest.json` file.

Unlike `application`-type projects, component projects typically don't have dedicated `index.html` files in their regular resources (`src/`). However, you can still run them standalone. You can do this by using a dedicated HTML file located in their test resources or by declaring a development dependency to an application-type project that can serve the component, such as the FLP sandbox.

Component projects support all [output styles](./CLI.md#ui5-build) that library projects currently support. This allows a deployment where you can omit the namespace from the final directory structure using the output style: `flat`.

### application
Projects of the type `application` typically serve as the main or root project. In a project's dependency tree, there should be only one project of this type. If the system detects additional application projects, it ignores those that are further away from the root.

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
