"use strict";

const log = require("@ui5/logger").getLogger("builder:tasks:generateLibraryManifest");
const manifestCreator = require("../processors/manifestCreator");
const ReaderCollectionPrioritized = require("@ui5/fs").ReaderCollectionPrioritized;


/**
 * Task for creating a library manifest.json from its .library file.
 *
 * @public
 * @alias module:@ui5/builder.tasks.generateLibraryManifest
 * @param {object} parameters Parameters
 * @param {module:@ui5/fs.DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {module:@ui5/fs.AbstractReader} parameters.dependencies Reader or Collection to read dependency files
 * @param {object} parameters.options Options
 * @param {string} parameters.options.projectName Project name
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
module.exports = function({workspace, dependencies, options: {projectName}}) {
	const combo = new ReaderCollectionPrioritized({
		name: `libraryManifestGenerator - prioritize workspace over dependencies: ${projectName}`,
		readers: [workspace, dependencies]
	});
	// Note:
	// *.library files are needed to identify libraries
	// *.json files are needed to avoid overwriting them
	// *.js files are needed to identify nested components
	// *.less, *.css, *.theming and *.theme files are needed to identify supported themes
	// *.properties to identify existence of i18n bundles (e.g. messagebundle.properties)
	return combo.byGlob("/**/*.{js,json,library,less,css,theming,theme,properties}").then((resources) => {
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
};
