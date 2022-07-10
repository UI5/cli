// Build

const baseMiddleware = require("../middlewares/base.js");

const build = {
	command: "build",
	describe: "Build project in current directory",
	handler: handleBuild,
	middlewares: [baseMiddleware]
};

build.builder = function(cli) {
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
			"Recommended to be used in conjunction with --include-dependencies", {
				handler: handleBuild,
				builder: noop,
				middlewares: [baseMiddleware]
			})
		.option("include-all-dependencies", {
			describe: "Include all dependencies in the build result",
			alias: ["all", "a"],
			default: false,
			type: "boolean"
		})
		.option("include-dependency", {
			describe: "A list of dependencies to be included in the build result. You can use the asterisk '*' as" +
				" an alias for including all dependencies in the build result. The listed dependencies cannot be" +
				" overruled by dependencies defined in 'exclude-dependency'.",
			type: "array"
		})
		.option("include-dependency-regexp", {
			describe: "A list of regular expressions defining dependencies to be included in the build result." +
				" This list is prioritized like 'include-dependency'.",
			type: "array"
		})
		.option("include-dependency-tree", {
			describe: "A list of dependencies to be included in the build result. Transitive dependencies are" +
				" implicitly included and do not need to be part of this list. These dependencies overrule" +
				" the selection of 'exclude-dependency-tree' but can be overruled by 'exclude-dependency'.",
			type: "array"
		})
		.option("exclude-dependency", {
			describe: "A list of dependencies to be excluded from the build result. The listed dependencies can" +
				" be overruled by dependencies defined in 'include-dependency'.",
			type: "array"
		})
		.option("exclude-dependency-regexp", {
			describe: "A list of regular expressions defining dependencies to be excluded from the build result." +
				" This list is prioritized like 'exclude-dependency'.",
			type: "array"
		})
		.option("exclude-dependency-tree", {
			describe: "A list of dependencies to be excluded from the build result. Transitive dependencies are" +
				" implicitly included and do not need to be part of this list.",
			type: "array"
		})
		.option("dest", {
			describe: "Path of build destination",
			default: "./dist",
			type: "string"
		})
		.option("clean-dest", {
			describe: "If present, clean the destination directory before building",
			default: false,
			type: "boolean"
		})
		.option("create-build-manifest", {
			describe: "Store build metadata in a '.ui5' directory in the build destination, " +
				"allowing reuse of the build result in other builds",
			default: false,
			type: "boolean"
		})
		.option("include-task", {
			describe: "A list of tasks to be added to the default execution set. " +
				"This option takes precedence over any excludes.",
			type: "array"
		})
		.option("exclude-task", {
			describe: "A list of tasks to be excluded from the default task execution set",
			type: "array"
		})
		.option("framework-version", {
			describe: "Overrides the framework version defined by the project",
			type: "string"
		})
		.option("experimental-css-variables", {
			describe:
				"Generate CSS variables (css-variables.css, css-variables.source.less)" +
				" and skeleton (library-skeleton(-RTL).css) for all themes",
			default: false,
			type: "boolean"
		})
		.example("ui5 build", "Preload build for project without dependencies")

		// TODO 3.0: Update examples
		.example("ui5 build self-contained --all", "Self-contained build for project including dependencies")
		.example("ui5 build --all --exclude-task=* --include-task=createDebugFiles generateAppPreload",
			"Build project and dependencies but only apply the createDebugFiles- and generateAppPreload tasks")
		.example("ui5 build --all --include-task=createDebugFiles --exclude-task=generateAppPreload",
			"Build project and dependencies by applying all default tasks including the createDebugFiles " +
			"task and excluding the generateAppPreload task")
		.example("ui5 build dev --all --dev-exclude-project=sap.ui.core sap.m",
			"Build project and dependencies in dev mode, except \"sap.ui.core\" and \"sap.m\" " +
			"(useful in combination with --include-task)")
		.example("ui5 build dev",
			"Build project and dependencies in dev mode. Only a set of essential tasks is executed.")
		.example("ui5 build --experimental-css-variables",
			"Preload build for project without dependencies but with CSS variable artifacts");
};

async function handleBuild(argv) {
	const logger = require("@ui5/logger");
	const {generateProjectGraph} = require("@ui5/project");

	const command = argv._[argv._.length - 1];
	logger.setShowProgress(true);

	let graph;
	if (argv.dependencyDefinition) {
		graph = await generateProjectGraph.usingStaticFile({
			filePath: argv.dependencyDefinition,
			rootConfigPath: argv.config,
			versionOverride: argv.frameworkVersion
		});
	} else {
		graph = await generateProjectGraph.usingNodePackageDependencies({
			rootConfigPath: argv.config,
			versionOverride: argv.frameworkVersion
		});
	}
	const buildSettings = graph.getRoot().getBuilderSettings() || {};
	await graph.build({
		graph,
		destPath: argv.dest,
		cleanDest: argv["clean-dest"],
		createBuildManifest: argv["create-build-manifest"],
		complexDependencyIncludes: {
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
		cssVariables: argv["experimental-css-variables"]
	});
}

function noop() {}

module.exports = build;
