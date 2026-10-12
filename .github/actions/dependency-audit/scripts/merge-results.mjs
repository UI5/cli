// Merge per-job result artifacts into one results dir for the summary job. Each matrix job uploads
// its own results dir as an artifact; actions/download-artifact places them under <input>/<name>/.
// This concatenates every manifest.jsonl and overlays the repo/ and npm/ result files into <output>.

import {appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync} from "node:fs";
import {join} from "node:path";
import {isMain, parseFlags} from "./lib.mjs";

export function mergeResults({input, output}) {
	mkdirSync(output, {recursive: true});
	const subdirs = existsSync(input) ?
		readdirSync(input, {withFileTypes: true}).filter((d) => d.isDirectory()).map((d) => d.name) :
		[];
	for (const sub of subdirs) {
		const base = join(input, sub);
		const manifest = join(base, "manifest.jsonl");
		if (existsSync(manifest)) {
			appendFileSync(join(output, "manifest.jsonl"), readFileSync(manifest, "utf8"));
		}
		for (const kind of ["repo", "npm"]) {
			const src = join(base, kind);
			if (existsSync(src)) {
				cpSync(src, join(output, kind), {recursive: true});
			}
		}
	}
}

if (isMain(import.meta.url)) {
	const {flags} = parseFlags(process.argv.slice(2));
	mergeResults({input: flags.input || "dl", output: flags.output || "audit-results"});
}
