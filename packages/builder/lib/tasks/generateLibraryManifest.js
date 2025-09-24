
import {getLogger} from "@ui5/logger";
const log = getLogger("builder:tasks:generateLibraryManifest");
import manifestCreator from "../processors/manifestCreator.js";

/**
 * @public
 * @module @ui5/builder/tasks/generateLibraryManifest
 */

/**
 * Task for creating a library manifest.json from its .library file.
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
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
export default function({workspace, taskUtil, options: {projectName}}) {
	// Note:
	// *.library files are needed to identify libraries
	// *.json files are needed to avoid overwriting them
	// *.js files are needed to identify nested components
	// *.less, *.css, *.theming and *.theme files are needed to identify supported themes
	// *.properties to identify existence of i18n bundles (e.g. messagebundle.properties)
	return workspace.byGlob("/resources/**/*.{js,json,library,less,css,theming,theme,properties}").then((resources) => {
		// Find all libraries and create a manifest.json file
		return workspace.byGlob("/resources/**/.library").then((libraryIndicatorResources) => {
			if (libraryIndicatorResources.length < 1) {
				// No library found - nothing to do
				log.verbose(`Could not find a ".library" file for project ${projectName}. ` +
					`Skipping library manifest generation.`);
				return;
			}

			return Promise.all(libraryIndicatorResources.map((libraryIndicatorResource) => {
				// Determine library namespace from library indicator file path
				// ending with ".library"
				// e.g. /resources/sap/foo/.library => sap/foo
				const libraryNamespacePattern = /^\/resources\/(.*)\/\.library$/;
				const libraryIndicatorPath = libraryIndicatorResource.getPath();
				const libraryNamespaceMatch = libraryIndicatorPath.match(libraryNamespacePattern);
				if (libraryNamespaceMatch && libraryNamespaceMatch[1]) {
					const libraryNamespace = libraryNamespaceMatch[1];
					return manifestCreator({
						libraryResource: libraryIndicatorResource,
						namespace: libraryNamespace,
						resources,
						getProjectVersion: (projectName) => {
							return taskUtil?.getProject(projectName)?.getVersion();
						},
						options: {
						}
					}).then((manifest) => {
						if (manifest) {
							return workspace.write(manifest);
						}
					});
				} else {
					log.verbose(`Could not determine library namespace from file "${libraryIndicatorPath}" ` +
						`for project ${projectName}. Skipping library manifest generation.`);
					return Promise.resolve();
				}
			}));
		});
	});
}
