![UI5 logo](https://github.com/SAP/ui5-tooling/blob/master/docs/images/UI5_logo_wide.png)

# ui5-fs
> UI5 specific file system abstraction  
> Part of the [UI5 Build and Development Tooling](https://github.com/SAP/ui5-tooling)

[![Travis CI Build Status](https://travis-ci.org/SAP/ui5-fs.svg?branch=master)](https://travis-ci.org/SAP/ui5-fs)

**This is a Pre-Alpha release!**  
**The UI5 Build and Development Tooling described here is not intended for productive use yet. Breaking changes are to be expected.**

## Resources
During build phase a modified resource gets kept in memory for further processing in other build steps.

This ensures performance, as physical read and write access for a high number of resources gets kept to a minimum.

The virtual file system offers an abstraction layer from the physical file system. Among others it can combine a bunch of scattered file locations into a well defined, virtualized structure.

### Adapters
Adapers abstract resource access to different resource locations.

The [memory adapter] (lib/resources/adapters/Memory.js) represents a virtual filesystem which maintains respective resources inside a data structure, whereas the [file system adapter] (lib/resources/adapters/FileSystem.js) has direct access to the physical filesytem.

### Resource Readers
Maps virtual to physical paths.

### Collections
Multiple resource readers can be bundled to a collection. There are multiple types of Collections which differ in their capability of having read or write access and in the order of how they obtain resources.

#### Collection
The Collection has only read access.

The collection takes a list of readers.
Those readers get accessed in parallel where the reader which returns the resource first, gets used.

#### Prioritized Collection
The Prioritized Collection has only read access.

The collection takes a list of readers.
Those readers get accessed prioritized in the same order as they got passed to the collection.

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
