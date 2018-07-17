# Changelog
All notable changes to this project will be documented in this file.  
This project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

A list of unreleased changes can be found [here](https://github.com/SAP/ui5-builder/compare/v0.2.1...HEAD).

<a name="v0.2.1"></a>
## [v0.2.1] - 2018-07-17
### Bug Fixes
- **generateLibraryManifest:** i18n/css handling [`4e52a96`](https://github.com/SAP/ui5-builder/commit/4e52a9654b28a7646597ce0e0f010589ff7905d5)

### Internal Changes
- Add .npmrc to enforce public registry [`4826821`](https://github.com/SAP/ui5-builder/commit/482682131c344b29ef5587ca2db0365b43289239)
- **CHANGELOG:** Fix scope detection in commit messages [`7b78344`](https://github.com/SAP/ui5-builder/commit/7b78344d89b8aa29f6c967ca82f3be3f76cf7772)


<a name="v0.2.0"></a>
## [v0.2.0] - 2018-07-11
### Bug Fixes
- Close gaps in routing support of ComponentAnalyzer ([#46](https://github.com/SAP/ui5-builder/issues/46)) [`4697531`](https://github.com/SAP/ui5-builder/commit/4697531cbafebf881e78b80e78d098d1361fe9a5)

### Internal Changes
- Update min Node.js version to >=8.5 [`f00efd9`](https://github.com/SAP/ui5-builder/commit/f00efd9bf3c832ac3732e4c00d4a12d785928e87)
- Remove greenkeeper [`d0206ec`](https://github.com/SAP/ui5-builder/commit/d0206ecf69ebb0778fc3f6bd30d0d75f01e9fb9c)
- Update to less-openui5[@0](https://github.com/0).5.4 and fix tests [`445c067`](https://github.com/SAP/ui5-builder/commit/445c0673dd57d2b947b678c4030d987002ec490a)
- **JSModuleAnalyzer:** update language metadata ([#44](https://github.com/SAP/ui5-builder/issues/44)) [`05d4127`](https://github.com/SAP/ui5-builder/commit/05d4127ec71d9a9b887d431c74e0afa3e9ddba0a)
- **package.json:** Define files to publish [`6f2527d`](https://github.com/SAP/ui5-builder/commit/6f2527dc84be5e3465b8a33c31af2da3e2600292)


<a name="v0.1.1"></a>
## [v0.1.1] - 2018-07-02
### Bug Fixes
- iterate over routes using a for loop if it is an object ([#31](https://github.com/SAP/ui5-builder/issues/31)) [`e9823f6`](https://github.com/SAP/ui5-builder/commit/e9823f68cf038b5fde172916e483a01d5eb88f1f)

### Internal Changes
- Task createDebugFiles checks path before writes ([#43](https://github.com/SAP/ui5-builder/issues/43)) [`57427c8`](https://github.com/SAP/ui5-builder/commit/57427c8d712b8b936a1a3070fe3110da54fdbdb7)
- Create and integrate a new task 'generateLibraryManifest' ([#26](https://github.com/SAP/ui5-builder/issues/26)) [`000a6fe`](https://github.com/SAP/ui5-builder/commit/000a6fee49555cb266a1c575cde719e1091d1066)


<a name="v0.1.0"></a>
## [v0.1.0] - 2018-06-26
### Bug Fixes
- Bundles should be built one after another [`164ba32`](https://github.com/SAP/ui5-builder/commit/164ba328c6e172297d71b9d3ef871005931cca71)
- reduce build time at the price of a slightly increased code size ([#37](https://github.com/SAP/ui5-builder/issues/37)) [`1fb8d00`](https://github.com/SAP/ui5-builder/commit/1fb8d0049235467fcbd40f53e725cc419a8bc730)
- Use the target bundle format to decide decoration ([#24](https://github.com/SAP/ui5-builder/issues/24)) [`83703bc`](https://github.com/SAP/ui5-builder/commit/83703bca17fd18b9ac700fae4801d87a4d86961d)

### Internal Changes
- Update ui5-fs and ui5-logger dependency [`dbc64df`](https://github.com/SAP/ui5-builder/commit/dbc64df8a67dd6c8d24704c45f6585ab1be97397)
- Minor improvements around logging and error reporting ([#29](https://github.com/SAP/ui5-builder/issues/29)) [`55b1e89`](https://github.com/SAP/ui5-builder/commit/55b1e89b779b367db8aaa286e44a4f2c60ed074e)
- Fix Changelog [`98612d4`](https://github.com/SAP/ui5-builder/commit/98612d410bd73976c8493692e11d12cd72ffbf5b)
- **CHANGELOG:** Fix GitHub release template [`4b74ec5`](https://github.com/SAP/ui5-builder/commit/4b74ec5b7088d583de867a3bb9c116c634225ca2)


<a name="v0.0.2"></a>
## [v0.0.2] - 2018-06-21
### Bug Fixes
- **Builders:** Do not bundle debug files [`19800a1`](https://github.com/SAP/ui5-builder/commit/19800a16689210c13495bc1bd0949896500cfc52)

### Internal Changes
- Add coveralls [`434b675`](https://github.com/SAP/ui5-builder/commit/434b67512444f279288359bf990895b607254075)
- Add and update badges [`9c33b04`](https://github.com/SAP/ui5-builder/commit/9c33b047d9211e59f23e5fcbc76e66e5fd143150)
- Have greenkeeper-lockfile amend any greenkeeper commit [`641817b`](https://github.com/SAP/ui5-builder/commit/641817b4e4f618aab6bbe3bde55ae01a942b93f8)
- Prepare Greenkeeper installation [`fe9cbbf`](https://github.com/SAP/ui5-builder/commit/fe9cbbf0fbe3dd5bd8748adece8137797ae46795)
- **Greenkeeper:** Add badge [`167cca9`](https://github.com/SAP/ui5-builder/commit/167cca9d038b4403fd282897b353db796fc0f7d9)
- **Greenkeeper:** Add config file [`891339e`](https://github.com/SAP/ui5-builder/commit/891339e9493e8d0e609483891c476dea9c041d4e)
- **README:** Pre-Alpha -> Alpha [`33c8190`](https://github.com/SAP/ui5-builder/commit/33c81906358d38b634099acbf8aafa234cc504db)


<a name="v0.0.1"></a>
## v0.0.1 - 2018-06-06
### Bug Fixes
- Restore default component preload [`a09bec2`](https://github.com/SAP/ui5-builder/commit/a09bec2f57f45a1c5d74681b3bdec4f7fdc45343)

### Features
- Add ability to configure component preloads and custom bundles [`2241e5f`](https://github.com/SAP/ui5-builder/commit/2241e5ff98fd95f1f80cc74959655ae7a9c660e7)

### Internal Changes
- Prepare npm release [`8947863`](https://github.com/SAP/ui5-builder/commit/8947863f6339d34aff801679e0338fe32c042194)
- Update .editorconfig [`1f66211`](https://github.com/SAP/ui5-builder/commit/1f66211e3f7b82085caf90c341cee2c4c671fb8a)
- Add chglog config + npm release scripts [`c82dc4e`](https://github.com/SAP/ui5-builder/commit/c82dc4e52c95260ba6e2c2f6423ce18ba9330267)
- Update sap-ui-core bundle excludes [`d9d7a7a`](https://github.com/SAP/ui5-builder/commit/d9d7a7a75711c8f797c479dbd60b7c7aa2d984ea)
- Update dependencies [`f852eb8`](https://github.com/SAP/ui5-builder/commit/f852eb87f98e0f1feb18fbe2b0306781f8ae52f1)
- Add travis CI badge [`d34a3b2`](https://github.com/SAP/ui5-builder/commit/d34a3b264006dfacbd31cbb5ed2ef929fa8076b5)
- Fix links to CONTRIBUTING.md file [`a3cc348`](https://github.com/SAP/ui5-builder/commit/a3cc3482cbb8c88b6e3dce6d46143473a66ce3e0)
- **ESLint:** Activate no-console [`f8bd991`](https://github.com/SAP/ui5-builder/commit/f8bd99159c5359edf7bb53425c1650ee46fa0663)
- **ESLint:** Activate no-var rule [`88c7950`](https://github.com/SAP/ui5-builder/commit/88c79501c3db9b579521a88d57a0e8a2742088bb)
- **Readme:** Fix urls under Type and Processor section [`d1794bd`](https://github.com/SAP/ui5-builder/commit/d1794bd7026a9008b0b67870c91141f66511877a)
- **Travis:** Add node.js 10 to test matrix [`ce91dd1`](https://github.com/SAP/ui5-builder/commit/ce91dd17e4e28932a838ec743a489ff6495d21a9)


[v0.2.1]: https://github.com/SAP/ui5-builder/compare/v0.2.0...v0.2.1
[v0.2.0]: https://github.com/SAP/ui5-builder/compare/v0.1.1...v0.2.0
[v0.1.1]: https://github.com/SAP/ui5-builder/compare/v0.1.0...v0.1.1
[v0.1.0]: https://github.com/SAP/ui5-builder/compare/v0.0.2...v0.1.0
[v0.0.2]: https://github.com/SAP/ui5-builder/compare/v0.0.1...v0.0.2
