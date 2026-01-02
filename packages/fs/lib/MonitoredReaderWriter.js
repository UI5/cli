import AbstractReaderWriter from "./AbstractReaderWriter.js";

export default class MonitoredReaderWriter extends AbstractReaderWriter {
	#readerWriter;
	#sealed = false;
	#paths = new Set();
	#patterns = new Set();

	constructor(readerWriter) {
		super(readerWriter.getName());
		this.#readerWriter = readerWriter;
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
		if (this.#readerWriter.resolvePattern) {
			const resolvedPattern = this.#readerWriter.resolvePattern(virPattern);
			this.#patterns.add(resolvedPattern);
		} else {
			this.#patterns.add(virPattern);
		}
		return await this.#readerWriter._byGlob(virPattern, options, trace);
	}

	async _byPath(virPath, options, trace) {
		if (this.#sealed) {
			throw new Error(`Unexpected read operation after reader has been sealed`);
		}
		if (this.#readerWriter.resolvePath) {
			const resolvedPath = this.#readerWriter.resolvePath(virPath);
			if (resolvedPath) {
				this.#paths.add(resolvedPath);
			}
		} else {
			this.#paths.add(virPath);
		}
		return await this.#readerWriter._byPath(virPath, options, trace);
	}

	async _write(resource, options) {
		return this.#readerWriter.write(resource, options);
	}
}
