# Changelog
All notable changes to this project will be documented in this file.  
This project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

A list of unreleased changes can be found [here](https://github.com/SAP/ui5-fs/compare/v2.0.6...HEAD).

<a name="v2.0.6"></a>
## [v2.0.6] - 2020-12-17
### Bug Fixes
- **fsInterface on Windows:** Correctly handle project paths containing non-ASCII characters [`6bb44be`](https://github.com/SAP/ui5-fs/commit/6bb44be7c13f6b5c66855d3343694f42f9bdfe0e)


<a name="v2.0.5"></a>
## [v2.0.5] - 2020-11-06
### Performance Improvements
- Reduce install size by moving 'mock-require' to devDependencies [`173f4ff`](https://github.com/SAP/ui5-fs/commit/173f4ffc55f0e264025c6e2bce12721a6673790a)


<a name="v2.0.4"></a>
## [v2.0.4] - 2020-10-22
### Bug Fixes
- **fsInterface:** Improve error messages [`8b998f8`](https://github.com/SAP/ui5-fs/commit/8b998f8a47e89bce0c27f5a4b211bb5471ea2381)


<a name="v2.0.3"></a>
## [v2.0.3] - 2020-08-12
### Bug Fixes
- **ResourceTagCollection:** Do not validate class of resource [`c52c9f7`](https://github.com/SAP/ui5-fs/commit/c52c9f71e4f868cfa8ae5daf5eede9272654b187)


<a name="v2.0.2"></a>
## [v2.0.2] - 2020-07-30
### Bug Fixes
- TypeScript type definition support ([#252](https://github.com/SAP/ui5-fs/issues/252)) [`f379094`](https://github.com/SAP/ui5-fs/commit/f37909483b2740219da36c7e0931f7824d51e1a3)
- **Resource:** Keep stats size up to date ([#253](https://github.com/SAP/ui5-fs/issues/253)) [`0ef976f`](https://github.com/SAP/ui5-fs/commit/0ef976fe658765ae46afd1b4aa5b9100aa9829f8)
- **Resource:** getStream for empty string ([#249](https://github.com/SAP/ui5-fs/issues/249)) [`bc5eafb`](https://github.com/SAP/ui5-fs/commit/bc5eafb19bf71141b88dff749240354898849a66)
- **Resource#getSize:** Retrieve Resource's size ([#256](https://github.com/SAP/ui5-fs/issues/256)) [`9d2cc6c`](https://github.com/SAP/ui5-fs/commit/9d2cc6cf92b4a3f29e5c42db2f14afeeac9a0c98)
- **adapters/Memory:** Return cloned resources ([#235](https://github.com/SAP/ui5-fs/issues/235)) [`7bf3c6a`](https://github.com/SAP/ui5-fs/commit/7bf3c6a2ce55cd1c48b8aaaed83591bd85c228fa)

### Reverts
- [FIX] adapters/Memory: Return cloned resources ([#235](https://github.com/SAP/ui5-fs/issues/235))


<a name="v2.0.1"></a>
## [v2.0.1] - 2020-04-30
### Bug Fixes
- Namespaces in API Reference (JSDoc) [`b9d7b3c`](https://github.com/SAP/ui5-fs/commit/b9d7b3c70679436e6cbea07a789ac5e83bab337a)


<a name="v2.0.0"></a>
## [v2.0.0] - 2020-03-31
### Breaking Changes
- Remove deprecated parameter useNamespaces ([#223](https://github.com/SAP/ui5-fs/issues/223)) [`231b319`](https://github.com/SAP/ui5-fs/commit/231b319ea1899d6297e70e7b7746340cd5824217)
- Require Node.js >= 10 [`46651f1`](https://github.com/SAP/ui5-fs/commit/46651f13bcfe391ef985fabab96f99b6ecafe13e)

### Dependency Updates
- Bump globby from 10.0.2 to 11.0.0 ([#207](https://github.com/SAP/ui5-fs/issues/207)) [`c81eb9d`](https://github.com/SAP/ui5-fs/commit/c81eb9dffc0d1281640efb2ad7e5419fe5451442)

### BREAKING CHANGE

Remove deprecated parameter "useNamespaces" from
method "resourceFactory.createCollectionsForTree".
Use parameter "getVirtualBasePathPrefix" instead.

Support for older Node.js releases has been dropped.
Only Node.js v10 or higher is supported.


<a name="v1.1.2"></a>
## [v1.1.2] - 2019-07-01
### Dependency Updates
- Bump globby from 9.2.0 to 10.0.0 [`573e853`](https://github.com/SAP/ui5-fs/commit/573e8531827bf1c0320177d3870e37a183db7959)


<a name="v1.1.1"></a>
## [v1.1.1] - 2019-06-18
### Bug Fixes
- **fsInterface:** Handle non-POSIX paths correctly ([#147](https://github.com/SAP/ui5-fs/issues/147)) [`1ad0cc8`](https://github.com/SAP/ui5-fs/commit/1ad0cc8fdbcf74452ebfcebb23bd659faa956e54)


<a name="v1.1.0"></a>
## [v1.1.0] - 2019-06-03
### Features
- **AbstractAdapter:** Add excludes option ([#140](https://github.com/SAP/ui5-fs/issues/140)) [`daef31f`](https://github.com/SAP/ui5-fs/commit/daef31f4fb22405e8fa889615b1f3545099eb186)


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


[v2.0.6]: https://github.com/SAP/ui5-fs/compare/v2.0.5...v2.0.6
[v2.0.5]: https://github.com/SAP/ui5-fs/compare/v2.0.4...v2.0.5
[v2.0.4]: https://github.com/SAP/ui5-fs/compare/v2.0.3...v2.0.4
[v2.0.3]: https://github.com/SAP/ui5-fs/compare/v2.0.2...v2.0.3
[v2.0.2]: https://github.com/SAP/ui5-fs/compare/v2.0.1...v2.0.2
[v2.0.1]: https://github.com/SAP/ui5-fs/compare/v2.0.0...v2.0.1
[v2.0.0]: https://github.com/SAP/ui5-fs/compare/v1.1.2...v2.0.0
[v1.1.2]: https://github.com/SAP/ui5-fs/compare/v1.1.1...v1.1.2
[v1.1.1]: https://github.com/SAP/ui5-fs/compare/v1.1.0...v1.1.1
[v1.1.0]: https://github.com/SAP/ui5-fs/compare/v1.0.2...v1.1.0
[v1.0.2]: https://github.com/SAP/ui5-fs/compare/v1.0.1...v1.0.2
[v1.0.1]: https://github.com/SAP/ui5-fs/compare/v1.0.0...v1.0.1
[v1.0.0]: https://github.com/SAP/ui5-fs/compare/v0.2.0...v1.0.0
[v0.2.0]: https://github.com/SAP/ui5-fs/compare/v0.1.0...v0.2.0
[v0.1.0]: https://github.com/SAP/ui5-fs/compare/v0.0.1...v0.1.0
