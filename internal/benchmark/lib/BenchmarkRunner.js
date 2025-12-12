import path from "node:path";
import ConfigurationLoader from "./ConfigurationLoader.js";
import RevisionResolver from "./services/RevisionResolver.js";
import ExecutionPlanner from "./services/ExecutionPlanner.js";
import HyperfineRunner from "./services/HyperfineRunner.js";
import ResultAggregator from "./services/ResultAggregator.js";
import MarkdownReporter from "./reporters/MarkdownReporter.js";
import JsonReporter from "./reporters/JsonReporter.js";

/**
 * Main orchestrator for running benchmarks.
 * Coordinates all services and manages the complete benchmark workflow.
 */
export default class BenchmarkRunner {
	/**
	 * @param {object} dependencies - External dependencies (for dependency injection)
	 * @param {object} dependencies.git - Git utility module
	 * @param {object} dependencies.npm - npm utility module
	 * @param {Function} dependencies.spawnProcess - Process spawning function
	 * @param {object} dependencies.fs - File system module
	 */
	constructor({git, npm, spawnProcess, fs}) {
		this.#git = git;
		this.#npm = npm;
		this.#spawnProcess = spawnProcess;
		this.#fs = fs;

		// Initialize services with dependencies
		this.#configLoader = new ConfigurationLoader(fs);
		this.#revisionResolver = new RevisionResolver(git);
		this.#executionPlanner = new ExecutionPlanner();
		this.#resultAggregator = new ResultAggregator(fs);
		this.#markdownReporter = new MarkdownReporter();
		this.#jsonReporter = new JsonReporter();
	}

	#git;
	#npm;
	#spawnProcess;
	#fs;
	#configLoader;
	#revisionResolver;
	#executionPlanner;
	#resultAggregator;
	#markdownReporter;
	#jsonReporter;

	/**
	 * Run benchmarks based on configuration.
	 *
	 * @param {object} options - Execution options
	 * @param {string} options.configFilePath - Path to YAML configuration file
	 * @param {string} options.repositoryPath - Path to the UI5 CLI repository
	 * @param {string} options.ui5CliPath - Path to the UI5 CLI executable
	 * @param {string[]} [options.projectDirs] - Project directories to benchmark (defaults to cwd)
	 * @param {Date} [options.timestamp] - Timestamp for the run (defaults to now)
	 * @returns {Promise<{success: boolean, failures: Array}>}
	 */
	async run({
		configFilePath,
		repositoryPath,
		ui5CliPath,
		projectDirs = [process.cwd()],
		timestamp = new Date()
	}) {
		console.log("=".repeat(80));
		console.log("UI5 CLI Benchmark Tool");
		console.log("=".repeat(80));
		console.log();

		// Validate repository state
		await this.#validateRepository(repositoryPath);

		// Load and validate configuration
		console.log(`Loading configuration from: ${configFilePath}`);
		const config = this.#configLoader.load(configFilePath);
		console.log(`✓ Configuration loaded successfully\n`);

		// Resolve all revisions
		console.log("Resolving revisions...");
		const resolvedRevisions = await this.#revisionResolver.resolveAll(config, repositoryPath);
		for (const [key, info] of resolvedRevisions.entries()) {
			console.log(`  ${info.name} (${key}): ${info.commitHash}`);
		}
		console.log(`✓ Resolved ${resolvedRevisions.size} revision(s)\n`);

		// Plan execution
		console.log("Planning benchmark execution...");
		const executionPlan = this.#executionPlanner.plan(config, resolvedRevisions);
		console.log(this.#executionPlanner.getSummary(executionPlan));

		// Run benchmarks for each project directory
		const allFailures = [];
		for (const projectDir of projectDirs) {
			console.log("=".repeat(80));
			console.log(`Benchmarking project: ${projectDir}`);
			console.log("=".repeat(80));
			console.log();

			const result = await this.#runForProject({
				config,
				executionPlan,
				repositoryPath,
				ui5CliPath,
				projectDir,
				timestamp
			});

			allFailures.push(...result.failures);
		}

		console.log("\n" + "=".repeat(80));
		if (allFailures.length === 0) {
			console.log("✅ All benchmarks completed successfully!");
		} else {
			console.log(`⚠️ Completed with ${allFailures.length} failure(s)`);
		}
		console.log("=".repeat(80) + "\n");

		return {
			success: allFailures.length === 0,
			failures: allFailures
		};
	}

	/**
	 * Validate that the repository is in a clean state.
	 *
	 * @param {string} repositoryPath - Path to repository
	 * @returns {Promise<void>}
	 */
	async #validateRepository(repositoryPath) {
		console.log(`Checking repository status: ${repositoryPath}`);
		const gitStatus = await this.#git.checkGitStatus(repositoryPath);
		if (gitStatus) {
			throw new Error(
				"Repository has uncommitted changes. " +
				"Please commit or stash your changes before running benchmarks."
			);
		}
		console.log("✓ Repository is clean\n");
	}

	/**
	 * Run benchmarks for a single project directory.
	 *
	 * @param {object} params - Execution parameters
	 * @param {Configuration} params.config - Configuration
	 * @param {Map} params.executionPlan - Execution plan
	 * @param {string} params.repositoryPath - UI5 CLI repository path
	 * @param {string} params.ui5CliPath - UI5 CLI executable path
	 * @param {string} params.projectDir - Project directory to benchmark
	 * @param {Date} params.timestamp - Benchmark timestamp
	 * @returns {Promise<{failures: Array}>}
	 */
	async #runForProject({
		config,
		executionPlan,
		repositoryPath,
		ui5CliPath,
		projectDir,
		timestamp
	}) {
		// Get project revision (if it's a git repository)
		const projectRevision = await this.#git.getProjectRevision(projectDir);
		if (projectRevision) {
			console.log(`Project Git Revision: ${projectRevision}\n`);
		} else {
			console.log("Project is not a git repository\n");
		}

		// Create HyperfineRunner instance for this project
		const hyperfineRunner = new HyperfineRunner({
			git: this.#git,
			npm: this.#npm,
			spawnProcess: this.#spawnProcess,
			ui5CliPath
		});

		// Execute benchmarks for each revision
		const executionResults = new Map();

		for (const [revisionKey, revisionPlan] of executionPlan.entries()) {
			const result = await hyperfineRunner.run({
				revisionPlan,
				hyperfineOptions: {
					warmup: config.warmup,
					runs: config.runs
				},
				repositoryPath,
				workingDirectory: projectDir
			});

			executionResults.set(revisionKey, result);
		}

		// Aggregate results
		console.log("\nAggregating results...");
		const aggregatedResults = this.#resultAggregator.aggregate({
			config,
			executionPlan,
			executionResults
		});
		console.log(`✓ Results aggregated\n`);

		// Generate reports
		await this.#generateReports({
			aggregatedResults,
			projectRevision,
			projectDir,
			timestamp
		});

		return {
			failures: aggregatedResults.failures
		};
	}

	/**
	 * Generate and save reports.
	 *
	 * @param {object} params - Report parameters
	 * @param {object} params.aggregatedResults - Aggregated results
	 * @param {string} params.projectRevision - Project git revision
	 * @param {string} params.projectDir - Project directory
	 * @param {Date} params.timestamp - Benchmark timestamp
	 * @returns {Promise<void>}
	 */
	async #generateReports({aggregatedResults, projectRevision, projectDir, timestamp}) {
		console.log("Generating reports...");

		// Generate Markdown report
		const markdown = this.#markdownReporter.generate({
			aggregatedResults,
			projectRevision,
			workingDirectory: projectDir,
			timestamp
		});

		const markdownPath = path.resolve(
			projectDir,
			`benchmark-summary-${timestamp.toISOString().replace(/[:.]/g, "-")}.md`
		);
		this.#fs.writeFileSync(markdownPath, markdown, "utf8");
		console.log(`  ✓ Markdown report: ${markdownPath}`);

		// Generate JSON report
		const json = this.#jsonReporter.generate({
			aggregatedResults,
			projectRevision,
			timestamp
		});

		const jsonPath = path.resolve(
			projectDir,
			`benchmark-results-${timestamp.toISOString().replace(/[:.]/g, "-")}.json`
		);
		this.#fs.writeFileSync(jsonPath, json, "utf8");
		console.log(`  ✓ JSON report: ${jsonPath}`);

		console.log("✓ Reports generated\n");
	}
}
