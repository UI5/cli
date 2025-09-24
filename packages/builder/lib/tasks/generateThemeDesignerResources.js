import posixPath from "node:path/posix";
import {getLogger} from "@ui5/logger";
const log = getLogger("builder:tasks:generateThemeDesignerResources");
import libraryLessGenerator from "../processors/libraryLessGenerator.js";
import {updateLibraryDotTheming} from "./utils/dotTheming.js";
import ReaderCollectionPrioritized from "@ui5/fs/ReaderCollectionPrioritized";
import Resource from "@ui5/fs/Resource";
import fsInterface from "@ui5/fs/fsInterface";

/**
 * Returns a relative path from the given themeFolder to the root namespace.
 *
 * When combining the given themeFolder with the returned relative path it
 * resolves to "/resources/". However the "/resources/" part is not important
 * here as it doesn't exist within the theming engine environment where the
 * UI5 resources are part of a "UI5" folder (e.g. "UI5/sap/ui/core/") that
 * is next to a "Base" folder.
 *
 * @example
 * getPathToRoot("/resources/sap/ui/foo/themes/base")
 * > "../../../../../"
 *
 * @param {string} themeFolder Virtual path including /resources/
 * @returns {string} Relative path to root namespace
 */
function getPathToRoot(themeFolder) {
	// -2 for initial "/"" and "resources/"
	return "../".repeat(themeFolder.split("/").length - 2);
}

/**
 * Generates an less import statement for the given <code>filePath</code>
 *
 * @param {string} filePath The path to the desired file
 * @returns {string} The less import statement
 */
function lessImport(filePath) {
	return `@import "${filePath}";\n`;
}

function generateLibraryDotTheming({namespace, version, hasThemes}) {
	const dotTheming = {
		sEntity: "Library",
		sId: namespace,
		sVersion: version
	};

	// Note that with sap.ui.core version 1.127.0 the .theming file has been put into
	// the library sources so that "aFiles" can be maintained from there.
	// The below configuration is still needed for older versions of sap.ui.core which do not
	// contain the file.
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

async function createCssVariablesLessResource({workspace, combo, themeFolder}) {
	const pathToRoot = getPathToRoot(themeFolder);
	const cssVariablesSourceLessFile = "css_variables.source.less";
	const cssVariablesLessFile = "css_variables.less";

	// posix as it is a virtual path (separated with /)
	const themeName = posixPath.basename(themeFolder);
	// The "base" theme of the baseLib is called "baseTheme"
	const baseLibThemeName = themeName === "base" ? "baseTheme" : themeName;

	// Some themes do not have a base.less file (e.g. sap_hcb)
	const hasBaseLess = !!(await combo.byPath(`/resources/sap/ui/core/themes/${themeName}/base.less`));

	let cssVariablesLess =
`/* NOTE: This file was generated as an optimized version of "${cssVariablesSourceLessFile}" \
for the Theme Designer. */\n\n`;

	if (themeName !== "base") {
		const cssVariablesSourceLessResource = await workspace.byPath(
			posixPath.join(themeFolder, cssVariablesSourceLessFile)
		);

		if (!cssVariablesSourceLessResource) {
			throw new Error(`Could not find file "${cssVariablesSourceLessFile}" in theme "${themeFolder}"`);
		}

		const cssVariablesSourceLess = await cssVariablesSourceLessResource.getString();

		cssVariablesLess += lessImport(`../base/${cssVariablesLessFile}`);
		cssVariablesLess += `
/* START "${cssVariablesSourceLessFile}" */
${cssVariablesSourceLess}
/* END "${cssVariablesSourceLessFile}" */

`;
	}

	if (hasBaseLess) {
		cssVariablesLess += lessImport(`${pathToRoot}../Base/baseLib/${baseLibThemeName}/base.less`);
	}
	cssVariablesLess += lessImport(`${pathToRoot}sap/ui/core/themes/${themeName}/global.less`);

	return new Resource({
		path: posixPath.join(themeFolder, cssVariablesLessFile),
		string: cssVariablesLess
	});
}

async function generateCssVariablesLess({workspace, combo, namespace}) {
	let cssVariablesSourceLessResourcePattern;
	if (namespace) {
		// In case of a library only check for themes directly below the namespace
		cssVariablesSourceLessResourcePattern = `/resources/${namespace}/themes/*/css_variables.source.less`;
	} else {
		// In case of a theme-library check for all "themes"
		cssVariablesSourceLessResourcePattern = `/resources/**/themes/*/css_variables.source.less`;
	}

	const cssVariablesSourceLessResource = await workspace.byGlob(cssVariablesSourceLessResourcePattern);

	const hasCssVariables = cssVariablesSourceLessResource.length > 0;

	if (hasCssVariables) {
		await Promise.all(
			cssVariablesSourceLessResource.map(async (cssVariableSourceLess) => {
				const themeFolder = posixPath.dirname(cssVariableSourceLess.getPath());
				log.verbose(`Generating css_variables.less for theme ${themeFolder}`);
				const r = await createCssVariablesLessResource({
					workspace, combo, themeFolder
				});
				return await workspace.write(r);
			})
		);
	}
}

/**
 * @public
 * @module @ui5/builder/tasks/generateThemeDesignerResources
 */

/* eslint "jsdoc/check-param-names": ["error", {"disableExtraPropertyReporting":true}] */
/**
 * Generates resources required for integration with the SAP Theme Designer.
 *
 * @public
 * @function default
 * @static
 *
 * @param {object} parameters Parameters
 * @param {@ui5/fs/DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {@ui5/fs/AbstractReader} parameters.dependencies Reader or Collection to read dependency files
 * @param {object} parameters.options Options
 * @param {string} parameters.options.projectName Project name
 * @param {string} parameters.options.version Project version
 * @param {string} [parameters.options.projectNamespace] If the project is of type <code>library</code>,
 * 														 provide its namespace.
 * Omit for type <code>theme-library</code>
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
export default async function({workspace, dependencies, options}) {
	const {projectName, version} = options;
	const namespace = options.projectNamespace;

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
		let libraryDotThemingResource;

		// Do not generate a .theming file for the sap.ui.core library
		if (namespace === "sap/ui/core") {
			// Check if the .theming file already exists
			libraryDotThemingResource = await workspace.byPath(`/resources/${namespace}/.theming`);
			if (libraryDotThemingResource) {
				// Update the existing .theming resource
				log.verbose(`Updating .theming for namespace ${namespace}`);
				await updateLibraryDotTheming({
					resource: libraryDotThemingResource,
					namespace,
					version,
					hasThemes
				});
			}
		}

		if (!libraryDotThemingResource) {
			log.verbose(`Generating .theming for namespace ${namespace}`);
			libraryDotThemingResource = generateLibraryDotTheming({
				namespace,
				version,
				hasThemes
			});
		}

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

	// css_variables.less
	await generateCssVariablesLess({workspace, combo, namespace});
}
