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
		.command("self-contained", "Build project and create self-contained bundle", {
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
			describe: "A list of specific projects to be excluded from dev mode (dev mode must be active for this to be effective)",
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
		.example("ui5 build --all", "Preload build for project and dependencies to \"./dist\"")
		.example("ui5 build --all --exclude-task=* --include-task=createDebugFiles generateAppPreload",
			"Build project and dependencies but only apply the createDebugFiles- and generateAppPreload tasks")
		.example("ui5 build --all --include-task=createDebugFiles --exclude-task=generateAppPreload",
			"Build project and dependencies by applying all default tasks including the createDebugFiles task and excluding the generateAppPreload task")
		.example("ui5 build dev --all --dev-exclude-project=sap.ui.core sap.m",
			"Build project and dependencies in dev mode, except \"sap.ui.core\" and \"sap.m\" (useful in combination with --include-task)")
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
	await builder.build({
		tree: tree,
		destPath: argv.dest,
		cleanDest: argv["clean-dest"],
		buildDependencies: argv.all,
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
