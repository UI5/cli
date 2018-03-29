// Tree
let tree = {
	command: "tree",
	describe: "Outputs the dependency tree of the current project to stdout. It takes all relevant parameters of ui5 build into account.",
	middlewares: [require("../middlewares/base.js")]
};

tree.builder = function(cli) {
	return cli
		.option("full", {
			describe: "Include more information (currently the project configuration)",
			type: "boolean"
		})
		.option("json", {
			describe: "Output tree as formatted JSON string",
			type: "boolean"
		})
		.example("ui5 tree > tree.txt", "Pipes the dependency tree into a new file \"tree.txt\"")
		.example("ui5 tree --json > tree.json", "Pipes the dependency tree into a new file \"tree.json\"");
};

tree.handler = function(argv) {
	const normalizer = require("@ui5/project").normalizer;
	const treeify = require("treeify");

	let p;
	if (argv.full) {
		p = normalizer.generateProjectTree({
			translator: argv.translator,
			configPath: argv.config
		});
	} else {
		p = normalizer.generateDependencyTree({
			translator: argv.translator,
			configPath: argv.config
		});
	}

	p.then(function(tree) {
		if (argv.json) {
			// Formatted JSON
			console.log(JSON.stringify(tree, null, 4));
		} else {
			// Formatted tree
			console.log(treeify.asTree(tree, true));
		}
	}).catch(function(err) {
		console.error(err);
		process.exit(1);
	});
};

module.exports = tree;
