# UI5 Workspaces

!!! info
    **UI5 Workspaces is a new feature available since UI5 CLI [`v3.0.0`](https://github.com/SAP/ui5-cli/releases/tag/v3.0.0)** 

!!! example
    ```yaml title="ui5-workspace.yaml"
    specVersion: workspace/1.0
    metadata:
        name: default
    dependencyManagement:
   	    resolutions:
       	    - path: ../heavy.library
    ```

## General Concept

UI5 Workspaces can be used to create a personalized local development environment for a UI5 project. They allow to use UI5 dependencies from local directories without the need to use the link features of package managers like npm. "UI5 dependencies" generally refers to projects that have a `ui5.yaml`.

Workspaces are typically configured in a `ui5-workspace.yaml` file, located next to the project's `ui5.yaml`. The file can contain one or many workspace configurations, each separated by [three dashes](https://yaml.org/spec/1.2.2/#22-structures). For example:

!!! example
    ```yaml title="ui5-workspace.yaml"
    specVersion: workspace/1.0
    metadata:
        name: default
    dependencyManagement:
   	    resolutions:
       	    - path: ../heavy.library
    ---
    specVersion: workspace/1.0
    metadata:
        name: extended
    dependencyManagement:
   	    resolutions:
       	    - path: ../heavy.library
       	    - path: ../light.library
       	    - path: ../test.library
    ```

If a workspace configuration named `default` exists, it will be used automatically; otherwise the workspace must be specified using the UI5 CLI parameter `--workspace`.

Workspaces can only be used in the project that is currently being worked on, i.e. the current root project. Workspace configurations of dependencies are ignored. The workspace file, however, does not necessarily have to be located within the project. You can reference any workspace configuration file via the UI5 CLI parameter `--workspace-config`.

This concept has been discussed in an RFC: [RFC 0006 Local Dependency Resolution](https://github.com/UI5/cli/blob/main/rfcs/0006-local-dependency-resolution.md)

## Configuration
A UI5 Workspace configuration must define a specification version (`specVersion`) compatible with its configuration. For more information, see [Workspace Specification Versions](#workspace-specification-versions).

```yaml
specVersion: "workspace/1.0"
```

### Metadata

!!! example
    ```yaml
    specVersion: workspace/1.0
    metadata:
        name: dolphin
    ```

#### name

A workspace must have a `name`. This allows to easily switch between individual workspace configurations.

If a workspace is named `default`, **it will be used automatically**, unless a different workspace is selected using the `--workspace` CLI parameter.

The `name` property must satisfy the following conditions. They are identical to [project names](./Configuration.md#name):

* Must be at least 3 characters long
* Must be no longer than 80 characters
* Must contain lowercase characters only
* Must contain alphanumeric characters, dash, underscore and period only
    - Exception: The `@` and `/` characters are allowed at certain positions as
      explained below
* Must start with an alphabetic character or an `@` character
* If it starts with an `@` character, it must contain exactly one
  forward slash `/`
    - This is aligned with the npm concept for package scopes, for example `@org/lib.name`

## Dependency Management

UI5 Workspace configurations allow to influence the dependency resolution when working with a UI5 project.

!!! example
    ```yaml
    specVersion: workspace/1.0
    metadata:
        name: dolphin
    dependencyManagement:
   		resolutions:
       		- path: ../light.library
       		- path: ../heavy.library
       		- path: ../test.library
    ```

### Resolutions

```yaml
dependencyManagement:
   	resolutions:
       	- path: ../test.library
```

Resolution paths will be used by UI5 CLI to look for project dependencies. Any dependencies found via these paths will be used over the ones found with the regular dependency resolution mechanism. This includes UI5 CLI extensions.

Paths must point to a directory containing a `package.json`. UI5 CLI will attempt to find a UI5 project here. However, if the `package.json` contains a [`workspaces`](https://docs.npmjs.com/cli/v8/using-npm/workspaces), or equivalently, `ui5.workspaces` configuration (which overrules the first), UI5 CLI will resolve the workspace first and attempt to find UI5 projects in the configured "npm workspaces". This is commonly used in mono-repos. An example can be found in the [OpenUI5 repository](https://github.com/SAP/openui5/blob/b4267488e5d3546de4cd9577ccac4208482d71e0/package.json#L130-L132).

Paths must be written in POSIX (i.e. using only forward slashes `/` as path segment separators) and must be **relative to the workspace configuration file**. Absolute paths, or paths relative to the home directory (`~`), are not allowed. This is to ensure that workspace configuration files are easy to share and to reduce the chance of them exposing sensitive information like user names or large directory hierarchies. Symbolic links are followed.

Note that this configuration only affects the resolution of dependencies which have already been found during the regular dependency resolution process of a project. For example, if a workspace resolution path resolves to a project that would otherwise not be part of the dependency tree of the current root project, it will not be added to the dependency tree. Also, transitive dependencies of resolved projects are not being followed.

## Workspace Specification Versions
A workspace configuration must define a Specification Version by setting the `specVersion` property. UI5 CLI uses this information to detect whether the currently installed version is compatible with a workspace's configuration.

```yaml
specVersion: "workspace/1.0"
[...]
```

To use new features, a workspace configuration might need to update the `specVersion` property. 

For a given Specification Version "workspace/**MAJOR.MINOR**"" we will increment:

1. **MAJOR** when there are breaking changes that might require additional actions by the project's maintainer
2. **MINOR** when adding new features that are fully backward-compatible

All changes are documented below.

### Compatibility Matrix

Unless otherwise noted in the table below, UI5 CLI modules are backward-compatible.

Version | UI5 CLI Release
--- | ---
**`workspace/1.0`** | v3.0.0+

### Specification Version `workspace/1.0`

Initial version.

Specification Version `workspace/1.0` configurations are compatible with [UI5 CLI](https://github.com/SAP/ui5-cli) v3.0.0 and above.
