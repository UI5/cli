/**
 * Parses the given JSON content, throwing a descriptive error if the content is empty.
 *
 * An empty JSON object (<code>{}</code>) is valid and parsed normally; only content-less
 * files (empty or whitespace-only) are rejected. For non-empty but invalid JSON, the native
 * <code>JSON.parse</code> error is thrown unchanged.
 *
 * @param {string} content Raw file content
 * @param {string} filePath Path of the file the content was read from, used in the error message
 * @returns {object} Parsed JSON
 * @throws {Error} with code "ERR_EMPTY_JSON" if the content is empty; otherwise the native JSON.parse error
 */
export default function parseJSON(content, filePath) {
	if (content.trim() === "") {
		const error = new Error(`The file "${filePath}" is empty.`);
		error.code = "ERR_EMPTY_JSON";
		throw error;
	}
	return JSON.parse(content);
}
