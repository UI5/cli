![UI5 icon](https://raw.githubusercontent.com/SAP/ui5-tooling/master/docs/images/UI5_logo_wide.png)

# ui5-fs
> UI5 specific file system abstraction  
> Part of the [UI5 Tooling](https://github.com/SAP/ui5-tooling)

[![Travis CI Build Status](https://travis-ci.org/SAP/ui5-fs.svg?branch=master)](https://travis-ci.org/SAP/ui5-fs)
[![npm Package Version](https://badge.fury.io/js/%40ui5%2Ffs.svg)](https://www.npmjs.com/package/@ui5/fs)
[![Coverage Status](https://coveralls.io/repos/github/SAP/ui5-fs/badge.svg)](https://coveralls.io/github/SAP/ui5-fs)
[![Dependency Status](https://david-dm.org/SAP/ui5-fs/master.svg)](https://david-dm.org/SAP/ui5-fs/master)
[![devDependency Status](https://david-dm.org/SAP/ui5-fs/master/dev-status.svg)](https://david-dm.org/SAP/ui5-fs/master#info=devDependencies)

**⌨️ CLI reference can be found [here!](https://github.com/SAP/ui5-cli#cli-usage)**

## Resources
During the build phase, a modified resource is kept in memory for further processing in other build steps.

This ensures performance, as physical read and write access for a high number of resources are kept to a minimum.

The virtual file system offers an abstraction layer from the physical file system. Amongst others, it can combine a bunch of scattered file locations into a well defined, virtualized structure.

### Adapters
Adapers abstract resource access to different resource locations.

The [memory adapter](lib/resources/adapters/Memory.js) represents a virtual file system, which maintains respective resources inside a data structure, whereas the [file system adapter](lib/resources/adapters/FileSystem.js) has direct access to the physical file sytem.

### Resource Readers
Maps virtual to physical paths.

### Collections
Multiple resource readers can be bundled to a collection. There are multiple types of collections which differ in their capability of having read or write access and in the order of how they obtain resources.

#### Collection
The collection has only read access.

The collection takes a list of readers. Readers are accessed in parallel: the reader which returns the resource first is used.

#### Prioritized Collection
The prioritized collection has only read access.

The collection takes a list of readers.
The readers are accessed prioritized in the same order as they are passed to the collection.

#### Duplex Collection
The duplex collection has read and write access.

The collection takes a single reader or collection of readers and a writer instance for writing results.

## Contributing
Please check our [Contribution Guidelines](https://github.com/SAP/ui5-tooling/blob/master/CONTRIBUTING.md).

## Support
Please follow our [Contribution Guidelines](https://github.com/SAP/ui5-tooling/blob/master/CONTRIBUTING.md#report-an-issue) on how to report an issue.

## Release History
See [CHANGELOG.md](CHANGELOG.md).

## License
This project is licensed under the Apache Software License, Version 2.0 except as noted otherwise in the [LICENSE](/LICENSE.txt) file.
