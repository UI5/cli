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
specVersion: "5.0"
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
specVersion: "5.0"
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
specVersion: "5.0"
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
specVersion: "5.0"
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
specVersion: "5.0"
kind: extension
type: task
metadata:
  name: render-markdown-files
task:
  path: lib/tasks/renderMarkdownFiles.js
```

## Task Implementation

A custom task implementation needs to return a function with the following signature:

::: code-group

```js [ESM]
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
 *      https://ui5.github.io/cli/v5/api/@ui5_project_build_helpers_TaskUtil.html
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

```js [CommonJS]
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
 *      https://ui5.github.io/cli/v5/api/@ui5_project_build_helpers_TaskUtil.html
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
:::

### Required Dependencies

::: info
This functionality has been added with UI5 CLI [`v3.0.0`](https://github.com/SAP/ui5-cli/releases/tag/v3.0.0)

:::

Custom tasks can export an optional callback function `determineRequiredDependencies` to control which dependency-resources are made available through the `dependencies`-reader that is provided to the task. By reducing the amount of required dependencies or by not requiring any, UI5 CLI might be able to build a project faster.

Before executing a task, UI5 CLI will ensure that all required dependencies have been built.

If this callback is not provided, UI5 CLI will make an assumption as to whether the custom task requires access to any resources of dependencies based on the defined Specification Version of the custom task extension:

* **Specification Version 3.0 and later:** If no callback is provided, UI5 CLI assumes that no dependencies are required. In this case, the `dependencies` parameter will be omitted.
* **Specification Versions before 3.0:** If no callback is provided, UI5 CLI assumes that all dependencies are required.


*For more details, see also [RFC 0012 UI5 CLI Extension API v3](https://github.com/UI5/cli/blob/main/rfcs/0012-UI5-Tooling-Extension-API-3.md)*

::: code-group

```js [ESM]
/**
 * Callback function to define the list of required dependencies
 *
 * @param {object} parameters
 * @param {Set} parameters.availableDependencies
 *      Set containing the names of all direct dependencies of
 *      the project currently being built.
 * @param {function} parameters.getDependencies
 *      Identical to TaskUtil#getDependencies
 *         (see https://ui5.github.io/cli/v5/api/@ui5_project_build_helpers_TaskUtil.html).
 *      Creates a list of names of all direct dependencies
 *      of a given project.
 * @param {function} parameters.getProject
 *      Identical to TaskUtil#getProject
 *         (see https://ui5.github.io/cli/v5/api/@ui5_project_build_helpers_TaskUtil.html).
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

```js [CommonJS]
/**
 * Callback function to define the list of required dependencies
 *
 * @param {object} parameters
 * @param {Set} parameters.availableDependencies
 *      Set containing the names of all direct dependencies of
 *      the project currently being built.
 * @param {function} parameters.getDependencies
 *      Identical to TaskUtil#getDependencies
 *         (see https://ui5.github.io/cli/v5/api/@ui5_project_build_helpers_TaskUtil.html).
 *      Creates a list of names of all direct dependencies
 *      of a given project.
 * @param {function} parameters.getProject
 *      Identical to TaskUtil#getProject
 *         (see https://ui5.github.io/cli/v5/api/@ui5_project_build_helpers_TaskUtil.html).
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
:::

### "Cache-aware" Tasks

Due to UI5 Builder and UI5 Server supporting **build caches** of task data, custom tasks can opt into this behavior to improve performance. A cache-aware task is a **step-based task**: instead of a task body, it default-exports a factory `build(options)` and declares a static `stepBased` flag. The factory returns an array of steps that describe the work. The build cache tracks each step's inputs and, on a delta build, re-runs only the steps (and, within a step, only the keys) whose inputs changed, restoring the rest from cache. A task that is not step-based, runs on a Specification Version below 5.0, or has no cache available, processes all resources from scratch.

Step-based custom tasks are available from Specification Version 5.0. A task opts in with a static `stepBased` export set to `true`:

::: code-group

```js [ESM]
export const stepBased = true;
export default function build(options) {
    return [ /* steps */ ];
};
```

```js [CommonJS]
module.exports = function build(options) {
    return [ /* steps */ ];
};
module.exports.stepBased = true;
```
:::

The factory receives the task `options` only (the same `options` object the standard task function receives); it never receives readers or a `taskUtil`, so it cannot close over build state. It must be pure over `options`: it may branch on `options.projectNamespace`, precompute glob patterns, or include or omit steps, but it must not read or write resources. Every input a step reads arrives through the step's own callback arguments.

There are two kinds of steps, run in array order:

* **Scalar step** `{name, needs?, run}` — runs once. `run: async ({needs, workspace, dependencies, taskUtil, options}) => value?`
* **Map step** `{name, needs?, keys, each}` — runs once per key. `keys: async ({needs, workspace, dependencies, taskUtil, options}) => keySet` enumerates the keys, and `each: async (key, {needs, workspace, dependencies, taskUtil, options}) => value?` processes one key. A key is a resource or a stable string.

Each step gets its own `name` (a non-empty string, unique within the task). A map step is the usual cache-aware shape: the build cache treats every key as its own cached unit, so a delta build re-processes only the keys whose inputs changed.

A step may list earlier step names in `needs`; those steps' return values then arrive as `needs.<name>` in the step's callbacks. A step may reference only steps that come before it in the array, so there can be no cycle. A step's return value (resources, or any JSON-serializable value) folds into the cache signature of every step that consumes it, so a changed producer re-runs its consumers.

::: info Best Practices for Cache-aware Tasks
1. **Keep tasks deterministic**: Given the same inputs, always produce the same outputs.
2. **Keep the factory pure**: The `build(options)` factory must only return step descriptors from `options`. Never read or write resources in the factory; do that in the step callbacks.
3. **Read and write only through the callback arguments**: Every input a step reads must arrive through its `workspace`, `dependencies`, `taskUtil`, or `needs` arguments, and every write must go through the step's own `workspace`. A read or write that bypasses these is not recorded, so the cache cannot track it and a delta build can serve stale output.
4. **Import heavy processors lazily**: UI5 CLI calls the factory on every build to discover the steps, even when every step is a cache hit. Import heavy modules inside the step callbacks (for example `const p = (await import("./processor.js")).default`), not at the top of the module, so a fully cached build does not load them.
5. **Split work carefully**: Only use a map step if each key can be processed independently. Two keys that run concurrently must not write the same path.
6. **Name steps stably**: Reuse the same step `name` across builds so the cached data is found.
:::

### Examples

The following code snippets show examples for custom task implementations.

#### Example: lib/tasks/renderMarkdownFiles.js

This example is making use of the `resourceFactory` [TaskUtil](../../api/@ui5_project_build_helpers_TaskUtil.html)
API to create new resources based on the output of a third-party module for rendering Markdown files. The created resources are added to the build
result by writing them into the provided `workspace`.
This task is a step-based, cache-aware task: a single map step renders one Markdown resource per key, so a delta build re-renders only the files that changed. The `renderMarkdown` processor is imported lazily inside the `each` callback, so a fully cached build never loads it.

::: code-group

```js [ESM]
import path from "node:path";
import {getLogger} from "@ui5/logger";

const log = getLogger("builder:tasks:renderMarkdownFiles");

/*
* Render all .md (Markdown) files in the project to HTML
*/
export const stepBased = true;
export default function build(options) {
    return [{
        name: "render",
        // One cached unit per Markdown file, so a delta build re-renders only the files that changed.
        keys: async ({workspace}) => workspace.byGlob("**/*.md"),
        each: async (resource, {workspace, taskUtil}) => {
            // Import the processor lazily so a fully cached build does not load it
            const renderMarkdown = (await import("./renderMarkdown.js")).default;
            const {createResource} = taskUtil.resourceFactory;
            const markdownResourcePath = resource.getPath();

            log.info(`Rendering markdown file ${markdownResourcePath}...`);
            const htmlString = await renderMarkdown(await resource.getString(), options.configuration);

            // Note: @ui5/fs virtual paths are always (on *all* platforms) POSIX. Therefore using path.posix here
            const newResourceName = path.posix.basename(markdownResourcePath, ".md") + ".html";
            const newResourcePath = path.posix.join(path.posix.dirname(markdownResourcePath), newResourceName);

            await workspace.write(createResource({
                path: newResourcePath,
                string: htmlString
            }));
        }
    }];
};
```

```js [CommonJS]
const path = require("node:path");
const {getLogger} = require("@ui5/logger");

const log = getLogger("builder:tasks:renderMarkdownFiles");

/*
* Render all .md (Markdown) files in the project to HTML
*/
module.exports = function build(options) {
    return [{
        name: "render",
        // One cached unit per Markdown file, so a delta build re-renders only the files that changed.
        keys: async ({workspace}) => workspace.byGlob("**/*.md"),
        each: async (resource, {workspace, taskUtil}) => {
            // Import the processor lazily so a fully cached build does not load it
            const renderMarkdown = require("./renderMarkdown.js");
            const {createResource} = taskUtil.resourceFactory;
            const markdownResourcePath = resource.getPath();

            log.info(`Rendering markdown file ${markdownResourcePath}...`);
            const htmlString = await renderMarkdown(await resource.getString(), options.configuration);

            // Note: @ui5/fs virtual paths are always (on *all* platforms) POSIX. Therefore using path.posix here
            const newResourceName = path.posix.basename(markdownResourcePath, ".md") + ".html";
            const newResourcePath = path.posix.join(path.posix.dirname(markdownResourcePath), newResourceName);

            await workspace.write(createResource({
                path: newResourcePath,
                string: htmlString
            }));
        }
    }];
};
module.exports.stepBased = true;
```
:::

::: warning
Depending on your project setup, UI5 CLI tends to open many files simultaneously during a build. To prevent errors like `EMFILE: too many open files`, we urge custom task implementations to use the [graceful-fs](https://github.com/isaacs/node-graceful-fs#readme) module as a drop-in replacement for the native `fs` module in case it is used.

Tasks should ideally use the reader/writer APIs provided by UI5 CLI for working with project resources.

:::

#### Example: lib/tasks/compileLicenseSummary.js

This example is making use of multiple [TaskUtil](../../api/@ui5_project_build_helpers_TaskUtil.html)
APIs to retrieve additional information about the project currently being built (`taskUtil.getProject()`) and its direct dependencies
(`taskUtil.getDependencies()`). Project configuration files like `package.json` can be accessed directly using `project.getRootReader()`.

::: code-group

```js [ESM]
import path from "node:path";

/*
* Compile a list of all licenses of the project's dependencies
* and write it to "dependency-license-summary.json
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
            const pkgResource = await project.getRootReader().byPath("../package.json");
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

```js [CommonJS]
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
:::

## Helper Class `TaskUtil`

Custom tasks defining [Specification Version](../Configuration.md#specification-versions) 2.2 or higher have access to an interface of a [TaskUtil](../../api/@ui5_project_build_helpers_TaskUtil.html) instance.

In this case, a `taskUtil` object is provided as a part of the custom task's [parameters](#task-implementation). Depending on the specification version of the custom task, a set of helper functions is available to the implementation. The lowest required specification version for every function is listed in the [TaskUtil API reference](../../api/@ui5_project_build_helpers_TaskUtil.html).
