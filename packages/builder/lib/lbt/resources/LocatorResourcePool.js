const ResourcePool = require("./ResourcePool");
const LocatorResource = require("./LocatorResource");

class LocatorResourcePool extends ResourcePool {
	prepare(resources, moduleNameMapping) {
		resources = resources.filter( (res) => !res.getStatInfo().isDirectory() );
		return Promise.all(
			resources.map((resource) => {
				let moduleName = moduleNameMapping && moduleNameMapping[resource.getPath()];
				if (!moduleName) {
					moduleName = resource.getPath().slice("/resources/".length);
				}
				return this.addResource(new LocatorResource(this, resource, moduleName));
			}).filter(Boolean)
		);
	}
}

module.exports = LocatorResourcePool;
