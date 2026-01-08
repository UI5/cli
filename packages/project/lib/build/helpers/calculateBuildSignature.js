import crypto from "node:crypto";

// Using CommonsJS require since JSON module imports are still experimental
const BUILD_CACHE_VERSION = "0";

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
	const key = BUILD_CACHE_VERSION + project.getName() +
		JSON.stringify(buildConfig);

	// Create a hash for all metadata
	const hash = crypto.createHash("sha256").update(key).digest("hex");
	return hash;
}
