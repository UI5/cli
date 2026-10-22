/**
 * Stage-signature tuple format, shared by {@link @ui5/project/build/cache/ProjectBuildCache} and
 * {@link @ui5/project/build/cache/BuildStageCache}.
 *
 * A stage signature is an explicit tuple of five independent components joined by
 * {@link STAGE_SIGNATURE_SEPARATOR}, in order: project resources, dependency resources, non-resource
 * inputs (env vars, tracked TaskUtil reads), root resources, and tool-content (the content of external
 * tool packages the task loaded, CPOUI5FOUNDATION-1386). Each component is a SHA-256 hex digest (or the
 * digest of an empty set), so the separator never occurs inside a component and the join is unambiguous
 * and reversible via {@link splitStageSignature}.
 *
 * Keeping the dimensions as separate slots, rather than folding inputs/root/tool-content into the
 * project component, lets a delta lookup pair a changed project or dependency signature with the current
 * input, root, and tool-content signatures directly, with no reverse mapping back from a combined value.
 * The tool-content component is appended at index 4, so adding it leaves the only positional reader
 * ({@link STAGE_SIG_DEPENDENCY_INDEX}) unaffected.
 *
 * @module @ui5/project/build/cache/stageSignature
 */

/**
 * Separator between the components of a stage signature. A single ASCII character that cannot occur in
 * a hex digest, so the join is unambiguous.
 *
 * @type {string}
 */
export const STAGE_SIGNATURE_SEPARATOR = "-";

/**
 * Index of the dependency component within a stage-signature tuple. Used to read the dependency
 * signature a stage was keyed on back out for the result-stage signature.
 *
 * @type {number}
 */
export const STAGE_SIG_DEPENDENCY_INDEX = 1;

/**
 * Index of the tool-content component within a stage-signature tuple (CPOUI5FOUNDATION-1386). Appended
 * after the original four components so the positional dependency reader stays at index 1.
 *
 * @type {number}
 */
export const STAGE_SIG_TOOLCONTENT_INDEX = 4;

/**
 * Joins a stage-signature tuple into its string form.
 *
 * @param {string[]} components The [project, dependency, input, root, toolContent] signature components
 * @returns {string} Combined stage signature
 */
export function createStageSignature(components) {
	return components.join(STAGE_SIGNATURE_SEPARATOR);
}

/**
 * Splits a stage-signature string back into its tuple components. Each component is a hex digest, so
 * the split is lossless.
 *
 * @param {string} signature A stage signature produced by {@link createStageSignature}
 * @returns {string[]} The [project, dependency, input, root, toolContent] signature components
 */
export function splitStageSignature(signature) {
	return signature.split(STAGE_SIGNATURE_SEPARATOR);
}
