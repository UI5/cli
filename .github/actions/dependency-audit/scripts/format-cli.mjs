// Formatter: results dir -> plain-text report on stdout, for Jenkins consoles and local runs.
// Same input contract as format-github.mjs; keeps repositories and npm packages separate.

import {extractAdvisories, isMain, parseFlags, readManifest, readReport} from "./lib.mjs";

function describe(advisories) {
	if (advisories.length === 0) {
		return "none";
	}
	return advisories.map((a) => `${a.severity}:${a.pkg} (${a.id})`).join(", ");
}

export function buildCliReport(resultsDir) {
	const records = readManifest(resultsDir);
	const out = ["=== Security audit — repositories ==="];

	const repoRecords = records.filter((r) => r.kind === "repo");
	const repoTargets = [...new Set(repoRecords.map((r) => r.target))];
	if (repoTargets.length === 0) {
		out.push("  (none audited)");
	}
	for (const target of repoTargets) {
		out.push(`\n# ${target}`);
		for (const r of repoRecords.filter((rec) => rec.target === target)) {
			out.push(`  [${r.scope}] ${describe(extractAdvisories(readReport(resultsDir, r), r.allow))}`);
		}
	}

	out.push("\n=== Security audit — npm packages ===");
	const npmRecords = records.filter((r) => r.kind === "npm");
	if (npmRecords.length === 0) {
		out.push("  (none audited)");
	}
	for (const r of npmRecords) {
		out.push(`  ${r.label} [${r.target}] ${describe(extractAdvisories(readReport(resultsDir, r), r.allow))}`);
	}
	return out.join("\n");
}

if (isMain(import.meta.url)) {
	const {flags, positionals} = parseFlags(process.argv.slice(2));
	process.stdout.write(buildCliReport(flags.results || positionals[0] || "audit-results") + "\n");
}
