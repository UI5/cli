# Benchmarking UI5 CLI

For benchmarking UI5 CLI we typically make use of the open source tool [hyperfine](https://github.com/sharkdp/hyperfine).

In general we only benchmark calls to the UI5 CLI. However, we might add scripted benchmarks for some components in the future.

The following is a walk-through on how to evaluate the performance impact of changes to the UI5 CLI `build` command.

## Quckstart

To quickly benchmark one branch against another, you can use this [hyperfine](https://github.com/sharkdp/hyperfine#installation) command. For a more elaborate setup, follow the setup steps below. Make sure that the branches are rebased beforehand.

```sh
cd /my/ui5/app
hyperfine --warmup 3 --runs 10 \
  --parameter-list branch main,feature-1 \
  --env 'UI5_CLI_NO_LOCAL=X UI5_BUILD_NO_WRITE_DEST=X UI5_BUILD_NO_WRITE_CACHE=X' \
  --setup 'cd /path/to/ui5-cli/ && git switch {branch} && npm ci' \
  --prepare 'rm -rf ~/.ui5/buildCache' \
  --command-name '{branch}' \
  'node /path/to/ui5-cli/packages/cli/bin/ui5.cjs build' \
  --export-markdown ./bench.md
terminal-notifier -title "Benchmark finished" -message "Done"
```

**Explanation**

* **warmup**: performs one initial, untimed execution before the actual measurements begin. This reduces the influence of cold caches (e.g. filesystem or OS-level caches) on the first timed run, leading to more consistent results
* **runs**: *optional*. Pins the number of timed executions per command to a fixed count. By default, hyperfine automatically determines the number of runs based on the command's duration. Fixing it ensures a consistent sample size, making results more comparable across different benchmarking sessions
* **parameter-list**: defines a variable named `branch` with the values `main` and `feature-1`. hyperfine runs the full benchmark for each value, substituting `{branch}` wherever it appears in the setup, command-name, and command. This is what enables the side-by-side comparison of the two branches
* **env**:
    * `UI5_CLI_NO_LOCAL=X` - ensures that target UI5 CLI won't launch a UI5 CLI version installed in the project (default behavior)
    * `UI5_BUILD_NO_WRITE_DEST=X` - disables writing the build result to disk. Without this flag, your benchmark will inevitably be influenced by your disk's I/O performance at any given time
    * `UI5_BUILD_NO_WRITE_CACHE=X` - disables caching of build results in `~/.ui5/buildCache`
* **setup**: executed once per parameter-list value (i.e. per branch) before the benchmarking runs begin. It changes into the UI5 CLI directory, switches to the given `{branch}`, and runs `npm ci` to ensure the correct dependencies are in place for that branch. You can omit `npm ci` if there are no `package*.json` changes between the two branches
* **prepare**: executed before *each* timing run. It removes the `~/.ui5/buildCache` directory to guarantee that every run starts from a clean state, preventing cached results from skewing the measurements
* **command-name**: assigns a readable name (the current `{branch}`) to each benchmarked command, making the results easier to interpret in the output
* **command**: the actual command being benchmarked—invoking the UI5 CLI `build` command directly via Node.js from the target UI5 CLI installation
* **export-markdown**: writes the benchmark results to `./bench.md` as a Markdown table, which is convenient for including in documentation or sharing
* **terminal-notifier**: *optional*. The final line sends a desktop notification once the benchmark completes, which is handy for long-running benchmarks. It requires [terminal-notifier](https://github.com/julienxx/terminal-notifier) to be installed and is macOS-only. Feel free to omit this line or replace it with an equivalent notification tool for your platform

## Setup

1. Install [hyperfine](https://github.com/sharkdp/hyperfine#installation)
2. Prepare the UI5 CLI repository *(optional if your development environment already reflects this)*:
    1. Clone [UI5 CLI](https://github.com/UI5/cli) (or your fork) and navigate into it
        ```sh
        git clone https://github.com/UI5/cli.git
        cd cli
        ```
        Make sure you check out the `main` branch, since we'll perform the baseline test first
    2. Install all dependencies in the repository (npm workspace):
        ```sh
        npm install
        ```
    3. Link the `@ui5/cli` package to make the `ui5` command available globally
        ```sh
        npm link --workspace @ui5/cli
        ```
    4. Verify your setup
        ```sh
        ui5 --version
        ```
        This should output the version and location of the UI5 CLI you just cloned.

        For example:
        ```
        5.0.0 (from /my/home/UI5/cli/packages/cli/bin/ui5.cjs)
        ```

3. Prepare your test project (we choose the UI5 [sample-app](https://github.com/UI5/sample-app))
    1. Clone the project
        ```sh
        git clone git@github.com:UI5/sample-app.git
        ```
    2. Navigate into the project
        ```sh
        cd sample-app
        ```
    3. Install any required npm dependencies
        ```sh
        npm install
        ```
        Note: We won't link UI5 CLI into this project. Instead, we'll call it directly.
    4. Verify that the previously installed UI5 CLI can be called with the following command:
        ```sh
        UI5_CLI_NO_LOCAL=X node /my/home/UI5/cli/packages/cli/bin/ui5.cjs --version
        ```
        On Windows:
        ```sh
        set UI5_CLI_NO_LOCAL=X
        node C:\my\home\UI5\cli\packages\cli\bin\ui5.cjs --version
        ```
        *(Replace the path to ui5.cjs with the one shown in the previous `ui5 --version` output)*

## Benchmarking

1. Depending on how reliable you'd like the measurements to be, consider preparing your system:
    1. Connect your computer to a power supply
    1. Make sure no updates or anti-virus scans are taking place
    1. Close all applications. This includes your IDE, since it might start indexing any new files created during the build, thus impacting I/O
    1. Don't interact with your system wile the benchmarking is running

1. Perform the baseline measurement
    1. In the project, start your first benchmark
        ```sh
        hyperfine --warmup 1 \
		  --env 'UI5_CLI_NO_LOCAL=X' \
          'node /my/home/ui5-cli-benchmark/ui5-cli/bin/ui5.cjs build' \
          --export-markdown ./baseline.md
        ```
        On Windows:
        ```sh
        set UI5_CLI_NO_LOCAL=X
        hyperfine --warmup 1 "node C:\my\home\UI5\cli\packages\cli\bin\ui5.cjs build" --export-markdown
 ./baseline.md
        ```
    1. Your baseline benchmark is now stored in `baseline.md` and should look similar to this:

        | Command | Mean [s] | Min [s] | Max [s] | Relative |
        |:---|---:|---:|---:|---:|
        | `UI5_CLI_NO_LOCAL=X node /my/home/UI5/cli/packages/cli/bin/ui5.cjs build` | 1.439 ± 0.036 | 1.400 | 1.507 | 1.00 |

1. Prepare your change
    1. Switch to the branch that contains your change
        ```sh
        git checkout my-change
        ```
    1. If your change requires different npm dependencies, reinstall them
        ```sh
        npm install
        ```
    2. The link from UI5 CLI is still in place.

2. Perform the change measurement
    1. In the project, start your second benchmark
        ```sh
        hyperfine --warmup 1 \
		  --env 'UI5_CLI_NO_LOCAL=X' \
          'node /my/home/ui5-cli-benchmark/ui5-cli/bin/ui5.cjs build' \
          --export-markdown ./my_change.md
        ```
        On Windows:
        ```sh
        set UI5_CLI_NO_LOCAL=X
        hyperfine --warmup 1 "node C:\my\home\UI5\cli\packages\cli\bin\ui5.cjs build" --export-markdown ./my_change.md
        ```
    2. Your change's benchmark is now stored in `my_change.md`

## Compile Results

1. Merge both measurements into one markdown
    1. In this setup, Hyperfine can't correctly calculate the relative difference between results. The respective column always reads "1". Either remove the "Relative" column or calculate the relative difference yourself:  
        * Use this formula to calculate the percentage increase based on the *Mean* result:  
            `(newMean - baselineMean) / baselineMean * 100`  
            JavaScript function:  
            ``` function calcDiff(baseVal, newVal) {return (newVal - baseVal) / baseVal * 100;}```

        * **Example for a performance improvement:**  
            Baseline of 10 seconds decreased to 7 seconds:  
            `(7-10)/10*100 = -30` => **-30%** change

        * **Example for a performance deterioration:**  
            Baseline of 10 seconds increased to 12 seconds:    
            `(12-10)/10*100 = 20` => **+20%** change

    1. Change the unit in the Mean/Min/Max column headers to seconds or milliseconds according to your results.
    1. Change the command column to only contain the relevant `ui5 build` command, including any parameters. E.g. `ui5 build --all`
    1. You should end up with a markdown like this:
        ```md
        | UI5/cli Ref | Command | Mean [s] | Min [s] | Max [s] | Relative |
        |:---|:---|---:|---:|---:|---:|
        | main ([`1234567`](https://github.com/UI5/cli/commit/<sha>)) | `ui5 build` | 1.439 ± 0.036 | 1.400 | 1.507 | Baseline |
        | feature-duck ([`9101112`](https://github.com/UI5/cli/commit/<sha>)) | `ui5 build` | 1.584 ± 0.074 | 1.477 | 1.680 | **+10%** |
        ```
        Rendering like this:

        | UI5/cli Ref | Command | Mean [s] | Min [s] | Max [s] | Relative |
        |:---|:---|---:|---:|---:|---:|
        | main ([`1234567`](https://github.com/UI5/cli/commit/<sha>)) | `ui5 build` | 1.439 ± 0.036 | 1.400 | 1.507 | Baseline |
        | feature-duck ([`9101112`](https://github.com/UI5/cli/commit/<sha>)) | `ui5 build` | 1.584 ± 0.074 | 1.477 | 1.680 | **+10%** |

1. You can now share these results on GitHub or wherever you might need them.

**Happy benchmarking! 🏎**
