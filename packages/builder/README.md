![UI5 icon](https://raw.githubusercontent.com/SAP/ui5-tooling/master/docs/images/UI5_logo_wide.png)

# ui5-builder
> Modules for building UI5 projects  
> Part of the [UI5 Build and Development Tooling](https://github.com/SAP/ui5-tooling)

[![Travis CI Build Status](https://travis-ci.org/SAP/ui5-builder.svg?branch=master)](https://travis-ci.org/SAP/ui5-builder)
[![npm Package Version](https://badge.fury.io/js/%40ui5%2Fbuilder.svg)](https://www.npmjs.com/package/@ui5/builder)
[![Coverage Status](https://coveralls.io/repos/github/SAP/ui5-builder/badge.svg)](https://coveralls.io/github/SAP/ui5-builder)
[![Greenkeeper badge](https://badges.greenkeeper.io/SAP/ui5-builder.svg)](https://greenkeeper.io/)
[![Dependency Status](https://david-dm.org/SAP/ui5-builder/master.svg)](https://david-dm.org/SAP/ui5-builder/master)
[![devDependency Status](https://david-dm.org/SAP/ui5-builder/master/dev-status.svg)](https://david-dm.org/SAP/ui5-builder/master#info=devDependencies)

**This is an alpha release!**  
**The UI5 Build and Development Tooling described here is not intended for productive use yet. Breaking changes are to be expected.**

## Builder
### Types
Types define how a project can be configured and how it is being built. A type orchestrates a set of tasks and defines the order in which they get applied during build phase. Furthermore, it takes care of formatting and validating the project specific configuration.

Currently, the following types are defined:

* Application
* Library

The project type can be defined as part of a projects root folder.

### Tasks
Tasks are specific build steps to be executed during build phase.

They are responsible for collecting resources which can be modified by a processor. A task configures one or more processors and supplies them with the collected resources. After the respective processor processed the resources, the task is able to continue with its workflow.

Available tasks are listed [here](lib/tasks).

### Processors
Processors work with provided resources. They contain the actual build step logic to apply specific modifications to supplied resources or to make use of the resources' content to create new resources out of that.

Processors can be implemented generically. The string replacer is an example for that.
Since string replacement is a common build step, it can be useful in different contexts, e.g. code, version, date and copyright replacement. A concrete replacement operation could be achieved by passing a custom configuration to the processor. This way multiple tasks can make use of the same processor to achive their build step.

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
