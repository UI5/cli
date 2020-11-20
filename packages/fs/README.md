![UI5 icon](https://raw.githubusercontent.com/SAP/ui5-tooling/master/docs/images/UI5_logo_wide.png)

# ui5-fs
> UI5 specific file system abstraction  
> Part of the [UI5 Tooling](https://github.com/SAP/ui5-tooling)

[![REUSE status](https://api.reuse.software/badge/github.com/SAP/ui5-fs)](https://api.reuse.software/info/github.com/SAP/ui5-fs)
[![Build Status](https://dev.azure.com/sap/opensource/_apis/build/status/SAP.ui5-fs?branchName=master)](https://dev.azure.com/sap/opensource/_build/latest?definitionId=36&branchName=master)
[![npm Package Version](https://badge.fury.io/js/%40ui5%2Ffs.svg)](https://www.npmjs.com/package/@ui5/fs)
[![Coverage Status](https://coveralls.io/repos/github/SAP/ui5-fs/badge.svg)](https://coveralls.io/github/SAP/ui5-fs)

## Documentation
General documentation can of the UI5 Tooling can be found here: [sap.github.io/ui5-tooling](https://sap.github.io/ui5-tooling/)

## UI5 FS
### Resources
During the build phase, a modified resource is kept in memory for further processing in other build steps.

This ensures performance, as physical read and write access for a high number of resources are kept to a minimum.

The virtual file system offers an abstraction layer from the physical file system. Amongst others, it can combine a bunch of scattered file locations into a well defined, virtualized structure.

### Adapters
Adapters abstract access to different resource locations.

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

Please report issues in the main [UI5 Tooling](https://github.com/SAP/ui5-tooling) repository.

## Release History
See [CHANGELOG.md](CHANGELOG.md).
