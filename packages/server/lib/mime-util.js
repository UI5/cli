const mime = require("mime-types");

module.exports.getMimeInfo = function(resourcePath) {
	const type = mime.lookup(resourcePath) || "application/octet-stream";
	const charset = mime.charset(type);
	return {
		type,
		charset,
		contentType: type + (charset ? "; charset=" + charset : "")
	};
};
