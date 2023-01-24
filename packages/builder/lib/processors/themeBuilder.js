import {getLogger} from "@ui5/logger";
const log = getLogger("builder:processors:themeBuilder");
import posixPath from "node:path/posix";
import less from "less-openui5";
import Resource from "@ui5/fs/Resource";

const libraryMatchPattern = /^\/resources\/(.*)\/themes\/[^/]*\/library\.source\.less$/i;

/**
 * @public
 * @module @ui5/builder/processors/ThemeBuilder
 */

/**
 * Builds a library theme
 *
 * @public
 * @class
 */
export class ThemeBuilder {
	/**
	 * Constructor
	 *
	 * @public
	 * @param {fs|module:@ui5/fs/fsInterface} fs Node fs or custom
	 * 		[fs interface]{@link module:@ui5/fs/fsInterface}
	 */
	constructor({fs}) {
		this.builder = new less.Builder({fs});
	}

	/**
	 * Starts the theme build
	 *
	 * @public
	 * @param {@ui5/fs/Resource[]} resources Library files
	 * @param {object} [options] Build options
	 * @param {boolean} [options.compress=false] Compress build output (CSS / JSON)
	 * @param {boolean} [options.cssVariables=false] Generates the CSS variables
	 *   (css-variables.css, css-variables.source.less) and the skeleton for a theme
	 *   (library-skeleton.css, [library-skeleton-RTL.css])
	 * @returns {Promise<@ui5/fs/Resource[]>} Resolving with array of created files
	 */
	build(resources, {compress = false, cssVariables = false} = {}) {
		const files = [];

		const compile = (resource) => {
			log.verbose(`Compiling ${resource.getPath()}`);

			let libraryName;
			const libraryMatch = libraryMatchPattern.exec(resource.getPath());
			if (libraryMatch) {
				libraryName = libraryMatch[1].replace(/\//g, ".");
			}

			return this.builder.build({
				lessInputPath: resource.getPath(),
				library: {
					name: libraryName
				},
				compiler: {
					compress
				},
				cssVariables
			}).then((result) => {
				const themeDir = posixPath.dirname(resource.getPath());

				const libCss = new Resource({
					path: themeDir + "/library.css",
					string: result.css
				});

				const libCssRtl = new Resource({
					path: themeDir + "/library-RTL.css",
					string: result.cssRtl
				});

				const libParams = new Resource({
					path: themeDir + "/library-parameters.json",
					string: JSON.stringify(result.variables, null, compress ? null : "\t")
				});

				files.push(libCss, libCssRtl, libParams);

				if (cssVariables) {
					const libCssVarsSource = new Resource({
						path: themeDir + "/css_variables.source.less",
						string: result.cssVariablesSource
					});
					const libCssVars = new Resource({
						path: themeDir + "/css_variables.css",
						string: result.cssVariables
					});
					const libCssSkel = new Resource({
						path: themeDir + "/library_skeleton.css",
						string: result.cssSkeleton
					});
					const libCssSkelRtl = new Resource({
						path: themeDir + "/library_skeleton-RTL.css",
						string: result.cssSkeletonRtl
					});

					files.push(libCssVarsSource, libCssVars, libCssSkel, libCssSkelRtl);
				}
			}, (err) => {
				log.error(`Error while compiling ${resource.getPath()}: ${err.message}`);
				throw err;
			});
		};

		return Promise.all(resources.map(compile)).then(() => {
			return files;
		});
	}

	/**
	 * Clears all cached build results.
	 *
	 * Use this method to prevent high memory consumption when building many themes within the same process.
 	 *
	 * @public
	 */
	clearCache() {
		this.builder.clearCache();
	}
}

/**
 *
 * @public
 * @typedef {object} ThemeBuilderOptions
 * @property {boolean} [compress=false] Compress build output (CSS / JSON)
 * @property {boolean} [cssVariables=false] Generates the CSS variables
 * (css-variables.css, css-variables.source.less) and the skeleton for a theme
 * (library-skeleton.css, [library-skeleton-RTL.css])
 */

/**
 * Builds a library theme.
 *
 * @public
 * @function default
 * @static
 *
 * @alias @ui5/builder/processors/themeBuilder
 * @param {object} parameters Parameters
 * @param {@ui5/fs/Resource[]} parameters.resources List of <code>library.source.less</code>
 *   resources to be processed
 * @param {fs|module:@ui5/fs/fsInterface} parameters.fs Node fs or custom
 *   [fs interface]{@link module:@ui5/fs/fsInterface}
 * @param {module:@ui5/builder/processors/ThemeBuilder~ThemeBuilderOptions} [parameters.options] Options
 * @returns {Promise<@ui5/fs/Resource[]>} Promise resolving with theme resources
 */
export default async function({
	resources,
	fs,
	options = {}
}) {
	const {compress, cssVariables} =
	/** @type {module:@ui5/builder/processors/ThemeBuilder~ThemeBuilderOptions} */ (options);
	const themeBuilder = new ThemeBuilder({fs});
	return themeBuilder.build(resources, {
		compress,
		cssVariables
	}).then((files) => {
		themeBuilder.clearCache();
		return files;
	});
}
