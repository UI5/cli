# UI5 CLI Benchmark Tool

A benchmarking utility for measuring and comparing the performance of UI5 CLI commands across different git revisions.

## Prerequisites

This tool requires [hyperfine](https://github.com/sharkdp/hyperfine) to be installed. Follow the installation instructions in the hyperfine repository for your platform.

## Installation

Make the `ui5-cli-benchmark` binary available globally:

```bash
npm link
```

## Usage

```bash
ui5-cli-benchmark run <path-to-config> [<project-dir>...]
```

### Arguments

- `<path-to-config>` - Path to a YAML configuration file (required)
- `[<project-dir>...]` - One or more project directories to benchmark (optional, defaults to current working directory)

### Example

```bash
# Run benchmarks using example config in current directory
ui5-cli-benchmark run config/.example.yaml

# Run benchmarks in specific project directories
ui5-cli-benchmark run config/.example.yaml /path/to/project1 /path/to/project2
```

## Configuration

Create a YAML configuration file with the following structure:

### Revisions

Define the git revisions to benchmark:

```yaml
revisions:
  baseline:
    name: "Baseline"
    revision:
      merge_base_from: "feat/example-feature"
      target_branch: "main"
  example_feature:
    name: "Example Feature"
    revision: "feat/example-feature"
```

Each revision can specify:
- `name` - Display name for the revision
- `revision` - Either a branch/commit hash or an object with `merge_base_from` and `target_branch` to compute the merge base

### Hyperfine Settings

Configure the benchmark runner (uses [hyperfine](https://github.com/sharkdp/hyperfine)):

```yaml
hyperfine:
  warmup: 1  # Number of warmup runs
  runs: 10   # Number of benchmark runs
```

### Groups

Define logical groups for organizing benchmark results:

```yaml
groups:
  build:
    name: "ui5 build"
```

### Benchmarks

Define the commands to benchmark:

```yaml
benchmarks:
  - command: "build"
    prepare: "rm -rf .ui5-cache"  # Optional: command to run before each benchmark
    groups:
      build:
        name: "build"
    revisions:  # Optional: limit to specific revisions
      - "example_feature"
```

Each benchmark can specify:
- `command` - The UI5 CLI command to run (e.g., "build", "build --clean-dest")
- `prepare` - Optional shell command to run before each benchmark iteration
- `groups` - Group(s) this benchmark belongs to with display names
- `revisions` - Optional array to limit which revisions run this benchmark (defaults to all)

## Output

The tool generates:
- Console output with progress and summary
- Markdown report with benchmark results
- JSON report with raw data

Results are organized by revision and group for easy comparison.
