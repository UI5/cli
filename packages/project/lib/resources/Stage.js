/**
 * A stage has either a writer or a reader, never both.
 * Consumers need to be able to differentiate between the two
 */
class Stage {
	#id;
	#writer;
	#cachedWriter;
	#cachedProjectTagOperations;
	#cachedBuildTagOperations;

	constructor(id, writer, cachedWriter, cachedProjectTagOperations, cachedBuildTagOperations) {
		if (writer && cachedWriter) {
			throw new Error(
				`Stage '${id}' cannot have both a writer and a cache reader`);
		}
		this.#id = id;
		this.#writer = writer;
		this.#cachedWriter = cachedWriter;
		this.#cachedProjectTagOperations = cachedProjectTagOperations;
		this.#cachedBuildTagOperations = cachedBuildTagOperations;
	}

	getId() {
		return this.#id;
	}

	getWriter() {
		return this.#writer;
	}

	getCachedWriter() {
		return this.#cachedWriter;
	}

	getCachedProjectTagOperations() {
		return this.#cachedProjectTagOperations;
	}

	getCachedBuildTagOperations() {
		return this.#cachedBuildTagOperations;
	}
}

export default Stage;
