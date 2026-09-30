import posixPath from "node:path/posix";
import {getLogger} from "@ui5/logger";
const log = getLogger("builder:tasks:generateThemeDesignerResources");
import libraryLessGenerator from "../processors/libraryLessGenerator.js";
import {updateLibraryDotTheming} from "./utils/dotTheming.js";
import ReaderCollectionPrioritized from "@ui5/fs/ReaderCollectionPrioritized";
import Resource from "@ui5/fs/Resource";
import fsInterface from "@ui5/fs/fsInterface";

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
 * @public
 * @module @ui5/builder/tasks/generateThemeDesignerResources
 */

/**
 * Generates resources required for integration with the SAP Theme Designer.
 *
 * A step-based task: the default export is a factory returning a scalar "scan" step (does the library
 * have themes at all), an optional scalar "libraryTheming" step (the library-level <code>.theming</code>,
 * for a project of type <code>library</code>), and a "themes" map step with a key per theme's
 * <code>library.source.less</code>. Each theme step generates that theme's <code>.theming</code> and
 * <code>library.less</code>, reading the core <code>.theming</code> and the less imports through its own
 * combo so those reads are recorded per step. A delta build regenerates only the affected theme. The
 * later steps consume the scan result through <code>needs</code>, so they stay cached while a library has
 * themes even as individual themes change. Standalone invocation runs every step through runSteps.
 *
 * @public
 * @function default
 * @static
 *
 * @param {object} options Options
 * @param {string} options.projectName Project name
 * @param {string} options.version Project version
 * @param {string} [options.projectNamespace] If the project is of type <code>library</code>, provide its
 *   namespace. Omit for type <code>theme-library</code>
 * @returns {object[]} The task's build steps
 */
export default function build(options) {
	const {projectName, version} = options;
	const namespace = options.projectNamespace;

	// Skip sap.ui.documentation since it is not intended to be available in SAP Theme Designer to create
	// custom themes
	if (namespace === "sap/ui/documentation") {
		return [];
	}

	let librarySourceLessPattern;
	if (namespace) {
		// In case of a library only check for themes directly below the namespace
		librarySourceLessPattern = `/resources/${namespace}/themes/*/library.source.less`;
	} else {
		// In case of a theme-library check for all "themes"
		librarySourceLessPattern = `/resources/**/themes/*/library.source.less`;
	}

	const steps = [{
		// Whether the library has any themes at all. Consumed by the later steps through needs, so they
		// stay cached while this holds even as individual themes change.
		name: "scan",
		run: async ({workspace}) => ({
			hasThemes: (await workspace.byGlob(librarySourceLessPattern)).length > 0
		}),
	}];

	// library .theming file. Only for type "library" (type "theme-library" provides no namespace). Also
	// needs to be created when a library has no themes (the bIgnore flag).
	if (namespace) {
		steps.push({
			name: "libraryTheming",
			needs: ["scan"],
			run: async ({needs, workspace}) => {
				const {hasThemes} = needs.scan;
				let libraryDotThemingResource;

				// Do not generate a .theming file for the sap.ui.core library
				if (namespace === "sap/ui/core") {
					// Update the existing .theming file if present
					libraryDotThemingResource = await workspace.byPath(`/resources/${namespace}/.theming`);
					if (libraryDotThemingResource) {
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
			},
		});
	}

	steps.push({
		// One key per theme, so a delta build regenerates only the affected theme. keys() returns nothing
		// when the library has no themes.
		name: "themes",
		needs: ["scan"],
		keys: async ({needs, workspace}) =>
			needs.scan.hasThemes ? workspace.byGlob(librarySourceLessPattern) : [],
		each: async (librarySourceLess, {workspace, dependencies}) => {
			// Build the combo from the step readers so the core .theming and less-import reads are
			// recorded as inputs of this theme.
			const combo = new ReaderCollectionPrioritized({
				name: `generateThemeDesignerResources - prioritize workspace over dependencies: ${projectName}`,
				readers: dependencies ? [workspace, dependencies] : [workspace]
			});

			const themeFolder = posixPath.dirname(librarySourceLess.getPath());
			log.verbose(`Generating .theming for theme ${themeFolder}`);

			// theme .theming file
			const themeDotThemingResource = await generateThemeDotTheming({workspace, combo, themeFolder});
			if (themeDotThemingResource) {
				await workspace.write(themeDotThemingResource);
			}

			// library.less file
			const [libraryLessResource] = await libraryLessGenerator({
				resources: [librarySourceLess],
				fs: fsInterface(combo),
			});
			await workspace.write(libraryLessResource);
		},
	});

	return steps;
}
