// Audit a single checked-out repository in three scopes. Never fails (always exits 0).
//
//   locked   npm ci                                   -> audit-ci (dev + prod)
//   devprod  npm install (no lockfile, no modules)    -> audit-ci (dev + prod)
//   prod     same install                             -> audit-ci --skip-dev (prod only)
//
// Results are written to the results dir; whether findings fail the build is decided by gate.mjs.

import {existsSync, rmSync} from "node:fs";
import {join} from "node:path";
import {allowlistFromConfig, isMain, logGroup, parseFlags, run, slug, writeResult} from "./lib.mjs";

const CONFIG_CANDIDATES = ["audit-ci.jsonc", "audit-ci.json", ".audit-ci.jsonc", ".audit-ci.json"];

function detectConfig(cwd, override) {
	if (override) {
		return override;
	}
	for (const candidate of CONFIG_CANDIDATES) {
		if (existsSync(join(cwd, candidate))) {
			return candidate;
		}
	}
	return "";
}

export function auditRepo({label, resultsDir, cwd = process.cwd(), config}) {
	const cfg = detectConfig(cwd, config);
	const allow = cfg ? allowlistFromConfig(join(cwd, cfg)) : [];
	if (cfg) {
		logGroup(`Config — ${label}`, `using audit-ci config: ${cfg}`);
	}

	const auditScope = (scope, extraArgs = []) => {
		// audit-ci reports nothing without a severity level. A repo config sets its own level;
		// if the audited repo has no config, fall back to --low (fail on low and above).
		const levelArgs = cfg ? ["--config", cfg] : ["--low"];
		const args = ["--yes", "audit-ci", ...levelArgs, ...extraArgs, "--output-format", "json"];
		const res = run("npx", args, {cwd});
		const found = res.status !== 0;
		writeResult(resultsDir, {
			kind: "repo",
			slug: `${slug(label)}-${scope}`,
			label: `${label} · ${scope}`,
			target: label,
			scope,
			allow,
			found,
		}, {reportJson: res.stdout, log: res.stderr});
		logGroup(`Audit — ${label} · ${scope}`, found ? `✗ findings (exit ${res.status})` : "✓ passed");
	};

	// 1) Locked tree, as committed.
	logGroup(`Install (locked) — ${label}`, run("npm", ["ci", "--ignore-scripts"], {cwd}).stderr);
	auditScope("locked");

	// 2) + 3) Re-resolve every range to its latest satisfying version, then audit full and prod-only.
	rmSync(join(cwd, "node_modules"), {recursive: true, force: true});
	rmSync(join(cwd, "package-lock.json"), {force: true});
	logGroup(`Install (latest) — ${label}`,
		run("npm", ["install", "--no-audit", "--no-fund", "--ignore-scripts"], {cwd}).stderr);
	auditScope("devprod");
	auditScope("prod", ["--skip-dev"]);
}

if (isMain(import.meta.url)) {
	const {flags} = parseFlags(process.argv.slice(2));
	auditRepo({label: flags.label, resultsDir: flags.results, config: flags.config});
	process.exit(0); // never fail
}
