![UI5 icon](https://raw.githubusercontent.com/SAP/ui5-tooling/master/docs/images/UI5_logo_wide.png)

# ui5-builder
> Modules for building UI5 projects  
> Part of the [UI5 Tooling](https://github.com/SAP/ui5-tooling)

[![Build Status](https://dev.azure.com/sap/opensource/_apis/build/status/SAP.ui5-builder?branchName=master)](https://dev.azure.com/sap/opensource/_build/latest?definitionId=26&branchName=master)
[![npm Package Version](https://badge.fury.io/js/%40ui5%2Fbuilder.svg)](https://www.npmjs.com/package/@ui5/builder)
[![Coverage Status](https://coveralls.io/repos/github/SAP/ui5-builder/badge.svg)](https://coveralls.io/github/SAP/ui5-builder)
[![Dependency Status](https://david-dm.org/SAP/ui5-builder/master.svg)](https://david-dm.org/SAP/ui5-builder/master)
[![devDependency Status](https://david-dm.org/SAP/ui5-builder/master/dev-status.svg)](https://david-dm.org/SAP/ui5-builder/master#info=devDependencies)

**⌨️ CLI reference can be found [here!](https://github.com/SAP/ui5-cli#cli-usage)**

## Builder
### Types
Types define how a project can be configured and how it is built. A type orchestrates a set of tasks and defines the order in which they get applied during build phase. Furthermore, it takes care of formatting and validating the project-specific configuration.

Also see [UI5 Project: Configuration](https://github.com/SAP/ui5-project/blob/master/docs/Configuration.md#root)

#### `application`
Projects of type `application` are typically the main or root project. In a projects dependency tree, there should only be one project of type `application`. If multiple are found, those further away from the root are ignored.

The source directory of an application (typically named `webapp`) is mapped to the virtual root path `/`.

An applications source directory may or may not contain a `Component.js` file. If it does, it must also contain a `manifest.json` file. If there is a `Component.js` file, an optimized `Component-preload.js` file will be generated during the build.

#### `library`
UI5 libraries are often referred to as reuse-, custom- or [control libraries](https://github.com/SAP/openui5/blob/master/docs/controllibraries.md). They are a key component in sharing code across multiple projects in UI5.

A project of type `library` must have a source directory (typically named `src`). It may also feature a "test" directory. These directories are mapped to the virtual directories `/resources` for the sources and `/test-resources` for the test resources. These directories should contain a directory structure representing the namespace of the library (e.g. `src/my/first/library`) to prevent name clashes between the resources of different libraries.

#### `module`
The `module` type is meant for usage with non-UI5 resources like third party libraries. Their path mapping can be configured freely. During a build, their resources are copied without modifications.

### Tasks
Tasks are specific build steps to be executed during build phase.

They are responsible for collecting resources which can be modified by a processor. A task configures one or more processors and supplies them with the collected resources. After the respective processor processed the resources, the task is able to continue with its workflow.

Available tasks are listed [here](lib/tasks).

### Processors
Processors work with provided resources. They contain the actual build step logic to apply specific modifications to supplied resources, or to make use of the resources' content to create new resources out of that.

Processors can be implemented generically. The string replacer is an example for that.
Since string replacement is a common build step, it can be useful in different contexts, e.g. code, version, date, and copyright replacement. A concrete replacement operation could be achieved by passing a custom configuration to the processor. This way, multiple tasks can make use of the same processor to achieve their build step.

Available processors are listed [here](lib/processors).

### Legacy Bundle Tooling (lbt)
JavaScript port of the "legacy" Maven/Java based bundle tooling.

## Contributing
Please check our [Contribution Guidelines](https://github.com/SAP/ui5-tooling/blob/master/CONTRIBUTING.md).

## Support
Please follow our [Contribution Guidelines](https://github.com/SAP/ui5-tooling/blob/master/CONTRIBUTING.md#report-an-issue) on how to report an issue.

## Release History
See [CHANGELOG.md](CHANGELOG.md).

## License
This project is licensed under the Apache Software License, Version 2.0 except as noted otherwise in the [LICENSE](/LICENSE.txt) file.
