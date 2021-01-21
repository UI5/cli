const posixPath = require("path").posix;
const log = require("@ui5/logger").getLogger("builder:tasks:generateThemeDesignerResources");
const libraryLessGenerator = require("../processors/libraryLessGenerator");
const {ReaderCollectionPrioritized, Resource, fsInterface} = require("@ui5/fs");

function generateLibraryDotTheming({namespace, version, hasThemes}) {
	const dotTheming = {
		sEntity: "Library",
		sId: namespace,
		sVersion: version
	};

	if (namespace === "sap/ui/core") {
		dotTheming.aFiles = [
			"library",
			"global", // Additional entry compared to UI5 root .theming
			"css_variables",
		];
	}
	if (!hasThemes) {
		// Set ignore flag when there are no themes at all
		// This is important in case a library used to contain themes that have been removed
		// in a later version of the library.
		dotTheming.bIgnore = true;
	}

	return new Resource({
		path: `/resources/${namespace}/.theming`,
		string: JSON.stringify(dotTheming, null, 2)
	});
}

async function generateThemeDotTheming({workspace, combo, themeFolder}) {
	const themeName = posixPath.basename(themeFolder);
	const libraryMatchPattern = /^\/resources\/(.*)\/themes\/[^/]*$/i;
	const libraryMatch = libraryMatchPattern.exec(themeFolder);
	let libraryName;
	if (libraryMatch) {
		libraryName = libraryMatch[1].replace(/\//g, ".");
	} else {
		throw new Error(`Failed to extract library name from theme folder path: ${themeFolder}`);
	}

	const dotThemingTargetPath = posixPath.join(themeFolder, ".theming");
	if (libraryName === "sap.ui.core") {
		// sap.ui.core should always have a .theming file for all themes

		if (await workspace.byPath(dotThemingTargetPath)) {
			// .theming file present, skip further processing
			return;
		} else {
			throw new Error(`.theming file for theme ${themeName} missing in sap.ui.core library source`);
		}
	}

	let newDotThemingResource;
	const coreDotThemingResource = await combo.byPath(`/resources/sap/ui/core/themes/${themeName}/.theming`);

	if (coreDotThemingResource) {
		// Copy .theming file from core
		newDotThemingResource = await coreDotThemingResource.clone();
		newDotThemingResource.setPath(dotThemingTargetPath);
	} else {
		// No core .theming file found for this theme => Generate a .theming file
		const dotTheming = {
			sEntity: "Theme",
			sId: themeName,
			sVendor: "SAP"
		};

		if (themeName !== "base") {
			dotTheming.oExtends = "base";
		}

		newDotThemingResource = new Resource({
			path: dotThemingTargetPath,
			string: JSON.stringify(dotTheming, null, 2)
		});
	}
	return newDotThemingResource;
}

/**
 * Generates resources required for integration with the SAP Theme Designer.
 *
 * @public
 * @alias module:@ui5/builder.tasks.generateThemeDesignerResources
 * @param {object} parameters Parameters
 * @param {module:@ui5/fs.DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {module:@ui5/fs.AbstractReader} parameters.dependencies Reader or Collection to read dependency files
 * @param {object} parameters.options Options
 * @param {string} parameters.options.projectName Project name
 * @param {string} parameters.options.version Project version
 * @param {string} [parameters.options.namespace] If the project is of type <code>library</code>, provide its namespace.
 * Omit for type <code>theme-library</code>
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
module.exports = async function({workspace, dependencies, options: {projectName, version, namespace}}) {
	// Skip sap.ui.documentation since it is not intended to be available in SAP Theme Designer to create custom themes
	if (namespace === "sap/ui/documentation") {
		return;
	}

	let librarySourceLessPattern;
	if (namespace) {
		// In case of a library only check for themes directly below the namespace
		librarySourceLessPattern = `/resources/${namespace}/themes/*/library.source.less`;
	} else {
		// In case of a theme-library check for all "themes"
		librarySourceLessPattern = `/resources/**/themes/*/library.source.less`;
	}

	const librarySourceLessResources = await workspace.byGlob(librarySourceLessPattern);

	const hasThemes = librarySourceLessResources.length > 0;

	// library .theming file
	// Only for type "library". Type "theme-library" does not provide a namespace
	// Also needs to be created in case a library does not have any themes (see bIgnore flag)
	if (namespace) {
		log.verbose(`Generating .theming for namespace ${namespace}`);
		const libraryDotThemingResource = generateLibraryDotTheming({
			namespace,
			version,
			hasThemes
		});
		await workspace.write(libraryDotThemingResource);
	}

	if (!hasThemes) {
		// Skip further processing as there are no themes
		return;
	}

	const combo = new ReaderCollectionPrioritized({
		name: `generateThemeDesignerResources - prioritize workspace over dependencies: ${projectName}`,
		readers: [workspace, dependencies]
	});

	// theme .theming files
	const themeDotThemingFiles = await Promise.all(
		librarySourceLessResources.map((librarySourceLess) => {
			const themeFolder = posixPath.dirname(librarySourceLess.getPath());
			log.verbose(`Generating .theming for theme ${themeFolder}`);
			return generateThemeDotTheming({
				workspace, combo, themeFolder
			});
		})
	);
	await Promise.all(
		themeDotThemingFiles.map(async (resource) => {
			if (resource) {
				await workspace.write(resource);
			}
		})
	);

	// library.less files
	const libraryLessResources = await libraryLessGenerator({
		resources: librarySourceLessResources,
		fs: fsInterface(combo),
	});
	await Promise.all(
		libraryLessResources.map((resource) => workspace.write(resource))
	);
};
