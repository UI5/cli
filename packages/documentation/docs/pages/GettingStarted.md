# Getting Started
## Installing the UI5 CLI
### Requirements
- [Node.js](https://nodejs.org/) version v20.11.0 and higher or v22.0.0 and higher (v21 is not supported)
- [npm](https://www.npmjs.com/) version v8.0.0 or higher

### Installation
```sh
# Global installation to have the command available
npm install --global @ui5/cli

# Additional local install in your project
npm install --save-dev @ui5/cli

# Verify installation
ui5 --help
```

The globally installed UI5 CLI will always try to invoke a locally installed version of the UI5 CLI (if present). This way you can use different versions of the UI5 CLI across your projects. Please see the [UI5 CLI documentation](./CLI.md#local-vs-global-installation) for details.

## ⚡️ Quick Start: OpenUI5 Sample App
Check out the [OpenUI5 Sample App](https://github.com/SAP/openui5-sample-app) featuring a full blown [How-to](https://github.com/SAP/openui5-sample-app/#openui5-sample-app) to play around with UI5 CLI!

## Starting a New Project
The easiest way to start a new UI5 project is to use a template generator like [**generator-easy-ui5**](https://github.com/SAP/generator-easy-ui5).

Choose a template that is designed for the type of project you want to create and the target environment where you want to deploy it to.
Make sure that the template already uses UI5 CLI. A good indicator for that is the presence of a `ui5.yaml` file in the generated project.

When working with SAP Business Application Studio, there are several templates available to you. Check out the tutorial on creating a basic SAPUI5 application and deploying it to Cloud Foundry from within SAP Business Application Studio: [Create an SAP Fiori App Using SAP Business Application Studio](https://developers.sap.com/tutorials/appstudio-fioriapps-create.html)

You can find many guides on UI5 development with SAP Business Application Studio in the [Tutorial Navigator](https://developers.sap.com/tutorial-navigator.html?tag=topic:sapui5&tag=products:technology-platform/sap-business-application-studio).

## Enabling an Existing Project
You can easily check whether or not a project (application or library) can already be used with the UI5 CLI by looking for a `ui5.yaml` file in the project's root directory.  
This file (with some exceptions) is required for all projects and their dependencies (e.g. reuse libraries) to use them in the UI5 CLI.

### Setup
If your project is not set up for use with the UI5 CLI yet, follow these steps:

1. If your project does not have a `package.json` file, let npm generate it:
    ```sh
    npm init --yes
    ```

1. Generate the `ui5.yaml` file:
    ```sh
    ui5 init
    ```

1. Define the framework you want to use

    === "OpenUI5"

        ```sh
        ui5 use openui5@latest
        ```

    === "SAPUI5"

        ```sh
        ui5 use sapui5@latest
        ```

    You can choose between the OpenUI5 and the SAPUI5 framework.

    Don't know which one to choose? Check out our [documentation on the differences between OpenUI5 and SAPUI5](./FAQ.md##whats-the-difference-between-openui5-and-sapui5).

1. Add required libraries
    ```sh
    ui5 add sap.ui.core sap.m sap.ui.table themelib_sap_fiori_3 # [...]
    ```

    You can find a documentation of all libraries, including samples and more, in the Demo Kit:
   
    - [**OpenUI5** Demo Kit](https://openui5.hana.ondemand.com/api)
    - [**SAPUI5** Demo Kit](https://ui5.sap.com/#/api)
    
1. Start the server and work on your project! 🎉
    ```sh
    ui5 serve
    ```

    !!! tip
        Use `ui5 serve` to start a local development server and `ui5 build --all` to produce an optimized, static version of your project, which you can then deploy to your production environment.

        Find more information here:

        - [Server](./Server.md)
        - [Builder](./Builder.md)
        - [CLI](./CLI.md)

1. If you are using Git or similar version control, commit `package.json` and `ui5.yaml` to your repository.
    ```sh
    git add package.json ui5.yaml
    git commit -m "Enable use with UI5 CLI"
    ```

**Hooray! You can now use UI5 CLI in your project!**
{: .sap-icon-ui5-after }
