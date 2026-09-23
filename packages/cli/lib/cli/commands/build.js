import {createRequire} from "node:module";
import baseMiddleware from "../middlewares/base.js";
import {applyProjectConfigOptions, applyWorkspaceOptions, dedupeArray} from "../options.js";
import {applyCommandMetadata} from "../commandMetadata.js";
import {getLogger} from "@ui5/logger";
const log = getLogger("cli:commands:build");

const require = createRequire(import.meta.url);
const metadata = require("./build.json");

const build = {
	command: metadata.command,
	describe: metadata.describe,
	handler: handleBuild,
	middlewares: [baseMiddleware]
};

build.builder = function(cli) {
	applyCommandMetadata(cli, metadata);
	applyProjectConfigOptions(cli);
	applyWorkspaceOptions(cli);
	return cli
		.command("jsdoc", "Build JSDoc resources", {
			handler: handleBuild,
			builder: noop,
			middlewares: [baseMiddleware]
		})
		.command("preload", "(default) Build project and create preload bundles", {
			handler: handleBuild,
			builder: noop,
			middlewares: [baseMiddleware]
		})
		.command("self-contained",
			"Build project and create self-contained bundle. " +
			"Recommended to be used in conjunction with --include-all-dependencies", {
				handler: handleBuild,
				builder: noop,
				middlewares: [baseMiddleware]
			})
		.coerce("cache", (opt) => {
			opt = dedupeArray(opt);
			const lower = opt.toLowerCase();
			if (lower === "readonly" || lower === "read-only") {
				return "ReadOnly";
			}
			return lower.charAt(0).toUpperCase() + lower.slice(1);
		})
		.coerce("cache-mode", (opt) => {
			opt = dedupeArray(opt);
			// Log a warning if this option is used
			if (opt !== undefined) {
				log.warn("As of UI5 CLI version 5, '--cache-mode' is renamed to '--snapshot-cache'. " +
					"Use '--snapshot-cache' to control this behavior.");
			}
			return opt;
		})
		.coerce("output-style", (opt) => {
			opt = dedupeArray(opt);
			return opt.charAt(0).toUpperCase() + opt.slice(1).toLowerCase();
		})
		.coerce(["framework-version", "dest"], dedupeArray);
};

async function handleBuild(argv) {
	const {graphFromStaticFile, graphFromPackageDependencies} = await import("@ui5/project/graph");

	const command = argv._[argv._.length - 1];

	let graph;
	if (argv.dependencyDefinition) {
		graph = await graphFromStaticFile({
			filePath: argv.dependencyDefinition,
			rootConfigPath: argv.config,
			versionOverride: argv.frameworkVersion,
			snapshotCache: argv.snapshotCache ?? argv.cacheMode ?? "Default", // Use cacheMode as fallback
		});
	} else {
		graph = await graphFromPackageDependencies({
			rootConfigPath: argv.config,
			versionOverride: argv.frameworkVersion,
			snapshotCache: argv.snapshotCache ?? argv.cacheMode ?? "Default", // Use cacheMode as fallback
			workspaceConfigPath: argv.workspaceConfig,
			workspaceName: argv.workspace === false ? null : argv.workspace,
		});
	}
	const buildSettings = graph.getRoot().getBuilderSettings() || {};
	await graph.build({
		graph,
		destPath: argv.dest,
		cleanDest: argv["clean-dest"],
		createBuildManifest: argv["create-build-manifest"],
		dependencyIncludes: {
			includeAllDependencies: argv["include-all-dependencies"],
			includeDependency: argv["include-dependency"],
			includeDependencyRegExp: argv["include-dependency-regexp"],
			includeDependencyTree: argv["include-dependency-tree"],
			excludeDependency: argv["exclude-dependency"],
			excludeDependencyRegExp: argv["exclude-dependency-regexp"],
			excludeDependencyTree: argv["exclude-dependency-tree"],
			defaultIncludeDependency: buildSettings.includeDependency,
			defaultIncludeDependencyRegExp: buildSettings.includeDependencyRegExp,
			defaultIncludeDependencyTree: buildSettings.includeDependencyTree
		},
		selfContained: command === "self-contained",
		jsdoc: command === "jsdoc",
		includedTasks: argv["include-task"],
		excludedTasks: argv["exclude-task"],
		outputStyle: argv["output-style"],
		cache: argv["cache"],
	});
}

function noop() {}

export default build;
