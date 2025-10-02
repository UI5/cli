# Benchmarking UI5 CLI

For benchmarking UI5 CLI we typically make use of the open source tool [hyperfine](https://github.com/sharkdp/hyperfine).

In general we only benchmark calls to the UI5 CLI. However, we might add scripted benchmarks for some components in the future.

The following is a walk-through on how to evaluate the performance impact of an imaginary change in the UI5 Builder project.

## Setup

1. Install [hyperfine](https://github.com/sharkdp/hyperfine#installation)
1. Prepare the UI5 CLI projects you want to measure *(optional if your development environment already reflects this)*:
    1. Start in an empty directory
        ```sh
        mkdir ui5-cli-benchmark && cd ui5-cli-benchmark/
        ```
    1. Clone [UI5 CLI](https://github.com/SAP/ui5-cli)
        ```sh
        git clone git@github.com:SAP/ui5-cli.git
        ```
    1. Clone [UI5 Builder](https://github.com/SAP/ui5-builder) (or your fork)
        ```sh
        git clone git@github.com:SAP/ui5-builder.git
        ```
        Make sure you check out the `main` branch, since we'll perform the baseline test first
    1. Install npm dependencies in both directories
        ```sh
        (cd ui5-cli && npm install)
        (cd ui5-builder && npm install)
        ```
    1. Create global npm links for both projects
        ```sh
        (cd ui5-cli && npm link)
        (cd ui5-builder && npm link)
        ```
    1. Link UI5 Builder into UI5 CLI
        ```sh
        (cd ui5-cli && npm link @ui5/builder)
        ```
    1. Verify your setup
        ```sh
        ui5 --version
        ```
        This should output the version and location of the UI5 CLI you just cloned.

        For example:
        ```
        3.0.0 (from /my/home/ui5-cli-benchmark/ui5-cli/bin/ui5.cjs)
        ```

1. Prepare your test project (we choose the [openui5-sample-app](https://github.com/SAP/openui5-sample-app))
    1. Clone the project
        ```sh
        git clone git@github.com:SAP/openui5-sample-app.git
        ```
    1. Navigate into the project
        ```sh
        cd openui5-sample-app
        ```
    1. Install any required npm dependencies
        ```sh
        npm install
        ```
        Note: We won't link UI5 CLI into this project. Instead, we'll call it directly.
    1. Verify that the previously installed UI5 CLI can be called with the following command:
        ```sh
        UI5_CLI_NO_LOCAL=X node /my/home/ui5-cli-benchmark/ui5-cli/bin/ui5.cjs --version
        ```
        On Windows:
        ```sh
        set UI5_CLI_NO_LOCAL=X node /my/home/ui5-cli-benchmark/ui5-cli/bin/ui5.cjs --version
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
        'UI5_CLI_NO_LOCAL=X node /my/home/ui5-cli-benchmark/ui5-cli/bin/ui5.cjs build' \
        --export-markdown ./baseline.md
        ```
        On Windows:
        ```sh
        hyperfine --warmup 1 \
        'set UI5_CLI_NO_LOCAL=X node /my/home/ui5-cli-benchmark/ui5-cli/bin/ui5.cjs build' \
        --export-markdown ./baseline.md
        ```
    1. Your baseline benchmark is now stored in `baseline.md` and should look similar to this:

        | Command | Mean [s] | Min [s] | Max [s] | Relative |
        |:---|---:|---:|---:|---:|
        | `UI5_CLI_NO_LOCAL=X node /my/home/ui5-cli-benchmark/ui5-cli/bin/ui5.cjs build` | 1.439 ± 0.036 | 1.400 | 1.507 | 1.00 |

1. Prepare your change
    1. Switch to the branch that contains your change
        ```sh
        (cd ../ui5-builder && git checkout my-change)
        ```
    1. If your change requires different npm dependencies, reinstall them
        ```sh
        (cd ../ui5-builder && npm install)
        ```
    1. The link from UI5 CLI is still in place. However, if you have changes in **multiple** UI5 CLI modules, you might need to `npm link` those again

1. Perform the change measurement
    1. In the project, start your second benchmark
        ```sh
        hyperfine --warmup 1 \
        'UI5_CLI_NO_LOCAL=X node /my/home/ui5-cli-benchmark/ui5-cli/bin/ui5.cjs build' \
        --export-markdown ./my_change.md
        ```
        On Windows:
        ```sh
        hyperfine --warmup 1 \
        'set UI5_CLI_NO_LOCAL=X node /my/home/ui5-cli-benchmark/ui5-cli/bin/ui5.cjs build' \
        --export-markdown ./my_change.md
        ```
    1. Your change's benchmark is now stored in `my_change.md`

## Compile Results

1. Merge both measurements into one markdown
    1. In this setup, Hyperfine can't correctly calculate the relative difference between results. The respective column always reads "1". Either remove the "Relative" column or calculate the relative difference yourself:  
        * Use this formula to calculate the percentage increase based on the *Mean* result:  
            `(newMean - baselineMean) / baselineMean * 100`  
           ^^JavaScript function:^^  
            `#!js function calcDiff(baseVal, newVal) {return (newVal - baseVal) / baseVal * 100;}`

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
        ui5-builder Ref | Command | Mean [s] | Min [s] | Max [s] | Relative
        |:---|:---|---:|---:|---:|---:|
        | main ([`1234567`](https://github.com/SAP/ui5-builder/commit/<sha>)) | `ui5 build` | 1.439 ± 0.036 | 1.400 | 1.507 | Baseline |
        | feature-duck ([`9101112`](https://github.com/SAP/ui5-builder/commit/<sha>)) | `ui5 build` | 1.584 ± 0.074 | 1.477 | 1.680 | **+10%** |
        ```
        Rendering like this:

        | ui5-builder Ref | Command | Mean [s] | Min [s] | Max [s] | Relative |
        |:---|:---|---:|---:|---:|---:|
        | main ([`1234567`](https://github.com/SAP/ui5-builder/commit/<sha>)) | `ui5 build` | 1.439 ± 0.036 | 1.400 | 1.507 | Baseline |
        | feature-duck ([`9101112`](https://github.com/SAP/ui5-builder/commit/<sha>)) | `ui5 build` | 1.584 ± 0.074 | 1.477 | 1.680 | **+10%** |

1. You can now share these results on GitHub or wherever you might need them.

**Happy benchmarking! 🏎**
