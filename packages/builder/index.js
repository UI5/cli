/**
 * @module @ui5/builder
 * @public
 */
module.exports = {
	/**
	 * @type {import('./lib/builder/builder')}
	 */
	builder: "./lib/builder/builder",
	/**
	 * @public
	 * @alias module:@ui5/builder.processors
	 * @namespace
	 */
	processors: {
		/**
		 * @type {import('./lib/processors/bundlers/flexChangesBundler')}
		 */
		flexChangesBundler: "./lib/processors/bundlers/flexChangesBundler",
		/**
		 * @type {import('./lib/processors/bundlers/manifestBundler')}
		 */
		manifestBundler: "./lib/processors/bundlers/manifestBundler",
		/**
		 * @type {import('./lib/processors/bundlers/moduleBundler')}
		 */
		moduleBundler: "./lib/processors/bundlers/moduleBundler",
		/**
		 * @type {import('./lib/processors/jsdoc/apiIndexGenerator')}
		 */
		apiIndexGenerator: "./lib/processors/jsdoc/apiIndexGenerator",
		/**
		 * @type {import('./lib/processors/jsdoc/jsdocGenerator')}
		 */
		jsdocGenerator: "./lib/processors/jsdoc/jsdocGenerator",
		/**
		 * @type {import('./lib/processors/jsdoc/sdkTransformer')}
		 */
		sdkTransformer: "./lib/processors/jsdoc/sdkTransformer",
		/**
		 * @type {import('./lib/processors/bootstrapHtmlTransformer')}
		 */
		bootstrapHtmlTransformer: "./lib/processors/bootstrapHtmlTransformer",
		/**
		 * @type {import('./lib/processors/debugFileCreator')}
		 */
		debugFileCreator: "./lib/processors/debugFileCreator",
		/**
		 * @type {import('./lib/processors/libraryLessGenerator')}
		 */
		libraryLessGenerator: "./lib/processors/libraryLessGenerator",
		/**
		 * @type {import('./lib/processors/resourceCopier')}
		 */
		resourceCopier: "./lib/processors/resourceCopier",
		/**
		 * @type {import('./lib/processors/nonAsciiEscaper')}
		 */
		nonAsciiEscaper: "./lib/processors/nonAsciiEscaper",
		/**
		 * @type {import('./lib/processors/stringReplacer')}
		 */
		stringReplacer: "./lib/processors/stringReplacer",
		/**
		 * @type {import('./lib/processors/themeBuilder')}
		 */
		themeBuilder: "./lib/processors/themeBuilder",
		/**
		 * @type {import('./lib/processors/uglifier')}
		 */
		uglifier: "./lib/processors/uglifier",
		/**
		 * @type {import('./lib/processors/versionInfoGenerator')}
		 */
		versionInfoGenerator: "./lib/processors/versionInfoGenerator"
	},
	/**
	 * @public
	 * @alias module:@ui5/builder.tasks
	 * @namespace
	 */
	tasks: {
		/**
		 * @type {import('./lib/tasks/bundlers/generateComponentPreload')}
		 */
		generateComponentPreload: "./lib/tasks/bundlers/generateComponentPreload",
		/**
		 * @type {import('./lib/tasks/bundlers/generateFlexChangesBundle')}
		 */
		generateFlexChangesBundle: "./lib/tasks/bundlers/generateFlexChangesBundle",
		/**
		 * @type {import('./lib/tasks/bundlers/generateLibraryPreload')}
		 */
		generateLibraryPreload: "./lib/tasks/bundlers/generateLibraryPreload",
		/**
		 * @type {import('./lib/tasks/bundlers/generateManifestBundle')}
		 */
		generateManifestBundle: "./lib/tasks/bundlers/generateManifestBundle",
		/**
		 * @type {import('./lib/tasks/bundlers/generateStandaloneAppBundle')}
		 */
		generateStandaloneAppBundle: "./lib/tasks/bundlers/generateStandaloneAppBundle",
		/**
		 * @type {import('./lib/tasks/generateThemeDesignerResources')}
		 */
		generateThemeDesignerResources: "./lib/tasks/generateThemeDesignerResources",
		/**
		 * @type {import('./lib/tasks/bundlers/generateBundle')}
		 */
		generateBundle: "./lib/tasks/bundlers/generateBundle",
		/**
		 * @type {import('./lib/tasks/generateCachebusterInfo')}
		 */
		generateCachebusterInfo: "./lib/tasks/generateCachebusterInfo",
		/**
		 * @type {import('./lib/tasks/buildThemes')}
		 */
		buildThemes: "./lib/tasks/buildThemes",
		/**
		 * @type {import('./lib/tasks/createDebugFiles')}
		 */
		createDebugFiles: "./lib/tasks/createDebugFiles",
		/**
		 * @type {import('./lib/tasks/jsdoc/executeJsdocSdkTransformation')}
		 */
		executeJsdocSdkTransformation: "./lib/tasks/jsdoc/executeJsdocSdkTransformation",
		/**
		 * @type {import('./lib/tasks/jsdoc/generateApiIndex')}
		 */
		generateApiIndex: "./lib/tasks/jsdoc/generateApiIndex",
		/**
		 * @type {import('./lib/tasks/jsdoc/generateJsdoc')}
		 */
		generateJsdoc: "./lib/tasks/jsdoc/generateJsdoc",
		/**
		 * @type {import('./lib/tasks/generateVersionInfo')}
		 */
		generateVersionInfo: "./lib/tasks/generateVersionInfo",
		/**
		 * @type {import('./lib/tasks/escapeNonAsciiCharacters')}
		 */
		escapeNonAsciiCharacters: "./lib/tasks/escapeNonAsciiCharacters",
		/**
		 * @type {import('./lib/tasks/replaceCopyright')}
		 */
		replaceCopyright: "./lib/tasks/replaceCopyright",
		/**
		 * @type {import('./lib/tasks/replaceVersion')}
		 */
		replaceVersion: "./lib/tasks/replaceVersion",
		/**
		 * @type {import('./lib/tasks/transformBootstrapHtml')}
		 */
		transformBootstrapHtml: "./lib/tasks/transformBootstrapHtml",
		/**
		 * @type {import('./lib/tasks/uglify')}
		 */
		uglify: "./lib/tasks/uglify",
		/**
		 * @type {import('./lib/tasks/taskRepository')}
		 */
		taskRepository: "./lib/tasks/taskRepository",
		/**
		 * @type {import('./lib/tasks/TaskUtil')}
		 */
		TaskUtil: "./lib/tasks/TaskUtil"
	},
	/**
	 * @private
	 * @alias module:@ui5/builder.types
	 * @namespace
	 */
	types: {
		/**
		 * @type {typeof import('./lib/types/AbstractBuilder')}
		 */
		AbstractBuilder: "./lib/types/AbstractBuilder",
		/**
		 * @type {typeof import('./lib/types/AbstractFormatter')}
		 */
		AbstractFormatter: "./lib/types/AbstractFormatter",
		/**
		 * @type {import('./lib/types/application/applicationType')}
		 */
		application: "./lib/types/application/applicationType",
		/**
		 * @type {import('./lib/types/library/libraryType')}
		 */
		library: "./lib/types/library/libraryType",
		/**
		 * @type {import('./lib/types/themeLibrary/themeLibraryType')}
		 */
		themeLibrary: "./lib/types/themeLibrary/themeLibraryType",
		/**
		 * @type {import('./lib/types/module/moduleType')}
		 */
		module: "./lib/types/module/moduleType",
		/**
		 * @type {import('./lib/types/typeRepository')}
		 */
		typeRepository: "./lib/types/typeRepository"
	}
};

function exportModules(exportRoot, modulePaths) {
	for (const moduleName of Object.keys(modulePaths)) {
		if (typeof modulePaths[moduleName] === "object") {
			exportRoot[moduleName] = {};
			exportModules(exportRoot[moduleName], modulePaths[moduleName]);
		} else {
			Object.defineProperty(exportRoot, moduleName, {
				get() {
					return require(modulePaths[moduleName]);
				}
			});
		}
	}
}

exportModules(module.exports, JSON.parse(JSON.stringify(module.exports)));
