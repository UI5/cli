# Migrate to v5

::: tip Alpha Release Available
**UI5 CLI 5.0 Alpha is now available for testing! 🎉**

Try the alpha release in your projects via: `npm i --save-dev @ui5/cli@next`  
Or update your global install via: `npm i --global @ui5/cli@next`

**Note:** This is a pre-release version.
:::

## Breaking Changes

- **All UI5 CLI Modules require Node.js ^22.20.0 || >=24.0.0**

- **@ui5/cli: `ui5 init` defaults to Specification Version 5.0**


## Node.js and npm Version Support

This release requires **Node.js version v22.20.0 and higher or v24.0.0 and higher (v23 is not supported)** as well as npm v8 or higher.
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

#### 1. Update `ui5.yaml` Configuration

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

- **Move `/webapp/test` to `/test`** - Test files are now at the project root level
- **Move `/webapp` to `/src`** - The source directory is now named `src` instead of `webapp`

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

#### 3. Adjust `index.html`

The `index.html` file is typically moved from `/webapp` to `/test` since it's primarily used for testing the component.

Update the bootstrap script path and remove the obsolete `data-sap-ui-resource-roots` configuration:

::: code-group
```html [Before (webapp/index.html)]
<script
    id="sap-ui-bootstrap"
    src="resources/sap-ui-core.js"
    data-sap-ui-libs="sap.m"
    data-sap-ui-theme="sap_horizon"
    data-sap-ui-resource-roots='{
        "sap.ui.demo.todo": "./"
    }'
    data-sap-ui-on-init="module:sap/ui/core/ComponentSupport"
    data-sap-ui-async="true">
</script>
```

```html [After (test/index.html)]
<script
    id="sap-ui-bootstrap"
    src="../../../../../resources/sap-ui-core.js"
    data-sap-ui-libs="sap.m"
    data-sap-ui-theme="sap_horizon"
    data-sap-ui-on-init="module:sap/ui/core/ComponentSupport"
    data-sap-ui-async="true">
</script>
```
:::


#### 4. Adjust `testsuite.qunit.html`

Simplify the test suite HTML by removing obsolete bootstrap attributes:

::: code-group
```html [Before (webapp/test/testsuite.qunit.html)]
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>QUnit test suite for Todo App</title>
    <script
        src="../resources/sap/ui/test/starter/createSuite.js"
        data-sap-ui-testsuite="test-resources/sap/ui/demo/todo/testsuite.qunit"
        data-sap-ui-resource-roots='{
            "test-resources.sap.ui.demo.todo": "./"
        }'
    ></script>
</head>
<body>
</body>
</html>
```

```html [After (test/testsuite.qunit.html)]
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>QUnit test suite for Todo App</title>
    <script src="../../../../../resources/sap/ui/test/starter/createSuite.js"></script>
</head>
<body>
</body>
</html>
```
:::

**Changes:**
- Remove the `data-sap-ui-testsuite` attribute
- Remove the `data-sap-ui-resource-roots` attribute
- Update the `src` path to the correct relative location

#### 5. Adjust `testsuite.qunit.js`

Update the test suite configuration to remove obsolete path mappings:

::: code-group
```js [Before]
sap.ui.define(function () {
    return {
        name: "QUnit test suite for Todo App",
        defaults: {
            page: "ui5://test-resources/sap/ui/demo/todo/Test.qunit.html?testsuite={suite}&test={name}",
            qunit: {
                version: 2
            },
            loader: {
                paths: {
                    "sap/ui/demo/todo": "../"
                }
            }
        },
        tests: {
            // ... test definitions
        }
    };
});
```

```js [After]
sap.ui.define(function () {
    return {
        name: "QUnit test suite for Todo App",
        defaults: {
            qunit: {
                version: 2
            }
        },
        tests: {
            // ... test definitions
        }
    };
});
```
:::

#### 6. Delete Obsolete Test Files

Delete the custom `Test.qunit.html` file from your test directory. This file is no longer needed. The framework-provided test page can now be used directly.

#### 7. Update Test Runner Script

If you use the UI5 Test Runner in your `package.json`, update the test URL to reflect the new path structure:

::: code-group
```json [Before]
{
    "scripts": {
        "test-runner": "ui5-test-runner --url http://localhost:8080/test/testsuite.qunit.html"
    }
}
```

```json [After]
{
    "scripts": {
        "test-runner": "ui5-test-runner --url http://localhost:8080/test-resources/sap/ui/demo/todo/testsuite.qunit.html"
    }
}
```
:::

The test suite is now served under the standard `/test-resources/` path with the component's full namespace


## Learn More

- [Configuration: Specification Version 5.0](../pages/Configuration#specification-version-5-0)
- [RFC 0018: Component Type](https://github.com/UI5/cli/blob/c8771aa63964fcf1e3d322b1376dbefe44c73652/rfcs/0018-component-type.md)
