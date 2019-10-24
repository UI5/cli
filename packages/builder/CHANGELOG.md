# Changelog
All notable changes to this project will be documented in this file.  
This project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

A list of unreleased changes can be found [here](https://github.com/SAP/ui5-builder/compare/v1.6.1...HEAD).

<a name="v1.6.1"></a>
## [v1.6.1] - 2019-10-24
### Bug Fixes
- **jsdoc:** Adopt version range to micro releases ([#357](https://github.com/SAP/ui5-builder/issues/357)) [`619b959`](https://github.com/SAP/ui5-builder/commit/619b959d93441fef1be8c1609ebe5a9eb15759f5)


<a name="v1.6.0"></a>
## [v1.6.0] - 2019-10-24
### Bug Fixes
- Update JSDoc to 3.6.3 ([#346](https://github.com/SAP/ui5-builder/issues/346)) [`78e2a22`](https://github.com/SAP/ui5-builder/commit/78e2a229f2ae11ca37538a75ac6746ff92af7b84)

### Features
- **Simple Build Extensibility:** Pass project namespace to custom tasks [`1a167c5`](https://github.com/SAP/ui5-builder/commit/1a167c560ed8cc4e2c28a6c11efb1bf5ed142be9)


<a name="v1.5.3"></a>
## [v1.5.3] - 2019-10-11
### Bug Fixes
- **Bundling:** merge dependency analysis results with raw module infos ([#340](https://github.com/SAP/ui5-builder/issues/340)) [`af4318a`](https://github.com/SAP/ui5-builder/commit/af4318a75d742bbd2e5566d2ffde2bc5a823ef06)


<a name="v1.5.2"></a>
## [v1.5.2] - 2019-10-09
### Bug Fixes
- Improve recognition of main module in case of bundles ([#341](https://github.com/SAP/ui5-builder/issues/341)) [`7a560b4`](https://github.com/SAP/ui5-builder/commit/7a560b4bbc4c862ebded6f9e9f12c2156b1e33d1)
- Align set of known file types with runtime ([#337](https://github.com/SAP/ui5-builder/issues/337)) [`8b372f1`](https://github.com/SAP/ui5-builder/commit/8b372f1ad65d0edfe5cd440bd9352db7e48ea156)
- **manifestCreator:** Only consider component files called Component.js ([#273](https://github.com/SAP/ui5-builder/issues/273)) [`82fe267`](https://github.com/SAP/ui5-builder/commit/82fe2675114c13603238889e43be498f92d22a51)


<a name="v1.5.1"></a>
## [v1.5.1] - 2019-09-04
### Bug Fixes
- **XMLTemplateAnalyzer:** Throws on tags without attributes ([#322](https://github.com/SAP/ui5-builder/issues/322)) [`b7f3795`](https://github.com/SAP/ui5-builder/commit/b7f379580d92e2d105edfc14e8feceab853f9a11)


<a name="v1.5.0"></a>
## [v1.5.0] - 2019-09-02
### Features
- **XMLTemplateAnalyzer:** Support core:require ([#304](https://github.com/SAP/ui5-builder/issues/304)) [`b01fd85`](https://github.com/SAP/ui5-builder/commit/b01fd8538fafd33a4fc6303c58afe039d5ca1341)


<a name="v1.4.2"></a>
## [v1.4.2] - 2019-08-28
### Bug Fixes
- Add 'sap.ui.fl' dependency to manifest.json ([#318](https://github.com/SAP/ui5-builder/issues/318)) [`a8edff4`](https://github.com/SAP/ui5-builder/commit/a8edff4cf63547cc1fc1d1c0ddfe958104fcb801)


<a name="v1.4.1"></a>
## [v1.4.1] - 2019-08-14
### Bug Fixes
- Adapt to recent extension of estraverse's set of node types ([#310](https://github.com/SAP/ui5-builder/issues/310)) [`9db14e6`](https://github.com/SAP/ui5-builder/commit/9db14e6afc01c686c1187d8eefe327654e6cc3ca)

### Features
- Switch to Terser for JavaScript minification [`fccb514`](https://github.com/SAP/ui5-builder/commit/fccb5145d05a8509d5b9c47fa4cea4b6299ca91d)
- **Theme Build:** Add compress option to minify output ([#295](https://github.com/SAP/ui5-builder/issues/295)) [`eea10ba`](https://github.com/SAP/ui5-builder/commit/eea10ba516c36be6aa3cdb2c8be990bc56f14078)
- **clean build folder:** Allows developers to clean build folder before start building a project [`04eb695`](https://github.com/SAP/ui5-builder/commit/04eb695fd493ce9bd1289933d5494178c1e679d7)


<a name="v1.4.0"></a>
## [v1.4.0] - 2019-07-29
### Bug Fixes
- **versionInfo:** Use correct buildTimestamp format [`6d87b3e`](https://github.com/SAP/ui5-builder/commit/6d87b3e10db11a8755b4049ba82732c6ec4f776c)

### Features
- Properties File Escaping ([#293](https://github.com/SAP/ui5-builder/issues/293)) [`9d213ce`](https://github.com/SAP/ui5-builder/commit/9d213ced942ed7832fbb7b50f9d444f441941f35)


<a name="v1.3.3"></a>
## [v1.3.3] - 2019-07-01
### Bug Fixes
- Use consistent RegExp to detect copyright comments ([#275](https://github.com/SAP/ui5-builder/issues/275)) [`bd7aa40`](https://github.com/SAP/ui5-builder/commit/bd7aa409be340216a88ceb2607e85d951c9de58a)

### Dependency Updates
- Bump globby from 9.2.0 to 10.0.0 [`1ea4a11`](https://github.com/SAP/ui5-builder/commit/1ea4a11e7177602b11049bb42e7c4149a0d55ff2)


<a name="v1.3.2"></a>
## [v1.3.2] - 2019-06-24
### Bug Fixes
- **generateManifestBundle:** Only glob files from project namespace [`fc7f659`](https://github.com/SAP/ui5-builder/commit/fc7f659ab45a6828a1ab05a35dbe856a4a2b5f87)


<a name="v1.3.1"></a>
## [v1.3.1] - 2019-06-14
### Bug Fixes
- Detect library namespace automatically ([#255](https://github.com/SAP/ui5-builder/issues/255)) [`604d4d3`](https://github.com/SAP/ui5-builder/commit/604d4d36745c9581969c411a0a78e56981948d0e)


<a name="v1.3.0"></a>
## [v1.3.0] - 2019-06-03
### Features
- **Builder:** Add excludes option ([#254](https://github.com/SAP/ui5-builder/issues/254)) [`6a7883e`](https://github.com/SAP/ui5-builder/commit/6a7883e9c39220084660993f77c0d4c4c37ec29c)


<a name="v1.2.3"></a>
## [v1.2.3] - 2019-05-15
### Bug Fixes
- **JSDoc:** Implement own tmp dir lifecycle [`3f85abf`](https://github.com/SAP/ui5-builder/commit/3f85abfe9bf05e008c43cf6489d26ecb0b7d8ee3)


<a name="v1.2.2"></a>
## [v1.2.2] - 2019-05-08
### Bug Fixes
- **package.json:** Fix JSDoc version to 3.5.5 [`873469d`](https://github.com/SAP/ui5-builder/commit/873469d0d9295a7d7d5775f446c170068d086502)


<a name="v1.2.1"></a>
## [v1.2.1] - 2019-05-07
### Bug Fixes
- **SmartTemplateAnalyzer:** Detect dependencies from "pages" object [`2d400c2`](https://github.com/SAP/ui5-builder/commit/2d400c2ac0883ad57b4aa894c46a0dd5aecb070a)


<a name="v1.2.0"></a>
## [v1.2.0] - 2019-04-25
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


[v1.6.1]: https://github.com/SAP/ui5-builder/compare/v1.6.0...v1.6.1
[v1.6.0]: https://github.com/SAP/ui5-builder/compare/v1.5.3...v1.6.0
[v1.5.3]: https://github.com/SAP/ui5-builder/compare/v1.5.2...v1.5.3
[v1.5.2]: https://github.com/SAP/ui5-builder/compare/v1.5.1...v1.5.2
[v1.5.1]: https://github.com/SAP/ui5-builder/compare/v1.5.0...v1.5.1
[v1.5.0]: https://github.com/SAP/ui5-builder/compare/v1.4.2...v1.5.0
[v1.4.2]: https://github.com/SAP/ui5-builder/compare/v1.4.1...v1.4.2
[v1.4.1]: https://github.com/SAP/ui5-builder/compare/v1.4.0...v1.4.1
[v1.4.0]: https://github.com/SAP/ui5-builder/compare/v1.3.3...v1.4.0
[v1.3.3]: https://github.com/SAP/ui5-builder/compare/v1.3.2...v1.3.3
[v1.3.2]: https://github.com/SAP/ui5-builder/compare/v1.3.1...v1.3.2
[v1.3.1]: https://github.com/SAP/ui5-builder/compare/v1.3.0...v1.3.1
[v1.3.0]: https://github.com/SAP/ui5-builder/compare/v1.2.3...v1.3.0
[v1.2.3]: https://github.com/SAP/ui5-builder/compare/v1.2.2...v1.2.3
[v1.2.2]: https://github.com/SAP/ui5-builder/compare/v1.2.1...v1.2.2
[v1.2.1]: https://github.com/SAP/ui5-builder/compare/v1.2.0...v1.2.1
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
