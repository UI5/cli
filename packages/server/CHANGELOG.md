# Changelog
All notable changes to this project will be documented in this file.  
This project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

A list of unreleased changes can be found [here](https://github.com/SAP/ui5-server/compare/v4.0.6...HEAD).

<a name="v4.0.6"></a>
## [v4.0.6] - 2025-06-02
### Bug Fixes
- Log error in case UI5 Server uses HTTP/2 with Node 24 ([#722](https://github.com/SAP/ui5-server/issues/722)) [`71dd7af`](https://github.com/SAP/ui5-server/commit/71dd7afc946dd4d56005a9f430148670cae5e76c)


<a name="v4.0.5"></a>
## [v4.0.5] - 2024-09-11
### Dependency Updates
- Bump path-to-regexp and router [`f713647`](https://github.com/SAP/ui5-server/commit/f713647258c89df7355c78a6c3b86817167027ed)


<a name="v4.0.4"></a>
## [v4.0.4] - 2024-08-27
### Bug Fixes
- Ensure SSL credentials are only readable by owner [`7220dbb`](https://github.com/SAP/ui5-server/commit/7220dbb2237dbf3104dcb88c15c1ca86b61ba49d)


<a name="v4.0.3"></a>
## [v4.0.3] - 2024-08-09
### Bug Fixes
- **serveResources:** Do not process manifest.json in test-resources [`964e784`](https://github.com/SAP/ui5-server/commit/964e784f41479300ba45eb4a4818ddd0449d41e7)


<a name="v4.0.2"></a>
## [v4.0.2] - 2024-08-01
### Dependency Updates
- Bump devcert-sanscache from 0.4.8 to 5.0.1 [`4a06c57`](https://github.com/SAP/ui5-server/commit/4a06c579c510d567ea214d565a490327c0b481d0)


<a name="v4.0.1"></a>
## [v4.0.1] - 2024-07-31
### Bug Fixes
- **serveResources:** Improve cache invalidation ([#688](https://github.com/SAP/ui5-server/issues/688)) [`777afa5`](https://github.com/SAP/ui5-server/commit/777afa52e459f988e0799ae63b8a9b024db0c398)


<a name="v4.0.0"></a>
## [v4.0.0] - 2024-07-23
### Breaking Changes
- Drop node v21 support [`2af0d4f`](https://github.com/SAP/ui5-server/commit/2af0d4fd94c720899bc5978d27ca176c7b2feecb)
- Replace console.log with process.stderr  ([#643](https://github.com/SAP/ui5-server/issues/643)) [`d42c79f`](https://github.com/SAP/ui5-server/commit/d42c79f0a6e6fa5e685f736dd0ae79b353767051)
- Require Node.js 20.11.x/>=21.2.0 and npm >=10 [`39cc1a2`](https://github.com/SAP/ui5-server/commit/39cc1a2dea8e081888ae1f5f2c47a74bb7efe693)

### Features
- **manifest.json:** Auto-fill supportedLocales [`a39c8de`](https://github.com/SAP/ui5-server/commit/a39c8debaabe259800ed8f861071b00817c10350)

### BREAKING CHANGE

Messages will now be written to stderr instead of stdout.

JIRA: CPOUI5FOUNDATION-802
Related to: https://github.com/SAP/ui5-tooling/issues/701
Sibling of: https://github.com/SAP/ui5-tooling/pull/930,
https://github.com/SAP/ui5-cli/pull/686

Support for older Node.js and npm releases has been dropped.
Only Node.js 20.11.x and >=21.2.0 as well as npm v10 or higher are supported.

<a name="v3.2.1"></a>
## [v3.2.1] - 2024-05-15
### Bug Fixes
- **middleware/versionInfo:** Only process dependencies of type 'library' [`4c99455`](https://github.com/SAP/ui5-server/commit/4c99455cf21539c2d1403cca81c603ead7124351)


<a name="v3.2.0"></a>
## [v3.2.0] - 2024-04-24
### Features
- **serveResources:** Dynamically generate missing library manifest.json [`d31f2c5`](https://github.com/SAP/ui5-server/commit/d31f2c57aa0b0c72fb033c41587ff257312838d1)


<a name="v3.1.5"></a>
## [v3.1.5] - 2023-12-12
### Bug Fixes
- Unsafe jQuery plugin ([#618](https://github.com/SAP/ui5-server/issues/618)) [`ff1dc29`](https://github.com/SAP/ui5-server/commit/ff1dc297a9221f534173ec44e38e5a6eec6b9ba5)


<a name="v3.1.4"></a>
## [v3.1.4] - 2023-11-20

<a name="v3.1.3"></a>
## [v3.1.3] - 2023-06-06
### Bug Fixes
- **middleware/testRunner:** Update resources from OpenUI5 [`f0c7291`](https://github.com/SAP/ui5-server/commit/f0c7291d2dc1d753e04184fdf2127c278810f0c4)


<a name="v3.1.2"></a>
## [v3.1.2] - 2023-04-12
### Bug Fixes
- Fix JSDoc names of typedefs in MiddlewareUtil. [`dbd6fe1`](https://github.com/SAP/ui5-server/commit/dbd6fe19c229471ba2b8621b97b8f5a9bca56a78)


<a name="v3.1.1"></a>
## [v3.1.1] - 2023-03-16
### Bug Fixes
- Allow serving of propertyfiles of non component project types [`1bc6ec7`](https://github.com/SAP/ui5-server/commit/1bc6ec72a15ae7df558c4938b2670d0e78af710b)


<a name="v3.1.0"></a>
## [v3.1.0] - 2023-03-01
### Features
- **CSP:** Increase defaultPolicy2 to sap-target-level-3 ([#580](https://github.com/SAP/ui5-server/issues/580)) [`5a981a1`](https://github.com/SAP/ui5-server/commit/5a981a1d7f2d2aaffbcd2f68e02206a8bdb0494b)


<a name="v3.0.1"></a>
## [v3.0.1] - 2023-02-16
### Bug Fixes
- **MiddlewareUtil:** Provide framework configuration getters to custom tasks ([#579](https://github.com/SAP/ui5-server/issues/579)) [`58bf4f5`](https://github.com/SAP/ui5-server/commit/58bf4f5953aed3a1fc6f4f4353e37fe6c3b7094f)


<a name="v3.0.0"></a>
## [v3.0.0] - 2023-02-09
### Breaking Changes
- Transform to ES Modules ([#501](https://github.com/SAP/ui5-server/issues/501)) [`05e3013`](https://github.com/SAP/ui5-server/commit/05e3013605e28e9ab5a785aa57616473d40e5710)
- Remove "/proxy" endpoint ([#550](https://github.com/SAP/ui5-server/issues/550)) [`4bdf839`](https://github.com/SAP/ui5-server/commit/4bdf839e96f67ddbc4cb2a18216921d54df4006e)
- Require Project Graph ([#479](https://github.com/SAP/ui5-server/issues/479)) [`d62f85a`](https://github.com/SAP/ui5-server/commit/d62f85a193115a587dbf58225e8130318a475023)
- Require Node.js >= 16.18.0 / npm >= 8 [`63d216a`](https://github.com/SAP/ui5-server/commit/63d216a3ba34e8e50acc6621d43a78c3a0804d67)

### BREAKING CHANGE
This package has been transformed to ES Modules. Therefore it no longer provides a CommonJS export.
If your project uses CommonJS, it needs to be converted to ESM or use a dynamic import.

For more information see also:

- https://sap.github.io/ui5-tooling/updates/migrate-v3/
- https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c

This removes the "/proxy" endpoint and the corresponding
"connectUi5Proxy" middleware from the standard ui5-server.
Internally, this middleware made use of the connect-openui5 proxy
implementation (https://github.com/SAP/connect-openui5#proxy).

More sophisticated proxy solutions for ui5-server are already available
in the form of custom middleware extensions from the UI5-community.

The UI5 Team might provide a dedicated custom middleware extension,
with similar functionality, in the future.

- Server now requires a Project Graph instance instead.
- Standard middleware now rely on Project instances being available on Resources (see https://github.com/SAP/ui5-fs/pull/381)
- MiddlewareRepository#addMiddleware has been removed. Custom middleware need to be added to the project graph instead

Support for older Node.js and npm releases has been dropped.
Only Node.js v16.18.0 and npm v8 or higher are supported.

### Features
- **MiddlewareUtil:** Add getProject/getDependencies/resourceFactory API to interface ([#547](https://github.com/SAP/ui5-server/issues/547)) [`ab28f78`](https://github.com/SAP/ui5-server/commit/ab28f789ba929ef1319b6e562267e9717cc9937b)


<a name="v2.4.1"></a>
## [v2.4.1] - 2022-11-30
### Dependency Updates
- Bump connect-openui5 from 0.10.2 to 0.10.3 [`20b6fc8`](https://github.com/SAP/ui5-server/commit/20b6fc8fbad69265bae3e8f7efd320f6297ac4c4)


<a name="v2.4.0"></a>
## [v2.4.0] - 2021-10-19
### Features
- Enhance versionInfo middleware to serve sap-ui-version.json ([#420](https://github.com/SAP/ui5-server/issues/420)) [`c6f83f5`](https://github.com/SAP/ui5-server/commit/c6f83f5472eb2fe6a8d4eca10ecdc5f4b522bc3c)


<a name="v2.3.1"></a>
## [v2.3.1] - 2021-07-23

<a name="v2.3.0"></a>
## [v2.3.0] - 2021-07-01
### Features
- **server:** Expose configuration options for SAP CSP policies [`55d6a96`](https://github.com/SAP/ui5-server/commit/55d6a96cc1a3c762af8173d9fb9588fe742a302d)


<a name="v2.2.10"></a>
## [v2.2.10] - 2021-06-01

<a name="v2.2.9"></a>
## [v2.2.9] - 2021-03-11
### Dependency Updates
- Bump connect-openui5 from 0.10.1 to 0.10.2 [`849957d`](https://github.com/SAP/ui5-server/commit/849957d39a45c22c5c94f787d66eeccc58eb4d2d)


<a name="v2.2.8"></a>
## [v2.2.8] - 2021-02-09

<a name="v2.2.7"></a>
## [v2.2.7] - 2020-11-06

<a name="v2.2.6"></a>
## [v2.2.6] - 2020-10-22
### Bug Fixes
- Improve parallel theme request handling [`88bc0d6`](https://github.com/SAP/ui5-server/commit/88bc0d6d4e5ca8bb191029335451713579360e1c)
- **nonReadRequests middleware:** Use response API [`2d2325f`](https://github.com/SAP/ui5-server/commit/2d2325f638820d25738ddbd56afe0d104e37f2e0)


<a name="v2.2.5"></a>
## [v2.2.5] - 2020-10-06
### Bug Fixes
- Discovery middleware shouldn't fail when lib names overlap ([#362](https://github.com/SAP/ui5-server/issues/362)) [`f5067ce`](https://github.com/SAP/ui5-server/commit/f5067ce38b89442948ce096e5d89651e8970bdb9)


<a name="v2.2.4"></a>
## [v2.2.4] - 2020-09-10

<a name="v2.2.3"></a>
## [v2.2.3] - 2020-09-02
### Bug Fixes
- **middleware/testRunner:** Update resources from OpenUI5 [`55b1fe7`](https://github.com/SAP/ui5-server/commit/55b1fe742be29b176e55985a0315dcead684d257)


<a name="v2.2.2"></a>
## [v2.2.2] - 2020-08-11

<a name="v2.2.1"></a>
## [v2.2.1] - 2020-07-14
### Bug Fixes
- **MiddlewareManager:** Provide MiddlewareUtil to custom middleware using specVersion 2.1 [`3e249fa`](https://github.com/SAP/ui5-server/commit/3e249fa4333fb6afa0e512201959bfcbcee196d0)
- **Node.js API:** TypeScript type definition support ([#334](https://github.com/SAP/ui5-server/issues/334)) [`b66f9cc`](https://github.com/SAP/ui5-server/commit/b66f9cc10b35b2997f5e9b3840ef92dd504c8a33)


<a name="v2.2.0"></a>
## [v2.2.0] - 2020-07-01
### Bug Fixes
- **MiddlewareManager:** Update SAP Target CSP Policies [`269c22c`](https://github.com/SAP/ui5-server/commit/269c22c80a6682a3d680c47e768f69a20ecabcd0)

### Features
- **CSP:** Add ignorePaths option ([#331](https://github.com/SAP/ui5-server/issues/331)) [`27a962e`](https://github.com/SAP/ui5-server/commit/27a962eb80fd7de95c6076f7d307e0dd06dac057)


<a name="v2.1.0"></a>
## [v2.1.0] - 2020-06-15
### Features
- **csp:** enable tracking and serving of csp reports ([#323](https://github.com/SAP/ui5-server/issues/323)) [`e0a0c5e`](https://github.com/SAP/ui5-server/commit/e0a0c5e022c2c0041c6cf52631ef834cafe1f873)


<a name="v2.0.3"></a>
## [v2.0.3] - 2020-05-14

<a name="v2.0.2"></a>
## [v2.0.2] - 2020-04-30
### Bug Fixes
- **CSP Middleware:** Use res.getHeader/setHeader methods ([#312](https://github.com/SAP/ui5-server/issues/312)) [`c53525c`](https://github.com/SAP/ui5-server/commit/c53525ca4bb5825d241d0f137ce3912d681e6548)


<a name="v2.0.1"></a>
## [v2.0.1] - 2020-04-15
### Dependency Updates
- Bump devcert-sanscache from 0.4.6 to 0.4.8 ([#306](https://github.com/SAP/ui5-server/issues/306)) [`2a9d517`](https://github.com/SAP/ui5-server/commit/2a9d51776e967362d959eef45ce9533a9a27650c)


<a name="v2.0.0"></a>
## [v2.0.0] - 2020-03-31
### Breaking Changes
- Require Node.js >= 10 [`a8c7a13`](https://github.com/SAP/ui5-server/commit/a8c7a13f68426012e5ff9cfddb365bb32c46f9dc)
- **serveResources middleware:** Expect *.properties files in UTF-8 by default [`af7f9ad`](https://github.com/SAP/ui5-server/commit/af7f9ad52aa834f63c163b99eb4fbc8d1bb05079)

### Bug Fixes
- Handle encoding in request paths correctly [`256b3f0`](https://github.com/SAP/ui5-server/commit/256b3f037880aad077b0158e3551e10ce8a3dbc7)

### Features
- Add MiddlewareUtil providing convenience functions to all middleware [`b8ab775`](https://github.com/SAP/ui5-server/commit/b8ab775039635a25109797b92fe34358057ea5e8)
- Add test runner middleware [`ea77e20`](https://github.com/SAP/ui5-server/commit/ea77e201e20545fca7494fc581aa42adbcb2c1d7)

### BREAKING CHANGE

If the project a "*.properties" resource originates from cannot be
determined, or if the project does not define a
propertiesFileSourceEncoding configuration or uses a legacy specVersion
(<2.0), the serveResources middleware assumes that the resource is UTF-8
encoded instead of ISO-8859-1.

Support for older Node.js releases has been dropped.
Only Node.js v10 or higher is supported.


<a name="v1.6.0"></a>
## [v1.6.0] - 2020-02-24
### Bug Fixes
- **versionInfo:** Fix pattern to glob for .library files [`3621f78`](https://github.com/SAP/ui5-server/commit/3621f7868dec891f8746ca4b66cf43c4d5d9782b)

### Features
- **serveThemes:** Support experimental CSS variables and skeleton build ([#278](https://github.com/SAP/ui5-server/issues/278)) [`47d4b55`](https://github.com/SAP/ui5-server/commit/47d4b55986fd84ef85f4b42e9c91f16017183c16)


<a name="v1.5.4"></a>
## [v1.5.4] - 2020-02-10
### Bug Fixes
- Ensure proper handling of multi-byte characters in streams ([#280](https://github.com/SAP/ui5-server/issues/280)) [`fe652e4`](https://github.com/SAP/ui5-server/commit/fe652e410bd0eab506fc42036ad2cfa374fa5a6c)
- **serveIndex:** Add missing dependency to "graceful-fs" [`e09c472`](https://github.com/SAP/ui5-server/commit/e09c472eb20ed3d0b914c8b2e1d5f22bb8476dca)


<a name="v1.5.3"></a>
## [v1.5.3] - 2020-01-24
### Bug Fixes
- **sslUtils:** Fix Invalid Common Name error [`db06db7`](https://github.com/SAP/ui5-server/commit/db06db7a371ea7254c408f01cf231de9367c8b0d)


<a name="v1.5.2"></a>
## [v1.5.2] - 2019-12-16
### Bug Fixes
- Resolve ERR_CERT_REVOKED error for newly generated SSL certs [`f2e1522`](https://github.com/SAP/ui5-server/commit/f2e15229569e68990f63cd38849eb937d2ad9cb8)


<a name="v1.5.1"></a>
## [v1.5.1] - 2019-11-19
### Dependency Updates
- Bump connect-openui5 from 0.8.0 to 0.9.0 [`0c6d502`](https://github.com/SAP/ui5-server/commit/0c6d50263c4828f5070404ac9dfa337667b24371)


<a name="v1.5.0"></a>
## [v1.5.0] - 2019-11-07
### Features
- **serveIndex:** use serve-index for serving the application index [`d6ea507`](https://github.com/SAP/ui5-server/commit/d6ea507bdd649653a865f01d4e076caa4313639f)


<a name="v1.4.0"></a>
## [v1.4.0] - 2019-10-24
### Features
- **Custom Middleware Extensibility:** Allow multiple definitions of the same custom middleware ([#246](https://github.com/SAP/ui5-server/issues/246)) [`55a24ef`](https://github.com/SAP/ui5-server/commit/55a24ef134b01b43683bc21fb24b46d4e472232d)


<a name="v1.3.0"></a>
## [v1.3.0] - 2019-07-31
### Features
- Properties File Escaping ([#214](https://github.com/SAP/ui5-server/issues/214)) [`dd4844d`](https://github.com/SAP/ui5-server/commit/dd4844d53b787dc14bc5eecae2bc5674425200b7)


<a name="v1.2.0"></a>
## [v1.2.0] - 2019-07-10
### Features
- **Server:** Add handling for custom middleware ([#200](https://github.com/SAP/ui5-server/issues/200)) [`037b3bc`](https://github.com/SAP/ui5-server/commit/037b3bc001b86061c807e78584e69c53e89d8b96)


<a name="v1.1.3"></a>
## [v1.1.3] - 2019-06-24
### Bug Fixes
- **serveResources:** Correctly encode non UTF-8 resources [`1ee6723`](https://github.com/SAP/ui5-server/commit/1ee6723b5e5dac653c76a5078ee4afd6af96f8ac)


<a name="v1.1.2"></a>
## [v1.1.2] - 2019-06-03
### Bug Fixes
- **Middleware:** Allow usage without express server [`4d971b4`](https://github.com/SAP/ui5-server/commit/4d971b4babade56fef154dc4a7a524d6ffa8ad1b)


<a name="v1.1.1"></a>
## [v1.1.1] - 2019-05-13
### Bug Fixes
- Makes CSP middleware work in an environment without express server ([#184](https://github.com/SAP/ui5-server/issues/184)) [`c3089ad`](https://github.com/SAP/ui5-server/commit/c3089adeee030f4ace899c01944006583146e32e)


<a name="v1.1.0"></a>
## [v1.1.0] - 2019-04-25
### Dependency Updates
- Bump [@ui5](https://github.com/ui5)/fs from 1.0.1 to 1.0.2 ([#166](https://github.com/SAP/ui5-server/issues/166)) [`5ff4765`](https://github.com/SAP/ui5-server/commit/5ff476504254baf304c2cb9db83746438a10be92)
- Bump [@ui5](https://github.com/ui5)/logger from 1.0.0 to 1.0.1 ([#165](https://github.com/SAP/ui5-server/issues/165)) [`21be52a`](https://github.com/SAP/ui5-server/commit/21be52a109abd5096daefc54ce038a95bd437f6f)
- Bump [@ui5](https://github.com/ui5)/builder from 1.0.0 to 1.0.1 ([#126](https://github.com/SAP/ui5-server/issues/126)) [`e22c118`](https://github.com/SAP/ui5-server/commit/e22c1185e2e5fc718b50704b6a64a121413b3f93)
- Bump [@ui5](https://github.com/ui5)/fs from 1.0.0 to 1.0.1 [`255766a`](https://github.com/SAP/ui5-server/commit/255766a62981af2e5ef584015d2951d39189ef3a)

### Features
- Add Server Option to Send SAP's Target CSPs by default ([#179](https://github.com/SAP/ui5-server/issues/179)) [`4f05967`](https://github.com/SAP/ui5-server/commit/4f059670306c97ab5f34d82bb335f5ee21d73c72)


<a name="v1.0.0"></a>
## [v1.0.0] - 2019-01-10
### Dependency Updates
- Bump [@ui5](https://github.com/ui5)/project from 0.2.5 to 1.0.0 ([#109](https://github.com/SAP/ui5-server/issues/109)) [`84d31a5`](https://github.com/SAP/ui5-server/commit/84d31a5340f77fc6ec54e9c5829c8ad656b2adb1)
- Bump [@ui5](https://github.com/ui5)/builder from 0.2.9 to 1.0.0 ([#108](https://github.com/SAP/ui5-server/issues/108)) [`8e39375`](https://github.com/SAP/ui5-server/commit/8e393754f71efe14e9cd5daf345012f2b1d7926d)
- Bump [@ui5](https://github.com/ui5)/fs from 0.2.0 to 1.0.0 ([#107](https://github.com/SAP/ui5-server/issues/107)) [`93e39af`](https://github.com/SAP/ui5-server/commit/93e39afc3e728ff2e829865d7de3c635a43241f0)
- Bump [@ui5](https://github.com/ui5)/logger from 0.2.2 to 1.0.0 ([#106](https://github.com/SAP/ui5-server/issues/106)) [`3687ad6`](https://github.com/SAP/ui5-server/commit/3687ad6b224cf9c37359de30917bc711fe7b239a)


<a name="v0.2.2"></a>
## [v0.2.2] - 2018-10-29

<a name="v0.2.1"></a>
## [v0.2.1] - 2018-07-17

<a name="v0.2.0"></a>
## [v0.2.0] - 2018-07-12

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

<a name="v0.0.1"></a>
## v0.0.1 - 2018-06-06
[v4.0.6]: https://github.com/SAP/ui5-server/compare/v4.0.5...v4.0.6
[v4.0.5]: https://github.com/SAP/ui5-server/compare/v4.0.4...v4.0.5
[v4.0.4]: https://github.com/SAP/ui5-server/compare/v4.0.3...v4.0.4
[v4.0.3]: https://github.com/SAP/ui5-server/compare/v4.0.2...v4.0.3
[v4.0.2]: https://github.com/SAP/ui5-server/compare/v4.0.1...v4.0.2
[v4.0.1]: https://github.com/SAP/ui5-server/compare/v4.0.0...v4.0.1
[v4.0.0]: https://github.com/SAP/ui5-server/compare/v3.1.5...v4.0.0
[v3.2.1]: https://github.com/SAP/ui5-server/compare/v3.2.0...v3.2.1
[v3.2.0]: https://github.com/SAP/ui5-server/compare/v3.1.5...v3.2.0
[v3.1.5]: https://github.com/SAP/ui5-server/compare/v3.1.4...v3.1.5
[v3.1.4]: https://github.com/SAP/ui5-server/compare/v3.1.3...v3.1.4
[v3.1.3]: https://github.com/SAP/ui5-server/compare/v3.1.2...v3.1.3
[v3.1.2]: https://github.com/SAP/ui5-server/compare/v3.1.1...v3.1.2
[v3.1.1]: https://github.com/SAP/ui5-server/compare/v3.1.0...v3.1.1
[v3.1.0]: https://github.com/SAP/ui5-server/compare/v3.0.1...v3.1.0
[v3.0.1]: https://github.com/SAP/ui5-server/compare/v3.0.0...v3.0.1
[v3.0.0]: https://github.com/SAP/ui5-server/compare/v2.4.0...v3.0.0
[v2.4.1]: https://github.com/SAP/ui5-server/compare/v2.4.0...v2.4.1
[v2.4.0]: https://github.com/SAP/ui5-server/compare/v2.3.1...v2.4.0
[v2.3.1]: https://github.com/SAP/ui5-server/compare/v2.3.0...v2.3.1
[v2.3.0]: https://github.com/SAP/ui5-server/compare/v2.2.10...v2.3.0
[v2.2.10]: https://github.com/SAP/ui5-server/compare/v2.2.9...v2.2.10
[v2.2.9]: https://github.com/SAP/ui5-server/compare/v2.2.8...v2.2.9
[v2.2.8]: https://github.com/SAP/ui5-server/compare/v2.2.7...v2.2.8
[v2.2.7]: https://github.com/SAP/ui5-server/compare/v2.2.6...v2.2.7
[v2.2.6]: https://github.com/SAP/ui5-server/compare/v2.2.5...v2.2.6
[v2.2.5]: https://github.com/SAP/ui5-server/compare/v2.2.4...v2.2.5
[v2.2.4]: https://github.com/SAP/ui5-server/compare/v2.2.3...v2.2.4
[v2.2.3]: https://github.com/SAP/ui5-server/compare/v2.2.2...v2.2.3
[v2.2.2]: https://github.com/SAP/ui5-server/compare/v2.2.1...v2.2.2
[v2.2.1]: https://github.com/SAP/ui5-server/compare/v2.2.0...v2.2.1
[v2.2.0]: https://github.com/SAP/ui5-server/compare/v2.1.0...v2.2.0
[v2.1.0]: https://github.com/SAP/ui5-server/compare/v2.0.3...v2.1.0
[v2.0.3]: https://github.com/SAP/ui5-server/compare/v2.0.2...v2.0.3
[v2.0.2]: https://github.com/SAP/ui5-server/compare/v2.0.1...v2.0.2
[v2.0.1]: https://github.com/SAP/ui5-server/compare/v2.0.0...v2.0.1
[v2.0.0]: https://github.com/SAP/ui5-server/compare/v1.6.0...v2.0.0
[v1.6.0]: https://github.com/SAP/ui5-server/compare/v1.5.4...v1.6.0
[v1.5.4]: https://github.com/SAP/ui5-server/compare/v1.5.3...v1.5.4
[v1.5.3]: https://github.com/SAP/ui5-server/compare/v1.5.2...v1.5.3
[v1.5.2]: https://github.com/SAP/ui5-server/compare/v1.5.1...v1.5.2
[v1.5.1]: https://github.com/SAP/ui5-server/compare/v1.5.0...v1.5.1
[v1.5.0]: https://github.com/SAP/ui5-server/compare/v1.4.0...v1.5.0
[v1.4.0]: https://github.com/SAP/ui5-server/compare/v1.3.0...v1.4.0
[v1.3.0]: https://github.com/SAP/ui5-server/compare/v1.2.0...v1.3.0
[v1.2.0]: https://github.com/SAP/ui5-server/compare/v1.1.3...v1.2.0
[v1.1.3]: https://github.com/SAP/ui5-server/compare/v1.1.2...v1.1.3
[v1.1.2]: https://github.com/SAP/ui5-server/compare/v1.1.1...v1.1.2
[v1.1.1]: https://github.com/SAP/ui5-server/compare/v1.1.0...v1.1.1
[v1.1.0]: https://github.com/SAP/ui5-server/compare/v1.0.0...v1.1.0
[v1.0.0]: https://github.com/SAP/ui5-server/compare/v0.2.2...v1.0.0
[v0.2.2]: https://github.com/SAP/ui5-server/compare/v0.2.1...v0.2.2
[v0.2.1]: https://github.com/SAP/ui5-server/compare/v0.2.0...v0.2.1
[v0.2.0]: https://github.com/SAP/ui5-server/compare/v0.1.2...v0.2.0
[v0.1.2]: https://github.com/SAP/ui5-server/compare/v0.1.1...v0.1.2
[v0.1.1]: https://github.com/SAP/ui5-server/compare/v0.1.0...v0.1.1
[v0.1.0]: https://github.com/SAP/ui5-server/compare/v0.0.1...v0.1.0
