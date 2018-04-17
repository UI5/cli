const ui5Builder = {
	builder: require("./lib/builder/builder"),
	processors: {
		flexChangesBundler: require("./lib/processors/bundlers/flexChangesBundler"),
		manifestBundler: require("./lib/processors/bundlers/manifestBundler"),
		moduleBundler: require("./lib/processors/bundlers/moduleBundler"),
		debugFileCreator: require("./lib/processors/debugFileCreator"),
		resourceCopier: require("./lib/processors/resourceCopier"),
		stringReplacer: require("./lib/processors/stringReplacer"),
		themeBuilder: require("./lib/processors/themeBuilder"),
		uglifier: require("./lib/processors/uglifier"),
		versionInfoGenerator: require("./lib/processors/versionInfoGenerator")
	},
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
		uglify: require("./lib/tasks/uglify")
	},
	types: {
		AbstractBuilder: require("./lib/types/AbstractBuilder"),
		AbstractFormatter: require("./lib/types/AbstractFormatter"),
		application: require("./lib/types/application/applicationType"),
		library: require("./lib/types/library/libraryType"),
		typeRepository: require("./lib/types/typeRepository")
	}
};

module.exports = ui5Builder;
