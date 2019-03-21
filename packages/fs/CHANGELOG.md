# Changelog
All notable changes to this project will be documented in this file.  
This project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

A list of unreleased changes can be found [here](https://github.com/SAP/ui5-fs/compare/v1.0.2...HEAD).

<a name="v1.0.2"></a>
## [v1.0.2] - 2019-03-21
### Dependency Updates
- Bump [@ui5](https://github.com/ui5)/logger from 1.0.0 to 1.0.1 ([#122](https://github.com/SAP/ui5-fs/issues/122)) [`e2e2791`](https://github.com/SAP/ui5-fs/commit/e2e27917d936ad5a316c56a0bc0a17d91977d15e)

### Features
- **fsInterface:** Add mkdir function [`5bd91ac`](https://github.com/SAP/ui5-fs/commit/5bd91acb86d64f03d16abdb186fe66ffa8a9f53a)


<a name="v1.0.1"></a>
## [v1.0.1] - 2019-02-01
### Bug Fixes
- Prevent FS write from draining Resources content [`370f121`](https://github.com/SAP/ui5-fs/commit/370f121ca4d571397c979e2dce72b6a1cf0d0005)

### Dependency Updates
- **Yarn:** Pin dir-glob dependency to v2.0.0 [`e14457c`](https://github.com/SAP/ui5-fs/commit/e14457c5b3eda1fab3d3444bca3b8406be63db2f)


<a name="v1.0.0"></a>
## [v1.0.0] - 2019-01-10
### Breaking Changes
- **index.js export:** Remove top-level access to adapters [`f1f7831`](https://github.com/SAP/ui5-fs/commit/f1f7831ae9e908731a57f9d67952a61431c69d21)

### Dependency Updates
- Pin dir-glob to v2.0.0 [`b921fbc`](https://github.com/SAP/ui5-fs/commit/b921fbceaa4f200737b8c6cf45eaf2d9bc3e1df2)
- Bump [@ui5](https://github.com/ui5)/logger from 0.2.2 to 1.0.0 ([#72](https://github.com/SAP/ui5-fs/issues/72)) [`4077f19`](https://github.com/SAP/ui5-fs/commit/4077f19251dee72933de0747de09a6eec5cb75cc)

### BREAKING CHANGE

Adapters "AbstractAdapter", "FileSystem" and "Memory" used to be accessible via the top-level export of index.js (example: require("[@ui5](https://github.com/ui5)/project").FileSystem). This is no longer possible. Adapters are now grouped in the top-level object "adapters" and can be accessed from there (example: require("[@ui5](https://github.com/ui5)/project").adapters.FileSystem).


<a name="v0.2.0"></a>
## [v0.2.0] - 2018-07-11

<a name="v0.1.0"></a>
## [v0.1.0] - 2018-06-26

<a name="v0.0.1"></a>
## v0.0.1 - 2018-06-06
### Bug Fixes
- **AbstractAdapter:** Fix normalization of globstar [`6d484e8`](https://github.com/SAP/ui5-fs/commit/6d484e847b62aa0829641f25a76dcc89b0840d44)


[v1.0.2]: https://github.com/SAP/ui5-fs/compare/v1.0.1...v1.0.2
[v1.0.1]: https://github.com/SAP/ui5-fs/compare/v1.0.0...v1.0.1
[v1.0.0]: https://github.com/SAP/ui5-fs/compare/v0.2.0...v1.0.0
[v0.2.0]: https://github.com/SAP/ui5-fs/compare/v0.1.0...v0.2.0
[v0.1.0]: https://github.com/SAP/ui5-fs/compare/v0.0.1...v0.1.0
