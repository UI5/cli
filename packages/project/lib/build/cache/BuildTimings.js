import {getLogger} from "@ui5/logger";

const log = getLogger("build:cache:BuildTimings");
const isEnabled = process.env.UI5_BUILD_TIMINGS === "true";

// label → {totalMs, count, minMs, maxMs}
const entries = new Map();

/**
 * Start timing an operation.
 * Returns a start token (timestamp) or undefined if timing is disabled.
 *
 * @param {string} label Operation label (e.g. "readIndexCache")
 * @returns {number|undefined} Start timestamp, or undefined when disabled
 */
function start(label) {
	if (!isEnabled) {
		return undefined;
	}
	return performance.now();
}

/**
 * Record the elapsed time for a previously started operation.
 * No-op when timing is disabled or if startTime is undefined.
 *
 * @param {string} label Operation label (must match the label passed to start())
 * @param {number|undefined} startTime The value returned by start()
 */
function end(label, startTime) {
	if (startTime === undefined) {
		return;
	}
	const elapsed = performance.now() - startTime;
	let entry = entries.get(label);
	if (!entry) {
		entry = {totalMs: 0, count: 0, minMs: Infinity, maxMs: -Infinity};
		entries.set(label, entry);
	}
	entry.totalMs += elapsed;
	entry.count++;
	if (elapsed < entry.minMs) {
		entry.minMs = elapsed;
	}
	if (elapsed > entry.maxMs) {
		entry.maxMs = elapsed;
	}
}

/**
 * Format a millisecond value for display.
 * Values >= 1000ms are shown as seconds (e.g. "1.234s").
 * Values < 1000ms are shown with ms suffix (e.g. "12.34ms").
 * Values < 0.01ms are shown as "<0.01ms".
 *
 * @param {number} ms Duration in milliseconds
 * @returns {string} Formatted duration string
 */
function formatMs(ms) {
	if (ms >= 1000) {
		return `${(ms / 1000).toFixed(3)}s`;
	}
	if (ms < 0.01) {
		return "<0.01ms";
	}
	return `${ms.toFixed(2)}ms`;
}

/**
 * Right-pad a string to the given width.
 *
 * @param {string} str Input string
 * @param {number} width Target width
 * @returns {string} Padded string
 */
function pad(str, width) {
	return str.padEnd(width);
}

/**
 * Left-pad a string to the given width.
 *
 * @param {string} str Input string
 * @param {number} width Target width
 * @returns {string} Padded string
 */
function lpad(str, width) {
	return str.padStart(width);
}

/**
 * Log the timing summary to the build log.
 * Groups entries into Reads, Writes, and Resource I/O categories.
 * Only logs when timing is enabled and there are recorded entries.
 */
function logSummary() {
	if (!isEnabled || entries.size === 0) {
		return;
	}

	const COL_OP = 28;
	const COL_NUM = 10;

	const header =
		pad("Operation", COL_OP) +
		lpad("Calls", COL_NUM) +
		lpad("Total", COL_NUM) +
		lpad("Avg", COL_NUM) +
		lpad("Min", COL_NUM) +
		lpad("Max", COL_NUM);

	const separator = "─".repeat(header.length);

	const lines = [
		"",
		"Build Cache Timings",
		separator,
		header,
		separator,
	];

	const readLabels = [
		"readBuildManifest",
		"readIndexCache",
		"readTaskMetadata",
		"readResultMetadata",
		"readStageCache",
	];
	const writeLabels = [
		"writeBuildManifest",
		"writeIndexCache",
		"writeTaskMetadata",
		"writeResultMetadata",
		"writeStageCache",
	];
	const resourceLabels = [
		"getResourcePathForStage",
		"writeStageResource",
	];

	let grandTotalMs = 0;
	let grandTotalCalls = 0;

	function addSection(title, labels) {
		let sectionTotal = 0;
		let sectionCalls = 0;
		const sectionLines = [];

		for (const label of labels) {
			const entry = entries.get(label);
			if (!entry || entry.count === 0) {
				sectionLines.push(
					pad(`  ${label}`, COL_OP) +
					lpad("0", COL_NUM) +
					lpad("--", COL_NUM) +
					lpad("--", COL_NUM) +
					lpad("--", COL_NUM) +
					lpad("--", COL_NUM)
				);
				continue;
			}
			const avg = entry.totalMs / entry.count;
			sectionLines.push(
				pad(`  ${label}`, COL_OP) +
				lpad(String(entry.count), COL_NUM) +
				lpad(formatMs(entry.totalMs), COL_NUM) +
				lpad(formatMs(avg), COL_NUM) +
				lpad(formatMs(entry.minMs), COL_NUM) +
				lpad(formatMs(entry.maxMs), COL_NUM)
			);
			sectionTotal += entry.totalMs;
			sectionCalls += entry.count;
		}

		lines.push(`${title}`);
		lines.push(...sectionLines);

		if (sectionCalls > 0) {
			lines.push(
				pad(`  Subtotal`, COL_OP) +
				lpad(String(sectionCalls), COL_NUM) +
				lpad(formatMs(sectionTotal), COL_NUM) +
				lpad("", COL_NUM) +
				lpad("", COL_NUM) +
				lpad("", COL_NUM)
			);
		}
		lines.push("");

		grandTotalMs += sectionTotal;
		grandTotalCalls += sectionCalls;
	}

	addSection("Reads:", readLabels);
	addSection("Writes:", writeLabels);
	addSection("Resource I/O:", resourceLabels);

	// Include any extra labels not categorised above
	const knownLabels = new Set([...readLabels, ...writeLabels, ...resourceLabels]);
	const extraLabels = [...entries.keys()].filter((l) => !knownLabels.has(l));
	if (extraLabels.length) {
		addSection("Other:", extraLabels);
	}

	lines.push(separator);
	lines.push(
		pad("TOTAL", COL_OP) +
		lpad(String(grandTotalCalls), COL_NUM) +
		lpad(formatMs(grandTotalMs), COL_NUM)
	);
	lines.push(separator);

	log.info(lines.join("\n"));
}

/**
 * Reset all recorded timings.
 */
function reset() {
	entries.clear();
}

export default {start, end, logSummary, reset, isEnabled};
