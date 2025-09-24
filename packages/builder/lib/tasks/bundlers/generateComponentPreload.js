import path from "node:path";
import moduleBundler from "../../processors/bundlers/moduleBundler.js";
import {applyDefaultsToBundleDefinition} from "./utils/applyDefaultsToBundleDefinition.js";
import {getLogger} from "@ui5/logger";
const log = getLogger("builder:tasks:bundlers:generateComponentPreload");
import {negateFilters} from "../../lbt/resources/ResourceFilterList.js";

/**
 * @public
 * @module @ui5/builder/tasks/bundlers/generateComponentPreload
 */

/**
 * Task to for application bundling.
 *
 * @public
 * @function default
 * @static
 *
 * @param {object} parameters Parameters
 * @param {@ui5/fs/DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {@ui5/project/build/helpers/TaskUtil|object} [parameters.taskUtil] TaskUtil
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
 * @param {string[]} [parameters.options.skipBundles] Names of bundles that should not be created
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
export default async function({
	workspace, taskUtil, options: {projectName, paths, namespaces, skipBundles = [], excludes = []}
}) {
	let nonDbgWorkspace = workspace;
	if (taskUtil) {
		nonDbgWorkspace = taskUtil.resourceFactory.createFilterReader({
			reader: workspace,
			callback: function(resource) {
				// Remove any debug variants
				return !taskUtil.getTag(resource, taskUtil.STANDARD_TAGS.IsDebugVariant);
			}
		});
	}

	return nonDbgWorkspace.byGlob("/resources/**/*.{js,json,xml,html,properties,library,js.map}")
		.then(async (resources) => {
			let allNamespaces = [];
			if (paths) {
				allNamespaces = await Promise.all(paths.map(async (componentPath) => {
					const globPath = "/resources/" + componentPath;
					log.verbose(`Globbing for Components directories with configured path ${globPath}...`);
					const components = await nonDbgWorkspace.byGlob(globPath);
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
				const bundleName = `${namespace}/Component-preload.js`;
				if (skipBundles.includes(bundleName)) {
					log.verbose(`Skipping generation of bundle ${bundleName}`);
					return null;
				}

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
					name: bundleName,
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
			const coreVersion = taskUtil?.getProject("sap.ui.core")?.getVersion();
			const allowStringBundling = taskUtil?.getProject().getSpecVersion().lt("4.0");
			return Promise.all(bundleDefinitions.filter(Boolean).map((bundleDefinition) => {
				log.verbose(`Generating ${bundleDefinition.name}...`);
				const options = {
					bundleDefinition: applyDefaultsToBundleDefinition(bundleDefinition, taskUtil),
					bundleOptions: {
						ignoreMissingModules: true,
						optimize: true
					},
					allowStringBundling
				};
				if (coreVersion) {
					options.targetUi5CoreVersion = coreVersion;
				}
				return moduleBundler({
					resources,
					options
				});
			}));
		})
		.then((results) => {
			const bundles = Array.prototype.concat.apply([], results);
			return Promise.all(bundles.map(({bundle, sourceMap}) => {
				if (taskUtil) {
					taskUtil.setTag(bundle, taskUtil.STANDARD_TAGS.IsBundle);
					// Clear tag that might have been set by the minify task, in cases where
					// the bundle name is identical to a source file
					taskUtil.clearTag(sourceMap, taskUtil.STANDARD_TAGS.OmitFromBuildResult);
				}
				return Promise.all([
					workspace.write(bundle),
					workspace.write(sourceMap)
				]);
			}));
		});
}
