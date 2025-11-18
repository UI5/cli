import AbstractReaderWriter from "./AbstractReaderWriter.js";

// TODO: Alternative name: Inspector/Interceptor/...

export default class Trace extends AbstractReaderWriter {
	#readerWriter;
	#sealed = false;
	#pathsRead = [];
	#patterns = [];
	#resourcesRead = Object.create(null);
	#resourcesWritten = Object.create(null);

	constructor(readerWriter) {
		super(readerWriter.getName());
		this.#readerWriter = readerWriter;
	}

	getResults() {
		this.#sealed = true;
		return {
			requests: {
				pathsRead: this.#pathsRead,
				patterns: this.#patterns,
			},
			resourcesRead: this.#resourcesRead,
			resourcesWritten: this.#resourcesWritten,
		};
	}

	async _byGlob(virPattern, options, trace) {
		if (this.#sealed) {
			throw new Error(`Unexpected read operation after reader has been sealed`);
		}
		if (this.#readerWriter.resolvePattern) {
			const resolvedPattern = this.#readerWriter.resolvePattern(virPattern);
			this.#patterns.push(resolvedPattern);
		} else if (virPattern instanceof Array) {
			for (const pattern of virPattern) {
				this.#patterns.push(pattern);
			}
		} else {
			this.#patterns.push(virPattern);
		}
		const resources = await this.#readerWriter._byGlob(virPattern, options, trace);
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
		if (this.#readerWriter.resolvePath) {
			const resolvedPath = this.#readerWriter.resolvePath(virPath);
			if (resolvedPath) {
				this.#pathsRead.push(resolvedPath);
			}
		} else {
			this.#pathsRead.push(virPath);
		}
		const resource = await this.#readerWriter._byPath(virPath, options, trace);
		if (resource) {
			if (!resource.getStatInfo()?.isDirectory()) {
				this.#resourcesRead[resource.getOriginalPath()] = resource;
			}
		}
		return resource;
	}

	async _write(resource, options) {
		if (this.#sealed) {
			throw new Error(`Unexpected write operation after writer has been sealed`);
		}
		if (!resource) {
			throw new Error(`Cannot write undefined resource`);
		}
		this.#resourcesWritten[resource.getOriginalPath()] = resource;
		return this.#readerWriter.write(resource, options);
	}
}
