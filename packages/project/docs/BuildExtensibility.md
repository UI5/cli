![UI5 icon](https://raw.githubusercontent.com/SAP/ui5-tooling/master/docs/images/UI5_logo_wide.png)

# UI5 Build Extensibility

The UI5 Build Extensibility enables a developer to enhance the build process of any UI5 project. In addition to the [standard task list](https://github.com/SAP/ui5-builder/blob/master/README.md#tasks), custom tasks can be created.

## Configuration of the Custom Build Process

You can configure your build process with additional build task. The custom tasks can be defined in the project [configuration](https://github.com/SAP/ui5-project/blob/master/README.md#configuration) within the `ui5.yaml` file.

In the below example, when building the library `my.library` the `babel` task will be executed before the standard task `generateComponentPreload`. Another custom task called `generateMarkdownFiles` is then executed immediatly after the standard task `uglify`.

### Example: Configuration of project 'my.library'

````yaml
---
# In this example configuration two custom tasks are defined: 'babel' and 'generateMarkdownFiles'.
specVersion: "1.0"
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
````

### Example: Connect multiple custom tasks

You can also connect multiple custom task with each other. Please be aware that the order of your definitions is important. You have to make sure that the task is defined before you reference it as `beforeTask` or `afterTask`.

````yaml
---
# In this example 'myCustomTask2' gets executed after 'myCustomTask1'.
specVersion: "1.0"
type: library
metadata:
  name: my.library
builder:
  customTasks:
    - name: myCustomTask1
      beforeTask: generateComponentPreload
    - name: myCustomTask2
      afterTask: myCustomTask1
````

## Custom Task Extension

A custom task extension consists of a `ui5.yaml` and a [task implementation](#task-implementation). It can be a standalone module or part of an existing UI5 project.

### Example: ui5.yaml

````yaml
---
specVersion: "1.0"
kind: extension
type: task
metadata:
  name: generateMarkdownFiles
task:
  path: lib/tasks/generateMarkdownFiles.js
````

Task extensions can be **standalone modules** which are handled as dependencies.

On the other hand you can implement a task extension as **part of your UI5 project**. In that case, the configuration of the extension is part of your project configuration inside the `ui5.yaml` as shown below.

The task extension will then be automatically collected and processed during the processing of the project.

### Example: Custom Task Extension defined in UI5 project

````yaml
# ui5.yaml configuration for the above example

specVersion: "1.0"
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
# Task extension as part of your project
specVersion: "1.0"
kind: extension
type: task
metadata:
  name: generateMarkdownFiles
task:
  path: lib/tasks/generateMarkdownFiles.js
````

## Task Implementation

A custom task implementation needs to return a function with the following signature:

````javascript
/**
 * Custom task example
 *
 * @param {Object} parameters Parameters
 * @param {module:@ui5/fs.DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {module:@ui5/fs.AbstractReader} parameters.dependencies Reader or Collection to read dependency files
 * @param {Object} parameters.options Options
 * @param {string} parameters.options.projectName Project name
 * @param {string} [parameters.options.configuration] Task configuration if given in ui5.yaml
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
module.exports = async function({workspace, dependencies, options}) {
	// [...]
};
````

The following code snippets shows an example how a task implementation could look like:

### Example: lib/tasks/generateMarkdownFiles.js

````javascript
// Task implementation
const markdownGenerator = require("./markdownGenerator");

module.exports = async function({workspace, dependencies, options}) {
	const textResources = await workspace.byGlob("**/*.txt");
	const markdownResources = await markdownGenerator({
		resources: textResources
	});
	await Promise.all(markdownResources.map((resource) => {
		return workspace.write(resource);
	}));
};
````
