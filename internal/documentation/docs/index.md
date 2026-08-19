---
next:
  text: 'Getting Started'
  link: '/pages/GettingStarted'
---

<script setup>
import { useData } from 'vitepress'
import VPButton from "vitepress/dist/client/theme-default/components/VPButton.vue"
const { isDark } = useData()
</script>

<img :src="isDark ? './images/O_UI5_H_noBG.png' : './images/UI5_logo_wide.png'" alt="UI5 logo" style="max-width: 100%; height: auto;">

# UI5 CLI

An open and modular toolchain to develop state-of-the-art applications based on the [UI5](https://ui5.sap.com) framework.

::: warning Project Rename
**UI5 Tooling has been renamed to UI5 CLI 🚨**

Read the announcement blog post: **[SAP Community: Goodbye UI5 Tooling - Hello UI5 CLI!](https://community.sap.com/t5/technology-blog-posts-by-sap/goodbye-ui5-tooling-hello-ui5-cli/ba-p/14211769)**
:::

<div style="margin: 2rem 0;">
  <VPButton class="no-decoration" text="🚀 Get Started" href="./pages/GettingStarted.md"/>
</div>

## Main Features

### 💻 UI5 CLI

*Also see the [UI5 CLI Documentation](./pages/CLI.md)*

```sh
# Global
npm install --global @ui5/cli

# In your project
npm install --save-dev @ui5/cli
```

#### ⚙️ Project Setup

Configure your project for use with UI5 CLI.  
*Also see the [Configuration Documentation](./pages/Configuration.md)*

```
❯ ui5 init
Wrote ui5.yaml:

specVersion: "5.0"
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
*Also see the [Server Documentation](./pages/Server.md)*

```
❯ ui5 serve
Server started
URL: http://localhost:8080
```

#### 🛠 Build for Production

Build an optimized version of your project.  
*Also see the [Builder Documentation](./pages/Builder.md)*

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

All available APIs are documented directly within this documentation. Use the sidebar menu and navigate to **API** to browse the API reference for each package.

::: code-group
```js [ESM]
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

```js [CommonJS]
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
:::

#### Starting a Server

`@ui5/server` starts a development server for a project graph. It binds a port, serves the built resources, watches the sources, and rebuilds on demand.

::: code-group
```js [ESM]
import {graphFromPackageDependencies} from "@ui5/project/graph";
import {serve} from "@ui5/server";

async function startServer(projectPath) {
    const graph = await graphFromPackageDependencies({
        cwd: projectPath
    });
    const {port, close} = await serve(graph, {
        port: 8080,
        changePortIfInUse: true
    });
    console.log(`Server started on port ${port}`);

    // Later, to stop the server:
    // await new Promise((resolve) => close(resolve));
}
```

```js [CommonJS]
async function startServer(projectPath) {
    const {graphFromPackageDependencies} =
        await import("@ui5/project/graph");
    const {serve} = await import("@ui5/server");
    const graph = await graphFromPackageDependencies({
        cwd: projectPath
    });
    const {port, close} = await serve(graph, {
        port: 8080,
        changePortIfInUse: true
    });
    console.log(`Server started on port ${port}`);

    // Later, to stop the server:
    // await new Promise((resolve) => close(resolve));
}
```
:::

#### Embedding the Middleware

`serveMiddleware` assembles the UI5 middleware as a single connect/Express handler, for mounting into an HTTP server you own instead of starting one. It does not bind a port or attach the Live Reload WebSocket server.

Call `close` on teardown to release the server's source watcher and build-cache handle. A project graph can be served only once, so do not call both `serveMiddleware` and `serve` for the same graph.

::: code-group
```js [ESM]
import express from "express";
import {graphFromPackageDependencies} from "@ui5/project/graph";
import {serveMiddleware} from "@ui5/server";

async function mountUI5(projectPath) {
    const graph = await graphFromPackageDependencies({
        cwd: projectPath
    });
    const {middleware, close} = await serveMiddleware(graph);

    const app = express();
    app.use(middleware);
    const listener = app.listen(8080);

    // On teardown:
    // listener.close();
    // await close();
}
```

```js [CommonJS]
async function mountUI5(projectPath) {
    const {default: express} = await import("express");
    const {graphFromPackageDependencies} =
        await import("@ui5/project/graph");
    const {serveMiddleware} = await import("@ui5/server");
    const graph = await graphFromPackageDependencies({
        cwd: projectPath
    });
    const {middleware, close} = await serveMiddleware(graph);

    const app = express();
    app.use(middleware);
    const listener = app.listen(8080);

    // On teardown:
    // listener.close();
    // await close();
}
```
:::