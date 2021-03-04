const path = require("path");
const moduleBundler = require("../../processors/bundlers/moduleBundler");
const log = require("@ui5/logger").getLogger("builder:tasks:bundlers:generateComponentPreload");
const ReaderCollectionPrioritized = require("@ui5/fs").ReaderCollectionPrioritized;
const {negateFilters} = require("../../lbt/resources/ResourceFilterList");

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
 * @param {string[]} [parameters.options.excludes=[]] List of modules declared as glob patterns (resource name patterns)
 * that should be excluded.
 * A pattern ending with a slash '/' will, similarly to the use of a single '*' or double '**' asterisk,
 * denote an arbitrary number of characters or folder names.
 * Re-includes should be marked with a leading exclamation mark '!'. The order of filters is relevant; a later
 * inclusion overrides an earlier exclusion, and vice versa.
 * @param {string[]} [parameters.options.paths] Array of paths (or glob patterns) for component files
 * @param {string[]} [parameters.options.namespaces] Array of component namespaces
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
module.exports = function({
	workspace, dependencies, taskUtil, options: {projectName, paths, namespaces, excludes = []}
}) {
	const combo = new ReaderCollectionPrioritized({
		name: `generateComponentPreload - prioritize workspace over dependencies: ${projectName}`,
		readers: [workspace, dependencies]
	});

	// TODO 3.0: Limit to workspace resources?
	return combo.byGlob("/resources/**/*.{js,json,xml,html,properties,library}")
		.then(async (resources) => {
			let allNamespaces = [];
			if (paths) {
				allNamespaces = await Promise.all(paths.map(async (componentPath) => {
					const globPath = "/resources/" + componentPath;
					log.verbose(`Globbing for Components directories with configured path ${globPath}...`);
					const components = await combo.byGlob(globPath); // TODO 3.0: Limit to workspace resources?
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

			const allFilterExcludes = negateFilters(excludes);
			const unusedFilterExcludes = new Set(allFilterExcludes);

			const bundleDefinitions = allNamespaces.map((namespace) => {
				const filters = [
					`${namespace}/`,
					`${namespace}/**/manifest.json`,
					`${namespace}/changes/changes-bundle.json`,
					`${namespace}/changes/flexibility-bundle.json`,
					`!${namespace}/test/`
				];

				// Add configured excludes for namespace
				allFilterExcludes.forEach((filterExclude) => {
					// Allow all excludes (!) and limit re-includes (+) to the component namespace
					if (filterExclude.startsWith("!") || filterExclude.startsWith(`+${namespace}/`)) {
						filters.push(filterExclude);
						unusedFilterExcludes.delete(filterExclude);
					}
				});

				// Exclude other namespaces at the end of filter list to override potential re-includes
				// from "excludes" config
				allNamespaces.forEach((ns) => {
					if (ns !== namespace && ns.startsWith(`${namespace}/`)) {
						filters.push(`!${ns}/`);
						// Explicitly exclude manifest.json files of subcomponents since the general exclude above this
						// comment only applies to the configured default file types, which do not include ".json"
						filters.push(`!${ns}/**/manifest.json`);
					}
				});

				return {
					name: `${namespace}/Component-preload.js`,
					defaultFileTypes: [
						".js",
						".control.xml",
						".fragment.html",
						".fragment.json",
						".fragment.xml",
						".view.html",
						".view.json",
						".view.xml",
						".properties"
					],
					sections: [
						{
							mode: "preload",
							filters: filters,
							resolve: false,
							resolveConditional: false,
							renderer: false
						}
					]
				};
			});

			if (unusedFilterExcludes.size > 0) {
				unusedFilterExcludes.forEach((filterExclude) => {
					log.warn(
						`Configured preload exclude contains invalid re-include: !${filterExclude.substr(1)}. ` +
						`Re-includes must start with a component namespace (${allNamespaces.join(" or ")})`
					);
				});
			}

			return Promise.all(bundleDefinitions.map((bundleDefinition) => {
				log.verbose(`Generating ${bundleDefinition.name}...`);
				return moduleBundler({
					resources,
					options: {
						bundleDefinition,
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
