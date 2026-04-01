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
		const result = execSync(
			`UI5_BUILD_TIMINGS=true node "${CLI_BIN}" build 2>&1`,
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

/**
 * Average multiple timing results.
 * Input: array of {buildTimeMs, timings: Map<label, {calls, totalMs, ...}>}
 */
function averageResults(results) {
	if (results.length === 0) return null;

	const avgBuildTime = results.reduce((sum, r) => sum + (r.buildTimeMs || 0), 0) / results.length;

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

	const readTotal = readLabels.reduce((s, l) => s + (avgTimings.get(l)?.totalMs || 0), 0);
	const writeTotal = writeLabels.reduce((s, l) => s + (avgTimings.get(l)?.totalMs || 0), 0);
	const resourceTotal = resourceLabels.reduce((s, l) => s + (avgTimings.get(l)?.totalMs || 0), 0);

	return {
		buildTimeMs: avgBuildTime,
		timings: avgTimings,
		readTotalMs: readTotal,
		writeTotalMs: writeTotal,
		resourceTotalMs: resourceTotal,
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
		`| **Build Time** | ${BRANCHES.map((b) => {
			const d = dataByBranch.get(b.key);
			return d ? fmtMs(d.buildTimeMs) : "N/A";
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

					if (buildTimeMs !== null) {
						runResults.push({buildTimeMs, timings});
						console.log(` ${fmtMs(buildTimeMs)} (${timings.size} metrics)`);
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
						timings: Object.fromEntries(
							[...timings.entries()].map(([k, v]) => [k, v])
						),
					});
				} catch (err) {
					console.log(` FAILED: ${err.message}`);
				}
			}

			// Average the measured runs
			if (runResults.length > 0) {
				const avg = averageResults(runResults);
				allResults.get(project.name).set(branchInfo.key, avg);
				console.log(`  Average build time: ${fmtMs(avg.buildTimeMs)}, ` +
					`reads: ${fmtMs(avg.readTotalMs)}, writes: ${fmtMs(avg.writeTotalMs)}`);
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

		const header = "  " + "Option".padEnd(30) + "Build Time".padStart(12) + "Reads".padStart(12) + "Writes".padStart(12);
		console.log(header);
		console.log("  " + "─".repeat(header.length - 2));

		for (const b of BRANCHES) {
			const d = dataByBranch.get(b.key);
			if (!d) {
				console.log(`  ${b.name.padEnd(30)}${"N/A".padStart(12)}${"N/A".padStart(12)}${"N/A".padStart(12)}`);
				continue;
			}
			console.log(
				`  ${b.name.padEnd(30)}${fmtMs(d.buildTimeMs).padStart(12)}` +
				`${fmtMs(d.readTotalMs).padStart(12)}${fmtMs(d.writeTotalMs).padStart(12)}`
			);
		}
	}
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
