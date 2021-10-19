# Changelog
All notable changes to this project will be documented in this file.  
This project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

A list of unreleased changes can be found [here](https://github.com/SAP/ui5-project/compare/v2.6.0...HEAD).

<a name="v2.6.0"></a>
## [v2.6.0] - 2021-10-19
### Bug Fixes
- **ui5Framework:** Skip processing of framework libs ([#424](https://github.com/SAP/ui5-project/issues/424)) [`539d953`](https://github.com/SAP/ui5-project/commit/539d9539a5d2aaa6d01c4f539e3c86d8269788f2)

### Features
- specVersion 2.6 [`9bd921a`](https://github.com/SAP/ui5-project/commit/9bd921a05bd5c0d8b6c6d94a864e60e4e181ad63)


<a name="v2.5.0"></a>
## [v2.5.0] - 2021-07-23
### Features
- specVersion 2.5 [`3008dac`](https://github.com/SAP/ui5-project/commit/3008dace09109ba0fac49f0ddfc79255038f192c)


<a name="v2.4.0"></a>
## [v2.4.0] - 2021-06-01
### Features
- specVersion 2.4 [`69ffc6c`](https://github.com/SAP/ui5-project/commit/69ffc6c34e387bcaaaf7b703559181b78fd33d54)


<a name="v2.3.1"></a>
## [v2.3.1] - 2021-03-04
### Bug Fixes
- **ui5Framework:** Don't access metadata of deduped projects [`0255f8f`](https://github.com/SAP/ui5-project/commit/0255f8f628281ecb3cbbdb50192d2d4721bccea2)

### Dependency Updates
- Bump js-yaml from 3.14.1 to 4.0.0 ([#380](https://github.com/SAP/ui5-project/issues/380)) [`a862186`](https://github.com/SAP/ui5-project/commit/a86218657703a5b607ebd09f8f71dd7ea810c6be)


<a name="v2.3.0"></a>
## [v2.3.0] - 2021-02-09
### Features
- specVersion 2.3 ([#388](https://github.com/SAP/ui5-project/issues/388)) [`3e28026`](https://github.com/SAP/ui5-project/commit/3e280267b60a9a72183d5ab0905d838b6fcfaf33)


<a name="v2.2.6"></a>
## [v2.2.6] - 2021-01-28
### Bug Fixes
- **ui5Framework.Installer:** Ensure target directory does not exist before rename ([#390](https://github.com/SAP/ui5-project/issues/390)) [`f107cdf`](https://github.com/SAP/ui5-project/commit/f107cdf2b1703791c153009150a5e1713e123b73)


<a name="v2.2.5"></a>
## [v2.2.5] - 2021-01-26
### Bug Fixes
- **ui5Framework.Installer:** Ensure atomic install process [`72568a9`](https://github.com/SAP/ui5-project/commit/72568a990620cee69ffaf2470c684a7ba02c200c)


<a name="v2.2.4"></a>
## [v2.2.4] - 2020-11-06
### Performance Improvements
- Reduce install size by removing 'string.prototype.matchall' dependency [`b69d75e`](https://github.com/SAP/ui5-project/commit/b69d75e740bfc594668ea73273bb03fdd40a4ce2)
- **validator:** Lazy load dependencies [`609346b`](https://github.com/SAP/ui5-project/commit/609346b2b1bb0417fde36a35ec43e9970c68504f)


<a name="v2.2.3"></a>
## [v2.2.3] - 2020-10-22
### Bug Fixes
- **Schema:** Add missing bundle section "name" [`ba2d601`](https://github.com/SAP/ui5-project/commit/ba2d6015b6a04af92edb8f1b779a229fe73b705a)


<a name="v2.2.2"></a>
## [v2.2.2] - 2020-09-15
### Bug Fixes
- **ui5Framework.mergeTrees:** Do not abort merge if a project has already been processed [`264c353`](https://github.com/SAP/ui5-project/commit/264c353b6973bade57164aded4f10a668986482d)


<a name="v2.2.1"></a>
## [v2.2.1] - 2020-09-02

<a name="v2.2.0"></a>
## [v2.2.0] - 2020-08-11
### Features
- specVersion 2.2 ([#341](https://github.com/SAP/ui5-project/issues/341)) [`f44d14e`](https://github.com/SAP/ui5-project/commit/f44d14e136a4163d59dd8fd8c0be0ea2b59930be)


<a name="v2.1.5"></a>
## [v2.1.5] - 2020-07-14
### Bug Fixes
- **Node.js API:** TypeScript type definition support ([#335](https://github.com/SAP/ui5-project/issues/335)) [`c610305`](https://github.com/SAP/ui5-project/commit/c610305e8fb869461a8dd5ba876270c7f7b71a22)


<a name="v2.1.4"></a>
## [v2.1.4] - 2020-05-29
### Bug Fixes
- **ui5Framework:** Allow providing exact prerelease versions ([#326](https://github.com/SAP/ui5-project/issues/326)) [`6ce985c`](https://github.com/SAP/ui5-project/commit/6ce985c8feab26e6a97ca4570b3931f507773666)


<a name="v2.1.3"></a>
## [v2.1.3] - 2020-05-14

<a name="v2.1.2"></a>
## [v2.1.2] - 2020-05-11
### Bug Fixes
- **framework t8r:** Allow use of specVersion 2.1 [`961847d`](https://github.com/SAP/ui5-project/commit/961847d113e6f594526201ab9ecccb898d2497e2)


<a name="v2.1.1"></a>
## [v2.1.1] - 2020-05-11
### Bug Fixes
- Allow the use of specVersion 2.1 for projects [`a42172f`](https://github.com/SAP/ui5-project/commit/a42172fc341666b8d9a9b6049c365b28c55c76f0)


<a name="v2.1.0"></a>
## [v2.1.0] - 2020-05-05
### Features
- **specVersion 2.1:** Add support for "customConfiguration" ([#308](https://github.com/SAP/ui5-project/issues/308)) [`201aaab`](https://github.com/SAP/ui5-project/commit/201aaab6beb8ad86fefdf371ae20c971970f6547)


<a name="v2.0.4"></a>
## [v2.0.4] - 2020-04-30
### Bug Fixes
- Workaround missing dependency info for OpenUI5 packages in version 1.77.x [`3dfb812`](https://github.com/SAP/ui5-project/commit/3dfb8126e347fd1e7f6cc87e20318298e19eaf70)
- Namespaces in API Reference (JSDoc) [`3174d9f`](https://github.com/SAP/ui5-project/commit/3174d9f21f471252d2a39b8cb085eeeb5debe0a6)


<a name="v2.0.3"></a>
## [v2.0.3] - 2020-04-02
### Bug Fixes
- **Schema:** Add missing metadata properties [`16894e1`](https://github.com/SAP/ui5-project/commit/16894e11c5c21a77a405431dfaf5d8642accfc1d)
- **package.json:** Downgrade pacote from 11.1.4 to 9.5.12 [`c76fb49`](https://github.com/SAP/ui5-project/commit/c76fb49e64b5905a3cd592d94fc0076cecc909b5)


<a name="v2.0.2"></a>
## [v2.0.2] - 2020-04-01
### Bug Fixes
- **ui5Framework t8r:** Resolve versionOverride string [`4fffabe`](https://github.com/SAP/ui5-project/commit/4fffabe2a417b1ea46a47546c6269ac0ffbc3931)


<a name="v2.0.1"></a>
## [v2.0.1] - 2020-04-01
### Bug Fixes
- **ui5Framework.mergeTrees:** Do not process the same project multiple times [`1377ec2`](https://github.com/SAP/ui5-project/commit/1377ec2ecea71a2470a9ea9b1e0698e466154838)


<a name="v2.0.0"></a>
## [v2.0.0] - 2020-03-31
### Breaking Changes
- Require Node.js >= 10 [`f21e704`](https://github.com/SAP/ui5-project/commit/f21e704f85297e3fa774c59bf5d4e8282b947b41)

### Features
- Add Configuration Schema ([#274](https://github.com/SAP/ui5-project/issues/274)) [`eb961c3`](https://github.com/SAP/ui5-project/commit/eb961c3377d42d3c93f7b7db5033f4e6716ddc71)
- Support for spec version 2.0 ([#277](https://github.com/SAP/ui5-project/issues/277)) [`770a56f`](https://github.com/SAP/ui5-project/commit/770a56feed331a3157c9f9fad486a4674dc12c87)
- Add ui5Framework translator and resolvers ([#265](https://github.com/SAP/ui5-project/issues/265)) [`5183e5c`](https://github.com/SAP/ui5-project/commit/5183e5cf99ac8cae6e4ccc8030d94214bce0563c)
- **projectPreprocessor:** Log warning when using a deprecated or restricted dependency ([#268](https://github.com/SAP/ui5-project/issues/268)) [`b776a4f`](https://github.com/SAP/ui5-project/commit/b776a4fcc4604f3ecb0d3fc1e6418ed190c11756)

### BREAKING CHANGE

Support for older Node.js releases has been dropped.
Only Node.js v10 or higher is supported.


<a name="v1.2.0"></a>
## [v1.2.0] - 2020-01-13
### Features
- Add specification version 1.1 ([#252](https://github.com/SAP/ui5-project/issues/252)) [`5a83308`](https://github.com/SAP/ui5-project/commit/5a833086ccd415c5557c2bc3bbb705c18ac54314)


<a name="v1.1.1"></a>
## [v1.1.1] - 2019-11-07

<a name="v1.1.0"></a>
## [v1.1.0] - 2019-07-11
### Features
- **projectPreprocessor:** Add handling for server-middleware extensions [`2ce964c`](https://github.com/SAP/ui5-project/commit/2ce964cd9feb6c1da39cd783ad45e0030c46b81a)


<a name="v1.0.3"></a>
## [v1.0.3] - 2019-06-25
### Bug Fixes
- **projectPreprocessor:** Do not remove already removed dependencies ([#189](https://github.com/SAP/ui5-project/issues/189)) [`4600d63`](https://github.com/SAP/ui5-project/commit/4600d63cf323d3e143072c6c3416b5a48e90bb71)


<a name="v1.0.2"></a>
## [v1.0.2] - 2019-04-12
### Bug Fixes
- **ProjectPreprocessor:** Fix dependency resolution [`0671a8b`](https://github.com/SAP/ui5-project/commit/0671a8bf2de9ca24823df6f041a77e7c8e46f6f0)

### Dependency Updates
- Bump [@ui5](https://github.com/ui5)/builder from 1.0.2 to 1.0.3 ([#154](https://github.com/SAP/ui5-project/issues/154)) [`cf86764`](https://github.com/SAP/ui5-project/commit/cf867643b8b621019a5d5b0f5d3117ebcdd1cd44)


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


[v2.6.0]: https://github.com/SAP/ui5-project/compare/v2.5.0...v2.6.0
[v2.5.0]: https://github.com/SAP/ui5-project/compare/v2.4.0...v2.5.0
[v2.4.0]: https://github.com/SAP/ui5-project/compare/v2.3.1...v2.4.0
[v2.3.1]: https://github.com/SAP/ui5-project/compare/v2.3.0...v2.3.1
[v2.3.0]: https://github.com/SAP/ui5-project/compare/v2.2.6...v2.3.0
[v2.2.6]: https://github.com/SAP/ui5-project/compare/v2.2.5...v2.2.6
[v2.2.5]: https://github.com/SAP/ui5-project/compare/v2.2.4...v2.2.5
[v2.2.4]: https://github.com/SAP/ui5-project/compare/v2.2.3...v2.2.4
[v2.2.3]: https://github.com/SAP/ui5-project/compare/v2.2.2...v2.2.3
[v2.2.2]: https://github.com/SAP/ui5-project/compare/v2.2.1...v2.2.2
[v2.2.1]: https://github.com/SAP/ui5-project/compare/v2.2.0...v2.2.1
[v2.2.0]: https://github.com/SAP/ui5-project/compare/v2.1.5...v2.2.0
[v2.1.5]: https://github.com/SAP/ui5-project/compare/v2.1.4...v2.1.5
[v2.1.4]: https://github.com/SAP/ui5-project/compare/v2.1.3...v2.1.4
[v2.1.3]: https://github.com/SAP/ui5-project/compare/v2.1.2...v2.1.3
[v2.1.2]: https://github.com/SAP/ui5-project/compare/v2.1.1...v2.1.2
[v2.1.1]: https://github.com/SAP/ui5-project/compare/v2.1.0...v2.1.1
[v2.1.0]: https://github.com/SAP/ui5-project/compare/v2.0.4...v2.1.0
[v2.0.4]: https://github.com/SAP/ui5-project/compare/v2.0.3...v2.0.4
[v2.0.3]: https://github.com/SAP/ui5-project/compare/v2.0.2...v2.0.3
[v2.0.2]: https://github.com/SAP/ui5-project/compare/v2.0.1...v2.0.2
[v2.0.1]: https://github.com/SAP/ui5-project/compare/v2.0.0...v2.0.1
[v2.0.0]: https://github.com/SAP/ui5-project/compare/v1.2.0...v2.0.0
[v1.2.0]: https://github.com/SAP/ui5-project/compare/v1.1.1...v1.2.0
[v1.1.1]: https://github.com/SAP/ui5-project/compare/v1.1.0...v1.1.1
[v1.1.0]: https://github.com/SAP/ui5-project/compare/v1.0.3...v1.1.0
[v1.0.3]: https://github.com/SAP/ui5-project/compare/v1.0.2...v1.0.3
[v1.0.2]: https://github.com/SAP/ui5-project/compare/v1.0.1...v1.0.2
[v1.0.1]: https://github.com/SAP/ui5-project/compare/v1.0.0...v1.0.1
[v1.0.0]: https://github.com/SAP/ui5-project/compare/v0.2.5...v1.0.0
[v0.2.5]: https://github.com/SAP/ui5-project/compare/v0.2.4...v0.2.5
[v0.2.4]: https://github.com/SAP/ui5-project/compare/v0.2.3...v0.2.4
[v0.2.3]: https://github.com/SAP/ui5-project/compare/v0.2.2...v0.2.3
[v0.2.2]: https://github.com/SAP/ui5-project/compare/v0.2.1...v0.2.2
[v0.2.1]: https://github.com/SAP/ui5-project/compare/v0.2.0...v0.2.1
[v0.2.0]: https://github.com/SAP/ui5-project/compare/v0.1.0...v0.2.0
[v0.1.0]: https://github.com/SAP/ui5-project/compare/v0.0.1...v0.1.0
