/**
 * Represents a revision configuration that can be either a direct git reference
 * or a merge-base derived reference.
 */
export default class Revision {
	/**
	 * @param {string} key - The unique identifier for this revision (from YAML key)
	 * @param {object} config - The revision configuration object
	 * @param {string} config.name - Display name for this revision
	 * @param {string|object} config.revision - Either a git ref string or merge-base config object
	 * @param {string} [config.revision.merge_base_from] - Branch to find merge base from
	 * @param {string} [config.revision.target_branch] - Target branch for merge base calculation
	 */
	constructor(key, config) {
		if (!key || typeof key !== "string") {
			throw new Error("Revision key must be a non-empty string");
		}
		if (!config || typeof config !== "object") {
			throw new Error(`Revision '${key}' configuration must be an object`);
		}
		if (!config.name || typeof config.name !== "string") {
			throw new Error(`Revision '${key}' must have a name`);
		}
		if (!config.revision) {
			throw new Error(`Revision '${key}' must have a revision definition`);
		}

		this.#key = key;
		this.#name = config.name;

		// Parse revision definition
		if (typeof config.revision === "string") {
			this.#type = "direct";
			this.#gitReference = config.revision;
		} else if (typeof config.revision === "object") {
			if (!config.revision.merge_base_from || !config.revision.target_branch) {
				throw new Error(
					`Revision '${key}' with merge_base must specify both 'merge_base_from' and 'target_branch'`
				);
			}
			this.#type = "merge_base";
			this.#mergeBaseFrom = config.revision.merge_base_from;
			this.#targetBranch = config.revision.target_branch;
		} else {
			throw new Error(`Revision '${key}' has invalid revision type`);
		}
	}

	#key;
	#name;
	#type; // "direct" or "merge_base"
	#gitReference; // For direct type
	#mergeBaseFrom; // For merge_base type
	#targetBranch; // For merge_base type

	get key() {
		return this.#key;
	}

	get name() {
		return this.#name;
	}

	get type() {
		return this.#type;
	}

	get gitReference() {
		if (this.#type !== "direct") {
			throw new Error(`Revision '${this.#key}' is not a direct reference`);
		}
		return this.#gitReference;
	}

	get mergeBaseFrom() {
		if (this.#type !== "merge_base") {
			throw new Error(`Revision '${this.#key}' is not a merge_base reference`);
		}
		return this.#mergeBaseFrom;
	}

	get targetBranch() {
		if (this.#type !== "merge_base") {
			throw new Error(`Revision '${this.#key}' is not a merge_base reference`);
		}
		return this.#targetBranch;
	}

	isDirect() {
		return this.#type === "direct";
	}

	isMergeBase() {
		return this.#type === "merge_base";
	}
}
