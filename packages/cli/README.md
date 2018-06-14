![UI5 icon](https://raw.githubusercontent.com/SAP/ui5-tooling/master/docs/images/UI5_logo_wide.png)

# ui5-cli
> UI5 Command Line Interface  
> Part of the [UI5 Build and Development Tooling](https://github.com/SAP/ui5-tooling)

[![Travis CI Build Status](https://travis-ci.org/SAP/ui5-cli.svg?branch=master)](https://travis-ci.org/SAP/ui5-cli)
[![npm Package Version](https://img.shields.io/npm/v/@ui5/cli.svg)](https://www.npmjs.com/package/@ui5/cli)

**This is an alpha release!**  
**The UI5 Build and Development Tooling described here is not intended for productive use yet. Breaking changes are to be expected.**

## Installing the UI5 CLI
### Requirements
- [Node.js](https://nodejs.org/) (**version must be 8.3 or higher** ⚠️)

### Installation
```sh
npm install --global @ui5/cli

# Verify installation
ui5 --help
```

## CLI Usage
### Overview
```
Usage: ui5 <command> [options]

Commands:
  build  Build project in current directory
  serve  Start a webserver for the current project
  tree   Outputs the dependency tree of the current project to stdout. It takes all relevant parameters of ui5 build into account.

Options:
  --help, -h            Show help  [boolean]
  --version, -v         Show version number  [boolean]
  --config              Path to config file  [string]
  --translator, --t8r   Translator to use. Including optional colon separated translator parameters.  [string] [default: "npm"]
  --verbose             Enable verbose logging. [boolean]
  --loglevel            Set the logging level (error|warn|info|verbose|silly).  [string] [default: "info"]

Examples:
  ui5 <command> --translator static:/path/to/projectDependencies.yaml  Execute command using a "static" translator with translator parameters
  ui5 <command> --config /path/to/ui5.yaml                         Execute command using a project configuration from custom path
```

### Commands
#### build
`ui5 build [options]` builds the project in the current directory.
```
Commands:
  dev             Dev build: Skips non-essential and time-intensive tasks during build
  preload         (default) Build project and create preload bundles
  self-contained  Build project and create self-contained bundle

Options:
  --help, -h             Show help  [boolean]
  --version, -v          Show version number  [boolean]
  --config               Path to config file  [string]
  --translator, --t8r    Translator to use. Including optional colon separated translator parameters.  [string] [default: "npm"]
  --verbose              Enable verbose logging. [boolean]
  --loglevel             Set the logging level (error|warn|info|verbose|silly).  [string] [default: "info"]
  --all, -a              Include all project dependencies into build process
  --dest                 Path of build destination  [string] [default: "./dist"]
  --dev                  Dev mode: skips non-essential and time-intensive tasks during build  [boolean]
  --dev-exclude-project  A list of specific projects to be excluded from dev mode (dev mode must be active for this to be effective)  [array]
  --include-task         A list of specific tasks to be included to the default/dev set  [array]
  --exclude-task         A list of specific tasks to be excluded from default/dev set  [array]

Examples:
  ui5 build --all                                                                      Preload build for project and dependencies to "./dist"
  ui5 build --all --exclude-task=* --include-task=createDebugFiles generateAppPreload  Build project and dependencies but only apply the createDebugFiles- and generateAppPreload tasks
  ui5 build --all --include-task=createDebugFiles --exclude-task=generateAppPreload    Build project and dependencies by applying all default tasks including the createDebugFiles task and excluding the generateAppPreload task
  ui5 build dev --all --dev-exclude-project=sap.ui.core sap.m                          Build project and dependencies in dev mode, except "sap.ui.core" and "sap.m" (useful in combination with --include-task)
  ui5 build dev                                                                        Build project and dependencies in dev mode. Only a set of essential tasks is executed.
```
#### serve
`ui5 serve [options]` starts a webserver for the current project.
```
Options:
  --help, -h                    Show help  [boolean]
  --version, -v                 Show version number  [boolean]
  --config                      Path to config file  [string]
  --translator, --t8r           Translator to use. Including optional colon separated translator parameters.  [string] [default: "npm"]
  --verbose                     Enable verbose logging. [boolean]
  --loglevel                    Set the logging level (error|warn|info|verbose|silly).  [string] [default: "info"]
  --port, -p                    Port to bind on (default for HTTP: 8080, HTTP/2: 8443)  [number]
  --open, -o                    Open webserver root directory in default browser. Optionally, supplied relative path will be appended to the root URL  [string]
  --h2                          Shortcut for enabling the HTTP/2 protocol for the webserver  [boolean] [default: false]
  --accept-remote-connections   Accept remote connections. By default the server only accepts connections from localhost  [boolean] [default: false]
  --key                         Path to the private key  [string] [default: "$HOME/.ui5/server/server.key"]
  --cert                        Path to the certificate  [string] [default: "$HOME/.ui5/server/server.crt"]

Examples:
  ui5 serve                                                    Start a webserver for the current project
  ui5 serve --h2                                               Enable the HTTP/2 protocol for the webserver (requires SSL certificate)
  ui5 serve --config /path/to/ui5.yaml                         Use the project configuration from a custom path
  ui5 serve --translator static:/path/to/projectDependencies.yaml  Use a "static" translator with translator parameters.
  ui5 serve --port 1337 --open tests/QUnit.html                Listen to port 1337 and launch default browser with http://localhost:1337/test/QUnit.html
```
#### tree
`ui5 tree [options]` outputs the dependency tree of the current project to *stdout*. It takes all relevant parameters of ui5 build into account.
```
Options:
  --help, -h            Show help  [boolean]
  --version, -v         Show version number  [boolean]
  --config              Path to config file  [string]
  --translator, --t8r   Translator to use. Including optional colon separated translator parameters.  [string] [default: "npm"]
  --verbose             Enable verbose logging. [boolean]
  --loglevel            Set the logging level (error|warn|info|verbose|silly).  [string] [default: "info"]
  --full                Include more information (currently the project configuration)  [boolean]
  --json                Output tree as formatted JSON string  [boolean]

Examples:
  ui5 tree > tree.txt          Pipes the dependency tree into a new file "tree.txt"
  ui5 tree --json > tree.json  Pipes the dependency tree into a new file "tree.json"
```

#### init
`ui5 init [options]` initializes the UI5 Build and Development Tooling configuration for an application or library project.
```
Options:
  --help, -h            Show help  [boolean]
  --version, -v         Show version number  [boolean]
  --config              Path to config file  [string]
  --translator, --t8r   Translator to use. Including optional colon separated translator parameters.  [string] [default: "npm"]
  --verbose             Enable verbose logging. [boolean]
  --loglevel            Set the logging level (error|warn|info|verbose|silly).  [string] [default: "info"]
```

## Contributing
Please check our [Contribution Guidelines](https://github.com/SAP/ui5-tooling/blob/master/CONTRIBUTING.md).

## Support
Please follow our [Contribution Guidelines](https://github.com/SAP/ui5-tooling/blob/master/CONTRIBUTING.md#report-an-issue) on how to report an issue.

## Release History
See [CHANGELOG.md](CHANGELOG.md).

## License
This project is licensed under the Apache Software License, Version 2.0 except as noted otherwise in the [LICENSE](/LICENSE.txt) file.
