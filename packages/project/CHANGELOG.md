# Changelog
All notable changes to this project will be documented in this file.  
This project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

A list of unreleased changes can be found [here](https://github.com/SAP/ui5-project/compare/v0.2.1...HEAD).

<a name="v0.2.1"></a>
## [v0.2.1] - 2018-10-29
### Features
- Add shim extension [`93c9b39`](https://github.com/SAP/ui5-project/commit/93c9b3960ca36f240c5f8453a89f72792a01fe92)
- Add "extension" projects [`476b785`](https://github.com/SAP/ui5-project/commit/476b785810d6993d2a3e21707ffa67e568e67eac)

### Internal Changes
- Add addt'l project-shim extension tests [`e0ecb7f`](https://github.com/SAP/ui5-project/commit/e0ecb7f6a0da334f423a1267c310e687b9854724)
- Add missing cross-env dependency [`0f2bd76`](https://github.com/SAP/ui5-project/commit/0f2bd76fdc03103d4b88b4764d94ebb353340fd5)
- Apply extensions only once [`0488a59`](https://github.com/SAP/ui5-project/commit/0488a5959a0b2b87d1945866da07bc011103c1b2)
- Apply extensions found in root project [`5866cad`](https://github.com/SAP/ui5-project/commit/5866cadc04348c15c2ae7abefe70b934f6cf5b99)
- Add .npmrc to enforce public registry [`78dd5d7`](https://github.com/SAP/ui5-project/commit/78dd5d7fb72a9c51b56b47179dd823f016255cd3)
- **CHANGELOG:** Fix scope detection in commit messages [`955ab92`](https://github.com/SAP/ui5-project/commit/955ab9275b6ee6d0261f9033ed110ac8b684abcf)
- **Coveralls:** Use parallel setting to reduce number of PR comments [`cbcc8ea`](https://github.com/SAP/ui5-project/commit/cbcc8ea8f15d4f8c5ac0124024bf67f29ef14bd9)


<a name="v0.2.0"></a>
## [v0.2.0] - 2018-07-11
### Internal Changes
- Update min Node.js version to >=8.5 [`fc96d87`](https://github.com/SAP/ui5-project/commit/fc96d874c08b54f887cf375eb5028b298c96067f)
- **package.json:** Define files to publish [`01d543c`](https://github.com/SAP/ui5-project/commit/01d543c682f4a0f6fbf15fab0a73b91a5424acee)


<a name="v0.1.0"></a>
## [v0.1.0] - 2018-06-26
### Bug Fixes
- Fix some typos in log messages ([#17](https://github.com/SAP/ui5-project/issues/17)) [`1f2f2fd`](https://github.com/SAP/ui5-project/commit/1f2f2fd164abaf449cc5e7d94ec792f469710207)
- **npm translator:** Fix endless loop in case of dependency cycles ([#15](https://github.com/SAP/ui5-project/issues/15)) [`cf31112`](https://github.com/SAP/ui5-project/commit/cf3111288278e8dd36a09b549bd2b254e86af041)

### Internal Changes
- Update ui5-builder and ui5-logger dependency [`c4aaa81`](https://github.com/SAP/ui5-project/commit/c4aaa81ed813fb96a24a289ceb54bc2537bc70e7)
- Add coveralls and dm-badges [`0fb9132`](https://github.com/SAP/ui5-project/commit/0fb9132ca87e0dd959f1dea4dd3d584f0205baad)
- **CHANGELOG:** Fix GitHub release template [`2ca710b`](https://github.com/SAP/ui5-project/commit/2ca710b04d247e7799266644c1a3099c6621d345)
- **README:** Pre-Alpha -> Alpha [`a988310`](https://github.com/SAP/ui5-project/commit/a988310ae2b810dcff9e8253d32d6474c9ee1da9)


<a name="v0.0.1"></a>
## v0.0.1 - 2018-06-06
### Bug Fixes
- **npm t8r:** Fix collection fallback with missing package.json [`578466f`](https://github.com/SAP/ui5-project/commit/578466fdedf871091874c93d1a9305859e34e3ed)

### Internal Changes
- Prepare npm release [`0467b6a`](https://github.com/SAP/ui5-project/commit/0467b6ac2e87dadd7319fe02901c3b24a3901663)
- Update .editorconfig [`1644a10`](https://github.com/SAP/ui5-project/commit/1644a105337ff83c1f800b99451881f4d8952b8f)
- Add chglog config + npm release scripts [`574f976`](https://github.com/SAP/ui5-project/commit/574f9761debb0cf527e4dfe9d09a73b7abfecc49)
- Update dependencies [`51ddbc8`](https://github.com/SAP/ui5-project/commit/51ddbc854e1e28c6455cbe98fdf517601e560f71)
- Add missing test module dependencies [`0d1d57a`](https://github.com/SAP/ui5-project/commit/0d1d57a0f4643ea171b134d1639404fc51fdb051)
- Add travis CI badge + package.json cleanup [`7769590`](https://github.com/SAP/ui5-project/commit/776959063ab673a92ebfd4cf4c7ba253aae158a8)
- Fix links to CONTRIBUTING.md file [`734a870`](https://github.com/SAP/ui5-project/commit/734a870d6a68f0370626d5a17906afabf1cd27d1)
- **ESLint:** Activate no-var rule [`6916828`](https://github.com/SAP/ui5-project/commit/6916828560c1765bdd64306c8b1c4950a36f0c8b)
- **ESLint:** Activate no-console [`df406da`](https://github.com/SAP/ui5-project/commit/df406dab0888b16b9c66f4fe5a2d7e026ad9f4f4)
- **Travis:** Add node.js 10 to test matrix [`5f26276`](https://github.com/SAP/ui5-project/commit/5f2627668b7faa554b8c3810899828d3be6fd63f)
- **npm t8r:** Improve handling of missing package.json [`4b32134`](https://github.com/SAP/ui5-project/commit/4b321345139058dc821fb08c4556aff88366ea86)


[v0.2.1]: https://github.com/SAP/ui5-project/compare/v0.2.0...v0.2.1
[v0.2.0]: https://github.com/SAP/ui5-project/compare/v0.1.0...v0.2.0
[v0.1.0]: https://github.com/SAP/ui5-project/compare/v0.0.1...v0.1.0
