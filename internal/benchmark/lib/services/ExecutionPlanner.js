/**
 * Plans the execution of benchmarks across revisions, creating a deduplicated
 * execution matrix.
 */
export default class ExecutionPlanner {
	/**
	 * Plan the execution of all benchmarks across all revisions.
	 *
	 * Creates a map where each revision has an array of benchmarks to execute,
	 * with each benchmark including its group membership information.
	 *
	 * @param {Configuration} config - The benchmark configuration
	 * @param {Map<string, {name: string, commitHash: string}>} resolvedRevisions
	 *        Map of revision keys to resolved commit information
	 * @returns {Map<string, RevisionPlan>} Execution plan per revision
	 *
	 * RevisionPlan = {
	 *   revisionKey: string,
	 *   name: string,
	 *   commitHash: string,
	 *   benchmarks: BenchmarkExecution[]
	 * }
	 *
	 * BenchmarkExecution = {
	 *   index: number,
	 *   command: string,
	 *   prepare: string|null,
	 *   groupMemberships: Array<{groupKey: string, displayName: string}>
	 * }
	 */
	plan(config, resolvedRevisions) {
		const executionPlan = new Map();

		// Initialize plan for each revision
		for (const [revisionKey, revisionInfo] of resolvedRevisions.entries()) {
			executionPlan.set(revisionKey, {
				revisionKey,
				name: revisionInfo.name,
				commitHash: revisionInfo.commitHash,
				benchmarks: []
			});
		}

		// Add benchmarks to each applicable revision
		for (const benchmark of config.benchmarks) {
			for (const [revisionKey, revisionPlan] of executionPlan.entries()) {
				// Check if this benchmark should run on this revision
				if (benchmark.shouldRunOnRevision(revisionKey)) {
					// Build group membership information
					const groupMemberships = [];
					for (const groupKey of benchmark.getGroupKeys()) {
						groupMemberships.push({
							groupKey,
							displayName: benchmark.getGroupDisplayName(groupKey)
						});
					}

					revisionPlan.benchmarks.push({
						index: benchmark.index,
						command: benchmark.command,
						prepare: benchmark.prepare,
						groupMemberships
					});
				}
			}
		}

		// Verify that each revision has at least one benchmark
		for (const [revisionKey, revisionPlan] of executionPlan.entries()) {
			if (revisionPlan.benchmarks.length === 0) {
				console.warn(
					`Warning: Revision '${revisionKey}' (${revisionPlan.name}) ` +
					`has no benchmarks assigned to it.`
				);
			}
		}

		return executionPlan;
	}

	/**
	 * Get a summary of the execution plan for logging/debugging.
	 *
	 * @param {Map<string, RevisionPlan>} executionPlan - The execution plan
	 * @returns {string} Human-readable summary
	 */
	getSummary(executionPlan) {
		let summary = "Execution Plan:\n";

		for (const [revisionKey, plan] of executionPlan.entries()) {
			summary += `\n  ${plan.name} (${revisionKey}): ${plan.commitHash.substring(0, 8)}\n`;
			summary += `    ${plan.benchmarks.length} benchmark(s):\n`;

			for (const benchmark of plan.benchmarks) {
				const groupNames = benchmark.groupMemberships
					.map((gm) => `${gm.groupKey}: "${gm.displayName}"`)
					.join(", ");
				summary += `      [${benchmark.index}] ui5 ${benchmark.command}`;
				if (benchmark.prepare) {
					summary += ` (prepare: ${benchmark.prepare})`;
				}
				summary += `\n        Groups: ${groupNames}\n`;
			}
		}

		return summary;
	}
}
