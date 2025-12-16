/**
 * Generates JSON reports from aggregated benchmark results.
 */
export default class JsonReporter {
	/**
	 * Generate a JSON report from aggregated results.
	 *
	 * @param {object} params - Report parameters
	 * @param {object} params.aggregatedResults - Aggregated benchmark results
	 * @param {string} params.projectRevision - Git revision of the project being benchmarked
	 * @param {Date} params.timestamp - Timestamp of the benchmark run
	 * @returns {string} JSON report as a string
	 */
	generate({aggregatedResults, projectRevision, timestamp}) {
		const report = {
			timestamp: timestamp.toISOString(),
			projectRevision: projectRevision || null,
			revisions: this.#serializeRevisions(aggregatedResults.revisions),
			groups: this.#serializeGroups(aggregatedResults.groups),
			failures: aggregatedResults.failures.map((failure) => ({
				revisionKey: failure.revisionKey,
				revisionName: failure.revisionName,
				commitHash: failure.commitHash,
				error: failure.error ? failure.error.message : null
			}))
		};

		return JSON.stringify(report, null, 2);
	}

	/**
	 * Serialize revision results to plain objects.
	 *
	 * @param {Map} revisions - Revision results map
	 * @returns {object}
	 */
	#serializeRevisions(revisions) {
		const result = {};

		for (const [revisionKey, revisionResult] of revisions.entries()) {
			result[revisionKey] = {
				name: revisionResult.name,
				commitHash: revisionResult.commitHash,
				success: revisionResult.success,
				error: revisionResult.error ? revisionResult.error.message : null,
				benchmarks: revisionResult.benchmarks.map((b) => ({
					index: b.index,
					command: b.command,
					displayName: b.displayName,
					groupKey: b.groupKey,
					result: b.hyperfineResult
				}))
			};
		}

		return result;
	}

	/**
	 * Serialize group results to plain objects.
	 *
	 * @param {Map} groups - Group results map
	 * @returns {object}
	 */
	#serializeGroups(groups) {
		const result = {};

		for (const [groupKey, groupResult] of groups.entries()) {
			result[groupKey] = {
				name: groupResult.groupName,
				benchmarks: groupResult.benchmarks.map((b) => {
					const revisions = {};
					for (const [revKey, revData] of b.revisions.entries()) {
						revisions[revKey] = {
							name: revData.revisionName,
							commitHash: revData.commitHash,
							success: revData.success,
							result: revData.result
						};
					}
					return {
						displayName: b.displayName,
						revisions
					};
				})
			};
		}

		return result;
	}
}
