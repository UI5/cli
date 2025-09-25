- Start Date: 2023-02-17
- RFC PR: [#787](https://github.com/UI5/cli/pull/787)
- Issue: -
- Affected components <!-- Check affected components by writing an "X" into the brackets -->
    + [ ] [ui5-builder](./packages/builder)
    + [ ] [ui5-server](./packages/server)
    + [x] [ui5-cli](./packages/cli)
    + [ ] [ui5-fs](./packages/fs)
    + [x] [ui5-project](./packages/project)
    + [ ] [ui5-logger](./packages/logger)


# RFC 0013 Configuration

## Summary

Introduce a central and project-independent configuration for UI5 CLI.

## Motivation

New UI5 CLI features demand specific input from the user. This is generally information which can be treated independent of any project but specific to the user's system and environment. For example a URL to a registry from which UI5 CLI should fetch resources from. Or directory paths which UI5 CLI should use to store data.

As to not request the same information from a user multiple times, the provided input should be persisted between sessions.

## Detailed design

### Configuration Module

Introduce a new module `Configuration.js` to @ui5/project. A PoC can be found here: [[INTERNAL][POC] Add Configuration.js #575](https://github.com/SAP/ui5-project/pull/575)

This module shall contain a `Configuration` class which holds all information in memory. The constructor shall accept a configuration object, and **dedicated getter-functions** shall provide **access to single configuration values**. There shall not be a generic `get(paramName)` function.

For now, this class should provide **read-only API** (no setters). This means once an instance is created, it's configuration is immutable.

All configuration parameters shall use primitive types only. Parameters shall not have default values. The configuration object shall be a **flat object** containing all parameters as keys. No highly sensitive data like passwords shall be stored in the configuration.

UI5 CLI extensions shall not gain access to this configuration.

There shall not be any fallback mechanism to environment variables or similar inside the `Configuration.js` module. This should rather be implemented in the module ultimately using the information, so that it will behave the same when used directly via Node.js API.

The `Configuration` class shall not access the file system directly. Persistence shall be handled separately: See chapter [Persistence](#persistence).

### Configuration Usage

A Configuration instance might be created in the [`graph.js`](https://github.com/SAP/ui5-project/blob/1fd5f40a7f46c5883ef66e1926c854815093abe4/lib/graph/graph.js) module. Ideally, the instance is only used there and not passed to any other modules. Instead, single configuration parameters shall be retrieved from the Configuration instance and passed **as single parameters**.

It should be avoided to add the `Configuration` class to the signature of other modules. This would make it harder to use those APIs individually, without a Configuration instance.

Ideally, interaction with the `Configuration` class in UI5 CLI is limited to very few modules. Ideally all located in @ui5/project.

### Persistence

UI5 CLI configuration shall be persisted in a `.ui5rc` file located in the user's home directory. In the future, an inheritance mechanism might be implemented, where `.ui5rc` files located in a project can override configuration of the "global" `.ui5rc`.

Dedicated methods, located in the same `Configuration.js` module as the `Configuration` class, shall interact with this file. They should be able to create a `Configuration` instance based on the content and respectively save a `Configuration` into the `.ui5rc`

**Example structure of a `.ui5rc` file:**

```json
{
	"dataDir": "~/.ui5",
	"mavenSnapshotEndpointUrl": "https://<hostname>/artifactory/build-snapshots/"
}
```

### Changing Configuration

To initialize and change configuration, @ui5/cli shall implement dedicated functionality to create and update the described `.ui5rc` files. It would need to interact with the `Configuration` module in @ui5/project as it would be the interface to modify the `.ui5rc` files.

CLI commands and arguments ideally should be similar to the syntax of `git config` and `npm config`.
The following commands would be helpful for maintaining the configuration:

- `ui5 config list`: Lists the configurations stored in `.ui5rc`
- `ui5 config get <key>`: Retrieves a record from `.ui5rc`
- `ui5 config set <key> <value>`: Sets a record in the `.ui5rc`
- `ui5 config set <key>`: By omitting the value, a record is removed from the `.ui5rc`

## How we teach this

* UI5 CLI documentation
* This RFC

## Drawbacks

<!-- Why should we not do this? Please consider the impact on teaching people to use the UI5 CLI, on the integration of this feature with existing and planned features, on the impact of churn on existing users.

There are trade-offs to choosing any path, please attempt to identify them here. -->

## Alternatives

Without a central configuration, users would have to provide all information as CLI parameters or environment variables. Both require additional knowledge on the user side and with that, are likely to cause more support efforts on UI5 CLI side.

## Unresolved Questions and Bikeshedding

*This section should be removed (i.e. resolved) before merging*

