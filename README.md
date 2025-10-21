![UI5 logo](./docs/images/UI5_logo_wide.png)

# UI5 CLI

> An open and modular toolchain to develop state-of-the-art applications based on the [UI5](https://ui5.sap.com) framework.

[![REUSE status](https://api.reuse.software/badge/github.com/UI5/cli)](https://api.reuse.software/info/github.com/UI5/cli)
[![OpenUI5 Community Slack (#tooling channel)](https://img.shields.io/badge/slack-join-44cc11.svg)](https://ui5-slack-invite.cfapps.eu10.hana.ondemand.com)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-v2.0%20adopted-ff69b4.svg)](CODE_OF_CONDUCT.md)

> [UI5 CLI v4](https://ui5.github.io/cli/v4) is the latest and stable version 🎉
>
> [UI5 CLI v3](https://ui5.github.io/cli/v3) is a stable version and in maintenance mode 🚢
>
> [UI5 CLI v2](https://ui5.github.io/cli/v2) has been deprecated 🚫  
>
> Please migrate your projects to [UI5 CLI v4](https://ui5.github.io/cli/v4/updates/migrate-v4/)!

## Resources

- [Documentation](https://ui5.github.io/cli/stable/)
- [API Reference](https://ui5.github.io/cli/stable/api/)
- [CLI Documentation](https://ui5.github.io/cli/stable/pages/CLI/)
- [Project Configuration](https://ui5.github.io/cli/stable/pages/Configuration/)
- 🎬 [UI5con@SAP 2020 Talk](https://www.youtube.com/watch?v=8IHoVJLKN34)
- 🎬 [UI5con@SAP 2018 Talk](https://www.youtube.com/watch?v=iQ07oe26y_k)
- [Contribution Guidelines](https://github.com/UI5/cli/blob/main/CONTRIBUTING.md)
- [Roadmap](https://github.com/UI5/cli/issues/701)

## Packages

UI5 CLI consists of multiple packages managed within this monorepo:

- **packages/cli**: UI5 Command Line Interface, utilizing all of the following packages
- **packages/project**: Modules for building a UI5 project's dependency tree, including configuration
- **packages/server**: Modules for running a UI5 development server
- **packages/builder**: Modules for building UI5 projects
- **packages/fs**: UI5 specific file system abstraction
- **packages/logger**: Internal logging module

**Usage Overview** *(arrows indicate dependencies)*
![Module Overview](./packages/documentation/docs/images/Module_overview.png)

## Contributing

Please check our [Contribution Guidelines](https://github.com/UI5/cli/blob/main/CONTRIBUTING.md).

## Support

Please follow our [Contribution Guidelines](https://github.com/UI5/cli/blob/main/CONTRIBUTING.md#report-an-issue) on how to report an issue. Or chat with us in the [`#tooling`](https://openui5.slack.com/archives/C0A7QFN6B) channel of the [OpenUI5 Community Slack](https://ui5-slack-invite.cfapps.eu10.hana.ondemand.com). For public Q&A, use the [`ui5-tooling` tag on Stack Overflow](https://stackoverflow.com/questions/tagged/ui5-tooling).
