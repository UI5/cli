import Revision from "./Revision.js";
import Group from "./Group.js";
import BenchmarkSpec from "./BenchmarkSpec.js";

/**
 * Represents the complete benchmark configuration with revisions, groups, and benchmarks.
 */
export default class Configuration {
	/**
	 * @param {object} config - The parsed YAML configuration object
	 * @param {object} config.revisions - Map of revision keys to revision configs
	 * @param {object} config.groups - Map of group keys to group configs
	 * @param {object} config.hyperfine - Hyperfine execution options
	 * @param {number} config.hyperfine.warmup - Number of warmup runs
	 * @param {number} config.hyperfine.runs - Number of benchmark runs
	 * @param {Array} config.benchmarks - Array of benchmark specifications
	 */
	constructor(config) {
		if (!config || typeof config !== "object") {
			throw new Error("Configuration must be an object");
		}

		// Validate and parse hyperfine options
		if (!config.hyperfine || typeof config.hyperfine !== "object") {
			throw new Error("Configuration must have a 'hyperfine' section");
		}
		if (typeof config.hyperfine.warmup !== "number" || config.hyperfine.warmup < 0) {
			throw new Error("hyperfine.warmup must be a non-negative number");
		}
		if (typeof config.hyperfine.runs !== "number" || config.hyperfine.runs < 1) {
			throw new Error("hyperfine.runs must be a positive number");
		}

		this.#warmup = config.hyperfine.warmup;
		this.#runs = config.hyperfine.runs;

		// Validate and parse revisions
		if (!config.revisions || typeof config.revisions !== "object" ||
			Object.keys(config.revisions).length === 0) {
			throw new Error("Configuration must have at least one revision");
		}

		this.#revisions = new Map();
		for (const [key, revConfig] of Object.entries(config.revisions)) {
			this.#revisions.set(key, new Revision(key, revConfig));
		}

		// Validate and parse groups
		if (!config.groups || typeof config.groups !== "object" ||
			Object.keys(config.groups).length === 0) {
			throw new Error("Configuration must have at least one group");
		}

		this.#groups = new Map();
		for (const [key, groupConfig] of Object.entries(config.groups)) {
			this.#groups.set(key, new Group(key, groupConfig));
		}

		// Validate and parse benchmarks
		if (!Array.isArray(config.benchmarks) || config.benchmarks.length === 0) {
			throw new Error("Configuration must have at least one benchmark");
		}

		this.#benchmarks = config.benchmarks.map((benchConfig, index) => {
			const spec = new BenchmarkSpec(benchConfig, index);

			// Validate that all referenced groups exist
			for (const groupKey of spec.getGroupKeys()) {
				if (!this.#groups.has(groupKey)) {
					throw new Error(
						`Benchmark ${index} references unknown group '${groupKey}'`
					);
				}
			}

			// Validate that all referenced revisions exist
			if (spec.revisionKeys !== null) {
				for (const revKey of spec.revisionKeys) {
					if (!this.#revisions.has(revKey)) {
						throw new Error(
							`Benchmark ${index} references unknown revision '${revKey}'`
						);
					}
				}
			}

			return spec;
		});
	}

	#revisions; // Map<key, Revision>
	#groups; // Map<key, Group>
	#benchmarks; // Array<BenchmarkSpec>
	#warmup;
	#runs;

	get revisions() {
		return new Map(this.#revisions);
	}

	get groups() {
		return new Map(this.#groups);
	}

	get benchmarks() {
		return [...this.#benchmarks];
	}

	get warmup() {
		return this.#warmup;
	}

	get runs() {
		return this.#runs;
	}

	/**
	 * Get a revision by key
	 *
	 * @param {string} key - The revision key
	 * @returns {Revision}
	 */
	getRevision(key) {
		const revision = this.#revisions.get(key);
		if (!revision) {
			throw new Error(`Unknown revision key: ${key}`);
		}
		return revision;
	}

	/**
	 * Get a group by key
	 *
	 * @param {string} key - The group key
	 * @returns {Group}
	 */
	getGroup(key) {
		const group = this.#groups.get(key);
		if (!group) {
			throw new Error(`Unknown group key: ${key}`);
		}
		return group;
	}

	/**
	 * Get all revision keys
	 *
	 * @returns {string[]}
	 */
	getRevisionKeys() {
		return Array.from(this.#revisions.keys());
	}

	/**
	 * Get all group keys
	 *
	 * @returns {string[]}
	 */
	getGroupKeys() {
		return Array.from(this.#groups.keys());
	}
}
