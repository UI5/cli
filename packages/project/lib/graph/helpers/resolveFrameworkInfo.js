/**
 * Resolve framework metadata from the reachable graph and its governing resolution context.
 * Workspace offerings are deliberately intersected with reachable framework projects, not resources.
 *
 * A configured or resolved framework name is authoritative and is never overridden by graph
 * evidence. Graph evidence only selects a name when none is configured, and otherwise only
 * determines the effective version. For OpenUI5 the reachable sap.ui.core version always fills in a
 * missing version before giving up.
 *
 * @private
 * @param {@ui5/project/graph/ProjectGraph} graph Project graph
 * @param {object|null} resolution Context captured after successful framework enrichment
 * @param {string} resolution.name Selected distribution name
 * @param {string} [resolution.version] Resolved distribution version
 * @param {Set<string>} [resolution.workspaceProjectNames] Available workspace framework projects
 * @returns {{name: string, version: string}} Effective metadata with unknown fields normalized to empty strings
 */
export default function resolveFrameworkInfo(graph, resolution) {
	const frameworkProjects = Array.from(graph.traverseDependenciesDepthFirst(true), ({project}) => project)
		.filter((project) => project.isFrameworkProject());
	const root = graph.getRoot();

	// A configured or resolved framework name is authoritative and must never be changed by graph
	// evidence. Only when no name is known is it derived from the graph: any @sapui5/ project means
	// SAPUI5; otherwise any @openui5/ project means OpenUI5.
	let name = resolution ? resolution.name : root.getFrameworkName();
	if (name !== "SAPUI5" && name !== "OpenUI5") {
		if (frameworkProjects.some((project) => project.getId().startsWith("@sapui5/"))) {
			name = "SAPUI5";
		} else if (frameworkProjects.some((project) => project.getId().startsWith("@openui5/"))) {
			name = "OpenUI5";
		} else {
			return {name: "", version: ""};
		}
	}

	// The configured/resolved version (enrichment already applied --framework-version and config).
	const configuredVersion = resolution?.version ?? root.getFrameworkVersion();
	// A workspace only governs the version when one of its offered framework projects is actually
	// reachable; mere availability does not count. Offered names live inside the resolution context,
	// so an absent resolution yields an empty set and no contribution.
	const workspaceProjectNames = resolution?.workspaceProjectNames ?? new Set();
	const workspaceContributed = frameworkProjects.some((project) => workspaceProjectNames.has(project.getName()));

	if (name === "SAPUI5") {
		// A workspace contribution leaves no reliable SAPUI5 distribution version, and an OpenUI5
		// core version must never be reported as a SAPUI5 distribution version.
		return {name, version: workspaceContributed ? "" : (configuredVersion ?? "")};
	}

	// OpenUI5: the framework version IS sap.ui.core's version. However it is resolved — ui5.yaml, a
	// --framework-version override, or a workspace link — the resolver installs/links sap.ui.core at
	// that version and joins it into the graph, so the reachable core carries the effective version.
	// The configured version is only a fallback for when core is not part of the graph.
	const coreVersion = frameworkProjects
		.find((project) => project.getName() === "sap.ui.core")?.getVersion();
	return {name, version: coreVersion ?? configuredVersion ?? ""};
}
