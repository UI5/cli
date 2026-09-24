import crypto from "node:crypto";

/**
 * Signature returned for an input set with no recorded entries.
 *
 * A fixed, distinct sentinel so that "this task declared no additional inputs"
 * is stable across builds and never collides with a real hash. It is composed
 * away in {@link @ui5/project/build/cache/ProjectBuildCache} so that tasks
 * without additional inputs keep producing the exact same stage signature they
 * did before input tracking existed (backward compatibility with older caches).
 *
 * @type {string}
 */
export const EMPTY_INPUT_SIGNATURE = "no-inputs";

/**
 * @typedef {object} @ui5/project/build/cache/index/InputHashTree~InputEntry
 * @property {string} type Input type. Currently only "env" is supported.
 * @property {string} name Input name (e.g. the environment variable name)
 * @property {string|undefined} value Input value at recording time. May be
 *   <code>undefined</code> (e.g. an environment variable that is not set) —
 *   an unset input is still a meaningful, distinct input.
 */

/**
 * Tracks non-resource inputs that influence a task's output.
 *
 * This is a sibling of the resource-focused
 * [HashTree]{@link @ui5/project/build/cache/index/HashTree}: instead of a
 * Merkle directory tree over file resources, it holds a flat, ordered set of
 * typed input entries (keyed by <code>type</code> + <code>name</code>) and
 * hashes them into a single signature. That signature is folded into the task's
 * stage signature so that a changed input invalidates the task's cached result
 * exactly like a changed resource does.
 *
 * Proof of concept: the only input type currently recorded is <code>env</code>
 * (environment variables read via
 * [TaskUtil#getEnv]{@link @ui5/project/build/helpers/TaskUtil#getEnv}). The
 * structure is intentionally generic so further input types (declared by the
 * task implementation) can be added later.
 *
 * Only the recorded <code>type</code>/<code>name</code> pairs are persisted
 * (never the values). A subsequent build re-reads the current value for each
 * recorded name via {@link #getSignatureWithCurrentValues}, so a cache lookup
 * reflects the environment of the build performing the lookup.
 */
export default class InputHashTree {
	// Map key: `${type}\0${name}` -> InputEntry
	#entries = new Map();

	/**
	 * @param {@ui5/project/build/cache/index/InputHashTree~InputEntry[]} [entries]
	 *   Initial input entries
	 */
	constructor(entries = []) {
		for (const entry of entries) {
			this.#entries.set(InputHashTree.#key(entry.type, entry.name), {
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
	 * @returns {@ui5/project/build/cache/index/InputHashTree~InputEntry[]}
	 */
	getEntries() {
		return Array.from(this.#entries.values())
			.sort((a, b) => (a.type + "\0" + a.name).localeCompare(b.type + "\0" + b.name));
	}

	/**
	 * Computes the signature over the recorded entries and their recorded values.
	 *
	 * Returns {@link EMPTY_INPUT_SIGNATURE} when no entries are recorded.
	 *
	 * @returns {string} Input signature
	 */
	getSignature() {
		return this.#computeSignature((entry) => entry.value);
	}

	/**
	 * Computes the signature over the recorded entry names, but reading each
	 * value freshly via the given callback instead of the recorded value.
	 *
	 * Used on cache lookup: the recorded names identify which inputs the task
	 * consumed last time; the current values decide whether the cached result
	 * still applies.
	 *
	 * @param {object} [callbacks]
	 * @param {function(string): (string|undefined)} [callbacks.readEnv]
	 *   Returns the current value for an environment variable name.
	 *   Defaults to reading <code>process.env</code>.
	 * @returns {string} Input signature computed with current values
	 */
	getSignatureWithCurrentValues({readEnv = (name) => process.env[name]} = {}) {
		return this.#computeSignature((entry) => {
			if (entry.type === "env") {
				return readEnv(entry.name);
			}
			// Unknown input type: fall back to the recorded value
			return entry.value;
		});
	}

	/**
	 * @param {function(@ui5/project/build/cache/index/InputHashTree~InputEntry): (string|undefined)} getValue
	 * @returns {string}
	 * @private
	 */
	#computeSignature(getValue) {
		if (this.#entries.size === 0) {
			return EMPTY_INPUT_SIGNATURE;
		}
		const hash = crypto.createHash("sha256");
		// Entries are hashed in stable (type, name) order. Fields are NUL-separated:
		// types are known identifiers, env names/values are arbitrary strings, but
		// none may contain a NUL byte, so the concatenation is unambiguous.
		// An unset value is rendered as a distinct marker so it cannot collide with
		// an empty-string value.
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
	 * Serializes the recorded entry names/types for persistence.
	 *
	 * Values are deliberately NOT persisted: a later build re-reads the current
	 * value for each recorded name (see {@link #getSignatureWithCurrentValues}).
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
	 * Restores an InputHashTree from its serialized form.
	 *
	 * @param {object} data Serialized cache object created by {@link #toCacheObject}
	 * @returns {InputHashTree}
	 */
	static fromCache(data) {
		if (!data) {
			return new InputHashTree();
		}
		if (data.version !== 1) {
			throw new Error(`Unsupported InputHashTree version: ${data.version}`);
		}
		// Restored entries carry no value; a lookup reads current values by name.
		return new InputHashTree((data.entries ?? []).map(({type, name}) => ({type, name, value: undefined})));
	}
}
