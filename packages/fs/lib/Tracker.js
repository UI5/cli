import AbstractReader from "./AbstractReader.js";

export default class Trace extends AbstractReader {
	#reader;
	#sealed = false;
	#pathsRead = [];
	#patterns = [];
	#resourcesRead = Object.create(null);

	constructor(reader) {
		super(reader.getName());
		this.#reader = reader;
	}

	getResults() {
		this.#sealed = true;
		return {
			requests: {
				pathsRead: this.#pathsRead,
				patterns: this.#patterns,
			},
			resourcesRead: this.#resourcesRead,
		};
	}

	async _byGlob(virPattern, options, trace) {
		if (this.#sealed) {
			throw new Error(`Unexpected read operation after reader has been sealed`);
		}
		if (this.#reader.resolvePattern) {
			const resolvedPattern = this.#reader.resolvePattern(virPattern);
			this.#patterns.push(resolvedPattern);
		} else if (virPattern instanceof Array) {
			for (const pattern of virPattern) {
				this.#patterns.push(pattern);
			}
		} else {
			this.#patterns.push(virPattern);
		}
		const resources = await this.#reader._byGlob(virPattern, options, trace);
		for (const resource of resources) {
			if (!resource.getStatInfo()?.isDirectory()) {
				this.#resourcesRead[resource.getOriginalPath()] = resource;
			}
		}
		return resources;
	}

	async _byPath(virPath, options, trace) {
		if (this.#sealed) {
			throw new Error(`Unexpected read operation after reader has been sealed`);
		}
		if (this.#reader.resolvePath) {
			const resolvedPath = this.#reader.resolvePath(virPath);
			if (resolvedPath) {
				this.#pathsRead.push(resolvedPath);
			}
		} else {
			this.#pathsRead.push(virPath);
		}
		const resource = await this.#reader._byPath(virPath, options, trace);
		if (resource) {
			if (!resource.getStatInfo()?.isDirectory()) {
				this.#resourcesRead[resource.getOriginalPath()] = resource;
			}
		}
		return resource;
	}
}
