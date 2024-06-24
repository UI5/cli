import moduleBundler from "../../processors/bundlers/moduleBundler.js";
import {applyDefaultsToBundleDefinition} from "./utils/applyDefaultsToBundleDefinition.js";
import createModuleNameMapping from "./utils/createModuleNameMapping.js";
import ReaderCollectionPrioritized from "@ui5/fs/ReaderCollectionPrioritized";

/**
 * @public
 * @module @ui5/builder/tasks/bundlers/generateBundle
 */

/* eslint-disable max-len */
/**
 * Generates a bundle based on the given bundle definition
 *
 * @public
 * @function default
 * @static
 *
 * @param {object} parameters Parameters
 * @param {@ui5/fs/DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {@ui5/fs/ReaderCollection} parameters.dependencies Collection to read dependency files
 * @param {@ui5/project/build/helpers/TaskUtil|object} [parameters.taskUtil] TaskUtil
 * @param {object} parameters.options Options
 * @param {string} parameters.options.projectName Project name
 * @param {module:@ui5/builder/processors/bundlers/moduleBundler~ModuleBundleDefinition} parameters.options.bundleDefinition Module
 * 			bundle definition
 * @param {module:@ui5/builder/processors/bundlers/moduleBundler~ModuleBundleOptions} [parameters.options.bundleOptions] Module
 * 			bundle options
 * @returns {Promise} Promise resolving with <code>undefined</code> once data has been written
 */
/* eslint-enable max-len */
export default async function({
	workspace, dependencies, taskUtil, options: {projectName, bundleDefinition, bundleOptions}
}) {
	let combo = new ReaderCollectionPrioritized({
		name: `generateBundle - prioritize workspace over dependencies: ${projectName}`,
		readers: [workspace, dependencies]
	});

	const optimize = !bundleOptions || bundleOptions.optimize !== false;
	if (taskUtil) {
		/* Scenarios
			1. Optimize bundle with minification already done
				Workspace:
					* /resources/my/lib/Control.js 				[ui5:HasDebugVariant]
					* /resources/my/lib/Control.js.map 			[ui5:HasDebugVariant]
					* /resources/my/lib/Control-dbg.js 			[ui5:IsDebugVariant]

				Bundler input:
					* /resources/my/lib/Control.js
					* /resources/my/lib/Control.js.map

				=> Filter out debug resources

			2. Optimize bundle with no minification
				* /resources/my/lib/Control.js

				=> No action necessary

			3. Debug-bundle with minification already done
				Workspace:
					* /resources/my/lib/Control.js 				[ui5:HasDebugVariant]
					* /resources/my/lib/Control.js.map 			[ui5:HasDebugVariant]
					* /resources/my/lib/Control-dbg.js 			[ui5:IsDebugVariant]

				Bundler input:
					* /resources/my/lib/Control-dbg.js
					* moduleNameMapping: [{"/resources/my/lib/Control-dbg.js": "my/lib/Control.js"}]

				=> Filter out minified-resources (tagged as "HasDebugVariant", incl. source maps) and rename debug-files

			4. Debug-bundle with no minification
				* /resources/my/lib/Control.js

				=> No action necessary

			5. Bundle with external input (optimize or not), e.g. TS-project
				Workspace:
					* /resources/my/lib/Control.ts
					* /resources/my/lib/Control.js
					* /resources/my/lib/Control.js.map

				Bundler input:
					* /resources/my/lib/Control.js
					* /resources/my/lib/Control.js.map
		*/

		// Omit -dbg files for optimize bundles and vice versa
		const filterTag = optimize ?
			taskUtil.STANDARD_TAGS.IsDebugVariant : taskUtil.STANDARD_TAGS.HasDebugVariant;
		combo = taskUtil.resourceFactory.createFilterReader({
			reader: combo,
			callback: function(resource) {
				return !taskUtil.getTag(resource, filterTag);
			}
		});
	}
	const coreVersion = taskUtil?.getProject("sap.ui.core")?.getVersion();
	const allowStringBundling = taskUtil?.getProject().getSpecVersion().lt("4.0");
	return combo.byGlob("/resources/**/*.{js,json,xml,html,properties,library,js.map}").then((resources) => {
		const options = {
			bundleDefinition: applyDefaultsToBundleDefinition(bundleDefinition, taskUtil),
			bundleOptions,
			allowStringBundling
		};
		if (!optimize && taskUtil) {
			options.moduleNameMapping = createModuleNameMapping({resources, taskUtil});
		}
		if (coreVersion) {
			options.targetUi5CoreVersion = coreVersion;
		}
		return moduleBundler({options, resources}).then((bundles) => {
			return Promise.all(bundles.map(({bundle, sourceMap} = {}) => {
				if (!bundle) {
					// Skip empty bundles
					return;
				}
				if (taskUtil) {
					taskUtil.setTag(bundle, taskUtil.STANDARD_TAGS.IsBundle);
					if (sourceMap) {
						// Clear tag that might have been set by the minify task, in cases where
						// the bundle name is identical to a source file
						taskUtil.clearTag(sourceMap, taskUtil.STANDARD_TAGS.OmitFromBuildResult);
					}
				}
				const writes = [workspace.write(bundle)];
				if (sourceMap) {
					writes.push(workspace.write(sourceMap));
				}
				return Promise.all(writes);
			}));
		});
	});
}
