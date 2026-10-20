/**
 * Parses JSON content, attaching the file path to any parse failure so the
 * root cause (empty file vs. syntax error) is always identifiable.
 *
 * An empty JSON object (<code>{}</code>) is valid and parsed normally; only content-less
 * files (empty or whitespace-only) throw <code>ERR_EMPTY_JSON</code>. Any other parse
 * failure is re-thrown as <code>ERR_INVALID_JSON</code> with the file path prefixed.
 *
 * @param {string} content Raw file content
 * @param {string} filePath Path of the file the content was read from, used in the error message
 * @returns {object} Parsed JSON
 * @throws {SyntaxError} with code "ERR_EMPTY_JSON" if content is empty/whitespace-only
 * @throws {SyntaxError} with code "ERR_INVALID_JSON" if content is malformed JSON
 */
export default function parseJSON(content, filePath) {
	try {
		return JSON.parse(content);
	} catch (err) {
		if (typeof content === "string" && content.trim() === "") {
			const error = new SyntaxError(`The file "${filePath}" is empty.`);
			error.code = "ERR_EMPTY_JSON";
			throw error;
		}
		const error = new SyntaxError(`Failed to parse "${filePath}" as JSON: ${err.message}`);
		error.code = "ERR_INVALID_JSON";
		throw error;
	}
}
