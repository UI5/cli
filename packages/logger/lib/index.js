import Logger from "./loggers/Logger.js";

/**
 * Interface for the UI5 Tooling logging module
 *
 * @public
 * @module @ui5/logger
 */

/**
 * Convenience function to create an instance of [@ui5/logger/Logger]{@link @ui5/logger/Logger}
 *
 * @public
 * @param {string} moduleName Identifier for messages created by the logger.
 * Example: <code>module:submodule:Class</code>
 * @returns {@ui5/logger/Logger}
 */
export function getLogger(moduleName) {
	return new Logger(moduleName);
}

/**
 * Tests whether the provided log level is enabled by the current log level
 *
 * @public
 * @function
 * @param {string} levelName Log level to test
 * @returns {boolean} True if the provided level is enabled
 */
export const isLogLevelEnabled = Logger.isLevelEnabled;

/**
 * Sets the standard log level.
 * <br>
 * <b>Example:</b> Setting it to <code>perf</code> would suppress all <code>silly</code> and <code>verbose</code>
 * logging, and only show <code>perf</code>, <code>info</code>, <code>warn</code> and <code>error</code> logs.
 *
 * @public
 * @function
 * @param {string} levelName New log level
 */
export const setLogLevel = Logger.setLevel;

/**
 * Gets the current log level
 *
 * @public
 * @function
 * @returns {string} The current log level. Defaults to <code>info</code>
 */
export const getLogLevel = Logger.getLevel;
