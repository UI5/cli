# Changelog
All notable changes to this project will be documented in this file.  
This project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

A list of unreleased changes can be found [here](https://github.com/SAP/ui5-builder/compare/v1.2.0...HEAD).

<a name="v1.2.0"></a>
## [v1.2.0] - 2019-04-18
### Features
- Add option to use hash signatures in cachebuster info file [`a4e8338`](https://github.com/SAP/ui5-builder/commit/a4e83383c7371cdde8573a901fdadd2ab243440e)


<a name="v1.1.1"></a>
## [v1.1.1] - 2019-04-24
### Bug Fixes
- **ApplicationFormatter:** detect the namespace for Maven placeholders ([#243](https://github.com/SAP/ui5-builder/issues/243)) [`49ecb07`](https://github.com/SAP/ui5-builder/commit/49ecb07f41efdf0778f04b05117e0daae01e8710)


<a name="v1.1.0"></a>
## [v1.1.0] - 2019-04-12
### Features
- Build the manifest-bundle.zip for applications and libraries [`f53aeea`](https://github.com/SAP/ui5-builder/commit/f53aeea594071616974d0e14b6d41609603bbd5b)
- Generate the AppCacheBuster index file for apps [`dd653c8`](https://github.com/SAP/ui5-builder/commit/dd653c8f3883da41f5723093d7e40aeb3258c180)


<a name="v1.0.5"></a>
## [v1.0.5] - 2019-04-03
### Bug Fixes
- Generate sap-ui-custom-dbg.js for self-contained build ([#234](https://github.com/SAP/ui5-builder/issues/234)) [`d769d98`](https://github.com/SAP/ui5-builder/commit/d769d9894fe0a9d5262aea2cde86b463bc55433d)
- Add bundling sap-ui-core-noJQuery.js and sap-ui-core-noJQuery-dbg.js ([#235](https://github.com/SAP/ui5-builder/issues/235)) [`e7a7a63`](https://github.com/SAP/ui5-builder/commit/e7a7a63983dec54f53ac1c906eb2f970948db25d)


<a name="v1.0.4"></a>
## [v1.0.4] - 2019-03-27
### Dependency Updates
- Bump tmp from 0.0.33 to 0.1.0 ([#220](https://github.com/SAP/ui5-builder/issues/220)) [`4fa642c`](https://github.com/SAP/ui5-builder/commit/4fa642c460f71b48ff690e3dc09de8cb0decca4e)


<a name="v1.0.3"></a>
## [v1.0.3] - 2019-03-21
### Dependency Updates
- Bump [@ui5](https://github.com/ui5)/fs from 1.0.1 to 1.0.2 ([#214](https://github.com/SAP/ui5-builder/issues/214)) [`eb85e0a`](https://github.com/SAP/ui5-builder/commit/eb85e0afa1e5e82571312448ce8ab7ef87a7bcbc)
- Bump [@ui5](https://github.com/ui5)/logger from 1.0.0 to 1.0.1 ([#212](https://github.com/SAP/ui5-builder/issues/212)) [`20557e8`](https://github.com/SAP/ui5-builder/commit/20557e85ac0de835b5d5ff455d613d102521d3c7)

### Features
- Add JSDoc build functionalities ([#42](https://github.com/SAP/ui5-builder/issues/42)) [`293a4b0`](https://github.com/SAP/ui5-builder/commit/293a4b0ae44706490fb568be69d4032150a2891a)


<a name="v1.0.2"></a>
## [v1.0.2] - 2019-02-28
### Bug Fixes
- Warning log of duplicate module declaration [`9a790a3`](https://github.com/SAP/ui5-builder/commit/9a790a30905cdebe6ba3db283b75983135b967d6)
- **Bundler:** Create sap-ui-core-dbg.js ([#176](https://github.com/SAP/ui5-builder/issues/176)) [`feb95e4`](https://github.com/SAP/ui5-builder/commit/feb95e41c199d5b455272ba5886cdd79d1502cd7)
- **ComponentAnalyzer:** Detect model types from dataSource [`efc5cef`](https://github.com/SAP/ui5-builder/commit/efc5cef5fb2988e78dfd1ea26f3c6ba818c69d87)


<a name="v1.0.1"></a>
## [v1.0.1] - 2019-02-01
### Dependency Updates
- Bump [@ui5](https://github.com/ui5)/fs from 1.0.0 to 1.0.1 [`55ab125`](https://github.com/SAP/ui5-builder/commit/55ab125e60c138a5a419cae1064590e5e535d893)


<a name="v1.0.0"></a>
## [v1.0.0] - 2019-02-01
### Dependency Updates
- Bump [@ui5](https://github.com/ui5)/fs from 0.2.0 to 1.0.0 ([#142](https://github.com/SAP/ui5-builder/issues/142)) [`2c6893f`](https://github.com/SAP/ui5-builder/commit/2c6893f9029c161e95a4078caeb7e9f3a22a3af2)

### Features
- Add transformation of apps index.html in self-contained build ([#137](https://github.com/SAP/ui5-builder/issues/137)) [`6549b8a`](https://github.com/SAP/ui5-builder/commit/6549b8a832cc50749159f1295bd93ef6a04733b6)

### BREAKING CHANGE

When running a self-contained build on an application project, the
index.html will be transformed by adopting the UI5 bootstrap script tag
to load the custom bundle file instead.


<a name="v0.2.9"></a>
## [v0.2.9] - 2019-01-03
### Bug Fixes
- **ComponentAnalyzer:** Fully handle sap.ui5/routing ([#124](https://github.com/SAP/ui5-builder/issues/124)) [`c59b5b1`](https://github.com/SAP/ui5-builder/commit/c59b5b1efdc3a588fb8a13029a6593feab142e0c)
- **XMLTemplateAnalyzer:** Ignore properties with data binding [`0d5cf50`](https://github.com/SAP/ui5-builder/commit/0d5cf5086566dd0609fa354a5822f6538b335065)


<a name="v0.2.8"></a>
## [v0.2.8] - 2018-12-19
### Bug Fixes
- Themes not beeing build [`de26564`](https://github.com/SAP/ui5-builder/commit/de26564c2c3af3376ccf179c972eae4f0e5eeeee)


<a name="v0.2.7"></a>
## [v0.2.7] - 2018-12-19
### Bug Fixes
- **ComponentAnalyzer:** Handle sap.ui5/rootView with type string [`469e558`](https://github.com/SAP/ui5-builder/commit/469e558cae43d6a0c063170dd23e2337c0e5af26)
- **generateLibraryPreload:** Fix sap-ui-core.js bootstrap [`7a266fd`](https://github.com/SAP/ui5-builder/commit/7a266fd48d6452ce7f6180b026109d47caf195ec)


<a name="v0.2.6"></a>
## [v0.2.6] - 2018-12-06

<a name="v0.2.5"></a>
## [v0.2.5] - 2018-11-16
### Features
- **Builder:** Add handling for custom task configurations [`9b4ae00`](https://github.com/SAP/ui5-builder/commit/9b4ae00f62da1f5bb94aeb8a86711c2a2e98da20)


<a name="v0.2.4"></a>
## [v0.2.4] - 2018-10-29
### Features
- Add module type [`d7efb8a`](https://github.com/SAP/ui5-builder/commit/d7efb8a16334571e7997daccd4f69e1e06591c25)


<a name="v0.2.3"></a>
## [v0.2.3] - 2018-10-09
### Bug Fixes
- Replace copyright and version strings in *.json and .library files [`f305429`](https://github.com/SAP/ui5-builder/commit/f305429067610404f0958b55ef3a570e555a532e)
- **generateLibraryPreload:** Add new sap.ui.core library namespaces [`ea901a7`](https://github.com/SAP/ui5-builder/commit/ea901a78c27e5fd112f9ac761e621b7f1c474f07)


<a name="v0.2.2"></a>
## [v0.2.2] - 2018-10-05
### Bug Fixes
- **processors/versionInfoGenerator:** Remove "gav" property [`2bf41e1`](https://github.com/SAP/ui5-builder/commit/2bf41e1622df70818f925aabafe16de082fa3884)

### Features
- **BundleBuilder:** support modules using ES6 with usePredefineCalls ([#67](https://github.com/SAP/ui5-builder/issues/67)) [`d1a4f1f`](https://github.com/SAP/ui5-builder/commit/d1a4f1f39e4262eafa8df1548f0e944998fd00a3)


<a name="v0.2.1"></a>
## [v0.2.1] - 2018-07-17
### Bug Fixes
- **generateLibraryManifest:** i18n/css handling [`4e52a96`](https://github.com/SAP/ui5-builder/commit/4e52a9654b28a7646597ce0e0f010589ff7905d5)


<a name="v0.2.0"></a>
## [v0.2.0] - 2018-07-11
### Bug Fixes
- Close gaps in routing support of ComponentAnalyzer ([#46](https://github.com/SAP/ui5-builder/issues/46)) [`4697531`](https://github.com/SAP/ui5-builder/commit/4697531cbafebf881e78b80e78d098d1361fe9a5)


<a name="v0.1.1"></a>
## [v0.1.1] - 2018-07-02
### Bug Fixes
- iterate over routes using a for loop if it is an object ([#31](https://github.com/SAP/ui5-builder/issues/31)) [`e9823f6`](https://github.com/SAP/ui5-builder/commit/e9823f68cf038b5fde172916e483a01d5eb88f1f)


<a name="v0.1.0"></a>
## [v0.1.0] - 2018-06-26
### Bug Fixes
- Bundles should be built one after another [`164ba32`](https://github.com/SAP/ui5-builder/commit/164ba328c6e172297d71b9d3ef871005931cca71)
- reduce build time at the price of a slightly increased code size ([#37](https://github.com/SAP/ui5-builder/issues/37)) [`1fb8d00`](https://github.com/SAP/ui5-builder/commit/1fb8d0049235467fcbd40f53e725cc419a8bc730)
- Use the target bundle format to decide decoration ([#24](https://github.com/SAP/ui5-builder/issues/24)) [`83703bc`](https://github.com/SAP/ui5-builder/commit/83703bca17fd18b9ac700fae4801d87a4d86961d)


<a name="v0.0.2"></a>
## [v0.0.2] - 2018-06-21
### Bug Fixes
- **Builders:** Do not bundle debug files [`19800a1`](https://github.com/SAP/ui5-builder/commit/19800a16689210c13495bc1bd0949896500cfc52)


<a name="v0.0.1"></a>
## v0.0.1 - 2018-06-06
### Bug Fixes
- Restore default component preload [`a09bec2`](https://github.com/SAP/ui5-builder/commit/a09bec2f57f45a1c5d74681b3bdec4f7fdc45343)

### Features
- Add ability to configure component preloads and custom bundles [`2241e5f`](https://github.com/SAP/ui5-builder/commit/2241e5ff98fd95f1f80cc74959655ae7a9c660e7)


[v1.2.0]: https://github.com/SAP/ui5-builder/compare/v1.1.1...v1.2.0
[v1.1.1]: https://github.com/SAP/ui5-builder/compare/v1.1.0...v1.1.1
[v1.1.0]: https://github.com/SAP/ui5-builder/compare/v1.0.5...v1.1.0
[v1.0.5]: https://github.com/SAP/ui5-builder/compare/v1.0.4...v1.0.5
[v1.0.4]: https://github.com/SAP/ui5-builder/compare/v1.0.3...v1.0.4
[v1.0.3]: https://github.com/SAP/ui5-builder/compare/v1.0.2...v1.0.3
[v1.0.2]: https://github.com/SAP/ui5-builder/compare/v1.0.1...v1.0.2
[v1.0.1]: https://github.com/SAP/ui5-builder/compare/v1.0.0...v1.0.1
[v1.0.0]: https://github.com/SAP/ui5-builder/compare/v0.2.9...v1.0.0
[v0.2.9]: https://github.com/SAP/ui5-builder/compare/v0.2.8...v0.2.9
[v0.2.8]: https://github.com/SAP/ui5-builder/compare/v0.2.7...v0.2.8
[v0.2.7]: https://github.com/SAP/ui5-builder/compare/v0.2.6...v0.2.7
[v0.2.6]: https://github.com/SAP/ui5-builder/compare/v0.2.5...v0.2.6
[v0.2.5]: https://github.com/SAP/ui5-builder/compare/v0.2.4...v0.2.5
[v0.2.4]: https://github.com/SAP/ui5-builder/compare/v0.2.3...v0.2.4
[v0.2.3]: https://github.com/SAP/ui5-builder/compare/v0.2.2...v0.2.3
[v0.2.2]: https://github.com/SAP/ui5-builder/compare/v0.2.1...v0.2.2
[v0.2.1]: https://github.com/SAP/ui5-builder/compare/v0.2.0...v0.2.1
[v0.2.0]: https://github.com/SAP/ui5-builder/compare/v0.1.1...v0.2.0
[v0.1.1]: https://github.com/SAP/ui5-builder/compare/v0.1.0...v0.1.1
[v0.1.0]: https://github.com/SAP/ui5-builder/compare/v0.0.2...v0.1.0
[v0.0.2]: https://github.com/SAP/ui5-builder/compare/v0.0.1...v0.0.2
