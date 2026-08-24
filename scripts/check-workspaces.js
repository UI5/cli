import {execSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const rootDir = resolve(import.meta.dirname, "..");
const rootPkg = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8"));
const workspaces = JSON.parse(execSync("npm query .workspace --json", {cwd: rootDir, encoding: "utf8"}));

// Each check receives a workspace package descriptor (as returned by `npm query`) and returns
// an error message string when the package violates the rule, or a falsy value when it passes.
const checks = [
	{
		name: `All workspace packages "engines" are consistent with root package.json`,
		check(pkg) {
			if (JSON.stringify(pkg.engines) !== JSON.stringify(rootPkg.engines)) {
				return `${pkg.location}/package.json "engines" mismatch with root package.json`;
			}
		},
	},
	{
		// Dependabot picks the commit message type ("deps" vs. "build(deps-dev)") from whether an
		// update targets "dependencies" or "devDependencies". It does not treat our internal,
		// unpublished (private) packages any differently, so a production dependency there would
		// produce a misleading "deps" commit. Internal packages are never published, so all their
		// dependencies belong in "devDependencies".
		name: "No internal package declares production dependencies",
		check(pkg) {
			if (!pkg.location.startsWith("internal/")) return;
			const prodDeps = Object.keys(pkg.dependencies ?? {});
			if (prodDeps.length > 0) {
				return `${pkg.location}/package.json declares production "dependencies" ` +
					`(${prodDeps.join(", ")}). Internal packages must declare all dependencies as "devDependencies".`;
			}
		},
	},
];

let hasError = false;
for (const {name, check} of checks) {
	const errors = workspaces.map(check).filter(Boolean);
	if (errors.length > 0) {
		hasError = true;
		for (const error of errors) {
			console.error(`❌ ${error}`);
		}
	} else {
		console.log(`✅ ${name}`);
	}
}

process.exitCode = hasError ? 1 : 0;
