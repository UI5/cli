// Formatter: results dir -> GitHub step summary. Two sections, never consolidated: one per-repo
// scope table, and one npm-packages table with a column per package. Writes to $GITHUB_STEP_SUMMARY
// (falls back to stdout when run locally). Read-only over the results dir — no audit logic here.

import {appendFileSync} from "node:fs";
import {
	buildRows, extractAdvisories, isMain, parseFlags, readManifest, readReport, renderMarkdownTable,
} from "./lib.mjs";

const REPO_COLUMNS = [
	{key: "prod", header: "prod · latest (ships)"},
	{key: "locked", header: "locked · ci"},
	{key: "devprod", header: "dev + prod · latest"},
];

export function buildSummary(resultsDir) {
	const records = readManifest(resultsDir);
	const out = [];

	// --- Repositories: one sub-table per repo, scopes as columns. ---
	out.push("## Security audit — repositories", "");
	const repoRecords = records.filter((r) => r.kind === "repo");
	const repoTargets = [...new Set(repoRecords.map((r) => r.target))];
	if (repoTargets.length === 0) {
		out.push("_No repositories audited._", "");
	}
	for (const target of repoTargets) {
		const perColumn = repoRecords
			.filter((r) => r.target === target)
			.map((r) => ({columnKey: r.scope, advisories: extractAdvisories(readReport(resultsDir, r), r.allow)}));
		const rows = buildRows(perColumn);
		out.push(`### ${target}`, "", renderMarkdownTable(REPO_COLUMNS, rows, {priorityKey: "prod"}), "");
	}

	// --- npm packages: one column per package (kept separate from repositories). ---
	out.push("## Security audit — npm packages", "");
	const npmRecords = records.filter((r) => r.kind === "npm");
	if (npmRecords.length === 0) {
		out.push("_No npm packages audited._", "");
	} else {
		const columns = npmRecords.map((r) => ({key: r.label, header: r.label}));
		const perColumn = npmRecords.map((r) => ({
			columnKey: r.label,
			advisories: extractAdvisories(readReport(resultsDir, r), r.allow),
		}));
		out.push(renderMarkdownTable(columns, buildRows(perColumn)), "");
	}

	out.push(
		"**How to read:** ❌ = the package/scope is affected by that advisory; ✅ = not affected." +
		" A row affected under **prod · latest** reaches a fresh install today — fix first. A row" +
		" affected only under **locked · ci** clears by refreshing the lockfile. Advisories" +
		" allowlisted in a repo's audit-ci config are excluded; npm packages are audited without an" +
		" allowlist.",
	);
	return out.join("\n");
}

if (isMain(import.meta.url)) {
	const {flags, positionals} = parseFlags(process.argv.slice(2));
	const summary = buildSummary(flags.results || positionals[0] || "audit-results");
	if (process.env.GITHUB_STEP_SUMMARY) {
		appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
	} else {
		process.stdout.write(summary + "\n");
	}
}
