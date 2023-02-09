# Changelog
All notable changes to this project will be documented in this file.  
This project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

A list of unreleased changes can be found [here](https://github.com/SAP/ui5-logger/compare/v3.0.0...HEAD).

<a name="v3.0.0"></a>
## [v3.0.0] - 2023-02-09
### Breaking Changes

- Replace npmlog with @ui5/logger/Logger (#363) [`66a159a`](https://github.com/SAP/ui5-logger/commit/66a159acd9b67a27dd66d1e8056c362585f51bcf)
- Deprecate advanced APIs in preparation of refactoring [`3aea5e7`](https://github.com/SAP/ui5-logger/commit/3aea5e766f9bda156e8c7e62a2e8c65f613ef7e9)
- Transform to ES Modules ([#306](https://github.com/SAP/ui5-logger/issues/306)) [`c79608b`](https://github.com/SAP/ui5-logger/commit/c79608b0e432168ca8570530b63a456b9ddd12cb)
- Require Node.js ^16.18.0, >=18.12.0 / npm >= 8 [`a8af8a7`](https://github.com/SAP/ui5-logger/commit/a8af8a7a82c6f657ac10b5018e654939d90fd81f)

### BREAKING CHANGE

The @ui5/logger got refactored and as a result its API went public.

Remove the usage of npmlog and refactor @ui5/logger modules to emit log events which are then caught in dedicated handlers. This is somewhat inspired by npm's proc-log module.

This breaking change removes capabilities that are likely to change and should not be part of a public API.

This will ensure that later changes to the module can be donen in a
compatible manner.

Relevant changes:

- Restrict log-methods to two argument only. The use of placeholders
  like '%s' is no longer supported. A warning will be logged if more
  than two argument is supplied. Placeholders will be replaced with a
  deprecation message. We suggest the use of template literals.
- Deprecate #getGroupLogger method. Calling it throws an error.
  It will be removed in one of the next patch releases
- Deprecate #setShowProgress method. Calling it throws an error.
  It will be removed in one of the next patch releases
- Remove GroupLogger and TaskLogger classes. Similar functionality might
  be re-added in a later release.

This package has been transformed to ES Modules. Therefore it no longer provides a CommonJS export.
If your project uses CommonJS, it needs to be converted to ES Modules or use a dynamic import.

For more information see also:

- https://sap.github.io/ui5-tooling/updates/migrate-v3/
- https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c

Support for older Node.js and npm releases has been dropped.
Only Node.js versions v16.18.0, v18.12.0 or higher as well as npm v8 or higher are supported.

### Features

- Add new log level "perf" [`acf0c71`](https://github.com/SAP/ui5-logger/commit/acf0c717612f440ea7a114e757c05d358ae523a7)


<a name="v2.0.1"></a>
## [v2.0.1] - 2020-10-22
### Bug Fixes
- Typos in error messages [`1d25902`](https://github.com/SAP/ui5-logger/commit/1d2590223c4332f5ea6f1326b23ecf584fea5934)

<a name="v2.0.0"></a>
## [v2.0.0] - 2020-03-31
### Breaking Changes
- Require Node.js >= 10 [`1825d10`](https://github.com/SAP/ui5-logger/commit/1825d1013a88f164cbbfbf579c3e8e02df2b5082)

### BREAKING CHANGE

Support for older Node.js releases has been dropped.
Only Node.js v10 or higher is supported.

<a name="v1.0.2"></a>
## [v1.0.2] - 2019-10-14
### Bug Fixes
- Fix handling of log level "silent" [`020ced8`](https://github.com/SAP/ui5-logger/commit/020ced85a82d33c94e429aa28983affa0d8341ba)

<a name="v1.0.1"></a>
## [v1.0.1] - 2019-03-21

<a name="v1.0.0"></a>
## [v1.0.0] - 2019-01-09

<a name="v0.2.2"></a>
## [v0.2.2] - 2018-11-16
### Features
- Add UI5_LOG_LVL environment variable [`c3e65c4`](https://github.com/SAP/ui5-logger/commit/c3e65c444045832773e4dc43ffa2baf903a27e52)

<a name="v0.2.1"></a>
## [v0.2.1] - 2018-10-29

<a name="v0.2.0"></a>
## [v0.2.0] - 2018-07-11

<a name="v0.1.0"></a>
## [v0.1.0] - 2018-06-26

<a name="v0.0.1"></a>
## v0.0.1 - 2018-06-06
[v3.0.0]: https://github.com/SAP/ui5-logger/compare/v2.0.1...v3.0.0
[v2.0.1]: https://github.com/SAP/ui5-logger/compare/v2.0.0...v2.0.1
[v2.0.0]: https://github.com/SAP/ui5-logger/compare/v1.0.2...v2.0.0
[v1.0.2]: https://github.com/SAP/ui5-logger/compare/v1.0.1...v1.0.2
[v1.0.1]: https://github.com/SAP/ui5-logger/compare/v1.0.0...v1.0.1
[v1.0.0]: https://github.com/SAP/ui5-logger/compare/v0.2.2...v1.0.0
[v0.2.2]: https://github.com/SAP/ui5-logger/compare/v0.2.1...v0.2.2
[v0.2.1]: https://github.com/SAP/ui5-logger/compare/v0.2.0...v0.2.1
[v0.2.0]: https://github.com/SAP/ui5-logger/compare/v0.1.0...v0.2.0
[v0.1.0]: https://github.com/SAP/ui5-logger/compare/v0.0.1...v0.1.0
