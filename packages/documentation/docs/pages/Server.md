# UI5 Server

The [UI5 Server](https://github.com/SAP/ui5-server) module provides server capabilities for local development of UI5 projects.

[**API Reference**](https://ui5.github.io/cli/v4/api/module-@ui5_server.html){: .md-button .sap-icon-initiative }

## Standard Middleware

All available standard middleware are listed below in the order of their execution.

A project can also add custom middleware to the server by using the [Custom Server Middleware Extensibility](./extensibility/CustomServerMiddleware.md).

| Middleware | Description |
| ---- | ---- |
| `csp` | See chapter [csp](#csp) |
| `compression` | Standard [Express compression middleware](http://expressjs.com/en/resources/middleware/compression.html) |
| `cors` | Standard [Express cors middleware](http://expressjs.com/en/resources/middleware/cors.html) |
| `discovery` |  See chapter [discovery](#discovery) |
| `serveResources` | See chapter [serveResources](#serveresources) |
| `testRunner` | See chapter [testRunner](#testrunner) |
| `serveThemes` | See chapter [serveThemes](#servethemes)  |
| `versionInfo` | See chapter [versionInfo](#versioninfo)  |
| `nonReadRequests` | See chapter [nonReadRequests](#nonreadrequests)  |
| `serveIndex` | See chapter [serveIndex](#serveindex)  |

### csp
The Content Security Policy ([CSP](https://www.w3.org/TR/CSP/)) middleware is active by default.

The header `content-security-policy` can be set by adding URL parameter `sap-ui-xx-csp-policy` to the request with the policy name as value.

To set the policy to report-only, append `:report-only` or `:ro` to the policy name.
E.g. `/index.html?sap-ui-xx-csp-policy=sap-target-level-1:report-only`

#### sendSAPTargetCSP parameter
The default CSP policies can be modified using parameter `sendSAPTargetCSP` (`--sap-csp-policies` when using the CLI).
With `sendSAPTargetCSP` set to `true` the policies `sap-target-level-1` and `sap-target-level-3` policies are activated and send as report-only.

#### Serve CSP Reports
Serving of CSP reports can be activated with parameter `serveCSPReports` (`--serve-csp-reports` when using the CLI).
With `serveCSPReports` set to `true`, the CSP reports are collected and can be downloaded from the server path `/.ui5/csp/csp-reports.json`.

### discovery

This middleware lists project files with URLs under several `/discovery` endpoints. This is exclusively used by the OpenUI5 test suite application.

### serveResources
This middleware resolves requests using the [ui5-fs](https://github.com/SAP/ui5-fs)-file system abstraction.

The following file content transformations are executed:

- Escaping non-ASCII characters in `.properties` translation files based on a project's [configuration](./Configuration.md#encoding-of-properties-files)
- Enhancing the `manifest.json` with supported locales determined by available `.properties` [translation files](./Builder.md#generation-of-supported-locales)

### testRunner
Serves a static version of the UI5 QUnit TestRunner at `/test-resources/sap/ui/qunit/testrunner.html`.

### serveThemes
Compiles CSS files for themes on-the-fly from the source `*.less` files.

Changes made to these `*.less` files while the server is running will automatically lead to the re-compilation of the relevant CSS files when requested again.

### versionInfo
Generates and serves the version info file `/resources/sap-ui-version.json`, which is required for several framework functionalities.

### nonReadRequests
Answers all non-read requests (POST, PUT, DELETE, etc.) that have not been answered by any other middleware with the 404 "Not Found" status code . This signals the client that these operations are not supported by the server.

### serveIndex
In case a directory has been requested, this middleware renders an HTML with a list of the directory's content.

## SSL Certificates
When starting the UI5 Server in HTTPS- or HTTP/2 mode, for example by using UI5 CLI parameter `--h2`, you will be prompted for the automatic generation of a local SSL certificate if necessary.

Follow the given instructions and enter your password to install the generated certificate as trusted. You can find the generated certificate and corresponding private key under `.ui5/server` in your user's home directory.

!!! tip
    If Chrome unintentionally redirects an HTTP-URL to HTTPS, you need to delete the HSTS mapping in [chrome://net-internals/#hsts](chrome://net-internals/#hsts) by entering the domain name (e.g. localhost) and pressing "delete".
