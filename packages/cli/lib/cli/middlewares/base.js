/**
 * Base middleware for CLI commands.
 *
 * This middleware should be executed for every CLI command to enable basic features (e.g. logging).
 * @param {Object} argv The CLI arguments
 * @returns {Object} Data to be appended to argv
 */
module.exports = function(argv) {
	if (argv.verbose || argv.loglevel) {
		const logger = require("@ui5/logger");
		if (argv.loglevel) {
			logger.setLevel(argv.loglevel);
		}
		if (argv.verbose) {
			logger.setLevel("verbose");
		}
	}
	return {};
};
