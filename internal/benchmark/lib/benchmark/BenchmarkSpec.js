/**
 * Represents a single benchmark specification with its command, preparation,
 * group memberships, and revision restrictions.
 */
export default class BenchmarkSpec {
	/**
	 * @param {object} config - The benchmark configuration object
	 * @param {string} config.command - The UI5 CLI command to benchmark (e.g., "build")
	 * @param {string} [config.prepare] - Optional shell command to run before each benchmark
	 * @param {object} config.groups - Map of group keys to group-specific config
	 * @param {string} config.groups[].name - Display name for this benchmark in the group
	 * @param {string[]} [config.revisions] - Optional list of revision keys this benchmark should run on
	 * @param {number} index - The index of this benchmark in the configuration (for ordering)
	 */
	constructor(config, index) {
		if (!config || typeof config !== "object") {
			throw new Error("Benchmark configuration must be an object");
		}
		if (!config.command || typeof config.command !== "string") {
			throw new Error("Benchmark must have a command string");
		}
		if (config.prepare !== undefined && typeof config.prepare !== "string") {
			throw new Error("Benchmark prepare must be a string if provided");
		}
		if (!config.groups || typeof config.groups !== "object" || Object.keys(config.groups).length === 0) {
			throw new Error("Benchmark must belong to at least one group");
		}

		// Validate group configurations
		for (const [groupKey, groupConfig] of Object.entries(config.groups)) {
			if (!groupConfig || typeof groupConfig !== "object") {
				throw new Error(`Benchmark group '${groupKey}' configuration must be an object`);
			}
			if (!groupConfig.name || typeof groupConfig.name !== "string") {
				throw new Error(`Benchmark group '${groupKey}' must have a name`);
			}
		}

		// Validate revisions if provided
		if (config.revisions !== undefined) {
			if (!Array.isArray(config.revisions)) {
				throw new Error("Benchmark revisions must be an array if provided");
			}
			if (config.revisions.length === 0) {
				throw new Error("Benchmark revisions array must not be empty if provided");
			}
			for (const rev of config.revisions) {
				if (typeof rev !== "string") {
					throw new Error("Benchmark revision keys must be strings");
				}
			}
		}

		this.#index = index;
		this.#command = config.command;
		this.#prepare = config.prepare || null;
		this.#groupMemberships = new Map(Object.entries(config.groups));
		this.#revisionKeys = config.revisions ? [...config.revisions] : null;
	}

	#index;
	#command;
	#prepare;
	#groupMemberships; // Map<groupKey, {name: displayName}>
	#revisionKeys; // null means all revisions, otherwise array of revision keys

	get index() {
		return this.#index;
	}

	get command() {
		return this.#command;
	}

	get prepare() {
		return this.#prepare;
	}

	get groupMemberships() {
		return new Map(this.#groupMemberships);
	}

	get revisionKeys() {
		return this.#revisionKeys ? [...this.#revisionKeys] : null;
	}

	/**
	 * Check if this benchmark should run on a specific revision
	 *
	 * @param {string} revisionKey - The revision key to check
	 * @returns {boolean}
	 */
	shouldRunOnRevision(revisionKey) {
		if (this.#revisionKeys === null) {
			return true; // No restriction, runs on all revisions
		}
		return this.#revisionKeys.includes(revisionKey);
	}

	/**
	 * Get the display name for this benchmark in a specific group
	 *
	 * @param {string} groupKey - The group key
	 * @returns {string}
	 */
	getGroupDisplayName(groupKey) {
		const groupConfig = this.#groupMemberships.get(groupKey);
		if (!groupConfig) {
			throw new Error(`Benchmark is not a member of group '${groupKey}'`);
		}
		return groupConfig.name;
	}

	/**
	 * Get all group keys this benchmark belongs to
	 *
	 * @returns {string[]}
	 */
	getGroupKeys() {
		return Array.from(this.#groupMemberships.keys());
	}
}
