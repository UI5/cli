# UI5 CLI
## Requirements
- [Node.js](https://nodejs.org/) version v20.11.0 and higher or v22.0.0 and higher (v21 is not supported)
- [npm](https://www.npmjs.com/) version v8.0.0 or higher

## Installation

Install the CLI using the npm package manager:

```sh
npm install --global @ui5/cli

# Verify installation
ui5 --help
```

## Usage/Syntax

`
 ui5 <command> [options]
`

The CLI automatically checks for updates using [update-notifier](https://github.com/yeoman/update-notifier). While this is skipped in CI environments, you might also opt-out manually by following the steps described [here](https://github.com/yeoman/update-notifier/blob/-/readme.md#user-settings).

## Common options

These options you can use with each command.

| Option | Description | Details |
| --- | --- | --- |
| -h, --help | Show help | [boolean] |
| -v, --version | Show version number | [boolean] |
| -c, --config | Path to project configuration file in YAML format | [string] |
| --dependency-definition | Path to a YAML file containing the project&#x27;s dependency tree. This option will disable resolution of node package dependencies. | [string] |
| --workspace-config | Path to workspace configuration file in YAML format | [string] |
| -w, --workspace | Name of the workspace configuration to use | [string] [default: &quot;default&quot;] |
| --loglevel, --log-level | Set the logging level | [string] [choices: &quot;silent&quot;, &quot;error&quot;, &quot;warn&quot;, &quot;info&quot;, &quot;perf&quot;, &quot;verbose&quot;, &quot;silly&quot;] [default: &quot;info&quot;] |
| --verbose | Enable verbose logging. | [boolean] [default: false] |
| --perf | Enable performance measurements and related logging. | [boolean] [default: false] |
| --silent | Disable all log output. | [boolean] [default: false] |

## Examples

Execute command using a static dependency tree instead of resolving node package dependencies
```
ui5 <command> --dependency-definition /path/to/projectDependencies.yaml
```
Execute command using a project configuration from custom path
```
ui5 <command> --config /path/to/ui5.yaml
```
Execute command using the &#x27;dolphin&#x27; workspace of a ui5-workspace.yaml
```
ui5 <command> --workspace dolphin
```
Execute command with the maximum log output
```
ui5 <command> --log-level silly
```

## Commands

### ui5 add

**Description**

Add SAPUI5/OpenUI5 framework libraries to the project configuration.

**Usage**

`
ui5 add [--development] [--optional] <framework-libraries..>
`


**Options**

| Option | Description | Details |
| --- | --- | --- |
| -D, --development, --dev | Add as development dependency | [boolean] [default: false] |
| -O, --optional | Add as optional dependency | [boolean] [default: false] |

**Positionals**

| Positional | Description | Details |
| --- | --- | --- |
| framework-libraries | Framework library names | [array] [required] [default: []] |

**Examples**

Add the framework libraries sap.ui.core and sap.m as dependencies
```
ui5 add sap.ui.core sap.m
```
Add the framework library sap.ui.support as development dependency
```
ui5 add -D sap.ui.support
```
Add the framework library themelib_sap_fiori_3 as optional dependency
```
ui5 add --optional themelib_sap_fiori_3
```
### ui5 build

**Description**

Build project in current directory

**Usage**

`
ui5 build
`

**Child Commands**

| Command | Description |
| --- | --- |
| ui5 build jsdoc | Build JSDoc resources |
| ui5 build preload | (default) Build project and create preload bundles |
| ui5 build self-contained | Build project and create self-contained bundle. Recommended to be used in conjunction with --include-all-dependencies |

**Options**

| Option | Description | Details |
| --- | --- | --- |
| -a, --include-all-dependencies, --all | Include all dependencies in the build result. This is equivalent to &#x27;--include-dependency &quot;*&quot;&#x27; | [boolean] [default: false] |
| --include-dependency | A list of dependencies to be included in the build result. You can use the asterisk &#x27;*&#x27; as an alias for including all dependencies in the build result. The listed dependencies cannot be overruled by dependencies defined in &#x27;exclude-dependency&#x27;. The provided name must match with the dependency name shown in &#x27;ui5 ls --flat&#x27; | [array] |
| --include-dependency-regexp | A list of regular expressions defining dependencies to be included in the build result. This list is prioritized like &#x27;include-dependency&#x27;. | [array] |
| --include-dependency-tree | A list of dependencies to be included in the build result. Transitive dependencies are implicitly included and do not need to be part of this list. These dependencies overrule the selection of &#x27;exclude-dependency-tree&#x27; but can be overruled by &#x27;exclude-dependency&#x27;. | [array] |
| --exclude-dependency | A list of dependencies to be excluded from the build result. The listed dependencies can be overruled by dependencies defined in &#x27;include-dependency&#x27;. The provided name must match with the dependency name shown in &#x27;ui5 ls --flat&#x27; | [array] |
| --exclude-dependency-regexp | A list of regular expressions defining dependencies to be excluded from the build result. This list is prioritized like &#x27;exclude-dependency&#x27;. | [array] |
| --exclude-dependency-tree | A list of dependencies to be excluded from the build result. Transitive dependencies are implicitly included and do not need to be part of this list. | [array] |
| --dest | Path of build destination | [string] [default: &quot;./dist&quot;] |
| --clean-dest | If present, clean the destination directory before building | [boolean] [default: false] |
| --create-build-manifest | Store build metadata in a &#x27;.ui5&#x27; directory in the build destination, allowing reuse of the build result in other builds | [boolean] [default: false] |
| --include-task | A list of tasks to be added to the default execution set. This option takes precedence over any excludes. | [array] |
| --exclude-task | A list of tasks to be excluded from the default task execution set | [array] |
| --framework-version | Overrides the framework version defined by the project. Takes the same value as the version part of &quot;ui5 use&quot; | [string] |
| --cache-mode | Cache mode to use when consuming SNAPSHOT versions of framework dependencies. The &#x27;Default&#x27; behavior is to invalidate the cache after 9 hours. &#x27;Force&#x27; uses the cache only and does not create any requests. &#x27;Off&#x27; invalidates any existing cache and updates from the repository | [string] [choices: &quot;Default&quot;, &quot;Force&quot;, &quot;Off&quot;] [default: &quot;Default&quot;] |
| --experimental-css-variables | Generate CSS variables (css-variables.css, css-variables.source.less) and skeleton (library-skeleton(-RTL).css) for all themes | [boolean] [default: false] |
| --output-style | Processes build results into a specific directory structure.<br>- Flat: Omits the project namespace and the &quot;resources&quot; directory.<br>- Namespace: Respects the project namespace and the &quot;resources&quot; directory, maintaining the original structure.<br>- Default: The default directory structure for every project type. For applications, this is identical to &quot;Flat&quot;, and for libraries, it is &quot;Namespace&quot;. Other types have a more distinct default output style. | [string] [choices: &quot;Default&quot;, &quot;Flat&quot;, &quot;Namespace&quot;] [default: &quot;Default&quot;] |


**Examples**

Preload build for project without dependencies
```
ui5 build
```
Self-contained build for project
```
ui5 build self-contained
```
Build project but only apply the minify- and generateComponentPreload tasks
```
ui5 build --exclude-task=* --include-task=minify generateComponentPreload
```
Build project by applying all default tasks including the minify task and excluding the generateComponentPreload task
```
ui5 build --include-task=minify --exclude-task=generateComponentPreload
```
Preload build with experimental CSS variables artifacts
```
ui5 build --experimental-css-variables
```
### ui5 config

**Description**

Get and set UI5 CLI configuration options

**Usage**

`
ui5 config
`

**Child Commands**

| Command | Description |
| --- | --- |
| ui5 config set <option> [value] | Set the value for a given configuration option. Clear an existing configuration by omitting the value |
| ui5 config get <option> | Get the value for a given configuration option |
| ui5 config list | Display the current configuration |



**Examples**

Set a value for the ui5DataDir configuration
```
ui5 config set ui5DataDir /path/to/.ui5
```
Unset the current value of the ui5DataDir configuration
```
ui5 config set ui5DataDir
```
### ui5 init

**Description**

Initialize the UI5 CLI configuration for an application or library project.

**Usage**

`
ui5 init
`




### ui5 remove

**Description**

Remove SAPUI5/OpenUI5 framework libraries from the project configuration.

**Usage**

`
ui5 remove <framework-libraries..>
`



**Positionals**

| Positional | Description | Details |
| --- | --- | --- |
| framework-libraries | Framework library names | [array] [required] [default: []] |

**Examples**

Remove the framework libraries sap.ui.core and sap.m as dependencies
```
ui5 remove sap.ui.core sap.m
```
### ui5 serve

**Description**

Start a web server for the current project

**Usage**

`
ui5 serve
`


**Options**

| Option | Description | Details |
| --- | --- | --- |
| -p, --port | Port to bind on (default for HTTP: 8080, HTTP/2: 8443) | [number] |
| -o, --open | Open web server root directory in default browser. Optionally, supplied relative path will be appended to the root URL | [string] |
| --h2 | Shortcut for enabling the HTTP/2 protocol for the web server | [boolean] [default: false] |
| --simple-index | Use a simplified view for the server directory listing | [boolean] [default: false] |
| --accept-remote-connections | Accept remote connections. By default the server only accepts connections from localhost | [boolean] [default: false] |
| --key | Path to the private key | [string] [default: &quot;~/.ui5/server/server.key&quot;] |
| --cert | Path to the certificate | [string] [default: &quot;~/.ui5/server/server.crt&quot;] |
| --sap-csp-policies | Always send content security policies &#x27;sap-target-level-1&#x27; and &#x27;sap-target-level-3&#x27; in report-only mode | [boolean] [default: false] |
| --serve-csp-reports | Collects and serves CSP reports upon request to &#x27;/.ui5/csp/csp-reports.json&#x27; | [boolean] [default: false] |
| --framework-version | Overrides the framework version defined by the project. Takes the same value as the version part of &quot;ui5 use&quot; | [string] |
| --cache-mode | Cache mode to use when consuming SNAPSHOT versions of framework dependencies. The &#x27;Default&#x27; behavior is to invalidate the cache after 9 hours. &#x27;Force&#x27; uses the cache only and does not create any requests. &#x27;Off&#x27; invalidates any existing cache and updates from the repository | [string] [choices: &quot;Default&quot;, &quot;Force&quot;, &quot;Off&quot;] [default: &quot;Default&quot;] |


**Examples**

Start a web server for the current project
```
ui5 serve
```
Enable the HTTP/2 protocol for the web server (requires SSL certificate)
```
ui5 serve --h2
```
Use the project configuration from a custom path
```
ui5 serve --config /path/to/ui5.yaml
```
Use a static dependency definition file
```
ui5 serve --dependency-definition /path/to/projectDependencies.yaml
```
Listen to port 1337 and launch default browser with http://localhost:1337/test/QUnit.html
```
ui5 serve --port 1337 --open tests/QUnit.html
```
### ui5 tree

**Description**

Outputs the dependency tree of the current project to stdout. It takes all relevant parameters of ui5 build into account.

**Usage**

`
ui5 tree
`


**Options**

| Option | Description | Details |
| --- | --- | --- |
| --flat | Output a flat list of all dependencies instead of a tree hierarchy | [boolean] [default: false] |
| --level | Limit the number of levels shown in the tree hierarchy | [number] |
| --framework-version | Overrides the framework version defined by the project. Takes the same value as the version part of &quot;ui5 use&quot; | [string] |
| --cache-mode | Cache mode to use when consuming SNAPSHOT versions of framework dependencies. The &#x27;Default&#x27; behavior is to invalidate the cache after 9 hours. &#x27;Force&#x27; uses the cache only and does not create any requests. &#x27;Off&#x27; invalidates any existing cache and updates from the repository | [string] [choices: &quot;Default&quot;, &quot;Force&quot;, &quot;Off&quot;] [default: &quot;Default&quot;] |
|  |  |  |


### ui5 use

**Description**

Initialize or update the project&#x27;s framework configuration.

**Usage**

`
ui5 use <framework-info>
`



**Positionals**

| Positional | Description | Details |
| --- | --- | --- |
| framework-info | Framework name, version or both (name@version).<br>Name can be &quot;SAPUI5&quot; or &quot;OpenUI5&quot; (case-insensitive).<br>Version can be &quot;latest&quot; (default), a version or range according to the Semantic Versioning specification (https://semver.org/), or a tag available in the npm registry.<br>For SAP-internal usage the version can also be &quot;latest-snapshot&quot;, a version or range ending with -SNAPSHOT, or a simplified range such as &quot;1-SNAPSHOT&quot;, &quot;1.x-SNAPSHOT&quot; or &quot;1.108-SNAPSHOT&quot;. | [string] [required] |

**Examples**

Use SAPUI5 in the latest available version
```
ui5 use sapui5@latest
```
Use OpenUI5 in the latest available 1.76 patch version
```
ui5 use openui5@1.76
```
Use the latest available version of the configured framework
```
ui5 use latest
```
Use OpenUI5 in the latest available version
```
ui5 use openui5
```
### ui5 versions

**Description**

Shows the versions of all UI5 CLI modules

**Usage**

`
ui5 versions
`





## Local vs. Global Installation
In general, we recommend a global installation of the UI5 CLI (`npm install --global @ui5/cli`).

However, it makes sense to add the UI5 CLI as a [devDependency](https://docs.npmjs.com/files/package.json#devdependencies) (`npm install --save-dev @ui5/cli`) to a project's `package.json`. This ensures that every developer working on the project uses the same version of the UI5 CLI and your continuous integration environments also uses this version.

In case you have both, a local installation in one of your projects as well as a global installation, the UI5 CLI will always try to invoke the local installation. This is in part because [npm scripts](https://docs.npmjs.com/misc/scripts) defined in your `package.json` will also always invoke the local installation.

This behavior can be disabled by setting the environment variable `UI5_CLI_NO_LOCAL`.

**Example**  
You have a project located in the directory `/my-application`.

You have installed the UI5 CLI globally. In addition, the project's `package.json` defines a `devDependency` to `@ui5/cli` and a start script `"ui5 serve"`. This means there are at least two installations of `@ui5/cli` on your system. Their versions might not match.

This table illustrates which of the two installations is used in different scenarios. Note how the UI5 CLI always tries to prefer the version installed in the project.

| Current Working Directory | Command                         | Global UI5 CLI | Local UI5 CLI  |
| ------------------------- | ------------------------------- | :-----------------------------: | :----------------------------: |
| `/`                       |  `ui5 --version`                |  enabled                        |
| `/my-application`         |  `ui5 --version`                |                                 |  enabled                       |
| `/my-application`         |  `ui5 serve`                    |                                 |  enabled                       |
| `/my-application`         |  `UI5_CLI_NO_LOCAL=X ui5 serve` |  enabled                        |
| `/my-application`         |  `npm start`                    |                                 |  enabled                       |
| `/my-application`         |  `UI5_CLI_NO_LOCAL=X npm start` |                                 |  enabled                       |
