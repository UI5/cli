import {writeSync} from "node:fs";

// Synchronous, env-gated teardown tracer. Set UI5_TEARDOWN_TRACE=1 to enable.
//
// Writes straight to fd 2 (stderr) with writeSync, bypassing the async stream buffer, so
// the last line survives a hard native crash (a 0xC0000005 access violation on Windows in
// @parcel/watcher or node:sqlite teardown terminates the process without flushing buffered
// output). Each line is prefixed with the high-resolution time and the pid so interleaved
// teardown across the Supervisor, BuildServer, and watchers can be ordered after the fact.
//
// Off by default and a no-op unless the env var is set, so it costs nothing in normal runs.
const ENABLED = process.env.UI5_TEARDOWN_TRACE === "1";

/**
 * Emits a teardown trace line to stderr synchronously when UI5_TEARDOWN_TRACE=1.
 *
 * @param {string} msg Message to trace
 */
export function trace(msg) {
	if (!ENABLED) {
		return;
	}
	try {
		writeSync(2, `[teardown ${process.hrtime.bigint()} pid=${process.pid}] ${msg}\n`);
	} catch {
		// Never let tracing throw during teardown.
	}
}
