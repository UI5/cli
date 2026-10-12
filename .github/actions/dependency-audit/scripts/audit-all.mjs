// Orchestration driver shared by GitHub Actions and Jenkins (DRY): read targets.json, optionally
// narrow with --only, clone each repo target to a throwaway dir and audit it, and audit each npm
// target. Produces results only — formatting (format-*.mjs) and gating (gate.mjs) are separate.
// Never exits non-zero itself; a clone failure is recorded as a finding so the gate catches it.

import {mkdtempSync, readFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {isMain, parseFlags, run, slug, writeResult} from "./lib.mjs";
import {auditRepo} from "./audit-repo.mjs";
import {auditNpm} from "./audit-npm.mjs";

export function runAll({targetsFile, resultsDir, only}) {
	const targets = JSON.parse(readFileSync(targetsFile, "utf8"));
	const wanted = only && only.length ? new Set(only) : null;
	const enabled = (target) => !wanted || wanted.has(target.id);

	for (const repo of (targets.repos || []).filter(enabled)) {
		const label = `${repo.repository}@${repo.ref}`;
		const url = repo.url || `https://github.com/${repo.repository}`;
		const work = mkdtempSync(join(tmpdir(), "audit-repo-"));
		try {
			// --ignore-scripts is irrelevant to clone; the audits themselves use it. Shallow + single ref.
			const clone = run("git", ["clone", "--depth", "1", "--branch", repo.ref, url, work]);
			if (clone.status !== 0) {
				writeResult(resultsDir, {
					kind: "repo", slug: `${slug(label)}-clone`, label: `${label} · clone`,
					target: label, scope: "clone", allow: [], found: true,
				}, {log: `✗ git clone failed for ${url}@${repo.ref}\n${clone.stderr}`});
				continue;
			}
			auditRepo({label, resultsDir, cwd: work});
		} finally {
			rmSync(work, {recursive: true, force: true});
		}
	}

	for (const pkg of (targets.npm || []).filter(enabled)) {
		auditNpm({label: pkg.label, resultsDir, specs: [pkg.spec]});
	}
}

if (isMain(import.meta.url)) {
	const {flags} = parseFlags(process.argv.slice(2));
	runAll({
		targetsFile: flags.targets || "targets.json",
		resultsDir: flags.results || "audit-results",
		only: flags.only ? flags.only.split(",").map((s) => s.trim()).filter(Boolean) : null,
	});
	process.exit(0); // never fail — gate.mjs decides build status
}
