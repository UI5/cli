// Tree
const tree = {
	command: "tree",
	describe:
		"Outputs the dependency tree of the current project to stdout. " +
		"It takes all relevant parameters of ui5 build into account.",
	middlewares: [require("../middlewares/base.js")]
};

tree.builder = function(cli) {
	return cli
		.option("full", {
			describe: "Include more information (currently the project configuration)",
			default: false,
			type: "boolean"
		})
		.option("json", {
			describe: "Output tree as formatted JSON string",
			default: false,
			type: "boolean"
		})
		.option("dedupe", {
			describe: "Remove duplicate projects from project tree",
			default: false,
			type: "boolean"
		})
		.option("framework-version", {
			describe:
				"Overrides the framework version defined by the project. Only supported in combination with --full",
			type: "string"
		}).check((argv) => {
			if (argv.frameworkVersion && !argv.full) {
				throw new Error(`"framework-version" can only be used in combination with option "--full"`);
			} else {
				return true;
			}
		})
		.example("ui5 tree > tree.txt", "Pipes the dependency tree into a new file \"tree.txt\"")
		.example("ui5 tree --json > tree.json", "Pipes the dependency tree into a new file \"tree.json\"");
};

tree.handler = async function(argv) {
	const normalizer = require("@ui5/project").normalizer;
	const treeify = require("treeify");

	const options = {
		translatorName: argv.translator,
		translatorOptions: {
			includeDeduped: !argv.dedupe
		},
		configPath: argv.config
	};

	if (argv.frameworkVersion ) {
		options.frameworkOptions = {
			versionOverride: argv.frameworkVersion
		};
	}

	let projectTree;
	if (argv.full) {
		projectTree = await normalizer.generateProjectTree(options);
	} else {
		projectTree = await normalizer.generateDependencyTree(options);
	}

	const output = argv.json ? JSON.stringify(projectTree, null, 4) : treeify.asTree(projectTree, true);
	console.log(output);
};

module.exports = tree;
