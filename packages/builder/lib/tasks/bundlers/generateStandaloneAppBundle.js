const log = require("@ui5/logger").getLogger("builder:tasks:bundlers:generateStandaloneAppBundle");
const moduleBundler = require("../../processors/bundlers/moduleBundler");

/**
 * Task for bundling standalone applications.
 *
 * @public
 * @alias module:@ui5/builder.tasks.generateStandaloneAppBundle
 * @param {Object} parameters Parameters
 * @param {module:@ui5/fs.DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {module:@ui5/fs.AbstractReader} parameters.dependencies Reader or Collection to read dependency files
 * @param {Object} parameters.options Options
 * @param {string} parameters.options.projectName Project name
 * @param {string} [parameters.options.namespace] Project namespace
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
module.exports = async function({workspace, dependencies, options}) {
	if (!options.namespace) {
		log.warn(`Namespace of project ${options.projectName} is not known. Self contained bundling is currently ` +
			`unable to generate complete bundles for such projects.`);
	}

	// If an application does not have a namespace, its resources are located at the root. Otherwise in /resources
	// For dependencies, we do not want to search in their test-resources
	const results = await Promise.all([
		workspace.byGlob("/**/*.{js,json,xml,html,properties,library}"),
		dependencies.byGlob("/resources/**/*.{js,json,xml,html,properties,library}")
	]);
	const resources = Array.prototype.concat.apply([], results);

	const isEvo = resources.find((resource) => {
		return resource.getPath() === "/resources/ui5loader.js";
	});
	let filters;
	if (isEvo) {
		filters = ["ui5loader-autoconfig.js"];
	} else {
		filters = ["jquery.sap.global.js"];
	}

	const processedResources = await moduleBundler({
		resources,
		options: {
			bundleDefinition: {
				name: "sap-ui-custom.js",
				defaultFileTypes: [".js", ".fragment.xml", ".view.xml", ".properties", ".json"],
				sections: [
					{
						// include all 'raw' modules that are needed for the UI5 loader
						mode: "raw",
						filters,
						resolve: true, // dependencies for raw modules are taken from shims in .library files
						sort: true, // topological sort on raw modules is mandatory
						declareModules: false
					},
					{
						mode: "preload",
						filters: [
							`${options.namespace || ""}/`,
							`!${options.namespace || ""}/test/`,
							`!${options.namespace || ""}/*.html`,
							"sap/ui/core/Core.js"
						],
						resolve: true,
						resolveConditional: true,
						renderer: true
					},
					// finally require and execute sap/ui/core/Core
					{
						mode: "require",
						filters: [
							"sap/ui/core/Core.js"
						]
					}
				]
			}
		}
	});

	await Promise.all(processedResources.map((resource) => workspace.write(resource)));
};
