const moduleBundler = require("../../processors/bundlers/moduleBundler");
const ReaderCollectionPrioritized = require("@ui5/fs").ReaderCollectionPrioritized;

/**
 * Generates a bundle based on the given bundle definition
 *
 * @public
 * @alias module:@ui5/builder.tasks.generateBundle
 * @param {object} parameters Parameters
 * @param {module:@ui5/fs.DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {Collection} parameters.dependencies Collection to read dependency files
 * @param {object} parameters.options Options
 * @param {string} parameters.options.projectName Project name
 * @param {object} parameters.options.bundleDefinition Module bundle definition
 * @param {string} parameters.options.bundleDefinition.name The module bundle name
 * @param {string[]} [parameters.options.bundleDefinition.defaultFileTypes=[".js", ".fragment.xml", ".view.xml", ".properties", ".json"]] List of default file types to be included in the bundle
 * @param {ModuleBundleDefinitionSection[]} parameters.options.bundleDefinition.sections List of module bundle definition sections
 * @param {object} parameters.options.bundleOptions Module bundle options
 * @param {boolean} [parameters.options.bundleOptions.optimize=false] If set to 'true' the module bundle gets minified
 * @param {boolean} [parameters.options.bundleOptions.decorateBootstrapModule=true] If set to 'false', the module won't be decorated with an optimization marker
 * @param {boolean} [parameters.options.bundleOptions.addTryCatchRestartWrapper=false] Whether to wrap bootable module bundles with a try/catch to filter out "Restart" errors
 * @param {boolean} [parameters.options.bundleOptions.usePredefineCalls=false] If set to 'true', sap.ui.predefine is used for UI5 modules
 * @param {number} [parameters.options.bundleOptions.numberOfParts=1] The number of parts the module bundle should be splitted
 * @returns {Promise} Promise resolving with <code>undefined</code> once data has been written
 */
module.exports = function({workspace, dependencies, options}) {
	const combo = new ReaderCollectionPrioritized({
		name: `libraryBundler - prioritize workspace over dependencies: ${options.projectName}`,
		readers: [workspace, dependencies]
	});

	return combo.byGlob("/resources/**/*.{js,json,xml,html,properties,library}").then((resources) => {
		return moduleBundler({
			options: {
				bundleDefinition: options.bundleDefinition,
				bundleOptions: options.bundleOptions
			},
			resources
		}).then((bundles) => {
			bundles.forEach((bundle) => {
				workspace.write(bundle);
			});
		});
	});
};
