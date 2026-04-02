#!/usr/bin/env node

/**
 * Serve Timings Benchmark Runner
 *
 * Measures warm-cache startup performance of `ui5 serve` across all cache option
 * branches. For each run the script:
 *   1. Spawns `ui5 serve --port 0` with UI5_BUILD_TIMINGS=true
 *   2. Waits for the "URL: http://localhost:<port>" line (server listening)
 *   3. Makes an HTTP GET to trigger on-demand build of the root project
 *   4. Waits for the "Build succeeded in N ms" line
 *   5. Captures build time and cache timing metrics
 *   6. Kills the child process
 *
 * Usage:
 *   node scripts/run-serve-timings-benchmark.mjs [options]
 *
 * Options:
 *   --warmup N        Number of warmup runs before measuring (default: 1)
 *   --runs N          Number of measured runs to average (default: 3)
 *   --output DIR      Directory for results (default: ~/Desktop/serve-timings)
 *   --branches KEYS   Comma-separated branch keys to test (default: all)
 *   --projects NAMES  Comma-separated project names to test (default: all)
 *   --timeout MS      Max time to wait for build per run (default: 120000)
 */

import {spawn, execSync} from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import http from "node:http";

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
let outputDir = path.join(os.homedir(), "Desktop/serve-timings");
let branchFilter = null;
let projectFilter = null;
let timeoutMs = 120_000;

for (let i = 0; i < args.length; i++) {
	if (args[i] === "--warmup" && args[i + 1]) {
		warmupRuns = parseInt(args[++i], 10);
	} else if (args[i] === "--runs" && args[i + 1]) {
		measuredRuns = parseInt(args[++i], 10);
	} else if (args[i] === "--output" && args[i + 1]) {
		outputDir = path.resolve(args[++i]);
	} else if (args[i] === "--branches" && args[i + 1]) {
		branchFilter = new Set(args[++i].split(","));
	} else if (args[i] === "--projects" && args[i + 1]) {
		projectFilter = new Set(args[++i].split(","));
	} else if (args[i] === "--timeout" && args[i + 1]) {
		timeoutMs = parseInt(args[++i], 10);
	} else if (args[i] === "--help") {
		console.log([
			`Usage: node ${path.basename(import.meta.url)} [options]`,
			"",
			"Options:",
			"  --warmup N        Number of warmup runs (default: 1)",
			"  --runs N          Number of measured runs (default: 3)",
			"  --output DIR      Output directory (default: ~/Desktop/serve-timings)",
			"  --branches KEYS   Comma-separated branch keys (default: all)",
			"  --projects NAMES  Comma-separated project names (default: all)",
			"  --timeout MS      Max wait time per run in ms (default: 120000)",
		].join("\n"));
		process.exit(0);
	}
}

const selectedBranches = branchFilter
	? BRANCHES.filter((b) => branchFilter.has(b.key))
	: BRANCHES;

const selectedProjects = projectFilter
	? PROJECTS.filter((p) => projectFilter.has(p.name))
	: PROJECTS;

// ── Helpers ────────────────────────────────────────────────────────────────

function git(cmd) {
	return execSync(`git ${cmd}`, {
		cwd: REPO_DIR, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
	}).trim();
}

/**
 * Make an HTTP GET request and return the status code.
 * Used to trigger on-demand build by requesting a resource.
 */
function httpGet(url) {
	return new Promise((resolve, reject) => {
		const req = http.get(url, (res) => {
			res.resume(); // Drain the response body
			resolve(res.statusCode);
		});
		req.on("error", reject);
		req.setTimeout(timeoutMs, () => {
			req.destroy(new Error("HTTP request timed out"));
		});
	});
}

/**
 * Spawn `ui5 serve`, wait for server to listen, trigger a build via HTTP,
 * capture output until "Build succeeded", then kill the process.
 *
 * Returns: {buildTimeMs, serverReadyMs, totalMs, output, timings}
 *   - serverReadyMs: time from spawn to server listening
 *   - buildTimeMs:   extracted from "Build succeeded in N ms"
 *   - totalMs:       time from spawn to "Build succeeded"
 */
function runServeCapture(projectDir) {
	return new Promise((resolve, reject) => {
		const startTime = performance.now();
		let output = "";
		let port = null;
		let buildSucceeded = false;
		let settled = false;

		const child = spawn("node", [CLI_BIN, "serve", "--port", "0"], {
			cwd: projectDir,
			env: {
				...process.env,
				UI5_BUILD_TIMINGS: "true",
				// Force colour off so log parsing is reliable
				NO_COLOR: "1",
				FORCE_COLOR: "0",
			},
			stdio: ["pipe", "pipe", "pipe"],
		});

		const timer = setTimeout(() => {
			if (!settled) {
				settled = true;
				child.kill("SIGKILL");
				reject(new Error(
					`Timed out after ${timeoutMs}ms. Output so far:\n${output.slice(-800)}`
				));
			}
		}, timeoutMs);

		let serverReadyMs = null;

		function processLine(line) {
			output += line + "\n";

			// Detect "URL: http://localhost:<port>" → extract port and record server-ready time
			const urlMatch = line.match(/URL:\s*https?:\/\/localhost:(\d+)/);
			if (urlMatch && !port) {
				port = parseInt(urlMatch[1], 10);
				serverReadyMs = performance.now() - startTime;

				// Trigger on-demand build by requesting a resource from the root project
				httpGet(`http://localhost:${port}/index.html`).catch(() => {
					// Request may fail if the server shuts down before response — that's OK.
				});
			}

			// Detect "Build succeeded in N ms" or "Build succeeded in N.NN s"
			const buildMatch = line.match(/Build succeeded in ([\d.]+)\s*(s|ms)/);
			if (buildMatch && !buildSucceeded) {
				buildSucceeded = true;
				const totalMs = performance.now() - startTime;
				const value = parseFloat(buildMatch[1]);
				const buildTimeMs = buildMatch[2] === "s" ? value * 1000 : value;

				// Wait a brief moment to capture any trailing timing-table output
				setTimeout(() => {
					if (!settled) {
						settled = true;
						clearTimeout(timer);
						killChild(child);
						resolve({
							buildTimeMs,
							serverReadyMs,
							totalMs,
							output,
							timings: parseTimings(output),
						});
					}
				}, 500);
			}
		}

		child.stdout.on("data", (data) => {
			for (const line of data.toString().split("\n")) {
				if (line.trim()) processLine(line.trim());
			}
		});

		child.stderr.on("data", (data) => {
			for (const line of data.toString().split("\n")) {
				if (line.trim()) processLine(line.trim());
			}
		});

		child.on("error", (err) => {
			if (!settled) {
				settled = true;
				clearTimeout(timer);
				reject(err);
			}
		});

		child.on("exit", (code) => {
			if (!settled) {
				settled = true;
				clearTimeout(timer);
				reject(new Error(
					`Process exited with code ${code} before build succeeded.\nOutput:\n${output.slice(-1000)}`
				));
			}
		});
	});
}

function killChild(child) {
	try {
		child.kill("SIGTERM");
	} catch {
		// Already dead
	}
	// Force kill after 1 second if SIGTERM didn't work
	setTimeout(() => {
		try {
			child.kill("SIGKILL");
		} catch {
			// Already dead
		}
	}, 1000);
}

/**
 * Parse BuildTimings output from the serve log.
 * Returns a Map of label -> {calls, totalMs, avgMs, minMs, maxMs}
 */
function parseTimings(output) {
	const timings = new Map();

	const lineRegex =
		/^\s{2}(\w+)\s+(\d+)\s+([\d.]+(?:ms|s)|--)\s+([\d.]+(?:ms|s)|--)\s+([\d.]+(?:ms|s)|--)\s+([\d.]+(?:ms|s)|--)/gm;

	let match;
	while ((match = lineRegex.exec(output)) !== null) {
		const [, label, callsStr, totalStr, avgStr, minStr, maxStr] = match;
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

function parseValue(str) {
	if (str === "--") return 0;
	if (str.endsWith("ms")) return parseFloat(str);
	if (str.endsWith("s")) return parseFloat(str) * 1000;
	return parseFloat(str);
}

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

function median(values) {
	if (!values.length) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentile(values, p) {
	if (!values.length) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.ceil((p / 100) * sorted.length) - 1;
	return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function aggregateResults(results) {
	if (results.length === 0) return null;

	const buildTimes = results.map((r) => r.buildTimeMs || 0);
	const serverReadyTimes = results.map((r) => r.serverReadyMs || 0);
	const totalTimes = results.map((r) => r.totalMs || 0);

	const avgTimings = new Map();
	for (const label of TIMING_LABELS) {
		const entries = results.map((r) => r.timings.get(label)).filter(Boolean);
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

	const readLabels = [
		"readBuildManifest", "readIndexCache", "readTaskMetadata",
		"readResultMetadata", "readStageCache",
	];
	const writeLabels = [
		"writeBuildManifest", "writeIndexCache", "writeTaskMetadata",
		"writeResultMetadata", "writeStageCache",
	];
	const resourceLabels = ["getResourcePathForStage", "writeStageResource"];

	const readTotals = results
		.map((r) => readLabels.reduce((s, l) => s + (r.timings.get(l)?.totalMs || 0), 0));
	const writeTotals = results
		.map((r) => writeLabels.reduce((s, l) => s + (r.timings.get(l)?.totalMs || 0), 0));
	const resourceTotals = results
		.map((r) => resourceLabels.reduce((s, l) => s + (r.timings.get(l)?.totalMs || 0), 0));
	const metadataTotals = readTotals.map((r, i) => r + writeTotals[i] + resourceTotals[i]);
	const metadataShares = metadataTotals
		.map((mt, i) => buildTimes[i] ? (mt / buildTimes[i]) * 100 : 0);

	return {
		buildTimeMs: buildTimes.reduce((s, t) => s + t, 0) / results.length,
		buildTimeMedianMs: median(buildTimes),
		buildTimeP95Ms: percentile(buildTimes, 95),
		serverReadyMs: serverReadyTimes.reduce((s, t) => s + t, 0) / results.length,
		serverReadyMedianMs: median(serverReadyTimes),
		totalMs: totalTimes.reduce((s, t) => s + t, 0) / results.length,
		totalMedianMs: median(totalTimes),
		timings: avgTimings,
		readTotalMs: readTotals.reduce((s, n) => s + n, 0) / results.length,
		writeTotalMs: writeTotals.reduce((s, n) => s + n, 0) / results.length,
		resourceTotalMs: resourceTotals.reduce((s, n) => s + n, 0) / results.length,
		metadataTotalMs: metadataTotals.reduce((s, n) => s + n, 0) / results.length,
		metadataSharePct: metadataShares.reduce((s, n) => s + n, 0) / results.length,
		metadataShareP95Pct: percentile(metadataShares, 95),
	};
}

// ── Markdown table generation ──────────────────────────────────────────────

function generateProjectTable(projectName, dataByBranch, branches) {
	const branchNames = branches.map((b) => b.name);
	const lines = [`## ${projectName}`, ""];

	// === Summary Table ===
	lines.push("### Summary", "");
	lines.push(`| Metric | ${branchNames.join(" | ")} |`);
	lines.push(`| --- | ${branchNames.map(() => "---:").join(" | ")} |`);

	const metrics = [
		["**Build Time (avg)**", (d) => fmtMs(d.buildTimeMs)],
		["**Build Time (median)**", (d) => fmtMs(d.buildTimeMedianMs)],
		["**Build Time (p95)**", (d) => fmtMs(d.buildTimeP95Ms)],
		["**Server Ready (avg)**", (d) => fmtMs(d.serverReadyMs)],
		["**Server Ready (median)**", (d) => fmtMs(d.serverReadyMedianMs)],
		["**Total (spawn→build done)**", (d) => fmtMs(d.totalMs)],
		["**Total (median)**", (d) => fmtMs(d.totalMedianMs)],
		["**Reads Total**", (d) => fmtMs(d.readTotalMs)],
		["**Writes Total**", (d) => fmtMs(d.writeTotalMs)],
		["**Resource I/O Total**", (d) => fmtMs(d.resourceTotalMs)],
		["**Metadata Total**", (d) => fmtMs(d.metadataTotalMs)],
		["**Metadata Share (avg)**", (d) => fmtPct(d.metadataSharePct)],
		["**Metadata Share (p95)**", (d) => fmtPct(d.metadataShareP95Pct)],
	];

	for (const [label, fmt] of metrics) {
		lines.push(`| ${label} | ${branches.map((b) => {
			const d = dataByBranch.get(b.key);
			return d ? fmt(d) : "N/A";
		}).join(" | ")} |`);
	}
	lines.push("");

	// === Detailed Operations Tables ===
	const sections = [
		{
			title: "Read Operations (Total ms)",
			ops: ["readBuildManifest", "readIndexCache", "readTaskMetadata",
				"readResultMetadata", "readStageCache"],
		},
		{
			title: "Write Operations (Total ms)",
			ops: ["writeBuildManifest", "writeIndexCache", "writeTaskMetadata",
				"writeResultMetadata", "writeStageCache"],
		},
		{
			title: "Resource I/O (Total ms)",
			ops: ["getResourcePathForStage", "writeStageResource"],
		},
	];

	for (const {title, ops} of sections) {
		lines.push(`### ${title}`, "");
		lines.push(`| Operation | ${branchNames.join(" | ")} |`);
		lines.push(`| --- | ${branchNames.map(() => "---:").join(" | ")} |`);

		for (const op of ops) {
			lines.push(`| ${op} | ${branches.map((b) => {
				const d = dataByBranch.get(b.key);
				if (!d) return "N/A";
				const t = d.timings.get(op);
				if (!t || t.calls === 0) return "--";
				return `${fmtMs(t.totalMs)} (${t.calls}×)`;
			}).join(" | ")} |`);
		}
		lines.push("");
	}

	return lines.join("\n");
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
	const startBranch = git("branch --show-current");
	console.log(`Starting branch: ${startBranch}`);
	console.log(`Warmup runs: ${warmupRuns}, Measured runs: ${measuredRuns}, Timeout: ${timeoutMs}ms`);
	console.log(`Branches: ${selectedBranches.map((b) => b.key).join(", ")}`);
	console.log(`Projects: ${selectedProjects.map((p) => p.name).join(", ")}`);
	console.log(`Output directory: ${outputDir}`);
	console.log();

	// Verify project directories exist
	for (const project of selectedProjects) {
		if (!fs.existsSync(project.dir)) {
			console.error(`Project directory not found: ${project.dir}`);
			process.exit(1);
		}
	}

	// Ensure no uncommitted modifications (new/staged files for *this* script are OK)
	const status = git("status --porcelain");
	const dirtyLines = status.split("\n").filter((l) => {
		if (!l) return false;
		// Allow untracked, newly added, or added-then-modified files
		if (l.startsWith("?? ") || l.startsWith("A ") || l.startsWith("AM ")) return false;
		return true;
	});
	if (dirtyLines.length) {
		console.error("Working tree has uncommitted modifications. Please commit or stash changes first.");
		console.error(dirtyLines.join("\n"));
		process.exit(1);
	}

	// Data: projectName -> branchKey -> aggregated result
	const allResults = new Map();
	for (const project of selectedProjects) {
		allResults.set(project.name, new Map());
	}

	const rawResults = [];
	const totalSteps = selectedBranches.length * selectedProjects.length * (warmupRuns + measuredRuns);
	let currentStep = 0;

	for (const branchInfo of selectedBranches) {
		console.log(`\n${"═".repeat(70)}`);
		console.log(`Switching to: ${branchInfo.branch} (${branchInfo.name})`);
		console.log(`${"═".repeat(70)}`);

		try {
			git(`checkout ${branchInfo.branch}`);
		} catch (err) {
			console.error(`  Failed to checkout ${branchInfo.branch}: ${err.message}`);
			continue;
		}

		for (const project of selectedProjects) {
			console.log(`\n  ── ${project.name} ──`);

			// Warmup: run `ui5 build` first to ensure cache is populated,
			// then a serve warmup cycle
			for (let w = 0; w < warmupRuns; w++) {
				currentStep++;
				const pct = ((currentStep / totalSteps) * 100).toFixed(0);

				process.stdout.write(`  [${pct}%] Warmup ${w + 1}/${warmupRuns} (build)...`);
				try {
					execSync(
						`UI5_BUILD_TIMINGS=true node "${CLI_BIN}" build 2>&1`,
						{cwd: project.dir, encoding: "utf8", timeout: 600_000, shell: true}
					);
					console.log(" done");
				} catch (err) {
					console.log(` FAILED: ${(err.message || "").slice(0, 100)}`);
				}

				process.stdout.write(`  [${pct}%] Warmup ${w + 1}/${warmupRuns} (serve)...`);
				try {
					await runServeCapture(project.dir);
					console.log(" done");
				} catch (err) {
					console.log(` FAILED: ${(err.message || "").slice(0, 100)}`);
				}
			}

			// Measured runs
			const runResults = [];
			for (let r = 0; r < measuredRuns; r++) {
				currentStep++;
				const pct = ((currentStep / totalSteps) * 100).toFixed(0);
				process.stdout.write(`  [${pct}%] Run ${r + 1}/${measuredRuns}...`);
				try {
					const result = await runServeCapture(project.dir);
					runResults.push(result);
					console.log(
						` build=${fmtMs(result.buildTimeMs)}` +
						` srvReady=${fmtMs(result.serverReadyMs)}` +
						` total=${fmtMs(result.totalMs)}`
					);

					rawResults.push({
						branch: branchInfo.key,
						branchName: branchInfo.name,
						project: project.name,
						run: r + 1,
						buildTimeMs: result.buildTimeMs,
						serverReadyMs: result.serverReadyMs,
						totalMs: result.totalMs,
						timings: Object.fromEntries([...result.timings.entries()]),
					});
				} catch (err) {
					console.log(` FAILED: ${(err.message || "").slice(0, 100)}`);
				}
			}

			// Aggregate
			if (runResults.length > 0) {
				const avg = aggregateResults(runResults);
				allResults.get(project.name).set(branchInfo.key, avg);
				console.log(
					`  Summary: build avg/med/p95: ${fmtMs(avg.buildTimeMs)} / ` +
					`${fmtMs(avg.buildTimeMedianMs)} / ${fmtMs(avg.buildTimeP95Ms)} ` +
					`| srvReady: ${fmtMs(avg.serverReadyMs)} ` +
					`| total: ${fmtMs(avg.totalMs)} ` +
					`| meta%: ${fmtPct(avg.metadataSharePct)}`
				);
			}
		}
	}

	// Restore original branch
	try {
		git(`checkout ${startBranch}`);
		console.log(`\nRestored branch: ${startBranch}`);
	} catch {
		console.warn(`Warning: Could not restore branch ${startBranch}`);
	}

	// ── Generate output ────────────────────────────────────────────────────

	fs.mkdirSync(outputDir, {recursive: true});
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

	// Markdown report
	const reportLines = [
		"# Serve Timings Benchmark",
		"",
		`**Generated:** ${new Date().toISOString()}`,
		`**Warmup runs:** ${warmupRuns} | **Measured runs:** ${measuredRuns}`,
		"",
		"Measures time from `ui5 serve` spawn → HTTP request → `Build succeeded`.",
		"",
	];

	for (const project of selectedProjects) {
		const dataByBranch = allResults.get(project.name);
		reportLines.push(generateProjectTable(project.name, dataByBranch, selectedBranches));
		reportLines.push("---", "");
	}

	const reportPath = path.join(outputDir, `serve-timings-${timestamp}.md`);
	fs.writeFileSync(reportPath, reportLines.join("\n"), "utf8");
	console.log(`\nReport written to: ${reportPath}`);

	// Raw JSON
	const jsonPath = path.join(outputDir, `serve-timings-${timestamp}.json`);
	fs.writeFileSync(jsonPath, JSON.stringify(rawResults, null, 2), "utf8");
	console.log(`Raw data written to: ${jsonPath}`);

	// Console summary
	console.log("\n" + "═".repeat(80));
	console.log("SUMMARY (ui5 serve — warm cache)");
	console.log("═".repeat(80));

	for (const project of selectedProjects) {
		const dataByBranch = allResults.get(project.name);
		console.log(`\n${project.name}:`);

		const header = "  " + "Option".padEnd(38) +
			"Build".padStart(10) + "SrvReady".padStart(10) +
			"Total".padStart(10) + "Meta%".padStart(8);
		console.log(header);
		console.log("  " + "─".repeat(header.length - 2));

		for (const b of selectedBranches) {
			const d = dataByBranch.get(b.key);
			if (!d) {
				console.log(
					`  ${b.name.padEnd(38)}` +
					`${"N/A".padStart(10)}${"N/A".padStart(10)}` +
					`${"N/A".padStart(10)}${"N/A".padStart(8)}`
				);
				continue;
			}
			console.log(
				`  ${b.name.padEnd(38)}` +
				`${fmtMs(d.buildTimeMedianMs).padStart(10)}` +
				`${fmtMs(d.serverReadyMedianMs).padStart(10)}` +
				`${fmtMs(d.totalMedianMs).padStart(10)}` +
				`${fmtPct(d.metadataSharePct).padStart(8)}`
			);
		}
	}
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
