const versionInfoGenerator = require("../processors/versionInfoGenerator");

/**
 * Task to create sap-ui-version.json
 *
 * @module builder/tasks/generateVersionInfo
 * @param {Object} parameters Parameters
 * @param {DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {AbstractReader} parameters.dependencies Reader or Collection to read dependency files
 * @param {Object} parameters.options Options
 * @param {Object} parameters.options.rootProject DuplexCollection to read and write files
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
module.exports = function({workspace, dependencies, options}) {
	return dependencies.byGlob(options.pattern)
		.then((resources) => {
			return versionInfoGenerator({
				options: {
					rootProjectName: options.rootProject.metadata.name,
					rootProjectVersion: options.rootProject.version,
					libraryInfos: resources.map((dotLibResource) => {
						return {
							name: dotLibResource._project.metadata.name,
							version: dotLibResource._project.version
						};
					})
				}
			});
		})
		.then(([versionInfoResource]) => {
			return workspace.write(versionInfoResource);
		});
};
