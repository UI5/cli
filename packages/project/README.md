![UI5 icon](https://raw.githubusercontent.com/SAP/ui5-tooling/master/docs/images/UI5_logo_wide.png)

# ui5-project
> Modules for building a UI5 projects dependency tree, including configuration.  
> Part of the [UI5 Build and Development Tooling](https://github.com/SAP/ui5-tooling)

[![Travis CI Build Status](https://travis-ci.org/SAP/ui5-project.svg?branch=master)](https://travis-ci.org/SAP/ui5-project)
[![npm Package Version](https://badge.fury.io/js/%40ui5%2Fproject.svg)](https://www.npmjs.com/package/@ui5/project)
[![Coverage Status](https://coveralls.io/repos/github/SAP/ui5-project/badge.svg)](https://coveralls.io/github/SAP/ui5-project)
[![Dependency Status](https://david-dm.org/SAP/ui5-project/master.svg)](https://david-dm.org/SAP/ui5-project/master)
[![devDependency Status](https://david-dm.org/SAP/ui5-project/master/dev-status.svg)](https://david-dm.org/SAP/ui5-project/master#info=devDependencies)

**This is an alpha release!**  
**The UI5 Build and Development Tooling described here is not intended for productive use yet. Breaking changes are to be expected.**

## Normalizer
The purpose of the normalizer is to collect dependency information and to enrich it with project configuration ([generateProjectTree](https://github.com/pages/SAP/ui5-tooling/module-normalizer_normalizer.html#~generateProjectTree)).

[Translators](#translators) are used to collect dependency information. The [Project Preprocessor](#project-preprocessor) enriches this dependency information with project configuration, typically from a `ui5.yaml` file. A development server and build process can use this information to locate project and dependency resources.

If you want to retrieve the project dependency graph only, use ([generateDependencyTree](https://github.com/pages/SAP/ui5-tooling/module-normalizer_normalizer.html#~generateDependencyTree)).

## Translators
Translators collect recursively all dependencies on a package manager specific layer and return information about them in a well-defined tree structure.

### Tree Structure Returned by a Translator
The following dependency tree is the expected input structure of the [Project Preprocessor](#project-preprocessor):

````json
{
    "id": "projectA",
    "version": "1.0.0",
    "path": "/absolute/path/to/projectA",
    "dependencies": [
        {
            "id": "projectB",
            "version": "1.0.0",
            "path": "/path/to/projectB",
            "dependencies": [
                {
                    "id": "projectD",
                    "path": "/path/to/different/projectD"
                }
            ]
        },
        {
            "id": "projectD",
            "version": "1.0.0",
            "path": "/path/to/projectD"
        },
        {
            "id": "myStaticServerTool",
            "version": "1.0.0",
            "path": "/path/to/some/dependency"
        }
    ]
}
````

### npm Translator
The npm translator is currently the default translator and looks for dependencies defined in the `package.json` file of a certain project. `dependencies`, `devDepedencies`, and [napa dependencies](https://github.com/shama/napa) (Git repositories which don't have a `package.json` file) are located via the Node.js module resolution logic.

### Static Translator
*This translator is currently intended for testing purposes only.*

Can be used to supply the full dependency information of a project in a single structured file.

Example: `ui5 serve -b static:/path/to/projectDependencies.yaml`  
`projectDependencies.yaml` contains something like:
````yaml
---
id: testsuite
version: "",
path: "./"
dependencies:
- id: sap.f
  version: "",
  path: "../sap.f"

- id: sap.m
  version: "",
  path: "../sap.m"
````

## Project Preprocessor
Enhances a given dependency tree based on a projects [configuration](#configuration).

### Enhanced Dependency Tree Structure Returned by the Project Preprocessor
````json
{
    "id": "projectA",
    "version": "1.0.0",
    "path": "/absolute/path/to/projectA",
    "specVersion": "0.1",
    "type": "application",
    "metadata": {
        "name": "sap.projectA",
        "copyright": "Some copyright ${currentYear}"
    },
    "resources": {
        "configuration": {
            "paths": {
                "webapp": "app"
            }
        },
        "pathMappings": {
             "/": "app"
        }
    },
    "dependencies": [
        {
            "id": "projectB",
            "version": "1.0.0",
            "path": "/path/to/projectB",
            "specVersion": "0.1",
            "type": "library",
            "metadata": {
                "name": "sap.ui.projectB"
            },
            "resources": {
                "configuration": {
                    "paths": {
                        "src": "src",
                        "test": "test"
                    }
                },
                "pathMappings": {
                    "/resources/": "src",
                    "/test-resources/": "test"
                }
            },
            "dependencies": [
                {
                    "id": "projectD",
                    "version": "1.0.0",
                    "path": "/path/to/different/projectD",
                    "specVersion": "0.1",
                    "type": "library",
                    "metadata": {
                        "name": "sap.ui.projectD"
                    },
                    "resources": {
                        "configuration": {
                            "paths": {
                                "src": "src/main/uilib",
                                "test": "src/test"
                            }
                        },
                        "pathMappings": {
                            "/resources/": "src/main/uilib",
                            "/test-resources/": "src/test"
                        }
                    },
                    "dependencies": []
                }
            ]
        },
        {
            "id": "projectD",
            "version": "1.0.0",
            "path": "/path/to/projectD",
            "specVersion": "0.1",
            "type": "library",
            "metadata": {
                "name": "sap.ui.projectD"
            },
            "resources": {
                "configuration": {
                    "paths": {
                        "src": "src/main/uilib",
                        "test": "src/test"
                    }
                },
                "pathMappings": {
                    "/resources/": "src/main/uilib",
                    "/test-resources/": "src/test"
                }
            },
            "dependencies": []
        }
    ]
}
````

## Configuration
### Project Configuration
Typically located in a `ui5.yaml` file per project.

#### Example
````yaml
specVersion: "0.1"
type: application
metadata:
  name: my-application
````

#### Structure
##### YAML
````yaml
---
specVersion: "0.1"
type: application|library|custom
metadata:
  name: testsuite
  copyright: |-
   <project name>
    * (c) Copyright 2009-${currentYear} <my company> <my license>
resources:
  configuration:
    paths:
        "<virtual path>": "<physical path>"
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
server:
  settings:
    port: 8099
````

#### Properties
##### \<root\>
- `specVersion`: Version of the specification
- `type`: Either `application`, `library` or `custom` (custom not yet implemented); defines the default path mappings and build steps. Custom doesn't define any specific defaults.

##### metadata
Some general information:
- `name`: Name of the application/library/resource
- `copyright` (optional): String to be used for replacement of copyright placeholders in the project

##### resources (optional)
- `configuration`
    - `paths`: Mapping between virtual and physical paths
        + For type `application` there can be a setting for mapping the virtual path `webapp` to a physical path within the project
        + For type `library` there can be a setting for mapping the virtual paths `src` and `test` to physical paths within the project

##### builder (optional)
- `customTasks` (optional, list): In this block, you define additional custom build tasks, see [here](docs/BuildExtensibility.md) for a detailed explanation and examples of the build extensibility. Each entry in the `customTasks` list consists of the following options:
  - `name` (mandatory): The name of the custom task
  - `afterTask` or `beforeTask` (only one, mandatory): The name of the build task after or before which your custom task will be executed.
  - `configuration` (optional): Additional configuration that is passed to the custom build task

##### server (optional)
- `settings` (not yet implemented)
    - `port`: Project default server port; can be overwritten via CLI parameters

### Extension Configuration
Typically located in a `ui5.yaml` file. Extensions can be defined in any projects `ui5.yaml`, *after* the project configuration (separated by `---`). In case you'd like to reuse an extension across multiple projects you can make it a module itself.

Extensions can be identified by the `kind: extension` configuration. If no `kind` configuration is given, [`project`](#project-configuration) is assumed.

#### Tasks
See [Build Extensibility](docs/BuildExtensibility.md).

#### Project Shim
A project shim extension can be used to define or extend a project configuration of a module. The most popular use case is probably to add UI5 project configuration to a third party module that otherwise could not be used with the UI5 Tooling.

Also see [RFC 0002 Project Shims](https://github.com/SAP/ui5-tooling/blob/master/rfcs/0002-project-shims.md).

##### Structure
```yaml
specVersion: "0.1"
kind: extension
type: project-shim
metadata:
    name: <name of project shim extension>
shims:
    configurations:
        <module name (id)>:
            specVersion: "0.1",
            type: <project type>
            metadata:
                name: <project name>
        <module name (id)>:
            specVersion: "0.1",
            type: <project type>
            metadata:
                name: <project name>
    dependencies:
        <module name (id)>:
            - <module name (id)>
            - <module name (id)>
            - <module name (id)>
            - ...
    collections:
        <module name>:
            modules:
                <id>: <relative path>
                <id>: <relative path>
                <id>: <relative path>
```

"module name" refers to the name of the module as identified by the used translator. E.g. when using the npm translator, name declared in the modules `package.json` is used here. In most cases, the module name also becomes a projects ID.

###### configurations (optional)
Map of module names. The values represent the configuration that should be applied to the module. This configuration can be defined just like in any `ui5.yaml`.

Configuration is applied to the module using [`Object.assign()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign). This means that existing configuration properties will be overwritten.

###### dependencies (optional)
Map of module names. The value is an array of module names that this module depends on. The other modules need to be part of the dependency tree.



###### collections (optional)

##### Example A:
An application "my-application" defines an npm dependency to [lodash](https://lodash.com/) in its `package.json` and configures it by using a project-shim extension added to its `ui5.yaml`.

```yaml
specVersion: "0.1"
type: application
metadata:
  name: my.application
--- # Everything below this line could also be put into the ui5.yaml of a standalone extension module
specVersion: "0.1"
kind: extension
type: project-shim
metadata:
  name: my.application.thirdparty
shims:
  configurations:
    lodash: # name as defined in package.json
      specVersion: "0.1"
      type: module # Use module type
      metadata:
        name: lodash
      resources:
        configuration:
          paths:
            /resources/my/application/thirdparty/: "" # map root directory of lodash module
```

##### Example B:
An application "application.a" depends on a library "legacy.library.a" which does not contain a `ui5.yaml` or `package.json` yet (nor do its dependencies).

###### Structure of the legacy library directories (two repositories)
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

###### Dependencies between the legacy libraries
```
legacy.library.a depends on legacy.library.b
legacy.library.a depends on legacy.library.x

legacy.library.b depends on legacy.library.x
```

###### application.a
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
specVersion: "0.1"
type: application
metadata:
    name: application.a
----
specVersion: "0.1"
kind: extension
type: project-shim
metadata:
    name: legacy-lib-shims
shims:
    configurations:
        legacy-library-a:
            specVersion: "0.1"
            type: library
            metadata:
                name: legacy.library.a
        legacy-library-b:
            specVersion: "0.1"
            type: library
            metadata:
                name: legacy.library.b
        legacy-library-x:
            specVersion: "0.1"
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


## Contributing
Please check our [Contribution Guidelines](https://github.com/SAP/ui5-tooling/blob/master/CONTRIBUTING.md).

## Support
Please follow our [Contribution Guidelines](https://github.com/SAP/ui5-tooling/blob/master/CONTRIBUTING.md#report-an-issue) on how to report an issue.

## Release History
See [CHANGELOG.md](CHANGELOG.md).

## License
This project is licensed under the Apache Software License, Version 2.0 except as noted otherwise in the [LICENSE](/LICENSE.txt) file.
