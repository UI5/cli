import AbstractReader from "./AbstractReader.js";

export default class MonitoredReader extends AbstractReader {
	#reader;
	#sealed = false;
	#paths = [];
	#patterns = [];

	constructor(reader) {
		super(reader.getName());
		this.#reader = reader;
	}

	getResourceRequests() {
		this.#sealed = true;
		return {
			paths: this.#paths,
			patterns: this.#patterns,
		};
	}

	async _byGlob(virPattern, options, trace) {
		if (this.#sealed) {
			throw new Error(`Unexpected read operation after reader has been sealed`);
		}
		if (this.#reader.resolvePattern) {
			const resolvedPattern = this.#reader.resolvePattern(virPattern);
			this.#patterns.push(resolvedPattern);
		} else {
			this.#patterns.push(virPattern);
		}
		return await this.#reader._byGlob(virPattern, options, trace);
	}

	async _byPath(virPath, options, trace) {
		if (this.#sealed) {
			throw new Error(`Unexpected read operation after reader has been sealed`);
		}
		if (this.#reader.resolvePath) {
			const resolvedPath = this.#reader.resolvePath(virPath);
			if (resolvedPath) {
				this.#paths.push(resolvedPath);
			}
		} else {
			this.#paths.push(virPath);
		}
		return await this.#reader._byPath(virPath, options, trace);
	}
}
