/**
 * Read a limit when it is used so environment overrides apply to subsequent reads.
 *
 * @param {string} name Environment variable
 * @param {number} fallback Default limit
 * @returns {number} Positive safe integer
 */
function getLimit(name, fallback) {
	const value = process.env[name];
	if (value === undefined) {
		return fallback;
	}
	const limit = Number(value);
	if (!/^\d+$/.test(value) || !Number.isSafeInteger(limit) || limit <= 0) {
		const error = new Error(`Invalid ${name}: expected a positive safe integer, received '${value}'`);
		error.code = "ERR_CONFIG_INVALID_LIMIT";
		throw error;
	}
	return limit;
}

/**
 * @returns {object} YAML byte, nesting and collection limits
 */
export function getConfigLimits() {
	return {
		bytes: getLimit("UI5_CONFIG_MAX_BYTES", 1024 * 1024),
		depth: getLimit("UI5_CONFIG_MAX_DEPTH", 100),
		collection: getLimit("UI5_CONFIG_MAX_COLLECTION", 10000)
	};
}

/**
 * @returns {number} Manifest byte limit
 */
export function getManifestMaxBytes() {
	return getLimit("UI5_MANIFEST_MAX_BYTES", 4 * 1024 * 1024);
}

/**
 * @returns {number} JSON nesting limit
 */
export function getJsonMaxDepth() {
	return getLimit("UI5_JSON_MAX_DEPTH", 100);
}

/**
 * @param {number} byteSize Input size in bytes
 * @param {object} options Check options
 * @param {string} options.input Input path
 * @param {number} options.limit Maximum size in bytes
 * @throws {Error} If the input exceeds the byte limit
 */
export function assertMaxBytes(byteSize, {input, limit}) {
	if (byteSize > limit) {
		const error = new Error(
			`Configuration file '${input}' exceeds the maximum size of ${limit} bytes (${byteSize} bytes)`);
		error.code = "ERR_CONFIG_TOO_LARGE";
		throw error;
	}
}

/**
 * Reject over-nested JSON before JSON.parse allocates the parsed structure.
 * JSON.parse enforces no nesting limit of its own.
 *
 * @param {string} str JSON content
 * @param {object} options Check options
 * @param {string} options.input Input path
 * @param {number} options.limit Maximum number of nested objects and arrays
 * @throws {Error} If the input exceeds the nesting limit
 */
export function assertJsonDepth(str, {input, limit}) {
	if (typeof str !== "string") {
		return;
	}
	let depth = 0;
	let inString = false;
	for (let i = 0; i < str.length; i++) {
		const char = str[i];
		if (inString) {
			if (char === "\\") {
				i++; // Skip the escaped character, including escaped quotes and backslashes.
			} else if (char === "\"") {
				inString = false;
			}
		} else if (char === "\"") {
			inString = true;
		} else if (char === "{" || char === "[") {
			if (++depth > limit) {
				const error = new Error(
					`Configuration file '${input}' exceeds the maximum JSON nesting depth of ${limit}`);
				error.code = "ERR_CONFIG_TOO_DEEP";
				throw error;
			}
		} else if (char === "}" || char === "]") {
			depth--;
		}
	}
}

/**
 * Check each collection once, including shared or cyclic YAML aliases.
 *
 * @param {*} value Parsed configuration
 * @param {object} options Check options
 * @param {string} options.input Input path
 * @param {number} options.limit Maximum array length or object property count
 * @throws {Error} If a collection exceeds the limit
 */
export function assertCollectionSize(value, {input, limit}) {
	const pending = [value];
	const visited = new WeakSet();
	while (pending.length) {
		const current = pending.pop();
		if (!current || typeof current !== "object" || visited.has(current)) {
			continue;
		}
		visited.add(current);
		const isArray = Array.isArray(current);
		const keys = isArray ? undefined : Object.keys(current);
		const size = isArray ? current.length : keys.length;
		if (size > limit) {
			const error = new Error(
				`Configuration file '${input}' exceeds the maximum collection size of ${limit} ` +
				`(${size} ${isArray ? "array entries" : "object properties"})`);
			error.code = "ERR_CONFIG_COLLECTION_TOO_LARGE";
			throw error;
		}
		for (let i = 0; i < size; i++) {
			pending.push(current[isArray ? i : keys[i]]);
		}
	}
}

/**
 * Check the resource size before requesting its content. FileSystem resources
 * supply the size from stat metadata.
 *
 * @param {@ui5/fs/Resource} resource Input resource
 * @param {object} options Check options
 * @param {string} options.input Input path
 * @param {number} options.limit Maximum size in bytes
 * @returns {Promise<string>} Resource content
 */
export async function readResourceString(resource, {input, limit}) {
	assertMaxBytes(await resource.getSize(), {input, limit});
	return resource.getString();
}
