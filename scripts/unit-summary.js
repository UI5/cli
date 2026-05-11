import {exec} from "node:child_process";
import {readFileSync, readdirSync, existsSync} from "node:fs";
import {join, resolve} from "node:path";

const rootDir = resolve(import.meta.dirname, "..");
const rootPkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));

const workspaceDirs = rootPkg.workspaces.flatMap((pattern) => {
	const base = pattern.replace("/*", "");
	const dir = join(rootDir, base);
	if (!existsSync(dir)) return [];
	return readdirSync(dir, {withFileTypes: true})
		.filter((d) => d.isDirectory())
		.map((d) => join(dir, d.name));
});

const workspaces = workspaceDirs
	.map((dir) => {
		const pkgPath = join(dir, "package.json");
		if (!existsSync(pkgPath)) return null;
		const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
		if (!pkg.scripts?.unit) return null;
		return {name: pkg.name, dir};
	})
	.filter(Boolean);

function runWorkspace(ws) {
	return new Promise((resolve) => {
		exec(`npm run unit --workspace=${ws.name}`, {
			cwd: rootDir,
			encoding: "utf8",
			maxBuffer: 50 * 1024 * 1024,
		}, (err, stdout, stderr) => {
			if (err) {
				resolve({name: ws.name, passed: false, output: stdout});
			} else {
				resolve({name: ws.name, passed: true});
			}
		});
	});
}

console.log(`Running unit tests across ${workspaces.length} workspaces in parallel...\n`);

const results = await Promise.all(workspaces.map(runWorkspace));

for (const r of results) {
	if (r.passed) {
		console.log(`  ${r.name} \x1b[32m✓\x1b[0m`);
	} else {
		console.log(`  ${r.name} \x1b[31m✗\x1b[0m`);
	}
}

const failures = results.filter((r) => !r.passed);
const passes = results.filter((r) => r.passed);

if (failures.length > 0) {
	for (const f of failures) {
		console.log(`\n\x1b[31m${"━".repeat(60)}\x1b[0m`);
		console.log(`\x1b[31m  Failures: ${f.name}\x1b[0m`);
		console.log(`\x1b[31m${"━".repeat(60)}\x1b[0m\n`);
		console.log(f.output);
	}
}

const failedInfo = failures.length > 0 ? ` (${failures.map((f) => f.name).join(", ")})` : "";
const summaryLine = `  Unit Test Summary: ${passes.length} passed, ${failures.length} failed${failedInfo}`;
const frameWidth = Math.max(60, summaryLine.length + 2);
console.log(`\n${"═".repeat(frameWidth)}`);
console.log(`  Unit Test Summary: \x1b[32m${passes.length} passed` +
	`\x1b[0m, \x1b[31m${failures.length} failed\x1b[0m${failedInfo}`);
console.log(`${"═".repeat(frameWidth)}`);

process.exitCode = failures.length > 0 ? 1 : 0;
