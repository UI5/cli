![UI5 icon](https://raw.githubusercontent.com/SAP/ui5-tooling/master/docs/images/UI5_logo_wide.png)

# ui5-server
> Modules for running a UI5 development server  
> Part of the [UI5 Tooling](https://github.com/SAP/ui5-tooling)

[![Build Status](https://dev.azure.com/sap/opensource/_apis/build/status/SAP.ui5-server?branchName=master)](https://dev.azure.com/sap/opensource/_build/latest?definitionId=34&branchName=master)
[![npm Package Version](https://badge.fury.io/js/%40ui5%2Fserver.svg)](https://www.npmjs.com/package/@ui5/server)
[![Coverage Status](https://coveralls.io/repos/github/SAP/ui5-server/badge.svg)](https://coveralls.io/github/SAP/ui5-server)
[![Dependency Status](https://david-dm.org/SAP/ui5-server/master.svg)](https://david-dm.org/SAP/ui5-server/master)
[![devDependency Status](https://david-dm.org/SAP/ui5-server/master/dev-status.svg)](https://david-dm.org/SAP/ui5-server/master#info=devDependencies)

**⌨️ CLI reference can be found [here!](https://github.com/SAP/ui5-cli#cli-usage)**

## Server
Provides server capabilities for the [UI5 Tooling](https://github.com/SAP/ui5-tooling).

### Middleware
The development server has already a set of middleware which supports the developer with the following features:

* Translation files with `.properties` extension are properly encoded with **ISO-8859-1**.
* Changes on files with `.less` extension triggers a theme build and delivers the compiled CSS files.
* Version info is created automatically (`/resources/sap-ui-version.json`).
* List project files with URL (needed exclusively by the OpenUI5 testsuite): `/discovery/app_pages`, `/discovery/all_libs`, `/discovery/all_tests`

## Certificates for HTTPS or HTTP/2
The UI5 Server can automatically generate an SSL certificate for HTTPS and HTTP/2 configurations.

Upon startup, it checks if a certificate exists within the path provided.
If there is none, a new certificate is created and used.

**Hint:** If Chrome unintentionally redirects a HTTP-URL to HTTPS, you need to delete the HSTS mapping in [chrome://net-internals/#hsts](chrome://net-internals/#hsts) by entering the domain name (e.g. localhost) and pressing "delete".

## Contributing
Please check our [Contribution Guidelines](https://github.com/SAP/ui5-tooling/blob/master/CONTRIBUTING.md).

## Support
Please follow our [Contribution Guidelines](https://github.com/SAP/ui5-tooling/blob/master/CONTRIBUTING.md#report-an-issue) on how to report an issue.

## Release History
See [CHANGELOG.md](CHANGELOG.md).

## License
This project is licensed under the Apache Software License, Version 2.0 except as noted otherwise in the [LICENSE](/LICENSE.txt) file.
