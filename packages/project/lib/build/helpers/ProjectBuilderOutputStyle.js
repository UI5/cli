/**
 * Processes build results into a specific directory structure.
 *
 * @public
 * @readonly
 * @enum {string}
 * @property {string} Default The default directory structure for every project type.
 *     For applications this is identical to "Flat" and for libraries to "Namespace".
 *     Other types have a more distinct default output style.
 * @property {string} Flat Omits the project namespace and the "resources" directory.
 * @property {string} Namespace Respects project namespace and the "resources" directory.
 * @module @ui5/project/build/ProjectBuilderOutputStyle
 */
export default {
	Default: "Default",
	Flat: "Flat",
	Namespace: "Namespace"
};
