const Resource = require("./Resource");

class LocatorResource extends Resource {
	constructor(pool, resource, moduleName) {
		super(pool, moduleName, null, resource.getStatInfo());
		this.resource = resource;
	}

	buffer() {
		return this.resource.getBuffer();
	}

	getProject() {
		return this.resource._project;
	}

	getPath() {
		return this.resource.getPath();
	}
}

module.exports = LocatorResource;
