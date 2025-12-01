# Benchmarking UI5 CLI

For benchmarking UI5 CLI we typically make use of the open source tool [hyperfine](https://github.com/sharkdp/hyperfine).

In general we only benchmark calls to the UI5 CLI. However, we might add scripted benchmarks for some components in the future.

The following is a walk-through on how to evaluate the performance impact of changes to the UI5 CLI `build` command.

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
        'UI5_CLI_NO_LOCAL=X node /my/home/UI5/cli/packages/cli/bin/ui5.cjs build' \
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
        'UI5_CLI_NO_LOCAL=X node /my/home/UI5/cli/packages/cli/bin/ui5.cjs build' \
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
