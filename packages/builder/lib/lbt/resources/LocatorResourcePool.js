const ResourcePool = require("./ResourcePool");
const LocatorResource = require("./LocatorResource");

class LocatorResourcePool extends ResourcePool {
	prepare(resources) {
		resources = resources.filter( (res) => !res.getStatInfo().isDirectory() );
		return Promise.all(
			resources.map(
				(resource) => this.addResource( new LocatorResource(this, resource) )
			).filter(Boolean)
		);
	}
}

module.exports = LocatorResourcePool;
