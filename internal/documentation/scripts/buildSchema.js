import path from "node:path";
import {fileURLToPath} from "node:url";
import {writeFile, mkdir} from "node:fs/promises";
import {$RefParser} from "@apidevtools/json-schema-ref-parser";
import traverse from "traverse";

// Read the given CLI parameter to determine in which mode to run the script:
// - workspace (default): Use @ui5/project from local workspace (packages/project)
// - gh-pages: Use published version of @ui5/project from npm (downloaded via "downloadPackages.sh" beforehand)
const MODE = process.argv[2] || "workspace";

try {
	// Determine base URL for resolving schema files based on the mode
	let BASE_URL;
	if (MODE === "workspace") {
		BASE_URL = import.meta.resolve(`@ui5/project/package.json`);
	} else if (MODE === "gh-pages") {
		BASE_URL = new URL("../tmp/packages/@ui5/project/package.json", import.meta.url);
	} else {
		throw new Error(`Unknown mode: '${MODE}'. Supported modes are 'workspace' and 'gh-pages'.`);
	}

	console.log(`Building JSON Schema files in mode '${MODE}' using package at: ${BASE_URL}`);

	// Use ui5.yaml.json and ui5-workspace.yaml.json
	const schemaNames = ["ui5", "ui5-workspace"];

	schemaNames.forEach(async (schemaName) => {
		const SOURCE_SCHEMA_PATH = fileURLToPath(
			new URL(`./lib/validation/schema/${schemaName}.json`, BASE_URL)
		);
		const TARGET_SCHEMA_PATH = fileURLToPath(
			new URL(`../schema/${schemaName}.yaml.json`, import.meta.url)
		);

		const parser = new $RefParser();
		const schema = await parser.bundle(SOURCE_SCHEMA_PATH);

		// Remove $id from all nodes and $schema / $comment from all except the root node.
		// Defining $id on the root is not required and as the URL will be a different one it might even cause issues.
		// $schema only needs to be defined once per file.
		traverse(schema).forEach(function(v) {
			// eslint-disable-next-line no-invalid-this
			const traverseContext = this;
			if (v && typeof v === "object" && !Array.isArray(v)) {
				if (v.$id) {
					delete v.$id;
				}
				if (!traverseContext.isRoot) {
					if (v.$schema) {
						delete v.$schema;
					}
					if (v.$comment) {
						delete v.$comment;
					}
				}
				traverseContext.update(v);
			}
		});

		await mkdir(path.dirname(TARGET_SCHEMA_PATH), {recursive: true});
		await writeFile(TARGET_SCHEMA_PATH, JSON.stringify(schema, null, 2));

		console.log(`Wrote bundled ${schemaName}.yaml schema file to ${TARGET_SCHEMA_PATH}`);
	});
} catch (error) {
	console.log(error);
	process.exit(1);
}

