import {Transform} from "node:stream";

/**
 * Read a limit when it is used so environment overrides apply to subsequent reads.
 *
 * @param {string} name Environment variable
 * @param {number} fallback Default limit
 * @returns {number} Positive safe integer
 */
function getLimit(name, fallback) {
	const value = process.env[name];
	if (value === undefined) {
		return fallback;
	}
	const limit = Number(value);
	if (!/^\d+$/.test(value) || !Number.isSafeInteger(limit) || limit <= 0) {
		const error = new Error(`Invalid ${name}: expected a positive safe integer, received '${value}'`);
		error.code = "ERR_MAVEN_INVALID_LIMIT";
		throw error;
	}
	return limit;
}

export function getMavenLimits() {
	return {
		metadataBytes: getLimit("UI5_MAVEN_MAX_METADATA_BYTES", 64 * 1024 * 1024),
		artifactBytes: getLimit("UI5_MAVEN_MAX_ARTIFACT_BYTES", 2 * 1024 ** 3),
		archiveEntries: getLimit("UI5_MAVEN_MAX_ARCHIVE_ENTRIES", 262144),
		entryBytes: getLimit("UI5_MAVEN_MAX_ENTRY_BYTES", 1024 ** 3),
		expandedBytes: getLimit("UI5_MAVEN_MAX_EXPANDED_BYTES", 4 * 1024 ** 3),
		compressionRatio: getLimit("UI5_MAVEN_MAX_COMPRESSION_RATIO", 200),
		fetchTimeout: getLimit("UI5_MAVEN_FETCH_TIMEOUT", 1800000),
		extractionTime: getLimit("UI5_MAVEN_MAX_EXTRACTION_TIME", 600000)
	};
}

function limitError(value, {input, limit, name, code, unit}) {
	const error = new Error(
		`Maven input '${input}' exceeds ${name}=${limit} ${unit} (${value} ${unit} observed)`);
	error.code = code;
	return error;
}

export function assertMaxBytes(value, options) {
	if (value > options.limit) {
		throw limitError(value, {...options, unit: "bytes"});
	}
}

export function assertEntryCount(value, {input, limit}) {
	if (value > limit) {
		throw limitError(value, {input, limit, name: "UI5_MAVEN_MAX_ARCHIVE_ENTRIES",
			code: "ERR_MAVEN_ARCHIVE_TOO_MANY_ENTRIES", unit: "entries"});
	}
}

export function assertCompressionRatio(expanded, compressed, {input, limit}) {
	const ratio = expanded === 0 ? 0 : expanded / compressed;
	if (ratio > limit) {
		throw limitError(ratio, {input, limit, name: "UI5_MAVEN_MAX_COMPRESSION_RATIO",
			code: "ERR_MAVEN_COMPRESSION_RATIO_EXCEEDED", unit: "expanded/compressed"});
	}
}

export function createByteCounter(check) {
	let bytes = 0;
	return new Transform({
		transform(chunk, encoding, callback) {
			bytes += chunk.length;
			try {
				check(bytes, chunk.length);
				callback(null, chunk);
			} catch (err) {
				callback(err);
			}
		}
	});
}

// A single clock and signal cover each operation, including redirects and body consumption.
export function createDeadline({input, limit, name, code}) {
	const controller = new AbortController();
	const {signal} = controller;
	const start = performance.now();
	let timer;
	function check() {
		const elapsed = performance.now() - start;
		if (elapsed >= limit && !signal.aborted) {
			controller.abort(limitError(Math.ceil(elapsed), {input, limit, name, code, unit: "ms"}));
		}
		signal.throwIfAborted();
	}
	function schedule() {
		// Node clamps larger delays to 1 ms. Split long environment overrides into valid timer intervals.
		timer = setTimeout(() => {
			try {
				check();
				schedule();
			} catch {
				// The signal carries the error to the active operation.
			}
		}, Math.min(limit - (performance.now() - start), 2147483647));
	}
	schedule();
	return {
		signal,
		check,
		abort: (error) => controller.abort(error),
		clear: () => clearTimeout(timer),
		async wait(promise) {
			let onAbort;
			const aborted = new Promise((resolve, reject) => {
				onAbort = () => reject(signal.reason);
				signal.addEventListener("abort", onAbort, {once: true});
				if (signal.aborted) {
					onAbort();
				}
			});
			try {
				return await Promise.race([aborted, promise]);
			} finally {
				signal.removeEventListener("abort", onAbort);
			}
		}
	};
}
