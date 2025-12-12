/**
 * Aggregates benchmark results from hyperfine JSON files and organizes them by groups.
 */
export default class ResultAggregator {
	/**
	 * @param {object} fs - File system module (for dependency injection)
	 */
	constructor(fs) {
		this.#fs = fs;
	}

	#fs;

	/**
	 * Aggregate results from all revisions and organize by groups.
	 *
	 * @param {object} params - Aggregation parameters
	 * @param {Configuration} params.config - The benchmark configuration
	 * @param {Map} params.executionPlan - The execution plan
	 * @param {Map} params.executionResults - Results from HyperfineRunner
	 * @returns {AggregatedResults}
	 *
	 * AggregatedResults = {
	 *   revisions: Map<revisionKey, RevisionResult>,
	 *   groups: Map<groupKey, GroupResult>,
	 *   failures: Array<FailureInfo>
	 * }
	 *
	 * RevisionResult = {
	 *   revisionKey: string,
	 *   name: string,
	 *   commitHash: string,
	 *   success: boolean,
	 *   error: Error|null,
	 *   benchmarks: Array<BenchmarkResult>
	 * }
	 *
	 * BenchmarkResult = {
	 *   index: number,
	 *   command: string,
	 *   displayName: string,
	 *   groupKey: string,
	 *   hyperfineResult: object|null
	 * }
	 *
	 * GroupResult = {
	 *   groupKey: string,
	 *   groupName: string,
	 *   benchmarks: Array<GroupBenchmarkResult>
	 * }
	 *
	 * GroupBenchmarkResult = {
	 *   displayName: string,
	 *   revisions: Map<revisionKey, {
	 *     revisionName: string,
	 *     commitHash: string,
	 *     success: boolean,
	 *     result: object|null
	 *   }>
	 * }
	 */
	aggregate({config, executionPlan, executionResults}) {
		const revisionResults = new Map();
		const failures = [];

		// Process each revision's results
		for (const [revisionKey, executionResult] of executionResults.entries()) {
			const revisionPlan = executionPlan.get(revisionKey);

			if (!executionResult.success) {
				// Record failure
				failures.push({
					revisionKey,
					revisionName: revisionPlan.name,
					commitHash: revisionPlan.commitHash,
					error: executionResult.error
				});

				revisionResults.set(revisionKey, {
					revisionKey,
					name: revisionPlan.name,
					commitHash: revisionPlan.commitHash,
					success: false,
					error: executionResult.error,
					benchmarks: []
				});
				continue;
			}

			// Read and parse the result file
			let hyperfineData = null;
			if (executionResult.resultFilePath) {
				try {
					const fileContents = this.#fs.readFileSync(executionResult.resultFilePath, "utf8");
					hyperfineData = JSON.parse(fileContents);
				} catch (error) {
					failures.push({
						revisionKey,
						revisionName: revisionPlan.name,
						commitHash: revisionPlan.commitHash,
						error: new Error(`Failed to read result file: ${error.message}`)
					});

					revisionResults.set(revisionKey, {
						revisionKey,
						name: revisionPlan.name,
						commitHash: revisionPlan.commitHash,
						success: false,
						error: new Error(`Failed to read result file: ${error.message}`),
						benchmarks: []
					});
					continue;
				}
			}

			// Map hyperfine results to benchmarks (index-based mapping)
			const benchmarkResults = [];
			for (let i = 0; i < revisionPlan.benchmarks.length; i++) {
				const benchmark = revisionPlan.benchmarks[i];
				const hyperfineResult = hyperfineData && hyperfineData.results ?
					hyperfineData.results[i] :
					null;

				// Create a result entry for each group this benchmark belongs to
				for (const groupMembership of benchmark.groupMemberships) {
					benchmarkResults.push({
						index: benchmark.index,
						command: benchmark.command,
						displayName: groupMembership.displayName,
						groupKey: groupMembership.groupKey,
						hyperfineResult
					});
				}
			}

			revisionResults.set(revisionKey, {
				revisionKey,
				name: revisionPlan.name,
				commitHash: revisionPlan.commitHash,
				success: true,
				error: null,
				benchmarks: benchmarkResults
			});
		}

		// Organize results by groups
		const groupResults = this.#organizeByGroups(config, revisionResults);

		return {
			revisions: revisionResults,
			groups: groupResults,
			failures
		};
	}

	/**
	 * Organize benchmark results by groups for comparison.
	 *
	 * @param {Configuration} config - The benchmark configuration
	 * @param {Map<string, RevisionResult>} revisionResults - Results per revision
	 * @returns {Map<string, GroupResult>}
	 */
	#organizeByGroups(config, revisionResults) {
		const groupResults = new Map();

		// Initialize group results
		for (const groupKey of config.getGroupKeys()) {
			const group = config.getGroup(groupKey);
			groupResults.set(groupKey, {
				groupKey,
				groupName: group.name,
				benchmarks: new Map() // Map<displayName, GroupBenchmarkResult>
			});
		}

		// Populate group results with benchmark data
		for (const [revisionKey, revisionResult] of revisionResults.entries()) {
			for (const benchmarkResult of revisionResult.benchmarks) {
				const groupResult = groupResults.get(benchmarkResult.groupKey);
				if (!groupResult) {
					continue; // Skip if group not found (shouldn't happen)
				}

				// Get or create benchmark entry in this group
				if (!groupResult.benchmarks.has(benchmarkResult.displayName)) {
					groupResult.benchmarks.set(benchmarkResult.displayName, {
						displayName: benchmarkResult.displayName,
						revisions: new Map()
					});
				}

				const groupBenchmark = groupResult.benchmarks.get(benchmarkResult.displayName);
				groupBenchmark.revisions.set(revisionKey, {
					revisionName: revisionResult.name,
					commitHash: revisionResult.commitHash,
					success: revisionResult.success,
					result: benchmarkResult.hyperfineResult
				});
			}
		}

		// Convert benchmark maps to arrays for easier iteration
		for (const groupResult of groupResults.values()) {
			groupResult.benchmarks = Array.from(groupResult.benchmarks.values());
		}

		return groupResults;
	}
}
