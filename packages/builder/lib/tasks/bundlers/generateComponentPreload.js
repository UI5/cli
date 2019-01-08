const path = require("path");
const moduleBundler = require("../../processors/bundlers/moduleBundler");
const ReaderCollectionPrioritized = require("@ui5/fs").ReaderCollectionPrioritized;

/**
 * Task to for application bundling.
 *
 * @public
 * @alias @ui5/builder.tasks.generateComponentPreload
 * @param {Object} parameters Parameters
 * @param {DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {AbstractReader} parameters.dependencies Reader or Collection to read dependency files
 * @param {Object} parameters.options Options
 * @param {string} parameters.options.projectName Project name
 * @param {Array} [parameters.options.paths] Array of paths (or glob patterns) for component files
 * @param {Array} [parameters.options.namespaces] Array of component namespaces
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
module.exports = function({workspace, dependencies, options}) {
	const combo = new ReaderCollectionPrioritized({
		name: `generateComponentPreload - prioritize workspace over dependencies: ${options.projectName}`,
		readers: [workspace, dependencies]
	});

	return combo.byGlob("/resources/**/*.{js,json,xml,html,properties,library}")
		.then(async (resources) => {
			let namespaces = [];
			if (options.paths) {
				namespaces = await Promise.all(options.paths.map(async (componentPath) => {
					const components = await combo.byGlob("/resources/" + componentPath);
					return components.map((component) => {
						return path.dirname(component.getPath()).replace(/^\/resources\//i, "");
					});
				}));
			}
			if (options.namespaces) {
				namespaces.push(...options.namespaces);
			}

			namespaces = Array.prototype.concat.apply([], namespaces);
			if (!namespaces || !namespaces.length) {
				throw new Error("generateComponentPreload: No component namespace(s) " +
					`found for project: ${options.projectName}`);
			}

			return Promise.all(namespaces.map((namespace) => {
				const filters = [
					`${namespace}/`,
					`!${namespace}/test/`,
					`!${namespace}/*.html`
				];

				// Exclude other namespaces
				namespaces.forEach((ns) => {
					if (ns !== namespace && ns.indexOf(namespace) === 0) {
						filters.push(`!${ns}/`);
					}
				});

				return moduleBundler({
					resources,
					options: {
						bundleDefinition: {
							name: `${namespace}/Component-preload.js`,
							defaultFileTypes: [".js", ".fragment.xml", ".view.xml", ".properties", ".json"],
							sections: [
								{
									mode: "preload",
									filters: filters,
									resolve: false,
									resolveConditional: false,
									renderer: false
								}
							]
						}
					}
				});
			}));
		})
		.then((processedResources) => {
			return Promise.all(processedResources.map((resource) => {
				return workspace.write(resource[0]);
			}));
		});
};
