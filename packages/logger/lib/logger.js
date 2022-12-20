import npmlog from "npmlog";

const levels = ["silly", "verbose", "perf", "info", "warn", "error", "silent"];
if (process.env.UI5_LOG_LVL) {
	const logLvl = process.env.UI5_LOG_LVL;
	if (!levels.includes(logLvl)) {
		throw new Error(`UI5 Logger: Environment variable UI5_LOG_LVL is set to an unknown log level "${logLvl}". ` +
			`Valid levels are ${levels.join(", ")}`);
	}
	npmlog.level = logLvl;
} else {
	npmlog.level = "info"; // Our default
}

npmlog.enableUnicode(); // TODO: Check whether unicode is actually supported
npmlog.prefixStyle = {fg: "blue"};
npmlog.headingStyle = {fg: "white", bg: "black"};

// Verbose is at level 1000, info at 2000
npmlog.addLevel("perf", 1500, {fg: "white", bg: "red"}, "PERF");

npmlog.on("error", (err) => {
	console.log(err);
});

function isLevelEnabled(levelName) {
	const currIdx = levels.indexOf(npmlog.level);
	const reqIdx = levels.indexOf(levelName);
	if (currIdx === -1) {
		throw new Error(`Failed to find current log level "${npmlog.level}" in list of expected log levels`);
	}
	if (reqIdx === -1) {
		throw new Error(`Unknown log level "${levelName}"`);
	}
	if (reqIdx >= currIdx) {
		return true;
	} else {
		return false;
	}
}

const substitutionPlaceholders = /%[oOdisfc]/g;
function handleLogArguments(mode, messages) {
	if (messages.length > 1) {
		messages[0] = messages[0].replaceAll(substitutionPlaceholders, "<deprecated string substitution char>");
	}
	if (messages.length > 2) {
		console.log(`⚠️ @ui5/logger: Deprecated log.${mode}() call with multiple arguments. ` +
			`@ui5/logger version 3 does not accept more than two argument. Call stack of this invocation:`);
		console.trace();
		return [messages[0], messages[1]];
	}
	return messages;
}

class Logger {
	constructor(moduleName) {
		this._moduleName = moduleName;
		this._logger = npmlog;
	}

	isLevelEnabled(levelName) {
		return logger.isLevelEnabled(levelName);
	}

	silly(...messages) {
		return this._logger.silly(this._moduleName, ...handleLogArguments("silly", messages));
	}

	verbose(...messages) {
		return this._logger.verbose(this._moduleName, ...handleLogArguments("verbose", messages));
	}

	perf(...messages) {
		return this._logger.perf(this._moduleName, ...handleLogArguments("perf", messages));
	}

	info(...messages) {
		return this._logger.info(this._moduleName, ...handleLogArguments("info", messages));
	}

	warn(...messages) {
		return this._logger.warn(this._moduleName, ...handleLogArguments("warn", messages));
	}

	error(...messages) {
		return this._logger.error(this._moduleName, ...handleLogArguments("error", messages));
	}

	_getLogger() {
		// TODO 3.0: Remove this function
		console.log("⚠️ Deprecated call to Logger#_getLogger. " +
			"Internal method Logger#_getLogger has been deprecated and will be removed.");
		console.trace();
		return this._logger;
	}
}

const logger = {
	getLogger: function(moduleName) {
		return new Logger(moduleName);
	},

	getGroupLogger: function(moduleName) {
		// TODO 3.0: Remove this function
		throw new Error("Deprecated call to @ui5/logger#getGroupLogger. " +
			"This function has been deprecated in @ui5/logger version 3 and will be " +
			"removed in the final release");
	},

	setLevel(level) {
		if (!levels.includes(level)) {
			throw new Error(`Unknown log level "${level}"`);
		}
		return npmlog.level = level;
	},

	isLevelEnabled,

	setShowProgress(showProgress) {
		// TODO 3.0: Remove this function
		throw new Error("Deprecated call to @ui5/logger#setShowProgress. " +
			"This function has been deprecated in @ui5/logger version 3 and will be " +
			"removed in the final release");
	},
};

// Export internal classes for testing only
/* istanbul ignore else */
if (process.env.NODE_ENV === "test") {
	logger.__test__ = {
		Logger
	};
}

export default logger;
