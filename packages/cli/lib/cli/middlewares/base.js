const logger = require("./logger");
/**
 * Base middleware for CLI commands.
 *
 * This middleware should be executed for every CLI command to enable basic features (e.g. logging).
 *
 * @param {Object} argv The CLI arguments
 * @returns {Object}
 */
module.exports = function(argv) {
	logger.init(argv);
	return {};
};
