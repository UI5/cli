const moduleBundler = require("../../processors/bundlers/moduleBundler");
const ModuleName = require("../../lbt/utils/ModuleName");
const ReaderCollectionPrioritized = require("@ui5/fs").ReaderCollectionPrioritized;

/**
 * Generates a bundle based on the given bundle definition
 *
 * @public
 * @alias module:@ui5/builder.tasks.generateBundle
 * @param {object} parameters Parameters
 * @param {module:@ui5/fs.DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {module:@ui5/fs.ReaderCollection} parameters.dependencies Collection to read dependency files
 * @param {module:@ui5/builder.tasks.TaskUtil|object} [parameters.taskUtil] TaskUtil
 * @param {object} parameters.options Options
 * @param {string} parameters.options.projectName Project name
 * @param {ModuleBundleDefinition} parameters.options.bundleDefinition Module bundle definition
 * @param {ModuleBundleOptions} parameters.options.bundleOptions Module bundle options
 * @returns {Promise} Promise resolving with <code>undefined</code> once data has been written
 */
module.exports = function({
	workspace, dependencies, taskUtil, options: {projectName, bundleDefinition, bundleOptions}
}) {
	let combo = new ReaderCollectionPrioritized({
		name: `libraryBundler - prioritize workspace over dependencies: ${projectName}`,
		readers: [workspace, dependencies]
	});

	if (taskUtil) {
		// Omit -dbg files for optimize bundles and vice versa
		const filterTag = bundleOptions.optimize ?
			taskUtil.STANDARD_TAGS.IsDebugVariant : taskUtil.STANDARD_TAGS.HasDebugVariant;
		combo = combo.filter(function(resource) {
			return !taskUtil.getTag(resource, filterTag);
		});

		if (!bundleOptions.optimize) {
			// For "unoptimized" bundles, the non-debug files have already been filtered out
			// Now rename the debug variants to the same name so that they appear like the original
			// resource to the bundler
			combo = combo.transformer(async function(resourcePath, getResource) {
				if (taskUtil.getTag(resourcePath, taskUtil.STANDARD_TAGS.IsDebugVariant)) {
					const resource = await getResource();
					const nonDbgPath = ModuleName.getNonDebugName(resource.getPath());
					if (!nonDbgPath) {
						throw new Error(`Failed to resolve non-debug name for ${resource.getPath()}`);
					}
					resource.setPath(nonDbgPath);
				}
			});
		}
	}

	return combo.byGlob("/resources/**/*.{js,json,xml,html,properties,library}").then((resources) => {
		return moduleBundler({
			options: {
				bundleDefinition,
				bundleOptions
			},
			resources
		}).then((bundles) => {
			return Promise.all(bundles.map((bundle) => {
				if (taskUtil) {
					taskUtil.setTag(bundle, taskUtil.STANDARD_TAGS.IsBundle);
				}
				return workspace.write(bundle);
			}));
		});
	});
};
