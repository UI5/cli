import process from "node:process";
import {inspect} from "node:util";

// Module name must not contain any other characters than alphanumerical and some specials
const rIllegalModuleNameChars = /[^0-9a-zA-Z-_:@./]/i;

/**
 * Standard logging module for UI5 Tooling and extensions.
 * <br><br>
 * Emits <code>ui5.log</code> events on the [<code>process</code>]{@link https://nodejs.org/api/process.html} object,
 * which can be handled by dedicated writers,
 * like [@ui5/logger/writers/Console]{@link @ui5/logger/writers/Console}.
 * <br><br>
 * If no listener is attached to an event, messages are written directly to the <code>process.stderr</code> stream.
 *
 * @public
 * @class
 * @alias @ui5/logger/Logger
 */
class Logger {
	/**
	 * Available log levels, ordered by priority:
	 * <br>
	 * <ol>
	 *   <li>silly</li>
	 *   <li>verbose</li>
	 *   <li>perf</li>
	 *   <li>info <i>(default)</i></li>
	 *   <li>warn</li>
	 *   <li>error</li>
	 *   <li>silent</li>
	 * </ol>
	 *
	 * Log level <code>silent</code> is special in the sense that no messages can be submitted with that level.
	 * It can be used to suppress all logging.
	 *
	 * @member {string[]}
	 * @public
	*/
	static LOG_LEVELS = ["silly", "verbose", "perf", "info", "warn", "error", "silent"];

	/**
	 * Event name used for emitting new log-message event on the
	 * [<code>process</code>]{@link https://nodejs.org/api/process.html} object
	 *
	 * @member {string}
	 * @public
	*/
	static LOG_EVENT_NAME = "ui5.log";

	/**
	 * Sets the standard log level.
	 * <br>
	 * <b>Example:</b> Setting it to <code>perf</code> would suppress all <code>silly</code> and <code>verbose</code>
	 * logging, and only show <code>perf</code>, <code>info</code>, <code>warn</code> and <code>error</code> logs.
	 *
	 * @public
	 * @param {string} levelName New log level
	 */
	static setLevel(levelName) {
		process.env.UI5_LOG_LVL = levelName;
	}

	/**
	 * Gets the current log level
	 *
	 * @public
	 * @returns {string} The current log level. Defaults to <code>info</code>
	 */
	static getLevel() {
		if (process.env.UI5_LOG_LVL) {
			// Check whether set log level is valid
			const levelName = process.env.UI5_LOG_LVL;
			if (!Logger.LOG_LEVELS.includes(levelName)) {
				throw new Error(
					`UI5 Logger: Environment variable UI5_LOG_LVL is set to an unknown log level "${levelName}". ` +
					`Valid levels are ${Logger.LOG_LEVELS.join(", ")}`);
			}
			return levelName;
		} else {
			return "info";
		}
	}

	/**
	 * Tests whether the provided log level is enabled by the current log level
	 *
	 * @public
	 * @param {string} levelName Log level to test
	 * @returns {boolean} True if the provided level is enabled
	 */
	static isLevelEnabled(levelName) {
		const currIdx = Logger.LOG_LEVELS.indexOf(Logger.getLevel());
		const reqIdx = Logger.LOG_LEVELS.indexOf(levelName);
		if (reqIdx === -1) {
			throw new Error(`Unknown log level "${levelName}"`);
		}
		return reqIdx >= currIdx;
	}

	/**
	 * Formats a given parameter into a string
	 *
	 * @param {any} message Single log message parameter passed by a program
	 * @returns {string} String representation for the given message
	 */
	static _formatMessage(message) {
		if (typeof message === "string" || message instanceof String) {
			return message;
		}
		return inspect(message, {
			depth: 3,
			compact: 2,
		});
	}

	#moduleName;

	/**
	 *
	 *
	 * @public
	 * @param {string} moduleName Identifier for messages created by this logger.
	 * Example: <code>module:submodule:Class</code>
	 */
	constructor(moduleName) {
		if (!moduleName) {
			throw new Error("Logger: Missing moduleName parameter");
		}
		if (rIllegalModuleNameChars.test(moduleName)) {
			throw new Error(`Logger: Invalid module name: ${moduleName}`);
		}
		this.#moduleName = moduleName;
	}

	/**
	 * Tests whether the provided log level is enabled by the current log level
	 *
	 * @public
	 * @param {string} levelName Log level to test
	 * @returns {boolean} True if the provided level is enabled
	 */
	isLevelEnabled(levelName) {
		return Logger.isLevelEnabled(levelName);
	}

	_emit(eventName, payload) {
		return process.emit(eventName, payload);
	}

	_log(level, message) {
		if (this.isLevelEnabled(level)) {
			process.stderr.write(`[${level}] ${message}\n`);
		}
	}

	_emitOrLog(level, message) {
		const hasListeners = this._emit(Logger.LOG_EVENT_NAME, {
			level,
			message,
			moduleName: this.#moduleName,
		});
		if (!hasListeners) {
			this._log(level, `${this.#moduleName}: ${message}`);
		}
	}
}

/**
 * Create a log entry with the <code>silly</code> level
 *
 * @public
 * @name @ui5/logger/Logger#silly
 * @function
 * @memberof @ui5/logger/Logger
 * @param {...any} message Messages to log. An automatic string conversion is applied if necessary
 */

/**
 * Create a log entry with the <code>verbose</code> level
 *
 * @public
 * @name @ui5/logger/Logger#verbose
 * @function
 * @memberof @ui5/logger/Logger
 * @param {...any} message Messages to log. An automatic string conversion is applied if necessary
 */

/**
 * Create a log entry with the <code>perf</code> level
 *
 * @public
 * @name @ui5/logger/Logger#perf
 * @function
 * @memberof @ui5/logger/Logger
 * @param {...any} message Messages to log. An automatic string conversion is applied if necessary
 */

/**
 * Create a log entry with the <code>info</code> level
 *
 * @public
 * @name @ui5/logger/Logger#info
 * @function
 * @memberof @ui5/logger/Logger
 * @param {...any} message Messages to log. An automatic string conversion is applied if necessary
 */

/**
 * Create a log entry with the <code>warn</code> level
 *
 * @public
 * @name @ui5/logger/Logger#warn
 * @function
 * @memberof @ui5/logger/Logger
 * @param {...any} message Messages to log. An automatic string conversion is applied if necessary
 */

/**
 * Create a log entry with the <code>error</code> level
 *
 * @public
 * @name @ui5/logger/Logger#error
 * @function
 * @memberof @ui5/logger/Logger
 * @param {...any} message Messages to log. An automatic string conversion is applied if necessary
 */

Logger.LOG_LEVELS.forEach((logLevel) => {
	if (logLevel === "silent") {
		// This level is to suppress any logging. Hence we do not provide a dedicated log-function
		return;
	}
	Logger.prototype[logLevel] = function(...args) {
		const message = args.map(Logger._formatMessage).join(" ");
		this._emitOrLog(logLevel, message);
	};
});

export default Logger;
