#!/usr/bin/env node

/**
 * Cache Timings Benchmark Runner
 *
 * Runs warm-cache builds with UI5_BUILD_TIMINGS=true across all cache option
 * branches and 3 test projects, then generates per-project comparison tables.
 *
 * Usage:
 *   node scripts/run-cache-timings-benchmark.mjs [--warmup N] [--runs N] [--output DIR]
 *
 * Options:
 *   --warmup N   Number of warmup runs before measuring (default: 1)
 *   --runs N     Number of measured runs to average (default: 3)
 *   --output DIR Directory for results (default: ~/Desktop/cache-timings)
 */

import {execSync} from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

// ── Configuration ──────────────────────────────────────────────────────────

const REPO_DIR = path.resolve(import.meta.dirname, "..");
const CLI_BIN = path.join(REPO_DIR, "packages/cli/bin/ui5.cjs");

const PROJECTS = [
	{name: "openui5-sample-app", dir: path.join(os.homedir(), "SAPDevelop/openui5-sample-app")},
	{name: "sap.ui.core", dir: path.join(os.homedir(), "SAPDevelop/openui5/src/sap.ui.core")},
	{name: "sap.m", dir: path.join(os.homedir(), "SAPDevelop/openui5/src/sap.m")},
];

const BRANCHES = [
	{key: "baseline", name: "Baseline (pretty JSON)", branch: "feat/incremental-build-tests"},
	{key: "option_a", name: "Option A (minified JSON)", branch: "feat/cache-option-a"},
	{key: "option_b", name: "Option B (MessagePack)", branch: "feat/cache-option-b"},
	{key: "option_c", name: "Option C (SQLite+JSON)", branch: "feat/cache-option-c"},
	{key: "option_d", name: "Option D (SQLite+MsgPack)", branch: "feat/cache-option-d"},
	{key: "option_e", name: "Option E (LevelDB+MsgPack)", branch: "feat/cache-option-e"},
	{key: "option_f", name: "Option F (Streaming JSON)", branch: "feat/cache-option-f"},
	{key: "option_g", name: "Option G (JSONL Protocol)", branch: "feat/cache-option-g"},
	{key: "option_h", name: "Option H (Pure SQLite)", branch: "feat/cache-option-h"},
	{key: "option_i", name: "Option I (Pure LevelDB)", branch: "feat/cache-option-i"},
	{key: "option_j", name: "Option J (Incremental Managers)", branch: "feat/cache-option-j"},
	{key: "option_k", name: "Option K (Flat JSON Store)", branch: "feat/cache-option-k"},
	{key: "option_l", name: "Option L (JSONL+jq Streaming)", branch: "feat/cache-option-l"},
];

// Timing labels we want to extract (in display order)
const TIMING_LABELS = [
	"readBuildManifest",
	"readIndexCache",
	"readTaskMetadata",
	"readResultMetadata",
	"readStageCache",
	"writeBuildManifest",
	"writeIndexCache",
	"writeTaskMetadata",
	"writeResultMetadata",
	"writeStageCache",
	"getResourcePathForStage",
	"writeStageResource",
];

// ── CLI argument parsing ───────────────────────────────────────────────────

const args = process.argv.slice(2);
let warmupRuns = 1;
let measuredRuns = 3;
let outputDir = path.join(os.homedir(), "Desktop/cache-timings");

for (let i = 0; i < args.length; i++) {
	if (args[i] === "--warmup" && args[i + 1]) {
		warmupRuns = parseInt(args[++i], 10);
	} else if (args[i] === "--runs" && args[i + 1]) {
		measuredRuns = parseInt(args[++i], 10);
	} else if (args[i] === "--output" && args[i + 1]) {
		outputDir = path.resolve(args[++i]);
	} else if (args[i] === "--help") {
		console.log(`Usage: node ${path.basename(import.meta.url)} [--warmup N] [--runs N] [--output DIR]`);
		process.exit(0);
	}
}

// ── Helpers ────────────────────────────────────────────────────────────────

function git(cmd) {
	return execSync(`git ${cmd}`, {cwd: REPO_DIR, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"]}).trim();
}

/**
 * Run a build and capture the combined stdout+stderr output.
 * UI5 logger writes to stderr, so we need both streams.
 */
function runBuildCapture(projectDir) {
	try {
		// Use shell to redirect stderr to stdout so we get everything
		// NO_COLOR disables chalk ANSI codes so regex parsing works reliably
		const result = execSync(
			`NO_COLOR=1 UI5_BUILD_TIMINGS=true node "${CLI_BIN}" build 2>&1`,
			{
				cwd: projectDir,
				encoding: "utf8",
				timeout: 600_000,
				shell: true,
			}
		);
		return result;
	} catch (err) {
		// Build may "fail" after success if timings cause issues — still capture output
		if (err.stdout) {
			return err.stdout;
		}
		throw err;
	}
}

/**
 * Parse "Build succeeded in X.XX s" or "Build succeeded in XXX ms" from build output.
 * Returns duration in milliseconds.
 */
function parseBuildTime(output) {
	// Pattern: "Build succeeded in 5.37 s" or "Build succeeded in 123 ms"
	const match = output.match(/Build succeeded in ([\d.]+)\s*(s|ms)/);
	if (!match) {
		return null;
	}
	const value = parseFloat(match[1]);
	return match[2] === "s" ? value * 1000 : value;
}

/**
 * Parse BuildTimings output from the build log.
 * Returns a Map of label -> {calls, totalMs, avgMs, minMs, maxMs}
 */
function parseTimings(output) {
	const timings = new Map();

	// Match lines like:
	//   readTaskMetadata                  20  283.70ms   14.18ms    2.00ms   44.56ms
	//   readIndexCache                     1   14.36ms   14.36ms   14.36ms   14.36ms
	//   getResourcePathForStage         962547848.234s    4.971s    4.959s    4.991s
	// Also handles "0        --        --        --        --"
	const lineRegex = /^\s{2}(\w+)\s+(\d+)\s+([\d.]+(?:ms|s)|--)\s+([\d.]+(?:ms|s)|--)\s+([\d.]+(?:ms|s)|--)\s+([\d.]+(?:ms|s)|--)/gm;

	let match;
	while ((match = lineRegex.exec(output)) !== null) {
		const [, label, callsStr, totalStr, avgStr, minStr, maxStr] = match;

		// Skip "Subtotal" lines
		if (label === "Subtotal") continue;

		const calls = parseInt(callsStr, 10);
		if (calls === 0) {
			timings.set(label, {calls: 0, totalMs: 0, avgMs: 0, minMs: 0, maxMs: 0});
			continue;
		}

		timings.set(label, {
			calls,
			totalMs: parseValue(totalStr),
			avgMs: parseValue(avgStr),
			minMs: parseValue(minStr),
			maxMs: parseValue(maxStr),
		});
	}

	return timings;
}

/**
 * Parse a timing value string like "14.36ms", "4.971s", or "--"
 * Returns value in milliseconds.
 */
function parseValue(str) {
	if (str === "--") return 0;
	if (str.endsWith("ms")) return parseFloat(str);
	if (str.endsWith("s")) return parseFloat(str) * 1000;
	return parseFloat(str);
}

/**
 * Format milliseconds to a human-readable string for the table.
 */
function fmtMs(ms) {
	if (ms === 0 || ms == null) return "--";
	if (ms >= 1000) return `${(ms / 1000).toFixed(3)}s`;
	if (ms < 0.01) return "<0.01ms";
	return `${ms.toFixed(1)}ms`;
}

function fmtPct(value) {
	if (value == null || Number.isNaN(value)) return "--";
	return `${value.toFixed(1)}%`;
}

function percentile(values, p) {
	if (!values.length) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.ceil((p / 100) * sorted.length) - 1;
	return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function median(values) {
	if (!values.length) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 0) {
		return (sorted[mid - 1] + sorted[mid]) / 2;
	}
	return sorted[mid];
}

/**
 * Aggregate multiple timing results.
 * Input: array of {buildTimeMs, timings: Map<label, {calls, totalMs, ...}>}
 */
function aggregateResults(results) {
	if (results.length === 0) return null;

	const buildTimes = results.map((r) => r.buildTimeMs || 0);
	const avgBuildTime = buildTimes.reduce((sum, t) => sum + t, 0) / results.length;
	const medianBuildTime = median(buildTimes);
	const p95BuildTime = percentile(buildTimes, 95);

	const avgTimings = new Map();
	for (const label of TIMING_LABELS) {
		const entries = results
			.map((r) => r.timings.get(label))
			.filter(Boolean);

		if (entries.length === 0) {
			avgTimings.set(label, {calls: 0, totalMs: 0, avgMs: 0, minMs: 0, maxMs: 0});
			continue;
		}

		avgTimings.set(label, {
			calls: Math.round(entries.reduce((s, e) => s + e.calls, 0) / entries.length),
			totalMs: entries.reduce((s, e) => s + e.totalMs, 0) / entries.length,
			avgMs: entries.reduce((s, e) => s + e.avgMs, 0) / entries.length,
			minMs: Math.min(...entries.map((e) => e.minMs)),
			maxMs: Math.max(...entries.map((e) => e.maxMs)),
		});
	}

	// Compute read subtotal and write subtotal
	const readLabels = ["readBuildManifest", "readIndexCache", "readTaskMetadata", "readResultMetadata", "readStageCache"];
	const writeLabels = ["writeBuildManifest", "writeIndexCache", "writeTaskMetadata", "writeResultMetadata", "writeStageCache"];
	const resourceLabels = ["getResourcePathForStage", "writeStageResource"];

	const readTotals = results.map((r) => readLabels.reduce((s, l) => s + (r.timings.get(l)?.totalMs || 0), 0));
	const writeTotals = results.map((r) => writeLabels.reduce((s, l) => s + (r.timings.get(l)?.totalMs || 0), 0));
	const resourceTotals = results.map((r) => resourceLabels.reduce((s, l) => s + (r.timings.get(l)?.totalMs || 0), 0));
	const metadataTotals = readTotals.map((readTotal, i) => readTotal + writeTotals[i] + resourceTotals[i]);
	const metadataShares = metadataTotals.map((metadataTotal, i) => {
		const buildTime = buildTimes[i];
		if (!buildTime) return 0;
		return (metadataTotal / buildTime) * 100;
	});

	const readTotal = readTotals.reduce((s, n) => s + n, 0) / results.length;
	const writeTotal = writeTotals.reduce((s, n) => s + n, 0) / results.length;
	const resourceTotal = resourceTotals.reduce((s, n) => s + n, 0) / results.length;
	const metadataTotal = metadataTotals.reduce((s, n) => s + n, 0) / results.length;

	return {
		buildTimeMs: avgBuildTime,
		buildTimeMedianMs: medianBuildTime,
		buildTimeP95Ms: p95BuildTime,
		timings: avgTimings,
		readTotalMs: readTotal,
		writeTotalMs: writeTotal,
		resourceTotalMs: resourceTotal,
		metadataTotalMs: metadataTotal,
		metadataSharePct: metadataShares.reduce((s, n) => s + n, 0) / results.length,
		metadataShareP95Pct: percentile(metadataShares, 95),
	};
}

// ── Markdown table generation ──────────────────────────────────────────────

function generateProjectTable(projectName, dataByBranch) {
	const branchNames = BRANCHES.map((b) => b.name);

	// Header
	const lines = [
		`## ${projectName}`,
		"",
	];

	// === Summary Table ===
	lines.push("### Summary");
	lines.push("");
	lines.push(`| Metric | ${branchNames.join(" | ")} |`);
	lines.push(`| --- | ${branchNames.map(() => "---:").join(" | ")} |`);

	// Build time row
	lines.push(
		`| **Build Time (avg)** | ${BRANCHES.map((b) => {
			const d = dataByBranch.get(b.key);
			return d ? fmtMs(d.buildTimeMs) : "N/A";
		}).join(" | ")} |`
	);

	lines.push(
		`| **Build Time (median)** | ${BRANCHES.map((b) => {
			const d = dataByBranch.get(b.key);
			return d ? fmtMs(d.buildTimeMedianMs) : "N/A";
		}).join(" | ")} |`
	);

	lines.push(
		`| **Build Time (p95)** | ${BRANCHES.map((b) => {
			const d = dataByBranch.get(b.key);
			return d ? fmtMs(d.buildTimeP95Ms) : "N/A";
		}).join(" | ")} |`
	);

	// Read total row
	lines.push(
		`| **Reads Total** | ${BRANCHES.map((b) => {
			const d = dataByBranch.get(b.key);
			return d ? fmtMs(d.readTotalMs) : "N/A";
		}).join(" | ")} |`
	);

	// Write total row
	lines.push(
		`| **Writes Total** | ${BRANCHES.map((b) => {
			const d = dataByBranch.get(b.key);
			return d ? fmtMs(d.writeTotalMs) : "N/A";
		}).join(" | ")} |`
	);

	// Resource I/O total row
	lines.push(
		`| **Resource I/O Total** | ${BRANCHES.map((b) => {
			const d = dataByBranch.get(b.key);
			return d ? fmtMs(d.resourceTotalMs) : "N/A";
		}).join(" | ")} |`
	);

	lines.push(
		`| **Metadata Total** | ${BRANCHES.map((b) => {
			const d = dataByBranch.get(b.key);
			return d ? fmtMs(d.metadataTotalMs) : "N/A";
		}).join(" | ")} |`
	);

	lines.push(
		`| **Metadata Share (avg)** | ${BRANCHES.map((b) => {
			const d = dataByBranch.get(b.key);
			return d ? fmtPct(d.metadataSharePct) : "N/A";
		}).join(" | ")} |`
	);

	lines.push(
		`| **Metadata Share (p95)** | ${BRANCHES.map((b) => {
			const d = dataByBranch.get(b.key);
			return d ? fmtPct(d.metadataShareP95Pct) : "N/A";
		}).join(" | ")} |`
	);

	lines.push("");

	// === Detailed Reads Table ===
	lines.push("### Read Operations (Total ms)");
	lines.push("");
	lines.push(`| Operation | ${branchNames.join(" | ")} |`);
	lines.push(`| --- | ${branchNames.map(() => "---:").join(" | ")} |`);

	const readOps = ["readBuildManifest", "readIndexCache", "readTaskMetadata", "readResultMetadata", "readStageCache"];
	for (const op of readOps) {
		lines.push(
			`| ${op} | ${BRANCHES.map((b) => {
				const d = dataByBranch.get(b.key);
				if (!d) return "N/A";
				const t = d.timings.get(op);
				if (!t || t.calls === 0) return "--";
				return `${fmtMs(t.totalMs)} (${t.calls}×)`;
			}).join(" | ")} |`
		);
	}
	lines.push("");

	// === Detailed Writes Table ===
	lines.push("### Write Operations (Total ms)");
	lines.push("");
	lines.push(`| Operation | ${branchNames.join(" | ")} |`);
	lines.push(`| --- | ${branchNames.map(() => "---:").join(" | ")} |`);

	const writeOps = ["writeBuildManifest", "writeIndexCache", "writeTaskMetadata", "writeResultMetadata", "writeStageCache"];
	for (const op of writeOps) {
		lines.push(
			`| ${op} | ${BRANCHES.map((b) => {
				const d = dataByBranch.get(b.key);
				if (!d) return "N/A";
				const t = d.timings.get(op);
				if (!t || t.calls === 0) return "--";
				return `${fmtMs(t.totalMs)} (${t.calls}×)`;
			}).join(" | ")} |`
		);
	}
	lines.push("");

	// === Resource I/O Table ===
	lines.push("### Resource I/O (Total ms)");
	lines.push("");
	lines.push(`| Operation | ${branchNames.join(" | ")} |`);
	lines.push(`| --- | ${branchNames.map(() => "---:").join(" | ")} |`);

	const resourceOps = ["getResourcePathForStage", "writeStageResource"];
	for (const op of resourceOps) {
		lines.push(
			`| ${op} | ${BRANCHES.map((b) => {
				const d = dataByBranch.get(b.key);
				if (!d) return "N/A";
				const t = d.timings.get(op);
				if (!t || t.calls === 0) return "--";
				return `${fmtMs(t.totalMs)} (${t.calls}×)`;
			}).join(" | ")} |`
		);
	}
	lines.push("");

	return lines.join("\n");
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
	const startBranch = git("branch --show-current");
	console.log(`Starting branch: ${startBranch}`);
	console.log(`Warmup runs: ${warmupRuns}, Measured runs: ${measuredRuns}`);
	console.log(`Output directory: ${outputDir}`);
	console.log();

	// Verify all project directories exist
	for (const project of PROJECTS) {
		if (!fs.existsSync(project.dir)) {
			console.error(`Project directory not found: ${project.dir}`);
			process.exit(1);
		}
	}

	// Ensure clean working tree
	const status = git("status --porcelain");
	if (status) {
		console.error("Working tree is not clean. Please commit or stash changes first.");
		console.error(status);
		process.exit(1);
	}

	// Data structure: projectName -> branchKey -> averaged result
	const allResults = new Map();
	for (const project of PROJECTS) {
		allResults.set(project.name, new Map());
	}

	// Raw results for JSON export
	const rawResults = [];

	const totalSteps = BRANCHES.length * PROJECTS.length * (warmupRuns + measuredRuns);
	let currentStep = 0;

	for (const branchInfo of BRANCHES) {
		console.log(`\n${"═".repeat(70)}`);
		console.log(`Switching to: ${branchInfo.branch} (${branchInfo.name})`);
		console.log(`${"═".repeat(70)}`);

		try {
			git(`checkout ${branchInfo.branch}`);
		} catch (err) {
			console.error(`  Failed to checkout ${branchInfo.branch}: ${err.message}`);
			continue;
		}

		for (const project of PROJECTS) {
			console.log(`\n  ── ${project.name} ──`);

			// Warmup runs (not measured)
			for (let w = 0; w < warmupRuns; w++) {
				currentStep++;
				const pct = ((currentStep / totalSteps) * 100).toFixed(0);
				process.stdout.write(`  [${pct}%] Warmup ${w + 1}/${warmupRuns}...`);
				try {
					runBuildCapture(project.dir);
					console.log(" done");
				} catch (err) {
					console.log(` FAILED: ${err.message}`);
				}
			}

			// Measured runs
			const runResults = [];
			for (let r = 0; r < measuredRuns; r++) {
				currentStep++;
				const pct = ((currentStep / totalSteps) * 100).toFixed(0);
				process.stdout.write(`  [${pct}%] Run ${r + 1}/${measuredRuns}...`);
				try {
					const output = runBuildCapture(project.dir);
					const buildTimeMs = parseBuildTime(output);
					const timings = parseTimings(output);

					const readLabels = ["readBuildManifest", "readIndexCache", "readTaskMetadata", "readResultMetadata", "readStageCache"];
					const writeLabels = ["writeBuildManifest", "writeIndexCache", "writeTaskMetadata", "writeResultMetadata", "writeStageCache"];
					const resourceLabels = ["getResourcePathForStage", "writeStageResource"];
					const readTotalMs = readLabels.reduce((s, l) => s + (timings.get(l)?.totalMs || 0), 0);
					const writeTotalMs = writeLabels.reduce((s, l) => s + (timings.get(l)?.totalMs || 0), 0);
					const resourceTotalMs = resourceLabels.reduce((s, l) => s + (timings.get(l)?.totalMs || 0), 0);
					const metadataTotalMs = readTotalMs + writeTotalMs + resourceTotalMs;
					const metadataSharePct = buildTimeMs ? (metadataTotalMs / buildTimeMs) * 100 : 0;

					if (buildTimeMs !== null) {
						runResults.push({buildTimeMs, timings});
						console.log(` ${fmtMs(buildTimeMs)} (${timings.size} metrics, metadata ${fmtPct(metadataSharePct)})`);
					} else {
						console.log(" no build time found in output");
					}

					// Store raw result
					rawResults.push({
						branch: branchInfo.key,
						branchName: branchInfo.name,
						project: project.name,
						run: r + 1,
						buildTimeMs,
						readTotalMs,
						writeTotalMs,
						resourceTotalMs,
						metadataTotalMs,
						metadataSharePct,
						timings: Object.fromEntries(
							[...timings.entries()].map(([k, v]) => [k, v])
						),
					});
				} catch (err) {
					console.log(` FAILED: ${err.message}`);
				}
			}

			// Aggregate the measured runs
			if (runResults.length > 0) {
				const avg = aggregateResults(runResults);
				allResults.get(project.name).set(branchInfo.key, avg);
				console.log(`  Build avg/median/p95: ${fmtMs(avg.buildTimeMs)} / ${fmtMs(avg.buildTimeMedianMs)} / ${fmtMs(avg.buildTimeP95Ms)}` +
					`, metadata share avg/p95: ${fmtPct(avg.metadataSharePct)} / ${fmtPct(avg.metadataShareP95Pct)}`);
			}
		}
	}

	// Return to original branch
	try {
		git(`checkout ${startBranch}`);
		console.log(`\nRestored branch: ${startBranch}`);
	} catch {
		console.warn(`Warning: Could not restore branch ${startBranch}`);
	}

	// ── Generate output ────────────────────────────────────────────────────

	fs.mkdirSync(outputDir, {recursive: true});
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

	// 1. Per-project markdown tables
	const reportLines = [
		`# Cache Timings Benchmark`,
		``,
		`**Generated:** ${new Date().toISOString()}`,
		`**Warmup runs:** ${warmupRuns} | **Measured runs:** ${measuredRuns}`,
		``,
	];

	for (const project of PROJECTS) {
		const dataByBranch = allResults.get(project.name);
		reportLines.push(generateProjectTable(project.name, dataByBranch));
		reportLines.push("---");
		reportLines.push("");
	}

	const reportPath = path.join(outputDir, `cache-timings-${timestamp}.md`);
	fs.writeFileSync(reportPath, reportLines.join("\n"), "utf8");
	console.log(`\nReport written to: ${reportPath}`);

	// 2. Raw JSON data
	const jsonPath = path.join(outputDir, `cache-timings-${timestamp}.json`);
	fs.writeFileSync(jsonPath, JSON.stringify(rawResults, null, 2), "utf8");
	console.log(`Raw data written to: ${jsonPath}`);

	// 3. Print summary to console
	console.log("\n" + "═".repeat(70));
	console.log("SUMMARY");
	console.log("═".repeat(70));

	for (const project of PROJECTS) {
		const dataByBranch = allResults.get(project.name);
		console.log(`\n${project.name}:`);

		const header = "  " + "Option".padEnd(30) + "Avg".padStart(10) + "Median".padStart(10) + "P95".padStart(10) + "Meta%".padStart(10);
		console.log(header);
		console.log("  " + "─".repeat(header.length - 2));

		for (const b of BRANCHES) {
			const d = dataByBranch.get(b.key);
			if (!d) {
				console.log(`  ${b.name.padEnd(30)}${"N/A".padStart(10)}${"N/A".padStart(10)}${"N/A".padStart(10)}${"N/A".padStart(10)}`);
				continue;
			}
			console.log(
				`  ${b.name.padEnd(30)}${fmtMs(d.buildTimeMs).padStart(10)}` +
				`${fmtMs(d.buildTimeMedianMs).padStart(10)}${fmtMs(d.buildTimeP95Ms).padStart(10)}` +
				`${fmtPct(d.metadataSharePct).padStart(10)}`
			);
		}
	}
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
