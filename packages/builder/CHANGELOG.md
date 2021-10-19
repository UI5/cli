# Changelog
All notable changes to this project will be documented in this file.  
This project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

A list of unreleased changes can be found [here](https://github.com/SAP/ui5-builder/compare/v2.11.1...HEAD).

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
