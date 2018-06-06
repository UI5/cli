![UI5 icon](https://raw.githubusercontent.com/SAP/ui5-tooling/master/docs/images/UI5_logo_wide.png)

# ui5-server
> Modules for running a UI5 development server  
> Part of the [UI5 Build and Development Tooling](https://github.com/SAP/ui5-tooling)

[![Travis CI Build Status](https://travis-ci.org/SAP/ui5-server.svg?branch=master)](https://travis-ci.org/SAP/ui5-server)
[![npm Package Version](https://img.shields.io/npm/v/@ui5/server.svg)](https://www.npmjs.com/package/@ui5/server)

**This is a Pre-Alpha release!**  
**The UI5 Build and Development Tooling described here is not intended for productive use yet. Breaking changes are to be expected.**

## Server
The UI5 Build and Development Tooling comes along with a web server component to serve a project.

### Middlewares

The development server has already a set of middlewares which supports the developer with the following features:

* Translation files with `.properties` extension are properly encoded with **ISO-8859-1**
* Changes on files with `.less` extension triggers a theme build and delivers the compiled CSS files
* Version Info is created automatically (`/resources/sap-ui-version.json`)
* List project files with URL (needed exclusively by the OpenUI5 testsuite): `/discovery/app_pages`, `/discovery/all_libs`, `/discovery/all_tests`

## Certificates for HTTPS or HTTP/2

`ui5 serve` will automatically use an SSL certificate for HTTPS and HTTP/2 servers.

Upon startup it checks if a certificate exists within the path provided.
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
