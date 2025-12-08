import path from "node:path";

/**
 * Executes hyperfine benchmarks and manages result files.
 */
export default class HyperfineRunner {
	/**
	 * @param {object} options - Configuration options
	 * @param {object} options.git - Git utility module
	 * @param {object} options.npm - npm utility module
	 * @param {Function} options.spawnProcess - Process spawning function
	 * @param {string} options.ui5CliPath - Absolute path to the UI5 CLI executable
	 */
	constructor({git, npm, spawnProcess, ui5CliPath}) {
		this.#git = git;
		this.#npm = npm;
		this.#spawnProcess = spawnProcess;
		this.#ui5CliPath = ui5CliPath;
	}

	#git;
	#npm;
	#spawnProcess;
	#ui5CliPath;

	/**
	 * Execute benchmarks for a specific revision.
	 *
	 * @param {object} params - Execution parameters
	 * @param {object} params.revisionPlan - The revision execution plan
	 * @param {object} params.hyperfineOptions - Hyperfine configuration
	 * @param {string} params.repositoryPath - Path to the UI5 CLI repository
	 * @param {string} params.workingDirectory - Working directory for benchmark execution
	 * @returns {Promise<{success: boolean, resultFilePath: string|null, error: Error|null}>}
	 */
	async run({revisionPlan, hyperfineOptions, repositoryPath, workingDirectory}) {
		const {revisionKey, name, commitHash, benchmarks} = revisionPlan;
		const {warmup, runs} = hyperfineOptions;

		console.log(`\n=== Running benchmarks for ${name} (${revisionKey}): ${commitHash} ===\n`);

		try {
			if (benchmarks.length === 0) {
				console.log(`No benchmarks to run for this revision.`);
				return {
					success: true,
					resultFilePath: null,
					error: null
				};
			}

			// Checkout the revision
			console.log(`Checking out ${commitHash}...`);
			await this.#git.checkout(commitHash, repositoryPath);

			// Install dependencies
			console.log(`Running npm ci...`);
			await this.#npm.ci(repositoryPath);

			// Build hyperfine arguments
			const args = [
				"--warmup", String(warmup),
				"--runs", String(runs)
			];

			// Add each benchmark as a separate command to hyperfine
			for (const benchmark of benchmarks) {
				const commandName = this.#buildCommandName(name, revisionKey, benchmark);
				const fullCommand = `node ${this.#ui5CliPath} ${benchmark.command}`;

				// Add prepare command (empty string if none)
				args.push("--prepare", benchmark.prepare || "");

				// Add the benchmark command
				args.push("--command-name", commandName, fullCommand);
			}

			// Define result file path
			const resultFileName = `benchmark-results-${revisionKey}-${commitHash}.json`;
			const resultFilePath = path.resolve(workingDirectory, resultFileName);
			args.push("--export-json", resultFilePath);

			console.log(`Executing hyperfine with ${benchmarks.length} benchmark(s)...`);
			console.log(`Command: hyperfine ${args.join(" ")}\n`);

			// Execute hyperfine
			await this.#spawnProcess("hyperfine", args, {
				cwd: workingDirectory,
				stdio: "inherit",
				captureOutput: false,
				env: {
					// Disable invocation of local UI5 CLI installations
					UI5_CLI_NO_LOCAL: "X",
					// Inherit all other environment variables
					...process.env
				},
				errorMessage: "hyperfine exited with non-zero code"
			});

			console.log(`\n✅ Benchmarks completed successfully for ${name}\n`);

			return {
				success: true,
				resultFilePath,
				error: null
			};
		} catch (error) {
			console.error(`\n❌ Benchmarks failed for ${name}: ${error.message}\n`);

			// Check for specific hyperfine installation error
			if (error.message.includes("Failed to execute hyperfine")) {
				const installError = new Error(
					"hyperfine is required but not installed. " +
					"Please install it (e.g., 'brew install hyperfine' on macOS)."
				);
				return {
					success: false,
					resultFilePath: null,
					error: installError
				};
			}

			return {
				success: false,
				resultFilePath: null,
				error
			};
		}
	}

	/**
	 * Build a command name for hyperfine output.
	 *
	 * @param {string} revisionName - Display name of the revision
	 * @param {string} revisionKey - Revision key
	 * @param {object} benchmark - Benchmark execution object
	 * @returns {string}
	 */
	#buildCommandName(revisionName, revisionKey, benchmark) {
		// Use the first group's display name as the primary identifier
		const primaryDisplayName = benchmark.groupMemberships.length > 0 ?
			benchmark.groupMemberships[0].displayName :
			`ui5 ${benchmark.command}`;

		return `${revisionName} (${revisionKey}): ${primaryDisplayName}`;
	}
}
