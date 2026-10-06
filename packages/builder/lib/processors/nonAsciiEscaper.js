import {escapeUnicode} from "escape-unicode";
import {stripBOM} from "../lbt/utils/stringUtils.js";

/**
 * @public
 * @module @ui5/builder/processors/nonAsciiEscaper
 */

/**
 * @see https://en.wikipedia.org/wiki/ASCII
 * ascii contains 128 characters.
 * its char codes reach from 0 to 127.
 * @type {number}
 */
const CHAR_CODE_OF_LAST_ASCII_CHARACTER = 127;

// use memoization for escapeUnicode function for performance
const memoizeEscapeUnicodeMap = Object.create(null);
const memoizeEscapeUnicode = function(sChar) {
	if (memoizeEscapeUnicodeMap[sChar]) {
		return memoizeEscapeUnicodeMap[sChar];
	}
	memoizeEscapeUnicodeMap[sChar] = escapeUnicode(sChar);
	return memoizeEscapeUnicodeMap[sChar];
};

/**
 * Escapes non ASCII characters with unicode escape sequences.
 *
 * @see https://en.wikipedia.org/wiki/ASCII
 * @see https://tools.ietf.org/html/rfc5137#section-6.1
 *
 *
 * @param {string} string input string with non ascii characters, e.g. L♥VE
 * @returns {{string: (string), modified: boolean}} output string with all non ascii
 * characters being escaped by unicode sequence, e.g. L\u2665VE
 */
const escapeNonAscii = function(string) {
	let result = "";
	let modified = false;
	for (let i = 0; i < string.length; i++) {
		const char = string[i];
		// check for non ascii characters (characters which have a char code
		// greater than the ascii character code range)
		if (string.charCodeAt(i) > CHAR_CODE_OF_LAST_ASCII_CHARACTER) {
			result += memoizeEscapeUnicode(char);
			modified = true;
		} else {
			result += char;
		}
	}
	return {
		modified,
		string: result
	};
};

/**
 * Escapes non ASCII characters with unicode escape sequences.
 *
 * A leading UTF-8 Byte Order Mark (BOM, U+FEFF) is removed before escaping. Otherwise it would be
 * escaped to a literal "\\uFEFF" sequence at the start of the content, corrupting the first key of
 * a *.properties file. The removal is gated on the decoded content starting with U+FEFF, not on the
 * encoding name: a UTF-8 BOM decodes to a leading U+FEFF and is removed, whereas an ISO-8859-1
 * (latin1) decode can never produce U+FEFF (its code points are limited to U+0000-U+00FF), so
 * latin1 files are left untouched.
 *
 * ```js
 * const encoding = nonAsciiEscaper.getEncodingFromAlias("ISO-8859-1");
 * nonAsciiEscaper({resources, options: {encoding}});
 * ```
 *
 * @public
 * @function default
 * @static
 *
 * @param {object} parameters Parameters
 * @param {@ui5/fs/Resource[]} parameters.resources List of resources to be processed
 * @param {object} [parameters.options] Options
 * @param {string} [parameters.options.encoding="utf8"] resource file encoding
 *   ({@link https://nodejs.org/api/buffer.html#buffer_buffers_and_character_encodings Node.js character encodings}).
 *   Use #getEncodingFromAlias to get the encoding string
 * @returns {Promise<@ui5/fs/Resource[]>} Promise resolving with the processed resources
 */
async function nonAsciiEscaper({resources, options: {encoding}}) {
	encoding = encoding || "utf8";

	async function processResource(resource) {
		const resourceString = (await resource.getBuffer()).toString(encoding);
		// Strip a leading UTF-8 BOM before escaping. Otherwise the U+FEFF character would be escaped
		// to a literal "\\uFEFF" sequence at the very start of the content, silently corrupting the
		// first key of a *.properties file. This is the common choke point for both the standalone
		// escapeNonAsciiCharacters task and the bundler (via escapePropertiesFile), so handling it
		// here covers every path. Only UTF-8 input is affected: a BOM decoded as latin1 becomes the
		// three characters "ï»¿" (not U+FEFF), so ISO-8859-1 byte semantics are preserved.
		const strippedString = stripBOM(resourceString);
		const escaped = escapeNonAscii(strippedString);
		// modify the resource if a BOM was stripped and/or non-ascii characters were escaped
		if (escaped.modified || strippedString !== resourceString) {
			resource.setString(escaped.string);
			return resource;
		}
	}

	return Promise.all(resources.map(processResource));
}

const encodingMap = {
	"UTF-8": "utf8",
	"ISO-8859-1": "latin1",
};

/**
 * Provides a mapping from user-friendly encoding name (alias) such as "UTF-8" and "ISO-8859-1" to node
 * specific encoding name such as "utf8" or "latin1". Simplifies usage of nonAsciiEscaper encoding option
 * such that it can be used standalone without the respective task (e.g. in Splitter, Bundler and related projects).
 *
 * @public
 * @function getEncodingFromAlias
 * @alias @ui5/builder/processors/nonAsciiEscaper․getEncodingFromAlias
 * @static
 *
 * @param {string} encoding encoding labels: "UTF-8" and "ISO-8859-1"
 * @returns {string} node.js character encoding string, e.g. utf8 and latin1
 */
nonAsciiEscaper.getEncodingFromAlias = function(encoding) {
	if (!encodingMap[encoding]) {
		throw new Error(
			`Encoding "${encoding}" is not supported. Only ${Object.keys(encodingMap).join(", ")} are allowed values` );
	}
	return encodingMap[encoding];
};

export default nonAsciiEscaper;
