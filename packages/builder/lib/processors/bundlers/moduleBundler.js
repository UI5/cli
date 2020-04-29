const BundleBuilder = require("../../lbt/bundle/Builder");
const Resource = require("../../lbt/resources/Resource");
const ResourcePool = require("../../lbt/resources/ResourcePool");
const EvoResource = require("@ui5/fs").Resource;

function extractName(path) {
	return path.slice( "/resources/".length);
}

class LocatorResource extends Resource {
	constructor(pool, resource) {
		super(pool, extractName(resource.getPath()), null, resource.getStatInfo());
		this.resource = resource;
	}

	buffer() {
		return this.resource.getBuffer();
	}

	getProject() {
		return this.resource._project;
	}
}

class LocatorResourcePool extends ResourcePool {
	constructor() {
		super();
	}

	prepare(resources) {
		resources = resources.filter( (res) => !res.getStatInfo().isDirectory() );
		// console.log(resources.map($ => $.getPath()));
		return Promise.all(
			resources.map(
				(resource) => this.addResource( new LocatorResource(this, resource) )
			).filter( (followUp) => followUp )
		);
		// .then( () => {
		// 	console.log("  found %d resources", this.size);
		// });
	}
}

/**
 * A ModuleBundleDefinitionSection specifies the embedding mode ('provided', 'raw', 'preload' or 'require')
 * and lists the resources that should be in- or excluded from the section.
 * <p>
 * <b>Module bundle section modes</b><br>
 * <ul>
 * 	<li>
 * 		<code>provided</code>: A section of mode 'provided' defines a set of modules that should not be included in the bundle file itself, but
			which should be assumed to be already loaded (or 'provided') by the environment into which the bundle module is loaded.
 * 	</li>
 *	<li>
		 <code>raw</code>: A raw section determines the set of modules that should be embedded,
			sorts them according to their dependencies and writes them out 1:1 without any transformation or wrapping (raw). Only JavaScript sources
				can be embedded in a raw section.
	</li>
 *	<li>
		 <code>preload</code>: A preload section packages resources that should be stored in the preload cache in the client.
			They can embed any textual resource type (JavaScript, XML, JSON and .properties files) that the bundling supports.
			UI5 modules are wrapped into a 'sap.ui.predefine' call. Other JavaScript modules will be embedded into a 'jQuery.sap.registerPreload' call, unless the
			asynchronous ui5loader is used. With the ui5loader 'sap.ui.require.preload' is used for other modules.
	</li>
 *	<li>
		 <code>require</code>: A 'require' section is transformed into a sequence of jQuery.sap.require calls. The list will be resolved like an include pattern list
				in any of the other sections and for each of the resolved modules, a jQuery.sap.require will be created. In case the ui5loader is available, 'sap.ui.requireSync' is used instead.
	</li>
 * </ul>
 * </p>
 *
 * @public
 * @typedef {object} ModuleBundleDefinitionSection
 * @property {string} mode The embedding mode. Either 'provided', 'raw', 'preload' or 'require'
 * @property {string[]} filters List of modules declared as glob patterns (resource name patterns) that should be in- or excluded.
 * 		A pattern either contains of a trailing slash '/' or single '*' and double '**' asterisks which denote an arbitrary number of characters or folder names.
 * 		Exludes should be marked with a leading exclamation mark '!'. The order of filters is relevant, a later exclusion overrides an earlier inclusion and vice versa.
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
 * @property {boolean} [resolve=false] Whether (transitive) dependencies of modules that match the given filters should be resolved
 * 		and added to the module set
 * @property {boolean} [resolveConditional=false] Whether conditional dependencies of modules should be resolved
 * 		and added to the module set for this section
 * @property {boolean} [renderer=false] Whether renderers for controls should be added to the module set
 * @property {boolean} [declareRawModules=false] Whether raw modules should be declared after jQuery.sap.global became available. With the usage of the ui5loader, this flag should be set to 'false'
 * @property {boolean} [sort=true] Whether the modules should be sorted by their dependencies
 */

/**
 * Legacy preload bundler.
 *
 * @public
 * @alias module:@ui5/builder.processors.moduleBundler
 * @param {object} parameters Parameters
 * @param {module:@ui5/fs.Resource[]} parameters.resources Resources
 * @param {object} parameters.options Options
 * @param {object} parameters.options.bundleDefinition Module bundle definition
 * @param {string} parameters.options.bundleDefinition.name The module bundle name
 * @param {string[]} [parameters.options.bundleDefinition.defaultFileTypes=[".js", ".fragment.xml", ".view.xml", ".properties", ".json"]] List of default file types to be included in the bundle
 * @param {ModuleBundleDefinitionSection[]} parameters.options.bundleDefinition.sections List of module bundle definition sections.
 * @param {object} parameters.options.bundleOptions Module bundle options
 * @param {boolean} [parameters.options.bundleOptions.optimize=false] If set to 'true' the module bundle gets minified
 * @param {boolean} [parameters.options.bundleOptions.decorateBootstrapModule=true] If set to 'false', the module won't be decorated with an optimization marker
 * @param {boolean} [parameters.options.bundleOptions.addTryCatchRestartWrapper=false] Whether to wrap bootable module bundles with a try/catch to filter out "Restart" errors
 * @param {boolean} [parameters.options.bundleOptions.usePredefineCalls=false] If set to 'true', sap.ui.predefine is used for UI5 modules
 * @param {number} [parameters.options.bundleOptions.numberOfParts=1] The number of parts the module bundle should be splitted
 * @returns {Promise<module:@ui5/fs.Resource[]>} Promise resolving with module bundle resources
 */
module.exports = function({resources, options}) {
//	console.log("preloadBundler bundleDefinition:");
//	console.log(JSON.stringify(options.bundleDefinition, null, 4));

	const pool = new LocatorResourcePool();
	const builder = new BundleBuilder(pool);

	const bundleOptions = options.bundleOptions || {optimize: true};

	return pool.prepare( resources ).
		then( () => builder.createBundle(options.bundleDefinition, bundleOptions) ).
		then( (results) => {
			let bundles;
			if (results instanceof Array) {
				bundles = results;
			} else {
				bundles = [results];
			}

			return Promise.all(bundles.map(function({name, content, bundleInfo}) {
				// console.log("creating bundle as '%s'", "/resources/" + name);
				const resource = new EvoResource({
					path: "/resources/" + name,
					string: content
				});
				return resource;
			}));
		});
};
