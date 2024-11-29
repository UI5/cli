# Changelog
All notable changes to this project will be documented in this file.  
This project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

A list of unreleased changes can be found [here](https://github.com/SAP/ui5-builder/compare/v4.0.4...HEAD).

<a name="v4.0.4"></a>
## [v4.0.4] - 2024-11-13
### Dependency Updates
- Switch from "rimraf" to native "fs.rm" ([#1098](https://github.com/SAP/ui5-builder/issues/1098)) [`0adf4da`](https://github.com/SAP/ui5-builder/commit/0adf4da0e747f1fb46cf0bf0da7b3e0af8e9bcec)


<a name="v4.0.3"></a>
## [v4.0.3] - 2024-08-27

<a name="v4.0.2"></a>
## [v4.0.2] - 2024-08-20
### Dependency Updates
- Bump cheerio from 1.0.0-rc.12 to 1.0.0 ([#1078](https://github.com/SAP/ui5-builder/issues/1078)) [`d80c79d`](https://github.com/SAP/ui5-builder/commit/d80c79d5578516cf533e649e73d55602afa8b908)


<a name="v4.0.1"></a>
## [v4.0.1] - 2024-07-29
### Bug Fixes
- **manifestEnhancer:** Improve error handling [`16a4e78`](https://github.com/SAP/ui5-builder/commit/16a4e785ab71f8714b3926aa0bb8573f8da4dd08)
- **manifestEnhancer:** Fix fallbackLocale handling [`421a375`](https://github.com/SAP/ui5-builder/commit/421a37577c11c50d938bc59f3b8fca371a703cd3)


<a name="v4.0.0"></a>
## [v4.0.0] - 2024-07-23
### Breaking Changes
- Drop node v21 support [`7b27171`](https://github.com/SAP/ui5-builder/commit/7b2717166686aeef8d19b1f3134ef4f39de25a80)
- Discontinue bundling of JavaScript modules as string [`7691b08`](https://github.com/SAP/ui5-builder/commit/7691b08c4cd8abc7fe3922ec913f80dca372ba4f)
- Task API arguments rename ([#995](https://github.com/SAP/ui5-builder/issues/995)) [`d1f87e0`](https://github.com/SAP/ui5-builder/commit/d1f87e0cb8b65005b034ff00b7e0d66f4a5d279e)
- Require Node.js 20.11.x/>=21.2.0 and npm >=10 [`b76ff75`](https://github.com/SAP/ui5-builder/commit/b76ff7588d65c5b5ff8fb9861a3562680e8c2e74)
- **Bundling:** Enforce usage of sap.ui.predefine instead function wrappers ([#1021](https://github.com/SAP/ui5-builder/issues/1021)) [`4bda728`](https://github.com/SAP/ui5-builder/commit/4bda7289383e8645556c68976a05db0ab5698a2b)

### Dependency Updates
- Bump rimraf from 5.0.8 to 6.0.1 [`2b4f309`](https://github.com/SAP/ui5-builder/commit/2b4f3094107bfa7ace18091731fe2f048b233754)
- Bump terser from 5.29.1 to 5.29.2 ([#1000](https://github.com/SAP/ui5-builder/issues/1000)) [`2b6da9e`](https://github.com/SAP/ui5-builder/commit/2b6da9ed131ab21c18fdbd9a7c7328dee83bd41c)
- Bump espree from 9.6.1 to 10.0.1 [`08eb716`](https://github.com/SAP/ui5-builder/commit/08eb7165d638ccf3b078eeb3feed763765821f53)
- Bump terser from 5.27.1 to 5.27.2 ([#991](https://github.com/SAP/ui5-builder/issues/991)) [`204145d`](https://github.com/SAP/ui5-builder/commit/204145d8db2a0f76d134206b33fbef3bf1edabbf)
- Bump workerpool from 6.5.1 to 9.1.0 [`b78a70c`](https://github.com/SAP/ui5-builder/commit/b78a70cf1adec6b78d78593898942f0c7c47edca)

### Features
- Apply default values to bunde definitions for standard tasks ([#1033](https://github.com/SAP/ui5-builder/issues/1033)) [`4178e1a`](https://github.com/SAP/ui5-builder/commit/4178e1a0315ad16b7774183a18e326f8c52f5f44)
- **Bundle 'require' section with async flag for specVersion:** 4.0 ([#1042](https://github.com/SAP/ui5-builder/issues/1042)) [`dfa67fe`](https://github.com/SAP/ui5-builder/commit/dfa67feb91b7de0d61c2713eafa639f001484d9b)
- **bundle/Builder:** Support async require sections and conditional core boot [`e421e2f`](https://github.com/SAP/ui5-builder/commit/e421e2ff7e604d9035b86d666ebaf75d29212332)
- **manifest.json:** Auto-fill supportedLocales [`b085634`](https://github.com/SAP/ui5-builder/commit/b085634555193acc669ed37e8e4b817b9798698b)

### BREAKING CHANGE

Created bundles use sap.ui.predefine instead function wrappers. For
projects this is a compatible change. Only the produced bundle content
changes.

Task API `namespace` option got renamed to `projectNamespace`

JIRA: CPOUI5FOUNDATION-802
Relates to: https://github.com/SAP/ui5-tooling/issues/701

Support for older Node.js and npm releases has been dropped.
Only Node.js 20.11.x and >=21.2.0 as well as npm v10 or higher are supported.

<a name="v3.5.1"></a>
## [v3.5.1] - 2024-07-22
### Bug Fixes
- **generateThemeDesignerResources:** Allow core .theming in sources ([#1062](https://github.com/SAP/ui5-builder/issues/1062)) [`dda3011`](https://github.com/SAP/ui5-builder/commit/dda30114461314e81da43bd739e709186744f592)

<a name="v3.5.0"></a>
## [v3.5.0] - 2024-06-21
### Features
- ES2023 Support [`097049d`](https://github.com/SAP/ui5-builder/commit/097049daeec5c54c2d5e858b12e0c54c826ff663)


<a name="v3.4.1"></a>
## [v3.4.1] - 2024-05-13
### Bug Fixes
- **bundle/Builder:** Correct bundling of resources with empty source map [`1228db7`](https://github.com/SAP/ui5-builder/commit/1228db78e7e655cea58c20517662b08dd09db87b)


<a name="v3.4.0"></a>
## [v3.4.0] - 2024-04-24
### Features
- **generateFlexChangesBundle:** Handle minUI5Version as array ([#1009](https://github.com/SAP/ui5-builder/issues/1009)) [`45c9b7e`](https://github.com/SAP/ui5-builder/commit/45c9b7efc255e1d62dfed82ccf67b61d54dd8627)


<a name="v3.3.1"></a>
## [v3.3.1] - 2024-03-27

<a name="v3.3.0"></a>
## [v3.3.0] - 2024-01-18
### Features
- **flexChangesBundler:** Merge existing with new flexibility-bundle.json [`fd070ab`](https://github.com/SAP/ui5-builder/commit/fd070abaa22680ee70b448fa0ac406a8f2b57cc5)


<a name="v3.2.0"></a>
## [v3.2.0] - 2023-12-12
### Bug Fixes
- Incomplete multi-character sanitization ([#959](https://github.com/SAP/ui5-builder/issues/959)) [`d61f1b7`](https://github.com/SAP/ui5-builder/commit/d61f1b744495f5428db33467218077e7996f1575)
- Add guard against prototype pollution ([#960](https://github.com/SAP/ui5-builder/issues/960)) [`ba230d9`](https://github.com/SAP/ui5-builder/commit/ba230d922cac0acd291dfe18b0ae7a95eae8b190)
- Incomplete string escaping or encoding ([#958](https://github.com/SAP/ui5-builder/issues/958)) [`50bb0d9`](https://github.com/SAP/ui5-builder/commit/50bb0d97e76fb312412cf29fae18b76cc88df6f4)
- **manifestCreator:** set fallbackLocale to empty string if no locale is present ([#962](https://github.com/SAP/ui5-builder/issues/962)) [`26526a0`](https://github.com/SAP/ui5-builder/commit/26526a08ff38ee11ed3bd506f7ef0610f1d1ccb0)

### Features
- depCache bundling mode ([#951](https://github.com/SAP/ui5-builder/issues/951)) [`f2cf564`](https://github.com/SAP/ui5-builder/commit/f2cf564f0f71d635e58a743c7bdef1f427e341b2)


<a name="v3.1.1"></a>
## [v3.1.1] - 2023-11-20
### Bug Fixes
- Handle graceful termination of workerpool for parallel builds ([#953](https://github.com/SAP/ui5-builder/issues/953)) [`f7b9f27`](https://github.com/SAP/ui5-builder/commit/f7b9f27ac5966bd89e52e4c2d5b03482a0f3dbb7)
- **Bundling:** Detect manifest.json dependency of libraries [`6f9995f`](https://github.com/SAP/ui5-builder/commit/6f9995f5b47a6094fa93b5d433be849b1d3cdc7e)


<a name="v3.1.0"></a>
## [v3.1.0] - 2023-10-11
### Bug Fixes
- **bundle/Builder:** Add missing 'names' attribute to generated source maps [`57e0e50`](https://github.com/SAP/ui5-builder/commit/57e0e5047638a9a704a696b8af7780fbbceefbc4)

### Features
- Validate apiVersion property in Library.init ([#943](https://github.com/SAP/ui5-builder/issues/943)) [`52bf258`](https://github.com/SAP/ui5-builder/commit/52bf25842a59c3fa1ddbe71b482b232e18b55288)
- **Minifier:** Support input source maps ([#780](https://github.com/SAP/ui5-builder/issues/780)) [`67ecb27`](https://github.com/SAP/ui5-builder/commit/67ecb27e44a2d84e6b2203f31049220dcbcd41f0)

### Reverts
- [INTERNAL] Azure Pipelines: Switch back to Node 20.5.x


<a name="v3.0.9"></a>
## [v3.0.9] - 2023-07-26

<a name="v3.0.8"></a>
## [v3.0.8] - 2023-07-19
### Bug Fixes
- Revert "[INTERNAL] Remove implicit dependencies concept ([#913](https://github.com/SAP/ui5-builder/issues/913))" [`1043714`](https://github.com/SAP/ui5-builder/commit/1043714e3b952a8280f1ff7909f79db3b750eb0c)
- **generateJsdoc:** Also process resources created by preceeding tasks [`04447bd`](https://github.com/SAP/ui5-builder/commit/04447bdec28b8bf18c24bd53e3fe8be9bdeed6c2)


<a name="v3.0.7"></a>
## [v3.0.7] - 2023-07-13
### Bug Fixes
- Don't report a missing module that's contained in another bundle ([#915](https://github.com/SAP/ui5-builder/issues/915)) [`8f23f38`](https://github.com/SAP/ui5-builder/commit/8f23f388f6d64f313ae8a89d0fcaf39ba905a70b)


<a name="v3.0.6"></a>
## [v3.0.6] - 2023-06-21

<a name="v3.0.5"></a>
## [v3.0.5] - 2023-06-05
### Bug Fixes
- **bundle/Builder:** Remove sourceMappingURL from modules embedded as string [`a2f410c`](https://github.com/SAP/ui5-builder/commit/a2f410c32945a6a25fdf47b7b06ccb7f21ef5716)

### Dependency Updates
- Bump xml2js from 0.5.0 to 0.6.0 [`9679830`](https://github.com/SAP/ui5-builder/commit/967983000d64324089740c5ffc0460dcca23866f)


<a name="v3.0.4"></a>
## [v3.0.4] - 2023-05-23
### Bug Fixes
- **lbt/Resolver:** ensure stable module order in generated bundleInfo [`482b8a0`](https://github.com/SAP/ui5-builder/commit/482b8a011d9f0e3fc24d0485be7caf1509195c82)


<a name="v3.0.3"></a>
## [v3.0.3] - 2023-04-21
### Dependency Updates
- Bump rimraf from 4.4.1 to 5.0.0 ([#897](https://github.com/SAP/ui5-builder/issues/897)) [`7b5e442`](https://github.com/SAP/ui5-builder/commit/7b5e442be80ff2e070c249a2c3c3cbe11a34b956)


<a name="v3.0.2"></a>
## [v3.0.2] - 2023-04-12
### Dependency Updates
- Bump xml2js from 0.4.23 to 0.5.0 [`5269fc2`](https://github.com/SAP/ui5-builder/commit/5269fc206b30a13d28493892cc658f1614e7cc74)


<a name="v3.0.1"></a>
## [v3.0.1] - 2023-02-16

<a name="v3.0.0"></a>
## [v3.0.0] - 2023-02-09
### Breaking Changes
- Transform to ES Modules ([#790](https://github.com/SAP/ui5-builder/issues/790)) [`a439aa9`](https://github.com/SAP/ui5-builder/commit/a439aa9f679dfe2e18b8c540f54876f94c0de119)
- **generateJsDoc:** Remove internal 'buildContext' parameter [`4ec80c8`](https://github.com/SAP/ui5-builder/commit/4ec80c874e177b658b1cd819431b6cb0660ded87)
- Removal of manifestBundler and generateManifestBundle ([#838](https://github.com/SAP/ui5-builder/issues/838)) [`07a5be2`](https://github.com/SAP/ui5-builder/commit/07a5be2b6d9aa23cf78ddd17951c832d6dec7bef)
- **JSDoc:** Fail build when jsdoc command failed ([#845](https://github.com/SAP/ui5-builder/issues/845)) [`c2916b4`](https://github.com/SAP/ui5-builder/commit/c2916b4f1d49b5500e4b51143d4e6065ac200eef)
- Remove build execution ([#740](https://github.com/SAP/ui5-builder/issues/740)) [`af2e956`](https://github.com/SAP/ui5-builder/commit/af2e956f6cba1275669160328e32df3fffa782d0)
- Enable modern preload bundles without dependencies ([#739](https://github.com/SAP/ui5-builder/issues/739)) [`97cfa6c`](https://github.com/SAP/ui5-builder/commit/97cfa6cd3eadff57bcc18816534c7751551ebdb8)
- Require Node.js >= 16.18.0 / npm >= 8 [`dbf6c06`](https://github.com/SAP/ui5-builder/commit/dbf6c0694693070f73e9f96edef90f094d5bf721)
- **generateResourcesJson:** Make 'dependencies' parameter mandatory [`268dd16`](https://github.com/SAP/ui5-builder/commit/268dd16091c515ec0c922ea23af437d9aa8bf3ea)
- **moduleBundler:** Always default to `optimize: true` ([#685](https://github.com/SAP/ui5-builder/issues/685)) [`de5837c`](https://github.com/SAP/ui5-builder/commit/de5837c43449ea61deae3b2f02f9973f3fa37992)
- **libraryLessGenerator:** Throw error when import can't be inlined [`d2be9bb`](https://github.com/SAP/ui5-builder/commit/d2be9bb68600ec97b9bc007f348f87ad456fb5a3)

### BREAKING CHANGE
This package has been transformed to ES Modules. Therefore it no longer provides a CommonJS export.
If your project uses CommonJS, it needs to be converted to ESM or use a dynamic import.

For more information see also:

- https://sap.github.io/ui5-tooling/updates/migrate-v3/
- https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c

The `jsdocGenerator` processor and the corresponding `generateJsdoc` task will now throw an error when JSDoc reports an error (exit code != 0). This will also fail the build when running `ui5 build jsdoc`.

The manifestBundler processor and generateManifestBundle task has been removed because it is no longer required for the HTML5 repository in Cloud Foundry.

- builder.js has been removed. Use ui5-project builder instead
- Tasks now rely on Project instances being available on Resources (see https://github.com/SAP/ui5-fs/pull/381)
- TaskRepository#addTask has been removed. Custom tasks need to be added to the project graph instead
- TaskUtil#get/set/clearTag now requires a Project instance to be provided. Path strings are no longer sufficient
  and will cause an exception to be thrown
  
For library projects, the task "generateComponentPreload" is now
executed after tasks "generateLibraryManifest" and
"generateManifestBundle" instead of before them.

Support for older Node.js and npm releases has been dropped.
Only Node.js v16.18.0 and npm v8 or higher are supported.

The following tasks have been removed:

- createDebugFiles
- uglify

The following processors have been removed:

- debugFileCreator
- resourceCopier
- uglifier

As a replacement, the new 'minify' task and 'minifier' processor can be
used.

Note: The minify task is executed earlier, before the bundling
process takes place. Existing 'beforeTask' and 'afterTask' configuration of
custom tasks might need to be adapted to cater for this change.

### Features
- Support ES2022 language features ([#848](https://github.com/SAP/ui5-builder/issues/848)) [`f9b8457`](https://github.com/SAP/ui5-builder/commit/f9b845726731a0e02ec4a499e2a1a82a639174a8)
- **jsdoc:** Support destructuring of enums for defaultValue ([#775](https://github.com/SAP/ui5-builder/issues/775)) [`523f365`](https://github.com/SAP/ui5-builder/commit/523f365cb917997c5031d245309c21e9e4b3e311)
- **builder:** Improve support for ES6+ syntax  ([#774](https://github.com/SAP/ui5-builder/issues/774)) [`90385fe`](https://github.com/SAP/ui5-builder/commit/90385feb7cea1e5b864cff035b01263a492972a9)
- **jsdoc:** Improve support for ES6+ syntax  ([#785](https://github.com/SAP/ui5-builder/issues/785)) [`187a6a3`](https://github.com/SAP/ui5-builder/commit/187a6a35000145d70bf41e0d8b724e5ea8d8dc78)
- **generateThemeDesignerResources task:** Create css_variables.less ([#730](https://github.com/SAP/ui5-builder/issues/730)) [`34e69be`](https://github.com/SAP/ui5-builder/commit/34e69be95fc8ec1961b24b7e2580c2c993d814d3)
- **builder:** Add cssVariables option ([#728](https://github.com/SAP/ui5-builder/issues/728)) [`30d58e1`](https://github.com/SAP/ui5-builder/commit/30d58e1081c1bdc665f13952ecbe5c400b5f4ed7)
- Generate source maps for bundles ([#695](https://github.com/SAP/ui5-builder/issues/695)) [`8a20c42`](https://github.com/SAP/ui5-builder/commit/8a20c4257a1ebe4d613b0595be93cd45d900f580)
- **replaceVersion/Copyright:** Also process test-resources ([#693](https://github.com/SAP/ui5-builder/issues/693)) [`a0d4bc2`](https://github.com/SAP/ui5-builder/commit/a0d4bc2a80d61e042786207af4bdbda6c3ddfe31)
- Support ES2022 language features [`e749b6a`](https://github.com/SAP/ui5-builder/commit/e749b6ae0838f923b27dd0d7d34da2174c433f5f)
- Add minify task and processor ([#666](https://github.com/SAP/ui5-builder/issues/666)) [`a3af604`](https://github.com/SAP/ui5-builder/commit/a3af604ff0a12fb9241dcd105cf0aec8d718a299)

### Bug Fixes
- **package.json:** Downgrade es5-ext dependency [`2b71707`](https://github.com/SAP/ui5-builder/commit/2b71707683480b26aab9957c09e5d22bce8a6450)
- **minify:** Change default to not omit source map resources [`6d75a49`](https://github.com/SAP/ui5-builder/commit/6d75a495224590097332fc061c66cfe0e8f4c151)
- Avoid redundant bundle creation ([#741](https://github.com/SAP/ui5-builder/issues/741)) [`13c8405`](https://github.com/SAP/ui5-builder/commit/13c840585946401d238936dfa38a6f70a73e9ed0)
- **JSModuleAnalyzer:** Fix detection of bundle name ([#705](https://github.com/SAP/ui5-builder/issues/705)) [`aaeafd4`](https://github.com/SAP/ui5-builder/commit/aaeafd4a1fd194dd08e5ae47c29d90f0b4c7d197)
- **generateResourcesJson:** Add raw-module info for debug bundles ([#736](https://github.com/SAP/ui5-builder/issues/736)) [`3b918e8`](https://github.com/SAP/ui5-builder/commit/3b918e83bfd38342778ecd4c58e648e99ad7cffc)
- **LibraryBuilder:** Align task order of "generateComponentPreload" [`aea061d`](https://github.com/SAP/ui5-builder/commit/aea061d9d6c2ac0c11484dcc08bdcda23ab62986)
- **LocatorResourcePool:** Wait for resources in prepare step ([#719](https://github.com/SAP/ui5-builder/issues/719)) [`1b7f93f`](https://github.com/SAP/ui5-builder/commit/1b7f93f4988340d7a6575be3191a02e6c295ebd0)
- **XMLTemplateAnalyzer:** Analyze core:require of FragmentDefinition [`af075ed`](https://github.com/SAP/ui5-builder/commit/af075edf784d9f1ba162a34f0bf150dbcbc0f479)
- **Bundler:** Ensure reproducibility for bundles with multiple parts ([#689](https://github.com/SAP/ui5-builder/issues/689)) [`6f4588b`](https://github.com/SAP/ui5-builder/commit/6f4588b3eb687178e557ac4fb36481104f9681a0)
- **generateResourcesJson:** Don't list resources omitted from build result [`9608c51`](https://github.com/SAP/ui5-builder/commit/9608c5177f86494ba689d2e799b4378fec9ed6fa)
- **generateResourcesJson:** Analyze debug bundles ([#669](https://github.com/SAP/ui5-builder/issues/669)) [`f27513a`](https://github.com/SAP/ui5-builder/commit/f27513a259b30d39e260790781b6d435b4ab088b)
- **Bundler:** Sort raw modules by default [`0e11b69`](https://github.com/SAP/ui5-builder/commit/0e11b6965a1d2e63a96e9b738e38975b5ac755bc)

### Dependency Updates
- Bump less-openui5 from 0.11.4 to 0.11.5 [`bf46354`](https://github.com/SAP/ui5-builder/commit/bf463541b7651db1dee167057eddc94181f5c1da)
- Bump less-openui5 from 0.11.3 to 0.11.4 [`b7a507f`](https://github.com/SAP/ui5-builder/commit/b7a507fbc34076f5bf95f92f058fd2c58d79a455)
- Bump less-openui5 from 0.11.2 to 0.11.3 [`28e684b`](https://github.com/SAP/ui5-builder/commit/28e684b85e7eb621f210041702e2a316d1d0eb62)
- Bump escope from 3.6.0 to 4.0.0 [`e25af0d`](https://github.com/SAP/ui5-builder/commit/e25af0d9c1184916aa037b4b4ca23d15c5f2a408)
- Bump rimraf from 3.0.2 to 4.1.1 ([#873](https://github.com/SAP/ui5-builder/issues/873)) [`ddb9660`](https://github.com/SAP/ui5-builder/commit/ddb96602fea5b96ba37afdebda0993d847462f52)
- Bump jsdoc from 3.6.11 to 4.0.0 ([#821](https://github.com/SAP/ui5-builder/issues/821)) [`6d05117`](https://github.com/SAP/ui5-builder/commit/6d0511785069d12a588b2ad9fa31de828700fef0)

<a name="v2.11.9"></a>
## [v2.11.9] - 2022-11-30
### Bug Fixes
- **transformApiJson:** Fix regression in UI5 Tooling scenario [`819c808`](https://github.com/SAP/ui5-builder/commit/819c808010963b84bfe33e109a7b2a5412096f78)

### Dependency Updates
- Bump less-openui5 from 0.11.2 to 0.11.3 [`1bbe5f5`](https://github.com/SAP/ui5-builder/commit/1bbe5f561fb35c646a27cbe4d03050101ff68d7c)


<a name="v2.11.8"></a>
## [v2.11.8] - 2022-10-28
### Bug Fixes
- **ComponentAnalyzer:** Fix detection of rootView [`acb3d9f`](https://github.com/SAP/ui5-builder/commit/acb3d9fd7fc60ad61ac88d68cb0fd5296b795e9f)
- **XMLTemplateAnalyzer:** Fix detection of nested views [`1cbfd82`](https://github.com/SAP/ui5-builder/commit/1cbfd82396e5fa78455e0a696e9229a2e8a337fc)


<a name="v2.11.7"></a>
## [v2.11.7] - 2022-10-20
### Dependency Updates
- Bump escope from 3.6.0 to 4.0.0 [`852b37f`](https://github.com/SAP/ui5-builder/commit/852b37f549f3927decbc1b40cc6055325472d625)

### Reverts
- [FIX] package.json: Downgrade es5-ext dependency ([#798](https://github.com/SAP/ui5-builder/issues/798))


<a name="v2.11.6"></a>
## [v2.11.6] - 2022-10-12
### Bug Fixes
- **package.json:** Downgrade es5-ext dependency ([#798](https://github.com/SAP/ui5-builder/issues/798)) [`0e18008`](https://github.com/SAP/ui5-builder/commit/0e18008d86da93c5c8743b17ac0091afc3064d78)


<a name="v2.11.5"></a>
## [v2.11.5] - 2022-05-04


<a name="v2.11.4"></a>
## [v2.11.4] - 2022-02-21
### Bug Fixes
- **generateFlexChangesBundle:** Fix minUI5Version check for UI5 v1.100.0+ ([#706](https://github.com/SAP/ui5-builder/issues/706)) [`fb1217a`](https://github.com/SAP/ui5-builder/commit/fb1217ac536c20da81526f82f2ecb03686815942)


<a name="v2.11.3"></a>
## [v2.11.3] - 2021-12-14
### Bug Fixes
- Enable buildThemes for libraries without .library [`7b941a7`](https://github.com/SAP/ui5-builder/commit/7b941a797210463a9fa8ca50753662c5db373aa6)


<a name="v2.11.2"></a>
## [v2.11.2] - 2021-11-17
### Bug Fixes
- **Builder:** Emit warning on bundleInfo name without extension [`ed0da12`](https://github.com/SAP/ui5-builder/commit/ed0da123ac084d126a28f0f34d9740c310d91902)
- **manifestCreator:** Trim whitespace/new-lines for sap.app/title [`019cfd7`](https://github.com/SAP/ui5-builder/commit/019cfd7031a2bd63ce93801ad027413151a3b060)


<a name="v2.11.1"></a>
## [v2.11.1] - 2021-10-19
### Bug Fixes
- Minification excludes for application projects [`7f6fd68`](https://github.com/SAP/ui5-builder/commit/7f6fd68e1aed9131896723f1231816287eaf2fce)


<a name="v2.11.0"></a>
## [v2.11.0] - 2021-10-19
### Bug Fixes
- **manifestCreator:** supportedThemes should only list relevant themes [`01f3859`](https://github.com/SAP/ui5-builder/commit/01f3859070b6955b9824b0949e633c6d40244633)

### Features
- Support build minification excludes ([#653](https://github.com/SAP/ui5-builder/issues/653)) [`0aa2301`](https://github.com/SAP/ui5-builder/commit/0aa2301df4c5d40c531da52e2d6314955b95b396)


<a name="v2.10.0"></a>
## [v2.10.0] - 2021-10-05
### Features
- Introduce build task replaceBuildtime [`2ad0960`](https://github.com/SAP/ui5-builder/commit/2ad09603deee3bc26eae36aa36a7a4ac10f83cb0)


<a name="v2.9.5"></a>
## [v2.9.5] - 2021-08-25
### Bug Fixes
- **AbstractBuilder:** Multiple custom task executions did not run ([#636](https://github.com/SAP/ui5-builder/issues/636)) [`c05587a`](https://github.com/SAP/ui5-builder/commit/c05587a3cab93c8852832098318235dbfbcce49f)
- **Builder:** Handle files without extension ([#637](https://github.com/SAP/ui5-builder/issues/637)) [`07aaa24`](https://github.com/SAP/ui5-builder/commit/07aaa247ae8c07f8c7bb13a93439ef2c1270cb6c)


<a name="v2.9.4"></a>
## [v2.9.4] - 2021-07-23
### Bug Fixes
- **XMLTemplateAnalyzer:** Include document name for XML parsing errors [`3c88ca4`](https://github.com/SAP/ui5-builder/commit/3c88ca47aae85892360e4e4cf4b50860a0f430e3)


<a name="v2.9.3"></a>
## [v2.9.3] - 2021-07-01
### Bug Fixes
- **LibraryFormatter:** Fix handling of paths containing special characters [`2093562`](https://github.com/SAP/ui5-builder/commit/2093562adec588a9c1f50125e0b739836e6c76c8)


<a name="v2.9.2"></a>
## [v2.9.2] - 2021-06-17
### Bug Fixes
- Switch from esprima to espree ([#615](https://github.com/SAP/ui5-builder/issues/615)) [`c3d50e3`](https://github.com/SAP/ui5-builder/commit/c3d50e36aacf374f7616278aa590a6423c3294fe)
- **lbt/resources/ResourceCollector:** Ensure proper matching of indicator files ([#614](https://github.com/SAP/ui5-builder/issues/614)) [`2d3a1d8`](https://github.com/SAP/ui5-builder/commit/2d3a1d86f06f0eb223b7ae9843d6479ebb1e14e4)


<a name="v2.9.1"></a>
## [v2.9.1] - 2021-06-08
### Bug Fixes
- **JSDoc:** Use namespace to derive uilib name for jsdoc generator [`2077130`](https://github.com/SAP/ui5-builder/commit/2077130d52305e4f46c3230c94001812beb2eb36)
- **JSDoc:** add project name to JSDoc configuration and api.json ([#609](https://github.com/SAP/ui5-builder/issues/609)) [`419ce38`](https://github.com/SAP/ui5-builder/commit/419ce3836bce117fb3d5fc05af11caef5c8a432a)
- **lib/processors/debugFileCreator:** Add -dbg suffix only to files ([#611](https://github.com/SAP/ui5-builder/issues/611)) [`9da2f7b`](https://github.com/SAP/ui5-builder/commit/9da2f7b7b53b41adbce772e9823cee24b50a9aa9)

### Dependency Updates
- Bump cheerio from 0.22.0 to 1.0.0-rc.9 [`8bdb146`](https://github.com/SAP/ui5-builder/commit/8bdb1462e721127eaf860665a1361b6877e873a1)


<a name="v2.9.0"></a>
## [v2.9.0] - 2021-06-01
### Features
- Support writing 'bundles' config as part of a bundle ([#396](https://github.com/SAP/ui5-builder/issues/396)) [`b5f372a`](https://github.com/SAP/ui5-builder/commit/b5f372a6ab9c31f3acef41a59e6cecd6681be2dd)


<a name="v2.8.4"></a>
## [v2.8.4] - 2021-05-17
### Bug Fixes
- **XMLTemplateAnalyzer:** Properly detect conditional dependencies [`0f56490`](https://github.com/SAP/ui5-builder/commit/0f56490cedcdebc363cc7f1d99f03cfde907804f)
- **lbt/bundle/Builder:** Preserve comments in bundles [`8dfa919`](https://github.com/SAP/ui5-builder/commit/8dfa9191d36cb60ce44b64536b6f6b2b766b87c2)


<a name="v2.8.3"></a>
## [v2.8.3] - 2021-04-19
### Bug Fixes
- Emit warning when including/excluding unknown tasks [`854f456`](https://github.com/SAP/ui5-builder/commit/854f456e06e163e8423702e4fe893905e240adfa)


<a name="v2.8.2"></a>
## [v2.8.2] - 2021-03-11
### Bug Fixes
- **LibraryFormatter:** Do not throw for missing .library in legacy OpenUI5 theme libraries [`f7e22ba`](https://github.com/SAP/ui5-builder/commit/f7e22ba866bf6a61b0d2932ef18aad53127641fd)

### Dependency Updates
- Bump less-openui5 from 0.10.0 to 0.11.0 ([#594](https://github.com/SAP/ui5-builder/issues/594)) [`f3d174b`](https://github.com/SAP/ui5-builder/commit/f3d174be1fc2ab66a62632439592b2899680c093)


<a name="v2.8.1"></a>
## [v2.8.1] - 2021-03-04
### Bug Fixes
- **generateResourcesJson:** Include dependencies of XML resources [`0fc364d`](https://github.com/SAP/ui5-builder/commit/0fc364ded64eb5bae4085397dc1831e04b19edf4)
- **manifestCreator:** 'embeds' should list all components ([#575](https://github.com/SAP/ui5-builder/issues/575)) [`11f823a`](https://github.com/SAP/ui5-builder/commit/11f823a77e72cfa4c096e7e8f4277a6a6b9400b8)
- **moduleBundler:** Apply defaultFileTypes ([#580](https://github.com/SAP/ui5-builder/issues/580)) [`42f6474`](https://github.com/SAP/ui5-builder/commit/42f64744a299e8548f6dbdb7bcbb8b3cef72f1f4)
- **resourceListCreator:** Include dependencies of subModules ([#588](https://github.com/SAP/ui5-builder/issues/588)) [`fe61d6e`](https://github.com/SAP/ui5-builder/commit/fe61d6eba6671ca31f7c49a7d1281adb6d5f2114)
- **versionInfoGenerator:** fix hasOwnPreload flag ([#591](https://github.com/SAP/ui5-builder/issues/591)) [`73a0f8b`](https://github.com/SAP/ui5-builder/commit/73a0f8baa0248aef3ac6c2b114082aa120ef6e22)


<a name="v2.8.0"></a>
## [v2.8.0] - 2021-02-09
### Features
- Add Library/Component preload exclude configuration ([#573](https://github.com/SAP/ui5-builder/issues/573)) [`f1644a4`](https://github.com/SAP/ui5-builder/commit/f1644a4d75c4b3ffb5c092f3a24c74b9123afedc)


<a name="v2.7.2"></a>
## [v2.7.2] - 2021-01-29
### Dependency Updates
- Bump less-openui5 from 0.9.0 to 0.10.0 [`4674fef`](https://github.com/SAP/ui5-builder/commit/4674fef348cf0f5b1ac76fff931335244d64e66f)


<a name="v2.7.1"></a>
## [v2.7.1] - 2021-01-28
### Bug Fixes
- **JSDoc:** adapt sdkTransformer to change in transformApiJson.js ([#574](https://github.com/SAP/ui5-builder/issues/574)) [`655f731`](https://github.com/SAP/ui5-builder/commit/655f731191f1210d9f72bee9f60fcebdc863bc36)
- **versionInfoGenerator:** manifest without embeds [#486](https://github.com/SAP/ui5-builder/issues/486) ([#576](https://github.com/SAP/ui5-builder/issues/576)) [`4d86226`](https://github.com/SAP/ui5-builder/commit/4d86226abf6ce549f3cf719068270014ddeefb5a)


<a name="v2.7.0"></a>
## [v2.7.0] - 2021-01-26
### Features
- Versioninfo enrich with manifest infos ([#554](https://github.com/SAP/ui5-builder/issues/554)) [`7603ece`](https://github.com/SAP/ui5-builder/commit/7603ece36a74592c7756f6147eed91d08a5788a6)
- Align JSDoc template & plugin with OpenUI5 1.87.0 ([#572](https://github.com/SAP/ui5-builder/issues/572)) [`0cb02ac`](https://github.com/SAP/ui5-builder/commit/0cb02acee2b070889146ef9f725cc139691f0ab2)


<a name="v2.6.1"></a>
## [v2.6.1] - 2021-01-21
### Bug Fixes
- **Theme Build:** Only process themes within library namespace ([#570](https://github.com/SAP/ui5-builder/issues/570)) [`8cecc01`](https://github.com/SAP/ui5-builder/commit/8cecc01ccbd1a84e2ede91e618f31dcf6c00b3fd)
- **processors/libraryLessGenerator:** Don't throw in case of import errors [`0e25b59`](https://github.com/SAP/ui5-builder/commit/0e25b59fe8e7e37f4f6b5c947a76b4da6f79469f)


<a name="v2.6.0"></a>
## [v2.6.0] - 2021-01-14
### Features
- Add 'generateThemeDesignerResources' task [`03241c0`](https://github.com/SAP/ui5-builder/commit/03241c0e2599cb0928cbbf34ddc678634b2d5a93)
- Add 'libraryLessGenerator' processor ([#560](https://github.com/SAP/ui5-builder/issues/560)) [`a7e1e5c`](https://github.com/SAP/ui5-builder/commit/a7e1e5c0c4b63d9bab3f6645deff8e0f4187d305)
- **manifestBundler:** Add support for sap.app/i18n/enhanceWith ([#564](https://github.com/SAP/ui5-builder/issues/564)) [`1b7a277`](https://github.com/SAP/ui5-builder/commit/1b7a277aeeba9a43b647a46ae4487878ca2d6219)
- **manifestCreator:** enrich manifest with supportedLocales in i18n (for libraries) ([#547](https://github.com/SAP/ui5-builder/issues/547)) [`8102034`](https://github.com/SAP/ui5-builder/commit/810203477647c52948eb357ce9679373d32dd9b1)


<a name="v2.5.1"></a>
## [v2.5.1] - 2020-12-18
### Bug Fixes
- **Windows:** Correctly handle project paths containing non-ASCII characters [`b229bf3`](https://github.com/SAP/ui5-builder/commit/b229bf315097591d2e870b74fb2b92b26b178877)


<a name="v2.5.0"></a>
## [v2.5.0] - 2020-12-15
### Bug Fixes
- **manifestCreator:** Add component path to error logs [`049b9ee`](https://github.com/SAP/ui5-builder/commit/049b9ee22f8bf6c1bb41f9ba32be65a8fce38f23)

### Features
- **ApplicationFormatter:** Implement manifest.appdescr_variant fallback ([#545](https://github.com/SAP/ui5-builder/issues/545)) [`6d44481`](https://github.com/SAP/ui5-builder/commit/6d44481ad3668758d4c008d28b11cb47ca6bbee1)


<a name="v2.4.5"></a>
## [v2.4.5] - 2020-11-30
### Bug Fixes
- **generateResourcesJson:** Make resources.json generation deterministic [`41d3335`](https://github.com/SAP/ui5-builder/commit/41d3335bbddaba2e65e3293b37f89010ab0cd6fc)
- **manifestCreator:** Only list components with corresponding 'embeddedBy' ([#555](https://github.com/SAP/ui5-builder/issues/555)) [`89872d7`](https://github.com/SAP/ui5-builder/commit/89872d79623accad1ed148034c1f2fe46e44eeee)


<a name="v2.4.4"></a>
## [v2.4.4] - 2020-11-25
### Bug Fixes
- **JSModuleAnalyzer:** Properly handle jQuery.sap.registerPreloadedModules calls [`9433f6a`](https://github.com/SAP/ui5-builder/commit/9433f6a989d6fea46f637ac8ff58c739977f456c)


<a name="v2.4.3"></a>
## [v2.4.3] - 2020-11-06

<a name="v2.4.2"></a>
## [v2.4.2] - 2020-11-04
### Reverts
- [FEATURE] Switch XML minifier from pretty-data to minify-xml


<a name="v2.4.1"></a>
## [v2.4.1] - 2020-11-03
### Dependency Updates
- Bump minify-xml from 2.1.2 to 2.1.3 [`839d12b`](https://github.com/SAP/ui5-builder/commit/839d12b0b4150ef13c86e639576e5a29854dc7d9)


<a name="v2.4.0"></a>
## [v2.4.0] - 2020-11-03
### Features
- Tag bundles and ignore them in uglify task ([#535](https://github.com/SAP/ui5-builder/issues/535)) [`b487366`](https://github.com/SAP/ui5-builder/commit/b4873663ea67fa16f8fd9c2672c647026894ba32)
- Switch XML minifier from pretty-data to minify-xml [`be29520`](https://github.com/SAP/ui5-builder/commit/be295203cf71740f0585ee59f44c55ee59e41b26)


<a name="v2.3.0"></a>
## [v2.3.0] - 2020-10-22
### Features
- Create designtime and support bundles for libraries ([#529](https://github.com/SAP/ui5-builder/issues/529)) [`2a51943`](https://github.com/SAP/ui5-builder/commit/2a5194346279279a6fb28c7332245e1cc5360d63)

### Performance Improvements
- **BundleWriter:** Improve performance ([#534](https://github.com/SAP/ui5-builder/issues/534)) [`750b43e`](https://github.com/SAP/ui5-builder/commit/750b43eb88aded89eb8cd0b4b9ccb1ca5d5f94d2)


<a name="v2.2.1"></a>
## [v2.2.1] - 2020-10-06
### Bug Fixes
- **Bundler:** Improve error log messages ([#466](https://github.com/SAP/ui5-builder/issues/466)) [`6bb6235`](https://github.com/SAP/ui5-builder/commit/6bb6235464b54da4e13553ecf9e0fe0ebcb3fe61)
- **tasks/generateResourcesJson:** Handling for sap.ui.integration [`1191b3d`](https://github.com/SAP/ui5-builder/commit/1191b3d4fac9ab7b78467d254afa88041962c416)

### Dependency Updates
- Bump terser from 4.8.0 to 5.2.1 ([#511](https://github.com/SAP/ui5-builder/issues/511)) [`18f0df8`](https://github.com/SAP/ui5-builder/commit/18f0df84d7f3f4c7de9b1cacf06a5f5d2f0de8a9)


<a name="v2.2.0"></a>
## [v2.2.0] - 2020-09-02
### Bug Fixes
- SapUiDefine call should not fail when there's no factory function ([#491](https://github.com/SAP/ui5-builder/issues/491)) [`25c6a3c`](https://github.com/SAP/ui5-builder/commit/25c6a3c9cae0d41f2757a8f0641bc043e171201b)

### Features
- Add generateResourcesJson task ([#390](https://github.com/SAP/ui5-builder/issues/390)) [`021f439`](https://github.com/SAP/ui5-builder/commit/021f439e4125403d0d9e2fa0b7bcd3174ceb46e6)


<a name="v2.1.0"></a>
## [v2.1.0] - 2020-08-11
### Features
- Implement TaskUtil class [`a7074ae`](https://github.com/SAP/ui5-builder/commit/a7074aeb8167330fd1b6d30bf5b387a212cd6b1b)
- **generateFlexChangesBundle:** Hide bundle input from build result [`001183a`](https://github.com/SAP/ui5-builder/commit/001183a4981bb5fe43039cedfbea70c2090b24db)


<a name="v2.0.7"></a>
## [v2.0.7] - 2020-08-10
### Bug Fixes
- **generateLibraryPreload:** Ignore missing modules ([#481](https://github.com/SAP/ui5-builder/issues/481)) [`97b339f`](https://github.com/SAP/ui5-builder/commit/97b339f9c5dbddc8b80ed11c68f557d4eddc7f0a)

### Dependency Updates
- Pin estraverse to v5.1.0 [`e5bc455`](https://github.com/SAP/ui5-builder/commit/e5bc4552015b71678102fd922609ef184502410c)


<a name="v2.0.6"></a>
## [v2.0.6] - 2020-07-21
### Bug Fixes
- **SmartTemplateAnalyzer:** Do not throw in case missing dependency is expected ([#479](https://github.com/SAP/ui5-builder/issues/479)) [`b2150c3`](https://github.com/SAP/ui5-builder/commit/b2150c303fb14cd07b1f1ecadd1db5117cc7dccf)


<a name="v2.0.5"></a>
## [v2.0.5] - 2020-07-14
### Bug Fixes
- **Node.js API:** TypeScript type definition support ([#475](https://github.com/SAP/ui5-builder/issues/475)) [`7858810`](https://github.com/SAP/ui5-builder/commit/785881061fe72e25230573ffb6b2a440d6782792)
- **XMLTemplateAnalyzer:** Handle empty XML view/fragment ([#471](https://github.com/SAP/ui5-builder/issues/471)) [`7488d5f`](https://github.com/SAP/ui5-builder/commit/7488d5f2c9216ac87e47ac7019fbc18674e86e30)


<a name="v2.0.4"></a>
## [v2.0.4] - 2020-06-15
### Bug Fixes
- **ComponentAnalyzer:** Properly handle sap.ui5/routing ([#463](https://github.com/SAP/ui5-builder/issues/463)) [`717f2ec`](https://github.com/SAP/ui5-builder/commit/717f2ec8e6b04e67966183d25cc0ae59db94f43b)


<a name="v2.0.3"></a>
## [v2.0.3] - 2020-05-19
### Bug Fixes
- Align JSDoc template and scripts with OpenUI5 1.79 ([#460](https://github.com/SAP/ui5-builder/issues/460)) [`c868fa0`](https://github.com/SAP/ui5-builder/commit/c868fa0d0a4c46d6c3098785a23fee3b7097cf02)
- **manifestBundler:** Add support for i18n object configuration ([#458](https://github.com/SAP/ui5-builder/issues/458)) [`85c4e19`](https://github.com/SAP/ui5-builder/commit/85c4e1958adf407b0dc2f7d4b324e9de354ab670)


<a name="v2.0.2"></a>
## [v2.0.2] - 2020-05-14

<a name="v2.0.1"></a>
## [v2.0.1] - 2020-04-30
### Bug Fixes
- Namespaces in API Reference (JSDoc) [`b2a9a10`](https://github.com/SAP/ui5-builder/commit/b2a9a10dfee0ab40ce47eb4fb28666f6ea1f2360)


<a name="v2.0.0"></a>
## [v2.0.0] - 2020-03-31
### Breaking Changes
- Make namespace mandatory for application and library projects ([#430](https://github.com/SAP/ui5-builder/issues/430)) [`ee96c00`](https://github.com/SAP/ui5-builder/commit/ee96c00d762ce24bba39f6c947997fcbb79efaae)
- Require Node.js >= 10 [`5451765`](https://github.com/SAP/ui5-builder/commit/5451765f648ecfe2c057cc2feed2c8fb7e98ef00)
- **LibraryFormatter:** Ignore manifest.json of nested apps [`846e929`](https://github.com/SAP/ui5-builder/commit/846e9290ef29aadc1ad18203003983181cd9c23a)

### Dependency Updates
- Bump globby from 10.0.2 to 11.0.0 ([#399](https://github.com/SAP/ui5-builder/issues/399)) [`29efbbd`](https://github.com/SAP/ui5-builder/commit/29efbbd8c5d8bf0aca19e75b08f7b3d6f89e8556)

### Features
- **buildThemes:** Add filtering for available themes ([#419](https://github.com/SAP/ui5-builder/issues/419)) [`848c503`](https://github.com/SAP/ui5-builder/commit/848c5032e98d229a655ddd17f07e252b57838f29)

### BREAKING CHANGE

If a library contains both, a manifest.json and .library file, they must
either be located in the same directory or the manifest.json is ignored.
In cases where the manifest.json is located on a higher level or
different directory on the same level than a .library file, an exception
is thrown.

UI5 Project must be able to determine the project's namespace,
otherwise an error is thrown.

Support for older Node.js releases has been dropped.
Only Node.js v10 or higher is supported.


<a name="v1.10.1"></a>
## [v1.10.1] - 2020-02-24
### Bug Fixes
- **ApplicationBuilder:** Fix pattern to glob for .library files [`032d9a9`](https://github.com/SAP/ui5-builder/commit/032d9a974373ffc504fc65b46befe523eb3e4c7d)


<a name="v1.10.0"></a>
## [v1.10.0] - 2020-02-10
### Bug Fixes
- Ensure proper handling of multi-byte characters in streams ([#411](https://github.com/SAP/ui5-builder/issues/411)) [`e906ec0`](https://github.com/SAP/ui5-builder/commit/e906ec0c3c3eb9fef874f2b7666c692915a496c6)
- **Bundling:** Dynamic preload calls should not emit warnings [`4d22b37`](https://github.com/SAP/ui5-builder/commit/4d22b37852ec130fb3198476e4a6225a47e2b657)

### Features
- Add experimental CSS variables and skeleton build ([#393](https://github.com/SAP/ui5-builder/issues/393)) [`df8c39b`](https://github.com/SAP/ui5-builder/commit/df8c39b3f5a69086662b6f92c32e1364c1a93903)


<a name="v1.9.0"></a>
## [v1.9.0] - 2020-01-13
### Bug Fixes
- Use 'defaultFileTypes' from bundle configuration ([#385](https://github.com/SAP/ui5-builder/issues/385)) [`c21e13e`](https://github.com/SAP/ui5-builder/commit/c21e13ea2d7f629b1f91b9acf625989f396c6b4f)
- Detect dynamic dependencies also when newer APIs are used ([#391](https://github.com/SAP/ui5-builder/issues/391)) [`ed1cc9d`](https://github.com/SAP/ui5-builder/commit/ed1cc9d45e517b3b38815483cc60fa7182ffd067)

### Features
- Add new theme-library type ([#285](https://github.com/SAP/ui5-builder/issues/285)) [`a59287b`](https://github.com/SAP/ui5-builder/commit/a59287b670e956ef29ffe10bbbe1c3506ea3b330)
- **AbstractBuilder:** Allow adding custom tasks for types that have no standard tasks [`654450d`](https://github.com/SAP/ui5-builder/commit/654450df07c22bd1930c014f8b3d6904df8248e9)


<a name="v1.8.0"></a>
## [v1.8.0] - 2019-12-16
### Features
- Add included/excludedDependencies parameter ([#380](https://github.com/SAP/ui5-builder/issues/380)) [`d6ac24a`](https://github.com/SAP/ui5-builder/commit/d6ac24ab76445568afab3fce9c813a0d5c4c4331)


<a name="v1.7.1"></a>
## [v1.7.1] - 2019-11-18
### Dependency Updates
- Bump less-openui5 from 0.7.0 to 0.8.0 [`11101d4`](https://github.com/SAP/ui5-builder/commit/11101d4090718f6bee9f6b4851e05b1e1f33d57b)


<a name="v1.7.0"></a>
## [v1.7.0] - 2019-11-07
### Bug Fixes
- **JSDoc:** Use the rel="noopener" attribute for external links. ([#361](https://github.com/SAP/ui5-builder/issues/361)) [`c702104`](https://github.com/SAP/ui5-builder/commit/c7021046af2ac66aaef8db3841192da8a254d304)

### Dependency Updates
- Bump less-openui5 from 0.6.0 to 0.7.0 [`fdb0241`](https://github.com/SAP/ui5-builder/commit/fdb0241faec60062b1da52cc296dc343507fb802)

### Features
- **buildThemes:** Add "compress" option ([#363](https://github.com/SAP/ui5-builder/issues/363)) [`3a0cf6a`](https://github.com/SAP/ui5-builder/commit/3a0cf6aa990a48830d3c22dac285036a290534d8)
- **flexChangesBundler:** Add flexibility-bundle.json ([#353](https://github.com/SAP/ui5-builder/issues/353)) [`cecc97d`](https://github.com/SAP/ui5-builder/commit/cecc97dd626268da2d2c707c5e0a6fabbfc561b6)


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
[v4.0.4]: https://github.com/SAP/ui5-builder/compare/v4.0.3...v4.0.4
[v4.0.3]: https://github.com/SAP/ui5-builder/compare/v4.0.2...v4.0.3
[v4.0.2]: https://github.com/SAP/ui5-builder/compare/v4.0.1...v4.0.2
[v4.0.1]: https://github.com/SAP/ui5-builder/compare/v4.0.0...v4.0.1
[v4.0.0]: https://github.com/SAP/ui5-builder/compare/v3.3.0...v4.0.0
[v3.5.1]: https://github.com/SAP/ui5-builder/compare/v3.5.0...v3.5.1
[v3.5.0]: https://github.com/SAP/ui5-builder/compare/v3.4.1...v3.5.0
[v3.4.1]: https://github.com/SAP/ui5-builder/compare/v3.4.0...v3.4.1
[v3.4.0]: https://github.com/SAP/ui5-builder/compare/v3.3.1...v3.4.0
[v3.3.1]: https://github.com/SAP/ui5-builder/compare/v3.3.0...v3.3.1
[v3.3.0]: https://github.com/SAP/ui5-builder/compare/v3.2.0...v3.3.0
[v3.2.0]: https://github.com/SAP/ui5-builder/compare/v3.1.1...v3.2.0
[v3.1.1]: https://github.com/SAP/ui5-builder/compare/v3.1.0...v3.1.1
[v3.1.0]: https://github.com/SAP/ui5-builder/compare/v3.0.9...v3.1.0
[v3.0.9]: https://github.com/SAP/ui5-builder/compare/v3.0.8...v3.0.9
[v3.0.8]: https://github.com/SAP/ui5-builder/compare/v3.0.7...v3.0.8
[v3.0.7]: https://github.com/SAP/ui5-builder/compare/v3.0.6...v3.0.7
[v3.0.6]: https://github.com/SAP/ui5-builder/compare/v3.0.5...v3.0.6
[v3.0.5]: https://github.com/SAP/ui5-builder/compare/v3.0.4...v3.0.5
[v3.0.4]: https://github.com/SAP/ui5-builder/compare/v3.0.3...v3.0.4
[v3.0.3]: https://github.com/SAP/ui5-builder/compare/v3.0.2...v3.0.3
[v3.0.2]: https://github.com/SAP/ui5-builder/compare/v3.0.1...v3.0.2
[v3.0.1]: https://github.com/SAP/ui5-builder/compare/v3.0.0...v3.0.1
[v3.0.0]: https://github.com/SAP/ui5-builder/compare/v2.11.2...v3.0.0
[v2.11.9]: https://github.com/SAP/ui5-builder/compare/v2.11.8...v2.11.9
[v2.11.8]: https://github.com/SAP/ui5-builder/compare/v2.11.7...v2.11.8
[v2.11.7]: https://github.com/SAP/ui5-builder/compare/v2.11.6...v2.11.7
[v2.11.6]: https://github.com/SAP/ui5-builder/compare/v2.11.5...v2.11.6
[v2.11.5]: https://github.com/SAP/ui5-builder/compare/v2.11.4...v2.11.5
[v2.11.4]: https://github.com/SAP/ui5-builder/compare/v2.11.3...v2.11.4
[v2.11.3]: https://github.com/SAP/ui5-builder/compare/v2.11.2...v2.11.3
[v2.11.2]: https://github.com/SAP/ui5-builder/compare/v2.11.1...v2.11.2
[v2.11.1]: https://github.com/SAP/ui5-builder/compare/v2.11.0...v2.11.1
[v2.11.0]: https://github.com/SAP/ui5-builder/compare/v2.10.0...v2.11.0
[v2.10.0]: https://github.com/SAP/ui5-builder/compare/v2.9.5...v2.10.0
[v2.9.5]: https://github.com/SAP/ui5-builder/compare/v2.9.4...v2.9.5
[v2.9.4]: https://github.com/SAP/ui5-builder/compare/v2.9.3...v2.9.4
[v2.9.3]: https://github.com/SAP/ui5-builder/compare/v2.9.2...v2.9.3
[v2.9.2]: https://github.com/SAP/ui5-builder/compare/v2.9.1...v2.9.2
[v2.9.1]: https://github.com/SAP/ui5-builder/compare/v2.9.0...v2.9.1
[v2.9.0]: https://github.com/SAP/ui5-builder/compare/v2.8.4...v2.9.0
[v2.8.4]: https://github.com/SAP/ui5-builder/compare/v2.8.3...v2.8.4
[v2.8.3]: https://github.com/SAP/ui5-builder/compare/v2.8.2...v2.8.3
[v2.8.2]: https://github.com/SAP/ui5-builder/compare/v2.8.1...v2.8.2
[v2.8.1]: https://github.com/SAP/ui5-builder/compare/v2.8.0...v2.8.1
[v2.8.0]: https://github.com/SAP/ui5-builder/compare/v2.7.2...v2.8.0
[v2.7.2]: https://github.com/SAP/ui5-builder/compare/v2.7.1...v2.7.2
[v2.7.1]: https://github.com/SAP/ui5-builder/compare/v2.7.0...v2.7.1
[v2.7.0]: https://github.com/SAP/ui5-builder/compare/v2.6.1...v2.7.0
[v2.6.1]: https://github.com/SAP/ui5-builder/compare/v2.6.0...v2.6.1
[v2.6.0]: https://github.com/SAP/ui5-builder/compare/v2.5.1...v2.6.0
[v2.5.1]: https://github.com/SAP/ui5-builder/compare/v2.5.0...v2.5.1
[v2.5.0]: https://github.com/SAP/ui5-builder/compare/v2.4.5...v2.5.0
[v2.4.5]: https://github.com/SAP/ui5-builder/compare/v2.4.4...v2.4.5
[v2.4.4]: https://github.com/SAP/ui5-builder/compare/v2.4.3...v2.4.4
[v2.4.3]: https://github.com/SAP/ui5-builder/compare/v2.4.2...v2.4.3
[v2.4.2]: https://github.com/SAP/ui5-builder/compare/v2.4.1...v2.4.2
[v2.4.1]: https://github.com/SAP/ui5-builder/compare/v2.4.0...v2.4.1
[v2.4.0]: https://github.com/SAP/ui5-builder/compare/v2.3.0...v2.4.0
[v2.3.0]: https://github.com/SAP/ui5-builder/compare/v2.2.1...v2.3.0
[v2.2.1]: https://github.com/SAP/ui5-builder/compare/v2.2.0...v2.2.1
[v2.2.0]: https://github.com/SAP/ui5-builder/compare/v2.1.0...v2.2.0
[v2.1.0]: https://github.com/SAP/ui5-builder/compare/v2.0.7...v2.1.0
[v2.0.7]: https://github.com/SAP/ui5-builder/compare/v2.0.6...v2.0.7
[v2.0.6]: https://github.com/SAP/ui5-builder/compare/v2.0.5...v2.0.6
[v2.0.5]: https://github.com/SAP/ui5-builder/compare/v2.0.4...v2.0.5
[v2.0.4]: https://github.com/SAP/ui5-builder/compare/v2.0.3...v2.0.4
[v2.0.3]: https://github.com/SAP/ui5-builder/compare/v2.0.2...v2.0.3
[v2.0.2]: https://github.com/SAP/ui5-builder/compare/v2.0.1...v2.0.2
[v2.0.1]: https://github.com/SAP/ui5-builder/compare/v2.0.0...v2.0.1
[v2.0.0]: https://github.com/SAP/ui5-builder/compare/v1.10.1...v2.0.0
[v1.10.1]: https://github.com/SAP/ui5-builder/compare/v1.10.0...v1.10.1
[v1.10.0]: https://github.com/SAP/ui5-builder/compare/v1.9.0...v1.10.0
[v1.9.0]: https://github.com/SAP/ui5-builder/compare/v1.8.0...v1.9.0
[v1.8.0]: https://github.com/SAP/ui5-builder/compare/v1.7.1...v1.8.0
[v1.7.1]: https://github.com/SAP/ui5-builder/compare/v1.7.0...v1.7.1
[v1.7.0]: https://github.com/SAP/ui5-builder/compare/v1.6.1...v1.7.0
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
