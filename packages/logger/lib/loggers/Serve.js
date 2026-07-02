import prettyHrtime from "pretty-hrtime";
import Logger from "./Logger.js";

/**
 * Logger for emitting status events on the lifecycle of a UI5 development server
 * (idle / stale / building / build-done / error).
 * <br><br>
 * Emits <code>ui5.log</code> and <code>ui5.serve-status</code> events on the
 * [<code>process</code>]{@link https://nodejs.org/api/process.html} object, which can be handled
 * by dedicated writers, like [@ui5/logger/writers/Console]{@link @ui5/logger/writers/Console}
 * or the live banner shipped by <code>@ui5/cli</code>.
 * <br><br>
 * If no listener is attached to the event, messages are written directly to the <code>process.stderr</code> stream.
 *
 * @private
 * @class
 * @alias @ui5/logger/loggers/Serve
 */
class Serve extends Logger {
	static SERVE_STATUS_EVENT_NAME = "ui5.serve-status";

	ready() {
		const level = "info";
		const hasListeners = this._emit(Serve.SERVE_STATUS_EVENT_NAME, {
			level,
			status: "serve-ready",
		});
		if (!hasListeners) {
			this._log(level, `Server ready`);
		}
	}

	stale(changedProjects) {
		if (!changedProjects || !Array.isArray(changedProjects)) {
			throw new Error("loggers/Serve#stale: Missing or incorrect changedProjects parameter");
		}
		const level = "info";
		const hasListeners = this._emit(Serve.SERVE_STATUS_EVENT_NAME, {
			level,
			status: "serve-stale",
			changedProjects,
		});
		if (!hasListeners) {
			this._log(level, `Sources changed in: ${changedProjects.join(", ")}`);
		}
	}

	building() {
		const level = "info";
		const hasListeners = this._emit(Serve.SERVE_STATUS_EVENT_NAME, {
			level,
			status: "serve-building",
		});
		if (!hasListeners) {
			this._log(level, `Building...`);
		}
	}

	buildDone(hrtime) {
		if (!Array.isArray(hrtime) || hrtime.length !== 2 ||
				typeof hrtime[0] !== "number" || typeof hrtime[1] !== "number") {
			throw new Error("loggers/Serve#buildDone: Missing or incorrect hrtime parameter");
		}
		const level = "info";
		const hasListeners = this._emit(Serve.SERVE_STATUS_EVENT_NAME, {
			level,
			status: "serve-build-done",
			hrtime,
		});
		if (!hasListeners) {
			this._log(level, `Build finished in ${prettyHrtime(hrtime)}`);
		}
	}

	// Named serveError rather than error to avoid shadowing Logger.prototype.error
	serveError(error) {
		if (!error) {
			throw new Error("loggers/Serve#serveError: Missing error parameter");
		}
		const level = "error";
		const hasListeners = this._emit(Serve.SERVE_STATUS_EVENT_NAME, {
			level,
			status: "serve-error",
			error,
		});
		if (!hasListeners) {
			this._log(level, `Server error: ${error.message || error}`);
		}
	}
}

export default Serve;
