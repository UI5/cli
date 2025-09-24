import Resource from "./Resource.js";

class LocatorResource extends Resource {
	constructor(pool, resource, moduleName) {
		super(pool, moduleName, null, resource.getStatInfo());
		this.resource = resource;
	}

	buffer() {
		return this.resource.getBuffer();
	}

	getProject() {
		return this.resource.getProject();
	}

	getPath() {
		return this.resource.getPath();
	}
}

export default LocatorResource;
