// Tree
import baseMiddleware from "../middlewares/base.js";
import chalk from "chalk";

const tree = {
	command: "tree",
	aliases: ["ls", "list"],
	describe:
		"Outputs the dependency tree of the current project to stdout. " +
		"It takes all relevant parameters of ui5 build into account.",
	middlewares: [baseMiddleware]
};

tree.builder = function(cli) {
	return cli
		.option("flat", {
			describe: "Output a flat list of all dependencies instead of a tree hierarchy",
			type: "boolean",
			default: false
		})
		.option("level", {
			describe: "Limit the number of levels shown in the tree hierarchy",
			type: "number"
		})
		.option("framework-version", {
			describe:
				"Overrides the framework version defined by the project. " +
				"Takes the same value as the version part of \"ui5 use\"",
			type: "string"
		})
		.option("cache-mode", {
			describe:
				"Cache mode to use when consuming SNAPSHOT versions of framework dependencies. " +
				"The 'Default' behavior is to invalidate the cache after 9 hours. 'Force' uses the cache only and " +
				"does not create any requests. 'Off' invalidates any existing cache and updates from the repository",
			type: "string",
			default: "Default",
			choices: ["Default", "Force", "Off"]
		});
};

tree.handler = async function(argv) {
	let startTime;
	let elapsedTime;
	if (argv.perf) {
		startTime = process.hrtime();
	}
	const {graphFromStaticFile, graphFromPackageDependencies} = await import("@ui5/project/graph");
	let graph;
	if (argv.dependencyDefinition) {
		graph = await graphFromStaticFile({
			filePath: argv.dependencyDefinition,
			versionOverride: argv.frameworkVersion,
			cacheMode: argv.cacheMode,
		});
	} else {
		graph = await graphFromPackageDependencies({
			rootConfigPath: argv.config,
			versionOverride: argv.frameworkVersion,
			cacheMode: argv.cacheMode,
			workspaceConfigPath: argv.workspaceConfig,
			workspaceName: argv.workspace === false ? null : argv.workspace,
		});
	}

	if (argv.perf) {
		elapsedTime = await getElapsedTime(startTime);
	}

	let requestedLevels;
	if (argv.level !== undefined && isNaN(argv.level)) {
		throw new Error(`The provided 'level' option is not a number`);
	} else if (argv.level !== undefined) {
		requestedLevels = argv.level;
	} else {
		requestedLevels = Infinity;
	}

	const projects = new Map();
	const indentWidth = 4;
	await graph.traverseBreadthFirst(async ({project, dependencies}) => {
		projects.set(project.getName(), {
			render: function(level, connectorIndices, lastChild, renderDeps = true) {
				let baseString = " ".repeat(level * indentWidth);
				connectorIndices.forEach((idx) => {
					baseString = `${baseString.slice(0, idx)}│${baseString.slice(idx + 1)}`;
				});
				const connectorString = lastChild ? "╰─" : "├─";
				let name = chalk.bold(project.getName());
				if (project.isFrameworkProject()) {
					name = chalk.blue(name);
				}
				console.log(
					`${baseString}${connectorString} ${name} ` +
					`${project.getNamespace() ? chalk.inverse(project.getNamespace()) + " " : ""}` +
					chalk.dim(`(${project.getVersion()}, ${project.getType()}) `) +
					chalk.dim.italic(`${project.getRootPath()}`)
				);

				const lastIdx = dependencies.length - 1;
				const newConnectorIndices = [...connectorIndices];
				if (!lastChild) {
					newConnectorIndices.push(level * indentWidth);
				}

				if (level >= requestedLevels) {
					const msg = chalk.dim.italic(`Dependencies below Level ${level} are hidden`);
					let nextBaseString = " ".repeat((level + 1) * indentWidth);
					newConnectorIndices.forEach((idx) => {
						nextBaseString = `${nextBaseString.slice(0, idx)}│${nextBaseString.slice(idx + 1)}`;
					});
					console.log(`${nextBaseString}╰─ ${msg}`);
					return;
				}
				if (renderDeps) {
					dependencies.forEach((dep, i) => {
						projects.get(dep).render(level + 1, newConnectorIndices, i === lastIdx);
					});
				}
			}
		});
	});

	console.log(chalk.bold.underline(`Dependencies (${projects.size}):`));
	if (argv.flat) {
		// Iterate over list of projects, rendering each individually
		// We need to transform the map into an array in order to know the index
		// for determining whether we are rendering the last entry (lastChild param)
		Array.from(projects.values()).forEach(({render: renderProject}, idx, arr) => {
			renderProject(0, [], idx == arr.length -1, false);
		});
	} else {
		// Recursively render the tree, starting with the first entry of the map
		projects.values().next().value.render(0, [], true);
	}
	console.log("");

	const extensionNames = graph.getExtensionNames();
	const extensionCount = extensionNames.length;
	console.log(chalk.bold.underline(`Extensions (${extensionCount}):`));
	if (extensionCount) {
		const lastIdx = extensionCount - 1;
		extensionNames.forEach((extensionName, idx) => {
			const extension = graph.getExtension(extensionName);
			const connectorString = idx === lastIdx ? "╰─" : "├─";
			console.log(
				`${connectorString} ${extensionName} ` +
				chalk.dim(`(${extension.getVersion()}, ${extension.getType()}) `) +
				chalk.dim.italic(`${extension.getRootPath()}`));
		});
	} else {
		console.log(chalk.italic(`None`));
	}
	if (argv.perf) {
		console.log("");
		console.log(chalk.blue(
			`Dependency graph generation took ${chalk.bold(elapsedTime)}`));
	}
};

async function getElapsedTime(startTime) {
	const timeDiff = process.hrtime(startTime);
	const {default: prettyHrtime} = await import("pretty-hrtime");
	return prettyHrtime(timeDiff);
}
export default tree;
