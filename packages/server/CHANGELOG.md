# Changelog
All notable changes to this project will be documented in this file.  
This project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

A list of unreleased changes can be found [here](https://github.com/SAP/ui5-server/compare/v0.2.2...HEAD).

<a name="v0.2.2"></a>
## [v0.2.2] - 2018-10-29
### Internal Changes
- **Coveralls:** Use parallel setting to reduce number of PR comments [`9e9855d`](https://github.com/SAP/ui5-server/commit/9e9855d34f5b62111ca56204c17e1183ea28beae)
- **serveThemes:** Fix tests after upgrade to [@ui5](https://github.com/ui5)/builder v0.2.3 [`1dfba02`](https://github.com/SAP/ui5-server/commit/1dfba027b3eb0e78907d7cc67a2ef418dd025f53)
- **versionInfo:** sap-ui-version.json no longer contains gav information [`c66af16`](https://github.com/SAP/ui5-server/commit/c66af1656b1235504ef00c4362178da7f70141c1)


<a name="v0.2.1"></a>
## [v0.2.1] - 2018-07-17

<a name="v0.2.0"></a>
## [v0.2.0] - 2018-07-12
### Internal Changes
- Add .npmrc to enforce public registry [`3eb2825`](https://github.com/SAP/ui5-server/commit/3eb2825af9d20c61beaadd811b3a1ed911159314)
- Fix theme middleware tests [`dde2a65`](https://github.com/SAP/ui5-server/commit/dde2a65a260c51c0811245bdc92bb3409b91de9e)
- Fix package-lock.json URLs [`173dfa1`](https://github.com/SAP/ui5-server/commit/173dfa1acf9e9a679250cd11412ae143e37d4e75)
- Update min Node.js version to >=8.5 [`89b7f21`](https://github.com/SAP/ui5-server/commit/89b7f219279e9b92f200e7822c0f13134044c12c)
- **CHANGELOG:** Fix scope detection in commit messages [`cd7dbd1`](https://github.com/SAP/ui5-server/commit/cd7dbd1011830e273d4e001fca1ba3cd719ee598)
- **package.json:** Define files to publish [`5443bec`](https://github.com/SAP/ui5-server/commit/5443bec4363bf38d3935d5b13deb75438e62275a)


<a name="v0.1.2"></a>
## [v0.1.2] - 2018-07-10
### Bug Fixes
- **CSP Middleware:** Export middleware, add report-uri [`2091c0c`](https://github.com/SAP/ui5-server/commit/2091c0cc093f9997c582e301ad52bbe74d4651d6)


<a name="v0.1.1"></a>
## [v0.1.1] - 2018-07-10
### Features
- simplistic serveIndex with additional properties [`fa04ee2`](https://github.com/SAP/ui5-server/commit/fa04ee227cf5d4af4a8ba5d4d3fa594cee417da0)
- Add CSP middleware ([#3](https://github.com/SAP/ui5-server/issues/3)) [`f9ec3ee`](https://github.com/SAP/ui5-server/commit/f9ec3eeb43708462c2d683a80beb1816beeddc92)


<a name="v0.1.0"></a>
## [v0.1.0] - 2018-06-26
### Internal Changes
- Update ui5 tooling dependencies [`ba34c41`](https://github.com/SAP/ui5-server/commit/ba34c41f4d291b109e2dc770672f8e945778e665)
- Add coveralls and dm-badges [`1c22823`](https://github.com/SAP/ui5-server/commit/1c22823870acb1c761c4f52ce5b676219d411541)
- **CHANGELOG:** Fix GitHub release template [`a4f736b`](https://github.com/SAP/ui5-server/commit/a4f736b189e74ad4b65f195509da198196d623b9)
- **README:** Pre-Alpha -> Alpha [`8b32857`](https://github.com/SAP/ui5-server/commit/8b32857e88699ef62292a3b69b30e724d960441e)


<a name="v0.0.1"></a>
## v0.0.1 - 2018-06-06
### Internal Changes
- Prepare npm release [`80271f1`](https://github.com/SAP/ui5-server/commit/80271f1c80dd6fb65ced85d949f28dd75f9bc74f)
- Update .editorconfig [`21ed234`](https://github.com/SAP/ui5-server/commit/21ed234f7e492ea1c6000e26855cd1e2c2c1a6a5)
- Add chglog config + npm release scripts [`9e1a122`](https://github.com/SAP/ui5-server/commit/9e1a1226b64a595ec72f1c886343c56b625f56d0)
- Update dependencies [`0518658`](https://github.com/SAP/ui5-server/commit/0518658cb9bab9e551a4406bfa905ffeb9218dad)
- Add missing test module dependencies [`9ee06c4`](https://github.com/SAP/ui5-server/commit/9ee06c4ed5e8ae9e1de1fc497768909313e769d6)
- Update and add more jsdoc for server, sslUtil and middleware [`d0e747d`](https://github.com/SAP/ui5-server/commit/d0e747d598b8f6696755581582f53e276260c72c)
- Add travis CI badge + package.json cleanup [`3ff2fb9`](https://github.com/SAP/ui5-server/commit/3ff2fb91f1c350cae284c9e1398e9efd4b82b2f2)
- Fix links to CONTRIBUTING.md file [`63b9f0d`](https://github.com/SAP/ui5-server/commit/63b9f0d20fb4c76f182ff9dea8692c85e4a1897d)
- **ESLint:** Activate no-var rule [`7f3e234`](https://github.com/SAP/ui5-server/commit/7f3e2348e977232676c4829e8079dad6e4f1d8ea)
- **ESLint:** Activate no-console [`dc6b76a`](https://github.com/SAP/ui5-server/commit/dc6b76a3f19b49a18396631fcfa13f97f3e42e47)
- **Travis:** Add node.js 10 to test matrix [`2881261`](https://github.com/SAP/ui5-server/commit/2881261a05afd737af7c8874b91819a52b8f88df)


[v0.2.2]: https://github.com/SAP/ui5-server/compare/v0.2.1...v0.2.2
[v0.2.1]: https://github.com/SAP/ui5-server/compare/v0.2.0...v0.2.1
[v0.2.0]: https://github.com/SAP/ui5-server/compare/v0.1.2...v0.2.0
[v0.1.2]: https://github.com/SAP/ui5-server/compare/v0.1.1...v0.1.2
[v0.1.1]: https://github.com/SAP/ui5-server/compare/v0.1.0...v0.1.1
[v0.1.0]: https://github.com/SAP/ui5-server/compare/v0.0.1...v0.1.0
