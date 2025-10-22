# Getting Started
## Installing the UI5 CLI
1. If your project does not have a `package.json` file, let npm generate it:
	```sh
	npm init --yes
	```

1. Generate the `ui5.yaml` file:
	```sh
	ui5 init
	```

1. Define the framework you want to use
	::: info
	**"OpenUI5"**

	```sh
	ui5 use openui5@latest
	```

	**"SAPUI5"**

	```sh
	ui5 use sapui5@latest
	```
	:::
	You can choose between the OpenUI5 and the SAPUI5 framework.

	Don't know which one to choose? Check out our [documentation on the differences between OpenUI5 and SAPUI5](./FAQ##whats-the-difference-between-openui5-and-sapui5).

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

	::: info
	Use `ui5 serve` to start a local development server and `ui5 build --all` to produce an optimized, static version of your project, which you can then deploy to your production environment.
	:::

	Find more information here:

	- [Server](./Server.md)
	- [Builder](./Builder.md)
	- [CLI](./CLI.md)

1. If you are using Git or similar version control, commit `package.json` and `ui5.yaml` to your repository.
	```sh
	git add package.json ui5.yaml
	git commit -m "Enable use with UI5 CLI"
	```

**🎉 Hooray! You can now use UI5 CLI in your project! 🎉**
