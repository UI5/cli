const log = require("@ui5/logger").getLogger("resources:tracing:Trace");
const logGlobs = require("@ui5/logger").getLogger("resources:tracing:Trace:globs");
const logPaths = require("@ui5/logger").getLogger("resources:tracing:Trace:paths");
const prettyHrtime = require("pretty-hrtime");
const summaryTrace = require("./traceSummary");
const hasOwnProperty = Object.prototype.hasOwnProperty;

/**
 * Trace
 *
 * @memberof module:@ui5/fs.tracing
 * @class
 */
class Trace {
	constructor(name) {
		if (!log.isLevelEnabled("silly")) {
			return;
		}
		this._name = name;
		this._startTime = process.hrtime();
		this._globCalls = 0;
		this._pathCalls = 0;
		this._collections = {};
		summaryTrace.traceStarted();
	}

	globCall() {
		if (!log.isLevelEnabled("silly")) {
			return;
		}
		this._globCalls++;
		summaryTrace.globCall();
	}

	pathCall() {
		if (!log.isLevelEnabled("silly")) {
			return;
		}
		this._pathCalls++;
		summaryTrace.pathCall();
	}

	collection(name) {
		if (!log.isLevelEnabled("silly")) {
			return;
		}
		const collection = this._collections[name];
		if (collection) {
			this._collections[name].calls++;
		} else {
			this._collections[name] = {
				calls: 1
			};
		}
		summaryTrace.collection(name);
	}

	printReport() {
		if (!log.isLevelEnabled("silly")) {
			return;
		}
		let report = "";
		const timeDiff = process.hrtime(this._startTime);
		const time = prettyHrtime(timeDiff);
		const colCount = Object.keys(this._collections).length;

		report += `[Trace: ${this._name}\n`;
		report += `  ${time} elapsed time \n`;
		if (this._globCalls) {
			report += `  ${this._globCalls} glob executions\n`;
		}
		if (this._pathCalls) {
			report += `  ${this._pathCalls} path stats\n`;
		}
		report += `  ${colCount} reader-collections involed:\n`;

		for (const coll in this._collections) {
			if (hasOwnProperty.call(this._collections, coll)) {
				report += `      ${this._collections[coll].calls}x ${coll}\n`;
			}
		}
		report += "======================]";

		if (this._globCalls && this._pathCalls) {
			log.silly(report);
		} else if (this._globCalls) {
			logGlobs.silly(report);
		} else {
			logPaths.silly(report);
		}

		summaryTrace.traceEnded();
	}
}

module.exports = Trace;
