import BuildContext from "./BuildContext.js";
import Cache from "../cache/Cache.js";

/**
 * Computes the build signature of every project in a resolved project graph, without running a
 * build. The build signature identifies the build *configuration* (build options, per-project
 * task signatures, tool versions, project config); it is the key under which a project's entries
 * are stored in the build cache.
 *
 * This is the setup half of a build: it instantiates a {@link BuildContext} and, per project, a
 * {@link @ui5/project/build/helpers/ProjectBuildContext} via its `create` factory. It does not
 * initialize source indices, does not open the cache database (cache mode is forced to
 * {@link @ui5/project/build/cache/Cache.Off}), and does not seal or otherwise mutate the graph.
 *
 * @public
 * @param {@ui5/project/graph/ProjectGraph} graph Resolved project graph
 * @param {object} [buildConfig] Build options that influence the signature
 * @param {boolean} [buildConfig.selfContained=false]
 * @param {boolean} [buildConfig.jsdoc=false]
 * @param {string[]} [buildConfig.includedTasks=[]]
 * @param {string[]} [buildConfig.excludedTasks=[]]
 * @returns {Promise<Map<string, string>>} Map of project id to build signature
 */
export async function getProjectBuildSignatures(graph, {
	selfContained = false, jsdoc = false, includedTasks = [], excludedTasks = [],
} = {}) {
	const taskRepository = await graph._getTaskRepository();
	// cache: Off keeps getCacheManager() from opening the cache database. The signature is fully
	// computed by ProjectBuildContext.create; initSourceIndex is never called.
	const buildContext = new BuildContext(graph, taskRepository, {
		selfContained, jsdoc, includedTasks, excludedTasks, cache: Cache.Off,
	});

	const signatures = new Map();
	for (const projectName of graph.getProjectNames()) {
		const projectBuildContext = await buildContext.getProjectContext(projectName);
		signatures.set(
			projectBuildContext.getProject().getId(),
			projectBuildContext.getBuildSignature()
		);
	}
	return signatures;
}
