const path = require("path");
const moduleBundler = require("../../processors/bundlers/moduleBundler");
const log = require("@ui5/logger").getLogger("builder:tasks:bundlers:generateComponentPreload");
const ReaderCollectionPrioritized = require("@ui5/fs").ReaderCollectionPrioritized;

/**
 * Task to for application bundling.
 *
 * @public
 * @alias module:@ui5/builder.tasks.generateComponentPreload
 * @param {object} parameters Parameters
 * @param {module:@ui5/fs.DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {module:@ui5/fs.AbstractReader} parameters.dependencies Reader or Collection to read dependency files
 * @param {module:@ui5/builder.tasks.TaskUtil|object} [parameters.taskUtil] TaskUtil
 * @param {object} parameters.options Options
 * @param {string} parameters.options.projectName Project name
 * @param {Array} [parameters.options.paths] Array of paths (or glob patterns) for component files
 * @param {Array} [parameters.options.namespaces] Array of component namespaces
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
module.exports = function({workspace, dependencies, taskUtil, options: {projectName, paths, namespaces}}) {
	const combo = new ReaderCollectionPrioritized({
		name: `generateComponentPreload - prioritize workspace over dependencies: ${projectName}`,
		readers: [workspace, dependencies]
	});

	return combo.byGlob("/resources/**/*.{js,json,xml,html,properties,library}")
		.then(async (resources) => {
			let allNamespaces = [];
			if (paths) {
				allNamespaces = await Promise.all(paths.map(async (componentPath) => {
					const globPath = "/resources/" + componentPath;
					log.verbose(`Globbing for Components directories with configured path ${globPath}...`);
					const components = await combo.byGlob(globPath);
					return components.map((component) => {
						const compDir = path.dirname(component.getPath()).replace(/^\/resources\//i, "");
						log.verbose(`Found component namespace ${compDir}`);
						return compDir;
					});
				}));
			}
			if (namespaces) {
				allNamespaces.push(...namespaces);
			}

			allNamespaces = Array.prototype.concat.apply([], allNamespaces);
			// As this task is often called with a single namespace, also check
			//	for bad calls like "namespaces: [undefined]"
			if (!allNamespaces || !allNamespaces.length || !allNamespaces[0]) {
				throw new Error("generateComponentPreload: No component namespace(s) " +
					`found for project: ${projectName}`);
			}

			return Promise.all(allNamespaces.map((namespace) => {
				const filters = [
					`${namespace}/`,
					`!${namespace}/test/`,
					`!${namespace}/*.html`
				];

				// Exclude other namespaces
				allNamespaces.forEach((ns) => {
					if (ns !== namespace && ns.indexOf(namespace) === 0) {
						filters.push(`!${ns}/`);
					}
				});

				log.verbose(`Requesting Component-preload.js for namespace ${namespace}...`);
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
						},
						bundleOptions: {
							ignoreMissingModules: true,
							optimize: true
						}
					}
				});
			}));
		})
		.then((processedResources) => {
			return Promise.all(processedResources.map((resource) => {
				if (taskUtil) {
					taskUtil.setTag(resource[0], taskUtil.STANDARD_TAGS.IsBundle);
				}
				return workspace.write(resource[0]);
			}));
		});
};
