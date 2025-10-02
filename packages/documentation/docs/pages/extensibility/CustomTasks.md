# Custom UI5 Builder Tasks

The UI5 Build Extensibility enables you to enhance the build process of any UI5 project. In addition to the [standard tasks](../Builder.md#standard-tasks), custom tasks can be created.

The UI5 community already created many custom tasks which you can integrate into your project. They are often prefixed by `ui5-task-` to make them easily searchable in the [npm registry](https://www.npmjs.com/search?q=ui5-task-).

Please note that custom tasks from third parties can not only modify your project but also execute arbitrary code on your system. In fact, this is the case for all npm packages you install. Always act with the according care and follow best practices.

## Configuration

You can configure your build process with additional build task. These custom tasks are defined in the project [configuration](../Configuration.md).

To hook your custom tasks into the different build phases of a project, they need to reference other tasks to be executed before or after. This can be a [standard task](../Builder.md#standard-tasks) or another custom task. 
Standard tasks that are disabled, even though they are not executed, can still be referenced by custom tasks, which will be performed in their designated position.

In the below example, when building the library `my.library` the custom `babel` task will be executed before the standard task `generateComponentPreload`.  
Another custom task called `render-markdown-files` is then executed immediately after the standard task `minify`.

### Example: Basic configuration

```yaml
# In this example configuration, two custom tasks are defined: 'babel' and 'render-markdown-files'.
specVersion: "4.0"
type: library
metadata:
  name: my.library
builder:
  customTasks:
    - name: babel
      beforeTask: generateComponentPreload
    - name: render-markdown-files
      afterTask: minify
      configuration:
        markdownStyle:
            firstH1IsTitle: true
```

### Example: Connect multiple custom tasks

You can also connect multiple custom tasks with each other. The order in the configuration is important in this case. You have to make sure that a task is defined *before* you reference it via `beforeTask` or `afterTask`.

```yaml
# In this example, 'my-custom-task-2' gets executed after 'my-custom-task-1'.
specVersion: "4.0"
type: library
metadata:
  name: my.library
builder:
  customTasks:
    - name: my-custom-task-1
      beforeTask: generateComponentPreload
    - name: my-custom-task-2
      afterTask: my-custom-task-1
```

## Custom Task Extension

A custom task extension consists of a `ui5.yaml` and a [task implementation](#task-implementation). It can be a standalone module or part of an existing UI5 project.

### Example: ui5.yaml

```yaml
specVersion: "4.0"
kind: extension
type: task
metadata:
  name: render-markdown-files
task:
  path: lib/tasks/renderMarkdownFiles.js
```

Task extensions can be **standalone modules** which are handled as dependencies.

Alternatively you can implement a task extension as **part of your UI5 project**.
In that case, the configuration of the extension is part of your project configuration inside the `ui5.yaml` as shown below.

The task extension will then be automatically collected and processed during the processing of the project.

### Example: Custom Task Extension defined in UI5 project

```yaml
# Project configuration for the above example
specVersion: "4.0"
kind: project
type: library
metadata:
  name: my.library
builder:
  customTasks:
    - name: render-markdown-files
      afterTask: minify
      configuration:
        markdownStyle:
            firstH1IsTitle: true
---
# Task extension as part of your project
specVersion: "4.0"
kind: extension
type: task
metadata:
  name: render-markdown-files
task:
  path: lib/tasks/renderMarkdownFiles.js
```

## Task Implementation

A custom task implementation needs to return a function with the following signature:

=== "ESM"

    ```js linenums="1"
    /**
     * Custom task API
     *
     * @param {object} parameters
     * 
     * @param {module:@ui5/fs.AbstractReader} parameters.dependencies
     *      Reader to access resources of the project's dependencies
     * @param {@ui5/logger/Logger} parameters.log
     *      Logger instance for use in the custom task.
     *      This parameter is only available to custom task extensions
     *      defining Specification Version 3.0 and later.
     * @param {object} parameters.options Options
     * @param {string} parameters.options.projectName
     *      Name of the project currently being built
     * @param {string} parameters.options.projectNamespace
     *      Namespace of the project currently being built
     * @param {string} parameters.options.configuration
     *      Custom task configuration, as defined in the project's ui5.yaml
     * @param {string} parameters.options.taskName
     *      Name of the custom task.
     *      This parameter is only provided to custom task extensions
     *      defining Specification Version 3.0 and later.
     * @param {@ui5/builder.tasks.TaskUtil} parameters.taskUtil
     *      Specification Version-dependent interface to a TaskUtil instance.
     *      See the corresponding API reference for details:
     *      https://ui5.github.io/cli/v4/api/@ui5_project_build_helpers_TaskUtil.html
     * @param {module:@ui5/fs.DuplexCollection} parameters.workspace
     *      Reader/Writer to access and modify resources of the
     *      project currently being built
     * @returns {Promise<undefined>}
     *      Promise resolving once the task has finished
     */
    export default async function({dependencies, log, options, taskUtil, workspace}) {
        // [...]
    };
    ```

=== "CommonJS"

    ```js linenums="1"
    /**
     * Custom task API
     *
     * @param {object} parameters
     * 
     * @param {module:@ui5/fs.AbstractReader} parameters.dependencies
     *      Reader to access resources of the project's dependencies
     * @param {@ui5/logger/Logger} parameters.log
     *      Logger instance for use in the custom task.
     *      This parameter is only available to custom task extensions
     *      defining Specification Version 3.0 and later.
     * @param {object} parameters.options Options
     * @param {string} parameters.options.projectName
     *      Name of the project currently being built
     * @param {string} parameters.options.projectNamespace
     *      Namespace of the project currently being built
     * @param {string} parameters.options.configuration
     *      Custom task configuration, as defined in the project's ui5.yaml
     * @param {string} parameters.options.taskName
     *      Name of the custom task.
     *      This parameter is only provided to custom task extensions
     *      defining Specification Version 3.0 and later.
     * @param {@ui5/builder.tasks.TaskUtil} parameters.taskUtil
     *      Specification Version-dependent interface to a TaskUtil instance.
     *      See the corresponding API reference for details:
     *      https://ui5.github.io/cli/v4/api/@ui5_project_build_helpers_TaskUtil.html
     * @param {module:@ui5/fs.DuplexCollection} parameters.workspace
     *      Reader/Writer to access and modify resources of the
     *      project currently being built
     * @returns {Promise<undefined>}
     *      Promise resolving once the task has finished
     */
    module.exports = async function({dependencies, log, options, taskUtil, workspace}) {
        // [...]
    };
    ```

### Required Dependencies

!!! info
    This functionality has been added with UI5 CLI [`v3.0.0`](https://github.com/SAP/ui5-cli/releases/tag/v3.0.0)

Custom tasks can export an optional callback function `determineRequiredDependencies` to control which dependency-resources are made available through the `dependencies`-reader that is provided to the task. By reducing the amount of required dependencies or by not requiring any, UI5 CLI might be able to build a project faster.

Before executing a task, UI5 CLI will ensure that all required dependencies have been built.

If this callback is not provided, UI5 CLI will make an assumption as to whether the custom task requires access to any resources of dependencies based on the defined Specification Version of the custom task extension:

* **Specification Version 3.0 and later:** If no callback is provided, UI5 CLI assumes that no dependencies are required. In this case, the `dependencies` parameter will be omitted.
* **Specification Versions before 3.0:** If no callback is provided, UI5 CLI assumes that all dependencies are required.


*For more details, see also [RFC 0012 UI5 CLI Extension API v3](https://github.com/UI5/cli/blob/rfc-ui5-tooling-extension-api-v3/rfcs/0012-UI5-Tooling-Extension-API-3.md#3-tasks-requiring-dependencies)*

=== "ESM"

    ```js linenums="1"
    /**
     * Callback function to define the list of required dependencies
     *
     * @param {object} parameters
     * @param {Set} parameters.availableDependencies
     *      Set containing the names of all direct dependencies of
     *      the project currently being built.
     * @param {function} parameters.getDependencies
     *      Identical to TaskUtil#getDependencies
     *         (see https://ui5.github.io/cli/v4/api/@ui5_project_build_helpers_TaskUtil.html).
     *      Creates a list of names of all direct dependencies
     *      of a given project.
     * @param {function} parameters.getProject
     *      Identical to TaskUtil#getProject
     *         (see https://ui5.github.io/cli/v4/api/@ui5_project_build_helpers_TaskUtil.html).
     *      Retrieves a Project-instance for a given project name.
     * @param {object} parameters.options
     *      Identical to the options given to the standard task function.
     * @returns {Promise<Set>}
     *      Promise resolving with a Set containing all dependencies
     *      that should be made available to the task.
     *      UI5 CLI will ensure that those dependencies have been
     *      built before executing the task.
     */
    export async function determineRequiredDependencies({availableDependencies, getDependencies, getProject, options}) {
        // "availableDependencies" could look like this: Set(3) { "sap.ui.core", "sap.m", "my.lib" }

        // Reduce list of required dependencies: Do not require any UI5 framework projects
        availableDependencies.forEach((depName) => {
            if (getProject(depName).isFrameworkProject()) {
                availableDependencies.delete(depName)
            }
        });
        // => Only resources of project "my.lib" will be available to the task
        return availableDependencies;
    }
    ```

=== "CommonJS"

    ```js linenums="1"
    /**
     * Callback function to define the list of required dependencies
     *
     * @param {object} parameters
     * @param {Set} parameters.availableDependencies
     *      Set containing the names of all direct dependencies of
     *      the project currently being built.
     * @param {function} parameters.getDependencies
     *      Identical to TaskUtil#getDependencies
     *         (see https://ui5.github.io/cli/v4/api/@ui5_project_build_helpers_TaskUtil.html).
     *      Creates a list of names of all direct dependencies
     *      of a given project.
     * @param {function} parameters.getProject
     *      Identical to TaskUtil#getProject
     *         (see https://ui5.github.io/cli/v4/api/@ui5_project_build_helpers_TaskUtil.html).
     *      Retrieves a Project-instance for a given project name.
     * @param {object} parameters.options
     *      Identical to the options given to the standard task function.
     * @returns {Promise<Set>}
     *      Promise resolving with a Set containing all dependencies
     *      that should be made available to the task.
     *      UI5 CLI will ensure that those dependencies have been
     *      built before executing the task.
     */
    module.exports.determineRequiredDependencies = async function({availableDependencies, getDependencies, getProject, options}) {
        // "availableDependencies" could look like this: Set(3) { "sap.ui.core", "sap.m", "my.lib" }

        // Reduce list of required dependencies: Do not require any UI5 framework projects
        availableDependencies.forEach((depName) => {
            if (getProject(depName).isFrameworkProject()) {
                availableDependencies.delete(depName)
            }
        });
        // => Only resources of project "my.lib" will be available to the task
        return availableDependencies;
    }
    ```

### Examples

The following code snippets show examples for custom task implementations.

### Example: lib/tasks/renderMarkdownFiles.js

This example is making use of the `resourceFactory` [TaskUtil](https://ui5.github.io/cli/v4/api/@ui5_project_build_helpers_TaskUtil.html)
API to create new resources based on the output of a third-party module for rendering Markdown files. The created resources are added to the build
result by writing them into the provided `workspace`.

=== "ESM"

    ```js linenums="1"
    import path from "node:path";
    import renderMarkdown from "./renderMarkdown.js";

    /*
    * Render all .md (Markdown) files in the project to HTML
    */
    export default async function({dependencies, log, options, taskUtil, workspace}) {
        const {createResource} = taskUtil.resourceFactory;
        const textResources = await workspace.byGlob("**/*.md");
        await Promise.all(textResources.map(async (resource) => {
            const markdownResourcePath = resource.getPath();

            log.info(`Rendering markdown file ${markdownResourcePath}...`);
            const htmlString = await renderMarkdown(await resource.getString(), options.configuration);

            // Note: @ui5/fs virtual paths are always (on *all* platforms) POSIX. Therefore using path.posix here
            const newResourceName = path.posix.basename(markdownResourcePath, ".md") + ".html";
            const newResourcePath = path.posix.join(path.posix.dirname(markdownResourcePath), newResourceName);

            const markdownResource = createResource({
                path: newResourcePath,
                string: htmlString
            });
            await workspace.write(markdownResource);
        }));
    };
    ```

=== "CommonJS"

    ```js linenums="1"
    const path = require("node:path");
    const renderMarkdown = require("./renderMarkdown.js");

    /*
    * Render all .md (Markdown) files in the project to HTML
    */
    module.exports = async function({dependencies, log, options, taskUtil, workspace}) {
        const {createResource} = taskUtil.resourceFactory;
        const textResources = await workspace.byGlob("**/*.md");
        await Promise.all(textResources.map(async (resource) => {
            const markdownResourcePath = resource.getPath();

            log.info(`Rendering markdown file ${markdownResourcePath}...`);
            const htmlString = await renderMarkdown(await resource.getString(), options.configuration);

            // Note: @ui5/fs virtual paths are always (on *all* platforms) POSIX. Therefore using path.posix here
            const newResourceName = path.posix.basename(markdownResourcePath, ".md") + ".html";
            const newResourcePath = path.posix.join(path.posix.dirname(markdownResourcePath), newResourceName);

            const markdownResource = createResource({
                path: newResourcePath,
                string: htmlString
            });
            await workspace.write(markdownResource);
        }));
    };
    ```

!!! warning
    Depending on your project setup, UI5 CLI tends to open many files simultaneously during a build. To prevent errors like `EMFILE: too many open files`, we urge custom task implementations to use the [graceful-fs](https://github.com/isaacs/node-graceful-fs#readme) module as a drop-in replacement for the native `fs` module in case it is used.

    Tasks should ideally use the reader/writer APIs provided by UI5 CLI for working with project resources.

### Example: lib/tasks/compileLicenseSummary.js

This example is making use of multiple [TaskUtil](https://ui5.github.io/cli/v4/api/@ui5_project_build_helpers_TaskUtil.html)
APIs to retrieve additional information about the project currently being built (`taskUtil.getProject()`) and its direct dependencies
(`taskUtil.getDependencies()`). Project configuration files like `package.json` can be accessed directly using `project.getRootReader()`.

=== "ESM"

    ```js linenums="1"
    import path from "node:path";

    /*
    * Compile a list of all licenses of the project's dependencies
    * and write it to "dependency-license-summary.json"
    */
    export default async function({dependencies, log, options, taskUtil, workspace}) {
        const {createResource} = taskUtil.resourceFactory;
        const licenses = new Map();
        const projectsVisited = new Set();

        async function processProject(project) {
            return Promise.all(taskUtil.getDependencies().map(async (projectName) => {
                if (projectsVisited.has(projectName)) {
                    return;
                }
                projectsVisited.add(projectName);
                const project = taskUtil.getProject(projectName);
                const pkgResource = await project.getRootReader().byPath("/package.json");
                if (pkgResource) {
                    const pkg = JSON.parse(await pkgResource.getString())

                    // Add project to list of licenses
                    if (licenses.has(pkg.license)) {
                        licenses.get(pkg.license).push(project.getName());
                    } else {
                        // License not yet in map. Define it
                        licenses.set(pkg.license, [project.getName()]);
                    }

                } else {
                    log.info(`Could not find package.json file in project ${project.getName()}`);
                }
                return processProject(project);
            }));
        }
        // Start processing dependencies of the root project
        await processProject(taskUtil.getProject());

        const summaryResource = createResource({
            path: "/dependency-license-summary.json",
            string: JSON.stringify(Object.fromEntries(licenses), null, "\t")
        });
        await workspace.write(summaryResource);
    };
    ```

=== "CommonJS"

    ```js linenums="1"
    const path = require("node:path");

    /*
    * Compile a list of all licenses of the project's dependencies
    * and write it to "dependency-license-summary.json"
    */
    module.exports = async function({dependencies, log, options, taskUtil, workspace}) {
        const {createResource} = taskUtil.resourceFactory;
        const licenses = new Map();
        const projectsVisited = new Set();

        async function processProject(project) {
            return Promise.all(taskUtil.getDependencies().map(async (projectName) => {
                if (projectsVisited.has(projectName)) {
                    return;
                }
                projectsVisited.add(projectName);
                const project = taskUtil.getProject(projectName);
                const pkgResource = await project.getRootReader().byPath("/package.json");
                if (pkgResource) {
                    const pkg = JSON.parse(await pkgResource.getString())

                    // Add project to list of licenses
                    if (licenses.has(pkg.license)) {
                        licenses.get(pkg.license).push(project.getName());
                    } else {
                        // License not yet in map. Define it
                        licenses.set(pkg.license, [project.getName()]);
                    }

                } else {
                    log.info(`Could not find package.json file in project ${project.getName()}`);
                }
                return processProject(project);
            }));
        }
        // Start processing dependencies of the root project
        await processProject(taskUtil.getProject());

        const summaryResource = createResource({
            path: "/dependency-license-summary.json",
            string: JSON.stringify(Object.fromEntries(licenses), null, "\t")
        });
        await workspace.write(summaryResource);
    };
    ```

## Helper Class `TaskUtil`

Custom tasks defining [Specification Version](../Configuration.md#specification-versions) 2.2 or higher have access to an interface of a [TaskUtil](https://ui5.github.io/cli/v4/api/@ui5_project_build_helpers_TaskUtil.html) instance.

In this case, a `taskUtil` object is provided as a part of the custom task's [parameters](#task-implementation). Depending on the specification version of the custom task, a set of helper functions is available to the implementation. The lowest required specification version for every function is listed in the [TaskUtil API reference](https://ui5.github.io/cli/v4/api/@ui5_project_build_helpers_TaskUtil.html).
