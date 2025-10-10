---
next:
  text: 'Getting Started'
  link: '/pages/GettingStarted'
---

![UI5 logo](../images/UI5_logo_wide.png) { .light-only }

![UI5 logo](../images/UI5_logo_wide_dark.svg) { .dark-only }

# UI5 CLI

An open and modular toolchain to develop state-of-the-art applications based on the [UI5](https://ui5.sap.com) framework.

::: warning Project Rename
**UI5 Tooling has been renamed to UI5 CLI 🚨**

Read the announcement blog post: **[SAP Community: Goodbye UI5 Tooling - Hello UI5 CLI!](https://community.sap.com/t5/technology-blog-posts-by-sap/goodbye-ui5-tooling-hello-ui5-cli/ba-p/14211769)**
:::

::: tip New Release
**UI5 CLI V4 is here 🎉**

Read the announcement blog post: **[SAP Community: UI5 CLI 4.0](https://community.sap.com/t5/technology-blogs-by-sap/ui5-tooling-4-0/ba-p/13769578)**

And checkout the **[Migrate to v4](../updates/migrate-v4)** documentation.
:::

<script setup>
import VPButton from "vitepress/dist/client/theme-default/components/VPButton.vue"
</script>

<VPButton class="margin-button" text="🚀 Get Started" href="./GettingStarted"/>

<style>
.margin-button {
  margin: 2rem 0;
}

/* Theme-based image visibility */
.light-only {
    visibility: visible;
}

.dark-only {
    visibility: hidden;
    position: absolute;
}

html.dark .light-only {
    visibility: hidden;
    position: absolute;
}

html.dark .dark-only {
    visibility: visible;
    position: static;
}
</style>

## Main Features

### 💻 UI5 CLI

*Also see the [UI5 CLI Documentation](./CLI)*

```sh
# Global
npm install --global @ui5/cli

# In your project
npm install --save-dev @ui5/cli
```

#### ⚙️ Project Setup

Configure your project for use with UI5 CLI.  
*Also see the [Configuration Documentation](./Configuration)*

```
❯ ui5 init
Wrote ui5.yaml:

specVersion: "4.0
metadata:
  name: my-app
type: application
```

#### 🚚 Dependency Management

UI5 framework dependencies are managed by UI5 CLI. All other dependencies are managed by your favorite node package manager.

```
❯ ui5 use SAPUI5@1.117.0
Updated configuration written to ui5.yaml
This project is now using SAPUI5 version 1.117.0

❯ ui5 add sap.ui.core sap.m themelib_sap_fiori_3
Updated configuration written to ui5.yaml
Added framework libraries sap.ui.core sap.m themelib_sap_fiori_3 as dependencies
```

#### 🏄 Development Server

Start a local development server to work on your project.  
*Also see the [Server Documentation](./Server)*

```
❯ ui5 serve
Server started
URL: http://localhost:8080
```

#### 🛠 Build for Production

Build an optimized version of your project.  
*Also see the [Builder Documentation](./Builder)*

``` bash
❯ ui5 build
info graph:helpers:ui5Framework Using OpenUI5 version: 1.117.0
info ProjectBuilder Preparing build for project my-app
info ProjectBuilder   Target directory: ./dist
info ProjectBuilder Cleaning target directory...
info Project 1 of 1: ❯ Building application project my-app...
info my-app › Running task escapeNonAsciiCharacters...
info my-app › Running task replaceCopyright...
info my-app › Running task replaceVersion...
info my-app › Running task minify...
info my-app › Running task generateFlexChangesBundle...
info my-app › Running task generateComponentPreload...
info ProjectBuilder Build succeeded in 296 ms
info ProjectBuilder Executing cleanup tasks...
```

### 🧪 Node.js API

Most UI5 CLI modules provide JavaScript APIs for direct consumption in other Node.js projects.
This allows you to rely on UI5 CLI for UI5-specific build functionality and project handling, while creating your own tools to perfectly match the needs of your project.

All available APIs are documented in the [UI5 CLI API Reference](https://ui5.github.io/cli/v4/api/index.html).

#### ESM

```js linenums="1
import {graphFromPackageDependencies} from "@ui5/project/graph";

async function buildApp(projectPath, destinationPath) {
    const graph = await graphFromPackageDependencies({
        cwd: projectPath
    });
    await graph.build({
        destPath: destinationPath,
        selfContained: true,
        excludedTasks: ["transformBootstrapHtml"],
        includedDependencies: ["*"]
    });
}
```

#### CommonJS

```js linenums="1
async function buildApp(projectPath, destinationPath) {
    const {graphFromPackageDependencies} = 
        await import("@ui5/project/graph");
    const graph = await graphFromPackageDependencies({
        cwd: projectPath
    });
    await graph.build({
        destPath: destinationPath,
        selfContained: true,
        excludedTasks: ["transformBootstrapHtml"],
        includedDependencies: ["*"]
    });
}
```
