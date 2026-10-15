// Shared helpers for the dependency-audit scripts.
//
// Node built-ins only: these scripts run inside *other* checked-out repositories and in throwaway
// install dirs, so they must never depend on this repo's node_modules. `audit-ci` is fetched at
// run time via `npx --yes audit-ci`.

import {spawnSync} from "node:child_process";
import {appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {pathToFileURL} from "node:url";

export const SEVERITY_RANK = {critical: 0, high: 1, moderate: 2, low: 3, info: 4};

// True when this module file is the process entry point (i.e. run directly, not imported).
export function isMain(importMetaUrl) {
	return importMetaUrl === pathToFileURL(process.argv[1]).href;
}

// Minimal flag parser: "--key value" pairs plus bare positionals. No external dependency.
export function parseFlags(argv) {
	const flags = {};
	const positionals = [];
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg.startsWith("--")) {
			flags[arg.slice(2)] = argv[i + 1];
			i++;
		} else {
			positionals.push(arg);
		}
	}
	return {flags, positionals};
}

// Run a command, capturing output. Never throws on a non-zero exit — the caller inspects `status`.
export function run(cmd, args, opts = {}) {
	const res = spawnSync(cmd, args, {encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts});
	return {
		status: res.status ?? (res.error ? 1 : 0),
		stdout: res.stdout ?? "",
		stderr: res.stderr ?? "",
		error: res.error,
	};
}

export function isGitHub() {
	return Boolean(process.env.GITHUB_ACTIONS);
}

// Fold a block in the GitHub Actions log; plain passthrough elsewhere (Jenkins/CLI stay readable).
export function logGroup(title, body = "") {
	if (isGitHub()) {
		process.stdout.write(`::group::${title}\n${body}\n::endgroup::\n`);
	} else {
		process.stdout.write(`----- ${title} -----\n${body ? body + "\n" : ""}`);
	}
}

export function slug(text) {
	return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Parse JSON that may contain // and /* */ comments (audit-ci.jsonc), keeping "http://" intact.
export function parseJsonc(text) {
	const stripped = text
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/(^|[^:])\/\/.*$/gm, "$1");
	return JSON.parse(stripped);
}

// Advisory ids the given audit-ci config allowlists (the part before any "|path"). [] if no config.
export function allowlistFromConfig(configPath) {
	if (!configPath || !existsSync(configPath)) {
		return [];
	}
	try {
		const cfg = parseJsonc(readFileSync(configPath, "utf8"));
		return (cfg.allowlist || []).map((entry) => String(entry).split("|")[0]);
	} catch {
		return [];
	}
}

// Normalise an audit-ci JSON report into a deduped advisory list, dropping allowlisted ids.
export function extractAdvisories(report, allow = []) {
	const advisories = (report && report.advisories) || {};
	const bySlug = new Map();
	for (const entry of Object.values(advisories)) {
		const via = Array.isArray(entry?.via) ? entry.via : [];
		for (const item of via) {
			if (!item || typeof item !== "object") {
				continue;
			}
			const url = item.url || "";
			const id = (url || `src-${item.source}`).replace(/.*\//, "");
			if (allow.includes(id)) {
				continue;
			}
			if (!bySlug.has(id)) {
				bySlug.set(id, {id, pkg: item.name, severity: item.severity, url});
			}
		}
	}
	return [...bySlug.values()];
}

// Append one result: <kind>/<slug>.json (report), <kind>/<slug>.log, and a manifest.jsonl line.
export function writeResult(resultsDir, record, {reportJson = "", log = ""} = {}) {
	const relJson = join(record.kind, `${record.slug}.json`);
	const relLog = join(record.kind, `${record.slug}.log`);
	mkdirSync(join(resultsDir, record.kind), {recursive: true});
	writeFileSync(join(resultsDir, relJson), reportJson);
	writeFileSync(join(resultsDir, relLog), log);
	appendFileSync(join(resultsDir, "manifest.jsonl"), JSON.stringify({...record, json: relJson, log: relLog}) + "\n");
}

export function readManifest(resultsDir) {
	const file = join(resultsDir, "manifest.jsonl");
	if (!existsSync(file)) {
		return [];
	}
	return readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

export function readReport(resultsDir, record) {
	const path = join(resultsDir, record.json);
	if (!existsSync(path)) {
		return null;
	}
	const text = readFileSync(path, "utf8").trim();
	if (!text) {
		return null;
	}
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

// Collapse per-column advisory lists into rows keyed by advisory id, each with a presence Set.
// perColumn: [{columnKey, advisories: [{id, pkg, severity, url}]}]
export function buildRows(perColumn) {
	const rows = new Map();
	for (const {columnKey, advisories} of perColumn) {
		for (const adv of advisories) {
			if (!rows.has(adv.id)) {
				rows.set(adv.id, {...adv, present: new Set()});
			}
			rows.get(adv.id).present.add(columnKey);
		}
	}
	return [...rows.values()];
}

// Render a Markdown table. columns: [{key, header}]. priorityKey: rows present there sort first.
export function renderMarkdownTable(columns, rows, {priorityKey} = {}) {
	const head = ["Advisory", "Package", "Severity", ...columns.map((c) => c.header)];
	const align = ["---", "---", "---", ...columns.map(() => ":--:")];
	const lines = [`| ${head.join(" | ")} |`, `| ${align.join(" | ")} |`];
	if (rows.length === 0) {
		lines.push(`| _none_ |${" |".repeat(head.length - 1)}`);
		return lines.join("\n");
	}
	const sorted = [...rows].sort((a, b) => {
		if (priorityKey) {
			const pa = a.present.has(priorityKey) ? 0 : 1;
			const pb = b.present.has(priorityKey) ? 0 : 1;
			if (pa !== pb) {
				return pa - pb;
			}
		}
		const sr = (SEVERITY_RANK[a.severity] ?? 4) - (SEVERITY_RANK[b.severity] ?? 4);
		return sr !== 0 ? sr : a.id.localeCompare(b.id);
	});
	for (const row of sorted) {
		const adv = row.url ? `[${row.id}](${row.url})` : row.id;
		// ❌ = advisory present (affected / fails the check), ✅ = not present (clean).
		const cells = columns.map((c) => (row.present.has(c.key) ? "❌" : "✅"));
		lines.push(`| ${adv} | \`${row.pkg}\` | ${row.severity} | ${cells.join(" | ")} |`);
	}
	return lines.join("\n");
}
