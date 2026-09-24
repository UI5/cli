import crypto from "node:crypto";

/**
 * @typedef {object} @ui5/project/build/cache/index/TaskInputSet~InputEntry
 * @property {string} type Input type, e.g. "env" for an environment variable or "project.getVersion"
 *   for a value read from a dependency's project interface.
 * @property {string} name Input name within the type (e.g. the environment variable name or, for
 *   project inputs, the name of the project the value was read from).
 * @property {string|undefined} value Normalized input value at recording time. May be
 *   <code>undefined</code> (e.g. an environment variable that is not set). An unset input is a
 *   meaningful, distinct input.
 */

/**
 * Normalizes a raw input value to the string form used for hashing and comparison.
 *
 * Both the recording side ([MonitoredTaskUtil]{@link @ui5/project/build/helpers/MonitoredTaskUtil})
 * and the lookup side ([ProjectBuildContext#resolveInputValue]{@link
 * @ui5/project/build/helpers/ProjectBuildContext}) run values through this function, so a value
 * recorded during one build and the current value re-derived during a later build produce the same
 * string when they are semantically equal.
 *
 * Objects and arrays are serialized with object keys sorted, so a key-order difference does not
 * register as a changed input. Arrays keep their order, which can be significant.
 *
 * @param {*} rawValue Raw value as returned by a TaskUtil method
 * @returns {string|undefined} Normalized value, or <code>undefined</code> for an absent value
 */
export function normalizeInputValue(rawValue) {
	if (rawValue === undefined || rawValue === null) {
		return undefined;
	}
	const type = typeof rawValue;
	if (type === "string") {
		return rawValue;
	}
	if (type === "boolean" || type === "number" || type === "bigint") {
		return String(rawValue);
	}
	// Objects and arrays: stable JSON with sorted object keys
	return JSON.stringify(rawValue, (key, value) => {
		if (value && typeof value === "object" && !Array.isArray(value)) {
			return Object.keys(value).sort().reduce((sorted, k) => {
				sorted[k] = value[k];
				return sorted;
			}, {});
		}
		return value;
	});
}

/**
 * Tracks the non-resource inputs that influenced a task's output.
 *
 * This is a sibling of the resource-focused
 * [HashTree]{@link @ui5/project/build/cache/index/HashTree}, but deliberately not a tree: task
 * inputs are few, unordered and non-hierarchical, so this holds a flat set of typed input entries
 * (keyed by <code>type</code> + <code>name</code>) and hashes them into a single signature. That
 * signature is folded into the task's stage signature so that a changed input invalidates the
 * task's cached result exactly like a changed resource does. It shares HashTree's cache-object
 * conventions (a <code>version</code> field, tolerant {@link #fromCache}) but none of its Merkle
 * structure, structural sharing or delta detection, which flat inputs do not need.
 *
 * Recorded input types include <code>env</code> (environment variables read via
 * [TaskUtil#getEnv]{@link @ui5/project/build/helpers/TaskUtil#getEnv}) and reads from the
 * TaskUtil interface such as <code>isRootProject</code>, <code>getDependencies</code> and the
 * <code>project.*</code> accessors (e.g. a dependency's version via
 * <code>getProject(name).getVersion()</code>). See
 * [MonitoredTaskUtil]{@link @ui5/project/build/helpers/MonitoredTaskUtil} for what is tracked.
 *
 * Only the recorded <code>type</code>/<code>name</code> pairs are persisted, never the values. A
 * later build re-reads the current value for each recorded input via
 * {@link #getSignatureWithCurrentValues}, so a cache lookup reflects the environment and graph of
 * the build performing the lookup.
 */
export default class TaskInputSet {
	// Map key: `${type}\0${name}` -> InputEntry
	#entries = new Map();

	/**
	 * @param {@ui5/project/build/cache/index/TaskInputSet~InputEntry[]} [entries]
	 *   Initial input entries. Values are expected to be normalized already (see
	 *   {@link normalizeInputValue}).
	 */
	constructor(entries = []) {
		for (const entry of entries) {
			this.#entries.set(TaskInputSet.#key(entry.type, entry.name), {
				type: entry.type,
				name: entry.name,
				value: entry.value,
			});
		}
	}

	static #key(type, name) {
		return `${type}\0${name}`;
	}

	/**
	 * Whether any input entries have been recorded.
	 *
	 * @returns {boolean}
	 */
	isEmpty() {
		return this.#entries.size === 0;
	}

	/**
	 * Returns the recorded input entries in a stable order (sorted by type, then name).
	 *
	 * @returns {@ui5/project/build/cache/index/TaskInputSet~InputEntry[]}
	 */
	getEntries() {
		return Array.from(this.#entries.values())
			.sort((a, b) => (a.type + "\0" + a.name).localeCompare(b.type + "\0" + b.name));
	}

	/**
	 * Computes the signature over the recorded entries and their recorded values.
	 *
	 * @returns {string} Input signature
	 */
	getSignature() {
		return this.#computeSignature((entry) => entry.value);
	}

	/**
	 * Computes the signature over the recorded entry names, reading each value freshly via the given
	 * resolver instead of using the recorded value.
	 *
	 * Used on cache lookup: the recorded names identify which inputs the task consumed last time; the
	 * current values decide whether the cached result still applies.
	 *
	 * @param {function(string, string, (string|undefined)): (string|undefined)} [resolveValue]
	 *   Returns the current normalized value for an input, given its <code>type</code>,
	 *   <code>name</code> and recorded value. Defaults to reading <code>process.env</code> for
	 *   <code>env</code> inputs and falling back to the recorded value for any other type.
	 * @returns {string} Input signature computed with current values
	 */
	getSignatureWithCurrentValues(resolveValue) {
		const resolve = resolveValue ?? ((type, name, recordedValue) => {
			return type === "env" ? process.env[name] : recordedValue;
		});
		return this.#computeSignature((entry) => resolve(entry.type, entry.name, entry.value));
	}

	/**
	 * Computes the signature over the recorded entries. An empty set produces a stable, fixed digest
	 * (the hash of zero entries).
	 *
	 * @param {function(@ui5/project/build/cache/index/TaskInputSet~InputEntry): (string|undefined)} getValue
	 * @returns {string}
	 * @private
	 */
	#computeSignature(getValue) {
		const hash = crypto.createHash("sha256");
		// Entries are hashed in stable (type, name) order. Fields are NUL-separated: types are known
		// identifiers, names and values are arbitrary strings, but none may contain a NUL byte, so the
		// concatenation is unambiguous. An unset value is rendered as a distinct marker so it cannot
		// collide with an empty-string value.
		for (const entry of this.getEntries()) {
			const value = getValue(entry);
			hash.update(entry.type);
			hash.update("\0");
			hash.update(entry.name);
			hash.update("\0");
			hash.update(value === undefined ? "\0unset" : value);
			hash.update("\0");
		}
		return hash.digest("hex");
	}

	/**
	 * Serializes the recorded entry names and types for persistence.
	 *
	 * Values are deliberately not persisted: a later build re-reads the current value for each
	 * recorded name (see {@link #getSignatureWithCurrentValues}).
	 *
	 * @returns {object} Serialized cache object
	 */
	toCacheObject() {
		return {
			version: 1,
			entries: this.getEntries().map(({type, name}) => ({type, name})),
		};
	}

	/**
	 * Restores a TaskInputSet from its serialized form.
	 *
	 * An "input" metadata row is written only for tasks that recorded at least one input, so a
	 * missing row (<code>null</code>/<code>undefined</code>) yields an empty set.
	 *
	 * @param {object} [data] Serialized cache object created by {@link #toCacheObject}
	 * @returns {TaskInputSet}
	 */
	static fromCache(data) {
		if (!data) {
			return new TaskInputSet();
		}
		if (data.version !== 1) {
			throw new Error(`Unsupported TaskInputSet version: ${data.version}`);
		}
		// Restored entries carry no value; a lookup reads current values by name.
		return new TaskInputSet(data.entries.map(({type, name}) => ({type, name, value: undefined})));
	}
}
