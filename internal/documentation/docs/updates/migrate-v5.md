# Migrate to v5

::: tip Alpha Release Available
**UI5 CLI 5.0 Alpha is now available for testing! 🎉**

Try the alpha release in your projects via: `npm i --save-dev @ui5/cli@next`  
Or update your global install via: `npm i --global @ui5/cli@next`

**Note:** This is a pre-release version.
:::

## Breaking Changes

- **All UI5 CLI Modules require Node.js >= 22.20.0 or >= 24.0.0**

- **@ui5/cli: `ui5 init` defaults to Specification Version 5.0**

- **@ui5/project: New Component Type**

	A new project type `component` has been introduced with **Specification Version 5.0**. Component Type projects follow standardized conventions:
	- Source files in `/src` directory
	- Test files in `/test` directory

	See [RFC 0018](https://github.com/UI5/cli/blob/rfc-component-type/rfcs/0018-component-type.md) for details.

## Node.js and npm Version Support

This release requires **Node.js version v22.20.0 and higher or v24.0.0 and higher** as well as npm v8 or higher.
Support for older Node.js releases has been dropped; their use will cause an error.

## Specification Versions Support

UI5 CLI 5.x introduces **Specification Version 5.0**, which enables the new Component Type and brings improved project structure conventions.

Projects using older **Specification Versions** are expected to be **fully compatible with UI5 CLI v5**.

## UI5 CLI Init Command

The `ui5 init` command now generates projects with Specification Version 5.0 by default.

## Component Type

The `component` type feature aims to introduce a new project type within the UI5 CLI ecosystem to support the development of UI5 component-like applications intended to run in container apps such as the Fiori Launchpad (FLP) Sandbox or testsuite environments.

This feature will allow developers to serve and build multiple UI5 application components concurrently, enhancing the local development environment for integration scenarios.

**Note:** A component type project must contain both a `Component.js` and a `manifest.json` file in the source directory.

### Migrating from Application to Component Type

If you have an existing application that you'd like to migrate to the Component Type, follow these steps:

#### 1. Update ui5.yaml Configuration

Update your `ui5.yaml` file to use the Component Type and Specification Version 5.0:

::: code-group
```yaml [Before (Application)]
specVersion: "4.0"
type: application
metadata:
  name: my.sample.app
```

```yaml [After (Component)]
specVersion: "5.0"
type: component
metadata:
  name: my.sample.app
```
:::

#### 2. Restructure Project Directories

Component Type follows a standardized directory structure:

- **Move `/webapp` to `/src`** - The source directory is now named `src` instead of `webapp`
- **Move `/webapp/test` to `/test`** - Test files are now at the project root level

::: code-group
```text [Before (Application)]
my-app/
├── ui5.yaml
├── package.json
└── webapp/
    ├── Component.js
    ├── manifest.json
    ├── index.html
    ├── controller/
    ├── view/
    └── test/
        ├── integration/
        └── unit/
```

```text [After (Component)]
my-app/
├── ui5.yaml
├── package.json
├── src/
│   ├── Component.js
│   ├── manifest.json
│   ├── controller/
│   └── view/
└── test/
    ├── index.html
    ├── integration/
    └── unit/
```
:::


## Learn More

- [Configuration: Specification Version 5.0](../pages/Configuration#specification-version-5-0)
- [RFC 0018: Component Type](https://github.com/UI5/cli/blob/rfc-component-type/rfcs/0018-component-type.md)
