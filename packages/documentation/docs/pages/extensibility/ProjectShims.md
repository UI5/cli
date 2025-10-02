### Project Shims
A project shim extension can be used to define or extend a project configuration of a module. The most popular use case is probably to add UI5 project configuration to a third party module that otherwise could not be used with the UI5 CLI.

Also see [RFC 0002 Project Shims](https://github.com/UI5/cli/blob/main/rfcs/0002-project-shims.md).

#### Structure
```yaml
specVersion: "4.0"
kind: extension
type: project-shim
metadata:
  name: <name of project shim extension>
shims:
  configurations:
    <module name (id)>:
      specVersion: "4.0"
      type: <project type>
      metadata:
        name: <project name>
    <module name (id)>:
      specVersion: "4.0"
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
specVersion: "4.0"
type: application
metadata:
  name: my.application
--- # Everything below this line could also be put into the ui5.yaml of a standalone extension module
specVersion: "4.0"
kind: extension
type: project-shim
metadata:
  name: my.application.thirdparty
shims:
  configurations:
    lodash: # name as defined in package.json
      specVersion: "4.0"
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
specVersion: "4.0"
type: application
metadata:
  name: application.a
----
specVersion: "4.0"
kind: extension
type: project-shim
metadata:
  name: legacy-lib-shims
shims:
  configurations:
    legacy-library-a:
      specVersion: "4.0"
      type: library
      metadata:
        name: legacy.library.a
    legacy-library-b:
      specVersion: "4.0"
      type: library
      metadata:
        name: legacy.library.b
    legacy-library-x:
      specVersion: "4.0"
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
