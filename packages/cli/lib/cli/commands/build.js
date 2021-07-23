// Build

const baseMiddleware = require("../middlewares/base.js");
const buildHelper = require("../../utils/buildHelper");

const build = {
	command: "build",
	describe: "Build project in current directory",
	handler: handleBuild,
	middlewares: [baseMiddleware]
};

build.builder = function(cli) {
	return cli
		.command("dev", "Dev build: Skips non-essential and time-intensive tasks during build", {
			handler: handleBuild,
			builder: noop,
			middlewares: [baseMiddleware]
		})
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
			"Recommended to be used in conjunction with --all", {
				handler: handleBuild,
				builder: noop,
				middlewares: [baseMiddleware]
			})
		.option("all", {
			describe: "Include all project dependencies into build process",
			alias: "a",
			default: false,
			type: "boolean"
		})
		.option("include-dependency", {
			describe: "A list of dependencies to be included into the build process. You can use the asterisk '*' as" +
				" an alias for including all dependencies into the build process. The listed dependencies cannot be" +
				" overruled by dependencies defined in 'exclude-dependency'.",
			type: "array"
		})
		.option("include-dependency-regexp", {
			describe: "A list of regular expressions defining dependencies to be included into the build process." +
				" This list is prioritized like 'include-dependency'.",
			type: "array"
		})
		.option("include-dependency-tree", {
			describe: "A list of dependencies to be included into the build process. Transitive dependencies are" +
				" implicitly included and do not need to be part of this list. These dependencies overrule" +
				" the selection of 'exclude-dependency-tree' but can be overruled by 'exclude-dependency'.",
			type: "array"
		})
		.option("exclude-dependency", {
			describe: "A list of dependencies to be excluded from the build process. The listed dependencies can" +
				" be overruled by dependencies defined in 'include-dependency'.",
			type: "array"
		})
		.option("exclude-dependency-regexp", {
			describe: "A list of regular expressions defining dependencies to be excluded from the build process." +
				" This list is prioritized like 'exclude-dependency'.",
			type: "array"
		})
		.option("exclude-dependency-tree", {
			describe: "A list of dependencies to be excluded from the build process. Transitive dependencies are" +
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
		.option("dev-exclude-project", {
			describe:
				"A list of specific projects to be excluded from dev mode " +
				"(dev mode must be active for this to be effective)",
			type: "array"
		})
		.option("include-task", {
			describe: "A list of specific tasks to be included to the default/dev set",
			type: "array"
		})
		.option("exclude-task", {
			describe: "A list of specific tasks to be excluded from default/dev set",
			type: "array"
		})
		.option("framework-version", {
			describe: "Overrides the framework version defined by the project",
			type: "string"
		})
		.example("ui5 build", "Preload build for project without dependencies")
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
			"Build project and dependencies in dev mode. Only a set of essential tasks is executed.");
};

async function handleBuild(argv) {
	const normalizer = require("@ui5/project").normalizer;
	const builder = require("@ui5/builder").builder;
	const logger = require("@ui5/logger");

	const command = argv._[argv._.length - 1];
	logger.setShowProgress(true);

	const normalizerOptions = {
		translatorName: argv.translator,
		configPath: argv.config
	};

	if (argv.frameworkVersion) {
		normalizerOptions.frameworkOptions = {
			versionOverride: argv.frameworkVersion
		};
	}

	const tree = await normalizer.generateProjectTree(normalizerOptions);
	const buildSettings = (tree.builder && tree.builder.settings) || {};

	const {includedDependencies, excludedDependencies} = buildHelper.createDependencyLists({
		tree: tree,
		includeDependency: argv["include-dependency"],
		includeDependencyRegExp: argv["include-dependency-regexp"],
		includeDependencyTree: argv["include-dependency-tree"],
		excludeDependency: argv["exclude-dependency"],
		excludeDependencyRegExp: argv["exclude-dependency-regexp"],
		excludeDependencyTree: argv["exclude-dependency-tree"],
		defaultIncludeDependency: buildSettings.includeDependency,
		defaultIncludeDependencyRegExp: buildSettings.includeDependencyRegExp,
		defaultIncludeDependencyTree: buildSettings.includeDependencyTree
	});
	const buildAll = buildHelper.alignWithBuilderApi(argv.all, includedDependencies, excludedDependencies);

	await builder.build({
		tree: tree,
		destPath: argv.dest,
		cleanDest: argv["clean-dest"],
		buildDependencies: buildAll,
		includedDependencies: includedDependencies,
		excludedDependencies: excludedDependencies,
		dev: command === "dev",
		selfContained: command === "self-contained",
		jsdoc: command === "jsdoc",
		devExcludeProject: argv["dev-exclude-project"],
		includedTasks: argv["include-task"],
		excludedTasks: argv["exclude-task"]
	});
}

function noop() {}

module.exports = build;
