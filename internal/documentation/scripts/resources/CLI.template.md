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
{{common}}
`

The CLI automatically checks for updates using [update-notifier](https://github.com/yeoman/update-notifier). While this is skipped in CI environments, you might also opt-out manually by following the steps described [here](https://github.com/yeoman/update-notifier/blob/-/readme.md#user-settings).

## Common options

These options you can use with each command.

| Option | Description | Details |
| --- | --- | --- |
{{#each commonOptions}}
| {{commonOption}} | {{commonOptionDescription}} | {{commonOptionDetails}} |
{{/each}}

## Examples

{{#each commonExamples}}
{{commonExampleDescription}}
```
{{commonExample}}
```
{{/each}}

## Commands

{{#each commands}}
### {{command}}

**Description**

{{description}}

**Usage**

`
{{usage}}
`

{{#if childCommands}}
**Child Commands**

| Command | Description |
| --- | --- |
{{#each childCommands}}
| {{childCommand}} | {{commandDescription}} |
{{/each}}
{{/if}}

{{#if options}}
**Options**

| Option | Description | Details |
| --- | --- | --- |
{{#each options}}
| {{option}} | {{optionDescription}} | {{optionDetails}} |
{{/each}}
{{/if}}

{{#if positionals}}
**Positionals**

| Positional | Description | Details |
| --- | --- | --- |
{{#each positionals}}
| {{positional}} | {{positionalDescription}} | {{positionalDetails}} |
{{/each}}
{{/if}}

{{#if examples}}
**Examples**

{{#each examples}}
{{exampleDescription}}
```
{{example}}
```
{{/each}}
{{/if}}
{{/each}}

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
