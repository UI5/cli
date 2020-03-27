/**
 * @module @ui5/builder
 * @public
 */
const modules = {
	builder: "./lib/builder/builder",
	/**
	 * @public
	 * @see module:@ui5/builder.processors
	 * @namespace
	 */
	processors: {
		flexChangesBundler: "./lib/processors/bundlers/flexChangesBundler",
		manifestBundler: "./lib/processors/bundlers/manifestBundler",
		moduleBundler: "./lib/processors/bundlers/moduleBundler",
		apiIndexGenerator: "./lib/processors/jsdoc/apiIndexGenerator",
		jsdocGenerator: "./lib/processors/jsdoc/jsdocGenerator",
		sdkTransformer: "./lib/processors/jsdoc/sdkTransformer",
		bootstrapHtmlTransformer: "./lib/processors/bootstrapHtmlTransformer",
		debugFileCreator: "./lib/processors/debugFileCreator",
		resourceCopier: "./lib/processors/resourceCopier",
		nonAsciiEscaper: "./lib/processors/nonAsciiEscaper",
		stringReplacer: "./lib/processors/stringReplacer",
		themeBuilder: "./lib/processors/themeBuilder",
		uglifier: "./lib/processors/uglifier",
		versionInfoGenerator: "./lib/processors/versionInfoGenerator"
	},
	/**
	 * @public
	 * @see module:@ui5/builder.tasks
	 * @namespace
	 */
	tasks: {
		generateComponentPreload: "./lib/tasks/bundlers/generateComponentPreload",
		generateFlexChangesBundle: "./lib/tasks/bundlers/generateFlexChangesBundle",
		generateLibraryPreload: "./lib/tasks/bundlers/generateLibraryPreload",
		generateManifestBundle: "./lib/tasks/bundlers/generateManifestBundle",
		generateStandaloneAppBundle: "./lib/tasks/bundlers/generateStandaloneAppBundle",
		generateBundle: "./lib/tasks/bundlers/generateBundle",
		generateCachebusterInfo: "./lib/tasks/generateCachebusterInfo",
		buildThemes: "./lib/tasks/buildThemes",
		createDebugFiles: "./lib/tasks/createDebugFiles",
		executeJsdocSdkTransformation: "./lib/tasks/jsdoc/executeJsdocSdkTransformation",
		generateApiIndex: "./lib/tasks/jsdoc/generateApiIndex",
		generateJsdoc: "./lib/tasks/jsdoc/generateJsdoc",
		generateVersionInfo: "./lib/tasks/generateVersionInfo",
		escapeNonAsciiCharacters: "./lib/tasks/escapeNonAsciiCharacters",
		replaceCopyright: "./lib/tasks/replaceCopyright",
		replaceVersion: "./lib/tasks/replaceVersion",
		transformBootstrapHtml: "./lib/tasks/transformBootstrapHtml",
		uglify: "./lib/tasks/uglify",
		taskRepository: "./lib/tasks/taskRepository"
	},
	/**
	 * @private
	 * @see module:@ui5/builder.types
	 * @namespace
	 */
	types: {
		AbstractBuilder: "./lib/types/AbstractBuilder",
		AbstractFormatter: "./lib/types/AbstractFormatter",
		application: "./lib/types/application/applicationType",
		library: "./lib/types/library/libraryType",
		typeRepository: "./lib/types/typeRepository"
	}
};

function exportModules(exportRoot, modulePaths) {
	for (const moduleName in modulePaths) {
		if (modulePaths.hasOwnProperty(moduleName)) {
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
}

exportModules(module.exports, modules);
