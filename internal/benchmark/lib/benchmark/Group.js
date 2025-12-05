/**
 * Represents a benchmark group used for organizing and comparing results.
 */
export default class Group {
	/**
	 * @param {string} key - The unique identifier for this group (from YAML key)
	 * @param {object} config - The group configuration object
	 * @param {string} config.name - Display name for this group
	 */
	constructor(key, config) {
		if (!key || typeof key !== "string") {
			throw new Error("Group key must be a non-empty string");
		}
		if (!config || typeof config !== "object") {
			throw new Error(`Group '${key}' configuration must be an object`);
		}
		if (!config.name || typeof config.name !== "string") {
			throw new Error(`Group '${key}' must have a name`);
		}

		this.#key = key;
		this.#name = config.name;
	}

	#key;
	#name;

	get key() {
		return this.#key;
	}

	get name() {
		return this.#name;
	}
}
