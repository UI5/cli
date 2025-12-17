import {createRequire} from "node:module";
import crypto from "node:crypto";

// Using CommonsJS require since JSON module imports are still experimental
const require = createRequire(import.meta.url);

/**
 * The build signature is calculated based on the **build configuration and environment** of a project.
 *
 * The hash is represented as a hexadecimal string to allow safe usage in file names.
 *
 * @private
 * @param {@ui5/project/lib/Project} project The project to create the cache integrity for
 * @param {@ui5/project/lib/graph/ProjectGraph} graph The project graph
 * @param {object} buildConfig The build configuration
 * @param {@ui5/builder/tasks/taskRepository} taskRepository The task repository (used to determine the effective
 * versions of ui5-builder and ui5-fs)
 */
export default async function calculateBuildSignature(project, graph, buildConfig, taskRepository) {
	const depInfo = collectDepInfo(graph, project);
	const lockfileHash = await getLockfileHash(project);
	const {builderVersion, fsVersion: builderFsVersion} = await taskRepository.getVersions();
	const projectVersion = await getVersion("@ui5/project");
	const fsVersion = await getVersion("@ui5/fs");

	const key = project.getName() + project.getVersion() +
		JSON.stringify(buildConfig) + JSON.stringify(depInfo) +
		builderVersion + projectVersion + fsVersion + builderFsVersion +
		lockfileHash;

	// Create a hash for all metadata
	const hash = crypto.createHash("sha256").update(key).digest("hex");
	return hash;
}

async function getVersion(pkg) {
	return require(`${pkg}/package.json`).version;
}

async function getLockfileHash(project) {
	const rootReader = project.getRootReader({useGitIgnore: false});
	const lockfiles = await Promise.all([
		// TODO: Search upward for lockfiles in parent directories?
		// npm
		await rootReader.byPath("/package-lock.json"),
		await rootReader.byPath("/npm-shrinkwrap.json"),
		// Yarn
		await rootReader.byPath("/yarn.lock"),
		// pnpm
		await rootReader.byPath("/pnpm-lock.yaml"),
	]);
	let hash = "";
	for (const lockfile of lockfiles) {
		if (lockfile) {
			const content = await lockfile.getBuffer();
			hash += crypto.createHash("sha256").update(content).digest("hex");
		}
	}
	return hash;
}

function collectDepInfo(graph, project) {
	let projects = [];
	for (const depName of graph.getTransitiveDependencies(project.getName())) {
		const dep = graph.getProject(depName);
		projects.push({
			name: dep.getName(),
			version: dep.getVersion()
		});
	}
	projects = projects.sort((a, b) => {
		return a.name.localeCompare(b.name);
	});

	// Collect relevant extensions
	let extensions = [];
	if (graph.getRoot() === project) {
		// Custom middleware is only relevant for root project
		project.getCustomMiddleware().forEach((middlewareDef) => {
			const extension = graph.getExtension(middlewareDef.name);
			if (extension) {
				extensions.push({
					name: extension.getName(),
					version: extension.getVersion()
				});
			}
		});
	}
	project.getCustomTasks().forEach((taskDef) => {
		const extension = graph.getExtension(taskDef.name);
		if (extension) {
			extensions.push({
				name: extension.getName(),
				version: extension.getVersion()
			});
		}
	});
	extensions = extensions.sort((a, b) => {
		return a.name.localeCompare(b.name);
	});
	return {projects, extensions};
}
