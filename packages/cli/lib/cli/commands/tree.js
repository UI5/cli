// Tree
import baseMiddleware from "../middlewares/base.js";
import chalk from "chalk";

const tree = {
	command: "tree",
	describe:
		"Outputs the dependency tree of the current project to stdout. " +
		"It takes all relevant parameters of ui5 build into account.",
	middlewares: [baseMiddleware]
};

tree.builder = function(cli) {
	return cli
		.option("framework-version", {
			describe:
				"Overrides the framework version defined by the project",
			type: "string"
		});
};

tree.handler = async function(argv) {
	let startTime;
	let elapsedTime;
	if (argv.xPerf) {
		startTime = process.hrtime();
	}
	const {graphFromStaticFile, graphFromPackageDependencies} = await import("@ui5/project/graph");
	let graph;
	if (argv.dependencyDefinition) {
		graph = await graphFromStaticFile({
			filePath: argv.dependencyDefinition,
			versionOverride: argv.frameworkVersion
		});
	} else {
		graph = await graphFromPackageDependencies({
			rootConfigPath: argv.config,
			versionOverride: argv.frameworkVersion
		});
	}

	if (argv.xPerf) {
		elapsedTime = await getElapsedTime(startTime);
	}

	const projects = {};
	const indentWidth = 4;
	await graph.traverseBreadthFirst(async ({project, getDependencies}) => {
		const deps = getDependencies().map((dep) => {
			return dep.getName();
		});
		projects[project.getName()] = {
			render: function(indentation, connectorIndices, lastChild) {
				let baseString = " ".repeat(indentation * indentWidth);
				connectorIndices.forEach((idx) => {
					baseString = `${baseString.slice(0, idx)}│${baseString.slice(idx + 1)}`;
				});
				const connectorString = lastChild ? "╰─" : "├─";
				console.log(
					`${baseString}${connectorString} ${chalk.bold(project.getName())} ` +
					`${project.getNamespace ? chalk.inverse(project.getNamespace()) + " " : ""}` +
					chalk.dim(`(${project.getVersion()}, ${project.getType()}) `) +
					chalk.dim.italic(`${project.getPath()}`)
				);

				const lastIdx = deps.length -1;
				const newConnectorIndices = [...connectorIndices];
				if (!lastChild) {
					newConnectorIndices.push(indentation * indentWidth);
				}
				deps.forEach((dep, i) => {
					projects[dep].render(indentation + 1, newConnectorIndices, i === lastIdx);
				});
			}
		};
	});

	const projectKeys = Object.keys(projects);
	console.log(chalk.bold.underline(`Dependencies (${projectKeys.length}):`));
	projects[projectKeys[0]].render(0, [], true);
	console.log("");

	const extensions = graph.getAllExtensions();
	console.log(chalk.bold.underline(`Extensions (${extensions.length}):`));
	if (extensions.length) {
		extensions.forEach((extension) => {
			console.log(
				`├─ ${extension.getName()} ` +
				chalk.dim(`(${extension.getVersion()}, ${extension.getType()}) `) +
				chalk.dim.italic(`${extension.getPath()}`));
		});
	} else {
		console.log(chalk.italic(`None`));
	}
	if (argv.xPerf) {
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
