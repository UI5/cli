// Audit published npm packages. For each spec: create an empty project in a throwaway dir OUTSIDE
// the repo, install the spec, and audit the resulting tree — so the scan reflects what consumers
// get from `npm install <spec>` today, not this repo's source. Never fails (always exits 0).
//
// Standalone npm audits run WITHOUT an audit-ci config (raw view of published packages).

import {mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {isMain, logGroup, parseFlags, run, slug, writeResult} from "./lib.mjs";

export function auditNpm({label, resultsDir, specs}) {
	for (const spec of specs) {
		const columnLabel = specs.length === 1 ? label : `${label} (${spec})`;
		const work = mkdtempSync(join(tmpdir(), "audit-npm-"));
		try {
			writeFileSync(join(work, "package.json"),
				JSON.stringify({name: "audit-temp", version: "0.0.0", private: true}) + "\n");

			const install = run("npm", ["install", "--no-audit", "--no-fund", "--ignore-scripts", spec], {cwd: work});
			let reportJson = "";
			let log = install.stderr;
			let found;
			if (install.status !== 0) {
				// An install failure is itself a problem the gate should surface.
				found = true;
				log += `\n✗ install of ${spec} failed (exit ${install.status})`;
			} else {
				// audit-ci reports NOTHING unless a severity level is set. The repo config uses
				// "low"; standalone npm audits have no config, so pass --low explicitly to match
				// (fail on low and above — everything `npm audit` surfaces).
				const res = run("npx", ["--yes", "audit-ci", "--low", "--output-format", "json"], {cwd: work});
				reportJson = res.stdout;
				log += res.stderr;
				found = res.status !== 0;
			}

			writeResult(resultsDir, {
				kind: "npm",
				slug: slug(columnLabel),
				label: columnLabel,
				target: spec,
				scope: "installed",
				allow: [],
				found,
			}, {reportJson, log});
			logGroup(`Audit — ${columnLabel} (${spec})`, found ? "✗ findings / install error" : "✓ passed");
		} finally {
			rmSync(work, {recursive: true, force: true});
		}
	}
}

if (isMain(import.meta.url)) {
	const {flags, positionals} = parseFlags(process.argv.slice(2));
	auditNpm({label: flags.label, resultsDir: flags.results, specs: positionals});
	process.exit(0); // never fail
}
