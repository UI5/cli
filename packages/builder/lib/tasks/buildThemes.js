const path = require("path");
const themeBuilder = require("../processors/themeBuilder");
const ReaderCollectionPrioritized = require("@ui5/fs").ReaderCollectionPrioritized;
const fsInterface = require("@ui5/fs").fsInterface;
const log = require("@ui5/logger").getLogger("builder:tasks:buildThemes");

/**
 * Task to build a library theme.
 *
 * @public
 * @alias module:@ui5/builder.tasks.buildThemes
 * @param {object} parameters Parameters
 * @param {module:@ui5/fs.DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {module:@ui5/fs.AbstractReader} parameters.dependencies Reader or Collection to read dependency files
 * @param {object} parameters.options Options
 * @param {string} parameters.options.projectName Project name
 * @param {string} parameters.options.inputPattern Search pattern for *.less files to be built
 * @param {string} [parameters.options.librariesPattern] Search pattern for .library files
 * @param {string} [parameters.options.themesPattern] Search pattern for sap.ui.core theme folders
 * @param {boolean} [parameters.options.compress=true]
 * @param {boolean} [parameters.options.cssVariables=false]
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
module.exports = async function({
	workspace, dependencies,
	options: {
		projectName, inputPattern, librariesPattern, themesPattern, compress, cssVariables
	}
}) {
	const combo = new ReaderCollectionPrioritized({
		name: `theme - prioritize workspace over dependencies: ${projectName}`,
		readers: [workspace, dependencies]
	});

	compress = compress === undefined ? true : compress;

	const pAllResources = workspace.byGlob(inputPattern);
	let pAvailableLibraries;
	let pAvailableThemes;
	if (librariesPattern) {
		// If a librariesPattern is given
		//	we will use it to reduce the set of libraries a theme will be built for
		pAvailableLibraries = combo.byGlob(librariesPattern);
	}
	if (themesPattern) {
		// If a themesPattern is given
		//	we will use it to reduce the set of themes that will be built
		pAvailableThemes = combo.byGlob(themesPattern, {nodir: false});
	}

	/* Don't try to build themes for libraries that are not available
	(maybe replace this with something more aware of which dependencies are optional and therefore
		legitimately missing and which not (fault case))
		*/
	let availableLibraries;
	if (pAvailableLibraries) {
		availableLibraries = (await pAvailableLibraries).map((resource) => {
			return resource.getPath().replace(/[^/]*\.library/i, "");
		});
	}
	let availableThemes;
	if (pAvailableThemes) {
		availableThemes = (await pAvailableThemes)
			.filter((resource) => resource.getStatInfo().isDirectory())
			.map((resource) => {
				return path.basename(resource.getPath());
			});
	}

	let allResources = await pAllResources;

	const isAvailable = function(resource) {
		let libraryAvailable = false;
		let themeAvailable = false;
		const resourcePath = resource.getPath();
		const themeName = path.basename(path.dirname(resourcePath));

		if (!availableLibraries || availableLibraries.length === 0) {
			libraryAvailable = true; // If no libraries are found, build themes for all libraries
		} else {
			for (let i = availableLibraries.length - 1; i >= 0; i--) {
				if (resourcePath.startsWith(availableLibraries[i])) {
					libraryAvailable = true;
				}
			}
		}

		if (!availableThemes || availableThemes.length === 0) {
			themeAvailable = true; // If no themes are found, build all themes
		} else {
			themeAvailable = availableThemes.includes(themeName);
		}

		if (log.isLevelEnabled("verbose")) {
			if (!libraryAvailable) {
				log.verbose(`Skipping ${resourcePath}: Library is not available`);
			}
			if (!themeAvailable) {
				log.verbose(`Skipping ${resourcePath}: sap.ui.core theme '${themeName}' is not available. ` +
				"If you experience missing themes, check whether you have added the corresponding theme " +
				"library to your projects dependencies and make sure that your custom themes contain " +
				"resources for the sap.ui.core namespace.");
			}
		}

		// Only build if library and theme are available
		return libraryAvailable && themeAvailable;
	};

	if (availableLibraries || availableThemes) {
		if (log.isLevelEnabled("verbose")) {
			log.verbose("Filtering themes to be built:");
			if (availableLibraries) {
				log.verbose(`Available libraries: ${availableLibraries.join(", ")}`);
			}
			if (availableThemes) {
				log.verbose(`Available sap.ui.core themes: ${availableThemes.join(", ")}`);
			}
		}
		allResources = allResources.filter(isAvailable);
	}

	const processedResources = await themeBuilder({
		resources: allResources,
		fs: fsInterface(combo),
		options: {
			compress,
			cssVariables: !!cssVariables
		}
	});

	await Promise.all(processedResources.map((resource) => {
		return workspace.write(resource);
	}));
};
