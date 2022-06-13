const ModuleName = require("../../../lbt/utils/ModuleName");

/**
 * For "unoptimized" bundles, the non-debug files have already been filtered out above.
 * Now we need to create a mapping from the debug-variant resource path to the respective module
 * name, which is basically the non-debug resource path, minus the "/resources/"" prefix.
 * This mapping overwrites internal logic of the LocatorResourcePool which would otherwise determine
 * the module name from the resource path, which would contain "-dbg" in this case. That would be
 * incorrect since debug-variants should still keep the original module name.
 *
 * @private
 * @param {object} parameters Parameters
 * @param {module:@ui5/fs.Resource[]} parameters.resources List of resources
 * @param {module:@ui5/builder.tasks.TaskUtil|object} parameters.taskUtil TaskUtil
 * @returns {object} Module name mapping
 */
module.exports = function({resources, taskUtil}) {
	const moduleNameMapping = {};
	for (let i = resources.length - 1; i >= 0; i--) {
		const resource = resources[i];
		if (taskUtil.getTag(resource, taskUtil.STANDARD_TAGS.IsDebugVariant)) {
			const resourcePath = resource.getPath();
			const nonDbgPath = ModuleName.getNonDebugName(resourcePath);
			if (!nonDbgPath) {
				throw new Error(`Failed to resolve non-debug name for ${resourcePath}`);
			}
			moduleNameMapping[resourcePath] = nonDbgPath.slice("/resources/".length);
		}
	}
	return moduleNameMapping;
};
