# Configuration
This document describes the configuration of UI5 Tooling based projects and extensions.  

The content represents the **[Specification Version](#specification-versions) `1.0`**.

## Contents
- [Project Configuration](#project-configuration)
- [Extension Configuration](#extension-configuration)
    + [Tasks](#tasks)
    + [Project Shims](#project-shims)
- [Specification Versions](#specification-versions)

## Project Configuration
Typically located in a `ui5.yaml` file per project.

The preferred way of storing the configuration of a UI5 Tooling based project is a [YAML](https://yaml.org/) file named `ui5.yaml` inside that project.

**Example**
````yaml
---
specVersion: "1.0"
type: application
metadata:
  name: my-application
````

Configuration can also be supplied by other means. In cases where JSON is used, you can still rely on the structure described below.

### Structure

````yaml
---
specVersion: "1.0"
type: application|library|module
metadata:
  name: some.project.name
  copyright: |-
   <project name>
    * (c) Copyright 2009-${currentYear} <my company> <my license>
resources:
  configuration:
    paths:
      "<virtual path 1>": "<physical path 1>"
      "<virtual path 2>": "<physical path 2>"
builder:
  customTasks:
    - name: custom-task-name-1
      beforeTask: standard-task-name
      configuration:
        configuration-key: value
    - name: custom-task-name-2
      afterTask: custom-task-name-1
      configuration:
        color: blue
  jsdoc:
    excludes:
      - some/project/name/thirdparty/**
server:
  settings:
    port: 8099
````

### Properties
#### \<root\>
- `specVersion`: Version of the specification this configuration is based on. See [Specification Versions](#specification-versions)
- `type`: Either `application`, `library` or `module`. Defines the default path mappings and build steps. See [UI5 Builder: Types](https://github.com/SAP/ui5-builder#types) for details

#### metadata
Some general information:
- `name`: Name of the project
- `copyright` (optional): String to be used for replacement of copyright placeholders in the project

#### resources (optional)
- `configuration`
    - `paths`: Mapping between virtual paths and physical paths. Physical paths are always relative to the projects root directory
        + `webapp: webapp`: This path will be mapped to the virtual path `/`.  
          *(Only available for projects of type `application`)*
        + `src: src`: This path will be mapped to the virtual path `/resources`.  
          *(Only available for projects of type `library`)*
        + `test: test`: This path will be mapped to the virtual path `/test-resources`.  
          *(Only available for projects of type `library`)*
        + `<virtual path>: <physical path>` (default `/: ./`): Any virtual path mapping can be defined here.  
          *(Only available for projects of type `module`)*  
          It is recommended that modules include their namespace in the virtual path and use the `/resources` prefix (e.g. `/resources/my/first/library/module-xy`).

#### builder (optional)
- `customTasks` (optional, list): In this block, you define additional custom build tasks, see [here](./BuildExtensibility.md) for a detailed explanation and examples of the build extensibility. Each entry in the `customTasks` list consists of the following options:
    - `name` (mandatory): The name of the custom task
    - `afterTask` or `beforeTask` (only one, mandatory): The name of the build task after or before which your custom task will be executed.
    - `configuration` (optional): Additional configuration that is passed to the custom build task
- `jsdoc`
    - `excludes`: List of glob patterns. Matching resources will be ignored from the JSDoc build

#### server (optional)
- `settings` (not yet implemented)
    - `port`: Project default server port; can be overwritten via CLI parameters

## Extension Configuration
Extensions configuration can be added to any projects `ui5.yaml`. It should to be located *after* the projects configuration, separated by [three dashes](https://yaml.org/spec/1.2/spec.html#id2760395).

In cases where an extension shall be reused across multiple projects you can make it a module itself and have its configuration in a standalone `ui5.yaml` located inside that module.

Extensions can be identified by the `kind: extension` configuration. If no `kind` configuration is given, [`project`](#project-configuration) is assumed.

### Tasks
See [Build Extensibility](./BuildExtensibility.md).

### Project Shims
A project shim extension can be used to define or extend a project configuration of a module. The most popular use case is probably to add UI5 project configuration to a third party module that otherwise could not be used with the UI5 Tooling.

Also see [RFC 0002 Project Shims](https://github.com/SAP/ui5-tooling/blob/master/rfcs/0002-project-shims.md).

#### Structure
```yaml
specVersion: "1.0"
kind: extension
type: project-shim
metadata:
  name: <name of project shim extension>
shims:
  configurations:
    <module name (id)>:
      specVersion: "1.0",
      type: <project type>
      metadata:
        name: <project name>
    <module name (id)>:
      specVersion: "1.0",
      type: <project type>
      metadata:
        name: <project name>
  dependencies:
    <module name (id)>:
      - <module name (id)>
      - <module name (id)>
      - <module name (id)>
  collections:
    <module name>:
      modules:
        <id>: <relative path>
        <id>: <relative path>
        <id>: <relative path>
```

"module name" refers to the name of the module as identified by the used translator. E.g. when using the npm translator, the name declared in the modules `package.json` is used here. In most cases, the module name also becomes the internal ID of the project.

#### Properties
##### configurations (optional)
Used to add configuration to any module.

Map of module names. The values represent the configuration that should be applied to the module.

**Note:** Configuration is applied to the module using [`Object.assign()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign). This means that existing configuration properties will be overwritten.

##### dependencies (optional)
Used to add dependencies to any module.

Map of module names. The value is an array of module names that this module depends on. Note that the other modules need to be part of the dependency tree of the root project (not as direct children, just somewhere).

##### collections (optional)
Used when a dependency contains multiple modules. Also referred to as a [Monorepo](https://en.wikipedia.org/wiki/Monorepo).

Map of module names. The values are objects with collection-specific configuration:
- `modules`: Map of project IDs and their relative file system paths inside the collection module. The project ID does not have to match the actual module name (as for instance defined in the modules `package.json`). UI5 Project will use it in place of a module name.

#### Example A:
An application "my-application" defines a npm dependency to [lodash](https://lodash.com/) in its `package.json` and configures it by using a project-shim extension added to its `ui5.yaml`.

**ui5.yaml**
```yaml
specVersion: "1.0"
type: application
metadata:
  name: my.application
--- # Everything below this line could also be put into the ui5.yaml of a standalone extension module
specVersion: "1.0"
kind: extension
type: project-shim
metadata:
  name: my.application.thirdparty
shims:
  configurations:
    lodash: # name as defined in package.json
      specVersion: "1.0"
      type: module # Use module type
      metadata:
        name: lodash
      resources:
        configuration:
          paths:
            /resources/my/application/thirdparty/: "" # map root directory of lodash module
```

#### Example B:
An application "application.a" depends on a library "legacy.library.a" which does not contain a `ui5.yaml` or `package.json` yet (nor do its dependencies).

##### Structure of the legacy library directories (two repositories)
```
legacy-libs/
    \_ src/
        \_ library.a/
            \_ src/
            \_ test/
        \_ library.b/
            \_ src/
            \_ test/
legacy-library-x/
    \_ src/
    \_ test/
```

##### Dependencies between the legacy libraries
```
legacy.library.a depends on legacy.library.b
legacy.library.a depends on legacy.library.x

legacy.library.b depends on legacy.library.x
```

##### application.a
**Directory structure**
```
application-a/
    \_ node_modules/
        \_ legacy-libs/
        \_ legacy-library-x/
    \_ webapp/
    \_ ui5.yaml
    \_ package.json
```

**package.json (extract)**  
[napa](https://github.com/shama/napa) can install git repositories that are lacking a `package.json` with npm. Within `ui5-project`, the npm translator already detects dependencies defined in the `napa` section of a `package.json` and tries to resolve them.

```json
{
    "scripts": {
        "install": "napa"
    },
    "napa": {
        "legacy-libs": "<git-repository-url>",
        "legacy-library-x": "<git-repository-url>"
    }
}

```

**ui5.yaml**  
The shim defined in the application configures the legacy libraries and defines their dependencies. This shim might as well be a standalone module that is added to the applications dependencies. That would be the typical reuse scenario for shims.

```yaml
specVersion: "1.0"
type: application
metadata:
  name: application.a
----
specVersion: "1.0"
kind: extension
type: project-shim
metadata:
  name: legacy-lib-shims
shims:
  configurations:
    legacy-library-a:
      specVersion: "1.0"
      type: library
      metadata:
        name: legacy.library.a
    legacy-library-b:
      specVersion: "1.0"
      type: library
      metadata:
        name: legacy.library.b
    legacy-library-x:
      specVersion: "1.0"
      type: library
      metadata:
        name: legacy.library.x
  dependencies:
    legacy-library-a:
      - legacy-library-b
      - legacy-library-x
    legacy-library-b:
      - legacy-library-x
  collections:
    legacy-libs:
      modules:
        legacy-library-a: src/library.a
        legacy-library-b: src/library.b
```

## Specification Versions
The specification version as configured in the `specVersion` property, defines the version a configuration is based on.

### Compatibility Matrix

Version | [UI5 CLI](https://github.com/SAP/ui5-cli) Release
--- | ---
**0.1** | v0.0.1+
**1.0** | v1.0.0+

### Specification Version 0.1
Initial version.

Version 0.1 projects are compatible with [UI5 CLI](https://github.com/SAP/ui5-cli) v0.0.1 and above.

### Specification Version 1.0
First stable release.

Version 1.0 projects are supported by [UI5 CLI](https://github.com/SAP/ui5-cli) v1.0.0 and above.
