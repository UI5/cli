import manifestEnhancer from "../processors/manifestEnhancer.js";
import fsInterface from "@ui5/fs/fsInterface";

/* eslint "jsdoc/check-param-names": ["error", {"disableExtraPropertyReporting":true}] */
/**
 * @public
 * @module @ui5/builder/tasks/enhanceManifest
 */
/**
 * Task for transforming the manifest.json file.
 * Adds missing information based on the available project resources,
 * for example the locales supported by the present i18n resources.
 *
 * Each matched <code>manifest.json</code> is processed as its own cached step via
 * [taskUtil.processEach]{@link @ui5/project/build/helpers/TaskUtil#processEach}. The processor reads the
 * i18n bundle files next to each manifest, so those reads go through the step's workspace and are
 * recorded as inputs of that step: editing a manifest or adding, removing, or changing one of its i18n
 * files re-runs only the owning manifest's step on a delta build and leaves the others served from cache.
 *
 * @public
 * @function default
 * @static
 *
 * @param {object} parameters Parameters
 * @param {@ui5/fs/DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {@ui5/project/build/helpers/TaskUtil|object} [parameters.taskUtil] TaskUtil
 * @param {object} parameters.options Options
 * @param {string} parameters.options.projectNamespace Namespace of the application
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
export default async function({workspace, taskUtil, options}) {
	const {projectNamespace} = options;

	// Note: all "manifest.json" files in the given namespace
	const resources = await workspace.byGlob(`/resources/${projectNamespace}/**/manifest.json`);

	if (taskUtil?.processEach) {
		// One cached step per manifest.json. The i18n bundle reads made by manifestEnhancer go through
		// the step's workspace and are thus tracked per step.
		await taskUtil.processEach("enhanceManifest", resources, async (resource, {workspace}) => {
			const [processed] = await manifestEnhancer({
				resources: [resource],
				fs: fsInterface(workspace),
			});
			if (processed) {
				await workspace.write(processed);
			}
		});
		return;
	}

	// Standalone use without the build cache (e.g. a direct task invocation): process in one batch.
	const processedResources = await manifestEnhancer({
		resources,
		fs: fsInterface(workspace),
	});

	await Promise.all(processedResources.map((resource) => workspace.write(resource)));
}
