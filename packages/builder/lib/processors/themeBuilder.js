const log = require("@ui5/logger").getLogger("builder:processors:themeBuilder");
const path = require("path");
const less = require("less-openui5");
const Resource = require("@ui5/fs").Resource;

const libraryMatchPattern = /^\/resources\/(.*)\/themes\/[^/]*\/library\.source\.less$/i;

/**
 * Builds a library theme
 *
 * @public
 * @memberof module:@ui5/builder.processors
 */
class ThemeBuilder {
	/**
	 * Constructor
	 *
	 * @public
	 * @param {fs|module:@ui5/fs.fsInterface} fs Node fs or custom
	 * 		[fs interface]{@link module:resources/module:@ui5/fs.fsInterface}
	 */
	constructor({fs}) {
		this.builder = new less.Builder({fs});
	}

	/**
	 * Starts the theme build
	 *
	 * @public
	 * @param {module:@ui5/fs.Resource[]} resources Library files
	 * @returns {Promise<module:@ui5/fs.Resource[]>} Resolving with array of created files
	 */
	build(resources) {
		const files = [];

		const compile = (resource) => {
			log.verbose("Compiling %s", resource.getPath());

			let libraryName;
			const libraryMatch = libraryMatchPattern.exec(resource.getPath());
			if (libraryMatch) {
				libraryName = libraryMatch[1].replace(/\//g, ".");
			}

			return this.builder.build({
				lessInputPath: resource.getPath(),
				library: {
					name: libraryName
				}
			}).then((result) => {
				const themeDir = path.dirname(resource.getPath());

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
					string: JSON.stringify(result.variables, null, "\t")
				});

				files.push(libCss, libCssRtl, libParams);
			});
		};

		return Promise.all(resources.map(compile)).then(() => {
			return files;
		});
	}

	/**
	 * Clears all cached build results
	 *
 	 * @public
	 * Use this method to prevent high memory consumption when building many themes within the same process.
	 */
	clearCache() {
		this.builder.clearCache();
	}
}

/**
 * Builds a library theme.
 *
 * @public
 * @alias module:@ui5/builder.processors.themeBuilder
 * @param {Object} parameters Parameters
 * @param {module:@ui5/fs.Resource[]} parameters.resources List of <code>library.source.less</code> resources to be processed
 * @param {fs|module:@ui5/fs.fsInterface} parameters.fs Node fs or custom [fs interface]{@link module:resources/module:@ui5/fs.fsInterface}
 * @returns {Promise<module:@ui5/fs.Resource[]>} Promise resolving with theme resources
 */
module.exports = ({resources, fs}) => {
	const themeBuilder = new ThemeBuilder({fs});
	return themeBuilder.build(resources).then((files) => {
		themeBuilder.clearCache();
		return files;
	});
};

module.exports.ThemeBuilder = ThemeBuilder;
