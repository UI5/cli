- Start Date: 2018-04-03
- RFC PR: [#5](https://github.com/UI5/cli/pull/5)
- Issue: -
- Affected components <!-- Check affected components by writing an "X" into the brackets -->
    + [ ] [ui5-builder](./packages/builder)
    + [ ] [ui5-server](./packages/server)
    + [ ] [ui5-cli](./packages/cli)
    + [ ] [ui5-fs](./packages/fs)
    + [x] [ui5-project](./packages/project)
    + [ ] [ui5-logger](./packages/logger)

# RFC 0002 Project Shims
## Summary
Add a feature to define configuration and dependency information of a UI5 project outside of that project.

## Motivation
To make a UI5 project (e.g. an application or library) available in the UI5 CLI, there are currently two requirements:

1. A `ui5.yaml` file must be present in the projects root directory, containing the projects **configuration**
2. The projects **dependencies** must be defined in a `package.json` file in the projects root directory
    - Currently we only have the "npm" translator, which means all dependencies need to be declared npm-style. But other translators might be added in the future
    - We ignore the "static" translator here as it is meant for testing purposes only

When working on a UI5 project, let's say an application, it might depend on libraries which do not fulfill above mentioned requirements yet. In addition, the developer might not be the owner of those libraries, thus may not be able to do the necessary modifications.

Therefore a developer might need to "Shim" configuration and dependency information for a dependency.

Another scenario is to extend or overwrite specific parts of a dependencies configuration.

## Detailed design
Facilitate the generic extension concept described in [RFC 0001 (#4)](https://github.com/UI5/cli/pull/4) to declare an extension of type "project-shim". For example:
```yaml
specVersion: "0.1"
kind: extension
type: project-shim
metadata:
    name: legacy-lib-shims
shims:
    configurations:
        <id/module name>:
            specVersion: "0.1",
            type: <project type>
            metadata:
                name: <project name>
    dependencies:
        <id/module name>:
            - <id/module name>
            - <id/module name>
            - <id/module name>
            - ...
    collections:
        <module name>:
            modules:
                <id>: <relative path>
                <id>: <relative path>
                <id>: <relative path>
```

### Example
An application "application.a" depends on a library "legacy.library.a" which does not contain a `ui5.yaml` or `package.json` yet (nor do its dependencies).

#### Structure of the legacy library directories (two repositories)
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

#### Dependencies between the legacy libraries
```
legacy.library.a depends on legacy.library.b
legacy.library.a depends on legacy.library.x

legacy.library.b depends on legacy.library.x
```

#### application.a
##### Directory structure
```
application-a/
    \_ node_modules/
        \_ legacy-libs/
        \_ legacy-library-x/
    \_ webapp/
    \_ ui5.yaml
    \_ package.json
```

##### package.json (extract)
[napa](https://github.com/shama/napa) can install git repositories that are lacking a `package.json` with npm. `ui5-project` already detects dependencies defined in the `napa` section of a `package.json` and tries to resolve them.

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

##### ui5.yaml
The shim define in the application configures the legacy libraries and defines their dependencies. This shim might as well be a standalone module that is added to the applications dependencies. That would be the typical reuse scenario for shims.

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


## How we teach this
Documentation in the [ui5-project repository](https://github.com/SAP/ui5-project/blob/main/docs/Configuration.md#project-shims).

## Drawbacks
When a shim overwrites the configuration of another project, changes made to the projects original configuration might be incompatible with the shim-configuration.

## Alternatives
Unknown

## Unresolved questions
-
