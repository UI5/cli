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
	return str.replace(/^#!(.*)/, "");
}
