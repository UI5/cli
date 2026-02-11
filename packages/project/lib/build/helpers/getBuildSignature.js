import crypto from "node:crypto";

const BUILD_SIG_VERSION = "0";

export function getBaseSignature(buildConfig) {
	const key = BUILD_SIG_VERSION + JSON.stringify(buildConfig);
	return crypto.createHash("sha256").update(key).digest("hex");
}

/**
 * The build signature is calculated based on the **build configuration and environment** of a project.
 *
 * The hash is represented as a hexadecimal string to allow safe usage in file names.
 *
 * @private
 * @param {string} baseSignature
 * @param {@ui5/project/lib/Project} project The project to create the cache integrity for
 * @param {@ui5/project/lib/graph/ProjectGraph} graph The project graph
 * @param {@ui5/builder/tasks/taskRepository} taskRepository The task repository (used to determine the effective
 * versions of ui5-builder and ui5-fs)
 */
export function getProjectSignature(baseSignature, project, graph, taskRepository) {
	const key = baseSignature + project.getId() + JSON.stringify(project.getConfig());
	// TODO: Add signatures of relevant custom tasks

	// Create a hash for all metadata
	const hash = crypto.createHash("sha256").update(key).digest("hex");
	return hash;
}
