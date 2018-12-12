const themeBuilder = require("../processors/themeBuilder");
const ReaderCollectionPrioritized = require("@ui5/fs").ReaderCollectionPrioritized;
const fsInterface = require("@ui5/fs").fsInterface;

/**
 * Task to build a library theme.
 *
 * @module builder/tasks/buildThemes
 * @param {Object} parameters Parameters
 * @param {DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {AbstractReader} parameters.dependencies Reader or Collection to read dependency files
 * @param {Object} parameters.options Options
 * @param {string} parameters.options.pattern Pattern to locate the files to be processed
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
module.exports = function({workspace, dependencies, options}) {
	const combo = new ReaderCollectionPrioritized({
		name: `theme - prioritize workspace over dependencies: ${options.projectName}`,
		readers: [workspace, dependencies]
	});

	const promises = [workspace.byGlob(options.inputPattern)];
	if (options.librariesPattern) {
		// If a librariesPattern is given
		//	we will use it to reduce the set of libraries a theme will be built for
		promises.push(combo.byGlob(options.librariesPattern));
	}

	return Promise.all(promises).then(([allResources, availableLibraries]) => {
		if (!availableLibraries || availableLibraries.length === 0) {
			// Try to build all themes
			return allResources;
		}
		/* Don't try to build themes for libraries that are not available
			(maybe replace this with something more aware of which dependencies are optional and therefore
			legitimately missing and which not (fault case))
		*/
		const availableLibraryPaths = availableLibraries.map((resource) => {
			return resource.getPath().replace(/[^/]*\.library/i, "");
		});

		const isAvailable = function(resource) {
			for (let i = availableLibraryPaths.length - 1; i >= 0; i--) {
				if (resource.getPath().indexOf(availableLibraryPaths[i]) === 0) {
					return true;
				}
			}
			return false;
		};

		return allResources.filter(isAvailable);
	}).then((resources) => {
		return themeBuilder({
			resources,
			fs: fsInterface(combo)
		});
	}).then((processedResources) => {
		return Promise.all(processedResources.map((resource) => {
			return workspace.write(resource);
		}));
	});
};
