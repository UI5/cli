/**
 * Resolve framework metadata from the reachable graph and its governing resolution context.
 * Workspace offerings are deliberately intersected with reachable framework projects, not resources.
 *
 * @private
 * @param {@ui5/project/graph/ProjectGraph} graph Project graph
 * @param {object|null} resolution Context captured after successful framework enrichment
 * @param {string} resolution.name Selected distribution name
 * @param {string} [resolution.version] Resolved distribution version
 * @param {Set<string>} resolution.workspaceProjectNames Available workspace framework projects
 * @returns {{name: string, version: string}} Effective metadata with unknown fields normalized to empty strings
 */
export default function resolveFrameworkInfo(graph, resolution) {
	const frameworkProjects = Array.from(graph.traverseDependenciesDepthFirst(true), ({project}) => project)
		.filter((project) => project.isFrameworkProject());
	const workspaceContributed = resolution && frameworkProjects
		.some((project) => resolution.workspaceProjectNames.has(project.getName()));

	if (resolution && !workspaceContributed) {
		return {name: resolution.name, version: resolution.version ?? ""};
	}

	const root = graph.getRoot();
	const name = resolution ? resolution.name : root.getFrameworkName();
	const version = resolution ? resolution.version : root.getFrameworkVersion();
	const hasSapui5 = frameworkProjects.some((project) => project.getId().startsWith("@sapui5/"));
	// A complete configuration remains a fallback, but an unenriched OpenUI5 configuration
	// cannot identify the distribution version of SAPUI5 projects found in the dependency graph.
	if (!resolution && version && (name === "SAPUI5" || (name === "OpenUI5" && !hasSapui5))) {
		return {name, version};
	}

	if (name === "SAPUI5" || hasSapui5) {
		// Never report OpenUI5 core's version as a SAPUI5 distribution version.
		return {name: "SAPUI5", version: ""};
	}
	if (name === "OpenUI5" || frameworkProjects.some((project) => project.getId().startsWith("@openui5/"))) {
		const core = frameworkProjects.find((project) => project.getName() === "sap.ui.core");
		return {name: "OpenUI5", version: core?.getVersion() ?? version ?? ""};
	}
	return {name: "", version: ""};
}
