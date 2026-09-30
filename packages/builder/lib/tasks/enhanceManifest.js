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
 * A step-based task: the default export is a factory returning one map step with a key per matched
 * <code>manifest.json</code>. The processor reads the i18n bundle files next to each manifest through the
 * step's workspace, so those reads are recorded as inputs of that step: editing a manifest or adding,
 * removing, or changing one of its i18n files re-runs only the owning manifest's step on a delta build and
 * leaves the others served from cache.
 *
 * @public
 * @function default
 * @static
 *
 * @param {object} options Options
 * @param {string} options.projectNamespace Namespace of the application
 * @returns {object[]} The task's build steps
 */
export default function build({projectNamespace}) {
	return [{
		name: "enhanceManifest",
		// One key per manifest.json. The i18n bundle reads made by manifestEnhancer go through the step's
		// workspace and are thus tracked per step.
		keys: async ({workspace}) => workspace.byGlob(`/resources/${projectNamespace}/**/manifest.json`),
		each: async (resource, {workspace}) => {
			const [processed] = await manifestEnhancer({
				resources: [resource],
				fs: fsInterface(workspace),
			});
			if (processed) {
				await workspace.write(processed);
			}
		},
	}];
}
