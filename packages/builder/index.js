/**
 * @module @ui5/builder
 * @public
 */
module.exports = {
	builder: require("./lib/builder/builder"),
	/**
	 * @public
	 * @see @ui5/builder.processors
	 */
	processors: {
		flexChangesBundler: require("./lib/processors/bundlers/flexChangesBundler"),
		manifestBundler: require("./lib/processors/bundlers/manifestBundler"),
		moduleBundler: require("./lib/processors/bundlers/moduleBundler"),
		bootstrapHtmlTransformer: require("./lib/processors/bootstrapHtmlTransformer"),
		debugFileCreator: require("./lib/processors/debugFileCreator"),
		resourceCopier: require("./lib/processors/resourceCopier"),
		stringReplacer: require("./lib/processors/stringReplacer"),
		themeBuilder: require("./lib/processors/themeBuilder"),
		uglifier: require("./lib/processors/uglifier"),
		versionInfoGenerator: require("./lib/processors/versionInfoGenerator")
	},
	/**
	 * @public
	 * @see @ui5/builder.tasks
	 */
	tasks: {
		generateComponentPreload: require("./lib/tasks/bundlers/generateComponentPreload"),
		generateFlexChangesBundle: require("./lib/tasks/bundlers/generateFlexChangesBundle"),
		generateLibraryPreload: require("./lib/tasks/bundlers/generateLibraryPreload"),
		generateManifestBundle: require("./lib/tasks/bundlers/generateManifestBundle"),
		generateStandaloneAppBundle: require("./lib/tasks/bundlers/generateStandaloneAppBundle"),
		generateBundle: require("./lib/tasks/bundlers/generateBundle"),
		buildThemes: require("./lib/tasks/buildThemes"),
		createDebugFiles: require("./lib/tasks/createDebugFiles"),
		generateVersionInfo: require("./lib/tasks/generateVersionInfo"),
		replaceCopyright: require("./lib/tasks/replaceCopyright"),
		replaceVersion: require("./lib/tasks/replaceVersion"),
		transformBootstrapHtml: require("./lib/tasks/transformBootstrapHtml"),
		uglify: require("./lib/tasks/uglify"),
		taskRepository: require("./lib/tasks/taskRepository")
	},
	/**
	 * @private
	 * @see @ui5/builder.types
	 */
	types: {
		AbstractBuilder: require("./lib/types/AbstractBuilder"),
		AbstractFormatter: require("./lib/types/AbstractFormatter"),
		application: require("./lib/types/application/applicationType"),
		library: require("./lib/types/library/libraryType"),
		typeRepository: require("./lib/types/typeRepository")
	}
};

/**
 * @public
 * @namespace @ui5/builder.processors
 */
/**
 * @public
 * @namespace @ui5/builder.tasks
 */
/**
 * @private
 * @namespace @ui5/builder.types
 */
