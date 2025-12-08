import {test, describe} from "node:test";
import path from "node:path";
import BenchmarkRunner from "../../lib/BenchmarkRunner.js";

const testConfig = `
revisions:
  baseline:
    name: "Baseline"
    revision:
      merge_base_from: "feat/example-feature"
      target_branch: "main"
  example_feature:
    name: "Example Feature"
    revision: "feat/example-feature"

hyperfine:
  warmup: 1
  runs: 10

groups:
  build:
    name: "ui5 build"

benchmarks:

  - command: "build"
    groups:
      build:
        name: "build"
`;

function createMockFs(mockFileSystem = new Map()) {
	return {
		readFileSync(filePath, encoding) {
			if (filePath === "benchmark-config.yaml" && encoding === "utf8") {
				return testConfig;
			} else if (filePath === "benchmark-results-baseline-merge-base-revision-hash.json") {
				return JSON.stringify({results: [
					{
						command: "Baseline: ui5 build",
						mean: 5.123,
						stddev: 0.234,
						min: 4.890,
						max: 5.456,
						median: 5.100
					},
				]});
			} else if (filePath === "benchmark-results-comparison-branch-revision-hash.json") {
				return JSON.stringify({results: [
					{
						command: "Comparison: ui5 build",
						mean: 4.567,
						stddev: 0.123,
						min: 4.444,
						max: 4.690,
						median: 4.560
					},
				]});
			} else if (mockFileSystem.has(filePath)) {
				return mockFileSystem.get(filePath);
			} else {
				const error = new Error(`File not found: ${filePath}`);
				error.code = "ENOENT";
				throw error;
			}
		},
		writeFileSync(filePath, content, encoding) {
			mockFileSystem.set(filePath, content);
		}
	};
}

function createMockGit({dirty = false} = {}) {
	return {
		async checkGitStatus() {
			return dirty ? "M modified-file.js" : "";
		},
		async getMergeBaseRevision() {
			return "merge-base-revision-hash";
		},
		async getBranchRevision() {
			return "branch-revision-hash";
		},
		async getProjectRevision() {
			return "project-revision-hash";
		},
		async checkout() {
			return;
		}
	};
}

function createMockNpm() {
	return {
		async ci() {
			return;
		}
	};
}

function createMockSpawnProcess(fn) {
	return async function mockSpawnProcess(command, args, options) {
		return fn(command, args, options);
	};
}

describe("BenchmarkRunner (e2e)", () => {
	const mocks = {
		fs: createMockFs(),
		git: createMockGit(),
		npm: createMockNpm(),
		spawnProcess: createMockSpawnProcess(),
		timestamp: new Date()
	};

	test("should throw error when no config file provided", async ({assert}) => {
		try {
			const runner = new BenchmarkRunner({
				...mocks
			});
			await runner.run({
				timestamp: mocks.timestamp
			});
			assert.fail("Command should throw an error");
		} catch (error) {
			assert.equal(error.message, "Configuration file path must be a non-empty string");
		}
	});

	test("should throw error when config file not found", async ({assert}) => {
		try {
			const runner = new BenchmarkRunner({
				...mocks
			});
			await runner.run({
				configFilePath: "does-not-exist.yaml",
				timestamp: mocks.timestamp
			});
			assert.fail("Command should throw an error");
		} catch (error) {
			assert.equal(error.message, "Configuration file not found: does-not-exist.yaml");
		}
	});

	test("should throw error when repository is dirty", async ({assert}) => {
		try {
			const runner = new BenchmarkRunner({
				...mocks,
				git: createMockGit({dirty: true}),
			});
			await runner.run({
				configFilePath: "benchmark-config.yaml",
				timestamp: mocks.timestamp
			});
			assert.fail("Should have exited");
		} catch (error) {
			assert.equal(error.message,
				"Repository has uncommitted changes. " +
				"Please commit or stash your changes before running benchmarks."
			);
		}
	});

	test("should successfully run benchmarks with default directory", async ({assert}) => {
		const mockFileSystem = new Map();

		const runner = new BenchmarkRunner({
			...mocks,
			fs: createMockFs(mockFileSystem),
			spawnProcess: createMockSpawnProcess(() => {
				mockFileSystem.set(
					path.resolve(process.cwd(), "benchmark-results-baseline-merge-base-revision-hash.json"),
					JSON.stringify({
						results: [
							{
								command: "Baseline: ui5 build",
								mean: 5.123,
								stddev: 0.234,
								min: 4.890,
								max: 5.456,
								median: 5.100
							},
						]
					})
				);
				mockFileSystem.set(
					path.resolve(process.cwd(), "benchmark-results-example_feature-branch-revision-hash.json"),
					JSON.stringify({
						results: [
							{
								command: "Example Feature: ui5 build",
								mean: 4.567,
								stddev: 0.123,
								min: 4.444,
								max: 4.690,
								median: 4.560
							},
						]
					})
				);
				return;
			})
		});
		await runner.run({
			configFilePath: "benchmark-config.yaml",
			timestamp: mocks.timestamp
		});

		// Verify that summary file was written
		const summaryFilePath = path.resolve(process.cwd(), `benchmark-summary-${mocks.timestamp.toISOString().replace(/[:.]/g, "-")}.md`);
		assert.ok(mockFileSystem.has(summaryFilePath), "Summary file should be written");

		// Verify that results file was written
		const resultsFilePath = path.resolve(process.cwd(), `benchmark-results-${mocks.timestamp.toISOString().replace(/[:.]/g, "-")}.json`);
		assert.ok(mockFileSystem.has(resultsFilePath), "Results file should be written");
		assert.deepStrictEqual(JSON.parse(mockFileSystem.get(resultsFilePath)), {
			"timestamp": mocks.timestamp.toISOString(),
			"projectRevision": "project-revision-hash",
			"revisions": {
				"baseline": {
					"name": "Baseline",
					"commitHash": "merge-base-revision-hash",
					"success": true,
					"error": null,
					"benchmarks": [
						{
							"index": 0,
							"command": "build",
							"displayName": "build",
							"groupKey": "build",
							"result": {
								"command": "Baseline: ui5 build",
								"max": 5.456,
								"mean": 5.123,
								"median": 5.1,
								"min": 4.89,
								"stddev": 0.234
							},
						}
					]
				},
				"example_feature": {
					"name": "Example Feature",
					"commitHash": "branch-revision-hash",
					"success": true,
					"error": null,
					"benchmarks": [
						{
							"index": 0,
							"command": "build",
							"displayName": "build",
							"groupKey": "build",
							"result": {
								"command": "Example Feature: ui5 build",
								"mean": 4.567,
								"stddev": 0.123,
								"min": 4.444,
								"max": 4.690,
								"median": 4.560
							}
						}
					]
				}
			},
			"groups": {
				"build": {
					"name": "ui5 build",
					"benchmarks": [
						{
							"displayName": "build",
							"revisions": {
								"baseline": {
									"name": "Baseline",
									"commitHash": "merge-base-revision-hash",
									"success": true,
									"result": {
										"command": "Baseline: ui5 build",
										"max": 5.456,
										"mean": 5.123,
										"median": 5.1,
										"min": 4.89,
										"stddev": 0.234
									},
								},
								"example_feature": {
									"name": "Example Feature",
									"commitHash": "branch-revision-hash",
									"success": true,
									"result": {
										"command": "Example Feature: ui5 build",
										"mean": 4.567,
										"stddev": 0.123,
										"min": 4.444,
										"max": 4.690,
										"median": 4.560
									}
								}
							}
						}
					]
				}
			},
			"failures": []
		});
	});
});
