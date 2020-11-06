const readline = require("readline");
const path = require("path");
const fs = require("fs");

function handleDependencyBump(line) {
	line = line.replace("[@ui5](https://github.com/ui5)", "@ui5");
	const moduleMatch = line.match(/Bump (@ui5\/[^\s]+).*to ([0-9.]+)/);
	if (moduleMatch) {
		const [, moduleName, moduleVersion] = moduleMatch;
		const moduleDir = path.dirname(require.resolve(moduleName));
		const changelogPath = path.join(moduleDir, "CHANGELOG.md");
		const changelog = fs.readFileSync(changelogPath, {
			encoding: "utf8"
		});
		const sectionRegExp = new RegExp(`^## \\[v${moduleVersion.replace(".", "\\.")}\\].+\\n((?:.|\\n)+?)(?=^<a )`, "m");
		const changelogMatch = changelog.match(sectionRegExp);
		if (!changelogMatch) {
			throw new Error(`Failed to find relevant changelog for ${moduleName}@${moduleVersion}`)
		}
		let versionChangelog = changelogMatch[1];
		if (versionChangelog.length > 1) { // In case of an empty changelog, we still match the newline with a length of 1
			versionChangelog = versionChangelog.replace(/^### /gm, "#### ");
			versionChangelog = versionChangelog.replace(/^./gm, "      $&");
			const repoUrl = `https://github.com/SAP/${moduleName.replace("@ui5/", "ui5-")}/tree/v${moduleVersion}`;
			line += `
    - Changes contained in [${moduleName}@${moduleVersion}](${repoUrl}):

${versionChangelog}`;
		}
	}
	return line;
}

function readStdin() {
	return new Promise((resolve, reject) => {
		const rl = readline.createInterface({
		    input: process.stdin
		});

		let buffer = "";
		rl.on("line", (line) => {
			try {
				if (line.startsWith("- Bump")) {
					buffer += `${handleDependencyBump(line)}`
				} else {
					buffer += `${line}\n`;
				}
			} catch (err) {
				reject(err)
			}
		});

		rl.on("pause", () => {
		  resolve(buffer);
		});
	});
}

readStdin().then((result) => {
	process.stdout.write(result); // Don't use console.log since one new line at the end is already enough
});
