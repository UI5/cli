const BundleBuilder = require("../../lbt/bundle/Builder");
const LocatorResourcePool = require("../../lbt/resources/LocatorResourcePool");
const EvoResource = require("@ui5/fs").Resource;
const log = require("@ui5/logger").getLogger("builder:processors:bundlers:moduleBundler");

/**
 * A ModuleBundleDefinitionSection specifies the embedding mode (either 'provided', 'raw', 'preload', 'require'
 * or 'bundleInfo') and lists the resources that should be in- or excluded from the section.
 * <p>
 * <b>Module bundle section modes</b><br>
 * <ul>
 * 	<li>
 *		<code>provided</code>: A section of mode 'provided' defines a set of modules that should not be included in
 * the bundle file itself, but which should be assumed to be already loaded (or 'provided') by the environment into
 * which the bundle module is loaded.
 * 	</li>
 *	<li>
 *		<code>raw</code>: A 'raw' section determines the set of modules that should be embedded, sorts them according
 *		to their dependencies and writes them out 1:1 without any transformation or wrapping (raw). Only JavaScript
 *		sources can be embedded in a raw section.
 *	</li>
 *	<li>
 *		<code>preload</code>: A 'preload' section packages resources that should be stored in the preload cache in the
 *		client. They can embed any textual resource type (JavaScript, XML, JSON and .properties files) that the
 *		bundling supports. UI5 modules are wrapped into a 'sap.ui.predefine' call. Other JavaScript modules will be
 *		embedded into a 'jQuery.sap.registerPreload' call, or in a "sap.ui.require.preload" call when
 *      the ui5loader is available.
 *	</li>
 *	<li>
 *		<code>require</code>: A 'require' section is transformed into a sequence of jQuery.sap.require calls. The
 *		list will be resolved like an include pattern list in any of the other sections and for each of the resolved
 *		modules, a jQuery.sap.require will be created. In case the ui5loader is available, 'sap.ui.requireSync' is
 *		used instead.
 *	</li>
 *	<li>
 *		<code>bundleInfo</code>: A 'bundleInfo' section describes the content of another named bundle. This information
 *		is transformed into a ui5loader-"bundlesUI5" configuration.
 *		At runtime, if a module is known to be contained in a bundle, the loader will require that bundle before
 *		the module itself.
 *		This requires the ui5loader to be available at build time and UI5 version 1.74.0 or higher at runtime.
 *	</li>
 * </ul>
 * </p>
 *
 * @public
 * @typedef {object} ModuleBundleDefinitionSection
 * @property {string} mode The embedding mode. Either 'provided', 'raw', 'preload', 'require' or 'bundleInfo'
 * @property {string[]} filters List of modules declared as glob patterns (resource name patterns) that should be
 *		in- or excluded.
 * 		A pattern ending with a slash '/' will, similarly to the use of a single '*' or double '**' asterisk,
 *		denote an arbitrary number of characters or folder names.
 * 		Excludes should be marked with a leading exclamation mark '!'. The order of filters is relevant; a later
 *		exclusion overrides an earlier inclusion, and vice versa.
 * @example <caption>List of modules as glob patterns that should be in- or excluded</caption>
 * // Includes everything from "some/path/to/module/",
 * // but excludes the subfolder "some/path/to/module/to/be/excluded/"
 * const section = {
 * 	"filters": [
 * 		"some/path/to/module/",
 * 		"!some/path/to/module/to/be/excluded/"
 * 	]
 * };
 *
 * @property {boolean} [resolve=false] Whether (transitive) dependencies of modules that match the given filters
 *		should be resolved and added to the module set
 * @property {boolean} [resolveConditional=false] Whether conditional dependencies of modules should be resolved
 * 		and added to the module set for this section
 * @property {boolean} [renderer=false] Whether renderers for controls should be added to the module set
 * @property {boolean} [declareRawModules=false] Whether raw modules should be declared after jQuery.sap.global
 *		became available. With the usage of the ui5loader, this flag should be set to 'false'
 * @property {boolean} [sort=true] Whether the modules should be sorted by their dependencies
 */

/* eslint-disable max-len */
/**
 * Module bundle definition
 *
 * @public
 * @typedef {object} ModuleBundleDefinition
 * @property {string} name The module bundle name
 * @property {string[]} [defaultFileTypes=[".js", ".control.xml", ".fragment.html", ".fragment.json", ".fragment.xml", ".view.html", ".view.json", ".view.xml"]]
 *   List of default file types to be included in the bundle
 * @property {ModuleBundleDefinitionSection[]} sections List of module bundle definition sections.
 */
/* eslint-enable max-len */

/**
 * Module bundle options
 *
 * @public
 * @typedef {object} ModuleBundleOptions
 * @property {boolean} [optimize=false] If set to 'true' the module bundle gets minified
 * @property {boolean} [decorateBootstrapModule=false] If set to 'false', the module won't be decorated
 *   with an optimization marker
 * @property {boolean} [addTryCatchRestartWrapper=false] Whether to wrap bootable module bundles with
 *   a try/catch to filter out "Restart" errors
 * @property {boolean} [usePredefineCalls=false] If set to 'true', sap.ui.predefine is used for UI5 modules
 * @property {number} [numberOfParts=1] The number of parts the module bundle should be splitted
 * @property {boolean} [ignoreMissingModules=false] When searching for modules which are optional for further
 *   processing, do not throw in case they are missing
 */

/**
 * Legacy preload bundler.
 *
 * @public
 * @alias module:@ui5/builder.processors.moduleBundler
 * @param {object} parameters Parameters
 * @param {module:@ui5/fs.Resource[]} parameters.resources Resources
 * @param {object} parameters.options Options
 * @param {ModuleBundleDefinition} parameters.options.bundleDefinition Module bundle definition
 * @param {ModuleBundleOptions} parameters.options.bundleOptions Module bundle options
 * @returns {Promise<module:@ui5/fs.Resource[]>} Promise resolving with module bundle resources
 */
module.exports = function({resources, options: {bundleDefinition, bundleOptions}}) {
//	console.log("preloadBundler bundleDefinition:");
//	console.log(JSON.stringify(options.bundleDefinition, null, 4));

	// TODO 3.0: Fix defaulting behavior, align with JSDoc
	bundleOptions = bundleOptions || {optimize: true};

	const pool = new LocatorResourcePool({
		ignoreMissingModules: bundleOptions.ignoreMissingModules
	});
	const builder = new BundleBuilder(pool);

	if (log.isLevelEnabled("verbose")) {
		log.verbose(`Generating bundle:`);
		log.verbose(`bundleDefinition: ${JSON.stringify(bundleDefinition, null, 2)}`);
		log.verbose(`bundleOptions: ${JSON.stringify(bundleOptions, null, 2)}`);
	}

	return pool.prepare( resources ).
		then( () => builder.createBundle(bundleDefinition, bundleOptions) ).
		then( (results) => {
			let bundles;
			if (results instanceof Array) {
				bundles = results;
			} else {
				bundles = [results];
			}

			return Promise.all(bundles.map((bundleObj) => {
				if ( bundleObj ) {
					const {name, content} = bundleObj;
					// console.log("creating bundle as '%s'", "/resources/" + name);
					const resource = new EvoResource({
						path: "/resources/" + name,
						string: content
					});
					return resource;
				}
			}));
		});
};
