/**
 * Generates Markdown reports from aggregated benchmark results.
 */
export default class MarkdownReporter {
	/**
	 * Generate a Markdown report from aggregated results.
	 *
	 * @param {object} params - Report parameters
	 * @param {object} params.aggregatedResults - Aggregated benchmark results
	 * @param {string} params.projectRevision - Git revision of the project being benchmarked
	 * @param {string} params.workingDirectory - Working directory where benchmarks ran
	 * @param {Date} params.timestamp - Timestamp of the benchmark run
	 * @returns {string} Markdown report
	 */
	generate({aggregatedResults, projectRevision, workingDirectory, timestamp}) {
		const {revisions, groups, failures} = aggregatedResults;

		let markdown = "# Benchmark Results\n\n";

		// Metadata section
		markdown += this.#generateMetadata(timestamp, workingDirectory, projectRevision, revisions);

		// Failures section (if any)
		if (failures.length > 0) {
			markdown += this.#generateFailuresSection(failures);
		}

		// Results by group
		for (const [groupKey, groupResult] of groups.entries()) {
			markdown += this.#generateGroupSection(groupKey, groupResult, revisions);
		}

		// Configuration section
		markdown += "## Revisions\n\n";
		for (const [revisionKey, revisionResult] of revisions.entries()) {
			markdown += `- **${revisionResult.name}** (\`${revisionKey}\`): \`${revisionResult.commitHash}\``;
			if (!revisionResult.success) {
				markdown += " ❌ Failed";
			}
			markdown += "\n";
		}
		markdown += "\n";

		return markdown;
	}

	/**
	 * Generate metadata section.
	 *
	 * @param {Date} timestamp - Benchmark timestamp
	 * @param {string} workingDirectory - Working directory
	 * @param {string} projectRevision - Project revision
	 * @param {Map} revisions - Revision results
	 * @returns {string}
	 */
	#generateMetadata(timestamp, workingDirectory, projectRevision, revisions) {
		let metadata = "**Generated:** " + timestamp.toISOString() + "\n\n";
		metadata += "**Benchmark Directory:** `" + workingDirectory + "`\n\n";

		if (projectRevision) {
			metadata += "**Project Git Revision:** `" + projectRevision + "`\n\n";
		}

		metadata += "**Revisions Benchmarked:**\n";
		for (const [revisionKey, revisionResult] of revisions.entries()) {
			metadata += "- " + revisionResult.name + " (`" + revisionKey + "`): `" +
				revisionResult.commitHash + "`\n";
		}
		metadata += "\n";

		return metadata;
	}

	/**
	 * Generate failures section.
	 *
	 * @param {Array} failures - List of failures
	 * @returns {string}
	 */
	#generateFailuresSection(failures) {
		let section = "## ⚠️ Failures\n\n";
		section += "The following revisions encountered errors during benchmarking:\n\n";

		for (const failure of failures) {
			section += `### ${failure.revisionName} (\`${failure.revisionKey}\`)\n\n`;
			section += `**Commit:** \`${failure.commitHash}\`\n\n`;
			section += "**Error:**\n```\n" + failure.error.message + "\n```\n\n";
		}

		return section;
	}

	/**
	 * Generate a section for a specific group.
	 *
	 * @param {string} groupKey - Group key
	 * @param {object} groupResult - Group result data
	 * @param {Map} revisions - All revision results
	 * @returns {string}
	 */
	#generateGroupSection(groupKey, groupResult, revisions) {
		let section = `## ${groupResult.groupName}\n\n`;

		if (groupResult.benchmarks.length === 0) {
			section += "*No benchmarks in this group.*\n\n";
			return section;
		}

		// Build comparison table
		section += this.#generateComparisonTable(groupResult, revisions);

		// Add Mermaid chart
		section += this.#generateMermaidChart(groupResult, revisions);

		// Add detailed results
		section += this.#generateDetailedResults(groupResult);

		return section;
	}

	/**
	 * Generate comparison table for a group.
	 *
	 * @param {object} groupResult - Group result data
	 * @param {Map} revisions - All revision results
	 * @returns {string}
	 */
	#generateComparisonTable(groupResult, revisions) {
		// Get all revision keys in order
		const revisionKeys = Array.from(revisions.keys());

		// Build table header
		let table = "| Benchmark |";
		for (const revKey of revisionKeys) {
			const revResult = revisions.get(revKey);
			table += ` ${revResult.name} (s) |`;
		}
		table += "\n";

		// Build separator
		table += "|-----------|";
		for (let i = 0; i < revisionKeys.length; i++) {
			table += "--------------|";
		}
		table += "\n";

		// Build rows
		for (const benchmark of groupResult.benchmarks) {
			table += `| ${benchmark.displayName} |`;

			for (const revKey of revisionKeys) {
				const revData = benchmark.revisions.get(revKey);
				if (!revData) {
					table += " - |";
				} else if (!revData.success || !revData.result) {
					table += " ❌ Failed |";
				} else {
					const mean = revData.result.mean.toFixed(3);
					const stddev = revData.result.stddev !== null ? revData.result.stddev.toFixed(3) : "N/A";
					table += ` ${mean} ± ${stddev} |`;
				}
			}
			table += "\n";
		}

		table += "\n";
		return table;
	}

	/**
	 * Generate Mermaid chart for a group.
	 *
	 * @param {object} groupResult - Group result data
	 * @param {Map} revisions - All revision results
	 * @returns {string}
	 */
	#generateMermaidChart(groupResult, revisions) {
		// Collect chart data
		const chartData = {
			names: [],
			values: []
		};
		const revisionKeys = Array.from(revisions.keys());

		for (const benchmark of groupResult.benchmarks) {
			for (const revKey of revisionKeys) {
				const revData = benchmark.revisions.get(revKey);
				if (revData && revData.success && revData.result) {
					chartData.names.push(`${benchmark.displayName} (${revData.revisionName})`);
					chartData.values.push(revData.result.mean);
				}
			}
		}

		// Don't generate chart if no valid data
		if (chartData.names.length === 0) {
			return "";
		}

		// Build x-axis labels (revision name for each benchmark)
		const xAxisLabels = chartData.names.map((name) => `"${name}"`).join(", ");

		// Calculate y-axis max value
		const yAxisMaxValue = chartData.values.length > 0 ? Math.max(...chartData.values) * 1.1 : 1;

		// Build bar values
		const barValues = chartData.values.map((v) => v !== null ? v.toFixed(3) : "0").join(", ");

		let chart = "\n### Performance Comparison Chart\n\n";
		chart += "```mermaid\n";
		chart += "---\n";
		chart += `config:\n`;
		chart += `  xyChart:\n`;
		chart += `    chartOrientation: "horizontal"\n`;
		chart += `---\n`;
		chart += "xychart-beta\n";
		chart += `  title "Benchmark Execution Time (seconds)"\n`;
		chart += `  x-axis [${xAxisLabels}]\n`;
		chart += `  y-axis "Time (seconds)" 0 --> ${yAxisMaxValue.toFixed(1)}\n`;
		chart += `  bar [${barValues}]\n`;
		chart += "```\n\n";

		return chart;
	}

	/**
	 * Generate detailed results.
	 *
	 * @param {object} groupResult - Group result data
	 * @returns {string}
	 */
	#generateDetailedResults(groupResult) {
		let section = "### Detailed Results\n\n";

		// Show results for each benchmark
		for (const benchmark of groupResult.benchmarks) {
			section += `#### ${benchmark.displayName}\n\n`;

			for (const [revKey, revData] of benchmark.revisions.entries()) {
				section += `**${revData.revisionName}** (\`${revKey}\` - \`${revData.commitHash.substring(0, 8)}\`):\n`;

				if (!revData.success || !revData.result) {
					section += "- ❌ Failed\n\n";
					continue;
				}

				const result = revData.result;
				const stddevStr = result.stddev !== null ? `${result.stddev.toFixed(3)}s` : "N/A";
				section += `- Mean: ${result.mean.toFixed(3)}s ± ${stddevStr}\n`;
				section += `- Min: ${result.min.toFixed(3)}s\n`;
				section += `- Max: ${result.max.toFixed(3)}s\n`;
				section += `- Median: ${result.median.toFixed(3)}s\n\n`;
			}
		}

		return section;
	}
}
