/**
 * Resolves revision configurations to concrete git commit hashes.
 */
export default class RevisionResolver {
	/**
	 * @param {object} git - Git utility module (for dependency injection)
	 * @param {Function} git.getMergeBaseRevision - Get merge base between two branches
	 * @param {Function} git.getBranchRevision - Get commit hash for a branch
	 */
	constructor(git) {
		this.#git = git;
	}

	#git;

	/**
	 * Resolve all revisions from the configuration to commit hashes.
	 *
	 * @param {Configuration} config - The benchmark configuration
	 * @param {string} repositoryPath - Absolute path to the git repository
	 * @returns {Promise<Map<string, {name: string, commitHash: string}>>}
	 *          Map of revision keys to resolved commit information
	 */
	async resolveAll(config, repositoryPath) {
		const resolvedRevisions = new Map();

		for (const revisionKey of config.getRevisionKeys()) {
			const revision = config.getRevision(revisionKey);
			const commitHash = await this.#resolveRevision(revision, repositoryPath);

			resolvedRevisions.set(revisionKey, {
				name: revision.name,
				commitHash
			});
		}

		return resolvedRevisions;
	}

	/**
	 * Resolve a single revision to a commit hash.
	 *
	 * @param {Revision} revision - The revision to resolve
	 * @param {string} repositoryPath - Absolute path to the git repository
	 * @returns {Promise<string>} The resolved commit hash
	 */
	async #resolveRevision(revision, repositoryPath) {
		if (revision.isDirect()) {
			// Direct git reference (branch, tag, or commit)
			return await this.#git.getBranchRevision(revision.gitReference, repositoryPath);
		} else if (revision.isMergeBase()) {
			// Merge base calculation
			return await this.#git.getMergeBaseRevision(
				revision.targetBranch,
				revision.mergeBaseFrom,
				repositoryPath
			);
		} else {
			throw new Error(`Unknown revision type for '${revision.key}'`);
		}
	}
}
