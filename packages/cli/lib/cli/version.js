let version;

// This module holds the CLI's version information (set via ui5.js) for later retrieval (e.g. from middlewares/logger)
module.exports = {
	set: function(v) {
		version = v;
	},
	get: function() {
		return version;
	}
};
