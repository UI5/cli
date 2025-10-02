# Development Overview
When developing a UI5 project on your local system, you should use the UI5 Server (`ui5 serve`) and not the UI5 Builder (`ui5 build`). Building a project should only be required when deploying it.

However, you might have good reasons to also use the UI5 Builder during development. In such cases, feel free to let us know! Maybe your use case could be covered by a future enhancement of the UI5 Server.

## Project Dependencies

UI5 CLI differentiates between "framework dependencies" and "project dependencies".

**Framework dependencies** are generally libraries and themes provided by the SAP frameworks "OpenUI5" and "SAPUI5". UI5 CLI will take care of downloading them and handling their versions for you. Please see the corresponding documentation on both options:

* [Working with **OpenUI5** Framework Dependencies](./OpenUI5.md)
* [Working with **SAPUI5** Framework Dependencies](./SAPUI5.md)

**Project dependencies** are all other libraries, custom themes, UI5 CLI extensions or JavaScript modules your project depends on. In general these dependencies are maintained in the package.json of your project. See also: [FAQ: Why package.json? / Why npm?](./FAQ.md#why-packagejson-why-npm).

## Linking Projects
Would you like to work on an application project and one or more of its dependencies at the same time? We got you covered!

### UI5 Workspaces
The recommended approach for setting up a development environment where simultaneous work on multiple UI5 projects is required.

Head over to the [UI5 Workspaces](./Workspace.md) documentation for the details. Below is an example based on a simple scenario with an application and a reuse library project:

**Example: Your Directory Structure**
```
my-app/
    \_ node_modules/
    \_ webapp/
    \_ ui5.yaml
    \_ package.json
my-reuse-library/
    \_ node_modules/
    \_ src/
    \_ test/
    \_ ui5.yaml
    \_ package.json
```

In its `package.json`, `my-app` should already define a dependency to `my-reuse-library`. So, after running the `npm install` command, a copy of the `my-reuse-library`-package should be retrieved from the package registry and added to my-app's `node_modules/` directory.

In the `my-app` directory, create a new file named `ui5-workspace.yaml` with the following content:

```yaml title="ui5-workspace.yaml"
specVersion: workspace/1.0
metadata:
    name: default
dependencyManagement:
    resolutions:
        - path: ../my-reuse-library
```

That's it! Start a server via `ui5 serve`, and you will see that any changes you make in `my-reuse-library` are immediately visible in `my-app`.

## Package Managers

By leaving dependency management up to the tool of your choice (see [FAQ: Why package.json? / Why npm?](./FAQ.md#why-packagejson-why-npm)) you have a variety of other options for linking dependencies into your project.

Here is an example using the [npm CLI](https://www.npmjs.com/get-npm) in Version 8, an application, and a reuse library project:

**Example: Your Directory Structure**
```
my-app/
    \_ node_modules/
    \_ webapp/
    \_ ui5.yaml
    \_ package.json
my-reuse-library/
    \_ node_modules/
    \_ src/
    \_ test/
    \_ ui5.yaml
    \_ package.json
```

In its `package.json`, `my-app` should already define a dependency to `my-reuse-library`. So, after running the `npm install` command, a copy of the "my-reuse-library"-package should be retrieved from the package registry and added to my-app's `node_modules/` directory.

Now all you need to do is replacing this copy of the `my-reuse-library` package with a  link to the `my-reuse-library` project located somewhere on your computer. In this example it is right next to `my-app`, but that doesn't really matter.

First, in the directory of the `my-reuse-library` project, create a global link:
```sh
npm link
```

Then, in the `my-app` directory, use that link to replace the registry package:
```sh
npm link my-reuse-library
```
_**Note:** "my-reuse-library" is the name defined in the `package.json` and not necessarily the directory or `ui5.yaml` name_

That's it. You can check whether the linking worked by executing `ui5 tree` in the `my-app` directory and looking for the path attributes in its output.

## Static Dependency Definition

As an alternative to defining your project dependencies in the `package.json`, you can define a static dependency hierarchy for the project in a YAML file. This is typically only advised in special cases where none of the other concepts work.

To use such a file in UI5 CLI, provide a path to it using the [`--dependency-definition`](./CLI.md#common-options) parameter. Note that all `package.json` dependencies will be ignored (including UI5 CLI extensions), but UI5 framework dependencies defined in `ui5.yaml` will still be used.

**Example: `projectDependencies.yaml`**

```yaml
id: my.app
version: "local"
path: "."
dependencies:
  - id: my.lib
    version: "local"
    path: "../my.lib"
```

By placing this file in the root directory of the `my.app` application project, you can start a server with a local copy of the `my.lib` dependency, located in the same parent directory, using the command `ui5 serve --dependency-definition ./projectDependencies.yaml`.

The structure of the dependency definition file follows that of the [`@ui5/project/graph/providers/DependencyTree~TreeNode`](https://ui5.github.io/cli/stable/api/@ui5_project_graph_providers_DependencyTree.html#~TreeNode) type.

## HTTP/2 Development Webserver
The UI5 CLI contains a web server to serve the project via HTTP/2 protocol.

```sh
ui5 serve --h2
```

This requires an SSL certificate. You are guided through the automatic generation process. Also see the [UI5 Server documentation](./Server.md#ssl-certificates)

## Integration in Other Tools
One of the key features of the UI5 CLI is its modularization. Single parts of UI5 CLI can easily be integrated in other `Node.js`-based tools and frameworks like [Grunt](https://gruntjs.com/) or [Gulp](https://gulpjs.com/).

All JavaScript APIs available for direct consumption are listed [here](https://ui5.github.io/cli/v4/api/index.html). However, for standard UI5 development, the [UI5 CLI](./CLI.md) should always be the first choice.
