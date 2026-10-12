// Gate: exit non-zero when any audit record reported findings. Run AFTER a formatter, so the
// summary is always written first. This is the only place build pass/fail is decided.

import {isMain, parseFlags, readManifest} from "./lib.mjs";

if (isMain(import.meta.url)) {
	const {flags, positionals} = parseFlags(process.argv.slice(2));
	const resultsDir = flags.results || positionals[0] || "audit-results";
	const findings = readManifest(resultsDir).filter((r) => r.found);
	if (findings.length > 0) {
		const prefix = process.env.GITHUB_ACTIONS ? "::error::" : "";
		console.error(`${prefix}Dependency audit reported findings in ${findings.length} scope(s):`);
		for (const f of findings) {
			console.error(`  - ${f.label}`);
		}
		process.exit(1);
	}
	console.log("No audit findings.");
	process.exit(0);
}
