# Changelog
All notable changes to this project will be documented in this file.  
This project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

A list of unreleased changes can be found [here](https://github.com/SAP/ui5-project/compare/v1.0.1...HEAD).

<a name="v1.0.1"></a>
## [v1.0.1] - 2019-02-14
### Bug Fixes
- **npm translator:** Remove deduped optional dependencies from tree [`3481154`](https://github.com/SAP/ui5-project/commit/348115426f03bd3a5bb823ac54a6b15475a84657)

### Dependency Updates
- Bump [@ui5](https://github.com/ui5)/builder from 1.0.0 to 1.0.1 ([#113](https://github.com/SAP/ui5-project/issues/113)) [`96a3d6a`](https://github.com/SAP/ui5-project/commit/96a3d6a2a54cb1eab190ba89f9da686e8aae2d84)


<a name="v1.0.0"></a>
## [v1.0.0] - 2019-01-10
### Breaking Changes
- **normalizer:** Rename optional parameter "translator" [`92321e0`](https://github.com/SAP/ui5-project/commit/92321e08e43175611b8417047fc957792d539b10)

### Dependency Updates
- Bump [@ui5](https://github.com/ui5)/builder from 0.2.9 to 1.0.0 ([#99](https://github.com/SAP/ui5-project/issues/99)) [`7dd5d5c`](https://github.com/SAP/ui5-project/commit/7dd5d5cda909e3a109821315cc5a5a80f05cd5d3)
- Bump [@ui5](https://github.com/ui5)/logger from 0.2.2 to 1.0.0 ([#98](https://github.com/SAP/ui5-project/issues/98)) [`8068a76`](https://github.com/SAP/ui5-project/commit/8068a76dc43701f5c8b0467933a83d777ccdee01)

### Features
- Add specification version 1.0 [`b0c02f6`](https://github.com/SAP/ui5-project/commit/b0c02f67296f6251a7ef4fe5c61146bb169a6705)

### BREAKING CHANGE

Renamed parameter "translator" of functions generateDependencyTree and generateProjectTree to "translatorName"


<a name="v0.2.5"></a>
## [v0.2.5] - 2018-12-19
### Bug Fixes
- **npm translator:** Deduplicate subtrees of pending dependencies [`7e55ae3`](https://github.com/SAP/ui5-project/commit/7e55ae3d88280746f5800bffc7bbd13e1495ba07)
- **npm translator:** Fix handling of indirect dependency cycles [`c99d6d3`](https://github.com/SAP/ui5-project/commit/c99d6d3a19fbb6c197b449dfd6cb8acc48837dba)


<a name="v0.2.4"></a>
## [v0.2.4] - 2018-12-17
### Bug Fixes
- **npm t8r:** Add deduplication of npm dependencies [`2717088`](https://github.com/SAP/ui5-project/commit/2717088532d415b6922f290b58d9227b946a965f)
- **projectPreprocessor:** Ignore deduped modules [`84f7b25`](https://github.com/SAP/ui5-project/commit/84f7b25a9e45df3bc55a7957e4f61db580e68509)


<a name="v0.2.3"></a>
## [v0.2.3] - 2018-11-20
### Bug Fixes
- **npm t8r:** Again, handle npm optionalDependencies correctly [`9fd78dc`](https://github.com/SAP/ui5-project/commit/9fd78dca4d836f9a37036fd151a78e9295b28aa1)


<a name="v0.2.2"></a>
## [v0.2.2] - 2018-11-17
### Bug Fixes
- **npm t8r:** Handle npm optionalDependencies correctly [`da707d7`](https://github.com/SAP/ui5-project/commit/da707d73b5c75b489e2e499de2b4f54924018844)

### Features
- **projectPreprocessor:** Add handling for task extensions [`0722865`](https://github.com/SAP/ui5-project/commit/072286591ae3b20cca8e418030c3f2bc048352c5)
- **projectPreprocessor:** Allow application project dependency on non-root level [`b8a59d5`](https://github.com/SAP/ui5-project/commit/b8a59d56c8b5cf4c330fe99cb2162c1701aa51ca)


<a name="v0.2.1"></a>
## [v0.2.1] - 2018-10-29
### Features
- Add shim extension [`93c9b39`](https://github.com/SAP/ui5-project/commit/93c9b3960ca36f240c5f8453a89f72792a01fe92)
- Add "extension" projects [`476b785`](https://github.com/SAP/ui5-project/commit/476b785810d6993d2a3e21707ffa67e568e67eac)


<a name="v0.2.0"></a>
## [v0.2.0] - 2018-07-11

<a name="v0.1.0"></a>
## [v0.1.0] - 2018-06-26
### Bug Fixes
- Fix some typos in log messages ([#17](https://github.com/SAP/ui5-project/issues/17)) [`1f2f2fd`](https://github.com/SAP/ui5-project/commit/1f2f2fd164abaf449cc5e7d94ec792f469710207)
- **npm translator:** Fix endless loop in case of dependency cycles ([#15](https://github.com/SAP/ui5-project/issues/15)) [`cf31112`](https://github.com/SAP/ui5-project/commit/cf3111288278e8dd36a09b549bd2b254e86af041)


<a name="v0.0.1"></a>
## v0.0.1 - 2018-06-06
### Bug Fixes
- **npm t8r:** Fix collection fallback with missing package.json [`578466f`](https://github.com/SAP/ui5-project/commit/578466fdedf871091874c93d1a9305859e34e3ed)


[v1.0.1]: https://github.com/SAP/ui5-project/compare/v1.0.0...v1.0.1
[v1.0.0]: https://github.com/SAP/ui5-project/compare/v0.2.5...v1.0.0
[v0.2.5]: https://github.com/SAP/ui5-project/compare/v0.2.4...v0.2.5
[v0.2.4]: https://github.com/SAP/ui5-project/compare/v0.2.3...v0.2.4
[v0.2.3]: https://github.com/SAP/ui5-project/compare/v0.2.2...v0.2.3
[v0.2.2]: https://github.com/SAP/ui5-project/compare/v0.2.1...v0.2.2
[v0.2.1]: https://github.com/SAP/ui5-project/compare/v0.2.0...v0.2.1
[v0.2.0]: https://github.com/SAP/ui5-project/compare/v0.1.0...v0.2.0
[v0.1.0]: https://github.com/SAP/ui5-project/compare/v0.0.1...v0.1.0
