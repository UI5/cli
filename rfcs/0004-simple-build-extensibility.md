- Start Date: 2018-08-28
- RFC PR: [#54](https://github.com/UI5/cli/pull/54)
- Issue: -
- Affected components <!-- Check affected components by writing an "X" into the brackets -->
    + [x] [ui5-builder](./packages/builder)
    + [ ] [ui5-server](./packages/server)
    + [ ] [ui5-cli](./packages/cli)
    + [ ] [ui5-fs](./packages/fs)
    + [x] [ui5-project](./packages/project)
    + [ ] [ui5-logger](./packages/logger)

# RFC 0004 Simple Build Extensibility
## Summary
Add a feature for basic customization of how a single UI5 project is being built.

## Motivation
Currently the UI5 build is only capable of building UI5 projects of types "application" and "library" with a fixed set of tasks to be executed.

A UI5 project (for example a library) may want to add build steps. For this, an extensibility mechanism is needed.

While multiple UI5 projects may require the same kind of "customized" build, easy reuse capabilities are not in focus of this RFC. [RFC 0001](https://github.com/UI5/cli/pull/4) focuses more on that.

This shall be a preliminary solution to allow for basic extensibility and to learn about the different needs and use cases in that area before proceeding with [RFC 0001](https://github.com/UI5/cli/pull/4) or similar concepts.

## Detailed design
### Configuration
In a projects `ui5.yaml`, a new configuration option should be added to define additional tasks that shall be executed at a specific time during the build process of a project. This configuration shall only affect the project it belongs to. The build process of any of the other projects (e.g. project dependencies) shall be unaffected by this configuration.

A task may require certain tasks to be executed before and after it. This shall be configurable in a simple but less generic way. See [RFC 0001](https://github.com/UI5/cli/pull/4) for a concept of a more generic handling.

A project configuration might look like this:
```yaml
specVersion: "0.1"
type: library
metadata:
    name: my.library
builder:
    customTasks:
    - name: babel
      beforeTask: generateComponentPreload
    - name: generateMarkdownFiles
      afterTask: uglify
      configuration:
        color: blue
```

When building "my.library", this will execute the custom task *babel* before the "standard" task *generateComponentPreload* and *generateMarkdownFiles* after *uglify*. This means that for example *generateComponentPreload* and all following tasks can work with the resources created or modified by the *babel* task.

### Generic handling of extension
**This section is partially equal to what is outlined in [RFC 0001](https://github.com/UI5/cli/blob/rfc-type-ext/rfcs/0001-type-extensibility.md#generic-handling-of-extension).**

Custom task implementations have similar characteristics than other possible "extensions" of the UI5 CLI. Examples for other extensions include "Shims" (see RFC 0002), server middlewares and translators.

Therefore a somewhat generic concept for dealing with extensions is needed.

To separate "UI5 Projects" (i.e. things that represent UI5-artifacts for the browser) from UI5 CLI specific things like "extensions", an additional attribute "kind" is added to the ui5.yaml.

A custom task (a.k.a. "task extension") will consist of at least a ui5.yaml defining it as an extension and a JavaScript implementation.

#### Example task extension
**`ui5.yaml`**:
```yaml
specVersion: "0.1"
kind: extension
type: task
metadata:
    name: generateMarkdownFiles
task:
    path: lib/tasks/generateMarkdownFiles.js
```

**`lib/tasks/generateMarkdownFiles.js`**:
```js
const markdownGenerator = require("./markdownGenerator");

module.exports = function({workspace, options}) {
    return workspace.byGlob("**/*.txt")
        .then((textResources) => {
            return markdownGenerator({
                resources: textResources
            });
        })
        .then((markdownResources) => {
            return Promise.all(markdownResources.map((resource) => {
                return workspace.write(resource);
            }));
        });
};
```

#### Collecting and applying task extensions
A task extension might be a standalone module or part of a project.

If the extension is part of a project, the single `ui5.yaml` for the above example might look like this:

```yaml
specVersion: "0.1"
kind: project
type: library
metadata:
    name: my.library
builder:
    customTasks:
    - name: generateMarkdownFiles
      afterTask: uglify
      configuration:
        color: blue
---
specVersion: "0.1"
kind: extension
type: task
metadata:
    name: generateMarkdownFiles
task:
    path: lib/tasks/generateMarkdownFiles.js
```

In this case the extension is no dependency of any kind but automatically collected and processed with the processing of the project.

The AbstractBuilder will detect the custom task configuration of the project my.library and inject the tasks into the build execution.


### Task implementation
A custom task implementation needs to return a function with the following signature (written in JSDoc):

```js
/**
 * Custom task example
 *
 * @param {Object} parameters Parameters
 * @param {DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {AbstractReader} parameters.dependencies Reader or Collection to read dependency files
 * @param {Object} parameters.options Options
 * @param {string} parameters.options.projectName Project name
 * @param {string} [parameters.options.configuration] Task configuration if given in ui5.yaml
 * @returns {Promise<undefined>} Promise resolving with undefined once data has been written
 */
module.exports = function({workspace, options}) {
    // [...]
};
```

## How we teach this
- Documentation about how to implement custom tasks
- Explanation of the task/processor concept

## Drawbacks
Custom task configurations might break with future changes to the Application- and LibraryBuilder due to renaming or reordering of the standard tasks.

## Alternatives
There are ways to consume (and thereby possibly adapt) UI5 CLI through its API via taskrunners such as grunt or gulp, or using a custom node.js script. But this offers only limited possibilities, especially when it comes to building transient dependencies.

[RFC 0001](https://github.com/UI5/cli/pull/4) may offer a more generic way to tackle this but requires additional concept and evaluation work. This RFC (0004) should not prevent the implementation of RFC 0001 in the future.

## Unresolved questions
- Detailed task signature
    + Should the whole `project` object be handed over to custom tasks?

