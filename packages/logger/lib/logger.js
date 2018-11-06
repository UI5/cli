const npmlog = require("npmlog");

if (process.env.UI5_LOG_LVL) {
	const levels = ["silly", "verbose", "info", "warn", "error"];
	const logLvl = process.env.UI5_LOG_LVL;
	if (!levels.includes(logLvl)) {
		throw new Error(`UI5 Logger: Environment variable UI5_LOG_LVL is set to an unkown log level "${logLvl}". ` +
			`Valid levels are ${levels.join(", ")}`);
	}
	npmlog.level = logLvl;
} else {
	npmlog.level = "info"; // Our default
}

npmlog.enableUnicode();

npmlog.on("error", (err) => {
	console.log(err);
});

class Logger {
	constructor(moduleName) {
		this._moduleName = moduleName;
		this._logger = npmlog;
	}

	isLevelEnabled(levelName) {
		return true;
	}

	silly(...messages) {
		return this._logger.silly(this._moduleName, ...messages);
	}

	verbose(...messages) {
		return this._logger.verbose(this._moduleName, ...messages);
	}

	info(...messages) {
		return this._logger.info(this._moduleName, ...messages);
	}

	warn(...messages) {
		return this._logger.warn(this._moduleName, ...messages);
	}

	error(...messages) {
		return this._logger.error(this._moduleName, ...messages);
	}

	_getLogger() {
		return this._logger;
	}
}

class GroupLogger extends Logger {
	constructor(moduleName, weight = 0, parentLogger) {
		super(moduleName);

		if (parentLogger) {
			this._logger = parentLogger._getLogger().newGroup("", weight);
		} else {
			this._logger = npmlog.newGroup("", weight);
		}
	}

	createSubLogger(name, weight) {
		return new GroupLogger(this._moduleName + " " + name, weight, this);
	}

	createTaskLogger(name, todo, weight) {
		return new TaskLogger(this._moduleName + " " + name, todo, weight, this);
	}
}


class TaskLogger extends Logger {
	constructor(moduleName, todo, weight, parentLogger) {
		super(moduleName);
		this._todo = todo || 0;
		this._completed = 0;

		if (parentLogger) {
			this._logger = parentLogger._getLogger().newItem("", todo, weight);
		} else {
			this._logger = npmlog.newItem(this._moduleName, todo, weight);
		}
	}

	addWork(todo) {
		this._logger.addWork(todo);
		this._todo += todo;
	}

	startWork(...messages) {
		// Current job number is completed + 1
		this.info(`(${this._completed + 1}/${this._todo})`, ...messages);
	}

	completeWork(completed) {
		this._completed += completed;
		this._logger.completeWork(completed);
	}

	finish() {
		return this._logger.finish();
	}
}

module.exports = {
	getLogger: function(moduleName) {
		return new Logger(moduleName);
	},

	getGroupLogger: function(moduleName) {
		return new GroupLogger(moduleName);
	},

	setLevel(level) {
		return npmlog.level = level;
	},

	setShowProgress(showProgress) {
		if (showProgress) {
			npmlog.enableProgress();
		} else {
			npmlog.disableProgress();
		}
	}
};
