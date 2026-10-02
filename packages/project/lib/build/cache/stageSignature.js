/**
 * Stage-signature tuple format, shared by {@link @ui5/project/build/cache/ProjectBuildCache} and
 * {@link @ui5/project/build/cache/BuildTaskCache}.
 *
 * A stage signature is an explicit tuple of four independent components joined by
 * {@link STAGE_SIGNATURE_SEPARATOR}, in order: project resources, dependency resources, non-resource
 * inputs (env vars, tracked TaskUtil reads), and root resources. Each component is a SHA-256 hex
 * digest (or the digest of an empty set), so the separator never occurs inside a component and the
 * join is unambiguous and reversible via {@link splitStageSignature}.
 *
 * Keeping the four dimensions as separate slots, rather than folding inputs and root into the project
 * component, lets a delta lookup pair a changed project or dependency signature with the current input
 * and root signatures directly, with no reverse mapping back from a combined value.
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
 * Joins a stage-signature tuple into its string form.
 *
 * @param {string[]} components The [project, dependency, input, root] signature components
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
 * @returns {string[]} The [project, dependency, input, root] signature components
 */
export function splitStageSignature(signature) {
	return signature.split(STAGE_SIGNATURE_SEPARATOR);
}
