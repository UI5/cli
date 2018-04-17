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
 * Legacy preload bundler.
 *
 * @module builder/processors/bundlers/moduleBundler
 * @param {Object} parameters Parameters
 * @param {Resource[]} parameters.resources Resources
 * @param {Object} parameters.options Options
 * @param {Object} parameters.options.bundleDefinition Module bundle definition
 * @param {Object} parameters.options.bundleOptions Module bundle options
 * @returns {Promise<Resource[]>} Promise resolving with module bundle resources
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
				console.log("creating bundle as '%s'", "/resources/" + name);
				const resource = new EvoResource({
					path: "/resources/" + name,
					string: content
				});
				return resource;
			}));
		});
};
