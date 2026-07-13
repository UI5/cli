import prettyHrtime from "pretty-hrtime";
import Logger from "./Logger.js";

/**
 * Logger for emitting status events on the lifecycle of a UI5 development server
 * (idle / stale / settling / building / build-done / error).
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

	// Emit a `ui5.serve-status` event; if no listener is attached, fall back to
	// a plain log line at the same level. All public status methods route
	// through here so the event payload shape (`{level, status, ...}`) and the
	// no-listener fallback stay in sync across states.
	#emitStatus(status, payload, fallbackMessage, {level = "info"} = {}) {
		const hasListeners = this._emit(Serve.SERVE_STATUS_EVENT_NAME, {
			level,
			status,
			...payload,
		});
		if (!hasListeners) {
			this._log(level, fallbackMessage);
		}
	}

	ready() {
		this.#emitStatus("serve-ready", {}, `Server ready`);
	}

	stale(changedProjects) {
		if (!changedProjects || !Array.isArray(changedProjects)) {
			throw new Error("loggers/Serve#stale: Missing or incorrect changedProjects parameter");
		}
		this.#emitStatus("serve-stale", {changedProjects},
			`Sources changed in: ${changedProjects.join(", ")}`);
	}

	settling(pendingProjects) {
		if (!pendingProjects || !Array.isArray(pendingProjects)) {
			throw new Error("loggers/Serve#settling: Missing or incorrect pendingProjects parameter");
		}
		this.#emitStatus("serve-settling", {pendingProjects},
			`Waiting for changes to settle in: ${pendingProjects.join(", ")}`);
	}

	validating(validatingProjects) {
		if (!validatingProjects || !Array.isArray(validatingProjects)) {
			throw new Error(
				"loggers/Serve#validating: Missing or incorrect validatingProjects parameter");
		}
		this.#emitStatus("serve-validating", {validatingProjects},
			`Validating caches for: ${validatingProjects.join(", ")}`);
	}

	building() {
		this.#emitStatus("serve-building", {}, `Building...`);
	}

	buildDone(hrtime) {
		if (!Array.isArray(hrtime) || hrtime.length !== 2 ||
				typeof hrtime[0] !== "number" || typeof hrtime[1] !== "number") {
			throw new Error("loggers/Serve#buildDone: Missing or incorrect hrtime parameter");
		}
		this.#emitStatus("serve-build-done", {hrtime},
			`Build finished in ${prettyHrtime(hrtime)}`);
	}

	// Named serveError rather than error to avoid shadowing Logger.prototype.error
	serveError(error) {
		if (!error) {
			throw new Error("loggers/Serve#serveError: Missing error parameter");
		}
		this.#emitStatus("serve-error", {error},
			`Server error: ${error.message || error}`, {level: "error"});
	}
}

export default Serve;
