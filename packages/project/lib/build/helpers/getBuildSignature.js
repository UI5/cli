import crypto from "node:crypto";

// Increment signature version to invalidate all existing build signatures
// (e.g. after making a change that impacts build contents)
const BUILD_SIG_VERSION = "0";

// Version of the signature manifest structure itself. The manifest is a diagnostic side-channel
// (see getSignatureManifest); bump this when its shape changes so an old manifest can be recognized
// and ignored rather than mis-diffed. Independent of BUILD_SIG_VERSION, which governs the hash.
const SIGNATURE_MANIFEST_VERSION = 1;

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
 * @param {string} taskSignatures
 * @param {@ui5/project/lib/Project} project The project to create the cache integrity for
 * @param {@ui5/project/lib/graph/ProjectGraph} graph The project graph
 * @param {@ui5/project/lib/build/helpers/BuildContext~TaskRepository} taskRepository The task repository
 * (used to determine the effective versions of ui5-builder and ui5-fs)
 * @returns {string} The project build signature (hex-encoded SHA-256 hash)
 */
export function getProjectSignature(baseSignature, taskSignatures, project, graph, taskRepository) {
	const key = baseSignature + taskSignatures + project.getId() + JSON.stringify(project.getConfig()) +
		JSON.stringify(taskRepository.getVersions());
	// TODO: Add signatures of relevant custom tasks

	// Create a hash for all metadata
	const hash = crypto.createHash("sha256").update(key).digest("hex");
	return hash;
}

/**
 * Collects the **named** inputs that feed the project build signature into a structured, diffable
 * object. This is a diagnostic side-channel: the build signature is an opaque SHA-256 hash, so when
 * two builds of the same project produce different signatures (e.g. `ui5 build` vs. `ui5 serve`,
 * which excludes the `generateVersionInfo` task), the hash alone cannot reveal which input diverged.
 * Persisting this manifest alongside the signature lets a later build diff its own inputs against the
 * stored ones and report the exact differing field.
 *
 * The values here MUST mirror the inputs hashed by {@link getBaseSignature} and
 * {@link getProjectSignature}; any input added to those must be added here too, or the diagnosis
 * will silently miss the cause of a cache miss.
 *
 * @private
 * @param {object} buildConfig The signature-relevant build configuration (cache mode omitted)
 * @param {string} taskSignatures Concatenated build signatures of the project's tasks
 * @param {@ui5/project/lib/Project} project The project being built
 * @param {@ui5/project/lib/build/helpers/BuildContext~TaskRepository} taskRepository The task repository
 * @returns {object} Structured signature manifest
 */
export function getSignatureManifest(buildConfig, taskSignatures, project, taskRepository) {
	return {
		manifestVersion: SIGNATURE_MANIFEST_VERSION,
		buildSigVersion: BUILD_SIG_VERSION,
		buildConfig,
		taskSignatures,
		projectId: project.getId(),
		projectConfig: project.getConfig(),
		toolVersions: taskRepository.getVersions(),
	};
}
