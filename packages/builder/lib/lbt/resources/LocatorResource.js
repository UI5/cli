const Resource = require("./Resource");


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

module.exports = LocatorResource;
