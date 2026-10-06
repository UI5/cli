const strReplacements = {
	"\r": "\\r",
	"\t": "\\t",
	"\n": "\\n",
	"'": "\\'",
	"\\": "\\\\"
};

export function makeStringLiteral(str) {
	return "'" + String(str).replace(/['\r\n\t\\]/g, function(char) {
		return strReplacements[char];
	}) + "'";
}

export function removeHashbang(str) {
	// A hashbang is only a valid ECMAScript HashbangComment when "#!" are the first characters of the
	// source. If the file was saved with a UTF-8 BOM, the "#!" is no longer first and would become a
	// syntax error once embedded in a bundle. Match (and keep) an optional leading BOM so the hashbang
	// line is removed in that case too; the BOM is valid JS whitespace and is left untouched.
	return str.replace(/^(\uFEFF)?#!(.*)/, "$1");
}

/**
 * Removes a leading UTF-8 Byte Order Mark (BOM, U+FEFF) from the given string.
 *
 * When a source file is saved as "UTF-8 with BOM", decoding its buffer to a string keeps the BOM
 * as a leading U+FEFF character. Inside a bundle this character ends up within the inlined string
 * literal, which breaks strict XML engines (e.g. the Rust-based DOMParser in Chromium 153+) and
 * corrupts the first key of *.properties files. A BOM in a UI5 source file is always unintended,
 * so it is stripped before the content is embedded.
 *
 * Note: We intentionally do not decode via TextDecoder (which strips a BOM on its own). It operates
 * on a Buffer rather than the already-decoded strings handled here, and its "latin1" label maps to
 * windows-1252 instead of the ISO-8859-1 that *.properties files rely on. This string-based helper
 * matches the de-facto "strip-bom" contract (remove exactly one leading U+FEFF) without those pitfalls.
 *
 * @param {string} str input string that might start with a BOM
 * @returns {string} the input string without a leading BOM
 */
export function stripBOM(str) {
	return str.charCodeAt(0) === 0xFEFF ? str.slice(1) : str;
}
